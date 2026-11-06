import api from './api'

export type HealthMeasurementType =
  | 'BLOOD_PRESSURE'
  | 'BLOOD_GLUCOSE'
  | 'WEIGHT'
  | 'HEART_RATE'
  | 'TEMPERATURE'
  | 'CUSTOM'

export interface HealthMeasurement {
  id: string
  type: HealthMeasurementType
  label: string | null
  value: string
  secondaryValue: string | null
  unit: string
  measuredAt: string
  note: string | null
}

export interface HealthAppointment {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  timezone: string
  provider: string | null
  location: string | null
  note: string | null
}

export const healthAPI = {
  listMeasurements: () => api.get<{ measurements: HealthMeasurement[] }>('/health/measurements'),
  createMeasurement: (input: {
    type: HealthMeasurementType
    label?: string
    value: number
    secondaryValue?: number
    unit: string
    measuredAt: string
    note?: string
  }) => api.post<{ measurement: HealthMeasurement }>('/health/measurements', input),
  listAppointments: () => api.get<{ appointments: HealthAppointment[] }>('/health/appointments'),
  createAppointment: (input: {
    title: string
    startsAt: string
    endsAt?: string
    timezone: string
    provider?: string
    location?: string
    note?: string
  }) => api.post<{ appointment: HealthAppointment }>('/health/appointments', input),
}
