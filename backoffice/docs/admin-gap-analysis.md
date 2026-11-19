# Admin — qué muestra cada página y qué datos faltan (golden-crow-website#534)

Pedido del dueño (2026-11-18): «Necesito que básicamente todas las páginas que tenemos hoy en
día en admin muestren más info». Esta es la foto al 2026-11-18 sobre `feat/2.3.0` (con #531
`/admin/usage` y #532 audit ya mergeados). Datos verificados contra `firestore.rules` de
gc-fitness `origin/feat/2.3.0` y la capa de datos del backoffice.

**Prioridad** = utilidad para manejar el negocio: 💰 plata, 📈 engagement, ⚠️ riesgo.
**Estado**: ✅ hecho en #534 (PRs #539 / #540) · ✅² hecho en #541 · 🔜 PR 2 de #534 (ya mergeado) · 📋 follow-up.

## 1. Ficha del coach — `/admin/coaches/[uid]`

Antes: acceso (activo / dado de baja), 6 contadores (clientes, rutinas, ejercicios,
asignaciones, hábitos, chats), clientes vinculados (nombre, email, uid, activo/borrado +
acciones), borrado en cascada, pendientes (`user_mirror`: email, nombre), operaciones admin.

| Falta (dato que existe) | Fuente | Prioridad | Estado |
|---|---|---|---|
| Planes de cobro: nombre, tipo, precio, período/clases, archivado, **# clientes en cada uno** | `coach_payment_plans` + `client_billing.planId` | 💰 alta | ✅ |
| Clientes al día / por vencer / vencidos / sin plan | `client_billing` + gemelo `billing.ts` | 💰 alta | ✅ |
| Pagos recibidos: quién, cuánto, cuándo, medio, qué cubre, plan, anulados, ex-clientes | `client_payments` (12 meses, ≤ 1000) | 💰 alta | ✅ |
| Cobrado por mes (gráfico + tabla), total 12 meses, cobrado este mes | `client_payments` | 💰 alta | ✅ |
| Ingreso mensual esperado (planes periódicos prorrateados) | `client_billing` | 💰 media | ✅ |
| **Por cliente**: última actividad (entreno / hábito / foto / Corvo / abrió la app) | `users.lastWorkoutAt` (#1615), `client_stats`, `ai_coach.lastMessageAt`, Auth `lastRefreshTime` | 📈 alta | ✅ |
| Por cliente: plan, monto, estado, último pago, próximo vencimiento, clases restantes | `client_billing` | 💰 alta | ✅ |
| Por cliente: cumplimiento semanal, entrenos del mes | `client_stats` (cache del roster, #506) | 📈 alta | ✅ |
| Por cliente: plan de nutrición vigente + adherencia 7 días | `nutrition_plans` / `nutrition_logs` (`loadNutritionRosterSummaries`) | 📈 media | ✅ |
| Por cliente: uso de Corvo (turnos, último uso), premium, fecha de alta | `ai_coach`, `users.entitlement`, Auth `creationTime` | 📈 media | ✅ |
| Tabla **ordenable** por nombre, actividad, cobro, vencimiento, último pago, cumplimiento, Corvo, alta | — | 📈 alta | ✅ |
| KPIs: activos 7 días, inactivos +30 días, vencidos, cobrado este mes, esperado mensual | derivado | 📈💰 alta | ✅ |
| Nutrición: plantillas, planes cargados, clientes con plan vigente / vencido, adherencia promedio | `nutrition_templates`, `nutrition_plans` | 📈 media | ✅ |
| Hábitos: asignados activos vs archivados, plantillas propias | `habits`, `habit_templates` (count) | 📈 media | ✅ |
| Desafíos del coach: fechas, unidos / invitados, quién va primero, estado, oculto | `social_challenges` (`origin == coach`) | 📈 media | ✅ |
| Checklist: pendientes / vencidos / hechos + próximos | `users/{uid}/coach_checklist` | 📈 baja | ✅ |
| Invitaciones: fecha de carga + estado del mail (enviado / falló / no enviado) | `user_mirror.inviteEmail*` | ⚠️ alta | ✅ |
| Corvo de sus clientes: cuántos lo usan, activos 7 días, turnos, consentimiento | `ai_coach` | 📈 media | ✅ |
| Social del coach: usuario, visibilidad, suspendido, rutinas publicadas | `social_profiles`, `public_routines` | baja | ✅ |
| Actividad del coach: última acción en el portal, último login, última vez que abrió la app, versión de app, suscripción propia, zona horaria | `coach_activity`, Auth, `fcm_tokens` | ⚠️ media | ✅ |
| Link «Ver en el audit» filtrado por este coach (y por cobros) | `/admin/audit?coach=…&cat=billing` (#532) | — | ✅ |
| Chats sin leer por cliente / tiempo de respuesta del coach | `chats.unreadCount`, `lastMessageAt` | 📈 media | 📋 |
| Mensajes masivos enviados (#500) | callable → `chats/*/messages` (sin colección propia) | baja | 📋 (no hay dónde leerlo sin escanear mensajes) |
| Resúmenes de IA del coach (costo / semanas) | `coach_ai_summaries/{coachId}` | baja | 📋 |
| «Link de invitación» del coach | no existe como dato: la invitación es el mail de `user_mirror` | — | n/a |

Lecturas nuevas por vista (N = clientes): ≈ 18 queries fijas + ⌈N/30⌉×4 (`in` por documentId /
clientId) + ⌈N/100⌉ Auth `getUsers`. Sin `getAll`, sin fan-out por cliente. Todas usan índices
existentes (`client_payments (coachId, paidCivil DESC)`, `coach_activity (trainerId, occurredAt
DESC)`) o igualdades. Además se sacó el `listCoachesForAdmin()` que corría 2 veces por vista
(4 lecturas × TODOS los coaches) — ahora la ficha lee sólo este coach y el selector de
transferencia usa `listCoachOptionsForAdmin` (una query proyectada).

## 2. Ficha del cliente con coach — `/admin/coaches/[uid]/clients/[clientId]`

Hoy: encabezado (nombre, uid, «solo lectura», coach), actividad reciente (paginada), asignaciones,
hábitos (nombre, cadencia, recordatorio, activo/borrado), nutrición (card compartida), fotos.

| Falta (dato que existe) | Fuente | Prioridad | Estado |
|---|---|---|---|
| **Cobro**: plan, monto, estado, vencimiento, clases, último pago + historial de pagos | `client_billing`, `client_payments (coachId, clientId, paidCivil)` | 💰 alta | 🔜 |
| Cuenta: alta, último login, última vez que abrió la app, **versión de app / plataforma**, zona horaria, cumpleaños | Auth, `fcm_tokens`, `users` | ⚠️ alta | 🔜 |
| Suscripción (tier, fuente, vence) | `users.entitlement` | 💰 media | 🔜 |
| Tiles de actividad (último entreno / hábito / foto / peso; 7 d / 30 d) — el perfil sin coach ya los tiene | `workout_logs`, `habit_logs`, `progress_photos`, `body_weight_logs` | 📈 alta | 🔜 |
| Peso corporal, PRs, progreso por ejercicio, calendario del mes, tendencias, volumen muscular (los loaders `*AsAdmin` ya existen y aceptan el coach) | varios | 📈 alta | ✅ peso / PRs (#540) · ✅² calendario, tendencias, volumen, progreso por ejercicio |
| Objetivos (incl. los del cliente), notas privadas del coach (cantidad) | `client_goals`, `client_notes` | 📈 media | 🔜 |
| Corvo: turnos, último uso, consentimiento (y de fotos), reportes | `ai_coach`, `ai_coach/{uid}/reports` | 📈 media | 🔜 |
| Chat: última conversación, sin leer | `chats/{clientId}` | 📈 media | 🔜 |
| Hábitos archivados (`archivedOn` / `archivedPeriods`) en vez de sólo borrado | `habits` | baja | ✅² |
| Social: perfil, seguidores, desafíos, rutinas públicas, suspensión | `social_*` | baja | ✅² |
| Link «Ver en el audit» filtrado por este cliente | `/admin/audit?client=…` | — | 🔜 |

## 3. Usuarios sin coach — lista `/admin/coach-less-users` y perfil `[uid]`

Lista hoy: usuario, suscripción (tier, fuente, vence), # rutinas / hábitos / fotos / sesiones,
alta, acciones. Perfil hoy: 18 secciones (cuenta con dispositivos, suscripción, actividad por
stream, rutinas, hábitos, programados, calendario, actividad reciente, tendencias, volumen,
progreso por ejercicio, PRs, adherencia, nutrición, peso, fotos).

| Falta | Fuente | Prioridad | Estado |
|---|---|---|---|
| Lista: última actividad / último login (churn) y orden por ella | Auth, `users.lastWorkoutAt` | 📈 alta | 📋 |
| Lista + perfil: uso de Corvo (turnos, consentimiento) — es el embudo free → premium | `ai_coach` | 💰 alta | 🔜 perfil / 📋 lista |
| Perfil: objetivos propios | `client_goals (clientOwned)` | media | 🔜 |
| Perfil: social (perfil, seguidores, desafíos con amigos) | `social_*` | media | ✅² |
| Historial de RevenueCat (compras, renovaciones, cancelaciones) | `revenuecat_events` | 💰 media | ✅² (perfil + ficha del cliente) |
| Pasos / altura | `daily_steps`, `height_logs` | baja | 📋 |

## 4. Home del admin — `/admin`

Hoy: accesos, allowlist, promover admin, tabla de coaches (nombre/email, uid, roles, # clientes,
rutinas, ejercicios), borrado de coach.

| Falta | Fuente | Prioridad | Estado |
|---|---|---|---|
| Badge «dado de baja» (ya viene en la fila, `coachDisabled`) | `users.coachDisabled` | ⚠️ media | ✅² |
| Por coach: vencidos / cobrado del mes, última actividad, invitaciones fallidas | `client_billing`, `client_payments`, `coach_activity`, `user_mirror` | 💰 alta | 📋 (lo cubre la ficha; en la tabla cuesta N coaches × queries) |
| KPIs arriba (premium activos, MAU) | `usage_daily` | media | 📋 (están en `/admin/usage`) |
| La tabla hace 4 lecturas × coach en cada vista | — | costo | 📋 |

## 5. Búsqueda de usuarios — `/admin/users`

| Falta | Prioridad | Estado |
|---|---|---|
| Un usuario sin coach no tiene link a su perfil (`/admin/coach-less-users/[uid]`) | ⚠️ alta | ✅² |
| Buscar también por nombre (`displayName` ya está proyectado) | media | ✅² |
| Alta / último login, vencimiento de la suscripción, invitado, coach dado de baja | baja | 📋 |

## 6. Corvo — `/admin/corvo` (+ reportes)

Hoy: turnos, activos, costo, latencia, errores, cuota, prescreen, propuestas, cerca de la cuota,
reportes con triage.

| Falta | Prioridad | Estado |
|---|---|---|
| Consentimiento (`consentVersion`, `photosConsentAt`): cuántos aceptaron | media | 📋 |
| Uso por segmento (premium / free / coached) → conversión | 💰 alta | 📋 (`usage_daily` ya trae segmentos) |
| Top usuarios por costo | media | 📋 |

## 7. Uso — `/admin/usage` (#531)

| Falta | Prioridad | Estado |
|---|---|---|
| `premium.renewals` / `cancellations` / `expirations` se decodifican y no se muestran | 💰 alta | ✅² (renovaciones en el tile de compras + tile «Bajas de premium») |
| Altas por segmento como KPI | media | 📋 |
| Monto cobrado por los coaches (hoy sólo el conteo `payments_recorded`) | 💰 media | 📋 |

## 8. Audit — `/admin/audit` (#532, otro agente)

Fuera de este PR. Desde las fichas se enlaza con `?coach=` / `?client=` / `&cat=billing`.
Pendiente para ese dueño: `coach_activity` y `revenuecat_events` como fuentes.

## 9. Higiene — `/admin/hygiene`

| Falta | Prioridad | Estado |
|---|---|---|
| El escaneo tiene tope de 120 docs por colección sin avisar que cortó | ⚠️ alta | ✅² (aviso por colección + arreglados los falsos «huérfanos» pasado el tope en logs y ejercicios) |
| Huérfanos de `client_billing` / `client_payments`, `nutrition_plans`, `habits`, `client_goals`, `client_notes`, `client_stats`, `user_mirror` viejos | media | 📋 |

## 10. Moderación — `/admin/moderation`

| Falta | Prioridad | Estado |
|---|---|---|
| Historial del infractor (otros reportes contra el mismo dueño, suspensiones previas) | media | 📋 |
| Bloqueos (`social_blocks`), cuenta del que reporta | baja | 📋 |

## 11. Actividad de coaches — `/admin/coach-activity`

| Falta | Prioridad | Estado |
|---|---|---|
| Lee eventos DERIVADOS de 4 colecciones; no usa `coach_activity` (cobros, nutrición, chat) | 📈 alta | ✅² (log real arriba, con filtro por coach) |
| Estado del mail en «cliente pre-cargado» | media | 📋 |
| Filtro por coach / fecha | baja | ✅² (por coach) |

## 12. Configuración de app — `/admin/app-config`

| Falta | Prioridad | Estado |
|---|---|---|
| Distribución de versiones instaladas (`users/*/fcm_tokens.appVersion/appBuild/platform`): cuántos quedan bloqueados al subir `minBuild` | ⚠️ alta | ✅² (un `collectionGroup` proyectado ≤ 5000 tokens al abrir la página + simulador; si se llega al tope, un rollup diario en functions) |

## 13. Foto / entreno del cliente (subrutas)

| Falta | Prioridad | Estado |
|---|---|---|
| Entreno: marcar los PRs de esa sesión, métricas (`workout_logs/*/metrics`) | baja | 📋 |
| Fotos: peso del mismo día | baja | 📋 |
