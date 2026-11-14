import { supabase } from './supabase'

export interface Employee {
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
  password: string
  phone: string
  birthDate: string
  city: string
  employeeCode: string
  role: 'doctor' | 'receptionist'
  specialties: string[]
  active: boolean
}
export interface CatalogItem { id: string; name: string }
export interface EmployeeCatalogs { specialties: CatalogItem[] }
export interface PendingEmployee { id: string; email: string; createdAt: string; payload: Omit<EmployeeInput, 'password' | 'requestId'> }

export async function employeeRequest<T>(action: string, data: object = {}): Promise<T> {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const result = await supabase.functions.invoke('manage-employees', { body: { action, ...data } })
  if (result.error) {
    let message = 'No se pudo completar la operación. Actualiza el directorio antes de reintentar.'
    try { const body = await result.error.context.json(); message = body.error || message } catch { /* Network or gateway failure. */ }
    throw new Error(message)
  }
  return result.data as T
}
