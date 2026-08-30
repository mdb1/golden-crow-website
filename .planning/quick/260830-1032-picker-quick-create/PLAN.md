---
slug: 260830-1032-picker-quick-create
issue: mdb1/gc-fitness#1032
branch: feat/1032-picker-quick-create-youtube
status: complete
---

# #1032 — el quick-create del picker: video de YouTube y prompt de crear siempre visible

Dos pedidos, los dos sobre el panel inline de "Quick create" que cuelga del picker de
ejercicios del constructor de entrenamientos (`/gc-fitness/templates/new`).

## 1. Falta el campo de video

Hoy el panel tiene **un solo** campo de media: `GIF / preview URL`. En la captura del ticket
el coach pegó ahí un `https://youtu.be/...` — o sea, usó el campo del thumbnail para guardar
un video, que es exactamente lo que el resolver de media NO espera (`previewSrc()` lo va a
intentar renderizar como imagen).

El campo bueno ya existe en el modelo: `exerciseSchema.youtubeURL`, y el editor completo
(`ExerciseForm`) lo edita. Sólo el quick-create no lo expone, así que la única salida era
crear el ejercicio, salir del constructor, abrir la biblioteca, editarlo y volver.

**Qué se hace:** un input `youtubeURL` debajo del de GIF, ancho completo, y que viaje en el
payload de `createExercise`.

⚠️ **La validación tiene que ser del lado del cliente.** `youtubeUrlSchema` es
`z.string().url()`: si el coach pega `youtu.be/abc` (sin esquema) el Server Action tira un
`ZodError` cuyo `message` es un blob JSON — eso es lo que vería en el cartel rojo del panel.
Entonces: se normaliza (si no trae esquema se le antepone `https://`) y si aun así no queda
un `http(s)://…` válido, el CTA queda deshabilitado con un mensaje legible. El `ZodError`
nunca llega a dispararse.

También entra en `QuickCreateSeed` para que "Create similar" arrastre el video del ejercicio
de origen (y en `seedEquals`, o el guard de duplicado dejaría crear un clon que sólo difiere
en un campo que no mira).

## 2. El prompt de crear sólo aparece con CERO coincidencias

`noMatches` en `exercise-picker-popover.tsx` es `visible.length === 0`, y `searchExercises`
es un ranker difuso: "Cargada de potencia colgada" igual devuelve dos filas que no tienen
nada que ver, así que el panel nunca aparece. El workaround del coach es escribir `jhk`,
esperar el panel, y después corregir el nombre a mano.

El **diálogo de multi-add ya tiene resuelto esto** (`forceQuickCreate` + botón
`Crear «{term}»`); el picker de uno solo se quedó sin esa mitad. Se porta el mismo mecanismo:
una fila al final de los resultados, siempre presente mientras haya algo escrito, que abre el
panel con el nombre precargado.

La clave `multiAddCreateNew` pasa a llamarse `createNew` — la comparten los dos pickers y el
nombre viejo miente en el nuevo call site.

## Tareas

1. `exercise-quick-create.tsx` — campo `youtubeURL` + normalización + validación + seed.
2. `exercise-picker-popover.tsx` — `forceQuickCreate` + fila `Crear «term»` al pie de la
   lista; resets en select / close / created; `youtubeUrl` en `seedFromRow`.
3. `exercise-multi-add-dialog.tsx` — `youtubeUrl` en `seedFromExerciseRow`; usa `createNew`.
4. `messages/{en,es}.json` — `picker.multiAddCreateNew` → `picker.createNew` (la comparten
   los dos pickers ahora). El copy del panel de quick-create sigue hardcodeado en inglés
   como el resto de sus campos — migrarlo entero a i18n es otro ticket; meter UNA sola
   cadena traducida ahí dejaría el archivo a medio migrar.
5. Tests jest: payload con/sin video, normalización, guard de duplicado, y la fila de crear
   con resultados presentes en el picker de uno solo.
6. Bump de `BACKOFFICE_VERSION` (+1, regla del repo).

## Gate

`npx jest` **Y** `npm run build` en `backoffice/` — jest solo no ve un export síncrono en un
archivo `"use server"`, y `main` auto-deploya.
