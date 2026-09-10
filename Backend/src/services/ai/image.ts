import logger from "../logger.js";
import { AIProviderError } from "./types.js";

export interface InlinedImage {
  mimeType: string;
  base64: string;
  byteLength: number;
}

/**
 * Neither provider is given the signed attachment URL: it is read here and
 * inlined, so the short-lived Cloudinary URL never leaves the backend and the
 * bytes that reach the model are the ones that passed ClamAV.
 * getAiImageUrl always requests a JPEG derivative; the response Content-Type
 * is still what decides the declared MIME type so it is never guessed wrong.
 */
export async function inlineImage(
  url: string,
  provider: "gemini" | "groq",
): Promise<InlinedImage> {
  const startedAt = Date.now();
  const response = await fetch(url);
  if (!response.ok) {
    throw new AIProviderError(
      `Could not read attached image (${response.status})`,
      provider,
      response.status >= 500 || response.status === 429,
      response.status,
    );
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  const mimeType =
    contentType && contentType.startsWith("image/") ? contentType : "image/jpeg";

  const bytes = Buffer.from(await response.arrayBuffer());
  const base64 = bytes.toString("base64");

  // Size and duration only — never the URL or the image itself.
  logger.info("Inlined an attached image", {
    provider,
    mimeType,
    imageBytes: bytes.length,
    base64Bytes: base64.length,
    downloadMs: Date.now() - startedAt,
  });

  return { mimeType, base64, byteLength: bytes.length };
}
