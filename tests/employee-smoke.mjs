// Run with: node --env-file=.env.local tests/employee-smoke.mjs
// Passwords and access tokens exist only in this process's memory.
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const tag = randomUUID().slice(0,8)
const password = () => `Aa1!${randomBytes(24).toString('hex')}`
const adminToken = process.env.HOSPITAL_TEST_ADMIN_ACCESS_TOKEN
async function invoke(action,data={},session=adminToken ?? '') {
  const response = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/manage-employees`,{method:'POST',headers:{apikey:process.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${session}`,'Content-Type':'application/json'},body:JSON.stringify({action,...data})})
  return {status:response.status,body:await response.json()}
}
try {
  assert.equal((await invoke('list',{},'invalid')).status,401)
  assert.equal((await invoke('create',{},'')).status,401)
  console.log('PASS: missing and invalid credentials rejected')
  if (!adminToken) { console.log('SKIP authenticated smoke tests: set HOSPITAL_TEST_ADMIN_ACCESS_TOKEN only in process memory using a test admin session.'); process.exit(0) }
  const catalogs=await invoke('catalogs'); assert.equal(catalogs.status,200,JSON.stringify(catalogs.body))
  assert.ok(catalogs.body.specialties.length,'A seeded active specialty is required')
  for(const role of ['doctor','receptionist']) {
    const initial=password()
    const values={requestId:randomUUID(),givenNames:'Prueba',familyNames:role,email:`employee-smoke-${role}-${tag}@example.com`,password:initial,phone:'70000000',birthDate:'1990-01-01',city:'Ciudad de prueba',employeeCode:`SMOKE-${role}-${tag}`,role,specialties:role==='doctor'?[catalogs.body.specialties[0].id]:[],active:true}
    const created=await invoke('create',values)
    assert.equal(created.status,200,JSON.stringify(created.body))
    const list=await invoke('list',{query:values.employeeCode})
    assert.equal(list.body.total,1)
    let employee=list.body.employees[0]
    console.log(`CREATED_TEST_UUID=${employee.profileId}`)
    assert.equal(employee.role,role); assert.equal(employee.active,true)
    assert.equal(employee.specialties.length,role==='doctor'?1:0)
    const other=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const signed=await other.auth.signInWithPassword({email:values.email,password:initial}); assert.ifError(signed.error)
    assert.equal((await invoke('list',{},signed.data.session.access_token)).status,403)
    const escalation=await other.rpc('set_employee_role',{p_user:employee.profileId,p_role:'admin',p_active:true})
    assert.ok(escalation.error,'Employees cannot promote themselves')
    const roles=await other.from('user_roles').select('role').eq('active',true)
    assert.deepEqual(roles.data.map(r=>r.role),[role==='doctor'?'doctor':'recepcionista'])
    const updated=await invoke('update',{id:employee.id,staffVersion:employee.staffVersion,personVersion:employee.personVersion,values:{given_names:'Prueba editada',family_names:role,phone:'70000001',birth_date:'1990-01-01',city:'Ciudad actualizada',employee_code:values.employeeCode,specialties:values.specialties}})
    assert.equal(updated.status,200,JSON.stringify(updated.body))
    employee=(await invoke('detail',{id:employee.id})).body
    assert.equal(employee.givenNames,'Prueba editada')
    const state=await invoke('state',{id:employee.id,active:false,staffVersion:employee.staffVersion})
    assert.equal(state.status,200,JSON.stringify(state.body))
    assert.equal((await invoke('detail',{id:employee.id})).body.active,false)
    const inactiveRoles=await other.from('user_roles').select('role').eq('active',true)
    assert.deepEqual(inactiveRoles.data,[])
    console.log(`PASS ${role}: create, profile, role, specialties, edit, deactivate, access denial, escalation denial`)
    await other.auth.signOut()
  }
  console.log('PASS all employee smoke tests. Remove only the temporary test UUIDs using privileged cleanup.')
} finally { /* Never sign out the supplied administrative session. */ }
