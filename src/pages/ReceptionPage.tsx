import { useEffect, useRef, useState } from 'react'
import { WalkinReception } from './WalkinReception'
import { IdentityCheck, PatientCard } from '../components/ReceptionIdentity'
import { HospitalizationPage } from './HospitalizationPage'
import { Icon } from '../components/Icon'
import './ReceptionPage.css'
import { availableSlots, displayTime, linkedPatient, loadAgenda, loadRequests, localDate, periodLabels, receptionRows, receptionRpc, recordCode, requestSymptoms, requestAppointment, searchPatients, stateLabels, readAttentionCounts, readAttentionRequest } from '../lib/reception'
import { orderAttentionRequests, type RequestOrder } from '../lib/receptionOrdering'
import type { AttentionRequest, DoctorDay, ReceptionAppointment, ReceptionPatient, Slot } from '../lib/reception'

const button = 'rounded-lg bg-[#800b2c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50'
const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm'
const panel = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm'
const message = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación. Intenta nuevamente.'

export type ReceptionTab = 'Atención presencial' | 'Solicitudes de atención' | 'Pacientes y expedientes' | 'Agenda de citas' | 'Hospitalización'

export function ReceptionPage({ initialTab = 'Solicitudes de atención', initialRequestId = null, initialHospitalAdmissionId = null }: { initialTab?: ReceptionTab; initialRequestId?: string | null; initialHospitalAdmissionId?: string | null }) {
  const [tab, setTab] = useState<ReceptionTab>(initialTab)
  const [requests, setRequests] = useState<AttentionRequest[]>([])
  const [specialties, setSpecialties] = useState<{ id: number; name: string }[]>([])
  const [selected, setSelected] = useState<AttentionRequest | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<RequestOrder>('oldest')
  const [offset, setOffset] = useState(0)
  const [counts, setCounts] = useState<Record<string, number | null>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => { let active = true; if (initialRequestId) readAttentionRequest(initialRequestId).then(r => { if (active) setSelected(r) }).catch(e => { if (active) setError(message(e)) }); return () => { active = false } }, [initialRequestId])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    setRequests([]); setMore(false); setOffset(0)
    Promise.all([loadRequests(filter, 0, sort), receptionRows<{ id: number; name: string }>('specialties', 'id,name'), readAttentionCounts()]).then(([rows, catalog, totals]) => {
      if (active) { setRequests(rows.items); setSpecialties(catalog); setMore(rows.hasMore); setCounts(totals) }
    }).catch(e => { if (active) setError(message(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh, filter, sort])
  const specialtyName = (id: number) => specialties.find(s => s.id === id)?.name ?? 'Sin especialidad disponible'
  async function nextPage() {
    setLoading(true)
    try { const next = offset + 100; const rows = await loadRequests(filter, next, sort); setRequests(old => orderAttentionRequests([...new Map([...old, ...rows.items].map(r => [r.id, r])).values()], sort)); setMore(rows.hasMore); setOffset(next) }
    catch (e) { setError(message(e)) } finally { setLoading(false) }
  }
  const filtered = requests.filter(r => `${Object.values(r.applicant_data ?? {}).join(' ')} ${specialtyName(r.specialty_id)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <div className="reception space-y-5">
    <div className="reception-intro"><div><span className="reception-eyebrow">ATENCIÓN AL PACIENTE</span><h2>Todo listo para recibir y orientar.</h2><p>Consulta solicitudes, encuentra expedientes y organiza las próximas citas.</p></div><span className="reception-intro-icon"><Icon name="patient" size={30} /></span></div>
    <nav aria-label="Apartados de recepción" className="reception-tabs">{(['Solicitudes de atención', 'Pacientes y expedientes', 'Agenda de citas', 'Hospitalización', 'Atención presencial'] as const).map((t, i) => <button key={t} aria-current={tab === t ? 'page' : undefined} className={tab === t ? 'is-active' : ''} onClick={() => { setTab(t); setSelected(null) }}><Icon name={i === 0 ? 'file' : i === 1 ? 'patient' : i === 2 ? 'calendar' : i === 3 ? 'bed' : 'patient'} size={20} /><span><strong>{t}</strong><small>{['Revisar y dar seguimiento', 'Consultar por documento', 'Ver las citas del día', 'Ingresos, camas y salidas', 'Registro, citas e ingreso'][i]}</small></span></button>)}</nav>
    {tab === 'Solicitudes de atención' && (selected ? <RequestDetail key={selected.id} request={selected} specialty={specialtyName(selected.specialty_id)} onBack={() => { setSelected(null); setRefresh(v => v + 1) }} /> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Object.entries(stateLabels).map(([value, label]) => <button key={value} disabled={loading} onClick={() => setFilter(value)} className={`${panel} text-left ${filter === value ? 'ring-2 ring-[#800b2c]' : ''}`}><span className="text-xs text-slate-500">{label}</span><strong className="mt-1 block text-2xl text-[#800b2c]">{counts[value] ?? '—'}</strong></button>)}</div>
      <section className={panel}>
        <div className="reception-section-heading"><div><h3>Bandeja de solicitudes</h3><p>Selecciona una solicitud para revisar sus datos y continuar la atención.</p></div><span className="reception-count">{filtered.length} solicitudes</span></div>
        <div className="mb-4 flex flex-wrap gap-3"><input aria-label="Buscar solicitudes" placeholder="Buscar en solicitudes cargadas" className={`${input} sm:max-w-sm`} value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Estado de solicitud" disabled={loading} className={`${input} sm:max-w-xs`} value={filter} onChange={e => setFilter(e.target.value)}><option value="">Por atender: pendientes y en revisión</option>{Object.entries(stateLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><select aria-label="Orden de solicitudes por fecha" disabled={loading} className={`${input} sm:max-w-xs`} value={sort} onChange={e => setSort(e.target.value as RequestOrder)}><option value="oldest">Más antiguas primero</option><option value="newest">Más recientes primero</option></select><button className={button} disabled={loading} onClick={() => setRefresh(v => v + 1)}>Actualizar</button></div>
        {!filter && <p className="mb-4 text-xs leading-relaxed text-slate-500">Primero las pendientes y después las que están en revisión. Las programadas, rechazadas y canceladas se consultan en su filtro.</p>}
        {error && <p role="alert" className="mb-3 text-rose-800">{error}</p>}
        {loading && <p role="status">Cargando solicitudes…</p>}
        {!loading && filtered.length === 0 && <p className="py-6 text-slate-500">No hay solicitudes para estos filtros.</p>}
        <div className="grid gap-3 lg:grid-cols-2">{filtered.map(r => <button key={r.id} onClick={() => setSelected(r)} className={`reception-request request-${r.status} rounded-xl border p-4 text-left focus:ring-2 focus:ring-[#800b2c]`}>
          <div className="flex flex-wrap justify-between gap-2"><strong>{r.applicant_data?.first_name} {r.applicant_data?.last_name}</strong><span className="reception-state-label rounded-full px-3 py-1 text-xs">{stateLabels[r.status] ?? r.status}</span></div>
          <p className="mt-2 text-sm">{specialtyName(r.specialty_id)} · {periodLabels[r.preferred_period] ?? 'Sin preferencia registrada'}</p><p className="mt-2 text-xs text-slate-500">{displayTime(r.created_at)}</p><div className="reception-request-footer"><span><Icon name="file" size={15} />{r.patient_id ? 'Paciente vinculado' : 'Consultar expediente'}</span><strong>{r.status === 'en_revision' ? 'Continuar atención' : 'Ver solicitud'} →</strong></div>
        </button>)}</div>
        <p className="mt-4 text-xs text-slate-500">{requests.length} solicitudes cargadas en esta vista. Los indicadores muestran el total por estado; la búsqueda filtra las solicitudes cargadas.</p>{more && <button className={`${button} mt-3`} disabled={loading} onClick={() => void nextPage()}>Cargar más solicitudes</button>}
      </section>
    </>)}
    {tab === 'Atención presencial' && <WalkinReception specialties={specialties} />}
    {tab === 'Pacientes y expedientes' && <PatientSearch />}
    {tab === 'Agenda de citas' && <Agenda />}
    {tab === 'Hospitalización' && <HospitalizationPage initialAdmissionId={initialHospitalAdmissionId} />}
  </div>
}

function IdentityComparison({ person, patient }: { person: Record<string, string | null>; patient: ReceptionPatient }) {
  const comparisons = [
    { label: 'Nombre completo', applicant: `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim(), registered: `${patient.first_name} ${patient.last_name}`.trim() },
    { label: 'DUI', applicant: person.dui, registered: patient.dui },
    { label: 'Fecha de nacimiento', applicant: person.birth_date, registered: patient.birth_date },
  ]
  return <div className="reception-comparison"><h4>Compara antes de vincular</h4><div className="reception-comparison-scroll"><table><thead><tr><th>Dato a verificar</th><th>En la solicitud</th><th>En el registro encontrado</th></tr></thead><tbody>{comparisons.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.applicant || 'No registrado'}</td><td>{row.registered || 'No registrado'}{row.applicant && row.registered && row.applicant.toLocaleLowerCase() !== row.registered.toLocaleLowerCase() && <small className="reception-mismatch">Revisar diferencia</small>}</td></tr>)}</tbody></table></div><p>Confirma estos datos con el documento de identidad del paciente.</p></div>
}

function PatientSearch() {
  const [dui, setDui] = useState(''); const [rows, setRows] = useState<ReceptionPatient[]>([])
  const [codes, setCodes] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [searched, setSearched] = useState(false)
  const [searchedDui, setSearchedDui] = useState('')
  async function search() {
    setBusy(true); setError(''); setRows([]); setSearched(false)
    try { const patients = await searchPatients(dui.trim()); const entries = await Promise.all(patients.map(async p => [p.id, await recordCode(p.id) ?? ''])); setRows(patients); setCodes(Object.fromEntries(entries)); setSearchedDui(dui.trim()); setSearched(true) }
    catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return <section className={`${panel} reception-search-page`}>
    <div className="reception-section-heading"><div><h3>¿El paciente ya tiene expediente?</h3><p>Consulta con su documento para encontrar el registro correcto.</p></div><span className="reception-avatar"><Icon name="search" size={23} /></span></div>
    <form className="reception-search-form" onSubmit={e => { e.preventDefault(); void search() }}><label htmlFor="reception-patient-dui">DUI del paciente<span className="reception-search-input"><Icon name="search" size={20} /><input id="reception-patient-dui" placeholder="00000000-0" value={dui} disabled={busy} maxLength={10} onChange={e => { setDui(e.target.value); setSearched(false); setRows([]); setError('') }} required /></span><small>Escribe los 9 números, incluyendo el guion.</small></label><button className={button} disabled={busy}>{busy ? 'Consultando…' : 'Consultar expediente'}<Icon name="arrowRight" size={18} /></button></form>
    {error && <p className="reception-status is-warning" role="alert">{error}</p>}
    {busy && <div className="reception-empty" role="status"><Icon name="search" size={28} /><h4>Buscando el expediente…</h4><p>Estamos consultando el DUI que ingresaste.</p></div>}
    {searched && !busy && !error && <div aria-live="polite" className="space-y-4"><div className={`reception-status ${rows.length ? 'is-success' : 'is-warning'}`}><Icon name={rows.length ? 'check' : 'file'} size={24} /><div><strong>{rows.length ? 'Encontramos un paciente con este DUI' : 'No encontramos un paciente con este DUI'}</strong><p>Resultado para el documento {searchedDui}.</p></div></div>{rows.map(p => <div key={p.id} className="space-y-3"><PatientCard patient={p} code={codes[p.id]} /><p className="text-sm text-slate-600">{codes[p.id] ? 'Este paciente sí tiene expediente. Para vincularlo, abre su solicitud y verifica la identidad.' : 'El paciente está registrado, pero no se encontró un expediente disponible. Solicita una revisión antes de crear otro registro.'}</p></div>)}{!rows.length && <p className="reception-help">Revisa que el DUI esté escrito correctamente. Si es correcto, abre la solicitud del paciente y selecciona <strong>Verificar expediente</strong> para completar la búsqueda y crear su expediente.</p>}</div>}
    {!searched && !busy && !error && <div className="reception-empty"><Icon name="file" size={32} /><h4>Encuentra el expediente en un solo lugar</h4><p>Ingresa el DUI y te indicaremos si el paciente está registrado y si tiene un expediente disponible.</p></div>}
  </section>
}

function RequestDetail({ request, specialty, onBack }: { request: AttentionRequest; specialty: string; onBack: () => void }) {
  const [r, setRequest] = useState(request); const [step, setStep] = useState(1)
  const [patient, setPatient] = useState<ReceptionPatient | null>(null); const [code, setCode] = useState<string>()
  const [candidates, setCandidates] = useState<ReceptionPatient[]>([]); const [searched, setSearched] = useState(false)
  const [candidateCodes, setCandidateCodes] = useState<Record<string, string>>({})
  const [symptoms, setSymptoms] = useState(''); const [identity, setIdentity] = useState(false)
  const [date, setDate] = useState(localDate()); const [slots, setSlots] = useState<Slot[]>([]); const [slot, setSlot] = useState<Slot | null>(null)
  const [doctor, setDoctor] = useState(''); const [slotsLoaded, setSlotsLoaded] = useState(false)
  const [doctorDay, setDoctorDay] = useState<DoctorDay | null>(null)
  const [appointment, setAppointment] = useState<ReceptionAppointment | null>(null)
  const [closing, setClosing] = useState(''); const [reason, setReason] = useState(''); const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const locked = useRef(false)
  useEffect(() => {
    let active = true
    setDoctorDay(null)
    const doctorId = slot?.doctor_id || doctor
    if (doctorId) receptionRpc<DoctorDay>('reception_doctor_day', { p_doctor: doctorId, p_day: date }).then(data => { if (active) setDoctorDay(data) }).catch(e => { if (active) setError(message(e)) })
    return () => { active = false }
  }, [slot?.doctor_id, doctor, date])
  const open = ['pendiente', 'en_revision'].includes(r.status)
  async function reload() {
    const p = await linkedPatient(r); setPatient(p); setCode(p ? await recordCode(p.id) : undefined)
  }
  useEffect(() => {
    let active = true
    Promise.all([linkedPatient(request), requestSymptoms(request.id), requestAppointment(request.id)]).then(async ([p, s, a]) => {
      const c = p ? await recordCode(p.id) : undefined
      if (active) { setPatient(p); setCode(c); setSymptoms(s); setAppointment(a) }
    }).catch(e => { if (active) setError(message(e)) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [request])
  async function run(action: () => Promise<void>) {
    if (locked.current) return
    locked.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(message(e)) } finally { locked.current = false; setBusy(false) }
  }
  async function verifyPatient(p: ReceptionPatient) {
    await receptionRpc('link_attention_patient', { p_request: r.id, p_patient: p.id, p_identity_confirmed: identity })
    setRequest({ ...r, patient_id: p.id, status: 'en_revision' }); setPatient(p); setCode(await recordCode(p.id)); setNotice('Expediente vinculado a la cuenta del paciente.'); setCandidates([])
  }
  const person = r.applicant_data ?? {}
  const birth = person.birth_date
  const today = localDate()
  const age = birth ? Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - (today.slice(5) < birth.slice(5) ? 1 : 0) : null
  const sorted = [...slots].sort((a, b) => {
    const preferred = (s: Slot) => r.preferred_period === 'indiferente' || (Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/El_Salvador', hour: '2-digit', hourCycle: 'h23' }).format(new Date(s.starts_at))) < 12 ? r.preferred_period === 'manana' : r.preferred_period === 'tarde')
    return Number(preferred(b)) - Number(preferred(a)) || a.starts_at.localeCompare(b.starts_at)
  })
  return <section className={`${panel} space-y-5`}>
    <button className="text-sm font-semibold text-[#800b2c]" disabled={busy} onClick={onBack}>← Volver a solicitudes</button>
    <div className="reception-detail-heading"><span className="reception-avatar"><Icon name="patient" size={26} /></span><div><span className="reception-eyebrow">SOLICITUD DE ATENCIÓN</span><h2 className="text-xl font-semibold">{person.first_name} {person.last_name}</h2><p className="mt-1 text-sm text-slate-500">{specialty} · {displayTime(r.created_at)}</p></div><span className="reception-count">{stateLabels[r.status]}</span></div>
    <ol className="reception-steps">{['Revisar solicitud', 'Verificar expediente', 'Programar cita'].map((label, i) => <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className={step === i + 1 ? 'is-current' : step > i + 1 ? 'is-complete' : ''}><span className="reception-step-number">{step > i + 1 ? <Icon name="check" size={18} /> : i + 1}</span><div><strong>{label}</strong><small>{['Conoce el motivo de atención', 'Busca, verifica o crea el registro', 'Elige y confirma un horario'][i]}</small></div></li>)}</ol>
    {busy && <p role="status">Procesando, espera un momento…</p>}{error && <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-800">{error}</p>}{notice && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
    {appointment && <div className="rounded-xl bg-emerald-50 p-5 text-emerald-900"><h3 className="font-semibold">Cita {appointment.status}</h3><p>{displayTime(appointment.starts_at)} — {displayTime(appointment.ends_at)}</p><p>{specialty} · {appointment.doctor_name || 'Médico asignado'} · Consultorio {appointment.room_code || 'asignado'}</p><p>El expediente está asociado a la cuenta del paciente.</p></div>}
    {r.closure_reason && <p className="rounded-lg bg-slate-50 p-4">Motivo: {r.closure_reason}</p>}
    {step === 1 && <>
      <dl className="reception-review-data grid gap-4 sm:grid-cols-2">{[['Nombre', `${person.first_name ?? ''} ${person.last_name ?? ''}`], ['DUI', person.dui], ['Nacimiento y edad', birth ? `${birth} · ${age} años` : null], ['Correo', person.email], ['Teléfono', person.phone], ['Especialidad', specialty], ['Preferencia', periodLabels[r.preferred_period]], ['Síntomas', symptoms], ['Otros síntomas', r.other_symptoms], ['Motivo de atención', r.reason]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value || 'No registrado'}</dd></div>)}</dl>
      {open && <button className={button} disabled={busy} onClick={() => void run(async () => { await receptionRpc('review_attention_request', { p_request: r.id, p_status: 'en_revision' }); setRequest({ ...r, status: 'en_revision' }); await reload(); setStep(2) })}>Continuar: verificar expediente</button>}
    </>}
    {step === 2 && <>
      <div className="reception-verification-layout"><div className="space-y-5">
        <div className="reception-section-heading"><div><h3>¿El paciente ya tiene expediente?</h3><p>Primero revisa el resultado de la consulta. Después, sigue la acción indicada.</p></div></div>
        {patient ? <>
          <div className={`reception-status ${code && r.patient_id ? 'is-success' : 'is-warning'}`} role="status"><Icon name={code && r.patient_id ? 'check' : 'file'} size={26} /><div><strong>{!code ? 'Paciente encontrado: expediente por revisar' : r.patient_id ? 'Sí, el paciente ya tiene expediente vinculado' : 'Encontramos un expediente para esta cuenta'}</strong><p>{!code ? 'No se encontró un expediente disponible. Solicita revisión administrativa antes de continuar.' : r.patient_id ? 'Puedes continuar con la programación de su cita.' : 'Verifica la identidad y confirma el vínculo antes de programar.'}</p></div></div>
          <PatientCard patient={patient} code={code} />
          {!r.patient_id && <><IdentityComparison person={person} patient={patient} /><IdentityCheck checked={identity} onChange={setIdentity} disabled={busy} /><button className={button} disabled={busy || !identity} onClick={() => void run(() => verifyPatient(patient))}>Confirmar que corresponde a este paciente<Icon name="check" size={18} /></button></>}
        </> : <>
          {!searched && <div className="reception-lookup-box"><span className="reception-avatar"><Icon name="search" size={26} /></span><h4>La cuenta aún no tiene un expediente vinculado</h4><p>Esto no significa que el paciente sea nuevo. Busca con su DUI para comprobar si ya existe un registro.</p><div className="reception-document"><span>DUI de la solicitud</span><strong>{person.dui || 'No registrado'}</strong></div><button className={button} disabled={busy || !person.dui} onClick={() => void run(async () => { const found = await searchPatients(person.dui ?? ''); const codes = await Promise.all(found.map(async p => [p.id, await recordCode(p.id) ?? ''])); setCandidates(found); setCandidateCodes(Object.fromEntries(codes)); setIdentity(false); setSearched(true) })}><Icon name="search" size={18} />{busy ? 'Buscando…' : 'Buscar si ya tiene expediente'}</button></div>}
          {searched && candidates.length > 0 && <div className="reception-status is-warning" role="status"><Icon name="file" size={26} /><div><strong>Encontramos un paciente registrado con este DUI</strong><p>Compara los datos con el documento del solicitante antes de vincularlo.</p></div></div>}
          {candidates.map(p => <div key={p.id} className="space-y-4"><PatientCard patient={p} code={candidateCodes[p.id]} />{!candidateCodes[p.id] && <p className="reception-help">No se encontró un expediente disponible para este registro. Solicita revisión administrativa si no puedes continuar.</p>}<IdentityComparison person={person} patient={p} />{p.profile_id && p.profile_id !== r.requester_id ? <div className="reception-status is-warning" role="alert"><Icon name="lock" size={22} /><div><strong>Este registro está vinculado a otra cuenta</strong><p>Solicita una revisión administrativa para resolverlo. No crees otro expediente.</p></div></div> : <><IdentityCheck checked={identity} onChange={setIdentity} disabled={busy} /><button className={button} disabled={busy || !identity} onClick={() => void run(() => verifyPatient(p))}>Vincular a este paciente<Icon name="arrowRight" size={18} /></button></>}</div>)}
          {searched && candidates.length === 0 && <>
            <div className="reception-status is-warning" role="status"><Icon name="file" size={26} /><div><strong>No encontramos un paciente con este DUI</strong><p>Si el documento es correcto, puedes crear y vincular un expediente nuevo.</p></div></div>
            <div className="reception-create-box"><h4>Crear el expediente del paciente</h4><p>Usaremos los datos de esta solicitud. Revisa el nombre, DUI y fecha de nacimiento antes de confirmar.</p><IdentityCheck checked={identity} onChange={setIdentity} disabled={busy} /><button className={button} disabled={busy || !identity} onClick={() => { if (window.confirm('¿Crear el expediente y vincularlo a esta cuenta con los datos verificados?')) void run(async () => { const id = await receptionRpc<string>('create_attention_patient', { p_request: r.id, p_identity_confirmed: identity }); const next = { ...r, patient_id: id, status: 'en_revision' }; setRequest(next); const p = await linkedPatient(next); setPatient(p); setCode(await recordCode(id)); setNotice('Expediente creado y vinculado correctamente.') }) }}><Icon name="plus" size={18} />Crear y vincular expediente</button></div>
          </>}
        </>}
      </div><aside className="reception-applicant-summary"><span className="reception-eyebrow">DATOS DE LA SOLICITUD</span><h4>{person.first_name} {person.last_name}</h4><dl>{[['DUI', person.dui], ['Fecha de nacimiento', person.birth_date], ['Teléfono', person.phone], ['Correo', person.email]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'No registrado'}</dd></div>)}</dl><div className="reception-help"><Icon name="help" size={19} /><p>Busca primero. Crea un expediente nuevo solo cuando hayas comprobado que el paciente no tiene uno.</p></div></aside></div>
      <div className="reception-action-bar"><button className="reception-secondary" disabled={busy} onClick={() => setStep(1)}>← Volver a la solicitud</button><div>{(!code || !r.patient_id) && <p>Primero verifica y vincula el expediente.</p>}<button className={button} disabled={busy || !code || !r.patient_id} onClick={() => setStep(3)}>Continuar a programar cita<Icon name="arrowRight" size={18} /></button></div></div>
    </>}
    {step === 3 && open && <>
      <h3 className="font-semibold">Programar cita · {specialty}</h3><p className="text-sm text-slate-600">Preferencia: {periodLabels[r.preferred_period]}. Los horarios sugeridos respetan jornada, atención médica y consultorio. Horas de El Salvador.</p>
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Fecha<input className={`${input} mt-1`} type="date" min={today} value={date} onChange={e => { setDate(e.target.value); setSlots([]); setSlot(null); setConfirm(false); setSlotsLoaded(false) }} /></label><button className={button} disabled={busy || !date} onClick={() => void run(async () => { setSlot(null); setConfirm(false); setSlots(await availableSlots(r.specialty_id, date, r.patient_id)); setSlotsLoaded(true); setDoctor('') })}>Consultar horas disponibles</button></div>
      {slots.length > 0 && <label className="block text-sm">Doctor<select className={`${input} mt-1`} value={doctor} onChange={e => { setDoctor(e.target.value); setSlot(null); setConfirm(false) }}><option value="">Todos los doctores disponibles</option>{[...new Map(slots.map(s => [s.doctor_id, s.doctor_name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
      {slotsLoaded && !slots.length && <p>No hay disponibilidad para esta especialidad en la fecha elegida. Consulta otra fecha.</p>}
      {doctorDay && <div className="grid gap-4 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><h4 className="font-semibold">Jornada laboral</h4>{doctorDay.shifts.map(s => <p key={s.starts_at}>{displayTime(s.starts_at)} — {displayTime(s.ends_at)}</p>)}</div><div><h4 className="font-semibold">Horario de atención médica</h4>{doctorDay.consultations.map(s => <p key={`${s.starts_at}-${s.room_code}`}>{displayTime(s.starts_at)} — {displayTime(s.ends_at)} · Consultorio {s.room_code} · {s.slot_minutes} min</p>)}</div></div>}
      <div className="grid max-h-96 gap-3 overflow-y-auto sm:grid-cols-2">{sorted.filter(s => !doctor || s.doctor_id === doctor).map(s => <button key={`${s.doctor_id}-${s.consulting_room_id}-${s.starts_at}`} disabled={busy} onClick={() => { setSlot(s); setConfirm(false) }} className={`rounded-lg border p-4 text-left text-sm ${slot === s ? 'border-[#800b2c] bg-[#f8eef1] ring-1 ring-[#800b2c]' : 'border-slate-200'}`}><strong>{s.doctor_name}</strong><p>{displayTime(s.starts_at)}</p><p>Consultorio {s.room_code} · {s.slot_minutes} minutos</p></button>)}</div>
      {slot && <div className="space-y-3 rounded-xl bg-[#f8eef1] p-5"><h4 className="font-semibold">Confirmar cita</h4><p>{person.first_name} {person.last_name} · {code}</p><p>{specialty} · {slot.doctor_name}</p><p>{displayTime(slot.starts_at)} · {slot.slot_minutes} minutos · Consultorio {slot.room_code}</p><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />Confirmé estos datos con el paciente.</label><button className={button} disabled={busy || !confirm} onClick={() => void run(async () => { const id = await receptionRpc<string>('schedule_appointment', { p_request: r.id, p_patient: r.patient_id, p_doctor: slot.doctor_id, p_room: slot.consulting_room_id, p_start: slot.starts_at, p_end: slot.ends_at }); setAppointment({ id, request_id: r.id, patient_id: r.patient_id!, doctor_id: slot.doctor_id, consulting_room_id: slot.consulting_room_id, starts_at: slot.starts_at, ends_at: slot.ends_at, doctor_name: slot.doctor_name, room_code: slot.room_code, status: 'programada' }); setRequest({ ...r, status: 'agendada' }); setNotice('Cita guardada. La solicitud quedó programada.'); setSlot(null) })}>{busy ? 'Guardando…' : 'Confirmar y guardar cita'}</button></div>}
      <button className="px-4 py-3 text-sm" disabled={busy} onClick={() => setStep(2)}>Volver al expediente</button>
    </>}
    {open && <div className="border-t border-slate-200 pt-4"><div className="flex flex-wrap gap-3"><button className="rounded-lg border border-rose-200 px-4 py-3 text-sm text-rose-800" disabled={busy} onClick={() => setClosing('rechazada')}>Rechazar solicitud</button><button className="rounded-lg border border-slate-200 px-4 py-3 text-sm" disabled={busy} onClick={() => setClosing('cancelada')}>Cancelar solicitud</button></div>{closing && <div className="mt-4 space-y-3"><label className="block text-sm">Motivo obligatorio<textarea className={`${input} mt-1`} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label><button className={button} disabled={busy || !reason.trim()} onClick={() => { if (window.confirm(`¿Confirmar que la solicitud quedará ${closing}?`)) void run(async () => { await receptionRpc('close_attention_request', { p_request: r.id, p_status: closing, p_reason: reason }); setRequest({ ...r, status: closing, closure_reason: reason }); setClosing(''); setNotice('Solicitud actualizada.') }) }}>Confirmar decisión</button><button className="px-4 py-3 text-sm" onClick={() => setClosing('')} disabled={busy}>Volver</button></div>}</div>}
  </section>
}

function Agenda() {
  const [date, setDate] = useState(localDate()); const [rows, setRows] = useState<ReceptionAppointment[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(true)
  const [rooms, setRooms] = useState<{ id: string; code: string }[]>([])
  useEffect(() => { let active = true; setBusy(true); setError(''); Promise.all([loadAgenda(date), receptionRows<{ id: string; code: string }>('consulting_rooms', 'id,code')]).then(([a, r]) => { if (active) { setRows(a); setRooms(r) } }).catch(e => { if (active) setError(message(e)) }).finally(() => { if (active) setBusy(false) }); return () => { active = false } }, [date])
  const time = (value: string) => new Date(value).toLocaleTimeString('es-SV', { timeZone: 'America/El_Salvador', hour: '2-digit', minute: '2-digit' })
  const appointmentLabels: Record<string, string> = { programada: 'Programada', confirmada: 'Confirmada', en_atencion: 'En atención', completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No asistió' }
  return <section className={panel}>
    <div className="reception-section-heading"><div><h3>Agenda de citas</h3><p>Consulta quién tiene cita, a qué hora y en qué consultorio.</p></div><span className="reception-avatar"><Icon name="calendar" size={24} /></span></div>
    <div className="reception-agenda-toolbar"><label className="text-sm font-medium">Día de consulta<input type="date" className={`${input} mt-2`} value={date} onChange={e => { if (e.target.value) setDate(e.target.value) }} required /></label><div><strong>{busy ? '…' : rows.length}</strong><span>citas en esta fecha</span></div><p>Horarios de El Salvador</p></div>
    {busy && <div className="reception-empty" role="status"><Icon name="clock" size={30} /><h4>Consultando las citas del día…</h4></div>}{error && <p role="alert" className="reception-status is-warning">{error}</p>}
    {!busy && !error && !rows.length && <div className="reception-empty"><Icon name="calendar" size={32} /><h4>Este día no tiene citas registradas</h4><p>Selecciona otra fecha para consultar la agenda. Puedes programar nuevas citas desde las solicitudes de atención.</p></div>}
    {!busy && !error && <div className="reception-agenda-list">{rows.map(a => <div className="reception-agenda-item" key={a.id}><div className="reception-agenda-time"><strong>{time(a.starts_at)}</strong><small>hasta {time(a.ends_at)}</small></div><div className="reception-agenda-patient"><strong>{a.patient_name}</strong><span>{a.doctor_name}</span></div><span className="reception-room"><Icon name="file" size={16} />Consultorio {a.room_code || rooms.find(r => r.id === a.consulting_room_id)?.code || 'No disponible'}</span><span className={`reception-appointment-status ${a.status === 'cancelada' ? 'is-cancelled' : ''}`}>{appointmentLabels[a.status] ?? a.status}</span></div>)}</div>}
    <p className="mt-5 text-xs text-slate-400">Se muestran hasta 200 citas por día.</p>
  </section>
}
