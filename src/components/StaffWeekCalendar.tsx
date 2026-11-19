import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'
import { addDays } from '../lib/planningDates'
import { employeeWeek, scheduleForDate, staffToday, staffWeek, schoolWeek, minuteLabel, formatStaffTime, type WeekBlock } from '../lib/staffWeek'
import { staffName, type PlanningData, type PlanningStaff } from '../lib/planning'
import type { ScheduleGroup } from '../lib/planningGroups'
import './StaffWeekCalendar.css'

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const labels = { shift: 'Tiempo laboral', consultation: 'Atención médica', break: 'Descanso', absence: 'Ausencia' }
const dateLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-SV', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
function blockTitle(b: WeekBlock, doctor: boolean) {
  return b.kind === 'break' ? b.reason?.replace(/^Descanso:\s*/, '') || 'Descanso' : b.kind === 'shift' ? doctor ? 'Tiempo laboral' : 'Turno de recepci\u00f3n' : labels[b.kind]
}
export function StaffWeekCalendar({ data, person, groups, week, onWeek, canEdit, busy, loading, onEdit, onEditComplete, onEditWeekday, onDeactivate, onCreate, onRefresh }: { data: PlanningData; person: PlanningStaff | undefined; groups: ScheduleGroup[]; week: string; onWeek: (week: string) => void; canEdit: boolean; busy: boolean; loading: boolean; onEdit: (group: ScheduleGroup, date: string) => void; onEditComplete?: () => void; onEditWeekday?: (date: string) => void; onDeactivate: (group: ScheduleGroup) => void; onCreate: (date: string) => void; onRefresh: () => void }) {
  const [inactive, setInactive] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const calendarId = useId()
  const calendar = employeeWeek(data, person?.id ?? '', week, groups, inactive)
  const timeline = schoolWeek(calendar)
  const today = staffToday()
  const hasRecurring = Boolean(person && (data.recurring_journeys ?? []).some(j => j.staff_id === person.id && j.active && !j.closed_on && (!j.valid_until || j.valid_until >= today)))
  const day = calendar.find(d => d.date === selected)
  useEffect(() => { setSelected(null) }, [person?.id, week])
  useEffect(() => { if (selected) dialog.current?.showModal() }, [selected])
  const dayGroups = [...new Map((day?.blocks ?? []).filter(b => b.group && b.originDate).map(b => [`${b.group!.key}-${b.originDate}`, { group: b.group!, date: b.originDate! }])).values()]
  return <section className="staff-week" aria-labelledby="staff-week-title"><header className="staff-week-heading"><div><span>LA SEMANA DE TU EQUIPO</span><h2 id="staff-week-title">Calendario semanal</h2><p>{dateLabel(week)} — {dateLabel(addDays(week, 6))} · Hora de El Salvador</p></div>{hasRecurring && <button type="button" disabled={!canEdit || loading || busy || !person?.active} onClick={onEditComplete}>Editar jornada completa</button>}<button type="button" disabled={loading || busy} onClick={onRefresh}><Icon name="calendar" size={17} />Actualizar</button></header>
    <div className="staff-week-toolbar"><div className="staff-week-navigation"><button type="button" disabled={busy} onClick={() => onWeek(addDays(week, -7))}>← Semana anterior</button><button type="button" disabled={busy} onClick={() => onWeek(staffWeek())}>Hoy</button><button type="button" disabled={busy} onClick={() => onWeek(addDays(week, 7))}>Semana siguiente →</button></div><label><input type="checkbox" checked={inactive} onChange={e => setInactive(e.target.checked)} />Mostrar programación desactivada</label></div>
    <div className="staff-week-legend">{Object.entries(labels).map(([kind, label]) => <span key={kind} className={`legend-${kind}`}><i />{label}</span>)}<span className="legend-empty"><i />Sin jornada</span></div>
    <nav className="staff-week-jump" aria-label="Ir directamente a un día">{calendar.map((d, i) => <a key={d.date} href={`#${calendarId}-${d.date}`} aria-current={d.date === today ? 'date' : undefined}><span>{days[i].slice(0, 3)}</span><strong>{d.date.slice(8)}</strong></a>)}</nav>
    {!person && <div className="staff-week-prompt"><Icon name="users" size={28} /><strong>Selecciona un empleado para consultar su semana</strong><p>Solo se mostrará la programación de la persona seleccionada.</p></div>}
    {loading && person && <p role="status" className="staff-week-loading">Consultando la semana seleccionada…</p>}
    <div className="staff-school-scroll" tabIndex={0} role="region" aria-label="Horario semanal por periodos">
      <table className="staff-school-table" aria-busy={loading}>
        <caption className="sr-only">Horario semanal por periodos de la persona seleccionada. Horas en formato AM y PM.</caption>
        <thead><tr><th scope="col" className="staff-school-hour-heading"><Icon name="clock" size={20}/><span>Horario</span><small>AM / PM</small></th>{timeline.days.map((d, i) => <th scope="col" key={d.date} className={d.date === today ? 'is-today' : ''}><button type="button" className="staff-school-day" title={dateLabel(d.date)} aria-label={dateLabel(d.date)} id={`${calendarId}-${d.date}`} aria-current={d.date === today ? 'date' : undefined} disabled={!person || loading || busy} onClick={() => setSelected(d.date)}><span>{days[i]}{d.date === today && <b>Hoy</b>}</span><strong>{d.date.slice(8)}</strong><small>{new Date(`${d.date}T12:00:00Z`).toLocaleDateString('es-SV', {timeZone:'UTC',month:'short',year:'numeric'})}</small></button>{hasRecurring && <button type="button" className="staff-school-edit-day" disabled={!canEdit || loading || busy || !person?.active} onClick={() => onEditWeekday?.(d.date)}><Icon name="pencil" size={13}/>Editar día</button>}</th>)}</tr></thead>
        <tbody>{!person || loading || !timeline.rows.length ? <tr><th scope="row" className="staff-school-hour">—</th>{calendar.map(d => <td key={d.date}><p className="staff-school-empty">{!person ? 'Selecciona un empleado' : loading ? 'Consultando…' : 'Sin programación'}</p></td>)}</tr> : timeline.rows.map((row, rowIndex) => <tr key={row.start}>
          <th scope="row" className="staff-school-hour"><time>{minuteLabel(row.start)}</time><span>—</span><time>{minuteLabel(row.end)}</time></th>
          {row.cells.map((block, dayIndex) => {
            const previous = timeline.rows[rowIndex - 1]
            if (previous && previous.end === row.start && previous.cells[dayIndex]?.id === block?.id) return null
            let span = 1
            while (rowIndex + span < timeline.rows.length && timeline.rows[rowIndex + span - 1].end === timeline.rows[rowIndex + span].start && timeline.rows[rowIndex + span].cells[dayIndex]?.id === block?.id) span++
            const date = calendar[dayIndex].date
            return <td key={date} rowSpan={span} className={`${block ? `school-${block.kind}` : 'school-empty'} ${date === today ? 'is-today' : ''}`}>{block ? <button type="button" className={`staff-school-activity block-${block.kind}`} disabled={busy} onClick={() => setSelected(date)}><span className="staff-school-block-title"><Icon name={block.kind === 'break' ? 'clock' : block.kind === 'absence' ? 'activity' : block.kind === 'consultation' ? 'patient' : 'users'} size={16}/><strong>{blockTitle(block, person.category === 'doctor')}</strong></span>{block.kind === 'consultation' && <><small className="staff-school-room">Consultorio {block.room}</small><small className="staff-school-slot">Citas de {block.minutes} min</small></>}{block.kind === 'shift' && person.category === 'doctor' && <small>Sin atención asignada</small>}{block.kind === 'absence' && block.reason && <small>{block.reason}</small>}</button> : <span className="staff-school-empty">Sin programación</span>}</td>
          })}
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">Gestionar</th>{calendar.map(d => <td key={d.date}><button type="button" className="staff-school-edit" disabled={!person || loading || busy} onClick={() => setSelected(d.date)}><Icon name="eye" size={14}/>{inactive && d.blocks.some(b => !b.active) ? 'Ver historial' : 'Ver detalle'}</button></td>)}</tr></tfoot>
      </table>
    </div>
    {person?.category === 'doctor' && <p className="staff-time-note">Los bloques de atención muestran los periodos y consultorios guardados. El resto de la jornada aparece como tiempo laboral sin atención asignada.</p>}
    {selected && person && <dialog ref={dialog} className="staff-day-dialog" aria-labelledby="staff-day-title" onCancel={e => { e.preventDefault(); setSelected(null) }}><header><div><span>PROGRAMACIÓN DEL DÍA</span><h3 id="staff-day-title">{dateLabel(selected)}</h3><p>{staffName(person)} · {person.employee_code}</p></div><button type="button" aria-label="Cerrar programación del día" onClick={() => setSelected(null)}>×</button></header><div className="staff-day-content"><dl className="staff-day-timeline-list">{timeline.days.find(d => d.date === selected)?.segments.map(s => <div key={`${s.block.id}-${s.start}`} className={`detail-${s.block.kind}`}><dt><strong>{blockTitle(s.block, person.category === 'doctor')}</strong><time>{minuteLabel(s.start)} – {minuteLabel(s.end)}</time></dt><dd>{s.block.kind === 'consultation' ? `Consultorio ${s.block.room} · Citas de ${s.block.minutes} min` : s.block.kind === 'absence' ? s.block.reason : s.block.kind === 'shift' && person.category === 'doctor' ? 'Sin atenci\u00f3n asignada' : ''}</dd></div>)}</dl>{!day?.blocks.length && <p>No hay programación guardada para este día.</p>}{dayGroups.map(({ group, date }) => <div className="staff-day-action" key={`${group.key}-${date}`}><div><strong>{group.kind === 'shift' ? 'Jornada, atención y descansos' : group.kind === 'absence' ? 'Ausencia / descanso' : 'Atención médica'}</strong><p>{formatStaffTime(group.start)} – {formatStaffTime(group.end)}{date !== selected ? ` · Inicia el ${dateLabel(date)}` : ''}</p>{!group.active && <small>Programación desactivada</small>}</div>{group.active && <div><button disabled={!canEdit || busy} onClick={() => { setSelected(null); onEdit(group, date) }}>{group.recurringId ? 'Editar día' : 'Editar esta fecha'}</button><button disabled={!canEdit || busy} onClick={() => { onDeactivate(scheduleForDate(group, date)); setSelected(null) }}>Desactivar</button></div>}</div>)}</div><footer><button type="button" onClick={() => setSelected(null)}>Cerrar</button><button type="button" className="staff-week-primary" disabled={!canEdit || busy || !person.active} onClick={() => { if ((data.recurring_journeys ?? []).some(j => j.staff_id === person?.id && j.active && !j.closed_on && (!j.valid_until || j.valid_until >= today))) onEditComplete?.(); else onCreate(selected); setSelected(null) }}>{(data.recurring_journeys ?? []).some(j => j.staff_id === person?.id && j.active && !j.closed_on && (!j.valid_until || j.valid_until >= today)) ? 'Editar jornada completa' : 'Asignar jornada'}</button></footer></dialog>}
  </section>
}
