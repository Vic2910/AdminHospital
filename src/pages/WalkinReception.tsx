import { useEffect, useRef, useState } from 'react'
import { IdentityCheck, PatientCard } from '../components/ReceptionIdentity'
import { availableSlots, displayTime, localDate, receptionRpc, recordCode, searchPatients, searchReceptionPatients, type ReceptionPatient, type Slot } from '../lib/reception'
import { maskPatientDui } from '../lib/patientSearch'
import { normalizeDui } from '../lib/walkin'
import { AdmissionAssessment } from './AdmissionAssessment'
import './WalkinReception.css'

type Mode = 'scheduled' | 'immediate'
const blank = { first: '', last: '', dui: '', birth: '', phone: '', email: '', city: '' }
const errorText = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la operación.'
export function WalkinReception({ specialties, initialPatient = null }: { specialties: { id: number; name: string }[]; initialPatient?: ReceptionPatient | null }) {
  const [form, setForm] = useState(() => initialPatient ? { first: initialPatient.first_name, last: initialPatient.last_name, dui: initialPatient.dui ?? '', birth: initialPatient.birth_date ?? '', phone: (initialPatient.phone ?? '').replace(/^(\d{4})-?(\d{4})$/, '$1-$2'), email: initialPatient.email ?? '', city: initialPatient.city ?? '' } : blank); const [patient, setPatient] = useState<ReceptionPatient | null>(null)
  const [duplicateCandidates, setDuplicateCandidates] = useState<ReceptionPatient[]>([])
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)
  const [service, setService] = useState<'appointment' | 'assessment'>('appointment')
  const [code, setCode] = useState(''); const [identity, setIdentity] = useState(false)
  const [match, setMatch] = useState<{ dui: string; patient: ReceptionPatient | null; recordCode: string | null } | null>(null)
  const [lookup, setLookup] = useState(''); const [lookupError, setLookupError] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false)
  useEffect(() => {
    let active = true; let document: string
    try { document = normalizeDui(form.dui) } catch { return }
    const timer = window.setTimeout(() => {
      setLookup('Comprobando si ya existe un expediente…')
      searchPatients(document).then(async rows => {
        const foundCode = rows[0] ? await recordCode(rows[0].id) : undefined
        if (active) { setMatch({ dui: document, patient: rows[0] ?? null, recordCode: foundCode ?? null }); setLookup(rows.length ? foundCode ? 'Ya existe un expediente con este DUI. Puedes recuperarlo.' : 'El paciente ya está registrado, pero no hay expediente disponible. Solicita revisión administrativa; no crees otra persona.' : 'No hay un paciente con este DUI. Puedes continuar con la verificación.') }
      }).catch(e => { if (active) { setLookup(''); setLookupError(errorText(e)) } })
    }, 450)
    return () => { active = false; window.clearTimeout(timer) }
  }, [form.dui])
  function edit(key: keyof typeof blank, value: string) { setForm(old => ({ ...old, [key]: value })); setIdentity(false); setError(''); setDuplicateCandidates([]); setDuplicateConfirmed(false); if (key === 'dui') { setMatch(null); setLookup(''); setLookupError('') } }
  async function run(work: () => Promise<void>) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work() } catch (e) { setError(errorText(e)) } finally { lock.current = false; setBusy(false) } }
  async function recover(p: ReceptionPatient) { const record = await recordCode(p.id); setCode(record ?? ''); setPatient(p); setIdentity(false) }
  async function create() {
    if (!identity) throw new Error('Verifica la identidad con el documento del paciente.')
    const document = normalizeDui(form.dui)
    if (initialPatient) {
      if (initialPatient.dui !== document) throw new Error('El documento no coincide con el paciente seleccionado. Solicita una revisión administrativa; no crees otra persona.')
      await recover(initialPatient); return
    }
    // Check again on submit; the background lookup never locks or resets the form.
    const existing = await searchPatients(document)
    if (existing[0]) { await recover(existing[0]); return }
    // Advisory name/contact matches never authorize recovering a patient or linking Auth.
    const terms = [`${form.first.trim()} ${form.last.trim()}`, form.phone.trim(), form.email.trim()].filter(value => value.length >= 2)
    const similar = await Promise.all(terms.map(value => searchReceptionPatients(value)))
    const candidates = [...new Map(similar.flatMap(result => result.patients).filter(candidate => candidate.dui !== document).map(candidate => [candidate.id, candidate])).values()]
    const sameCandidates = JSON.stringify(candidates.map(candidate => candidate.id).sort()) === JSON.stringify(duplicateCandidates.map(candidate => candidate.id).sort())
    if (candidates.length && (!duplicateConfirmed || !sameCandidates)) { setDuplicateCandidates(candidates); setDuplicateConfirmed(false); return }
    const id = await receptionRpc<string>('create_walkin_patient', { p_first: form.first.trim(), p_last: form.last.trim(), p_dui: document, p_birth: form.birth || null, p_phone: form.phone.trim() || null, p_city: form.city.trim() || null, p_email: form.email.trim() || null })
    const rows = await searchPatients(document); const saved = rows.find(p => p.id === id)
    if (!saved) throw new Error('El expediente se guardó. Recupera el registro por su DUI antes de volver a crear uno.')
    setCode(await recordCode(id) ?? ''); setPatient(saved)
  }
  const existing = match?.dui === (() => { try { return normalizeDui(form.dui) } catch { return '' } })() ? match?.patient : null
  return <section className="walkin space-y-5"><header className="walkin-header"><span className="reception-eyebrow">ATENCIÓN PRESENCIAL</span><h2>Crear expediente de nuevo paciente</h2><p>Completa los datos y guarda el expediente. No necesita una cuenta en la aplicación. Los campos con * son obligatorios.</p></header>
    {initialPatient && <p className="walkin-note">Se recuperaron los datos de un paciente existente. No se creará otro paciente; si falta su expediente, solicita revisión administrativa.</p>}
    {error && <p role="alert" className="walkin-alert error">{error}</p>}
    {!patient ? <form className="walkin-card space-y-5" onSubmit={e => { e.preventDefault(); void run(create) }}><fieldset disabled={busy} className="space-y-5"><section><h3>Identificación del paciente</h3><div className="walkin-grid"><label>Nombres *<input required maxLength={100} autoComplete="given-name" value={form.first} onChange={e => edit('first', e.target.value)} /></label><label>Apellidos *<input required maxLength={100} autoComplete="family-name" value={form.last} onChange={e => edit('last', e.target.value)} /></label><label>DUI *<input required maxLength={10} pattern="[0-9]{8}-?[0-9]" placeholder="00000000-0" value={form.dui} onChange={e => edit('dui', e.target.value)} /><small>Con o sin guion; lo comprobamos sin interrumpir el formulario.</small></label><label>Fecha de nacimiento (opcional)<input type="date" max={localDate()} min={`${Number(localDate().slice(0, 4)) - 120}${localDate().slice(4)}`} value={form.birth} onChange={e => edit('birth', e.target.value)} /></label></div></section>
    <section><h3>Datos de contacto</h3><div className="walkin-grid"><label>Teléfono (opcional)<input type="tel" maxLength={9} pattern="[0-9]{4}-[0-9]{4}" placeholder="0000-0000" value={form.phone} onChange={e => edit('phone', e.target.value)} /></label><label>Correo electrónico (opcional)<input type="email" maxLength={254} autoComplete="email" value={form.email} onChange={e => edit('email', e.target.value)} /><small>Se guarda como contacto del paciente, sin crear una cuenta.</small></label><label>Ciudad (opcional)<input maxLength={120} autoComplete="address-level2" value={form.city} onChange={e => edit('city', e.target.value)} /></label></div></section>
    {lookup && <p role="status" className="walkin-note">{lookup}</p>}{lookupError && <p role="alert" className="walkin-alert error">{lookupError} Puedes reintentar al guardar.</p>}
    {existing && <div className="walkin-alert"><strong>{match?.recordCode ? 'Hay un expediente registrado' : 'El paciente ya está registrado'}</strong><p>No se creará otro ni se sobrescribirán sus datos.</p><button type="button" className="walkin-secondary" onClick={() => void run(() => recover(existing))}>Recuperar expediente existente</button></div>}
    {duplicateCandidates.length > 0 && <section className="walkin-alert"><strong>Posibles coincidencias: verifica antes de crear</strong><p>Compartir nombre, teléfono o correo no demuestra identidad. No se vinculará ninguna cuenta.</p><ul>{duplicateCandidates.map(candidate => <li key={candidate.id}>{candidate.first_name} {candidate.last_name} · DUI {maskPatientDui(candidate.dui)}</li>)}</ul><label className="reception-identity-check"><input type="checkbox" checked={duplicateConfirmed} onChange={event => setDuplicateConfirmed(event.target.checked)} /><span>Comparé los documentos y confirmé que el nuevo paciente es una persona distinta.</span></label></section>}
    <IdentityCheck checked={identity} onChange={setIdentity} disabled={busy} description="Comparé el DUI y los datos disponibles con el documento del paciente." /></fieldset><button className="walkin-primary" disabled={busy || !identity}>{busy ? 'Guardando…' : existing ? 'Recuperar expediente' : 'Guardar y crear expediente'}</button></form> : <><section className="walkin-card space-y-4"><h3>{code ? 'Expediente disponible' : 'Paciente registrado sin expediente disponible'}</h3><PatientCard patient={patient} code={code} />{patient.email && <p>Correo: {patient.email}</p>}{patient.city && <p>Ciudad: {patient.city}</p>}{code ? <IdentityCheck checked={identity} onChange={setIdentity} disabled={busy} /> : <p role="alert">El paciente existe sin expediente disponible. Solicita revisión administrativa; no crees otro paciente.</p>}<button type="button" className="walkin-secondary" onClick={() => { setPatient(null); setCode(''); setIdentity(false) }}>Volver al formulario</button></section>{code && identity && <div className="space-y-5"><div className="walkin-options" aria-label="Tipo de atencion"><button type="button" className={service === "appointment" ? "active" : ""} aria-pressed={service === "appointment"} onClick={() => setService("appointment")}><strong>Agendar cita o atención</strong><small>Consultar horarios disponibles</small></button><button type="button" className={service === "assessment" ? "active" : ""} aria-pressed={service === "assessment"} onClick={() => setService("assessment")}><strong>Solicitar valoración para hospitalización</strong><small>Sin cita, con decisión del médico autenticado</small></button></div>{service === "appointment" ? <WalkinCare key={patient.id} patient={patient} specialties={specialties} /> : <AdmissionAssessment key={`assessment-${patient.id}`} patientId={patient.id} />}</div>}</>}
  </section>
}

function WalkinCare({ patient, specialties }: { patient: ReceptionPatient; specialties: { id: number; name: string }[] }) {
  const [mode, setMode] = useState<Mode>('scheduled'); const [specialty, setSpecialty] = useState(''); const [date, setDate] = useState(localDate())
  const [reason, setReason] = useState(''); const [symptoms, setSymptoms] = useState(''); const [priority, setPriority] = useState('normal')
  const [slots, setSlots] = useState<Slot[]>([]); const [slot, setSlot] = useState<Slot | null>(null); const [doctor, setDoctor] = useState(''); const [queried, setQueried] = useState(false)
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState<{ appointment_id: string; admission_id: string | null } | null>(null)
  const key = useRef(crypto.randomUUID()); const lock = useRef(false)
  function changed() { key.current = crypto.randomUUID(); setError('') }
  function clearSlots() { setSlots([]); setSlot(null); setQueried(false); setDoctor(''); changed() }
  async function run(work: () => Promise<void>) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work() } catch (e) { setError(errorText(e)) } finally { lock.current = false; setBusy(false) } }
  async function findSlots() {
    setSlots([]); setSlot(null); setQueried(false)
    const all = await availableSlots(Number(specialty), mode === 'scheduled' ? date : localDate(), patient.id)
    const now = Date.now(); setSlots(all.filter(s => new Date(s.starts_at).getTime() > now && (mode === 'scheduled' || new Date(s.starts_at).getTime() <= now + 2 * 3600000))); setDoctor(''); setQueried(true)
  }
  async function save() {
    if (!slot || !window.confirm(`Reservar esta cita para ${patient.first_name} ${patient.last_name}, ${displayTime(slot.starts_at)}, con ${slot.doctor_name}?`)) return
    const saved = await receptionRpc<{ appointment_id: string; admission_id: string | null }>('reception_walkin_attention', { p_patient: patient.id, p_key: key.current, p_values: { mode, specialty_id: Number(specialty), doctor_id: slot.doctor_id, room_id: slot.consulting_room_id, starts_at: slot.starts_at, ends_at: slot.ends_at, reason, symptoms, priority, identity_confirmed: true } })
    setResult(saved)
  }
  if (result) return <section className="walkin-card"><div className="walkin-alert success" role="status"><strong>Cita registrada correctamente</strong><p>{slot?.doctor_name} · {slot && displayTime(slot.starts_at)} · Consultorio {slot?.room_code}</p></div><p>El médico debe iniciar y registrar la evaluación. Para hospitalizar, debe emitir una solicitud desde su cuenta autenticada; recepción continúa luego en Hospitalización.</p></section>
  const doctors = [...new Map(slots.map(s => [s.doctor_id, s.doctor_name])).entries()]
  return <form className="walkin-card space-y-5" onSubmit={e => { e.preventDefault(); void run(save) }}><h3>¿Cómo continuará la atención?</h3><fieldset disabled={busy} className="space-y-5"><div className="walkin-options">{([['scheduled', 'Agendar cita', 'Elegir fecha y horario'], ['immediate', 'Atención inmediata', 'Próxima disponibilidad de hoy']] as const).map(([v, label, help]) => <button type="button" className={mode === v ? 'active' : ''} aria-pressed={mode === v} key={v} onClick={() => { setMode(v); clearSlots() }}><strong>{label}</strong><small>{help}</small></button>)}</div>
    {(priority === 'urgente' || mode !== 'scheduled') && <p className="walkin-alert">Ante una urgencia, avisa inmediatamente al personal asistencial y sigue el protocolo del hospital. Esta reserva no sustituye el triaje ni confirma que el paciente ya fue atendido.</p>}
    <div className="walkin-grid"><label>Motivo de atención *<textarea required maxLength={2000} value={reason} onChange={e => { setReason(e.target.value); changed() }} /></label><label>Síntomas {mode === 'scheduled' ? '(opcional)' : '*'}<textarea required={mode !== 'scheduled'} maxLength={1000} value={symptoms} onChange={e => { setSymptoms(e.target.value); changed() }} /></label><label>Prioridad *<select value={priority} onChange={e => { setPriority(e.target.value); changed() }}><option value="normal">Normal</option><option value="urgente">Urgente · Avisar al personal asistencial</option></select></label><label>Especialidad *<select required value={specialty} onChange={e => { setSpecialty(e.target.value); clearSlots() }}><option value="">Selecciona una especialidad</option>{specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{mode === 'scheduled' && <label>Fecha *<input required type="date" min={localDate()} value={date} onChange={e => { setDate(e.target.value); clearSlots() }} /></label>}</div>
    <section><div className="walkin-section-head"><div><h4>Médico, horario y consultorio</h4><p>{mode === 'scheduled' ? 'Horarios reales de la fecha elegida.' : 'Horarios de hoy dentro de las próximas dos horas, sujetos a disponibilidad.'}</p></div><button type="button" className="walkin-secondary" disabled={!specialty || busy} onClick={() => void run(findSlots)}>Consultar disponibilidad</button></div>
    {queried && !slots.length && <div className="walkin-alert"><strong>No hay un horario disponible para esta selección.</strong><p>Consulta otra especialidad o agenda una fecha posterior. Si el caso es urgente, solicita valoración asistencial sin esperar esta reserva.</p><button type="button" className="walkin-secondary" onClick={() => { setMode('scheduled'); clearSlots() }}>Buscar una cita programada</button></div>}
    {!!slots.length && <><label>Filtrar por médico<select value={doctor} onChange={e => { setDoctor(e.target.value); setSlot(null); changed() }}><option value="">Todos los médicos disponibles</option>{doctors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><div className="walkin-slots" role="group" aria-label="Horarios disponibles">{slots.filter(s => !doctor || s.doctor_id === doctor).map(s => <button type="button" key={`${s.doctor_id}-${s.consulting_room_id}-${s.starts_at}`} className={slot === s ? 'active' : ''} aria-pressed={slot === s} onClick={() => { setSlot(s); changed() }}><strong>{s.doctor_name}</strong><span>{displayTime(s.starts_at)} – {new Date(s.ends_at).toLocaleTimeString('es-SV', { timeZone: 'America/El_Salvador', hour: '2-digit', minute: '2-digit' })}</span><small>Consultorio {s.room_code} · {s.slot_minutes} minutos</small></button>)}</div></>}
    </section></fieldset>{error && <p className="walkin-alert error" role="alert">{error}</p>}{busy && <p role="status">Procesando, espera un momento…</p>}<button className="walkin-primary" disabled={busy || !slot}>Confirmar cita</button><p className="walkin-note">La disponibilidad se comprueba de nuevo al guardar. Ninguna acción de recepción marca la consulta como realizada.</p></form>
}
