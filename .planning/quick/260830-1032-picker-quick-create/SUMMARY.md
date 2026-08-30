---
slug: 260830-1032-picker-quick-create
issue: mdb1/gc-fitness#1032
branch: feat/1032-picker-quick-create-youtube
status: complete
date: 2026-08-30
---

# #1032 — hecho

## 1. El video ya no tiene que ir en el campo del thumbnail

`QuickCreateExercise` escribe ahora `youtubeURL`, con su propio input a lo ancho debajo del
de `GIF / preview URL`. El campo ya existía en `exerciseSchema` y en `ExerciseForm`; lo único
que faltaba era exponerlo acá, que es la razón por la que el coach tenía que crear el
ejercicio, salir del constructor, abrir la biblioteca, editarlo y volver.

**La validación quedó del lado del cliente, a propósito.** `youtubeUrlSchema` es
`z.string().url()`, así que un link copiado sin esquema (`youtu.be/_R389Jk0tI`, que es como
sale de la app de YouTube) es un rechazo duro del Server Action — y lo que el coach vería en
la línea roja del panel sería el JSON crudo del `ZodError`, sin ninguna pista de que lo que
falta es el `https://`. Entonces:

- `normalizeYoutubeUrl` le antepone `https://` si no trae **ningún** esquema. Si trae uno
  roto (`htttp://`) se lo deja igual para que el validador lo rechace en vez de construir
  `https://htttp://…`.
- `isValidYoutubeUrl` (un `new URL()` acotado a http/https con hostname con punto) apaga el
  CTA y muestra un mensaje legible. El `ZodError` no llega a dispararse nunca.

`youtubeUrl` entró también en `QuickCreateSeed` — y por lo tanto en `seedEquals`. Sin eso,
"el mismo ejercicio pero con mejor demo" contaba como clon idéntico y el botón Crear se
quedaba deshabilitado para siempre.

## 2. El prompt de crear ya no depende de que la búsqueda dé cero

El gate era `noMatches = visible.length === 0`, y `searchExercises` es un ranker difuso con
umbral de 60%: una query de 3 tokens matchea con 2, así que escribir un nombre que **no
está** en la biblioteca igual devuelve vecinos y el panel no aparecía. El workaround del
coach era escribir `jhk`, esperar el panel y volver a tipear el nombre real adentro.

Se portó al picker de uno solo el mecanismo que el diálogo de multi-add ya tenía: una fila
`Crear «lo que escribiste»` al pie de la lista de resultados, presente siempre que haya algo
escrito, que abre el panel con el nombre ya cargado. Se esconde cuando el panel ya está
abierto para que no se apilen. `forceQuickCreate` se resetea al elegir, al cerrar y al crear.

La clave `picker.multiAddCreateNew` pasó a `picker.createNew`: ahora la usan los dos pickers
y el nombre viejo mentía en el call site nuevo.

## Lo que NO se tocó, y por qué

- **El copy del panel sigue hardcodeado en inglés.** Los cinco campos que ya estaban lo
  están; traducir sólo el nuevo dejaba el archivo a medio migrar, que es peor que cualquiera
  de los dos extremos. Migrar `QuickCreateExercise` entero a i18n (incluidos los nombres de
  músculo/equipo, que hoy salen por `formatLabel` en vez de `tVocab`) es su propio ticket.
- **No hay campo nuevo en el wire.** `youtubeURL` ya lo leen iOS y Android por
  `MediaPriorityChain`, así que el video se ve en el cliente sin tocar nada más.

## Tests

- `exercise-quick-create.test.tsx`: 21 (eran 16). Nuevos: el video va a `youtubeURL` y no
  al thumbnail; `null` y no `""` cuando está vacío; se le agrega el esquema faltante; un
  texto que no es link apaga el CTA con mensaje; el seed lo arrastra; cambiar SÓLO el video
  habilita Crear en un "Create similar".
- `exercise-picker-popover.test.tsx`: 14 (eran 10). Nuevos: la fila aparece **con**
  resultados presentes (query de 3 tokens que matchea 2/3 — el caso exacto del ticket),
  abre el panel con el nombre precargado, no se apila con el panel de cero-coincidencias,
  y no aparece con la búsqueda vacía.

## Gate

`npx jest` → 192 suites / 2228 tests verdes. `npm run build` → compiled successfully.
`npx tsc --noEmit` limpio. No se tocó `firestore.rules` ni ningún gemelo de algoritmo.
