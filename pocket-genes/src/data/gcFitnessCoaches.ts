// Copy de /gc-fitness/coaches — la propuesta de valor para coaches
// (gc-fitness#909). Misma forma que la página de producto (`gcFitnessStory.ts`).
//
// Reglas del copy, heredadas de `gc-fitness/marketing/NARRATIVA.md`:
// - El "por qué" va primero (R1): abre por el dolor del coach — la planilla, las
//   capturas, enterarse en la próxima consulta — y recién después lista funciones.
// - Decir la verdad (R8): cada tarjeta es algo que la app o el panel hacen HOY.
//   Lo que no está publicado lleva su etiqueta: lo social de 1.6 es «Nuevo», lo de
//   la épica social v2 (#1190: actividad, kudos, desafíos, estadísticas de
//   creador, tendencias) sale en la 1.7 y dice «Llega en 1.7». Nutricionista y
//   kinesiólogo son «Próximamente»; viandas y antropometrías son «A medida» —
//   se conversan, no se prometen.
// - El modo coach de la app (épica gc-fitness#1211, C14 #1250) sale en la 1.8 y dice
//   «Llega en 1.8» hasta que esa versión esté en las tiendas. Sus capturas son NATIVAS:
//   salen de `scripts/marketing-capture.sh coach` (GC_MKT_LANG=es|en) en gc-fitness,
//   con el fixture de marketing, y viven en `public/gc-fitness/screenshots/coach/<lang>/`.
import type { Lang } from '../i18n/ui';
import type { ProductStoryPageData, StoryShot } from './productStory';

// Capturas del iPhone 17 Pro Max (1320×2868) reducidas a 560 de ancho, como las demás.
const SHOT_W = 560;
const SHOT_H = 1217;
function coachShots(lang: Lang, shots: Array<[file: string, caption: string, alt: string]>): StoryShot[] {
  return shots.map(([file, caption, alt]) => ({
    src: `/gc-fitness/screenshots/coach/${lang}/${file}.webp`,
    caption,
    alt,
    width: SHOT_W,
    height: SHOT_H,
  }));
}

const pages: Record<Lang, ProductStoryPageData> = {
  es: {
    title: 'GC Fitness para coaches — Tu método, en la app de cada cliente',
    navLabel: 'Secciones de GC Fitness',
    eyebrow: 'GC Fitness para coaches',
    heroTitle: 'Dejá de perseguir capturas de pantalla',
    heroLead:
      'Armás la semana desde tu panel, tu cliente la ejecuta desde el teléfono o el reloj, y cada serie te llega en el momento. Sin planillas, sin PDFs y sin enterarte recién en la próxima consulta.',
    heroImage: '/gc-fitness-card.webp',
    heroImageAlt: 'GC Fitness en iPhone y Apple Watch',
    primaryActionLabel: 'Quiero sumarme como coach',
    primaryActionHref: '/#booking',
    secondaryActionLabel: 'Conocé la app',
    secondaryActionHref: '/gc-fitness',

    introEyebrow: 'El problema',
    introTitle: 'Tu trabajo termina en una planilla que tu cliente no vuelve a abrir',
    introBody: [
      'Armás el plan con cuidado. El cliente le saca una captura, la pierde entre las fotos de la galería y en el gimnasio pone el mismo peso de siempre, porque no se acuerda con cuánto hizo press la semana pasada. Y si no se acuerda, no progresa: repite.',
      'Vos te enterás de todo eso tarde, por WhatsApp, o en la próxima consulta. Para entonces ya pasaron dos semanas.',
      'GC Fitness cierra ese círculo: vos asignás, tu cliente abre la app y le da play, y lo que registra — peso, repeticiones, descansos, hábitos, comidas y fotos — vuelve a tu panel el mismo día. Tu método deja de depender de la memoria de tu cliente.',
    ],

    stats: [
      { value: 'iOS + Android', label: 'App nativa para tus clientes, en las dos plataformas' },
      { value: 'Reloj', label: 'Apple Watch y Wear OS: registran desde la muñeca, sin sacar el teléfono' },
      { value: 'En vivo', label: 'Cada serie registrada te llega apenas ocurre' },
    ],

    pillarsTitle: 'Todo lo que te llevás',
    pillarsSubtitle:
      'No es una app suelta: es tu sistema de trabajo, de punta a punta, del panel a la muñeca de tu cliente.',
    pillars: [
      {
        title: 'Un sistema online para tu negocio',
        body: 'Un panel web con tus clientes, tus rutinas, tus hábitos y tus planes de nutrición. Desde la compu, sin instalar nada.',
      },
      {
        title: 'Chat con cada cliente',
        body: 'Las consultas quedan en la app, al lado del entrenamiento que las motivó, con aviso en el teléfono. Se terminan los audios perdidos.',
      },
      {
        title: 'Una app de última generación',
        body: 'Nativa en iPhone y Android, con Apple Watch y Wear OS. Tu cliente siente que contrató algo premium, porque lo es.',
      },
      {
        title: 'Tu página web, la armamos nosotros',
        body: 'Te hacemos una página web propia para que te encuentren, conozcan tu propuesta y lleguen a vos.',
      },
    ],

    sections: [
      {
        id: 'modo-coach',
        badge: 'Llega en 1.8',
        eyebrow: 'El modo coach',
        title: 'Tu panel, también en el bolsillo',
        body: 'Con la 1.8, entrás a GC Fitness con tu cuenta de coach y la app se convierte en la tuya: tus clientes, sus semanas y sus mensajes, en el teléfono. Lo que hacés ahí aparece en el panel, y al revés.',
        wide: true,
        items: [
          {
            title: 'Hoy',
            body: 'Tu propio entreno, las sesiones del día de tus clientes, quién necesita atención y tus pendientes, en una sola pantalla.',
          },
          {
            title: 'Clientes',
            body: 'Tu cartera completa, con buscador y los mensajes sin leer de cada uno. Sumás un cliente nuevo con su email, desde el teléfono.',
          },
          {
            title: 'La ficha de cada cliente',
            body: 'Su semana, su progreso, sus hábitos, su plan de nutrición y tus notas. Le pedís el peso o fotos en un toque.',
          },
          {
            title: 'Asignar en segundos',
            body: 'Elegís la rutina, el día y si se repite. Le aparece en la app al instante, y en el reloj.',
          },
          {
            title: 'Mensajes',
            body: 'Las conversaciones con todos tus clientes en una bandeja, con lo que todavía no leíste marcado.',
          },
          {
            title: 'Tu biblioteca y tu calendario',
            body: 'Tus rutinas y ejercicios para editar o crear, y la semana de todos tus clientes en un calendario.',
          },
          {
            title: 'Vos también entrenás',
            body: 'En «Yo» están tus propias rutinas, tu calendario y tu progreso, con el Apple Watch o el Wear OS.',
          },
          {
            title: 'iPhone y Android',
            body: 'El modo coach está en las dos plataformas, en español y en inglés.',
          },
        ],
        gallery: coachShots('es', [
          ['hoy', 'Hoy', 'La pantalla Hoy del modo coach: sesiones del día, clientes que necesitan atención y pendientes'],
          ['clientes', 'Clientes', 'La lista de clientes del coach en GC Fitness'],
          ['ficha', 'Ficha del cliente', 'La ficha de un cliente: su semana, su último entrenamiento y su progreso'],
          ['asignar', 'Asignar', 'La hoja para asignar una rutina a un cliente, con día y repetición'],
          ['mensajes', 'Mensajes', 'La bandeja de mensajes del coach con sus clientes'],
        ]),
      },
      {
        id: 'panel',
        eyebrow: 'El panel',
        title: 'Armás una vez, asignás a quien quieras',
        body: 'Donde el entrenamiento se diseña antes de llegar al teléfono de tu cliente.',
        image: '/gc-fitness/screenshots/logging.webp',
        twoColumns: true,
        imageAlt: 'Una rutina asignada por el coach, lista para registrar en GC Fitness',
        items: [
          {
            title: 'Creador de rutinas',
            body: 'Plantillas reutilizables con series, repeticiones, descansos, supersets y notas por ejercicio.',
          },
          {
            title: 'Generador de rutinas',
            body: 'Elegís el equipamiento que tiene tu cliente y el panel te propone una rutina que después ajustás a tu criterio.',
          },
          {
            title: 'Agenda y recurrencia',
            body: 'Asignás con recurrencia semanal, y a varios clientes a la vez. La semana de todos, en un calendario.',
          },
          {
            title: 'Biblioteca de ejercicios',
            body: 'Con animación, músculos trabajados e instrucciones, más tus propios ejercicios.',
          },
          {
            title: 'Entrenamiento en vivo',
            body: 'Si lo entrenás en persona o por videollamada, cargás la sesión vos desde el panel, serie por serie.',
          },
          {
            title: 'Hábitos',
            body: 'Agua, pasos, sueño, lo que quieras: le asignás hábitos y ves cuáles cumple, con rachas y recordatorios.',
          },
        ],
      },
      {
        id: 'seguimiento',
        eyebrow: 'Seguimiento',
        title: 'Sabés cómo le fue sin tener que preguntar',
        body: 'Cada serie registrada se convierte en un dato que ves vos, no en una sensación que te cuenta tu cliente.',
        image: '/gc-fitness/screenshots/progress.webp',
        twoColumns: true,
        imageAlt: 'Gráficos de progreso por grupo muscular en GC Fitness',
        items: [
          {
            title: 'Seguimiento de rutinas',
            body: 'Qué entrenó, con cuánto peso, cuántas repeticiones y cuánto tardó. La actividad reciente de todos tus clientes en un solo lugar.',
          },
          {
            title: 'Series por grupo muscular',
            body: 'Semana a semana, con el mapa muscular, para ver de un vistazo qué músculo se está quedando corto.',
          },
          {
            title: 'Récords personales',
            body: 'La app los detecta sola. Vos ves cuándo tu cliente superó su mejor marca.',
          },
          {
            title: 'Peso corporal y volumen',
            body: 'La evolución del peso y del volumen de entrenamiento, en los mismos gráficos.',
          },
          {
            title: 'Comparador de fotos',
            body: 'Las fotos de progreso, guiadas y siempre en la misma pose, lado a lado en tu panel: el antes y el después sin buscar en el chat.',
          },
          {
            title: 'Sobrecarga progresiva',
            body: 'Al lado de cada serie, lo que tu cliente hizo la vez pasada. Así sabe cuándo toca subir.',
          },
        ],
      },
      {
        id: 'nutricion',
        eyebrow: 'Nutrición',
        title: 'El plan de comidas, con el mismo seguimiento que el entrenamiento',
        body: 'La otra mitad del resultado, en la misma app y en el mismo panel.',
        wide: true,
        items: [
          {
            title: 'Planes de nutrición',
            body: 'Le asignás el plan desde el panel y tu cliente lo ve comida por comida.',
          },
          {
            title: 'Check por comida',
            body: 'Tu cliente marca cada comida en un toque, y si no la cumplió te cuenta por qué.',
          },
          {
            title: 'Adherencia a la vista',
            body: 'Un mapa semanal por comida, rachas y porcentaje de cumplimiento, junto al peso corporal.',
          },
          {
            title: '«Por qué falla»',
            body: 'Un ranking de los motivos y las comidas donde más se le complica, para que tu próxima indicación apunte al lugar justo.',
          },
        ],
      },
      {
        id: 'app',
        eyebrow: 'La app de tus clientes',
        title: 'Una app que tus clientes quieren abrir',
        body: 'Pensada para usarse con una mano, entre serie y serie. Si la experiencia es buena, tu cliente vuelve; si vuelve, se queda.',
        image: '/gc-fitness/screenshots/watch.webp',
        twoColumns: true,
        imageAlt: 'GC Fitness en el Apple Watch, registrando una serie',
        items: [
          {
            title: 'iPhone, iPad y Android',
            body: 'Nativa en cada plataforma, en español y en inglés.',
          },
          {
            title: 'Apple Watch y Wear OS',
            body: 'Registra series y descansos desde la muñeca, con el teléfono en el bolso.',
          },
          {
            title: 'Descansos automáticos',
            body: 'El temporizador arranca solo al cerrar la serie, con la próxima y el peso que toca.',
          },
          {
            title: 'Tus notas, en contexto',
            body: 'La indicación de cada ejercicio aparece en el ejercicio, no en un PDF aparte.',
          },
          {
            title: 'Compartir su progreso',
            body: 'Imágenes listas para Instagram con su entreno, sus récords y su progreso.',
          },
          {
            title: 'Hábitos del día',
            body: 'Los hábitos que le asignás conviven con el entrenamiento en el Inicio, con rachas y recordatorios.',
          },
        ],
      },
      {
        id: 'comunidad',
        eyebrow: 'Comunidad',
        title: 'Tus clientes ya no entrenan solos',
        body: 'La app tiene su propia red social alrededor del entrenamiento. Para vos significa algo concreto: clientes que se motivan entre ellos, que se hacen cargo frente a sus amigos, y rutinas tuyas que circulan con tu nombre.',
        wide: true,
        items: [
          {
            badge: 'Nuevo',
            title: 'Perfiles y seguir gente',
            body: 'Perfil con @usuario, público o privado. Tus clientes se siguen entre ellos, y los perfiles privados aprueban cada solicitud.',
          },
          {
            badge: 'Nuevo',
            title: 'Rutinas públicas',
            body: 'Una rutina publicada lleva el nombre de quien la creó. Cualquiera la guarda con un toque, desde la app o desde un link compartido.',
          },
          {
            badge: 'Nuevo',
            title: 'Feed de rutinas',
            body: 'Lo que publica la gente que seguís, en un feed, más sugerencias de a quién seguir según cómo entrenás.',
          },
          {
            badge: 'Nuevo',
            title: 'Comentarios y ♥',
            body: 'En cada rutina publicada, con aviso al autor.',
          },
          {
            badge: 'Nuevo',
            title: 'Mensajes directos',
            body: 'Entre personas que se siguen mutuamente, además del chat con el coach.',
          },
          {
            badge: 'Llega en 1.7',
            title: 'Compartir entrenamientos',
            body: 'Al terminar, tus clientes pueden compartir el entreno con sus seguidores: rutina, duración, volumen y récords. Nunca sus datos de salud.',
          },
          {
            badge: 'Llega en 1.7',
            title: '«De tu gente» en el Inicio',
            body: 'Lo que entrenó la gente que seguís, apenas abrís la app.',
          },
          {
            badge: 'Llega en 1.7',
            title: 'Kudos 💪',
            body: 'Un toque para felicitar a un amigo por su entreno. El reconocimiento también es adherencia.',
          },
          {
            badge: 'Llega en 1.7',
            title: 'Desafíos entre amigos',
            body: 'Cantidad de entrenos, volumen, el peso más alto en un ejercicio, o volumen y series por grupo muscular. Totales o semanales, con fechas, hasta 50 amigos y tabla de posiciones.',
          },
          {
            badge: 'Llega en 1.7',
            title: 'Perfil con actividad',
            body: 'Entrenos del mes y racha de semanas, a la vista de quienes siguen a cada uno.',
          },
          {
            badge: 'Llega en 1.7',
            title: 'Estadísticas para creadores',
            body: 'Quien publica una rutina ve cuántas personas la guardaron y cuántas veces la entrenaron.',
          },
          {
            badge: 'Llega en 1.7',
            title: 'Descubrir gente',
            body: 'Las rutinas y las personas que más se están guardando, para encontrar a quién seguir.',
          },
        ],
      },
      {
        id: 'por-que',
        eyebrow: 'Por qué te importa',
        title: 'La comunidad trabaja para vos mientras no estás',
        body: 'Vos no podés estar en cada entrenamiento de cada cliente. Sus amigos, sí.',
        wide: true,
        items: [
          {
            title: 'Retención',
            body: 'Un cliente que entrena con amigos, que recibe kudos y tiene una racha que cuidar, abandona menos. Y un cliente que se queda es tu negocio.',
          },
          {
            title: 'Compromiso',
            body: 'Faltar a un entreno cuesta más cuando tu gente lo ve y cuando hay un desafío en juego.',
          },
          {
            title: 'Comunidad',
            body: 'Tus clientes se siguen, se desafían y se motivan entre ellos. Pasan de ser alumnos sueltos a ser un grupo.',
          },
          {
            title: 'Tu nombre circula',
            body: 'Tus rutinas publicadas viajan con tu nombre y se comparten por link. Cada persona que las guarda te conoce.',
          },
        ],
      },
      {
        id: 'lo-que-viene',
        eyebrow: 'Lo que viene',
        title: 'Un equipo alrededor de cada cliente',
        body: 'Estamos sumando a otros profesionales al mismo seguimiento. Y si tu negocio necesita algo más, lo armamos a medida.',
        wide: true,
        items: [
          {
            badge: 'Próximamente',
            title: 'Seguimiento con nutricionista',
            body: 'Que un nutricionista acompañe a tu cliente desde la misma app, viendo lo mismo que vos.',
          },
          {
            badge: 'Próximamente',
            title: 'Seguimiento con kinesiólogo',
            body: 'Para lesiones y rehabilitación, con el entrenamiento a la vista del profesional.',
          },
          {
            badge: 'A medida',
            title: 'Sistema de viandas',
            body: 'Si ofrecés comida preparada a tus clientes, lo conversamos y lo integramos a tu plan. Consultanos.',
          },
          {
            badge: 'A medida',
            title: 'Antropometrías',
            body: 'Mediciones corporales completas con su seguimiento en el tiempo. Consultanos.',
          },
        ],
      },
    ],

    ethicsTitle: 'Datos y privacidad',
    ethicsBody: 'Los datos de tus clientes son de ellos, y los cuidamos como tales.',
    ethicsItems: [
      'Las fotos de progreso las ven sólo el cliente y su coach.',
      'Compartir entrenamientos con seguidores es opcional y viene apagado. Nunca se comparten frecuencia cardíaca, notas ni datos de Salud.',
      'Bloquear y reportar desde la app, con revisión de cada reporte dentro de las 24 horas.',
      'Borrado de cuenta y de todos sus datos desde la propia app.',
      'No vendemos datos ni los usamos para publicidad de terceros.',
    ],

    ctaTitle: 'Llevá tu método a la app',
    ctaBody:
      'Contanos cómo trabajás, cuántos clientes tenés y qué necesitás. Te mostramos el panel y armamos juntos la puesta en marcha.',
    ctaPrimaryLabel: 'Hablemos',
    ctaPrimaryHref: '/#booking',
    ctaSecondaryLabel: 'Descargar la app',
    ctaSecondaryHref: '/gc-fitness/download',
  },

  en: {
    title: 'GC Fitness for coaches — Your method, in every client’s app',
    navLabel: 'GC Fitness sections',
    eyebrow: 'GC Fitness for coaches',
    heroTitle: 'Stop chasing screenshots',
    heroLead:
      'You build the week from your dashboard, your client runs it from their phone or watch, and every set reaches you as it happens. No spreadsheets, no PDFs, no finding out at the next check-in.',
    heroImage: '/gc-fitness-card.webp',
    heroImageAlt: 'GC Fitness on iPhone and Apple Watch',
    primaryActionLabel: 'I’m a coach — let’s talk',
    primaryActionHref: '/#booking',
    secondaryActionLabel: 'See the app',
    secondaryActionHref: '/gc-fitness',

    introEyebrow: 'The problem',
    introTitle: 'Your work ends up in a spreadsheet your client never opens again',
    introBody: [
      'You build the plan carefully. Your client screenshots it, loses it in the camera roll, and at the gym puts on the same weight as always, because they don’t remember what they benched last week. If they don’t remember, they don’t progress — they repeat.',
      'You find out late, over WhatsApp, or at the next check-in. By then two weeks have gone by.',
      'GC Fitness closes that loop: you assign, your client opens the app and hits play, and what they log — weight, reps, rest, habits, meals and photos — lands in your dashboard the same day. Your method stops depending on your client’s memory.',
    ],

    stats: [
      { value: 'iOS + Android', label: 'A native app for your clients, on both platforms' },
      { value: 'Watch', label: 'Apple Watch and Wear OS: they log from the wrist, phone in the bag' },
      { value: 'Live', label: 'Every logged set reaches you as it happens' },
    ],

    pillarsTitle: 'Everything you get',
    pillarsSubtitle:
      'Not just an app: your whole way of working, end to end, from your dashboard to your client’s wrist.',
    pillars: [
      {
        title: 'An online system for your business',
        body: 'A web dashboard with your clients, routines, habits and nutrition plans. From your computer, nothing to install.',
      },
      {
        title: 'Chat with every client',
        body: 'Questions stay in the app, next to the workout that prompted them, with a notification on their phone. No more lost voice notes.',
      },
      {
        title: 'A state-of-the-art app',
        body: 'Native on iPhone and Android, with Apple Watch and Wear OS. Your clients feel they signed up for something premium — because they did.',
      },
      {
        title: 'Your website, built by us',
        body: 'We build you your own website so people can find you, learn what you offer and get in touch.',
      },
    ],

    sections: [
      {
        id: 'coach-mode',
        badge: 'Coming in 1.8',
        eyebrow: 'Coach mode',
        title: 'Your dashboard, in your pocket too',
        body: 'With 1.8, you sign in to GC Fitness with your coach account and the app becomes yours: your clients, their weeks and their messages, on your phone. What you do there shows up in the dashboard, and the other way around.',
        wide: true,
        items: [
          {
            title: 'Today',
            body: 'Your own workout, your clients’ sessions for the day, who needs your attention and your checklist, on one screen.',
          },
          {
            title: 'Clients',
            body: 'Your whole roster, searchable, with each client’s unread messages. Add a new client by email, right from your phone.',
          },
          {
            title: 'Every client’s profile',
            body: 'Their week, their progress, their habits, their nutrition plan and your notes. Ask for their weight or photos in one tap.',
          },
          {
            title: 'Assign in seconds',
            body: 'Pick the routine, the day and whether it repeats. It shows up in their app right away — and on their watch.',
          },
          {
            title: 'Messages',
            body: 'Your conversations with every client in one inbox, with what you haven’t read yet flagged.',
          },
          {
            title: 'Your library and calendar',
            body: 'Your routines and exercises to edit or create, and every client’s week on one calendar.',
          },
          {
            title: 'You train too',
            body: '“Me” holds your own routines, calendar and progress, with Apple Watch or Wear OS.',
          },
          {
            title: 'iPhone and Android',
            body: 'Coach mode is on both platforms, in English and Spanish.',
          },
        ],
        gallery: coachShots('en', [
          ['today', 'Today', 'Coach mode’s Today screen: the day’s sessions, clients who need attention and to-dos'],
          ['clients', 'Clients', 'The coach’s client list in GC Fitness'],
          ['profile', 'Client profile', 'A client’s profile: their week, latest workout and progress'],
          ['assign', 'Assign', 'The sheet to assign a routine to a client, with day and repeat'],
          ['messages', 'Messages', 'The coach’s inbox with their clients'],
        ]),
      },
      {
        id: 'dashboard',
        eyebrow: 'The dashboard',
        title: 'Build once, assign to anyone',
        body: 'Where training is designed before it reaches your client’s phone.',
        image: '/gc-fitness/screenshots/logging.webp',
        twoColumns: true,
        imageAlt: 'A coach-assigned routine, ready to log in GC Fitness',
        items: [
          {
            title: 'Routine builder',
            body: 'Reusable templates with sets, reps, rest, supersets and per-exercise notes.',
          },
          {
            title: 'Routine generator',
            body: 'Pick the equipment your client has and the dashboard drafts a routine you then tune your way.',
          },
          {
            title: 'Schedule and recurrence',
            body: 'Assign with weekly recurrence, and to several clients at once. Everyone’s week, on one calendar.',
          },
          {
            title: 'Exercise library',
            body: 'With animations, worked muscles and instructions, plus your own exercises.',
          },
          {
            title: 'Live sessions',
            body: 'Training them in person or over video? Log the session yourself from the dashboard, set by set.',
          },
          {
            title: 'Habits',
            body: 'Water, steps, sleep, anything: assign habits and see which ones they keep, with streaks and reminders.',
          },
        ],
      },
      {
        id: 'tracking',
        eyebrow: 'Tracking',
        title: 'Know how it went without having to ask',
        body: 'Every logged set becomes data you can see, not a feeling your client tells you about.',
        image: '/gc-fitness/screenshots/progress.webp',
        twoColumns: true,
        imageAlt: 'Progress charts per muscle group in GC Fitness',
        items: [
          {
            title: 'Workout tracking',
            body: 'What they trained, with what weight, how many reps and how long it took. Recent activity for all your clients in one place.',
          },
          {
            title: 'Sets per muscle group',
            body: 'Week by week, with the muscle map, so an undertrained muscle is obvious at a glance.',
          },
          {
            title: 'Personal records',
            body: 'The app detects them on its own. You see when your client beat their best.',
          },
          {
            title: 'Body weight and volume',
            body: 'Body weight and training volume over time, on the same charts.',
          },
          {
            title: 'Photo comparison',
            body: 'Guided progress photos, always in the same pose, side by side in your dashboard: before and after without digging through the chat.',
          },
          {
            title: 'Progressive overload',
            body: 'Next to every set, what your client did last time — so they know when to go up.',
          },
        ],
      },
      {
        id: 'nutrition',
        eyebrow: 'Nutrition',
        title: 'The meal plan, tracked like the training',
        body: 'The other half of the result, in the same app and the same dashboard.',
        wide: true,
        items: [
          {
            title: 'Nutrition plans',
            body: 'Assign the plan from the dashboard and your client sees it meal by meal.',
          },
          {
            title: 'A check per meal',
            body: 'Your client checks each meal in one tap, and if they missed it, tells you why.',
          },
          {
            title: 'Adherence at a glance',
            body: 'A weekly map per meal, streaks and compliance, next to body weight.',
          },
          {
            title: '“Why it slips”',
            body: 'A ranking of the reasons and the meals where it gets hard, so your next advice lands in the right place.',
          },
        ],
      },
      {
        id: 'app',
        eyebrow: 'Your clients’ app',
        title: 'An app your clients want to open',
        body: 'Built to be used one-handed, between sets. When the experience is good, clients come back; when they come back, they stay.',
        image: '/gc-fitness/screenshots/watch.webp',
        twoColumns: true,
        imageAlt: 'GC Fitness on Apple Watch, logging a set',
        items: [
          {
            title: 'iPhone, iPad and Android',
            body: 'Native on every platform, in English and Spanish.',
          },
          {
            title: 'Apple Watch and Wear OS',
            body: 'Log sets and rest from the wrist, phone in the bag.',
          },
          {
            title: 'Automatic rest timers',
            body: 'The timer starts on its own when a set is closed, showing what comes next and at what weight.',
          },
          {
            title: 'Your notes, in context',
            body: 'Each exercise carries your cue, instead of a separate PDF.',
          },
          {
            title: 'Sharing their progress',
            body: 'Instagram-ready images of their workout, their records and their progress.',
          },
          {
            title: 'Daily habits',
            body: 'The habits you assign live on Home next to the workout, with streaks and reminders.',
          },
        ],
      },
      {
        id: 'community',
        eyebrow: 'Community',
        title: 'Your clients no longer train alone',
        body: 'The app has its own social network built around training. For you that means something concrete: clients who motivate each other, who stay accountable to their friends, and routines of yours that travel with your name on them.',
        wide: true,
        items: [
          {
            badge: 'New',
            title: 'Profiles and following',
            body: 'A profile with an @handle, public or private. Your clients follow each other, and private profiles approve every request.',
          },
          {
            badge: 'New',
            title: 'Public routines',
            body: 'A published routine carries its creator’s name. Anyone can save it in one tap, from the app or from a shared link.',
          },
          {
            badge: 'New',
            title: 'Routine feed',
            body: 'What the people you follow publish, in one feed, plus suggestions of who to follow based on how you train.',
          },
          {
            badge: 'New',
            title: 'Comments and ♥',
            body: 'On every published routine, with a notification to the author.',
          },
          {
            badge: 'New',
            title: 'Direct messages',
            body: 'Between people who follow each other, on top of the chat with their coach.',
          },
          {
            badge: 'Coming in 1.7',
            title: 'Sharing workouts',
            body: 'When they finish, your clients can share the workout with their followers: routine, duration, volume and records. Never their health data.',
          },
          {
            badge: 'Coming in 1.7',
            title: '“From your people” on Home',
            body: 'What the people you follow trained, as soon as you open the app.',
          },
          {
            badge: 'Coming in 1.7',
            title: 'Kudos 💪',
            body: 'One tap to cheer a friend’s workout. Recognition is adherence too.',
          },
          {
            badge: 'Coming in 1.7',
            title: 'Challenges between friends',
            body: 'Number of workouts, volume, heaviest weight on an exercise, or volume and sets per muscle group. Total or weekly, with dates, up to 50 friends and a leaderboard.',
          },
          {
            badge: 'Coming in 1.7',
            title: 'Profiles with activity',
            body: 'Workouts this month and weekly streak, visible to each person’s followers.',
          },
          {
            badge: 'Coming in 1.7',
            title: 'Creator stats',
            body: 'Whoever publishes a routine sees how many people saved it and how many times it was trained.',
          },
          {
            badge: 'Coming in 1.7',
            title: 'Discover people',
            body: 'The routines and people being saved the most, to find who to follow.',
          },
        ],
      },
      {
        id: 'why',
        eyebrow: 'Why it matters',
        title: 'The community works for you while you’re not there',
        body: 'You can’t be at every workout of every client. Their friends can.',
        wide: true,
        items: [
          {
            title: 'Retention',
            body: 'A client who trains with friends, gets kudos and has a streak to protect drops off less. And a client who stays is your business.',
          },
          {
            title: 'Accountability',
            body: 'Skipping a workout costs more when your people can see it and there’s a challenge on the line.',
          },
          {
            title: 'Community',
            body: 'Your clients follow, challenge and push each other. They go from scattered clients to a group.',
          },
          {
            title: 'Your name travels',
            body: 'Your published routines carry your name and get shared by link. Everyone who saves one gets to know you.',
          },
        ],
      },
      {
        id: 'whats-next',
        eyebrow: 'What’s next',
        title: 'A team around every client',
        body: 'We’re bringing other professionals into the same tracking. And if your business needs more, we build it for you.',
        wide: true,
        items: [
          {
            badge: 'Coming soon',
            title: 'Working with a nutritionist',
            body: 'A nutritionist supporting your client from the same app, seeing what you see.',
          },
          {
            badge: 'Coming soon',
            title: 'Working with a physiotherapist',
            body: 'For injuries and rehab, with the training visible to the professional.',
          },
          {
            badge: 'Custom',
            title: 'Meal-prep system',
            body: 'If you offer prepared meals to your clients, let’s talk about plugging them into your plan. Ask us.',
          },
          {
            badge: 'Custom',
            title: 'Anthropometry',
            body: 'Full body measurements tracked over time. Ask us.',
          },
        ],
      },
    ],

    ethicsTitle: 'Data and privacy',
    ethicsBody: 'Your clients’ data belongs to them, and we treat it that way.',
    ethicsItems: [
      'Progress photos are visible to the client and their coach only.',
      'Sharing workouts with followers is optional and off by default. Heart rate, notes and Health data are never shared.',
      'Block and report from the app, with every report reviewed within 24 hours.',
      'Account and full data deletion from inside the app.',
      'We do not sell data or use it for third-party advertising.',
    ],

    ctaTitle: 'Bring your method into the app',
    ctaBody:
      'Tell us how you work, how many clients you have and what you need. We’ll show you the dashboard and plan the rollout together.',
    ctaPrimaryLabel: 'Let’s talk',
    ctaPrimaryHref: '/#booking',
    ctaSecondaryLabel: 'Download the app',
    ctaSecondaryHref: '/gc-fitness/download',
  },
};

export function getGCFitnessCoachesPage(lang: Lang): ProductStoryPageData {
  return pages[lang];
}
