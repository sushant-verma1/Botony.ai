import api from './api'

export interface MedicationScheduleProposalResponse {
  kind: 'proposal'
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

export interface MedicationScheduleClarificationResponse {
  kind: 'clarification'
  question: string
}

export type MedicationScheduleDraftResponse = MedicationScheduleProposalResponse | MedicationScheduleClarificationResponse

export const agentAPI = {
  draftMedicationSchedule: (request: string) =>
    api.post<MedicationScheduleDraftResponse>('/agent/medication-schedule/draft', {
      request,
    }),

  confirmMedicationSchedule: (actionId: string, confirmationToken: string) =>
    api.post(`/agent/medication-schedule/${actionId}/confirm`, {
      confirmationToken,
    }),
  confirmMedicineScheduleMutation: (actionId: string, confirmationToken: string) =>
    api.post(`/agent/medicine-schedule-action/${actionId}/confirm`, {
      confirmationToken,
    }),
}
