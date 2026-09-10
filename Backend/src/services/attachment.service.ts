import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { extractText } from "unpdf";
import { cloudinary } from "../config/cloudinary.js";
import { cloudinaryApiSecret } from "../config/config.js";
import { prisma } from "../config/db.js";
import logger from "./logger.js";
import { describeError } from "../utils/error.util.js";
import { scanAttachment } from "./malware.service.js";
import type { Attachment, AttachmentKind } from "@prisma/client";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_DOCUMENT_MIME_TYPES,
  CLOUDINARY_FOLDERS,
  DELIVERY_URL_TTL_SECONDS,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_PDF_BYTES,
  MAX_STORED_IMAGE_DIMENSION,
  MIME_TO_EXT,
  PDF_TEXT_CHAR_LIMIT,
  PENDING_ATTACHMENT_TTL_MS,
  REJECTED_ATTACHMENT_TTL_MS,
  CLEANUP_BATCH_SIZE,
  SIGNATURE_SNIFF_BYTES,
  UPLOAD_SIGNATURE_TTL_SECONDS,
  isAllowedMimeType,
  mimeToKind,
} from "../config/attachments.js";

export class AttachmentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AttachmentError";
    this.status = status;
  }
}

function resourceTypeForKind(kind: AttachmentKind): "image" | "raw" {
  return kind === "IMAGE" ? "image" : "raw";
}

function maxBytesForKind(kind: AttachmentKind): number {
  return kind === "IMAGE" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
}

export interface CleanupSummary {
  pendingDestroyed: number;
  pendingFailed: number;
  rejectedPruned: number;
}

/**
 * Deletes abandoned PENDING attachments — uploads whose client never came
 * back to confirm — so untrusted assets can't sit in Cloudinary
 * indefinitely, and prunes old REJECTED rows whose asset was already
 * destroyed at rejection time.
 *
 * Runs on a schedule (see cleanup.scheduler.ts) rather than opportunistically
 * on a user request, so abandoned uploads are cleaned up even for users who
 * never come back, and no user pays the sweep's latency. Each pass is bounded
 * by CLEANUP_BATCH_SIZE; a backlog drains over successive runs.
 */
export async function sweepAbandonedAttachments(): Promise<CleanupSummary> {
  const now = Date.now();
  const summary: CleanupSummary = {
    pendingDestroyed: 0,
    pendingFailed: 0,
    rejectedPruned: 0,
  };

  const stale = await prisma.attachment.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: new Date(now - PENDING_ATTACHMENT_TTL_MS) },
    },
    take: CLEANUP_BATCH_SIZE,
  });

  for (const attachment of stale) {
    try {
      await cloudinary.uploader.destroy(attachment.publicId, {
        resource_type: resourceTypeForKind(attachment.kind),
        type: "authenticated",
      });
    } catch (error) {
      // The row is deliberately left in place so the next pass retries the
      // destroy — dropping it here would orphan the Cloudinary asset with no
      // record that it exists.
      summary.pendingFailed += 1;
      logger.warn("Failed to destroy abandoned pending attachment", {
        attachmentId: attachment.id,
        ...describeError(error),
      });
      continue;
    }
    await prisma.attachment.deleteMany({ where: { id: attachment.id } });
    summary.pendingDestroyed += 1;
  }

  const pruned = await prisma.attachment.deleteMany({
    where: {
      status: "REJECTED",
      createdAt: { lt: new Date(now - REJECTED_ATTACHMENT_TTL_MS) },
    },
  });
  summary.rejectedPruned = pruned.count;

  if (summary.pendingDestroyed || summary.pendingFailed || summary.rejectedPruned) {
    logger.info("Attachment cleanup pass complete", { ...summary });
  }

  return summary;
}

/**
 * Guard for every path that consumes an attachment's content. Status is
 * checked at the point of use as well as at validation time, so a PENDING or
 * REJECTED attachment can never reach chat, an AI provider, or a download
 * URL even if a caller forgets to validate first.
 */
function assertReady(attachment: Attachment): void {
  if (attachment.status !== "READY") {
    throw new AttachmentError("Attachment is not available", 409);
  }
}

export interface UploadSignatureRequest {
  kind: AttachmentKind;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadSignatureResult {
  attachmentId: string;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  resourceType: "image" | "raw";
  type: "authenticated";
  allowedFormats?: string;
  folder: string;
}

/**
 * Step 1 of the direct-upload pipeline. Rejects on declared MIME/size before
 * anything is uploaded — the cheapest possible reject. Never trusts a client
 * filename: the storage key (publicId) is generated here, not derived from
 * user input, which is also what stands in for "extension validation" in an
 * architecture where no filename is ever accepted or stored.
 */
export async function requestUploadSignature(
  userId: string,
  request: UploadSignatureRequest,
): Promise<UploadSignatureResult> {
  const { kind, mimeType, sizeBytes } = request;
  const expectedKind = mimeToKind(mimeType);

  if (!isAllowedMimeType(mimeType) || expectedKind !== kind) {
    throw new AttachmentError("Unsupported file type", 400);
  }

  const maxBytes = maxBytesForKind(kind);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    throw new AttachmentError(
      `File exceeds the ${Math.floor(maxBytes / (1024 * 1024))}MB limit for this type`,
      400,
    );
  }

  const folder = CLOUDINARY_FOLDERS[kind];
  const publicId = `${folder}/${userId}/${randomUUID()}`;
  const resourceType = resourceTypeForKind(kind);
  const timestamp = Math.floor(Date.now() / 1000);

  const attachment = await prisma.attachment.create({
    data: {
      userId,
      kind,
      mimeType,
      publicId,
      resourceType,
      folder,
      status: "PENDING",
    },
  });

  const paramsToSign: Record<string, string | number> = {
    public_id: publicId,
    timestamp,
    type: "authenticated",
  };

  let allowedFormats: string | undefined;
  if (kind === "IMAGE") {
    allowedFormats = Object.values(MIME_TO_EXT)
      .filter((ext) =>
        (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).some(
          (m) => MIME_TO_EXT[m as keyof typeof MIME_TO_EXT] === ext,
        ),
      )
      .join(",");
    paramsToSign.allowed_formats = allowedFormats;
  }

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    cloudinaryApiSecret,
  );

  logger.info("Attachment upload signature issued", {
    userId,
    attachmentId: attachment.id,
    kind,
  });

  return {
    attachmentId: attachment.id,
    cloudName: cloudinary.config().cloud_name as string,
    apiKey: cloudinary.config().api_key as string,
    timestamp,
    signature,
    publicId,
    resourceType,
    type: "authenticated",
    allowedFormats,
    folder,
  };
}

async function fetchRange(url: string, range: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { Range: range } });
  if (!response.ok) {
    throw new AttachmentError("Could not read uploaded file for validation", 502);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function rejectAttachment(
  attachment: Attachment,
  reason: string,
): Promise<never> {
  try {
    await cloudinary.uploader.destroy(attachment.publicId, {
      resource_type: resourceTypeForKind(attachment.kind),
      type: "authenticated",
    });
  } catch (error) {
    logger.warn("Failed to destroy rejected attachment", {
      attachmentId: attachment.id,
      ...describeError(error),
    });
  }
  await prisma.attachment.update({
    where: { id: attachment.id },
    data: { status: "REJECTED" },
  });
  logger.warn("Attachment rejected", { attachmentId: attachment.id, reason });
  throw new AttachmentError(
    "File content does not match the declared type",
    422,
  );
}

/**
 * Segment/chunk markers that carry the metadata sanitization is meant to
 * remove: EXIF (incl. GPS), XMP, IPTC and free-text comments. Their presence
 * in a supposedly sanitized image means the strip did not happen.
 */
export function findImageMetadataMarker(
  buffer: Buffer,
  format: string,
): string | null {
  if (format === "png") {
    return (
      ["eXIf", "tEXt", "iTXt", "zTXt"].find((chunk) =>
        buffer.includes(chunk, 0, "latin1"),
      ) ?? null
    );
  }
  if (format === "webp") {
    return (
      ["EXIF", "XMP "].find((chunk) => buffer.includes(chunk, 0, "latin1")) ??
      null
    );
  }

  // JPEG: walk the segment headers rather than substring-matching, so a
  // marker string appearing inside compressed scan data can't cause a false
  // rejection of a legitimately sanitized image.
  let offset = 2; // past SOI
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) break; // start of scan — no metadata past here
    if (marker === 0xe1) return "APP1 (EXIF/XMP)";
    if (marker === 0xed) return "APP13 (IPTC)";
    if (marker === 0xfe) return "COM";
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

/**
 * Strips metadata (EXIF, GPS coordinates, IPTC, XMP) from a stored image and
 * normalizes its dimensions, by replacing the original with a Cloudinary
 * derivative of itself.
 *
 * Cloudinary generates that derivative server-side via an eager transformation
 * on `uploader.explicit`, and this backend then reads the materialized
 * derivative and writes its bytes back over the same public_id. It must not go
 * back to asking Cloudinary to upload from its own delivery URL: for a
 * freshly uploaded asset the derivative does not exist yet, and Cloudinary
 * answers its own self-fetch with HTTP 420 instead of generating it — which
 * made sanitization fail deterministically on every new upload.
 *
 * A GPS-tagged photo of a symptom is exactly the kind of thing that must not
 * survive in storage, so this runs before the attachment is ever READY, and
 * the derivative is validated (format, dimensions, metadata markers) before it
 * is allowed to become the stored asset.
 */
async function sanitizeStoredImage(
  attachment: Attachment,
  format: string,
): Promise<{ bytes: number; width: number; height: number }> {
  const explicit = (await cloudinary.uploader.explicit(attachment.publicId, {
    type: "authenticated",
    resource_type: "image",
    eager: [
      {
        width: MAX_STORED_IMAGE_DIMENSION,
        height: MAX_STORED_IMAGE_DIMENSION,
        crop: "limit",
        quality: "auto",
        format,
      },
    ],
    eager_async: false,
    invalidate: true,
  })) as {
    eager?: {
      secure_url?: string;
      bytes?: number;
      width?: number;
      height?: number;
      format?: string;
    }[];
  };

  const derivative = explicit.eager?.[0];
  if (!derivative?.secure_url || !derivative.width || !derivative.height) {
    throw new Error("Cloudinary did not generate a sanitized derivative");
  }
  if (derivative.format && derivative.format !== format) {
    throw new Error(
      `Sanitized derivative changed format: expected ${format}, got ${derivative.format}`,
    );
  }
  if (
    derivative.width > MAX_STORED_IMAGE_DIMENSION ||
    derivative.height > MAX_STORED_IMAGE_DIMENSION
  ) {
    throw new Error(
      `Sanitized derivative exceeds the stored-dimension cap: ${derivative.width}x${derivative.height}`,
    );
  }

  // Read back the derivative this backend just had generated — a server-side
  // fetch of an already-materialized asset, not Cloudinary fetching itself.
  const sanitizedBytes = await fetchRange(derivative.secure_url, "bytes=0-");

  if (
    sanitizedBytes.length === 0 ||
    sanitizedBytes.length > maxBytesForKind(attachment.kind)
  ) {
    throw new Error(
      `Sanitized derivative has an unusable size: ${sanitizedBytes.length} bytes`,
    );
  }
  const sniffed = await fileTypeFromBuffer(sanitizedBytes);
  if (!sniffed || sniffed.ext !== format) {
    throw new Error(
      `Sanitized derivative is not a valid ${format} image (sniffed ${sniffed?.ext ?? "nothing"})`,
    );
  }
  const marker = findImageMetadataMarker(sanitizedBytes, format);
  if (marker) {
    throw new Error(`Sanitized derivative still carries metadata: ${marker}`);
  }

  // Write the verified bytes back over the original, from memory — passing a
  // Cloudinary URL here is what caused the 420.
  const result = (await cloudinary.uploader.upload(
    `data:${attachment.mimeType};base64,${sanitizedBytes.toString("base64")}`,
    {
      public_id: attachment.publicId,
      resource_type: "image",
      type: "authenticated",
      format,
      overwrite: true,
      invalidate: true,
    },
  )) as { bytes?: number; width?: number; height?: number; format?: string };

  if (!result.width || !result.height || !result.bytes) {
    throw new Error("Cloudinary did not return a usable sanitized image");
  }
  if (result.format && result.format !== format) {
    throw new Error("Sanitized image changed format unexpectedly");
  }

  return { bytes: result.bytes, width: result.width, height: result.height };
}

/**
 * Step 3: the untrusted asset in Cloudinary is not a valid attachment until
 * this passes. Layered checks: Cloudinary's own decode (image resource type
 * only — it does not validate raw/PDF content), size, pixel dimensions
 * (decompression-bomb guard), magic bytes fetched and checked by us, and a
 * malware-scan hook. Any disagreement between layers rejects the file.
 */
export async function confirmAttachment(
  userId: string,
  attachmentId: string,
): Promise<Attachment> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.userId !== userId) {
    throw new AttachmentError("Attachment not found", 404);
  }
  if (attachment.status !== "PENDING") {
    throw new AttachmentError("Attachment already processed", 409);
  }

  const resourceType = resourceTypeForKind(attachment.kind);

  let resource: {
    bytes: number;
    format?: string;
    width?: number;
    height?: number;
  };
  try {
    resource = await cloudinary.api.resource(attachment.publicId, {
      resource_type: resourceType,
      type: "authenticated",
    });
  } catch (error) {
    logger.warn("Attachment not found in Cloudinary at confirm time", {
      attachmentId,
      ...describeError(error),
    });
    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { status: "REJECTED" },
    });
    throw new AttachmentError("Upload was not received", 422);
  }

  const maxBytes = maxBytesForKind(attachment.kind);
  if (!resource.bytes || resource.bytes <= 0 || resource.bytes > maxBytes) {
    return rejectAttachment(attachment, "size out of bounds");
  }

  if (attachment.kind === "IMAGE") {
    // Cloudinary only reports width/height for image resources it actually
    // decoded — this is itself the parsability check for images.
    if (!resource.width || !resource.height) {
      return rejectAttachment(attachment, "not a decodable image");
    }
    if (
      resource.width > MAX_IMAGE_DIMENSION ||
      resource.height > MAX_IMAGE_DIMENSION ||
      resource.width * resource.height > MAX_IMAGE_PIXELS
    ) {
      return rejectAttachment(attachment, "exceeds pixel/dimension limits");
    }
    const declaredExt = MIME_TO_EXT[attachment.mimeType as keyof typeof MIME_TO_EXT];
    if (resource.format !== declaredExt) {
      return rejectAttachment(attachment, "declared MIME does not match content");
    }
  }

  // Cloudinary does not validate content for `resource_type: raw` (PDFs), so
  // for documents the magic-byte check below is the authoritative gate, not
  // a cross-check.
  const format = attachment.kind === "IMAGE" ? resource.format! : "pdf";
  const downloadUrl = cloudinary.utils.private_download_url(
    attachment.publicId,
    format,
    {
      resource_type: resourceType,
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + UPLOAD_SIGNATURE_TTL_SECONDS,
    },
  );

  const headBuffer = await fetchRange(
    downloadUrl,
    `bytes=0-${SIGNATURE_SNIFF_BYTES - 1}`,
  );

  const sniffed = await fileTypeFromBuffer(headBuffer);
  const expectedExt = MIME_TO_EXT[attachment.mimeType as keyof typeof MIME_TO_EXT];
  if (!sniffed || sniffed.ext !== expectedExt) {
    return rejectAttachment(attachment, "magic bytes do not match declared type");
  }

  if (attachment.kind === "DOCUMENT") {
    if (!headBuffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
      return rejectAttachment(attachment, "missing PDF header");
    }
    const gotFullFile = headBuffer.length >= resource.bytes;
    const tailBuffer = gotFullFile
      ? headBuffer
      : await fetchRange(downloadUrl, "bytes=-1024");
    if (!tailBuffer.toString("latin1").includes("%%EOF")) {
      return rejectAttachment(attachment, "missing PDF trailer");
    }
  }

  const scan = await scanAttachment({
    publicId: attachment.publicId,
    downloadUrl,
    sizeBytes: resource.bytes,
  });
  if (!scan.clean) {
    return rejectAttachment(attachment, scan.reason ?? "failed malware scan");
  }

  // READY implies sanitized: an image is only marked usable after its
  // metadata has been stripped, and a sanitization failure rejects the
  // upload rather than leaving an unsanitized original in storage.
  let stored = {
    bytes: resource.bytes,
    width: resource.width ?? null as number | null,
    height: resource.height ?? null as number | null,
  };
  if (attachment.kind === "IMAGE") {
    try {
      stored = await sanitizeStoredImage(attachment, resource.format!);
    } catch (error) {
      logger.error("Image sanitization failed", {
        attachmentId,
        publicId: attachment.publicId,
        resourceType: "image",
        format: resource.format,
        ...describeError(error),
      });
      return rejectAttachment(attachment, "image sanitization failed");
    }
  }

  const updated = await prisma.attachment.update({
    where: { id: attachmentId },
    data: {
      status: "READY",
      bytes: stored.bytes,
      width: stored.width,
      height: stored.height,
      scanner: scan.scanner,
    },
  });

  logger.info("Attachment confirmed", {
    attachmentId,
    userId,
    scanner: scan.scanner,
    sanitized: attachment.kind === "IMAGE",
  });
  return updated;
}

/**
 * Delivery to the browser: a genuinely short-lived, expiring signed URL.
 * It serves the stored asset directly, which is safe for images because the
 * stored asset is itself the sanitized, metadata-stripped derivative written
 * during confirm — sanitizing at rest rather than at delivery is what lets
 * this stay a time-limited private download URL instead of a non-expiring
 * signed transformation URL.
 */
export async function getAttachmentDeliveryUrl(
  userId: string,
  attachmentId: string,
): Promise<{ url: string; mimeType: string }> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });

  // A PENDING (still untrusted) or REJECTED attachment is indistinguishable
  // from a non-existent one here — it is never downloadable, and the 404
  // avoids confirming that the id exists at all.
  if (!attachment || attachment.userId !== userId || attachment.status !== "READY") {
    throw new AttachmentError("Attachment not found", 404);
  }

  const format =
    attachment.kind === "IMAGE"
      ? MIME_TO_EXT[attachment.mimeType as keyof typeof MIME_TO_EXT]
      : "pdf";

  const url = cloudinary.utils.private_download_url(
    attachment.publicId,
    format,
    {
      resource_type: resourceTypeForKind(attachment.kind),
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + DELIVERY_URL_TTL_SECONDS,
      attachment: attachment.kind === "DOCUMENT",
    },
  );

  return { url, mimeType: attachment.mimeType };
}

export async function deleteAttachment(
  userId: string,
  attachmentId: string,
): Promise<void> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.userId !== userId) {
    throw new AttachmentError("Attachment not found", 404);
  }

  try {
    await cloudinary.uploader.destroy(attachment.publicId, {
      resource_type: resourceTypeForKind(attachment.kind),
      type: "authenticated",
    });
  } catch (error) {
    logger.warn("Failed to destroy attachment in Cloudinary", {
      attachmentId,
      ...describeError(error),
    });
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  logger.info("Attachment deleted", { attachmentId, userId });
}

/**
 * Validates attachment ownership/readiness for a chat message before any
 * binding happens. Only attachments explicitly named in this request are
 * ever touched — history is never re-sent.
 */
export async function validateAttachmentsForMessage(
  userId: string,
  attachmentIds: string[],
): Promise<Attachment[]> {
  if (attachmentIds.length === 0) return [];
  if (attachmentIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new AttachmentError(
      `A message can include at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments`,
      400,
    );
  }

  const attachments = await prisma.attachment.findMany({
    where: { id: { in: attachmentIds } },
  });

  if (attachments.length !== attachmentIds.length) {
    throw new AttachmentError("One or more attachments were not found", 400);
  }

  for (const attachment of attachments) {
    if (attachment.userId !== userId) {
      throw new AttachmentError("One or more attachments were not found", 400);
    }
    if (attachment.status !== "READY") {
      throw new AttachmentError("One or more attachments are not ready yet", 400);
    }
    if (attachment.messageId) {
      throw new AttachmentError(
        "One or more attachments are already attached to a message",
        400,
      );
    }
  }

  return attachments;
}

/**
 * Binds attachments to a message. The status/messageId filter is repeated
 * here rather than trusted from validation time: it closes the window
 * between the two, and it means no code path can attach something that is
 * not READY even if it skipped validateAttachmentsForMessage. The database
 * enforces the same rule with a CHECK constraint as the last line of defence.
 */
export async function bindAttachmentsToMessage(
  attachmentIds: string[],
  messageId: string,
): Promise<void> {
  if (attachmentIds.length === 0) return;
  const { count } = await prisma.attachment.updateMany({
    where: { id: { in: attachmentIds }, status: "READY", messageId: null },
    data: { messageId },
  });

  if (count !== attachmentIds.length) {
    throw new AttachmentError("One or more attachments are unavailable", 409);
  }
}

const ALLOWED_DOCUMENT_MIME_TYPES_SET = new Set<string>(
  ALLOWED_DOCUMENT_MIME_TYPES,
);

export function isDocumentAttachment(attachment: Attachment): boolean {
  return ALLOWED_DOCUMENT_MIME_TYPES_SET.has(attachment.mimeType);
}

/**
 * A short-lived signed URL suitable for handing to an AI provider. Unlike
 * getAttachmentDeliveryUrl, this forces a JPEG derivative (the AI providers only accept
 * JPEG/PNG) and is never returned to the browser or persisted — it exists
 * only for the duration of the outbound provider call.
 */
export function getAiImageUrl(attachment: Attachment): string {
  assertReady(attachment);
  return cloudinary.url(attachment.publicId, {
    resource_type: "image",
    type: "authenticated",
    sign_url: true,
    secure: true,
    transformation: [
      { width: 1600, crop: "limit", fetch_format: "jpg", quality: "auto" },
    ],
  });
}

/**
 * Neither AI provider consumes PDFs directly, so this is the one place attachment
 * bytes deliberately flow through the backend: a short-lived signed URL is
 * fetched in full and the text extracted, capped, and passed as context
 * instead of the binary. Failure is surfaced, not swallowed.
 */
export async function extractPdfText(attachment: Attachment): Promise<string> {
  assertReady(attachment);
  const downloadUrl = cloudinary.utils.private_download_url(
    attachment.publicId,
    "pdf",
    {
      resource_type: "raw",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + UPLOAD_SIGNATURE_TTL_SECONDS,
    },
  );

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new AttachmentError("Could not read attached PDF", 502);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  try {
    const { text } = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });
    return text.length > PDF_TEXT_CHAR_LIMIT
      ? text.slice(0, PDF_TEXT_CHAR_LIMIT)
      : text;
  } catch (error) {
    logger.error("PDF text extraction failed", {
      attachmentId: attachment.id,
      ...describeError(error),
    });
    throw new AttachmentError("Could not read attached PDF", 422);
  }
}
