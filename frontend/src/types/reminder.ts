export interface InAppReminderNotification {
  id: string
  type: 'MEDICATION_REMINDER' | 'CAREGIVER_MEDICATION_REMINDER' | 'REFILL_ALERT'
  title: string
  body: string
  createdAt: string
  reminderJobId: string | null
}

export interface UnreadNotificationsResponse {
  notifications: InAppReminderNotification[]
}

export type DoseAction = 'TAKEN' | 'SKIPPED'
