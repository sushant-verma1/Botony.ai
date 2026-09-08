// Centralized attachment limits and allowlists. Nothing about "what's a
// valid attachment" should be a magic number anywhere else in the codebase.

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_DOCUMENT_MIME_TYPES = ["application/pdf"] as const;

export const ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_DOCUMENT_MIME_TYPES,
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// file-type's `ext` values for the same set of formats, used to cross-check
// the magic-byte sniff against the declared/Cloudinary-reported MIME type.
export const MIME_TO_EXT: Record<AllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_PDF_BYTES = 12 * 1024 * 1024; // 12 MB

// Decompression-bomb guard: reject images that decode to more than ~40
// megapixels or exceed a sane single-dimension cap, regardless of file size.
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_DIMENSION = 10_000;

// Images are normalized to this dimension when sanitized at rest. Separate
// from MAX_IMAGE_DIMENSION, which is the ingest-time decompression-bomb
// ceiling — this one is the "no larger than we ever need" storage cap.
export const MAX_STORED_IMAGE_DIMENSION = 2048;

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

// Cap on how much extracted PDF text gets sent to the AI providers.
export const PDF_TEXT_CHAR_LIMIT = 20_000;

// How many header/tail bytes to pull for magic-byte + trailer verification.
export const SIGNATURE_SNIFF_BYTES = 4100;

export const CLOUDINARY_FOLDERS = {
  IMAGE: "medical/images",
  DOCUMENT: "medical/reports",
} as const;

// Cloudinary URL lifetimes, in seconds.
export const UPLOAD_SIGNATURE_TTL_SECONDS = 5 * 60;
export const DELIVERY_URL_TTL_SECONDS = 5 * 60;

// PENDING attachments older than this that were never confirmed are
// considered abandoned uploads and swept away.
export const PENDING_ATTACHMENT_TTL_MS = 60 * 60 * 1000; // 1 hour

// REJECTED rows are kept briefly for auditability, then pruned. Their
// Cloudinary asset was already destroyed at rejection time.
export const REJECTED_ATTACHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Upper bound on how many rows one cleanup pass handles, so a large backlog
// is drained over several runs instead of one unbounded sweep.
export const CLEANUP_BATCH_SIZE = 200;

export function mimeToKind(mimeType: string): "IMAGE" | "DOCUMENT" | null {
  if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return "IMAGE";
  }
  if ((ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return "DOCUMENT";
  }
  return null;
}

export function isAllowedMimeType(
  mimeType: string,
): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}
