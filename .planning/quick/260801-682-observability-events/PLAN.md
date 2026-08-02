---
issue: 682
repo: golden-crow-website (backoffice)
---

# 260801-682 — el "extendido automático" en el feed, y tres eventos que faltaban

## Lo que pide el ticket

1. La fila de observability que muestra el screenshot es un **extendido automático** de una
   rutina recurrente, y el feed la titula como si alguien hubiera asignado un workout.
   "Chequear bien como es lo del extendido (que es correcto), pero representarlo como tal."
2. Sumar al feed: usuario nuevo, compra de suscripción, coach agrega un cliente.

## Qué es el extendido (verificado en el código iOS)

`ClientRoutineRepository.topUpRecurringSelfSeries` (iOS/GCFitness/Features/Workouts/ClientRoutinesView.swift)
+ `SelfRoutineHorizon` (GCFitnessCore):

- una rutina propia recurrente materializa **documentos reales**, 90 días hacia adelante;
- cada vez que la app tiene los assignments en memoria mira la cola de cada serie y, si baja
  de 45 días, **escribe sola** la próxima tanda hasta hoy + 90;
- el payload **replica el key set del create original** — mismo `scheduleStartCivil`, mismo
  `selfAssigned`, misma `recurrence`, sin ningún campo que lo marque.

O sea: el mecanismo está bien, pero es indistinguible de un alta a nivel wire. Por eso el feed
lo leía como "Se asignó un workout".

## Cómo se distingue sin tocar la app ni las rules

El ancla. `createSelfAssignments` estampa `scheduleStartCivil = startCivil ?? today`, y la hoja
de agendado sólo ofrece hoy o después → **en un alta real el ancla nunca está en el pasado al
momento de la escritura**. Una renovación copia el ancla ORIGINAL a documentos escritos meses
después. Con eso alcanza, es una propiedad del dato (no un marcador nuevo), y **clasifica lo
que ya está guardado en `audit_log`**, cosa que un campo nuevo no haría.

Margen de 2 días para absorber el desfasaje entre las fechas civiles del doc (timezone del
cliente) y `occurredAt` (UTC). Conservador a propósito: una renovación con ancla reciente queda
clasificada como alta normal antes que arriesgar llamar "automático" a algo que hizo una persona.

## Los tres eventos

| Pedido | Estado real | Acción |
|---|---|---|
| usuario nuevo | ya existía (`users` create → "Nuevo usuario"/"Nuevo coach") | sumar meta útil (`sin email (Apple)`, rol raro) |
| compra de suscripción | existía como "Cambió la suscripción" para compra, baja y override de admin — las tres con la misma frase | separar por dirección del tier + `source`; en una compra el actor es el usuario |
| coach agrega un cliente | **no existía ningún rastro** | evento nuevo `client_added` en `coach_activity` |

El tercero es el hueco real: `provisionClient` tiene dos ramas y ninguna dejaba rastro atribuible
al coach — la de pre-creado escribe en `user_mirror` (que ningún trigger de audit mira) y la de
usuario existente escribe el `/users/{uid}` del CLIENTE, así que esa fila se lee como que el
cliente cambió de coach.

## Tareas

1. `activity-feed-model.ts` — `isAutoExtendedOccurrence()` + rama en el create de
   `workout_assignments`; copia de suscripción por dirección; meta de usuario nuevo.
2. `coach-activity-log.ts` — kind `client_added` + `clientAddedEvent()`.
3. `user-actions.ts` — registrar el evento en las DOS ramas de `provisionClient` (best-effort).
4. `activity-feed-actions.ts` + `coach-activity-actions.ts` + `MyActivityFeed.tsx` + messages —
   copia, ícono, chip, filtro e i18n del kind nuevo.
5. Tests puros del modelo + test del reader para `client_added`.

## Gate

`npx jest` en `backoffice/` verde (menos el flake de locale ya conocido en
`client-activity-time`), `tsc --noEmit` limpio.
