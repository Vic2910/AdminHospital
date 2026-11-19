import { useId, useState } from 'react'
import { Icon } from './Icon'
import type { PlanningStaff } from '../lib/planning'
import { staffName } from '../lib/planning'

export function StaffScheduleSearch({ matches, query, onQuery, onSelect, selectedId, disabled, loading }: { matches: PlanningStaff[]; query: string; onQuery: (query: string) => void; onSelect: (id: string) => void; selectedId: string; disabled: boolean; loading: boolean }) {
  const id = useId()
  const [active, setActive] = useState(0)
  const [limit, setLimit] = useState(8)
  const results = matches.slice(0, limit)
  const selected = Math.max(0, Math.min(active, Math.max(0, results.length - 1)))
  return <div className="staff-direct-search"><label htmlFor={id}>Buscar y seleccionar empleado</label><div className="staff-search-input"><Icon name="search" size={19} /><input id={id} value={query} disabled={disabled} placeholder="Escribe un nombre, apellido o código…" autoComplete="off" aria-controls={`${id}-results`} aria-describedby={`${id}-help`} onChange={e => { setActive(0); setLimit(8); onQuery(e.target.value) }} onKeyDown={e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[selected] && !loading) { e.preventDefault(); onSelect(results[selected].id) }
  }} />{query && <button type="button" aria-label="Limpiar búsqueda" disabled={disabled} onClick={() => { onQuery(''); setActive(0); setLimit(8) }}>×</button>}</div><p id={`${id}-help`} className="staff-search-help">Selecciona un resultado o usa las flechas y Enter. Su horario aparecerá directamente.</p>
    <div id={`${id}-results`} className="staff-search-results" aria-label="Resultados de empleados" aria-busy={loading}>
      {loading ? <p role="status">Buscando empleados…</p> : !results.length ? <p role="status">No encontramos empleados con esos datos y ese cargo.</p> : results.map((person, i) => <button type="button" key={person.id} disabled={disabled} className={`${person.id === selectedId ? 'is-selected' : ''} ${i === selected ? 'is-keyboard-active' : ''}`} aria-pressed={person.id === selectedId} onClick={() => onSelect(person.id)} onMouseEnter={() => setActive(i)}><span className="staff-search-avatar"><Icon name="patient" size={20} /></span><span><strong>{staffName(person)}</strong><small>{person.employee_code} · {person.category === 'doctor' ? 'Doctor' : 'Recepcionista'}{!person.active ? ' · Inactivo' : ''}</small></span><Icon name={person.id === selectedId ? 'check' : 'arrowRight'} size={17} /></button>)}
    </div>{matches.length > results.length && !loading && <button type="button" className="staff-search-more" disabled={disabled} onClick={() => setLimit(i => i + 8)}>Mostrar más resultados ({matches.length - results.length})</button>}
  </div>
}
