import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Panel } from '../components/ui'
import { CompleteStaffSchedule } from '../components/CompleteStaffSchedule'
import './AdminExperience.css'
import { addDays, clock, hospitalDate, monday, overlapsDay, weekday } from '../lib/planningDates'
import { deleteConsultingRoom, planningWritesEnabled, readPlanning, savePlanning, savePlanningSet, staffName, type ConsultingRoom, type PlanningData } from '../lib/planning'
import { savedScheduleGroups, scheduleDates, toggleDay, type BreakInput, type MedicalInput, type OriginalPeriod, type ScheduleGroup, type StaffRole } from '../lib/planningGroups'

const input = 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#870b30] focus:ring-2 focus:ring-[#870b30]/10'
const primary = 'rounded-lg bg-[#870b30] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6f0827] disabled:cursor-not-allowed disabled:opacity-40'
const secondary = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40'
const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const order = [1, 2, 3, 4, 5, 6, 0]
const empty: PlanningData = { ready: false, staff: [], rooms: [], floors: [], shifts: [], absences: [], consultations: [] }
interface Draft {
  role: StaffRole; kind: ScheduleGroup['kind']; staffId: string; from: string; until: string; days: number[]
  exactDates: string[] | null; start: string; end: string; shiftType: string; reason: string
  consultations: MedicalInput[]; breaks: BreakInput[]; originals: OriginalPeriod[]
}
const labelClass = 'block text-xs font-medium text-slate-600'
const dateLabel = (date: string) => `${weekdays[weekday(date)]} ${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
const hours = (start: string, end: string) => `${start}–${end}${end < start ? ' (+1 día)' : ''}`

export function StaffShiftsPage({ initialStaffId = '' }: { initialStaffId?: string }) {
  const [section, setSection] = useState<StaffRole | 'rooms'>('doctor')
  const [week, setWeek] = useState(() => monday(hospitalDate()))
  const [data, setData] = useState<PlanningData>(empty)
  const [employee, setEmployee] = useState(initialStaffId)
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [scheduleView, setScheduleView] = useState<'complete' | 'week'>('complete')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [roomDraft, setRoomDraft] = useState<{ id?: string; version?: string; code: string; floor: string; active: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const appliedInitial = useRef(false)
  const formAnchor = useRef<HTMLDivElement>(null)
  const canWrite = data.ready && planningWritesEnabled
  useEffect(() => {
    let current = true
    async function load() {
      setLoading(true)
      try {
        const result = await readPlanning(week)
        if (!current) return
        setData(result)
        if (!appliedInitial.current) {
          const person = result.staff.find(s => s.id === initialStaffId)
          if (person && (person.category === 'doctor' || person.category === 'recepcionista') && person.roles?.includes(person.category)) setSection(person.category)
          else setEmployee('')
          appliedInitial.current = true
        }
      } catch (err) { if (current) setError(err instanceof Error ? err.message : 'No se pudo cargar la programación.') }
      finally { if (current) setLoading(false) }
    }
    void load()
    return () => { current = false }
  }, [week, revision, initialStaffId])
  const people = data.staff.filter(s => s.category === section && s.roles?.includes(section))
  const visiblePeople = people.filter(s => (!employee || s.id === employee) && `${staffName(s)} ${s.employee_code}`.toLowerCase().includes(query.toLowerCase()))
  const groups = useMemo(() => savedScheduleGroups(data), [data])
  const visibleGroups = groups.filter(g => visiblePeople.some(s => s.id === g.staffId) && (g.active || showInactive))
  const allConsultations = data.saved_consultations ?? data.consultations
  const roomCode = (id: string) => data.rooms.find(r => r.id === id)?.code ?? 'Consultorio'
  let dates: string[] = [], previewError = ''
  if (draft) {
    try { dates = draft.exactDates ?? scheduleDates(draft.from, draft.until, draft.days) }
    catch (err) { previewError = err instanceof Error ? err.message : 'Selecciona fechas y días.' }
  }
  function switchSection(next: typeof section) { setSection(next); setEmployee(''); setDraft(null); setRoomDraft(null); setError(''); setNotice('') }
  function startForm(kind: Draft['kind'] = 'shift') {
    if (section === 'rooms') return
    const from = week < hospitalDate() ? hospitalDate() : week
    setDraft({ role: section, kind, staffId: people.find(p => p.id === employee && p.active)?.id ?? '', from, until: '', days: [weekday(from)], exactDates: null,
      start: '08:00', end: '16:00', shiftType: 'ordinario', reason: 'Ausencia', consultations: section === 'doctor' && kind === 'shift' ? [{ start: '09:00', end: '12:00', roomId: '', minutes: 30 }] : [], breaks: [], originals: [] })
    setError(''); setNotice('')
    window.requestAnimationFrame(() => formAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  function edit(group: ScheduleGroup, onlyDate?: string) {
    if (section === 'rooms') return
    const chosen = onlyDate ? [onlyDate] : [...group.dates]
    setDraft({ role: section, kind: group.kind, staffId: group.staffId, from: chosen[0], until: chosen.at(-1)!, days: [...new Set(chosen.map(weekday))], exactDates: chosen,
      start: group.start, end: group.end, shiftType: group.shiftType, reason: group.reason || 'Ausencia', consultations: group.consultations.map(c => ({ ...c })), breaks: group.breaks.map(b => ({ ...b })), originals: group.originals.filter(o => chosen.includes(o.date)) })
    setError(''); setNotice('')
    window.requestAnimationFrame(() => formAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(p => p ? { ...p, [key]: value, ...(['from', 'until'].includes(key) ? { exactDates: null } : {}) } : p) }
  function updateMedical(index: number, values: Partial<MedicalInput>) { setDraft(p => p ? { ...p, consultations: p.consultations.map((c, i) => i === index ? { ...c, ...values } : c) } : p) }
  function updateBreak(index: number, values: Partial<BreakInput>) { setDraft(p => p ? { ...p, breaks: p.breaks.map((b, i) => i === index ? { ...b, ...values } : b) } : p) }
  function occupied(roomId: string, medical: MedicalInput): number {
    if (!draft) return 0
    const ignored = new Set(draft.originals.filter(o => o.kind === 'consultation').map(o => o.id))
    return dates.filter(date => {
      const next = draft.end < draft.start && medical.start < draft.start ? addDays(date, 1) : date
      const start = new Date(`${next}T${medical.start}:00-06:00`).getTime()
      const end = new Date(`${medical.end < medical.start ? addDays(next, 1) : next}T${medical.end}:00-06:00`).getTime()
      return allConsultations.some(c => c.active && c.consulting_room_id === roomId && !ignored.has(c.id) && new Date(c.starts_at).getTime() < end && new Date(c.ends_at).getTime() > start)
    }).length
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || busy || !canWrite || previewError) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (!people.some(p => p.id === draft.staffId && p.active && p.roles.includes(draft.role))) throw new Error('Selecciona un empleado con el rol activo de esta sección.')
      const values: Record<string, unknown> = { staff_id: draft.staffId, dates, start_time: draft.start, end_time: draft.end, active: true, shift_type: draft.shiftType, reason: draft.reason }
      if (draft.kind === 'shift') {
        values.breaks = draft.breaks.map(b => ({ start_time: b.start, end_time: b.end, reason: b.reason }))
        if (draft.role === 'doctor') values.consultations = draft.consultations.map(c => ({ start_time: c.start, end_time: c.end, room_id: c.roomId, slot_minutes: c.minutes }))
      }
      if (draft.kind === 'consultation') {
        const medical = draft.consultations[0]
        if (!medical) throw new Error('Falta el horario médico.')
        Object.assign(values, { start_time: medical.start, end_time: medical.end, room_id: medical.roomId, slot_minutes: medical.minutes })
      }
      await savePlanningSet(draft.role, draft.kind, values, draft.originals)
      setNotice(`Guardadas ${dates.length} fechas: ${order.filter(d => dates.some(date => weekday(date) === d)).map(d => weekdays[d]).join(', ')}. Jornada, atención y descansos se guardaron juntos.`)
      setWeek(monday(dates[0])); setDraft(null); setRevision(r => r + 1)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.') }
    finally { setBusy(false) }
  }
  async function deactivate(group: ScheduleGroup) {
    if (section === 'rooms' || busy || !canWrite) return
    if (!window.confirm(`¿Desactivar las ${group.dates.length} fechas de este grupo? Se conservará el historial y se rechazarán conflictos con citas.`)) return
    setBusy(true); setError(''); setNotice('')
    try { await savePlanningSet(section, group.kind, { staff_id: group.staffId, active: false }, group.originals); setNotice('Programación desactivada; historial conservado.'); setDraft(null); setRevision(r => r + 1) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo desactivar.') }
    finally { setBusy(false) }
  }
  async function saveRoom(event: FormEvent) {
    event.preventDefault()
    if (!roomDraft || busy) return
    setBusy(true); setError('')
    try { await savePlanning('room', { code: roomDraft.code.trim(), floor_id: roomDraft.floor || null, active: roomDraft.active }, roomDraft.id, roomDraft.version); setRoomDraft(null); setNotice('Consultorio guardado.'); setRevision(r => r + 1) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el consultorio.') }
    finally { setBusy(false) }
  }
  async function removeRoom(room: ConsultingRoom) {
    if (!window.confirm(`¿Eliminar ${room.code}? Solo se permite si nunca tuvo asignaciones ni citas.`)) return
    setBusy(true); setError('')
    try { await deleteConsultingRoom(room); setNotice('Consultorio sin uso eliminado.'); setRevision(r => r + 1) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar.') }
    finally { setBusy(false) }
  }
  const calendarRows = [
    ...(data.saved_shifts ?? data.shifts).map(r => ({ ...r, staffId: r.staff_id, active: r.status !== 'cancelado', title: section === 'doctor' ? 'Jornada laboral' : 'Turno', color: 'bg-emerald-50 text-emerald-800' })),
    ...(data.saved_consultations ?? data.consultations).map(r => ({ ...r, staffId: r.doctor_id, title: `Atención · ${roomCode(r.consulting_room_id)}`, color: 'bg-sky-50 text-sky-800' })),
    ...(data.saved_absences ?? data.absences).map(r => ({ ...r, staffId: r.staff_id, title: r.reason?.startsWith('Descanso:') ? 'Descanso' : 'Ausencia', color: 'bg-amber-50 text-amber-800' })),
  ].filter(r => r.active)
  return <div className="space-y-5">
    <nav className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2" aria-label="Secciones de programación">
      {(['doctor', 'recepcionista', 'rooms'] as const).map((role, i) => <button type="button" key={role} aria-pressed={section === role} className={`${section === role ? primary : secondary} flex-1 whitespace-nowrap`} onClick={() => switchSection(role)}>{['Horarios de doctores', 'Turnos de recepcionistas', 'Consultorios'][i]}</button>)}
    </nav>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {!canWrite && !loading && <p className="rounded-lg bg-amber-50 p-3 text-sm">La edición todavía no está habilitada.</p>}
    {section === 'rooms' ? <>
      <div className="flex items-center justify-between"><p className="text-sm text-slate-500">{data.rooms.length} consultorios · {data.rooms.filter(r => r.active).length} activos</p><button className={primary} disabled={!canWrite || busy} onClick={() => { setRoomDraft({ code: '', floor: '', active: true }); setError('') }}>+ Crear consultorio</button></div>
      {roomDraft && <Panel title={roomDraft.id ? 'Editar consultorio' : 'Crear consultorio'}><form onSubmit={saveRoom} className="space-y-4"><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-3"><label className={labelClass}>Código único<input className={input} required maxLength={40} value={roomDraft.code} onChange={e => setRoomDraft(p => p ? { ...p, code: e.target.value } : p)} /></label><label className={labelClass}>Piso<select className={input} value={roomDraft.floor} onChange={e => setRoomDraft(p => p ? { ...p, floor: e.target.value } : p)}><option value="">Sin asignar</option>{data.floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roomDraft.active} onChange={e => setRoomDraft(p => p ? { ...p, active: e.target.checked } : p)} />Activo</label></fieldset><button className={primary} disabled={busy}>Guardar consultorio</button><button type="button" className={`${secondary} ml-2`} disabled={busy} onClick={() => setRoomDraft(null)}>Cancelar</button></form></Panel>}
      <p className="text-xs leading-relaxed text-slate-500">Vino: asignado a un doctor · Gris claro: sin asignar · Gris oscuro: inactivo.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.rooms.map(room => {
        const now = Date.now()
        const assignments = allConsultations.filter(c => c.active && c.consulting_room_id === room.id && new Date(c.ends_at).getTime() > now).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
        const assigned = assignments.length > 0
        const doctorHours = [...new Map(assignments.map(c => [`${c.doctor_id}-${clock(c.starts_at)}-${clock(c.ends_at)}`, c])).values()]
        const time = (value: string) => new Date(value).toLocaleTimeString('es-SV', { timeZone: 'America/El_Salvador', hour: '2-digit', minute: '2-digit' })
        return <article className={`flex flex-col rounded-xl border p-4 ${!room.active ? 'border-slate-300 bg-slate-200 text-slate-500' : assigned ? 'border-[#870b30] bg-[#870b30] text-white shadow-sm' : 'border-[#dde1e7] bg-[#f0f2f5] text-slate-800'}`} key={room.id}>
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-base">{room.code}</strong><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${!room.active ? 'bg-slate-300/60 text-slate-600' : assigned ? 'bg-white/15 text-white' : 'bg-white/80 text-slate-500'}`}>{!room.active ? 'Inactivo' : assigned ? 'Asignado' : 'Sin asignar'}</span></div>
          <p className={`mt-2 text-xs ${room.active && assigned ? 'text-white/70' : 'text-slate-500'}`}>{data.floors.find(f => f.id === room.floor_id)?.name ?? 'Piso sin asignar'}</p>
          <div className="my-4 flex-1 space-y-2 text-xs">
            {assigned ? doctorHours.map(c => {
              const doctor = data.staff.find(s => s.id === c.doctor_id)
              return <div key={`${c.doctor_id}-${clock(c.starts_at)}-${clock(c.ends_at)}`}><p className="font-semibold">Asignado al Dr. {doctor ? staffName(doctor) : 'registrado'}</p><p className={`mt-1 ${room.active ? 'text-white/80' : 'text-slate-500'}`}>De {time(c.starts_at)} a {time(c.ends_at)}</p></div>
            }) : <p className="text-slate-500">{room.active ? 'Sin doctor asignado.' : 'Consultorio inactivo.'}</p>}
          </div>
          <div className="flex flex-wrap gap-2"><button className={secondary} disabled={!canWrite || busy} onClick={() => { setRoomDraft({ id: room.id, version: room.version, code: room.code, floor: room.floor_id?.toString() ?? '', active: room.active }); setError('') }}>Editar / desactivar</button><button className={`${secondary} text-rose-700`} disabled={!canWrite || busy} onClick={() => void removeRoom(room)}>Eliminar</button></div>
        </article>
      })}</div>
    </> : <>
      <section className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-800">{section === 'doctor' ? 'Jornada laboral y atención médica' : 'Turnos laborales de recepción'}</h2><p className="mt-1 text-xs text-slate-500">{section === 'doctor' ? 'La atención de citas se configura dentro de la jornada, con consultorio y descansos.' : 'Solo recepción: fechas, días, horarios y descansos, incluidos turnos nocturnos.'}</p></div><div className="flex gap-2"><button className={secondary} disabled={!canWrite || busy || loading} onClick={() => startForm('absence')}>Registrar ausencia</button><button className={primary} disabled={!canWrite || busy || loading} onClick={() => startForm()}>+ {section === 'doctor' ? 'Crear jornada' : 'Crear turno'}</button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className={labelClass}>{section === 'doctor' ? 'Doctor' : 'Recepcionista'}<select className={input} value={employee} onChange={e => setEmployee(e.target.value)}><option value="">Todos</option>{people.map(p => <option key={p.id} value={p.id}>{staffName(p)} · {p.employee_code}</option>)}</select></label><label className={labelClass}>Buscar empleado<input className={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre o código" /></label></div></section>
      <div ref={formAnchor} className="scroll-mt-6">{draft && <Panel title={`${draft.originals.length ? 'Editar' : 'Crear'} ${draft.kind === 'absence' ? 'ausencia' : draft.kind === 'consultation' ? 'atención médica' : draft.role === 'doctor' ? 'jornada de doctor' : 'turno de recepcionista'}`} subtitle="Se guardan todas las fechas de la vista previa en una única operación.">
        <form onSubmit={save} className="space-y-5"><fieldset disabled={busy} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3"><label className={labelClass}>Empleado *<select className={input} required disabled={draft.originals.length > 0} value={draft.staffId} onChange={e => change('staffId', e.target.value)}><option value="">Selecciona {draft.role === 'doctor' ? 'un doctor' : 'una recepcionista'}</option>{people.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{staffName(p)} · {p.employee_code}</option>)}</select></label><label className={labelClass}>Fecha de inicio *<input type="date" className={input} required value={draft.from} onChange={e => change('from', e.target.value)} /></label><label className={labelClass}>Fecha final de programación (opcional)<input type="date" className={input} min={draft.from} max={draft.from ? addDays(draft.from, 366) : undefined} value={draft.until} onChange={e => change('until', e.target.value)} /><span className="mt-1 block text-[11px] text-slate-400">Vacía: una semana completa desde el inicio.</span></label></div>
          <fieldset className="rounded-xl bg-slate-50 p-4"><legend className="px-1 text-xs font-semibold text-slate-700">Selecciona los días que quieras *</legend><div className="flex flex-wrap gap-2">{order.map(day => <label key={day} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${draft.days.includes(day) ? 'border-[#870b30] bg-rose-50 text-[#870b30]' : 'border-slate-200 bg-white text-slate-600'}`}><input type="checkbox" checked={draft.days.includes(day)} className="accent-[#870b30]" onChange={() => setDraft(p => p ? { ...p, days: toggleDay(p.days, day), exactDates: null } : p)} />{weekdays[day]}</label>)}</div><p className="mt-3 text-xs text-slate-500">Puedes elegir cualquier combinación. Nunca se descartan días marcados por quedar fuera del rango: se mostrará un aviso.</p></fieldset>
          {draft.kind !== 'consultation' && <section className="rounded-xl border border-emerald-200 p-4"><h3 className="mb-3 text-sm font-semibold text-emerald-900">{draft.kind === 'absence' ? 'Periodo de ausencia' : '1. Jornada laboral'}</h3><div className="grid gap-3 sm:grid-cols-3"><label className={labelClass}>Entrada *<input className={input} type="time" required value={draft.start} onChange={e => change('start', e.target.value)} /></label><label className={labelClass}>Salida *<input className={input} type="time" required value={draft.end} onChange={e => change('end', e.target.value)} />{draft.end < draft.start && <span className="text-xs text-amber-700">Salida al día siguiente.</span>}</label>{draft.kind === 'absence' ? <label className={labelClass}>Motivo *<input className={input} required maxLength={480} value={draft.reason} onChange={e => change('reason', e.target.value)} /></label> : <label className={labelClass}>Tipo de jornada<select className={input} value={draft.shiftType} onChange={e => change('shiftType', e.target.value)}><option value="ordinario">Ordinaria</option><option value="guardia">Guardia</option></select></label>}</div></section>}
          {draft.role === 'doctor' && draft.kind !== 'absence' && <section className="space-y-3 rounded-xl border border-sky-200 p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-sky-900">2. Atención de citas dentro de la jornada</h3>{draft.kind === 'shift' && <button className={secondary} type="button" disabled={draft.consultations.length >= 4} onClick={() => change('consultations', [...draft.consultations, { start: draft.start, end: draft.end, roomId: '', minutes: 30 }])}>+ Periodo de atención</button>}</div>{!draft.consultations.length && <p className="text-xs text-slate-500">Se guardará únicamente la jornada laboral. Puedes añadir atención médica.</p>}{draft.consultations.map((c, i) => <div key={i} className="grid items-end gap-3 rounded-lg bg-sky-50/50 p-3 sm:grid-cols-2 lg:grid-cols-5"><label className={labelClass}>Desde<input className={input} type="time" required value={c.start} onChange={e => updateMedical(i, { start: e.target.value })} /></label><label className={labelClass}>Hasta<input className={input} type="time" required value={c.end} onChange={e => updateMedical(i, { end: e.target.value })} /></label><label className={labelClass}>Consultorio disponible *<select className={input} required value={c.roomId} onChange={e => updateMedical(i, { roomId: e.target.value })}><option value="">Selecciona</option>{data.rooms.filter(r => r.active || r.id === c.roomId).map(r => { const count = occupied(r.id, c); return <option key={r.id} value={r.id} disabled={!r.active || count > 0}>{r.code}{count ? ` · ocupado en ${count} fecha(s)` : !r.active ? ' · inactivo' : ''}</option> })}</select></label><label className={labelClass}>Minutos por cita<input className={input} required type="number" min={5} max={180} value={c.minutes} onChange={e => updateMedical(i, { minutes: Number(e.target.value) })} /></label>{draft.kind === 'shift' && <button className={secondary} type="button" onClick={() => change('consultations', draft.consultations.filter((_, n) => n !== i))}>Quitar periodo</button>}</div>)}</section>}
          {draft.kind === 'shift' && <section className="space-y-3 rounded-xl border border-amber-200 p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-amber-900">{draft.role === 'doctor' ? '3.' : '2.'} Descansos dentro del turno</h3><button className={secondary} type="button" disabled={draft.breaks.length >= 4} onClick={() => change('breaks', [...draft.breaks, { start: '12:00', end: '12:30', reason: 'Descanso laboral' }])}>+ Descanso</button></div>{!draft.breaks.length && <p className="text-xs text-slate-500">Sin descansos configurados.</p>}{draft.breaks.map((b, i) => <div key={i} className="grid items-end gap-3 sm:grid-cols-4"><label className={labelClass}>Desde<input className={input} type="time" required value={b.start} onChange={e => updateBreak(i, { start: e.target.value })} /></label><label className={labelClass}>Hasta<input className={input} type="time" required value={b.end} onChange={e => updateBreak(i, { end: e.target.value })} /></label><label className={labelClass}>Descripción<input className={input} maxLength={450} value={b.reason} onChange={e => updateBreak(i, { reason: e.target.value })} /></label><button type="button" className={secondary} onClick={() => change('breaks', draft.breaks.filter((_, n) => n !== i))}>Quitar descanso</button></div>)}</section>}
        </fieldset>
        <section className="rounded-xl border-2 border-[#870b30]/20 bg-[#fffafb] p-4"><h3 className="font-semibold text-[#870b30]">Vista previa completa antes de guardar</h3>{previewError ? <p className="mt-2 text-sm text-rose-700" role="alert">{previewError}</p> : <><p className="my-2 text-sm">{dates.length} fechas · {order.filter(d => dates.some(date => weekday(date) === d)).map(d => weekdays[d]).join(', ')}</p><p className="text-xs text-slate-500">{draft.exactDates ? 'Se conservan exactamente las fechas guardadas. Cambiar días o fechas recalcula la selección.' : `Programación desde ${draft.from} hasta ${draft.until || addDays(draft.from, 6)}.`}</p><div className="mt-3 max-h-60 overflow-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead><tr className="border-b"><th className="py-2">Fecha</th><th>Jornada / periodo</th>{draft.role === 'doctor' && <th>Atención / consultorio</th>}<th>Descansos</th></tr></thead><tbody>{dates.map(date => <tr key={date} className="border-b border-rose-100"><td className="py-2">{dateLabel(date)}</td><td>{hours(draft.start, draft.end)}</td>{draft.role === 'doctor' && <td>{draft.consultations.map((c, i) => <p key={i}>{hours(c.start, c.end)} · {c.roomId ? roomCode(c.roomId) : 'Falta consultorio'} · {c.minutes} min</p>)}</td>}<td>{draft.breaks.map((b, i) => <p key={i}>{hours(b.start, b.end)}</p>)}</td></tr>)}</tbody></table></div></>}</section>
        <div className="flex gap-2"><button className={primary} disabled={busy || !canWrite || !!previewError || !dates.length}>{busy ? 'Guardando todas las fechas…' : `Guardar ${dates.length} fechas`}</button><button type="button" className={secondary} disabled={busy} onClick={() => setDraft(null)}>Cancelar</button></div></form>
      </Panel>}</div>
      {loading ? <p role="status" className="p-6 text-sm text-slate-500">Cargando horarios guardados…</p> : <>
        <div className="schedule-view-switch" aria-label="Vista de horarios"><button className={scheduleView === 'complete' ? 'is-active' : ''} aria-pressed={scheduleView === 'complete'} onClick={() => setScheduleView('complete')}>Toda la programación</button><button className={scheduleView === 'week' ? 'is-active' : ''} aria-pressed={scheduleView === 'week'} onClick={() => setScheduleView('week')}>Calendario semanal</button><button className="ml-auto" disabled={loading || busy} onClick={() => setRevision(r => r + 1)}>Actualizar horarios</button></div>
        <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" className="accent-[#870b30]" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />Incluir programación desactivada</label>
        {scheduleView === 'complete' && <CompleteStaffSchedule people={visiblePeople} groups={visibleGroups} doctor={section === 'doctor'} canEdit={canWrite && !busy} onEdit={edit} roomCode={roomCode} />}
        {scheduleView === 'week' && <Panel title="Calendario semanal" subtitle="Verde: jornada laboral · Azul: atención médica · Ámbar: descanso o ausencia. Hora de Guatemala."><div className="mb-4 flex flex-wrap items-center gap-2"><button className={secondary} onClick={() => setWeek(w => addDays(w, -7))}>← Anterior</button><input aria-label="Semana del calendario" type="date" className="rounded-lg border p-2 text-sm" value={week} onChange={e => { if (e.target.value) setWeek(monday(e.target.value)) }} /><button className={secondary} onClick={() => setWeek(w => addDays(w, 7))}>Siguiente →</button><button className={secondary} onClick={() => setWeek(monday(hospitalDate()))}>Esta semana</button><button className={`${secondary} ml-auto`} onClick={() => setRevision(r => r + 1)}>Recargar datos</button></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] table-fixed text-left text-xs"><thead><tr className="border-b"><th className="w-40 py-3">Empleado</th>{Array.from({ length: 7 }, (_, i) => addDays(week, i)).map(day => <th key={day} className="p-2 font-medium">{weekdays[weekday(day)]}<span className="block text-slate-400">{day.slice(8)}/{day.slice(5, 7)}</span></th>)}</tr></thead><tbody>{visiblePeople.map(person => <tr key={person.id} className="border-b"><th className="p-2 align-top font-medium">{staffName(person)}<span className="mt-1 block text-[10px] text-slate-400">{person.employee_code}</span></th>{Array.from({ length: 7 }, (_, i) => addDays(week, i)).map(day => <td key={day} className="border-l border-slate-50 p-1 align-top">{calendarRows.filter(r => r.staffId === person.id && overlapsDay(r.starts_at, r.ends_at, day)).map(row => <div key={row.id} className={`mb-1 rounded-lg p-2 text-[10px] ${row.color}`}><strong className="block">{row.title}</strong>{hours(clock(row.starts_at), clock(row.ends_at))}</div>)}</td>)}</tr>)}</tbody></table></div>{!visiblePeople.length && <p className="p-5 text-center text-sm text-slate-400">No hay empleados con el rol real de esta sección.</p>}</Panel>}
        <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-[#870b30]">Administrar grupos de fechas · editar o desactivar</summary><div className="mt-4"><Panel title={section === 'doctor' ? 'Jornadas y atención médica guardadas' : 'Turnos de recepcionistas guardados'} subtitle="Lista completa de fechas guardadas, independiente de la semana del calendario. Los horarios iguales se agrupan para facilitar la edición."><label className="mb-4 flex items-center gap-2 text-xs"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />Mostrar historial desactivado</label><div className="space-y-4">{visibleGroups.map(group => <article key={group.key} className={`rounded-xl border border-slate-200 p-4 ${!group.active ? 'bg-slate-50 opacity-70' : ''}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{staffName(data.staff.find(s => s.id === group.staffId)!)}</h3><p className="mt-1 text-sm text-emerald-800">{group.kind === 'shift' ? section === 'doctor' ? 'Jornada laboral' : 'Turno de recepción' : group.kind === 'consultation' ? 'Atención médica' : 'Ausencia'}: {hours(group.start, group.end)}{!group.active ? ' · Desactivado' : ''}</p><p className="mt-1 text-xs text-slate-500">{group.dates.length} fechas · {order.filter(day => group.dates.some(date => weekday(date) === day)).map(day => weekdays[day]).join(', ')}</p><p className="mt-1 text-xs text-slate-500">Desde {group.dates[0]} hasta {group.dates.at(-1)}</p>{group.consultations.map((c, i) => <p key={i} className="mt-2 text-xs text-sky-800">Atención: {hours(c.start, c.end)} · {roomCode(c.roomId)} · citas de {c.minutes} min</p>)}{group.breaks.map((b, i) => <p key={i} className="mt-1 text-xs text-amber-800">Descanso: {hours(b.start, b.end)} · {b.reason}</p>)}{group.kind === 'absence' && <p className="mt-1 text-xs text-amber-800">{group.reason}</p>}</div>{group.active && <div className="flex gap-2"><button className={secondary} disabled={!canWrite || busy} onClick={() => edit(group)}>Editar fechas del grupo</button><button className={`${secondary} text-rose-700`} disabled={!canWrite || busy} onClick={() => void deactivate(group)}>Desactivar</button></div>}</div><details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-[#870b30]">Ver todas las fechas guardadas ({group.dates.length})</summary><div className="mt-2 grid max-h-64 gap-2 overflow-auto sm:grid-cols-2 xl:grid-cols-3">{group.dates.map(date => <div key={date} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs"><span>{dateLabel(date)}</span>{group.active && <button className="text-[#870b30] underline" disabled={busy || !canWrite} onClick={() => edit(group, date)}>Editar fecha</button>}</div>)}</div></details></article>)}{!visibleGroups.length && <p className="p-6 text-center text-sm text-slate-400">Sin programación guardada para estos filtros.</p>}</div></Panel></div></details>
      </>}
    </>}
  </div>
}
