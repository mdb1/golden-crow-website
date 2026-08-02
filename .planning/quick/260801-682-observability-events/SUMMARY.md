---
status: complete
issue: 682
repo: golden-crow-website (backoffice)
---

# 260801-682 — el extendido automático deja de disfrazarse de asignación

## El hallazgo

La fila del screenshot no era un bug de copy: era un evento que **nadie generó**. Una rutina
propia recurrente materializa documentos reales 90 días hacia adelante, y cuando la cola baja de
45 días la app escribe sola la próxima tanda (`topUpRecurringSelfSeries` +
`SelfRoutineHorizon.datesToTopUp`). El payload replica el key set del create original — mismo
`scheduleStartCivil`, mismo `selfAssigned`, misma `recurrence`, **sin ningún campo que lo marque**.
El feed no tenía cómo saberlo, así que lo tituló "Se asignó un workout" y se lo atribuyó al
atleta, meses después de que hubiera agendado la rutina.

El mecanismo está bien (lo confirmé leyendo el writer y el planner puro). Lo que estaba mal era
la representación.

## Cómo se detecta sin tocar la app, las rules ni los datos

**El ancla.** `createSelfAssignments` estampa `scheduleStartCivil = startCivil ?? today` y la hoja
de agendado sólo ofrece hoy o después → en un alta real el ancla nunca está en el pasado al
momento de escribir. Una renovación copia el ancla ORIGINAL a docs escritos meses más tarde.

Elegí eso por sobre agregar un campo marcador porque:

- es una propiedad del dato, no un contrato nuevo entre app / rules / backoffice;
- **clasifica lo que ya está guardado en `audit_log`** — un marcador nuevo sólo serviría de acá
  en adelante, y el operador está mirando el historial;
- no toca `firestore.rules` (el create de assignments es la ruta más delicada que hay).

Margen de 2 días para el desfasaje fecha-civil-del-cliente vs `occurredAt` en UTC. Deliberadamente
conservador: una renovación con ancla reciente queda como alta normal (falso negativo) antes que
llamar "automático" a algo que hizo una persona (falso positivo).

La fila ahora dice **"Se extendió sola una rutina recurrente"**, con la cadencia, el rango de
ocurrencias nuevas, `serie desde <ancla>` y `renovación automática del horizonte` — y **sin actor**,
porque el feed ya aprendió en #671 que atribuirle a alguien una acción que no hizo es peor que
dejar la fila sin nombre.

## Los tres eventos pedidos: dos existían, uno no

| Pedido | Antes | Ahora |
|---|---|---|
| usuario nuevo | ya salía ("Nuevo usuario" / "Nuevo coach") | + meta `sin email (Apple)` y el rol cuando no es client/trainer |
| compra de suscripción | "Cambió la suscripción" para **compra, baja y override de admin** por igual | "Compró una suscripción" / "Se quedó sin suscripción" / "Le activaron…" / "Le dieron de baja…" según dirección del tier y `source`; en una compra el **actor es el usuario** (aunque la escritura entre por el webhook), en un override de admin no |
| coach agrega un cliente | **nada** | evento nuevo `client_added` |

El tercero era el hueco real. `provisionClient` tiene dos ramas y ninguna dejaba rastro
atribuible al coach:

- la de **pre-creado** escribe `/user_mirror/{email}`, y `user_mirror` **no está en
  `MONITORED_COLLECTIONS`** del trigger de audit → invisible;
- la de **usuario existente** escribe el `/users/{uid}` del CLIENTE → esa fila se lee como que el
  cliente cambió de coach, no como que el coach lo agregó.

Ahora las dos ramas escriben un `coach_activity` con kind `client_added`, best-effort (una falla
de logueo no puede convertir un alta exitosa en un error para el coach). Aparece en el feed de
admin **y** en "Mi Actividad" del coach, con ícono, chip, filtro e i18n ES/EN.

`eventId` = `client:{coachUid}:{email}` — re-agregar a la misma persona después de un unlink pisa
la fila anterior en vez de apilar duplicados.

## Archivos

| Archivo | Qué |
|---|---|
| `activity-feed-model.ts` | `isAutoExtendedOccurrence()` + rama nueva en el create de assignments; copia de suscripción por dirección; meta de usuario nuevo |
| `coach-activity-log.ts` | kind `client_added` + `clientAddedEvent()` |
| `user-actions.ts` | registro del evento en las dos ramas de `provisionClient` |
| `activity-feed-actions.ts` | categoría / copia / acción / supresión de subject del kind nuevo |
| `coach-activity-actions.ts`, `MyActivityFeed.tsx`, `messages/{es,en}.json` | tipo, ícono, chip, filtro, labels |
| `__tests__/activity-feed-model.test.ts` | 3 tests nuevos (renovación, alta real, los tres no-casos) + el de suscripción actualizado |
| `__tests__/activity-feed-actions.test.ts` | `client_added` con `pendingEmail` y sin uid |

## Gate

`npx jest` en `backoffice/`: **1013 passed, 1 failed** — el failed es el flake de locale ya
conocido y documentado en `client-activity-time.test.ts` (verde en CI, rojo en máquinas con
locale ≠ en-US). `tsc --noEmit` limpio.

## Lo que queda anotado

- `user_mirror` sigue fuera de `MONITORED_COLLECTIONS`. Acá se resolvió por el lado del evento de
  coach, que es el correcto (nombra a quien actuó); sumar la colección al trigger es otra decisión,
  de costo, y no hacía falta para este ticket.
- La detección del extendido es una heurística por diseño. Si en algún momento se agrega un campo
  marcador al payload del top-up, `isAutoExtendedOccurrence` debería preferirlo y dejar el ancla
  como fallback para lo histórico.
