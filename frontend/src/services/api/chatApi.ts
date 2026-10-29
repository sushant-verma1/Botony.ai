import api, { authSession } from './api'
import type {
  NewChatResponse,
  SendMessageResult,
  MessageStreamHandlers,
  HistoryResponse,
  ConversationsResponse,
} from '../../types/chat'

const FRAME_SEPARATOR = '\n\n'

/** One decoded `event:`/`data:` pair. */
function parseFrame(frame: string): {
  event: string
  data: Record<string, unknown>
} {
  let event = 'message'
  const data: string[] = []

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trim())
  }

  try {
    return { event, data: JSON.parse(data.join('\n')) }
  } catch {
    return { event, data: {} }
  }
}

/**
 * Sends a message and consumes the answer as it is generated. Axios buffers a
 * response before resolving, so this one endpoint uses fetch — through
 * authSession, which keeps it on the same access token and the same
 * single-flight refresh as every other call.
 *
 * `conversationId` is null for a local draft that has never been sent —
 * that request hits POST /chat/message with `draftId` instead of a
 * conversation in the URL, and the backend creates the conversation and this
 * first message together.
 */
async function streamMessage(
  conversationId: string | null,
  message: string,
  attachmentIds: string[] | undefined,
  handlers: MessageStreamHandlers & { draftId?: string },
): Promise<SendMessageResult> {
  const path = conversationId ? `/chat/${conversationId}/message` : '/chat/message'
  const body = conversationId
    ? { content: message, attachmentIds }
    : { content: message, attachmentIds, draftId: handlers.draftId }

  const response = await authSession.fetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
    signal: handlers.signal,
  })

  // Everything that fails before the stream opens is still ordinary JSON.
  if (!response.ok || !response.body) {
    const failure = await response
      .json()
      .then((body) => body?.message as string | undefined)
      .catch(() => undefined)

    throw new Error(failure || 'Failed to send message')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: SendMessageResult | null = null

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf(FRAME_SEPARATOR)
    while (boundary !== -1) {
      const { event, data } = parseFrame(buffer.slice(0, boundary))
      buffer = buffer.slice(boundary + FRAME_SEPARATOR.length)

      if (event === 'start') handlers.onStart?.(String(data.provider ?? ''))
      else if (event === 'delta') handlers.onDelta(String(data.text ?? ''))
      else if (event === 'done') result = data as unknown as SendMessageResult
      else if (event === 'error') throw new Error(String(data.message))

      boundary = buffer.indexOf(FRAME_SEPARATOR)
    }
  }

  // The connection ended without a done event: the answer is incomplete and
  // the backend persisted nothing, so it is not reported as a success.
  if (!result) {
    throw new Error(
      'The answer was cut off before it finished. Please ask again.',
    )
  }

  return result
}

export const chatAPI = {
  createConversation: () =>
    api.post<NewChatResponse>('/chat/newchat'),

  streamMessage,

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
