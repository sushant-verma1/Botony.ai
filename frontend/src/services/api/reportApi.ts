import api from './api'

export interface LabObservation {
  id: string
  name: string
  value: string
  unit: string | null
  referenceRange: string | null
  flag: 'NORMAL' | 'HIGH' | 'LOW' | 'UNKNOWN'
  sourcePage: number | null
}

export interface MedicalReport {
  id: string
  status: 'PROCESSING' | 'READY' | 'FAILED'
  explanation: string | null
  questions: string[] | null
  uncertainties: string[] | null
  observations: LabObservation[]
}

export const reportAPI = {
  analyze: (attachmentId: string) =>
    api.post<{ report: MedicalReport }>(`/reports/${attachmentId}/analyze`),
}
