import { supabase } from './supabase'
import { atMidnight, addDays } from './planningDates'

// Release control only; database roles and RLS remain the authorization boundary.
export const planningWritesEnabled = import.meta.env.VITE_STAFF_PLANNING_ENABLED === 'true'

export interface PlanningStaff { id: string; profile_id: string | null; employee_code: string; category: string; active: boolean; first_name: string | null; last_name: string | null; roles: string[] }
export interface ConsultingRoom { id: string; code: string; floor_id: number | null; active: boolean; version: string }
export interface Floor { id: number; name: string }
export interface PlanningPeriod { id: string; starts_at: string; ends_at: string; version: string }
export interface WorkShift extends PlanningPeriod { staff_id: string; shift_type: string; status: string }
export interface StaffAbsence extends PlanningPeriod { staff_id: string; reason: string | null; active: boolean }
export interface Consultation extends PlanningPeriod { doctor_id: string; consulting_room_id: string; active: boolean; slot_minutes: number }
export interface PlanningData { ready: boolean; staff: PlanningStaff[]; rooms: ConsultingRoom[]; floors: Floor[]; shifts: WorkShift[]; absences: StaffAbsence[]; consultations: Consultation[]; saved_shifts?: WorkShift[]; saved_consultations?: Consultation[]; saved_absences?: StaffAbsence[] }
export interface AvailabilitySlot { doctor_id: string; doctor_name: string; consulting_room_id: string; room_code: string; starts_at: string; ends_at: string; slot_minutes: number }
export type PlanningKind = 'shift' | 'absence' | 'consultation' | 'room'
export const staffName = (staff: PlanningStaff) => `${staff.first_name ?? ''} ${staff.last_name ?? ''}`.trim() || staff.employee_code
export const categoryName = (category: string) => ({ doctor: 'Doctor', recepcionista: 'Recepcionista', enfermera: 'Enfermería' })[category] ?? category

function connection() { if (!supabase) throw new Error('Falta configurar Supabase.'); return supabase }
function message(error: { code?: string; message: string }): Error {
  if (error.code === '23P01') return new Error('Este horario se solapa con otro turno, ausencia o consultorio. Actualiza y selecciona otro intervalo.')
  if (error.code === '23505') return new Error('El código de consultorio ya existe.')
  if (error.code === '42501') return new Error('Tu cuenta no tiene permisos administrativos para esta operación.')
  return new Error(error.message)
}
export async function readPlanning(week: string): Promise<PlanningData> {
  const client = connection()
  const { data, error } = await client.rpc('read_staff_planning', { p_from: atMidnight(week), p_until: atMidnight(addDays(week, 7)) })
  if (!error) return data as PlanningData
  if (error.code !== 'PGRST202' && error.code !== '42883') throw message(error)
  // Read only the verified existing schema while the SQL proposal awaits approval.
  const results = await Promise.all([
    client.from('staff').select('id,profile_id,employee_code,category,active,profiles(first_name,last_name)').order('employee_code'),
    client.from('consulting_rooms').select('id,code,floor_id,active').order('code'),
    client.from('hospital_floors').select('id,name').order('id'),
  ])
  for (const result of results) if (result.error) throw message(result.error)
  const staff = (results[0].data ?? []).map(row => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return { ...row, first_name: profile?.first_name ?? null, last_name: profile?.last_name ?? null, roles: [] }
  })
  return { ready: false, staff, rooms: (results[1].data ?? []).map(r => ({ ...r, version: '' })), floors: results[2].data ?? [], shifts: [], absences: [], consultations: [] }
}
export async function savePlanning(kind: PlanningKind, values: Record<string, unknown>, id?: string, version?: string): Promise<void> {
  if (!planningWritesEnabled) throw new Error('La configuración de horarios todavía no está habilitada.')
  const { error } = await connection().rpc('save_staff_planning', { p_kind: kind, p_values: values, p_id: id ?? null, p_version: version ?? null })
  if (error) throw message(error)
}
export async function readAvailability(week: string, doctor?: string, room?: string): Promise<AvailabilitySlot[]> {
  const { data, error } = await connection().rpc('get_medical_availability', { p_from: atMidnight(week), p_until: atMidnight(addDays(week, 7)), p_doctor: doctor || null, p_room: room || null })
  if (error) throw message(error)
  return data as AvailabilitySlot[]
}

export async function savePlanningSet(role: 'doctor' | 'recepcionista', kind: string, values: Record<string, unknown>, originals: Array<{kind: string; id: string; version: string}>): Promise<number> {
  if (!planningWritesEnabled) throw new Error('La configuración de horarios todavía no está habilitada.')
  const { data, error } = await connection().rpc('save_staff_planning_set', { p_role: role, p_kind: kind, p_values: values, p_originals: originals })
  if (error) throw message(error)
  return data.count
}
export async function deleteConsultingRoom(room: ConsultingRoom): Promise<void> {
  const { error } = await connection().rpc('delete_staff_consulting_room', { p_id: room.id, p_version: room.version })
  if (error) throw message(error)
}
