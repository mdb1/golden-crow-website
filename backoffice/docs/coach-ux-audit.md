# Portal del coach — auditoría de UX/UI (2.3.0)

golden-crow-website#535 · épica mdb1/gc-fitness#1567 · 2026-11-18

Alcance: todo `src/app/gc-fitness/**` que ve un coach (fuera de `admin/**`, que audita #534),
más el shell y los componentes compartidos (`src/components/gc-fitness/**`). Auditado desde el
código (el login necesita Firebase real) contra `docs/gc-fitness-redesign.md`, el glosario
(`gc-fitness/docs/GLOSSARY.md`) y los principios de impeccable.style: copy concreta, jerarquía
(lo que hay que hacer arriba), densidad de herramienta de trabajo, estados vacíos que proponen
la acción siguiente.

**Severidad.** P0 roto · P1 fricción diaria alta · P2 media · P3 pulido.
**Esfuerzo.** S < 1 h · M medio día · L 1 día o más.
**Estado.** ✅ hecho en el PR de #535 · ⏳ backlog.

Las rutas de evidencia son relativas a `backoffice/src/` (salvo `messages/`).

---

## Top 10

| # | Hallazgo | Pantalla | Sev | Estado |
|---|---|---|---|---|
| 1 | «Asignar» en Inicio (y la redirección tras asignar en masa) abría el calendario **vacío**: mandaba `?clientId=` y la agenda lee `clientIds` | Inicio / Agenda | P0 | ✅ |
| 2 | La lista de clientes no mostraba **el estado de pago**, aunque el roster ya leía `client_billing` para el motivo «pago vencido» | Clientes | P1 | ✅ |
| 3 | En Inicio, lo accionable estaba **abajo de todo** y sólo sabía de inactividad; la tarjeta KPI de arriba contaba seis motivos (el coach veía «4» y una lista de 1) | Inicio | P1 | ✅ |
| 4 | La flecha de hábitos de cada cliente **no era una tendencia**: salía del valor absoluto (≥ 70 % = sube) | Clientes | P1 | ✅ |
| 5 | «Asignar plan» sin planes era un callejón sin salida (pedido del dueño) | Pagos / ficha | P1 | ✅ |
| 6 | Tiempos relativos del roster en **inglés** («2h ago», «yesterday») en un portal en castellano | Clientes | P1 | ✅ |
| 7 | La ficha del cliente: ~30 consultas por carga (`workout_logs` ×3, el doc del cliente ×7, tendencias de hábitos 1 query por hábito) y `router.refresh()` al cambiar un gráfico | Ficha | P1 | ⏳ L |
| 8 | Chat: reaccionar / responder / borrar sólo aparecen con **hover** — invisibles en el teléfono | Chat | P1 | ⏳ M |
| 9 | Sesión en vivo: los inputs de peso y repes **no tienen label** y miden 32 px (se usa en el gimnasio, con el teléfono) | Sesión en vivo | P1 | ⏳ S |
| 10 | Glosario: «plantilla» aparece ~65 veces por «rutina», «programado» por «agendado», y quedan pantallas enteras sin i18n (sesión en vivo, comparador de fotos, vista de ejercicio en inglés) | Transversal | P1 | ⏳ M |

---

## Patrón transversal: pickers que pueden quedar vacíos

Pedido del dueño: todo selector que puede estar vacío (planes, rutinas, hábitos, plantillas de
nutrición, ejercicios, clientes) tiene que ofrecer **crear uno ahí mismo**, sin perder el
contexto, y el botón principal no puede parecer útil cuando no hace nada.

| Picker | Hoy | Sev | Estado |
|---|---|---|---|
| Plan de pago (`payments/_components/AssignPlanDialog.tsx`) | «Sin plan» + «Todavía no creaste planes.» + «Asignar plan» que no hacía nada | P1 | ✅ «Crear plan» en el lugar (diálogo anidado, queda elegido), «+ Nuevo plan» al final de la lista, botón deshabilitado con «Sin plan» y «Quitar plan» cuando lo saca |
| Rutina al agendar (`components/gc-fitness/schedule/assign-template-modal.tsx:292`) | «Crear rutina» es un `Link` a `/templates/new`: sale del diálogo y se pierde el cliente y la fecha elegidos | P2 | ⏳ M — abrir el editor y volver con la rutina preseleccionada (`?returnTo=` + borrador) |
| Hábito (`components/gc-fitness/schedule/new-habit-dialog.tsx:344-362`) | Con búsqueda ofrece «Crear "…"»; **sin búsqueda** y sin hábitos dice «Todavía no tenés hábitos guardados.» sin acción | P2 | ⏳ S |
| Ejercicio (`components/gc-fitness/exercise-picker-popover.tsx:578`) | `noExercises` sin acción cuando la biblioteca está vacía (el alta rápida sólo aparece al buscar) | P3 | ⏳ S |
| Clientes (`ChecklistClientPicker.tsx:98`, `schedule/month-calendar.tsx:1085`, `bulk-assign-*`) | «No hay clientes.» / «No tenés clientes activos todavía.» sin link a Clientes → Agregar | P3 | ⏳ S |
| Plantilla de nutrición (`clients/[id]/nutricion/asignar/AssignNutritionForm.tsx:434`) | Se oculta si no hay plantillas — correcto: el propio formulario es el alta | — | — |

**Apps (coach mode):** iOS `PaymentAssignPlanSheet` y Android `AssignPlanSheet` ya ofrecen
«Nuevo plan» dentro de la hoja y deshabilitan Guardar sin plan elegido — no tienen el
callejón. Follow-up menor de paridad: verificar que el plan recién creado quede elegido en las
dos (en la web sí).

---

## Hallazgos por pantalla

### Inicio (`dashboard/`)
Qué resuelve: qué necesita el coach **hoy** y cómo viene el grupo.

| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | «Asignar» → `?clientId=` (la agenda lee `clientIds`): calendario vacío. Igual la redirección de la asignación masiva | `dashboard/_components/unassigned-clients-card.tsx:63`, `components/gc-fitness/schedule/bulk-assign-form.tsx:305`, `schedule/page.tsx:31` | P0 | S | ✅ |
| 2 | La lista accionable estaba al final y era sólo inactividad; el KPI contaba los 6 motivos de #499 | `dashboard/page.tsx` (antes :316-353) | P1 | M | ✅ «Necesitan tu atención (N)» arriba, mismo predicado, motivos como chips |
| 3 | Sin pagos en Inicio | — | P1 | M | ✅ tarjeta «Cobros» (vencidos / por vencer, link a la ficha de pagos) — 0 lecturas nuevas |
| 4 | El KPI «Necesitan atención» repetía su número como «delta» con flecha roja | `dashboard/page.tsx:232` | P2 | S | ✅ |
| 5 | `<Button>` anidado dentro del `<Link>` en «Sin nada asignado» | `unassigned-clients-card.tsx:62-80` | P2 | S | ✅ |
| 6 | Paginador de 32 px | `dashboard/page.tsx` Pager | P2 | S | ✅ 40 px |
| 7 | El gráfico semanal lee ≤ 600 `workout_logs` sin orden ni ventana: con > 600 logs faltan los de esta semana | `lib/gc-fitness/coach-pulse-actions.ts:212-216` | P1 | S | ⏳ (no hay índice `(trainerId, startedAt)`; ventana en memoria o índice nuevo) |
| 8 | No hay sección «hoy»: entrenamientos agendados para hoy / en curso | `dashboard/page.tsx` | P1 | M | ⏳ |
| 9 | Si no hay pendientes, la checklist se oculta y no queda ningún acceso a ella desde Inicio | `checklist-pending.tsx:24-29` | P2 | S | ⏳ |
| 10 | Ítems vencidos de la checklist muestran sólo la hora, no el día | `checklist-pending-list.tsx:35-39` | P2 | S | ⏳ |
| 11 | Tres loaders recorren hábitos por cliente (pulse, attention, roster); `listClientsWithNothingAssignedSoon` repite lo que el roster ya calcula (`nothingAssigned`) | `coach-attention-actions.ts:141`, `coach-pulse-actions.ts:111` | P2 | L | ⏳ |
| 12 | «Adherencia promedio» cambia en silencio de hábitos a entrenamientos cuando hábitos = 0 | `dashboard/page.tsx:171` | P2 | S | ⏳ |

### Clientes (`clients/page.tsx`, `_components/RosterTable.tsx`)
Qué resuelve: ¿quién entrena, quién se está cayendo, quién me debe?

| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | Sin estado de pago por cliente | `RosterTable.tsx` | P1 | S | ✅ chip + detalle («Vencido · 4 días»), orden «Pagos» (peor primero, sin plan al final) y filtro «Pagos vencidos (N)» |
| 2 | Flecha de hábitos falsa (umbral absoluto) | `RosterTable.tsx` (antes :545) | P1 | M | ✅ tendencia real contra la semana anterior (`client_stats` v2 `prevWeekComplianceRatio`); sin semana previa no hay flecha |
| 3 | Dos clientes por fila: 30 clientes = mucho scroll | `RosterTable.tsx` grid `lg:grid-cols-2` | P1 | M | ✅ vista «Lista» densa con encabezados ordenables (`aria-sort`), recordada por navegador |
| 4 | «Última actividad: 2h ago» — inglés y sin decir qué fue | `RelativeTime.tsx` | P1 | S | ✅ `Intl.RelativeTimeFormat` en el idioma de la UI + «· entrenamiento / hábito / foto de progreso» |
| 5 | Búsqueda sin resultados decía «Aún no tenés clientes en el plantel.» | `messages/es.json clients.table.noClientsRow` | P2 | S | ✅ «Ningún cliente coincide…» |
| 6 | El subtítulo decía «ordenados por actividad más reciente» aunque el coach reordene | `clients/page.tsx:59` | P3 | S | ✅ |
| 7 | `clients.table.goals` = «Goals» en el catálogo es | `messages/es.json` | P3 | S | ✅ «Objetivos» |
| 8 | La tarjeta entera es `role="link"` + `onClick` (no es un `<a>`: sin abrir en pestaña nueva) | `RosterTable.tsx` Card | P2 | M | ⏳ (la vista Lista sí usa `<Link>`) |
| 9 | Badge «NEW» y su `title` hardcodeados | `RosterTable.tsx` autoAssignedCoach | P3 | S | ⏳ |

### Ficha del cliente (`clients/[id]/**`)
Qué resuelve: cómo viene este cliente y qué hay que hacer con él.

| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | El encabezado no dice pago, última actividad ni adherencia; los pagos están en la 5ª sección | `_components/ClientHeader.tsx:119-144`, `page.tsx:540-556` | P1 | M | ⏳ (franja de estado reutilizando `RosterPayment` / `RosterLastActivity`) |
| 2 | Calendario `min-w-[780px]` como primer widget: scroll lateral en el teléfono | `_components/ClientCalendarPeek.tsx:273` | P1 | M | ⏳ vista agenda en mobile |
| 3 | Entrenamientos perdidos escondidos en un `<details>` «Ver pasados» | `_components/ClientSummaryCard.tsx:122-124,235-256` | P1 | S | ⏳ |
| 4 | ~30 consultas por carga: `users/{id}` ×7, `workout_logs` ×3 (500/300/300), hábitos ×3, tendencias de hábitos N+1; `getLatestBodyWeightKg` espera a todo | `lib/gc-fitness/exercise-progress-actions.ts:217,240,295`, `personal-records-actions.ts:54,76,105`, `HabitTrendsWidget.tsx:58-88`, `page.tsx:236-263` | P1 | L | ⏳ |
| 5 | `ClientSummaryCard` async sin `<Suspense>`: frena toda la página | `page.tsx:509` | P1 | S | ⏳ |
| 6 | Cambiar un gráfico hace `router.refresh()` (re-corre todas las lecturas) | `_components/ClientChartsSection.tsx:76-79` | P2 | M | ⏳ |
| 7 | Gráficos sin alternativa de texto; selector de rango con `aria-label` en inglés y opciones de 24 px | `TrendRangeSelector.tsx:21,34` y 6 gráficos | P2 | M | ⏳ |
| 8 | Colores de grupos musculares en hex crudo con texto `#fff` | `MuscleGroupProgressClient.tsx:85-91` | P2 | S | ⏳ |
| 9 | Pills de secciones de 36 px | `ClientSectionNav.tsx:66,85` | P2 | S | ⏳ |
| 10 | Vista de cliente pendiente: copy hardcodeado + «Corvo · Pending»; precarga con «plantilla» y ~45 strings sin i18n | `page.tsx:686-727`, `PendingWorkoutAssignForm.tsx:81,87` | P2 | M | ⏳ |
| 11 | `pagos/page.tsx`: `Promise.all` sin catch → una lectura caída tira la página | `pagos/page.tsx:79-85` | P2 | S | ⏳ |

### Nutrición del cliente (`clients/[id]/nutricion/**`)
| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | Formulario largo de fase sin aviso de cambios sin guardar (hay borrador de deploy, no `beforeunload`) | `asignar/AssignNutritionForm.tsx:683-690` | P1 | S | ⏳ |
| 2 | Las acciones del coach van 4ª de 10 secciones | `nutricion/page.tsx:219-263` | P2 | M | ⏳ |
| 3 | Lecturas en serie (planes → logs + pesos) | `nutricion/page.tsx:118,129` | P2 | S | ⏳ |
| 4 | kcal de una opción sin label; guardar no es sticky en mobile | `asignar/meal-draft-editor.tsx:197`, `AssignNutritionForm.tsx:681` | P2 | S | ⏳ |
| 5 | «Programada» → «Agendada» | `messages/es.json clients.detail.nutrition.stateScheduled` | P3 | S | ⏳ |

### Comparador de fotos (`clients/[id]/compare-photos/**`)
| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | La imagen que se le manda al cliente lleva «Before»/«After» en inglés quemados | `photo-compare-editor.tsx:595,600` | P1 | S | ⏳ |
| 2 | Toda la pantalla sin i18n (Angle/Front/Side/Reset/Zoom) | `photo-compare-editor.tsx:146-183,872` | P2 | M | ⏳ |
| 3 | Zona horaria cae a `"UTC"` (el perfil ya lo arregló en #747) | `compare-photos/page.tsx:52` | P2 | S | ⏳ |
| 4 | `touch-none` sobre ≥ 420 px bloquea el scroll en el teléfono | `photo-compare-editor.tsx:258,861` | P2 | S | ⏳ |

### Sesión en vivo (`clients/[id]/sessions/[assignmentId]/run/**`)
| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | Peso / repes sin label (`EditableNumberInput` no acepta `aria-label`) | `run/_components/session-exercise-card.tsx:92-105,397-414` | P1 | S | ⏳ |
| 2 | Objetivos táctiles de 16–32 px para uso en el gimnasio | `session-exercise-card.tsx:245-262,362,403,419` | P1 | S | ⏳ |
| 3 | Sin i18n (~30 strings); «Set», «futuros workouts», «la entrenamiento» | `active-workout-session.tsx`, `session-exercise-card.tsx:311,336`, `cancel-workout-dialog.tsx:39` | P2 | M | ⏳ |
| 4 | Nombres `name.en \|\| name.es` (inglés primero) | `active-workout-session.tsx:280` | P2 | S | ⏳ |
| 5 | La X dice «Cerrar» pero cancela el entrenamiento; después manda a `/notifications` | `active-workout-session.tsx:220,286` | P2 | S | ⏳ |
| 6 | La página escribe (`startWorkoutSession`) durante el render del servidor | `run/page.tsx:30-37` | P2 | S | ⏳ |

### Biblioteca: rutinas, ejercicios, hábitos, nutrición (`library/`, `templates/`, `exercises/`, `habits/`)
| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | Rutinas: el título muestra `name.en` primero (coach en castellano ve inglés) | `templates/client.tsx:572-574`, `[id]/view/page.tsx:111` | P1 | S | ⏳ |
| 2 | Rutinas: el conteo de asignaciones lee **todas** las asignaciones históricas del coach; la vista Asignaciones además hace N+1 | `lib/gc-fitness/workout-assignment-actions.ts:2278-2281,2330-2374` | P1 | M | ⏳ |
| 3 | Rutinas: sin orden por nombre / última edición / último uso; la vista no tiene «Agendar» | `templates/client.tsx:301`, `[id]/view/actions.tsx:51` | P2 | M | ⏳ |
| 4 | Ejercicios: filtros con claves en inglés («Chest», «Standard/Custom»); la vista de ejercicio está en inglés | `exercises/_components/MultiSelectCombobox.tsx:47`, `ExerciseFilters.tsx:186,222`, `exercises/[id]/view/page.tsx:140-189` | P1 | S | ⏳ |
| 5 | Ejercicios: filas `<tr onClick>` sin teclado; borrar no avisa «se usa en N rutinas» (el dato está) | `exercises/client.tsx:358,450` | P2 | S | ⏳ |
| 6 | Hábitos: asignaciones cortadas en 200 sin aviso | `lib/gc-fitness/habit-actions.ts:1297-1302` | P1 | M | ⏳ |
| 7 | Hábitos: «New habit» y el widget de cumplimiento en inglés | `habits/new/page.tsx:31`, `habits/[id]/_components/ComplianceWidget.tsx:55-126` | P1 | S | ⏳ |
| 8 | Búsquedas sin `aria-label` (rutinas, hábitos) | `templates/client.tsx:465`, `habits/client.tsx:466` | P2 | S | ⏳ |
| 9 | Nutrición: sin estado de error ni de carga; sin búsqueda/orden; 4 botones de 32 px sólo ícono por fila | `library/_nutrition/NutritionLibraryClient.tsx:93-100,432-470` | P2 | M | ⏳ |
| 10 | Pantallas de detalle/form con contenedor propio en vez de `gc-page` + `PageHeader` | `templates/new/page.tsx:39` y 9 más | P2 | M | ⏳ |
| 11 | El generador tiene su propio diccionario fuera de `messages/*.json` | `components/gc-fitness/generator/strings.ts` | P3 | M | ⏳ |

### Pagos (`payments/`)
| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | «Asignar plan» sin planes = callejón | `payments/_components/AssignPlanDialog.tsx` | P1 | M | ✅ |
| 2 | Filtro de estado sin coincidencias muestra la tabla vacía sin mensaje (mira `rows`, no `visible`) | `CollectionsTab.tsx:58,98` | P2 | S | ⏳ |
| 3 | Tabla de 7 columnas + 4 acciones sin layout de tarjetas en mobile; acciones de 28 px | `CollectionsTab.tsx:101-187`, `ClientPaymentActions.tsx:53` | P2 | M | ⏳ |
| 4 | Sin búsqueda en Cobros; sin «Recordar a todos los vencidos»; «Recordar» aparece en clientes al día | `CollectionsTab.tsx:51-94`, `ClientPaymentActions.tsx:76` | P2 | M | ⏳ |
| 5 | Planes no dicen «N clientes en este plan» | `PlansTab.tsx` | P2 | S | ⏳ |
| 6 | Pestañas fuera de la URL (no se puede linkear Historial) | `PaymentsClient.tsx:28-33` | P3 | S | ⏳ |

### Chat (`chat/`)
| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | Acciones de mensaje `opacity-0` hasta hover: invisibles en touch | `chat/_components/ChatConversation.tsx:512,614,633,662` | P1 | M | ⏳ |
| 2 | El encabezado de la conversación no linkea a la ficha del cliente | `ChatConversation.tsx:322-341` | P2 | S | ⏳ |
| 3 | La bandeja refresca cada 120 s | `lib/gc-fitness/chat-listener.ts:99` | P2 | M | ⏳ |
| 4 | Sin filtro «sin leer»; error sin reintentar; lightbox sin trampa de foco y con `aria-label` en inglés | `ChatThreadList.tsx:117`, `ChatImageLightbox.tsx:33-49` | P3 | S | ⏳ |

### Agenda (`schedule/`)
| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | `useQuery` sin `isError`: si falla, grilla vieja o vacía sin mensaje | `components/gc-fitness/schedule/month-calendar.tsx:127-154` | P2 | S | ⏳ |
| 2 | Vista y fecha fuera de la URL: recargar vuelve a «mes» | `month-calendar.tsx:111-112` | P3 | S | ⏳ |
| 3 | «serie» usado para «serie recurrente» (choca con serie = set); «plantilla» ×20, «Programado para», «Asignar workout» | `workout-recurrence-edit-dialog.tsx:192`, `messages/es.json schedule.*` | P2 | S | ⏳ |
| 4 | Botones «+» de celda de ~22 px; leyenda de 9 px; detalle sólo en `title` | `month-calendar/chip-parts.tsx:134`, `day-cell.tsx:195` | P2 | S | ⏳ |

### Actividad, notificaciones, checklist, desafíos
| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | Actividad reciente abre **siempre** sin clientes elegidos (feed vacío) | `recent-logs/page.tsx:87-93` | P1 | S | ⏳ |
| 2 | Actividad reciente: ~8 consultas por cliente por página (400 con «elegir todos» en 50 clientes) | `lib/gc-fitness/recent-logs-actions.ts:488-680` | P1 | L | ⏳ |
| 3 | Títulos de filas armados en castellano en el servidor (Actividad reciente, Mi actividad) | `recent-logs-actions.ts:1069-1619`, `coach-activity-actions.ts:185-213` | P2 | M | ⏳ |
| 4 | Filas `div role="button"` con links y botones adentro | `RecentLogsFeed.tsx:380-490` | P2 | M | ⏳ |
| 5 | Checklist: la query trae los primeros 50 por vencimiento **incluyendo completados** → los activos nuevos desaparecen | `lib/gc-fitness/coach-checklist-actions.ts:154-157,234-238` | P1 | S | ⏳ |
| 6 | Checklist: borrar sin confirmar; el form de alta va arriba de la lista | `CoachChecklistClient.tsx:140-205` | P2 | S | ⏳ |
| 7 | Notificaciones: los récords siempre «sin leer», no hay marcar como leído; cumpleaños en inglés | `lib/gc-fitness/notifications-feed.ts:374`, `birthday-notifications.ts:85` | P2 | M | ⏳ |
| 8 | Desafíos: el form de alta siempre arriba de los activos; lee todos los desafíos históricos | `challenges/CoachChallengesClient.tsx:302`, `coach-challenge-actions.ts:91` | P2 | S | ⏳ |

### Shell, login, ajustes, wiki, layout
| # | Hallazgo | Evidencia | Sev | Esf | Estado |
|---|---|---|---|---|---|
| 1 | `Button size="sm"` = 28 px y `icon` = 32 px: todo lo que los usa queda bajo los 40 px | `components/ui/button.tsx:39-42` | P2 | M | ⏳ (cambio compartido con admin: coordinar con #534) |
| 2 | El nombre del coach se arma del mail en 3 lugares aunque Ajustes guarda un nombre | `gc-fitness-shell.tsx:327`, `coach-card.tsx:31`, `settings/page.tsx:46` | P2 | S | ⏳ |
| 3 | La tarjeta del coach dice «Premium» a todo no-admin | `coach-card.tsx:83,133` | P2 | S | ⏳ |
| 4 | Header mobile: el contador de chats sin leer no es link; hamburguesa de 28 px con «Toggle Sidebar» | `gc-fitness-shell.tsx:305-317`, `ui/sidebar.tsx:266` | P2 | S | ⏳ |
| 5 | Login muestra el texto crudo de Firebase y no vuelve a la página pedida (`?next=`) | `login/page.tsx:60,79,126` | P2 | S | ⏳ |
| 6 | El error de ruta sólo hace `reset()` (no `router.refresh()`), sin link a Inicio | `components/gc-fitness/route-error-boundary.tsx:68-86` | P2 | S | ⏳ |
| 7 | El layout manda el catálogo entero al browser y espera 4 lecturas en serie | `app/gc-fitness/layout.tsx:43-60` | P2 | M | ⏳ |
| 8 | Wiki: «Programá», «sesiones», «plantillas» | `wiki/wiki-data.ts:153,349,411` | P2 | S | ⏳ |

Lo que salió limpio: sin hex crudo en pantallas del coach (salvo grupos musculares y el
lightbox), todas las páginas de lista usan `gc-page` + `PageHeader`, la paleta de comandos está
bien (lazy, con labels, caché 5 min), las tablas de nutrición ya tienen `overflow-x-auto`.

---

## Plan priorizado (impacto diario ÷ esfuerzo)

**PR 1 — hecho (este PR).** Clientes (pagos, tendencia real, vista Lista, última actividad,
i18n), Inicio («Necesitan tu atención» + «Cobros», link de «Asignar»), «Crear plan» desde
«Asignar plan».

**PR 2 — arreglos chicos de alto impacto (S, ~1 día en total).**
1. Checklist: excluir completados del límite de 50 (P1).
2. Actividad reciente: abrir con todos los clientes (o los últimos elegidos) (P1).
3. Sesión en vivo: `aria-label` + 44 px en peso/repes/hecho (P1).
4. Rutinas y ejercicios en el idioma del coach (`localizedNamePair`) + filtros traducidos (P1).
5. «Before/After» de la imagen exportada en el idioma del coach (P1).
6. Hábitos: «New habit» y widget de cumplimiento a i18n (P1).
7. Ficha: `ClientSummaryCard` en `<Suspense>`; perdidos fuera del `<details>` (P1).
8. Pickers vacíos con «Crear» en el lugar: hábitos sin búsqueda, ejercicios, clientes (P2).

**PR 3 — ficha del cliente (M–L).** Franja de estado en el encabezado (pago, última actividad,
adherencia con tendencia — reutiliza `RosterBits`), calendario en modo agenda en mobile, lecturas
deduplicadas (un loader por colección, `users/{id}` una vez), gráficos sin `router.refresh()`.

**PR 4 — glosario e i18n (M).** «plantilla» → «rutina», «programado» → «agendado», sesión en
vivo y comparador al catálogo, títulos de actividad armados en el cliente. Extender
`glossary.test.ts` a `messages/es.json`.

**PR 5 — mobile y táctil (M).** Acciones del chat visibles sin hover, `Button sm/icon` ≥ 40 px
(coordinar con admin #534), Cobros en tarjetas en mobile, header mobile.

**PR 6 — costo de lecturas (L).** Recent-logs por cliente, conteo de asignaciones por rutina
(contador denormalizado o ventana), `coach-pulse` con ventana (índice `workout_logs (trainerId,
startedAt)` si se decide), unificar los tres recorridos de hábitos de Inicio.

### Follow-ups de paridad con las apps (coach mode)
- La tendencia de hábitos contra la semana anterior y el estado de pago por cliente en la lista
  de clientes del coach mode (iOS `CoachRoster*`, Android `CoachRosterViewModel`) — hoy sólo la web.
- «Necesitan tu atención» con motivos en la pantalla Hoy del coach mode (Android
  `CoachTodayScreen.kt`, iOS equivalente), con la misma tabla `client-attention`.
- Plan recién creado desde «Asignar plan» preseleccionado en las dos apps (verificar).

### Datos / despliegue
- `client_stats` pasa a **v2** (`prevWeekComplianceRatio`): la primera carga de cada coach
  recalcula todas sus filas una vez (como cualquier bump de versión); la consulta de
  `habit_logs` por cliente mira 14 días en vez de 7 (mismo índice `(clientId, civilDate)`,
  límite 150 → 300). Sin índices ni reglas nuevas: `client_stats` lo escribe sólo el Admin SDK.
