# Hospital Universitario — guía de implementación

## Antes de ejecutar

1. Usa **un proyecto Supabase nuevo**, con PostgreSQL 15 o superior. El archivo SQL crea tipos, tablas, funciones y políticas; no es idempotente.
2. Abre **SQL Editor** y ejecuta todo `hospital_universitario_supabase.sql` como `postgres`.
3. Se crean **11 habitaciones y 17 camas** (5 VIP individuales y 6 semiprivadas dobles). Confirma esa capacidad antes de producción.
4. Configura `America/El_Salvador` en la interfaz para visualizar horas; los eventos se guardan en `timestamptz`.
5. En Supabase revisa **Data API / exposed schemas**. La instalación concede privilegios SQL explícitos a las tablas seleccionadas, pero la configuración de exposición del proyecto también debe permitir acceder a `public`.

## Primer administrador

El SQL **no crea cuentas con contraseñas**. Crea primero un usuario en Supabase Authentication (desde el dashboard o Auth Admin API), y después ejecuta en SQL Editor, sustituyendo el UUID:

```sql
UPDATE public.user_roles SET active=false WHERE user_id='UUID_DEL_ADMIN' AND role='paciente';
INSERT INTO public.user_roles(user_id,role,active)
VALUES ('UUID_DEL_ADMIN','admin',true)
ON CONFLICT(user_id,role) DO UPDATE SET active=true;
```

Esto debe hacerse una única vez como operación de bootstrap privilegiada. El trigger de `auth.users` asigna `paciente` a toda cuenta nueva para evitar escalamiento por metadatos. El administrador crea doctores y recepcionistas desde una **Edge Function autenticada** que verifica su rol en la base de datos y usa la **Auth Admin API** en el servidor; después llama a `set_employee_role` y `upsert_staff`. No coloques la clave secreta en iOS, Android ni web.

## RPC principales

- `register_patient(dui, phone, city)` — paciente autenticado, crea ficha y expediente.
- `create_walkin_patient(...)` — recepción, crea paciente presencial y expediente.
- `schedule_appointment(...)`, `cancel_appointment(...)`, `update_appointment_status(...)` — agenda.
- `request_admission(patient, kind, reason, instructions, encounter)` — doctor tratante.
- `assign_bed(admission, bed)` — recepción, exige orden y cama libre.
- `medical_discharge(admission, notes)` — doctor que ordenó el ingreso.
- `release_bed(admission)` — recepción, exige alta médica; cama pasa a limpieza.
- `set_bed_state(bed, state)` — admin, habilita cama tras limpieza.
- `dispense_item(item, qty)` y `add_inventory(medication, qty, reason)` — inventario.
- `dispatch_ambulance(request, staff)`, `complete_dispatch(dispatch, maintenance)` — administración.
- `publish_lab_result(order, summary, to_patient)` — administración; `reception_release_lab(order)` — recepción.

## Limitaciones importantes antes de producción

**Este archivo es un esquema inicial amplio, no una certificación de seguridad clínica ni un sistema hospitalario listo para producción.** Es necesario probar cada RLS con cuentas reales, comprobar concurrencia, habilitar copias de seguridad, implementar gestión de consentimientos y cumplir la normativa de datos sanitarios aplicable.

- **Archivos de laboratorio:** se incluye `lab_result_files.storage_path`, pero **no se crea un bucket ni políticas de `storage.objects`**. Hasta implementar un mecanismo seguro de subida/descarga con URL firmada desde un backend que compruebe la misma relación clínica, no expongas archivos clínicos.
- **Resultados de laboratorio:** `publish_lab_result` es una operación administrativa de ejemplo. En producción se necesita un rol específico de laboratorio o validación profesional y trazabilidad de resultados inmutables.
- **Datos personales y DUI:** son sensibles. Los permisos de lectura de `patients` para recepción y administración son amplios por necesidades operativas; conviene crear endpoints de búsqueda limitados, evitar descargas masivas y auditar accesos.
- **Roles y empleados:** crear usuarios con contraseña requiere una Edge Function/Auth Admin API. El SQL solo prepara los datos y la autorización; no crea esa función HTTP.
- **Ajustes de especialidades, horarios, turnos y medicamentos:** la mayoría de catálogos permiten CRUD de administración bajo RLS; las actualizaciones de stock deben hacerse con RPC para preservar bitácora. Desactiva registros históricos en vez de borrarlos.
- **Laboratorios, auditoría y notificaciones:** las tablas están preparadas, pero las integraciones externas de notificaciones push, validación de laboratorio y auditoría de lectura necesitan implementación adicional.
- **Control de horarios:** la función de agenda verifica horarios recurrentes, ausencias y consultorio; requiere cargar `doctor_schedules` y `doctor_consulting_rooms` antes de agendar.
- **Acceso clínico:** el acceso del doctor persiste para pacientes atendidos anteriormente. Si se necesita caducidad estricta, reemplaza esa regla por asignaciones temporales y auditoría de acceso.
- **Paciente presencial que luego crea cuenta:** el vínculo seguro de identidad necesita un procedimiento verificado; no debe hacerse solo por DUI.
- **Autenticación y privacidad:** no confíes en `raw_user_meta_data` para roles; aplica MFA al personal, contraseñas robustas, políticas de retención y auditorías periódicas.

## Consultas rápidas de verificación

```sql
SELECT kind, count(*) AS habitaciones FROM public.rooms GROUP BY kind;
SELECT count(*) AS camas FROM public.beds;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='patients';
SELECT * FROM public.ambulances;
```

Resultados esperados: 5 VIP, 6 semiprivadas, 17 camas, RLS habilitado, AMB-001 disponible.
