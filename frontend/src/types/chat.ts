export interface NewChatResponse {
  conversationId: string
  message: string
}

export interface SendMessageResponse {
  messageId: string
  assistantMessageId: string
  type: 'normal' | 'emergency'
  response: string
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