export interface NewChatResponse {
  conversationId: string
  message: string
}

/** The payload of the stream's `done` event — the answer arrived as deltas. */
export interface SendMessageResult {
  conversationId: string
  messageId: string
  assistantMessageId: string
  type: 'normal' | 'emergency'
}

/** A pending, patient-confirmed action returned by the medication agent. */
export interface MedicationScheduleProposal {
  action: { id: string; expiresAt: string }
  draft: {
    medicationId?: string
    newMedication?: {
      name: string
      strength?: string
      form?: string
    }
    times: string[]
    timezone: string
    startsOn: string
    endsOn?: string
  }
  confirmationToken: string
}
export interface MedicineScheduleMutationProposal {
  action: { id: string; expiresAt: string }
  confirmationToken: string
  operation: 'updateMedicineSchedule' | 'deleteMedicineSchedule'
}

export interface MessageStreamHandlers {
  /** Fired once, when the first visible text is about to arrive. */
  onStart?: (provider: string) => void
  onDelta: (text: string) => void
  /** A schedule may only be created after the patient explicitly confirms it. */
  onMedicationScheduleProposal?: (proposal: MedicationScheduleProposal) => void
  onMedicineScheduleMutationProposal?: (proposal: MedicineScheduleMutationProposal) => void
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
  medicationScheduleProposal?: MedicationScheduleProposal
  medicineScheduleMutationProposal?: MedicineScheduleMutationProposal
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
