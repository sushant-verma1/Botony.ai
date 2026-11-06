import api from './api'

export interface Medication {
  id: string
  name: string
  strength: string | null
  form: string | null
  instructions: string | null
  status: 'ACTIVE' | 'ARCHIVED'
  quantityOnHand: number | null
  refillAt: number | null
  schedules: Array<{ id: string; times: string[]; timezone: string; status: string }>
}

export const medicationAPI = {
  list: () => api.get<{ medications: Medication[] }>('/medications'),
  create: (input: { name: string; strength?: string; form?: string; instructions?: string }) =>
    api.post<{ medication: Medication }>('/medications', input),
  updateInventory: (id: string, quantityOnHand: number, refillAt?: number) =>
    api.patch<{ medication: Medication }>(`/medications/${id}/inventory`, { quantityOnHand, ...(refillAt !== undefined ? { refillAt } : {}) }),
}
