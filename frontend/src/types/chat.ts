export interface NewChatResponse {
  conversationId: string
  message: string
}

/** The payload of the stream's `done` event — the answer arrived as deltas. */
export interface SendMessageResult {
  messageId: string
  assistantMessageId: string
  type: 'normal' | 'emergency'
}

export interface MessageStreamHandlers {
  /** Fired once, when the first visible text is about to arrive. */
  onStart?: (provider: string) => void
  onDelta: (text: string) => void
  signal?: AbortSignal
}

export type AttachmentKind = 'IMAGE' | 'DOCUMENT'

export interface AttachmentSignatureResponse {
  attachmentId: string
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  publicId: string
  resourceType: 'image' | 'raw'
  type: 'authenticated'
  allowedFormats?: string
  folder: string
}

export interface AttachmentConfirmResponse {
  id: string
  kind: AttachmentKind
  status: 'PENDING' | 'READY' | 'REJECTED'
  mimeType: string
  bytes: number
  width: number | null
  height: number | null
  createdAt: string
}

export interface AttachmentUrlResponse {
  url: string
  mimeType: string
}

export interface ChatMessage {
  id: string
  content: string
  role: 'user' | 'assistant'
  emergencyDetected: boolean
  createdAt: string
}

export interface HistoryResponse {
  conversationId: string
  messages: ChatMessage[]
  hasMore: boolean
  nextCursor: string | null
}

export interface ConversationSummary {
  id: string
  title: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface ConversationsResponse {
  conversations: ConversationSummary[]
}