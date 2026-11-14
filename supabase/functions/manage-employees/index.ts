import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import postgres from 'npm:postgres@3.4.7'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
class Failure extends Error { constructor(message: string, public status = 400) { super(message) } }
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 })
function check(result: { error: unknown }) { if (result.error) throw new Failure('Supabase rechazó la operación. Revisa los datos o reanuda el alta.', 409) }
function text(value: unknown, max: number, required = true): string {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new Failure('Completa los campos requeridos con valores válidos.')
  return value.trim()
}
function validate(b: Record<string, unknown>) {
  const role = b.role
  if (role !== 'doctor' && role !== 'receptionist') throw new Failure('Rol no permitido.')
  const email = text(b.email, 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Failure('Correo inválido.')
  const birthDate = text(b.birthDate ?? '', 10, false)
  if (birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate)) || new Date(birthDate).toISOString().slice(0,10) !== birthDate || birthDate > new Date().toISOString().slice(0,10))) throw new Failure('Fecha de nacimiento inválida.')
  if (typeof b.active !== 'boolean') throw new Failure('Estado inválido.')
  if (!Array.isArray(b.specialties) || b.specialties.length > 50 || b.specialties.some(x => typeof x !== 'string' || !/^[1-9]\d*$/.test(x))) throw new Failure('Especialidades inválidas.')
  const specialties = [...new Set(b.specialties as string[])]
  if (role === 'doctor' ? !specialties.length : specialties.length) throw new Failure('Selecciona especialidades solamente para doctores.')
  const phone = text(b.phone,30)
  if (!/^[+\d() .-]{7,30}$/.test(phone)) throw new Failure('Teléfono inválido.')
  return { givenNames: text(b.givenNames,100), familyNames: text(b.familyNames,100), email, phone, birthDate, city: text(b.city ?? '',120,false), employeeCode: text(b.employeeCode,80), role, specialties, active: b.active }
}
async function directory() {
  return await sql`select s.id, s.profile_id as "profileId", s.employee_code as "employeeCode", s.active and coalesce(r.active,false) as active,
    p.first_name as "givenNames", p.last_name as "familyNames", p.phone, p.birth_date::text as "birthDate", p.city, u.email,
    case when s.category='doctor' then 'doctor' else 'receptionist' end as role,
    coalesce((select json_agg(d.specialty_id::text) from public.doctor_specialties d where d.doctor_id=s.id),'[]') as specialties,
    p.updated_at::text as "personVersion", s.xmin::text as "staffVersion"
    from public.staff s join public.profiles p on p.id=s.profile_id join auth.users u on u.id=p.id
    left join public.user_roles r on r.user_id=p.id and r.role::text=s.category
    where s.category in ('doctor','recepcionista') and coalesce(u.raw_app_meta_data->>'employee_pending','false') <> 'true' order by s.employee_code`
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers })
  try {
    if (req.method !== 'POST') throw new Failure('Método no permitido.',405)
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')
    if (!token) throw new Failure('Inicia sesión.',401)
    const identity = await admin.auth.getUser(token)
    if (identity.error || !identity.data.user) throw new Failure('Sesión inválida.',401)
    const caller = identity.data.user.id
    const permission = await admin.from('user_roles').select('user_id').eq('user_id',caller).eq('role','admin').eq('active',true).maybeSingle()
    if (permission.error || !permission.data) throw new Failure('Se requiere administrador activo.',403)
    if (Number(req.headers.get('content-length') ?? 0) > 24000) throw new Failure('Solicitud demasiado grande.',413)
    const raw = await req.text()
    if (raw.length > 24000) throw new Failure('Solicitud demasiado grande.',413)
    let b: Record<string, any>
    try { b = JSON.parse(raw) } catch { throw new Failure('JSON inválido.') }
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Failure('Solicitud inválida.')
    const reply = (data: unknown) => new Response(JSON.stringify(data), { headers })
    if (b.action === 'catalogs') {
      const result = await admin.from('specialties').select('id,name').eq('active',true).order('name'); check(result)
      return reply({ specialties: result.data!.map(s => ({ ...s,id:String(s.id) })) })
    }
    if (b.action === 'pending') {
      const rows = await sql`select id, email, created_at as "createdAt", raw_app_meta_data->'employee_payload' as payload from auth.users where raw_app_meta_data->>'employee_pending'='true' order by created_at desc limit 100`
      return reply(rows)
    }
    if (b.action === 'list' || b.action === 'detail') {
      const rows = await directory()
      if (b.action === 'detail') { const row = rows.find(r => r.id === b.id); if (!row) throw new Failure('Empleado no encontrado.',404); return reply(row) }
      const query = String(b.query ?? '').toLowerCase().slice(0,200)
      const filtered = rows.filter(r => (!b.role || r.role === b.role) && (!b.status || r.active === (b.status === 'active')) && `${r.givenNames} ${r.familyNames} ${r.email} ${r.employeeCode}`.toLowerCase().includes(query))
      const offset = Math.max(0,Math.floor(Number(b.offset)||0))
      return reply({ employees: filtered.slice(offset,offset+50), total: filtered.length })
    }
    if (!['create','recover','update','state'].includes(b.action)) throw new Failure('Operación inválida.')
    let target: string | undefined
    let payload: ReturnType<typeof validate> | undefined
    if (b.action === 'create') {
      payload = validate(b)
      const duplicate = await sql`select id from public.staff where employee_code=${payload.employeeCode}`
      if (duplicate.length) throw new Failure('El código de empleado ya está registrado.',409)
      for (const sp of payload.specialties) {
        const found = await sql`select id from public.specialties where id=${sp}::bigint and active`
        if (!found.length) throw new Failure('Selecciona especialidades activas.')
      }
      if (typeof b.password !== 'string' || b.password.length < 12 || b.password.length > 128 || !/[A-Z]/.test(b.password) || !/[a-z]/.test(b.password) || !/\d/.test(b.password) || !/[^A-Za-z0-9]/.test(b.password)) throw new Failure('Contraseña: 12–128 caracteres, mayúscula, minúscula, número y símbolo.')
      const created = await admin.auth.admin.createUser({ email: payload.email, password: b.password, email_confirm: true, ban_duration: '876000h', app_metadata: { employee_pending: true, employee_payload: payload }, user_metadata: { first_name: payload.givenNames, last_name: payload.familyNames } })
      if (created.error) throw new Failure('No se pudo crear la cuenta. El correo puede estar registrado o la contraseña fue rechazada.',409)
      target = created.data.user.id
    } else if (b.action === 'recover') {
      const user = await admin.auth.admin.getUserById(text(b.requestId,36)); check(user)
      if (user.data.user?.app_metadata.employee_pending !== true) throw new Failure('Esta cuenta no tiene un alta pendiente.')
      target = user.data.user.id
      payload = validate(b.values ? { ...b.values, email:user.data.user.email } : user.data.user.app_metadata.employee_payload)
      if (b.values) check(await admin.auth.admin.updateUserById(target,{ app_metadata:{employee_payload:payload} }))
    }
    try {
      await sql.begin(async tx => {
        await tx`select set_config('request.jwt.claim.sub',${caller},true)`
        // Same order as planning and appointments: global lock before row locks.
        // Built-in PostgreSQL function; compatible before/after the planning SQL.
        await tx`select pg_catalog.pg_advisory_xact_lock(726391054201::bigint)`
        const allowed = await tx`select user_id from public.user_roles where user_id=${caller} and role='admin' and active for share`
        if (!allowed.length) throw new Failure('Permiso administrativo revocado.',403)
        if (target && payload) {
          await tx`select id from auth.users where id=${target} for update`
          const pending = await tx`select id from auth.users where id=${target} and raw_app_meta_data->>'employee_pending'='true'`
          if (!pending.length) throw new Failure('El alta ya fue completada. Actualiza el directorio.',409)
          await tx`update public.profiles set first_name=${payload.givenNames},last_name=${payload.familyNames},phone=${payload.phone},birth_date=${payload.birthDate||null}::date,city=${payload.city||null} where id=${target}`
          const role = payload.role === 'doctor' ? 'doctor' : 'recepcionista'
          await tx`select public.set_employee_role(${target}::uuid,${role}::public.hospital_role,${payload.active})`
          const [staff] = await tx`select public.upsert_staff(${target}::uuid,${payload.employeeCode},${role}) as id`
          await tx`update public.staff set active=${payload.active} where id=${staff.id}`
          await tx`delete from public.doctor_specialties where doctor_id=${staff.id}`
          for (const sp of payload.specialties) {
            const valid = await tx`select id from public.specialties where id=${sp}::bigint and active for share`
            if (!valid.length) throw new Failure('Una especialidad ya no está activa.')
            await tx`insert into public.doctor_specialties(doctor_id,specialty_id) values(${staff.id},${sp}::bigint)`
          }
        } else {
          const [staff] = await tx`select s.*,p.updated_at::text as version,s.xmin::text as staff_version from public.staff s join public.profiles p on p.id=s.profile_id where s.id=${text(b.id,36)}::uuid for update of s,p`
          if (!staff || !['doctor','recepcionista'].includes(staff.category) || staff.profile_id === caller) throw new Failure('Empleado no autorizado.',403)
          if (String(b.staffVersion) !== staff.staff_version) throw new Failure('El empleado cambió. Actualiza el directorio.',409)
          const admins = await tx`select user_id from public.user_roles where user_id=${staff.profile_id} and role='admin' and active`
          if (admins.length) throw new Failure('No se pueden editar administradores desde este módulo.',403)
          if (b.action === 'state') {
            if (typeof b.active !== 'boolean') throw new Failure('Estado inválido.')
            await tx`update public.staff set active=${b.active} where id=${staff.id}`
            await tx`select public.set_employee_role(${staff.profile_id}::uuid,${staff.category}::public.hospital_role,${b.active})`
          } else {
            if (String(b.personVersion) !== staff.version) throw new Failure('Los datos cambiaron. Actualiza el directorio.',409)
            const v=b.values ?? {}
            const [user] = await tx`select email from auth.users where id=${staff.profile_id}`
            const data=validate({ givenNames:v.given_names,familyNames:v.family_names,phone:v.phone,birthDate:v.birth_date??'',city:v.city??'',employeeCode:v.employee_code,email:user.email,role:staff.category==='doctor'?'doctor':'receptionist',specialties:v.specialties,active:staff.active })
            await tx`update public.profiles set first_name=${data.givenNames},last_name=${data.familyNames},phone=${data.phone},birth_date=${data.birthDate||null}::date,city=${data.city||null} where id=${staff.profile_id}`
            await tx`update public.staff set employee_code=${data.employeeCode} where id=${staff.id}`
            await tx`delete from public.doctor_specialties where doctor_id=${staff.id}`
            for (const sp of data.specialties) {
              const valid=await tx`select id from public.specialties where id=${sp}::bigint and active for share`
              if (!valid.length) throw new Failure('Especialidad inactiva.')
              await tx`insert into public.doctor_specialties values(${staff.id},${sp}::bigint)`
            }
          }
          await tx`insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(${caller},${b.action},'staff',${staff.id})`
        }
      })
      if (target) {
        // Auth is outside the SQL transaction. Keep durable recovery data until unban succeeds.
        const finished = await admin.auth.admin.updateUserById(target,{ ban_duration:'none', app_metadata:{ employee_pending:false,employee_payload:null } }); check(finished)
      }
    } catch (error) {
      if (target) throw new Failure(`Alta pendiente de recuperación. La cuenta sigue bloqueada. Reanuda desde el panel. Referencia: ${target}`,409)
      if (error instanceof Failure) throw error
      throw new Failure('No se guardaron los cambios. Comprueba el código único y actualiza el directorio.',409)
    }
    return reply({ success:true })
  } catch (error) {
    return new Response(JSON.stringify({ error:error instanceof Failure ? error.message : 'No se pudo procesar la solicitud.' }),{ status:error instanceof Failure ? error.status : 500,headers })
  }
})
