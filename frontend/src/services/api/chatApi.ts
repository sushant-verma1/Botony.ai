import api, { authSession } from './api'
import type {
  NewChatResponse,
  SendMessageResult,
  MessageStreamHandlers,
  MedicationScheduleProposal,
  MedicineScheduleMutationProposal,
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

function medicationScheduleProposalFrom(data: Record<string, unknown>): MedicationScheduleProposal | null {
  const action = data.action
  const draft = data.draft
  if (
    typeof data.confirmationToken !== 'string' ||
    typeof action !== 'object' || action === null ||
    typeof draft !== 'object' || draft === null
  ) return null

  const actionValue = action as Record<string, unknown>
  const draftValue = draft as Record<string, unknown>
  if (
    typeof actionValue.id !== 'string' ||
    typeof actionValue.expiresAt !== 'string' ||
    !Array.isArray(draftValue.times) ||
    !draftValue.times.every((time) => typeof time === 'string') ||
    typeof draftValue.timezone !== 'string' ||
    typeof draftValue.startsOn !== 'string' ||
    (draftValue.endsOn !== undefined && typeof draftValue.endsOn !== 'string')
  ) return null

  const medicationId = typeof draftValue.medicationId === 'string' ? draftValue.medicationId : undefined
  const newMedicationValue = draftValue.newMedication
  const newMedication = typeof newMedicationValue === 'object' && newMedicationValue !== null && !Array.isArray(newMedicationValue)
    ? newMedicationValue as Record<string, unknown>
    : null
  if ((medicationId ? 1 : 0) + (newMedication ? 1 : 0) !== 1 || (newMedication && typeof newMedication.name !== 'string')) return null

  return {
    action: { id: actionValue.id, expiresAt: actionValue.expiresAt },
    draft: {
      ...(medicationId ? { medicationId } : { newMedication: {
        name: newMedication!.name as string,
        ...(typeof newMedication!.strength === 'string' ? { strength: newMedication!.strength } : {}),
        ...(typeof newMedication!.form === 'string' ? { form: newMedication!.form } : {}),
      } }),
      times: draftValue.times,
      timezone: draftValue.timezone,
      startsOn: draftValue.startsOn,
      ...(typeof draftValue.endsOn === 'string' ? { endsOn: draftValue.endsOn } : {}),
    },
    confirmationToken: data.confirmationToken,
  }
}

function medicineScheduleMutationProposalFrom(data: Record<string, unknown>): MedicineScheduleMutationProposal | null {
  const action = data.action
  if (typeof action !== 'object' || action === null || typeof data.confirmationToken !== 'string') return null
  const actionValue = action as Record<string, unknown>
  if (typeof actionValue.id !== 'string' || typeof actionValue.expiresAt !== 'string') return null
  if (data.operation !== 'updateMedicineSchedule' && data.operation !== 'deleteMedicineSchedule') return null
  return { action: { id: actionValue.id, expiresAt: actionValue.expiresAt }, confirmationToken: data.confirmationToken, operation: data.operation }
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
      else if (event === 'medication_schedule_proposal') {
        const proposal = medicationScheduleProposalFrom(data)
        if (proposal) handlers.onMedicationScheduleProposal?.(proposal)
      }
      else if (event === 'medicine_schedule_mutation_proposal') {
        const proposal = medicineScheduleMutationProposalFrom(data)
        if (proposal) handlers.onMedicineScheduleMutationProposal?.(proposal)
      }
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
