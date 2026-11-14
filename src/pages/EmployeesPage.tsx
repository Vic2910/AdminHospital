import { useEffect, useState, type FormEvent } from 'react'
import { Panel } from '../components/ui'
import { Icon } from '../components/Icon'
import { hospitalDate } from '../lib/planningDates'
import './AdminExperience.css'
import { employeeRequest, type Employee, type EmployeeInput, type EmployeeCatalogs, type PendingEmployee } from '../lib/employees'

const inputClass = 'mt-1.5 w-full rounded-md border border-slate-200 bg-[#f8f6f7] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#870b30]/25'
const buttonClass = 'rounded-md bg-[#870b30] px-3 py-2 text-xs font-medium text-white hover:bg-[#6f0827] disabled:cursor-not-allowed disabled:opacity-50'
const secondaryClass = 'rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50'
const emptyForm = (): EmployeeInput => ({ requestId: crypto.randomUUID(), givenNames: '', familyNames: '', email: '', password: '', phone: '', birthDate: '', city: '', employeeCode: '', role: 'doctor', specialties: [], active: true })
const roleName = (role: string) => role === 'doctor' ? 'Doctor' : 'Recepcionista'

export function EmployeesPage({ onSchedule }: { onSchedule?: (staffId?: string) => void }) {
  const [savedStaffId, setSavedStaffId] = useState<string | undefined>()
  const [catalogs, setCatalogs] = useState<EmployeeCatalogs>({ specialties: [] })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [pending, setPending] = useState<PendingEmployee[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [today] = useState(() => hospitalDate())
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<EmployeeInput | null>(null)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [detail, setDetail] = useState<Employee | null>(null)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      Promise.all([
        employeeRequest<{ employees: Employee[]; total: number }>('list', { query: query.trim(), role, status, offset }),
        employeeRequest<EmployeeCatalogs>('catalogs'),
        employeeRequest<PendingEmployee[]>('pending'),
      ]).then(([directory, options, unfinished]) => {
        if (!active) return
        setEmployees(directory.employees); setTotal(directory.total); setCatalogs(options); setPending(unfinished); setLoadError('')
      }).catch((err: unknown) => {
        if (active) { setEmployees([]); setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el personal.') }
      }).finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, role, status, offset, revision])

  function change<K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) {
    setForm(current => current ? { ...current, [key]: value } : current)
  }
  function openRegistration() { setForm(emptyForm()); setEditing(null); setDetail(null); setNotice(''); setError('') }
  function openEdit(employee: Employee) {
    setEditing(employee); setDetail(null); setError(''); setNotice('')
    setForm({ ...emptyForm(), ...employee, city: employee.city ?? '', phone: employee.phone ?? '', birthDate: employee.birthDate ?? '' })
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form || busy) return
    if (!form.givenNames.trim() || !form.familyNames.trim() || !form.employeeCode.trim() || (form.role === 'doctor' && !form.specialties.length)) { setError('Completa nombre, apellido, código y, para doctores, especialidades.'); return }
    if (!window.confirm(`${editing ? '¿Guardar los cambios de' : '¿Registrar a'} ${form.givenNames.trim()} ${form.familyNames.trim()} como ${roleName(form.role).toLocaleLowerCase()}?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (editing) {
        await employeeRequest('update', { id: editing.id, staffVersion: editing.staffVersion, personVersion: editing.personVersion, values: { given_names: form.givenNames.trim(), family_names: form.familyNames.trim(), birth_date: form.birthDate || null, employee_code: form.employeeCode.trim(), phone: form.phone.trim(), city: form.city.trim(), specialties: form.specialties } })
      } else if (pending.some(p => p.id === form.requestId)) {
        await employeeRequest('recover', { requestId: form.requestId, values: form })
      } else {
        await employeeRequest('create', form)
      }
      setNotice(editing ? 'Datos del empleado actualizados.' : 'Empleado registrado: cuenta, perfil, rol y datos hospitalarios completados.')
      setSavedStaffId(editing?.id)
      if (!editing) {
        try {
          const directory = await employeeRequest<{ employees: Employee[] }>('list', { query: form.employeeCode })
          setSavedStaffId(directory.employees.find(e => e.employeeCode === form.employeeCode.trim())?.id)
        } catch { /* The successful registration remains confirmed; scheduling can select the employee. */ }
      }
      setForm(null); setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el empleado.')
      // Passwords remain only in memory and are cleared even on failure.
      setForm(current => current ? { ...current, password: '' } : current)
    } finally { setBusy(false); setRevision(r => r + 1) }
  }
  async function run(action: 'state' | 'recover' | 'detail', data: object) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await employeeRequest<Employee>(action, data)
      if (action === 'detail') { setDetail(result); setForm(null); setEditing(null) }
      else { setNotice(action === 'recover' ? 'Alta completada correctamente.' : 'Estado del empleado actualizado.'); setRevision(r => r + 1) }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo completar la operación.') }
    finally { setBusy(false) }
  }

  return <div className="space-y-4">
    <div className="experience-heading rounded-xl border border-slate-200 bg-white p-5">
      <div><span className="experience-eyebrow">EQUIPO DEL HOSPITAL</span><h2>Personal hospitalario</h2><p>Registra al personal, revisa sus datos y organiza sus jornadas desde un solo lugar.</p></div>
      <button className={buttonClass} disabled={busy || loading} onClick={openRegistration} type="button">+ Registrar empleado</button>
    </div>
    {error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800" role="alert">{error}</p>}
    {loadError && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800" role="alert">{loadError}</p>}
    {notice && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800" role="status">{notice}{onSchedule && <button type="button" className={`${secondaryClass} ml-3`} onClick={() => onSchedule(savedStaffId)}>Asignar horario laboral</button>}</p>}
    {form && <Panel title={editing ? 'Editar empleado' : 'Registrar personal hospitalario'} subtitle="Los campos marcados con * son obligatorios.">
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy} className="employee-form-section"><legend>1. Cargo y rol</legend><p>Selecciona el tipo de empleado. Los campos profesionales se adaptan al cargo.</p><div className="employee-form-grid">
          <label className="text-xs font-medium text-slate-700">Cargo *<select className={inputClass} value={form.role} disabled={Boolean(editing)} onChange={e => { change('role', e.target.value as EmployeeInput['role']); change('specialties', []) }}><option value="doctor">Doctor</option><option value="receptionist">Recepcionista</option></select>{editing && <small className="mt-2 block text-slate-400">El rol no se cambia desde la edición de datos.</small>}</label>
          {!editing && <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" className="accent-[#870b30]" checked={form.active} onChange={e => change('active', e.target.checked)} /> Empleado activo desde su registro</label>}
        </div></fieldset>
        <fieldset disabled={busy} className="employee-form-section"><legend>2. Datos personales</legend><p>Escribe los datos del empleado como aparecen en su documento.</p><div className="employee-form-grid">
          <label className="text-xs font-medium text-slate-700">Nombre *<input className={inputClass} autoComplete="given-name" maxLength={100} required value={form.givenNames} onChange={e => change('givenNames', e.target.value)} /></label>
          <label className="text-xs font-medium text-slate-700">Apellido *<input className={inputClass} autoComplete="family-name" maxLength={100} required value={form.familyNames} onChange={e => change('familyNames', e.target.value)} /></label>
          <label className="text-xs font-medium text-slate-700">Fecha de nacimiento<input className={inputClass} type="date" max={today} value={form.birthDate} onChange={e => change('birthDate', e.target.value)} /></label>
          <label className="text-xs font-medium text-slate-700">Ciudad<input className={inputClass} maxLength={120} value={form.city} onChange={e => change('city', e.target.value)} /></label>
        </div></fieldset>
        <fieldset disabled={busy} className="employee-form-section"><legend>3. Contacto y acceso</legend><p>El correo se utiliza para iniciar sesión en la aplicación autorizada del empleado.</p><div className="employee-form-grid">
          <label className="text-xs font-medium text-slate-700">Correo electrónico *<input className={inputClass} type="email" autoComplete="off" maxLength={254} required disabled={Boolean(editing) || pending.some(p => p.id === form.requestId)} value={form.email} onChange={e => change('email', e.target.value)} /></label>
          <label className="text-xs font-medium text-slate-700">Teléfono *<input className={inputClass} type="tel" autoComplete="tel" minLength={7} maxLength={30} required value={form.phone} onChange={e => change('phone', e.target.value)} /></label>
          {!editing && <label className="text-xs font-medium text-slate-700">Contraseña inicial *<input className={inputClass} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={form.password} onChange={e => change('password', e.target.value)} /><span className="mt-1 block text-[10px] text-slate-500">12–128 caracteres con mayúscula, minúscula, número y símbolo.</span></label>}
        </div></fieldset>
        <fieldset disabled={busy} className="employee-form-section"><legend>4. Información profesional{form.role === 'doctor' ? ' y especialidades' : ''}</legend><p>Asigna un código único para identificar al empleado dentro del hospital.</p><div className="employee-form-grid"><label className="text-xs font-medium text-slate-700">Código único de empleado *<input className={inputClass} autoComplete="off" maxLength={80} required value={form.employeeCode} onChange={e => change('employeeCode', e.target.value)} /></label></div>
          {form.role === 'doctor' && <div className="mt-5"><p className="mb-3 text-xs font-semibold text-slate-600">Especialidades * · selecciona una o varias</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{catalogs.specialties.map(sp => <label key={sp.id} className="employee-specialty"><input type="checkbox" className="accent-[#870b30]" checked={form.specialties.includes(sp.id)} onChange={e => change('specialties', e.target.checked ? [...form.specialties, sp.id] : form.specialties.filter(id => id !== sp.id))} />{sp.name}</label>)}</div>{!catalogs.specialties.length && <p className="mt-3 text-xs text-amber-700">No hay especialidades disponibles. Actualiza el directorio antes de registrar al doctor.</p>}</div>}
        </fieldset>
        <section className="employee-review"><h3 className="flex items-center gap-2"><Icon name="check" size={18} />5. Revisa antes de guardar</h3><dl>{[['Empleado', `${form.givenNames} ${form.familyNames}`.trim()], ['Cargo', roleName(form.role)], ['Código', form.employeeCode], ['Correo', form.email], ['Teléfono', form.phone], ...(form.role === 'doctor' ? [['Especialidades', catalogs.specialties.filter(s => form.specialties.includes(s.id)).map(s => s.name).join(', ')]] : [])].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Pendiente de completar'}</dd></div>)}</dl><p>Comprueba que los datos sean correctos. Al guardar se te pedirá confirmar {editing ? 'los cambios' : 'el registro'}.</p></section>
        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5"><button className={`${buttonClass} px-5 py-3`} disabled={busy} type="submit">{busy ? 'Guardando, espera un momento…' : editing ? 'Confirmar y guardar cambios' : 'Confirmar y registrar empleado'}</button><button className={`${secondaryClass} px-5 py-3`} disabled={busy} type="button" onClick={() => { setForm(null); setEditing(null) }}>Cancelar</button></div>
      </form>
    </Panel>}
    {detail && <Panel title={`${detail.givenNames} ${detail.familyNames}`} subtitle={roleName(detail.role)}><dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">{[['Código',detail.employeeCode],['Correo',detail.email],['Teléfono',detail.phone],['Fecha de nacimiento',detail.birthDate],['Ciudad',detail.city],['Estado',detail.active ? 'Activo' : 'Inactivo'],['Especialidades',catalogs.specialties.filter(s => detail.specialties.includes(s.id)).map(s => s.name).join(', ')]].map(([label,value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="mt-1 text-slate-700">{value || '—'}</dd></div>)}</dl><button className={`${secondaryClass} mt-4`} onClick={() => setDetail(null)} type="button">Cerrar detalles</button></Panel>}
    <Panel title="Directorio de personal" subtitle={`${total} empleados · 50 por página`}>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_180px]">
        <input aria-label="Buscar empleados" className={inputClass} placeholder="Nombre, correo o código..." value={query} onChange={e => { setQuery(e.target.value); setOffset(0) }} />
        <select aria-label="Filtrar por rol" className={inputClass} value={role} onChange={e => { setRole(e.target.value); setOffset(0) }}><option value="">Todos los roles</option><option value="doctor">Doctores</option><option value="receptionist">Recepcionistas</option></select>
        <select aria-label="Filtrar por estado" className={inputClass} value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select>
      </div>
      {loading ? <p className="py-8 text-center text-xs text-slate-500" role="status">Cargando personal...</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-slate-400">{['Empleado','Código','Rol','Estado','Acciones'].map(h => <th className="pb-3 font-medium" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-50">{employees.map(employee => <tr key={employee.id}><td className="py-3"><p className="font-semibold text-slate-700">{employee.givenNames} {employee.familyNames}</p><p className="mt-1 text-[11px] text-slate-400">{employee.email}</p></td><td>{employee.employeeCode}</td><td>{roleName(employee.role)}</td><td><span className={`rounded-full px-2 py-1 text-[10px] ${employee.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{employee.active ? 'Activo' : 'Inactivo'}</span></td><td><div className="flex gap-2"><button className={secondaryClass} disabled={busy} onClick={() => void run('detail', { id: employee.id })} type="button">Detalles</button><button className={secondaryClass} disabled={busy} onClick={() => openEdit(employee)} type="button">Editar</button>{onSchedule && <button className={secondaryClass} disabled={busy} onClick={() => onSchedule(employee.id)} type="button">Horarios</button>}<button className={secondaryClass} disabled={busy} onClick={() => void run('state', { id: employee.id, active: !employee.active, staffVersion: employee.staffVersion })} type="button">{employee.active ? 'Desactivar' : 'Activar'}</button></div></td></tr>)}{!employees.length && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No se encontraron empleados.</td></tr>}</tbody></table></div>}
      <div className="mt-4 flex items-center justify-between"><button className={secondaryClass} disabled={loading || busy || offset === 0} onClick={() => setOffset(o => Math.max(0,o-50))} type="button">Anterior</button><button className={secondaryClass} disabled={loading || busy} onClick={() => setRevision(r => r+1)} type="button">Actualizar</button><button className={secondaryClass} disabled={loading || busy || offset+50 >= total} onClick={() => setOffset(o => o+50)} type="button">Siguiente</button></div>
    </Panel>
    {pending.length > 0 && <Panel title="Altas pendientes de completar" subtitle="Estas solicitudes todavía no se confirmaron. Las cuentas pendientes no tienen permisos hospitalarios."><ul className="space-y-3">{pending.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 pb-2 text-xs"><span className="text-slate-600">{p.email}</span><div className="flex gap-2"><button className={secondaryClass} disabled={busy} onClick={() => { setEditing(null); setForm({ ...p.payload, requestId: p.id, password: '' }); setNotice('Corrige los datos y guarda para reanudar el alta sin crear otra cuenta.'); setError('') }} type="button">Revisar solicitud</button><button className={buttonClass} disabled={busy} onClick={() => void run('recover',{ requestId:p.id })} type="button">Reanudar alta</button></div></li>)}</ul></Panel>}
  </div>
}
