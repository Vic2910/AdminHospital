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
  const session = await supabase.auth.getSession()
  if (session.error) throw new Error(`No se pudo renovar la sesión ADMIN: ${session.error.message}`)
  if (!session.data.session) throw Object.assign(new Error('La sesión ADMIN falta o venció. Inicia sesión para registrar personal. [AUTH_SESSION_MISSING]'), { code: 'AUTH_SESSION_MISSING' })
  const result = await supabase.functions.invoke('manage-employees', { body: { action, ...data }, timeout: 45000 })
  if (result.error) {
    const status = result.error.context?.status
    let code = status ? `HTTP_${status}` : 'NETWORK_ERROR'
    let message = status ? `manage-employees rechazó la operación «${action}» (HTTP ${status}).` : 'No llegó respuesta de manage-employees. Comprueba la conexión; no se confirmó ningún resultado.'
    try {
      const body = await result.error.context.json()
      message = typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : message
      code = body.code || code
      if (body.code === 'OPERATION_NOT_SUPPORTED' || message === 'Operación inválida.') message = 'La versión conectada de manage-employees no admite esta acción. Es necesario actualizar el backend antes de continuar.'
      if (action === 'create' && message === 'Completa los campos requeridos con valores válidos.') message = 'manage-employees rechazó un campo requerido sin identificarlo. El formulario no debe enviar código ni contraseña: los asigna el servidor. La función publicada debe actualizarse para admitir este registro automático e indicar el campo rechazado.'
    } catch { /* Network or gateway failure. */ }
    if (status === 401) message = /jwt/i.test(message) ? 'El servicio rechazó el JWT de la sesión ADMIN. Inicia sesión nuevamente; si continúa, hay que revisar la configuración de autenticación de manage-employees.' : `La sesión ADMIN no fue aceptada. ${message}`
    if (status === 403) message = `El servicio no autorizó esta operación para tu cuenta. ${message}`
    throw Object.assign(new Error(`${message} [manage-employees/${action} · ${code}]`), { code, status })
  }
  if (result.data?.error) throw new Error(`manage-employees/${action}: ${typeof result.data.error === 'string' ? result.data.error : 'El servicio devolvió un error sin descripción.'}`)
  return result.data as T
}
