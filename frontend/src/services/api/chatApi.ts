import api from './api'
import type {
  NewChatResponse,
  SendMessageResponse,
  HistoryResponse,
  ConversationsResponse,
} from '../../types/chat'

export const chatAPI = {
  createConversation: () =>
    api.post<NewChatResponse>('/chat/newchat'),

  sendMessage: (
    conversationId: string,
    message: string,
    attachmentIds?: string[],
  ) =>
    api.post<SendMessageResponse>(
      `/chat/${conversationId}/message`,
      { content: message, attachmentIds }
    ),

  getHistory: (
    conversationId: string,
    params?: { before?: string; limit?: number },
  ) =>
    api.get<HistoryResponse>(`/chat/${conversationId}/history`, {
      params,
    }),

  getConversations: () =>
    api.get<ConversationsResponse>('/chat/conversations'),

  deleteConversation: (conversationId: string) =>
    api.delete<{ message: string }>(`/chat/${conversationId}`),

  renameConversation: (conversationId: string, title: string) =>
    api.patch<{ conversationId: string; title: string }>(
      `/chat/${conversationId}`,
      { title },
    ),
}