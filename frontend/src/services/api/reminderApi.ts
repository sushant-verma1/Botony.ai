import api from './api'
import type {
  DoseAction,
  UnreadNotificationsResponse,
} from '../../types/reminder'

export const reminderAPI = {
  getUnreadNotifications: () =>
    api.get<UnreadNotificationsResponse>('/notifications/unread'),

  markNotificationRead: (notificationId: string) =>
    api.post(`/notifications/${notificationId}/read`),

  logDose: (reminderJobId: string, status: DoseAction) =>
    api.post(`/reminders/${reminderJobId}/dose-event`, { status }),

  savePushSubscription: (subscription: PushSubscriptionJSON) =>
    api.post('/notifications/push-subscriptions', subscription),
}
