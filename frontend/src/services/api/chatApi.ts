import api from './api'
import type {
  NewChatResponse,
  SendMessageResponse,
  HistoryResponse,
} from '../../types/chat'

export const chatAPI = {
  createConversation: () =>
    api.post<NewChatResponse>('/chat/newchat'),

  sendMessage: (conversationId: string, message: string) =>
    api.post<SendMessageResponse>(
      `/chat/${conversationId}/message`,
      { content: message }
    ),

  getHistory: (conversationId: string) =>
    api.get<HistoryResponse>(
      `/chat/${conversationId}/history`
    ),
}