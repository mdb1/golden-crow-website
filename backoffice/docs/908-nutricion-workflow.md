# Nutrición (#908) — rama base del backoffice

> Rama gemela de `feat/908-nutricion` en `gc-fitness`. **Cada PR de backoffice de
> nutrición va contra ESTA rama, no contra `main`.**

Diseño: https://claude.ai/code/artifact/f35e3f21-1f55-4cff-b40d-a508c7d2d349
Convención completa: `gc-fitness/.planning/908-nutricion/WORKFLOW.md`

## Por qué esta rama existe

**Este repo auto-deploya `main` al pushear.** Sin rama base, cada PR de nutrición
publicaría la feature a medias a coaches reales: media pantalla viva antes de que exista
el modelo que la llena. La rama base es lo que lo evita.

## Issues de backoffice

| | Issue | Depende de |
|---|---|---|
| B | mdb1/gc-fitness#914 Plan del coach con vigencia por fases | A (rules) |
| F | mdb1/gc-fitness#918 Biblioteca de comidas y plantillas | B |
| G | mdb1/gc-fitness#919 Cumplimiento, notas y peso vs. fase | B |
| K | mdb1/gc-fitness#923 Roster, perfil del cliente y monitoring | B, G |
| N | mdb1/gc-fitness#926 El coach responde: de la nota al chat | G |
| O | mdb1/gc-fitness#927 Asignar una plantilla a varios clientes | F |

## Gate de cada PR

```bash
cd backoffice && npx jest && npm run build
```

⚠️ **Las dos, siempre.** Jest no aplica `"use server"`: un export **síncrono** en un
archivo de Server Actions pasa la suite entera en verde y revienta en `next build` con
`Server Actions must be async functions`. Como `main` auto-deploya, eso publica un deploy
roto con los tests verdes. Ya pasó con `summarizeLoggedWorkout` (#785).

Regla: en un archivo `"use server"` sólo se exportan funciones `async`. Los `type` /
`interface` sí (se borran al compilar); todo helper puro y síncrono va a un módulo aparte.

## ⚠️ Antes de mergear esta rama a `main`

**Las reglas de Firestore tienen que estar YA desplegadas** (TODO 1 del PR base en
`gc-fitness`). Si el backoffice sale primero, los coaches ven una pantalla que no puede
escribir.

## Otras trampas de este repo

- Correr `git branch --show-current` **antes de cada commit**: un PR mergeado + `pull` te
  deja en `main`, y acá eso es un push a producción.
- El test de formato de fecha de client-activity falla local con locale ≠ en-US y es verde
  en CI — no perseguirlo.
- `gcFitnessFirestore` **no** tiene `ignoreUndefinedProperties`: `campo: cond ? x : undefined`
  tira. Usar spread condicional.
