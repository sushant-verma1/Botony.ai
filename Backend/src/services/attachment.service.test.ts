import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockAttachment, mockCloudinary } = vi.hoisted(() => ({
  mockAttachment: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  mockCloudinary: {
    config: vi.fn(() => ({
      cloud_name: "test-cloud",
      api_key: "test-cloudinary-key",
    })),
    utils: {
      api_sign_request: vi.fn(() => "signed"),
      private_download_url: vi.fn(() => "https://res.cloudinary.com/download-url"),
    },
    api: {
      resource: vi.fn(),
    },
    uploader: {
      destroy: vi.fn().mockResolvedValue({ result: "ok" }),
      upload: vi.fn(),
      explicit: vi.fn(),
    },
    url: vi.fn(() => "https://res.cloudinary.com/signed-image-url"),
  },
}));

vi.mock("../config/db.js", () => ({
  prisma: { attachment: mockAttachment },
}));

vi.mock("../config/cloudinary.js", () => ({
  cloudinary: mockCloudinary,
}));

const { mockScanAttachment } = vi.hoisted(() => ({
  mockScanAttachment: vi.fn(),
}));

vi.mock("./malware.service.js", () => ({
  scanAttachment: mockScanAttachment,
}));

import {
  requestUploadSignature,
  confirmAttachment,
  getAttachmentDeliveryUrl,
  deleteAttachment,
  validateAttachmentsForMessage,
  bindAttachmentsToMessage,
  sweepAbandonedAttachments,
  getAiImageUrl,
  extractPdfText,
  findImageMetadataMarker,
  AttachmentError,
} from "./attachment.service.js";

// Minimal but structurally valid samples: real signature bytes, not
// full-fidelity files. file-type sniffs by magic bytes / header structure.
const JPEG_BYTES = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64",
);
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
// Same 1x1 JPEG carrying an APP1 EXIF segment with a GPS-looking
// ImageDescription — the metadata sanitization exists to remove.
const EXIF_JPEG_BYTES = Buffer.from(
  "/9j/4QBLRXhpZgAASUkqAAgAAAACABIBAwABAAAAAQAAAA4BAgAdAAAAJgAAAAAAAABQQVRJRU5ULUdQUy01MS41MDc0Ti0wLjEyNzhXAP/gABBKRklGAAEBAQBgAGAAAP/bAEMAAwICAgICAwICAgMDAwMEBgQEBAQECAYGBQYJCAoKCQgJCQoMDwwKCw4LCQkNEQ0ODxAQERAKDBITEhATDxAQEP/bAEMBAwMDBAMECAQECBALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/AABEIAAEAAQMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ0AGZf/2Q==",
  "base64",
);
const WEBP_BYTES = Buffer.from(
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
  "base64",
);
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
const NOT_AN_IMAGE_BYTES = Buffer.from("MZ\x90\x00\x03\x00\x00\x00executable-not-an-image");
const NOT_A_PDF_BYTES = Buffer.from("PK\x03\x04this-is-actually-a-zip-file");

function mockFetchOnce(buffer: Buffer, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      arrayBuffer: async () =>
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    }),
  );
}

// Default happy path for the layers each test isn't specifically about.
const SANITIZED_IMAGE = { bytes: 4096, width: 800, height: 600 };

beforeEach(() => {
  Object.values(mockAttachment).forEach((fn) => fn.mockReset());
  mockCloudinary.api.resource.mockReset();
  mockCloudinary.uploader.destroy.mockReset().mockResolvedValue({ result: "ok" });
  // Cloudinary echoes back the format it was asked to write.
  mockCloudinary.uploader.upload
    .mockReset()
    .mockImplementation(async (_source: string, options: { format: string }) => ({
      ...SANITIZED_IMAGE,
      format: options.format,
    }));
  // Cloudinary materializes the eager derivative server-side and hands back
  // its URL — no delivery-URL self-fetch involved.
  mockCloudinary.uploader.explicit
    .mockReset()
    .mockImplementation(
      async (_publicId: string, options: { eager: { format: string }[] }) => ({
        eager: [
          {
            ...SANITIZED_IMAGE,
            format: options.eager[0].format,
            secure_url: "https://res.cloudinary.com/eager-derivative-url",
          },
        ],
      }),
    );
  mockCloudinary.url.mockClear();
  mockScanAttachment.mockReset().mockResolvedValue({ clean: true, scanner: "clamav" });
  vi.unstubAllGlobals();
});

describe("requestUploadSignature", () => {
  it("rejects a disallowed MIME type before creating anything", async () => {
    mockAttachment.findMany.mockResolvedValue([]);
    await expect(
      requestUploadSignature("user-1", {
        kind: "IMAGE",
        mimeType: "image/svg+xml",
        sizeBytes: 1000,
      }),
    ).rejects.toThrow(AttachmentError);
    expect(mockAttachment.create).not.toHaveBeenCalled();
  });

  it("rejects a mismatched kind/mimeType pair", async () => {
    mockAttachment.findMany.mockResolvedValue([]);
    await expect(
      requestUploadSignature("user-1", {
        kind: "DOCUMENT",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
      }),
    ).rejects.toThrow(AttachmentError);
  });

  it("rejects an oversized file before any upload happens", async () => {
    mockAttachment.findMany.mockResolvedValue([]);
    await expect(
      requestUploadSignature("user-1", {
        kind: "IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: 100 * 1024 * 1024,
      }),
    ).rejects.toThrow(AttachmentError);
    expect(mockAttachment.create).not.toHaveBeenCalled();
  });

  it("creates a PENDING row and returns a signature for a valid request", async () => {
    mockAttachment.findMany.mockResolvedValue([]);
    mockAttachment.create.mockResolvedValue({
      id: "att-1",
      publicId: "medical/images/user-1/uuid",
    });

    const result = await requestUploadSignature("user-1", {
      kind: "IMAGE",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });

    expect(mockAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", status: "PENDING" }),
      }),
    );
    expect(result.attachmentId).toBe("att-1");
    expect(result.signature).toBe("signed");
  });
});

describe("confirmAttachment", () => {
  const baseAttachment = {
    id: "att-1",
    userId: "user-1",
    status: "PENDING",
    kind: "IMAGE" as const,
    mimeType: "image/jpeg",
    publicId: "medical/images/user-1/uuid",
  };

  it("confirms a valid JPEG", async () => {
    mockAttachment.findUnique.mockResolvedValue(baseAttachment);
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: JPEG_BYTES.length,
      format: "jpg",
      width: 1,
      height: 1,
    });
    mockFetchOnce(JPEG_BYTES);
    mockAttachment.update.mockResolvedValue({ ...baseAttachment, status: "READY" });

    const result = await confirmAttachment("user-1", "att-1");

    expect(result.status).toBe("READY");
    expect(mockCloudinary.uploader.destroy).not.toHaveBeenCalled();
  });

  it("confirms a valid PNG", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      ...baseAttachment,
      mimeType: "image/png",
    });
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: PNG_BYTES.length,
      format: "png",
      width: 1,
      height: 1,
    });
    mockFetchOnce(PNG_BYTES);
    mockAttachment.update.mockResolvedValue({ ...baseAttachment, status: "READY" });

    const result = await confirmAttachment("user-1", "att-1");
    expect(result.status).toBe("READY");
  });

  it("confirms a valid WEBP", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      ...baseAttachment,
      mimeType: "image/webp",
    });
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: WEBP_BYTES.length,
      format: "webp",
      width: 1,
      height: 1,
    });
    mockFetchOnce(WEBP_BYTES);
    mockAttachment.update.mockResolvedValue({ ...baseAttachment, status: "READY" });

    const result = await confirmAttachment("user-1", "att-1");
    expect(result.status).toBe("READY");
  });

  it("confirms a valid PDF", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      ...baseAttachment,
      kind: "DOCUMENT",
      mimeType: "application/pdf",
    });
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: PDF_BYTES.length,
    });
    mockFetchOnce(PDF_BYTES);
    mockAttachment.update.mockResolvedValue({ ...baseAttachment, status: "READY" });

    const result = await confirmAttachment("user-1", "att-1");
    expect(result.status).toBe("READY");
  });

  it("rejects a .jpg upload whose bytes are not actually an image", async () => {
    mockAttachment.findUnique.mockResolvedValue(baseAttachment);
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: NOT_AN_IMAGE_BYTES.length,
      format: "jpg",
      width: 1,
      height: 1,
    });
    mockFetchOnce(NOT_AN_IMAGE_BYTES);
    mockAttachment.update.mockResolvedValue({ ...baseAttachment, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );
    expect(mockCloudinary.uploader.destroy).toHaveBeenCalled();
    expect(mockAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } }),
    );
  });

  it("rejects a .pdf upload whose bytes are not actually a PDF", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      ...baseAttachment,
      kind: "DOCUMENT",
      mimeType: "application/pdf",
    });
    mockCloudinary.api.resource.mockResolvedValue({ bytes: NOT_A_PDF_BYTES.length });
    mockFetchOnce(NOT_A_PDF_BYTES);
    mockAttachment.update.mockResolvedValue({ ...baseAttachment, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );
    expect(mockCloudinary.uploader.destroy).toHaveBeenCalled();
  });

  it("rejects when Cloudinary reports a format Cloudinary itself detected as mismatched", async () => {
    mockAttachment.findUnique.mockResolvedValue(baseAttachment);
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: PNG_BYTES.length,
      format: "png", // declared jpeg, Cloudinary decoded a png
      width: 1,
      height: 1,
    });
    mockAttachment.update.mockResolvedValue({ ...baseAttachment, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );
  });

  it("rejects an oversized file", async () => {
    mockAttachment.findUnique.mockResolvedValue(baseAttachment);
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: 100 * 1024 * 1024,
      format: "jpg",
      width: 1,
      height: 1,
    });
    mockAttachment.update.mockResolvedValue({ ...baseAttachment, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );
  });

  it("rejects a malformed image Cloudinary could not decode", async () => {
    mockAttachment.findUnique.mockResolvedValue(baseAttachment);
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: 1000,
      format: undefined,
      width: undefined,
      height: undefined,
    });
    mockAttachment.update.mockResolvedValue({ ...baseAttachment, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );
  });

  it("rejects a pixel-count decompression bomb", async () => {
    mockAttachment.findUnique.mockResolvedValue(baseAttachment);
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: 1000,
      format: "jpg",
      width: 9000,
      height: 9000, // 81M pixels, over the 40M cap
    });
    mockAttachment.update.mockResolvedValue({ ...baseAttachment, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );
  });

  it("404s for a different user's attachment", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      ...baseAttachment,
      userId: "someone-else",
    });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("refuses to re-confirm an already-processed attachment", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      ...baseAttachment,
      status: "READY",
    });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("getAttachmentDeliveryUrl", () => {
  it("returns a signed URL for the owner of a READY attachment", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      id: "att-1",
      userId: "user-1",
      status: "READY",
      kind: "IMAGE",
      mimeType: "image/jpeg",
      publicId: "medical/images/user-1/uuid",
    });

    const result = await getAttachmentDeliveryUrl("user-1", "att-1");
    expect(result.url).toContain("cloudinary.com");
  });

  it("404s rather than leaking existence when another user requests it", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      id: "att-1",
      userId: "someone-else",
      status: "READY",
      kind: "IMAGE",
      mimeType: "image/jpeg",
      publicId: "medical/images/someone-else/uuid",
    });

    await expect(
      getAttachmentDeliveryUrl("user-1", "att-1"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("404s for an attachment that never passed validation", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      id: "att-1",
      userId: "user-1",
      status: "PENDING",
      kind: "IMAGE",
      mimeType: "image/jpeg",
      publicId: "medical/images/user-1/uuid",
    });

    await expect(
      getAttachmentDeliveryUrl("user-1", "att-1"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteAttachment", () => {
  it("destroys the Cloudinary asset and deletes the row for the owner", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      id: "att-1",
      userId: "user-1",
      kind: "IMAGE",
      publicId: "medical/images/user-1/uuid",
    });
    mockAttachment.delete.mockResolvedValue({});

    await deleteAttachment("user-1", "att-1");

    expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith(
      "medical/images/user-1/uuid",
      expect.objectContaining({ resource_type: "image", type: "authenticated" }),
    );
    expect(mockAttachment.delete).toHaveBeenCalledWith({ where: { id: "att-1" } });
  });

  it("refuses to delete another user's attachment", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      id: "att-1",
      userId: "someone-else",
      kind: "IMAGE",
      publicId: "medical/images/someone-else/uuid",
    });

    await expect(deleteAttachment("user-1", "att-1")).rejects.toMatchObject({
      status: 404,
    });
    expect(mockCloudinary.uploader.destroy).not.toHaveBeenCalled();
    expect(mockAttachment.delete).not.toHaveBeenCalled();
  });
});

describe("malware scanning", () => {
  const pendingImage = {
    id: "att-1",
    userId: "user-1",
    status: "PENDING",
    kind: "IMAGE" as const,
    mimeType: "image/jpeg",
    publicId: "medical/images/user-1/uuid",
  };

  function stageValidJpeg() {
    mockAttachment.findUnique.mockResolvedValue(pendingImage);
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: JPEG_BYTES.length,
      format: "jpg",
      width: 1,
      height: 1,
    });
    mockFetchOnce(JPEG_BYTES);
    mockAttachment.update.mockResolvedValue({ ...pendingImage, status: "READY" });
  }

  it("scans the uploaded asset before it is ever marked READY", async () => {
    stageValidJpeg();

    await confirmAttachment("user-1", "att-1");

    expect(mockScanAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ publicId: "medical/images/user-1/uuid" }),
    );
    // The scanner ran before the READY write, not after.
    expect(mockScanAttachment.mock.invocationCallOrder[0]).toBeLessThan(
      mockAttachment.update.mock.invocationCallOrder[0],
    );
  });

  it("destroys the asset and rejects the row when the scanner finds malware", async () => {
    stageValidJpeg();
    mockScanAttachment.mockResolvedValue({
      clean: false,
      scanner: "clamav",
      reason: "malware detected",
    });
    mockAttachment.update.mockResolvedValue({ ...pendingImage, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );

    expect(mockCloudinary.uploader.destroy).toHaveBeenCalled();
    expect(mockAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } }),
    );
    // The image is never sanitized-and-kept after a failed scan.
    expect(mockCloudinary.uploader.upload).not.toHaveBeenCalled();
  });

  it("rejects the upload when the scanner could not run (fail closed)", async () => {
    stageValidJpeg();
    mockScanAttachment.mockResolvedValue({
      clean: false,
      scanner: "clamav",
      reason: "scanner unavailable",
    });
    mockAttachment.update.mockResolvedValue({ ...pendingImage, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );
    expect(mockCloudinary.uploader.destroy).toHaveBeenCalled();
  });

  it("records which scanner cleared the file", async () => {
    stageValidJpeg();

    await confirmAttachment("user-1", "att-1");

    expect(mockAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "READY", scanner: "clamav" }),
      }),
    );
  });
});

describe("image sanitization", () => {
  const pendingImage = {
    id: "att-1",
    userId: "user-1",
    status: "PENDING",
    kind: "IMAGE" as const,
    mimeType: "image/jpeg",
    publicId: "medical/images/user-1/uuid",
  };

  function stageValidJpeg() {
    mockAttachment.findUnique.mockResolvedValue(pendingImage);
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: JPEG_BYTES.length,
      format: "jpg",
      width: 4000,
      height: 3000,
    });
    mockFetchOnce(JPEG_BYTES);
    mockAttachment.update.mockResolvedValue({ ...pendingImage, status: "READY" });
  }

  it("sanitizes via a server-generated eager derivative, never a self-fetch", async () => {
    stageValidJpeg();

    await confirmAttachment("user-1", "att-1");

    // Cloudinary generates the metadata-stripped derivative server-side...
    expect(mockCloudinary.uploader.explicit).toHaveBeenCalledWith(
      "medical/images/user-1/uuid",
      expect.objectContaining({
        type: "authenticated",
        resource_type: "image",
        eager_async: false,
        eager: [
          expect.objectContaining({ crop: "limit", quality: "auto", format: "jpg" }),
        ],
      }),
    );

    // ...and the verified bytes are written back over the same public_id from
    // memory. Handing Cloudinary its own delivery URL is what returned 420 on
    // every fresh upload, so the source must never be one.
    const [source, options] = mockCloudinary.uploader.upload.mock.calls[0];
    expect(source).toMatch(/^data:image\/jpeg;base64,/);
    expect(source).not.toContain("res.cloudinary.com");
    expect(options).toEqual(
      expect.objectContaining({
        public_id: "medical/images/user-1/uuid",
        type: "authenticated",
        overwrite: true,
        invalidate: true,
      }),
    );
  });

  it("sanitizes a freshly uploaded PNG with no warmed derivative", async () => {
    // The regression: nothing in this path may depend on a derivative having
    // been requested before, because for a new upload none ever has.
    mockAttachment.findUnique.mockResolvedValue({
      ...pendingImage,
      mimeType: "image/png",
    });
    mockCloudinary.api.resource.mockResolvedValue({
      bytes: PNG_BYTES.length,
      format: "png",
      width: 4000,
      height: 3000,
    });
    mockFetchOnce(PNG_BYTES);
    mockAttachment.update.mockResolvedValue({ ...pendingImage, status: "READY" });

    const result = await confirmAttachment("user-1", "att-1");

    expect(result.status).toBe("READY");
    expect(mockCloudinary.uploader.explicit).toHaveBeenCalledTimes(1);
    expect(mockCloudinary.uploader.upload.mock.calls[0][0]).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(mockCloudinary.uploader.destroy).not.toHaveBeenCalled();
  });

  it("rejects the upload when the derivative still carries EXIF metadata", async () => {
    stageValidJpeg();
    mockFetchOnce(EXIF_JPEG_BYTES);
    mockAttachment.update.mockResolvedValue({ ...pendingImage, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );

    expect(mockCloudinary.uploader.upload).not.toHaveBeenCalled();
    expect(mockCloudinary.uploader.destroy).toHaveBeenCalled();
    expect(mockAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } }),
    );
  });

  it("rejects the upload when the derivative comes back in another format", async () => {
    stageValidJpeg();
    mockCloudinary.uploader.explicit.mockResolvedValue({
      eager: [{ ...SANITIZED_IMAGE, format: "png", secure_url: "https://res.cloudinary.com/x" }],
    });
    mockAttachment.update.mockResolvedValue({ ...pendingImage, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );
    expect(mockCloudinary.uploader.upload).not.toHaveBeenCalled();
  });

  it("rejects the upload when Cloudinary generates no derivative", async () => {
    stageValidJpeg();
    // Cloudinary rejects with a plain object, not an Error — the shape that
    // used to be logged as "unknown".
    mockCloudinary.uploader.explicit.mockRejectedValue({
      message: "Error in loading https://res.cloudinary.com/... - HTTP status code 420",
      http_code: 400,
    });
    mockAttachment.update.mockResolvedValue({ ...pendingImage, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );
    expect(mockCloudinary.uploader.destroy).toHaveBeenCalled();
    expect(mockAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } }),
    );
  });

  it("stores the sanitized dimensions, not the originally uploaded ones", async () => {
    stageValidJpeg();

    await confirmAttachment("user-1", "att-1");

    expect(mockAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bytes: SANITIZED_IMAGE.bytes,
          width: SANITIZED_IMAGE.width,
          height: SANITIZED_IMAGE.height,
        }),
      }),
    );
  });

  it("rejects the upload rather than storing an image it could not sanitize", async () => {
    stageValidJpeg();
    mockCloudinary.uploader.upload.mockRejectedValue(new Error("cloudinary down"));
    mockAttachment.update.mockResolvedValue({ ...pendingImage, status: "REJECTED" });

    await expect(confirmAttachment("user-1", "att-1")).rejects.toThrow(
      AttachmentError,
    );

    expect(mockCloudinary.uploader.destroy).toHaveBeenCalled();
    expect(mockAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } }),
    );
  });

  it("does not try to sanitize a PDF as an image", async () => {
    mockAttachment.findUnique.mockResolvedValue({
      ...pendingImage,
      kind: "DOCUMENT",
      mimeType: "application/pdf",
    });
    mockCloudinary.api.resource.mockResolvedValue({ bytes: PDF_BYTES.length });
    mockFetchOnce(PDF_BYTES);
    mockAttachment.update.mockResolvedValue({ ...pendingImage, status: "READY" });

    await confirmAttachment("user-1", "att-1");

    expect(mockCloudinary.uploader.upload).not.toHaveBeenCalled();
    expect(mockCloudinary.uploader.explicit).not.toHaveBeenCalled();
  });
});

describe("findImageMetadataMarker", () => {
  it("finds the EXIF segment in a JPEG that carries one", () => {
    expect(findImageMetadataMarker(EXIF_JPEG_BYTES, "jpg")).toBe("APP1 (EXIF/XMP)");
  });

  it("passes a JPEG whose metadata has been stripped", () => {
    expect(findImageMetadataMarker(JPEG_BYTES, "jpg")).toBeNull();
  });

  it("finds PNG text chunks and passes a clean PNG", () => {
    const tagged = Buffer.concat([
      PNG_BYTES.subarray(0, 8),
      Buffer.from([0, 0, 0, 12]),
      Buffer.from("tEXtComment", "latin1"),
      PNG_BYTES.subarray(8),
    ]);
    expect(findImageMetadataMarker(tagged, "png")).toBe("tEXt");
    expect(findImageMetadataMarker(PNG_BYTES, "png")).toBeNull();
  });
});

describe("PENDING attachments are unusable everywhere", () => {
  const pending = {
    id: "att-1",
    userId: "user-1",
    status: "PENDING",
    kind: "IMAGE" as const,
    mimeType: "image/jpeg",
    publicId: "medical/images/user-1/uuid",
    messageId: null,
  };

  it("cannot be attached to a chat message", async () => {
    mockAttachment.findMany.mockResolvedValue([pending]);

    await expect(
      validateAttachmentsForMessage("user-1", ["att-1"]),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("cannot be bound to a message even if validation was skipped", async () => {
    // The binding query itself filters on READY, so a PENDING row matches
    // nothing and the mismatch is caught.
    mockAttachment.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      bindAttachmentsToMessage(["att-1"], "msg-1"),
    ).rejects.toMatchObject({ status: 409 });

    expect(mockAttachment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "READY", messageId: null }),
      }),
    );
  });

  it("cannot be turned into an image URL for an AI provider", () => {
    expect(() => getAiImageUrl(pending as never)).toThrow(AttachmentError);
    expect(mockCloudinary.url).not.toHaveBeenCalled();
  });

  it("cannot have its text extracted for an AI provider", async () => {
    await expect(
      extractPdfText({
        ...pending,
        kind: "DOCUMENT",
        mimeType: "application/pdf",
      } as never),
    ).rejects.toThrow(AttachmentError);
  });

  it("cannot be downloaded", async () => {
    mockAttachment.findUnique.mockResolvedValue(pending);

    await expect(
      getAttachmentDeliveryUrl("user-1", "att-1"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("is equally unusable once REJECTED", async () => {
    const rejected = { ...pending, status: "REJECTED" };
    mockAttachment.findMany.mockResolvedValue([rejected]);

    await expect(
      validateAttachmentsForMessage("user-1", ["att-1"]),
    ).rejects.toMatchObject({ status: 400 });
    expect(() => getAiImageUrl(rejected as never)).toThrow(AttachmentError);
  });

  it("still allows a READY attachment through", async () => {
    const ready = { ...pending, status: "READY" };
    mockAttachment.findMany.mockResolvedValue([ready]);
    mockAttachment.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      validateAttachmentsForMessage("user-1", ["att-1"]),
    ).resolves.toHaveLength(1);
    await expect(
      bindAttachmentsToMessage(["att-1"], "msg-1"),
    ).resolves.toBeUndefined();
    expect(() => getAiImageUrl(ready as never)).not.toThrow();
  });
});

describe("sweepAbandonedAttachments", () => {
  const abandoned = {
    id: "att-old",
    userId: "user-1",
    status: "PENDING",
    kind: "IMAGE" as const,
    publicId: "medical/images/user-1/abandoned",
  };

  it("destroys abandoned Cloudinary assets and removes their rows", async () => {
    mockAttachment.findMany.mockResolvedValue([abandoned]);
    mockAttachment.deleteMany.mockResolvedValue({ count: 1 });

    const summary = await sweepAbandonedAttachments();

    expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith(
      "medical/images/user-1/abandoned",
      expect.objectContaining({ type: "authenticated" }),
    );
    expect(summary.pendingDestroyed).toBe(1);
  });

  it("only sweeps PENDING rows past the cutoff", async () => {
    mockAttachment.findMany.mockResolvedValue([]);
    mockAttachment.deleteMany.mockResolvedValue({ count: 0 });

    await sweepAbandonedAttachments();

    expect(mockAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          createdAt: { lt: expect.any(Date) },
        }),
      }),
    );
  });

  it("keeps the row when the Cloudinary destroy fails, so the next pass retries", async () => {
    mockAttachment.findMany.mockResolvedValue([abandoned]);
    mockCloudinary.uploader.destroy.mockRejectedValue(new Error("cloudinary down"));
    mockAttachment.deleteMany.mockResolvedValue({ count: 0 });

    const summary = await sweepAbandonedAttachments();

    expect(summary.pendingFailed).toBe(1);
    expect(summary.pendingDestroyed).toBe(0);
    // The only deleteMany is the REJECTED prune, not the failed row.
    expect(mockAttachment.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockAttachment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "REJECTED" }),
      }),
    );
  });

  it("prunes old REJECTED rows", async () => {
    mockAttachment.findMany.mockResolvedValue([]);
    mockAttachment.deleteMany.mockResolvedValue({ count: 3 });

    const summary = await sweepAbandonedAttachments();

    expect(summary.rejectedPruned).toBe(3);
  });

  it("no longer runs on the request path for signatures", async () => {
    mockAttachment.create.mockResolvedValue({
      id: "att-1",
      publicId: "medical/images/user-1/uuid",
    });

    await requestUploadSignature("user-1", {
      kind: "IMAGE",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });

    expect(mockAttachment.findMany).not.toHaveBeenCalled();
    expect(mockCloudinary.uploader.destroy).not.toHaveBeenCalled();
  });
});
