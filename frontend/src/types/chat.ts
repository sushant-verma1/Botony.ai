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
}