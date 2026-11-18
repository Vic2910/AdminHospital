# Gestión de empleados simplificada — entrega pendiente de autorización

Esta guía sustituye la propuesta anterior que incluía eliminación. No se ha desplegado la función ni el frontend en producción, no se han modificado empleados reales y no se ha obtenido una sesión administrativa para verificar la versión remota.

## Operaciones conservadas

- Ver ficha: `detail`, con datos personales, código, cargo, especialidades, contacto y estado. Sin credenciales.
- Editar: `update`, con versiones del registro y código original para compatibilidad con el backend anterior. Se comprueban los datos devueltos antes de confirmar y se actualiza el directorio. No crea cuentas ni cambia código, correo, cargo o contraseña.
- Desactivar/reactivar: `state`, con lectura confirmada del estado persistido. La versión preparada bloquea nuevos inicios de sesión al desactivar y restituye únicamente el bloqueo gestionado por este módulo al reactivar. Conserva bloqueos independientes, código, perfil e historial.

El directorio tiene únicamente ficha, edición y el icono de desactivar o reactivar según el estado. Se retiraron el icono, modal, estado local y envío de `delete`; también la acción de horarios de este directorio. Los módulos de horarios y su navegación no fueron modificados. La Edge Function nueva no realiza bajas ni borrados de empleados: las llamadas antiguas a `delete` reciben 410 con un mensaje explícito, sin escrituras. Los paquetes anteriores son históricos y no representan esta entrega.

## Consecuencias de desactivar

`detail` incorpora solo cantidades de citas en estados programada/confirmada/en_atencion, pacientes con asignaciones de equipo vigentes y consultas abiertas. El diálogo muestra esas cantidades y explica que no se cancelan citas, reasignan pacientes ni cierran consultas automáticamente. Si existen asignaciones, exige reconocer la revisión de cobertura. Dentro de la transacción de `state`, el servidor vuelve a consultar los datos; si cambiaron o no fueron reconocidos, rechaza la operación. Ningún registro clínico se modifica.

Se rechaza cualquier operación sobre la cuenta propia y cualquier cuenta que tenga un rol administrador, esté activo o no. Esta protección es más estricta que impedir desactivar al último administrador: ninguna cuenta administradora puede desactivarse desde este módulo.

## Contrato y disponibilidad real

Contrato final preparado: `employees-2026-11-status-v3`. La función exacta a desplegar es **`manage-employees`**, desde `supabase/functions/manage-employees/index.ts`, junto con sus dependencias locales `contract.ts` y `validation.ts`. No requiere SQL de esquema ni políticas nuevas.

Acciones de gestión: `detail`, `update`, `state`; además siguen las de registro y catálogo existentes. `catalogs` y `contract` anuncian `auth-state-control`, `deactivation-impact`, `live-role-revocation` y `restore-authorized-roles`. Los dos primeros son los indicadores que utiliza el frontend actual; `detail` devuelve `impact` y `state` devuelve el empleado confirmado con sus versiones. Se comprobaron estos formatos en las pruebas locales.

Desactivar bloquea Auth, marca `staff.active=false` y revoca todos los roles laborales activos del perfil (sin tocar su rol de paciente, si existiera). Guarda en metadatos administrativos la lista de roles autorizados previa al bloqueo. Reactivar restaura únicamente filas existentes de esa lista, sin insertar roles, y conserva los roles que ya estaban inactivos. El cargo existente sirve de compatibilidad para cuentas previamente desactivadas sin esa lista. Se verifican la revocación y la lectura del empleado antes de confirmar la transacción; un fallo revierte todo. Se mantiene la protección de administradores, cuenta propia y bloqueos ajenos.

Las sesiones que ya tienen JWT pierden sus permisos laborales porque `private.has_role` consulta `user_roles.active` y `private.my_staff_id` exige `staff.active`. No se confía en los roles antiguos del token. Esto no invalida criptográficamente el JWT ni modifica políticas de lectura pública o del perfil propio. No se borra ninguna cuenta Auth, perfil, cita, expediente o registro histórico.

Si el servidor no confirma bloqueo Auth o no devuelve las asignaciones, el icono sigue visible pero la confirmación de desactivación queda bloqueada con una explicación. La función preparada aporta precisamente esas capacidades; hasta desplegarla, el mensaje del frontend puede continuar apareciendo.

Ficha y edición usan operaciones que ya existían y conservan el formato requerido, pero no fueron verificadas contra el proyecto remoto en esta tarea. El bloqueo Auth, la reactivación protegida y la advertencia de asignaciones requieren desplegar esta versión preparada. El bloqueo de nuevos ingresos no invalida instantáneamente JWT existentes; sus permisos laborales se retiran mediante `staff` y el rol. Las políticas propias de perfil permanecen sin cambios.

No se modificaron tablas, políticas RLS ni otros módulos. Las pruebas locales usan dependencias en memoria y no sustituyen una prueba real de SQL o de login. No se realizaron escrituras remotas.

## Validación y publicación propuesta

Ejecutar `npm.cmd run build` y `node --test tests/employee-management.test.mjs tests/employee-editing.test.mjs tests/employee-validation.test.mjs` (28 pruebas locales). El script `scripts/Prepare-EmployeeActionsRelease.ps1` prepara `.private-backups/employee-status-final-v4.zip`, con frontend, función, dependencias locales, configuración, preflight de solo lectura y manifiesto SHA-256, sin archivos de entorno ni sesiones. Esta entrega no requiere publicar un frontend nuevo si la versión que ya está publicada coincide con el contrato local comprobado; se debe confirmar eso antes del despliegue.

Comando previsto, **solo después de la autorización y de confirmar el proyecto y acceso**: `supabase functions deploy manage-employees --project-ref REFERENCIA_CONFIRMADA --no-verify-jwt`. Se mantiene `verify_jwt=false` porque el handler valida la sesión con Auth y el rol administrativo en PostgreSQL. Los secretos existentes `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_DB_URL` deben seguir configurados en esa función; no se incluyen en el paquete.

Antes de cualquier publicación: obtener acceso administrativo, confirmar proyecto, respaldar las versiones publicadas y verificar los contratos realmente utilizados. Probar en un proyecto separado con cuentas controladas. Solicitar autorización explícita antes de producción. Publicar de manera coordinada el frontend sin eliminación y la función correspondiente; no ejecutar SQL de esquema. No desplegar paquetes anteriores que incluían la baja administrativa.

Comprobar la función candidata mediante `node --env-file=.env.local scripts/check-employee-contract.mjs --project-ref=REFERENCIA_PRUEBAS`, con `HOSPITAL_TEST_ADMIN_ACCESS_TOKEN` solo en la memoria del proceso y variables públicas apuntando a pruebas. Este script solo consulta `contract`; no cambia empleados ni imprime credenciales.

Archivos principales: `EmployeesPage.tsx`, `EmployeesPage.css`, `EmployeeActionButton.tsx`, `EmployeeStateDialog.tsx`, `employees.ts`, `manage-employees/index.ts`, `contract.ts`, pruebas de gestión y los scripts de preparación/preflight. Se retiró `EmployeeDeleteDialog.tsx`.
