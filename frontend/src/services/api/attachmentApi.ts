import api from './api'
import type {
  AttachmentKind,
  AttachmentSignatureResponse,
  AttachmentConfirmResponse,
  AttachmentUrlResponse,
} from '../../types/chat'

// Client-side checks are UX only — the backend re-validates everything
// (declared MIME, size, and the actual file bytes) before an upload is ever
// treated as valid.
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_PDF_BYTES = 12 * 1024 * 1024

export function mimeToKind(mimeType: string): AttachmentKind | null {
  if (mimeType === 'application/pdf') return 'DOCUMENT'
  if (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/webp'
  ) {
    return 'IMAGE'
  }
  return null
}

export const attachmentAPI = {
  requestSignature: (kind: AttachmentKind, mimeType: string, sizeBytes: number) =>
    api.post<AttachmentSignatureResponse>('/attachments/signature', {
      kind,
      mimeType,
      sizeBytes,
    }),

  // Uploads directly to Cloudinary — file bytes never pass through our
  // backend. The signature is single-use and scoped to exactly this
  // public_id/folder/type by the backend, so the client cannot redirect the
  // upload anywhere else.
  uploadToCloudinary: async (
    signature: AttachmentSignatureResponse,
    file: File,
  ): Promise<void> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('api_key', signature.apiKey)
    formData.append('timestamp', String(signature.timestamp))
    formData.append('signature', signature.signature)
    formData.append('public_id', signature.publicId)
    formData.append('type', signature.type)
    if (signature.allowedFormats) {
      formData.append('allowed_formats', signature.allowedFormats)
    }

    const uploadUrl = `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`
    const response = await fetch(uploadUrl, { method: 'POST', body: formData })
    if (!response.ok) {
      throw new Error('Upload to storage failed')
    }
  },

  confirm: (attachmentId: string) =>
    api.post<AttachmentConfirmResponse>(`/attachments/${attachmentId}/confirm`),

  getUrl: (attachmentId: string) =>
    api.get<AttachmentUrlResponse>(`/attachments/${attachmentId}`),

  remove: (attachmentId: string) =>
    api.delete<{ message: string }>(`/attachments/${attachmentId}`),
}
