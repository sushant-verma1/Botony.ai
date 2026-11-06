import api from './api'

export type CarePermission =
  | 'VIEW_MEDICATIONS'
  | 'VIEW_MEDICATION_SCHEDULES'
  | 'VIEW_HEALTH_MEASUREMENTS'
  | 'VIEW_APPOINTMENTS'
  | 'VIEW_REPORT_SUMMARIES'

export interface CareAccess {
  id: string
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED'
  permissions: CarePermission[]
  medicationReminderNotifications: boolean
  caregiver?: { id: string; firstName: string | null; lastName: string | null; email: string }
  recipient?: { id: string; firstName: string | null; lastName: string | null; email: string }
}

export const careCircleAPI = {
  list: () => api.get<{ asRecipient: CareAccess[]; asCaregiver: CareAccess[] }>('/care-circle'),
  invite: (email: string, permissions: CarePermission[]) =>
    api.post<{ access: CareAccess }>('/care-circle/invitations', { email, permissions }),
  respond: (id: string, accept: boolean) =>
    api.post<{ access: CareAccess }>(`/care-circle/invitations/${id}/respond`, { accept }),
  setMedicationReminderNotifications: (id: string, enabled: boolean) =>
    api.patch<{ access: CareAccess }>(`/care-circle/${id}/medication-reminders`, { enabled }),
  revoke: (id: string) => api.delete(`/care-circle/${id}`),
}
