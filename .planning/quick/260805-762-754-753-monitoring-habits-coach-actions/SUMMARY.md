---
task: 762-754-753-monitoring-habits-coach-actions
issues: 762, 754, 753 (mdb1/gc-fitness)
status: done — un PR, tres tickets; el índice de Firestore va aparte (otro repo)
---

# #762 + #754 + #753 — hábitos en Monitoring, el coach del cliente, y bajas por el coach

## #762 — "Monitoring: faltan hábitos"

Eran **dos causas independientes**, y arreglar una sola dejaba el ticket a medias.

### Causa 1 — los ticks de hábito no entraban por NINGUNA fuente

Marcar un hábito escribe en `habit_logs`, y `habit_logs` **no está en
`MONITORED_COLLECTIONS`** (`functions/src/audit/onAuditableWrite.ts`), así que no hay fila de
`audit_log` que lo cuente. El feed leía cuatro fuentes y ninguna era esa: la acción de cliente
más frecuente de toda la app no tenía por dónde llegar.

Medido contra prod: **44 ticks en 7 días** (6–11 por día), invisibles.

**Arreglo**: quinta fuente `habit_logs`, leída directo — el mismo tratamiento que ya tenía
`progress_photos`, y por la misma razón. Una fila por tick:

```
Marcó un hábito · Tomar agua                      (value: true)
Desmarcó un hábito · Movilidad!                   (deleted: true)
Marcó un hábito · Bb · día 2026-08-04             (tick con fecha atrasada)
```

Detalles que importan:

- **El nombre sale de un point read** a `habits/{habitId}`: el doc del tick sólo trae el id.
  Va por la hidratación bounded que ya existe (`resolveEntityNames`), o sea DESPUÉS de filtrar
  — un filtro angosto cuesta un puñado de reads, no cien.
- **Ordena por `createdAt`, no por `civilDate`**: el feed es una línea de tiempo de cuándo
  PASARON las cosas. Un tick atrasado ("marqué el hábito de ayer") tiene un día civil más viejo
  que el momento en que se escribió, y ahí el `día YYYY-MM-DD` del meta es justamente el dato.
  Cuando coinciden no se imprime: repetiría el encabezado de día bajo el que ya está la fila.
- **Destildar NO es una eliminación** (`isDeletion: false`). Es el cliente cambiando de opinión;
  meterlo en la pestaña Eliminaciones, al lado de cuentas dadas de baja y series de workouts
  borradas, es ruido.

### Causa 2 — la ventana de `audit_log` la copaban las asignaciones

`audit_log` es UNA colección escrita por un trigger por colección monitoreada, y los ritmos de
escritura no se parecen en nada. Medido en prod, en **una ventana de 24 h**:

| colección | filas |
|---|---|
| `workout_assignments` | 337 |
| `users` | 45 |
| `workout_logs` | 15 |
| `habits` | **3** |

Una sola query `orderBy(occurredAt).limit(400)` tapa **~24 horas** y es ~85% escrituras de
asignaciones (una serie recurrente materializa un doc por ocurrencia, y el horizonte de 90 días
de las rutinas propias se renueva solo en ráfagas). Todo lo de bajo volumen —los hábitos antes
que nada— se cae del final y **no está**. Eso también hacía inútil cualquier filtro por tipo:
filtrar una ventana hambreada sigue sin mostrar nada.

**Arreglo**: además de la ventana global, cada colección monitoreada tiene la suya
(`PER_COLLECTION_CAP = 120`), y se mergean deduplicando por id de doc. Como la concatenación ya
no queda globalmente ordenada, se re-ordena antes de devolver: `groupRecurringAuditEntries`
colapsa escrituras hermanas ADYACENTES y `findRecurrenceEdits` aparea un delete con el create de
al lado — las dos leen el orden como significado, y una lista desordenada deja de colapsar en
silencio.

> ⚠️ **Necesita un índice compuesto** `audit_log (collection ASC, occurredAt DESC)`, declarado en
> `gc-fitness/firestore.indexes.json` (otro repo → otro PR). **Mientras no esté deployado, las
> queries por colección fallan y el feed degrada exactamente al comportamiento anterior** —
> verificado contra prod: `FAILED_PRECONDITION`, cada query es fail-soft, la global sigue viva.
> O sea que este PR es seguro de mergear antes que el índice; simplemente no rinde hasta que esté.

### Quick filters

El `<select>` de "Tipo de evento" pasó a ser una fila de checkboxes, **todos marcados por
defecto**, sobre `?cat=` repetido.

Dos decisiones que parecen detalles y no lo son:

- **Conjunto vacío = sin filtro.** HTML no manda los checkbox destildados, así que un form
  intacto y un form con todo destildado llegan idénticos; la única lectura sana de ambos es
  "mostrá todo".
- **`other` no tiene checkbox**, y con todo tildado se manda `categories: []` en vez de las 9.
  Si no, mandar el form sin tocar nada escondería los eventos `other` — que son justamente los
  de una colección que este reader todavía no conoce. Un tipo de evento nuevo se queda visible.

## #754 — quién es el coach del cliente

`/gc-fitness/admin/coaches/{uid}/clients/{clientId}` nombraba al coach en ningún lado: el único
puntero era un "Back to coach" genérico, así que al caer ahí desde una búsqueda o desde
Monitoring no había forma de saber quién era sin editar la URL.

Ahora el header trae `Coach: <nombre> · <email>` linkeado y un botón "Ver coach". Point read
fail-soft: si el doc del coach no está, degrada al uid — nunca a un 404 del perfil del cliente.

## #753 — el coach puede sacarse clientes de encima

Las dos operaciones ya existían, pero **sólo como herramientas de admin god-mode** en
`admin-actions.ts`. Un coach que tipeó mal un mail de invitación tenía que pedirle a un operador.

Gemelas con alcance de coach en `user-actions.ts`, con el uid saliendo de `getCurrentTrainer()`
en vez de ser un argumento — un coach sólo puede tocar su propia lista:

- **`removePendingClient({ email })`** — borra `/user_mirror/{email}` **y el contenido
  pre-cargado contra ese mail**. Esto último no es prolijidad: `convertMirrorToCanonical`
  reclama los docs por `pendingEmail` en el primer ingreso, así que una asignación huérfana se
  le pegaría a la persona más adelante *aunque para entonces sea cliente de otro coach*. Las dos
  queries van scopeadas a `trainerId == me`, así que los pre-loads de otro coach para el mismo
  mail no se tocan. Idempotente: borrar dos veces es un no-op exitoso.
- **`unlinkClient({ clientId })`** — espejo campo por campo de `unlinkClientFromCoach`: limpia el
  link + los campos denormalizados del coach, limpia `coachId` en el doc de chat (lo saca del
  inbox del ex-coach y le hace fallar `isChatParticipant`, SIN destruir el historial del cliente
  — si lo vuelve a agregar, vuelve) y resincroniza el custom claim (fail-soft: el doc de
  Firestore es la fuente de verdad y el claim se pone al día en el próximo refresh de token).

Ninguna de las dos borra a una persona. `deleteClientCascade` sigue siendo sólo de admin, a
propósito.

Las dos piden confirmación en un `AlertDialog` que dice qué SOBREVIVE y qué no —incluido que
desvincular le hace perder el premium que tenía por ser cliente— y quedan al final de la página,
para que nada de arriba se alcance con un tap accidental camino al botón.

## Gates

- `npx jest` en `backoffice`: **93 suites / 1075 tests verdes**.
- `npx tsc --noEmit` y `npm run build`: limpios.
- Verificado contra prod (read-only): los ticks hidratan nombre y cliente bien, los ticks
  atrasados producen el chip `día …`, y la query por colección hoy falla con
  `FAILED_PRECONDITION` — el camino fail-soft es real, no teórico.

## Pendiente (no bloquea el merge)

Deployar el índice `audit_log (collection, occurredAt)` desde `gc-fitness`. Hasta entonces
Monitoring muestra los hábitos MARCADOS (fuente nueva, ventana propia, ya funciona) pero los
hábitos CREADOS/EDITADOS siguen cayéndose de la ventana global cuando hay ráfaga de
asignaciones.
