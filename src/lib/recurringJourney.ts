import { addDays } from './planningDates.ts'
import type { RecurringJourney } from './planning'

export interface JourneyValues {
  staff_id: string; weekdays: number[]; start_time: string; end_time: string; shift_type: string
  valid_from: string; valid_until: string | null; breaks: { start_time: string; end_time: string; reason: string }[]
  consultations: { start_time: string; end_time: string; slot_minutes: number }[]; room_id: string | null; specialty_id: number | null
}
export function clockParts(value: string) {
  const [hour = 8, minute = 0] = value.split(':').map(Number)
  return { hour: hour % 12 || 12, minute, period: hour < 12 ? 'AM' : 'PM' }
}
export function clockValue(hour: number, minute: number, period: string) { return `${String(hour % 12 + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }
export function journeyEnd(journey: RecurringJourney) {
  return [journey.valid_until, journey.closed_on ? addDays(journey.closed_on, -1) : null].filter((v): v is string => Boolean(v)).sort()[0] ?? null
}
export function journeyOverlaps(journey: RecurringJourney, from: string, until: string | null) {
  const end = journeyEnd(journey)
  return (!end || end >= journey.valid_from) && (!until || journey.valid_from <= until) && (!end || end >= from)
}
export function editableJourney(journeys: RecurringJourney[], staffId: string, today: string) {
  return journeys.filter(j => j.staff_id === staffId && j.active && !j.closed_on && (!j.valid_until || j.valid_until >= today))
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0]
}
export function validateJourney(values: JourneyValues, doctor: boolean) {
  if (!values.staff_id) return 'Selecciona al empleado.'
  if (!values.weekdays.length) return 'Selecciona al menos un día laboral.'
  if (!values.valid_from || (values.valid_until && values.valid_until < values.valid_from)) return 'Comprueba las fechas de vigencia.'
  if (!/^\d{2}:\d{2}$/.test(values.start_time) || !/^\d{2}:\d{2}$/.test(values.end_time) || values.start_time === values.end_time) return 'La entrada y la salida deben ser diferentes.'
  const minute = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m }
  const base = minute(values.start_time)
  const offset = (time: string) => minute(time) + (minute(time) < base ? 1440 : 0)
  const finish = offset(values.end_time)
  const check = (list: { start_time: string; end_time: string }[], name: string) => {
    const intervals = list.map(p => [offset(p.start_time), offset(p.end_time)]).sort((a, b) => a[0] - b[0])
    if (intervals.some(([a, b]) => !Number.isFinite(a + b) || a < base || b > finish || b <= a)) return `${name}: cada periodo debe estar dentro de la jornada.`
    if (intervals.some(([a], i) => i > 0 && a < intervals[i - 1][1])) return `${name}: los periodos no pueden superponerse.`
    return ''
  }
  const pauses = check(values.breaks, 'Descansos')
  if (pauses) return pauses
  if (values.breaks.some(b => !b.reason.trim())) return 'Escribe una descripción para cada descanso.'
  if (doctor) {
    if (!values.room_id || !values.specialty_id || !values.consultations.length) return 'Selecciona el consultorio, la especialidad y al menos un horario de atención.'
    const medical = check(values.consultations, 'Atención')
    if (medical) return medical
    if (values.consultations.some(c => !Number.isInteger(c.slot_minutes) || c.slot_minutes < 5 || c.slot_minutes > 180)) return 'Las citas deben durar entre 5 y 180 minutos.'
  } else if (values.room_id || values.specialty_id || values.consultations.length) return 'Recepción no utiliza consultorio ni atención médica.'
  return ''
}
