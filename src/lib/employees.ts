import { supabase } from './supabase'

export interface Employee {
  impact?: { pendingAppointments: number; assignedPatients: number; openEncounters: number }
  id: string
  profileId: string
  employeeCode: string
  active: boolean
  staffVersion: string
  personVersion: string
  givenNames: string
  familyNames: string
  birthDate: string | null
  city: string | null
  phone: string | null
  email: string
  role: 'doctor' | 'receptionist'
  specialties: string[]
}
export interface EmployeeInput {
  requestId: string
  givenNames: string
  familyNames: string
  email: string
  phone: string
  birthDate: string
  city: string
  employeeCode: string
  role: 'doctor' | 'receptionist'
  specialties: string[]
  active: boolean
}
export interface CatalogItem { id: string; name: string }
export interface EmployeeContract { version: string; actions: readonly string[]; features: readonly string[] }
export interface EmployeeCatalogs { specialties: CatalogItem[]; contract?: EmployeeContract }
export interface EmployeeMutationResult { success: boolean; employee?: Employee; staffId?: string; employeeCode?: string; credentials?: { email: string; password: string } }
export interface PendingEmployee { id: string; email: string; createdAt: string; payload: Omit<EmployeeInput, 'requestId'> }

export async function employeeRequest<T>(action: string, data: object = {}): Promise<T> {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const result = await supabase.functions.invoke('manage-employees', { body: { action, ...data } })
  if (result.error) {
    let message = 'No se pudo completar la operación. Actualiza el directorio antes de reintentar.'
    try {
      const body = await result.error.context.json()
      message = body.error || message
      if (body.code === 'OPERATION_NOT_SUPPORTED' || message === 'Operación inválida.') message = 'La versión conectada de manage-employees no admite esta acción. Es necesario actualizar el backend antes de continuar.'
    } catch { /* Network or gateway failure. */ }
    throw new Error(message)
  }
  return result.data as T
}
