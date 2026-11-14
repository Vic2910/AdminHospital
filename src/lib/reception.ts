import { supabase } from './supabase'
import { orderAttentionRequests, type RequestOrder } from './receptionOrdering'

export interface AttentionRequest {
  id: string; requester_id: string | null; patient_id: string | null; specialty_id: number
  preferred_period: string; reason: string; other_symptoms: string | null
  status: string; created_at: string; closure_reason: string | null
  applicant_data: Record<string, string | null>
}
export interface ReceptionPatient {
  id: string; profile_id: string | null; first_name: string; last_name: string
  email?: string | null; city?: string | null; patient_code: string; dui: string | null; birth_date: string | null; phone: string | null
}
export interface Slot {
  doctor_id: string; doctor_name: string; consulting_room_id: string; room_code: string
  starts_at: string; ends_at: string; slot_minutes: number
}
export interface ReceptionAppointment {
  id: string; request_id: string | null; patient_id: string; starts_at: string; ends_at: string; status: string
  consulting_room_id: string; doctor_id: string
  patient_name?: string; doctor_name?: string; room_code?: string
}
export interface DoctorDay {
  shifts: { starts_at: string; ends_at: string }[]
  consultations: { starts_at: string; ends_at: string; room_code: string; slot_minutes: number }[]
}
function client() { if (!supabase) throw new Error('Falta configurar Supabase.'); return supabase }
function rpcError(error: { code?: string; message: string }) {
  if (error.code === '23P01') return new Error('Este horario acaba de ocuparse. Consulta nuevamente las horas disponibles.')
  if (error.code === '23505') return new Error('Este registro ya existe. Actualiza la solicitud antes de continuar.')
  if (error.code === '42501') return new Error('Tu cuenta no tiene autorización para esta operación. Verifica que tu rol siga activo.')
  return new Error(error.message)
}
export async function receptionRpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args)
  if (error) throw rpcError(error)
  return data as T
}
export async function receptionRows<T>(table: string, columns: string): Promise<T[]> {
  const { data, error } = await client().from(table).select(columns)
  if (error) throw new Error(error.message)
  return data as T[]
}
export async function loadRequests(filter = '', offset = 0, order: RequestOrder = 'oldest') {
  const statuses = filter ? [filter] : ['pendiente', 'en_revision']
  const results = await Promise.all(statuses.map(status => client().from('appointment_requests').select('*').eq('status', status).order('created_at', { ascending: order === 'oldest' }).order('id', { ascending: true }).range(offset, offset + 99)))
  for (const result of results) if (result.error) throw new Error(result.error.message)
  return { items: orderAttentionRequests(results.flatMap(r => r.data ?? []) as AttentionRequest[], order), hasMore: results.some(r => r.data?.length === 100) }
}
export async function readAttentionCounts() {
  const states = ['pendiente', 'en_revision', 'agendada', 'rechazada', 'cancelada']
  const results = await Promise.allSettled(states.map(status => client().from('appointment_requests').select('id', { count: 'exact', head: true }).eq('status', status)))
  return Object.fromEntries(results.map((r, i) => [states[i], r.status === 'fulfilled' && !r.value.error ? r.value.count : null])) as Record<string, number | null>
}
export async function searchPatients(dui: string) {
  if (!/^\d{8}-\d$/.test(dui)) throw new Error('Escribe el DUI completo: 00000000-0.')
  const { data, error } = await client().from('patients').select('id,profile_id,first_name,last_name,patient_code,dui,birth_date,phone,email,city').eq('dui', dui).limit(10)
  if (error) throw new Error(error.message)
  return data as ReceptionPatient[]
}
export async function readAttentionRequest(id: string) {
  const { data, error } = await client().from('appointment_requests').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('La solicitud no está disponible para tu cuenta.')
  return data as AttentionRequest
}
export async function linkedPatient(request: AttentionRequest) {
  let query = client().from('patients').select('id,profile_id,first_name,last_name,patient_code,dui,birth_date,phone,email,city')
  if (request.patient_id) query = query.eq('id', request.patient_id)
  else if (request.requester_id) query = query.eq('profile_id', request.requester_id)
  else return null
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as ReceptionPatient | null
}
export async function recordCode(patientId: string) {
  const { data, error } = await client().from('medical_records').select('record_code').eq('patient_id', patientId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.record_code as string | undefined
}
export async function requestSymptoms(id: string) {
  const { data, error } = await client().from('appointment_request_symptoms').select('symptom_id,symptom_catalog(name)').eq('request_id', id)
  if (error) throw new Error(error.message)
  return (data ?? []).map(row => (row.symptom_catalog as unknown as { name: string } | null)?.name).filter(Boolean).join(', ')
}
export async function availableSlots(specialty: number, date: string, patientId: string | null) {
  const { data: doctors, error } = await client().from('doctor_specialties').select('doctor_id').eq('specialty_id', specialty)
  if (error) throw new Error(error.message)
  const ids = new Set((doctors ?? []).map(d => d.doctor_id))
  const from = `${date}T00:00:00-06:00`
  const until = new Date(new Date(from).getTime() + 86400000).toISOString()
  const slots = await receptionRpc<Slot[]>('get_medical_availability', { p_from: from, p_until: until })
  const { data: booked, error: bookedError } = await client().from('appointments').select('consulting_room_id,patient_id,starts_at,ends_at').lt('starts_at', until).gt('ends_at', from).in('status', ['programada', 'confirmada', 'en_atencion'])
  if (bookedError) throw new Error(bookedError.message)
  return slots.filter(s => ids.has(s.doctor_id) && !(booked ?? []).some(b => (b.consulting_room_id === s.consulting_room_id || b.patient_id === patientId) && new Date(b.starts_at) < new Date(s.ends_at) && new Date(b.ends_at) > new Date(s.starts_at)))
}
export async function loadAgenda(date: string) {
  return receptionRpc<ReceptionAppointment[]>('reception_agenda', { p_day: date })
}
export async function requestAppointment(requestId: string) {
  const { data, error } = await client().from('appointments').select('*').eq('request_id', requestId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(data.starts_at))
  const agenda = await loadAgenda(day)
  return agenda.find(a => a.id === data.id) ?? data as ReceptionAppointment
}
export const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const displayTime = (value: string) => new Date(value).toLocaleString('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'medium', timeStyle: 'short' })
export const stateLabels: Record<string, string> = { pendiente: 'Pendiente', en_revision: 'En revisión', agendada: 'Cita programada', rechazada: 'Rechazada', cancelada: 'Cancelada' }
export const periodLabels: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', indiferente: 'Indiferente' }
