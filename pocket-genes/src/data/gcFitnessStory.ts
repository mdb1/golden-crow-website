// Copy de la página de producto de GC Fitness (/gc-fitness), en la misma forma
// que la de Pocket Genes. Los datos duros (links de tienda) salen de
// `gcFitnessPublic.ts` para no tener dos fuentes de verdad.
import type { Lang } from '../i18n/ui';
import type { ProductStoryPageData, StoryNavItem } from './productStory';

interface StoryCopy {
  nav: StoryNavItem[];
  page: ProductStoryPageData;
}

const copy: Record<Lang, StoryCopy> = {
  es: {
    nav: [
      { label: 'El producto', path: '/gc-fitness', slug: 'product' },
      { label: 'Descargar', path: '/gc-fitness/download', slug: 'download' },
      { label: 'Privacidad', path: '/gc-fitness/privacy', slug: 'privacy' },
    ],
    page: {
      title: 'GC Fitness — Entrenamientos, hábitos y progreso en una sola app',
      navLabel: 'Secciones de GC Fitness',
      eyebrow: 'Producto propio de Golden Crow',
      heroTitle: 'Tu gimnasio entra en tu bolsillo',
      heroLead:
        'El coach arma la semana desde el backoffice y el cliente la ejecuta, la registra y la mide desde el teléfono o el Apple Watch. Con coach o por tu cuenta.',
      heroImage: '/gc-fitness-card.webp',
      heroImageAlt: 'GC Fitness en iPhone y Apple Watch',
      primaryActionLabel: 'Descargar la app',
      primaryActionHref: '/gc-fitness/download',
      secondaryActionLabel: 'Quiero una app así',
      secondaryActionHref: '/#booking',

      introEyebrow: 'Por qué la construimos',
      introTitle: 'El plan de entrenamiento se pierde entre la planilla y las capturas de pantalla',
      introBody: [
        'El coach arma la semana en una planilla. El cliente le saca una captura, la guarda en la galería y ahí se pierde entre fotos. En el gimnasio no se acuerda cuánto levantó la vez pasada, y el coach no se entera de lo que pasó hasta la próxima consulta.',
        'GC Fitness cierra ese círculo: el coach asigna el entrenamiento y el cliente lo abre, le da play y registra cada serie. Lo que se registra vuelve al coach en el momento, con el peso, las repeticiones y el tiempo real de cada sesión.',
        'Y funciona igual de bien sin coach: el cliente arma sus propias rutinas, las repite cuando quiere y mide su progreso con los mismos gráficos.',
      ],

      stats: [
        { value: 'iOS + Android', label: 'Nativa en las dos plataformas' },
        { value: 'Apple Watch', label: 'Registrás sin sacar el teléfono' },
        { value: 'En vivo', label: 'El coach ve cada serie registrada' },
      ],

      pillarsTitle: 'Cuatro cosas que la app hace bien',
      pillarsSubtitle:
        'Nada de menús infinitos: la app está pensada para usarse con una mano, entre serie y serie.',
      pillars: [
        {
          title: 'Con coach o por tu cuenta',
          body: 'Si entrenás con coach, él te arma la semana y vos abrís y le das play. Si entrenás solo, armás tus rutinas y las repetís cuando quieras. La misma app, los mismos datos.',
        },
        {
          title: 'Registro sin fricción',
          body: 'Reps, kilos y un check. La app te muestra lo que hiciste la vez pasada, calcula el volumen y arranca el descanso sola cuando marcás la serie.',
        },
        {
          title: 'Progreso medido, no estimado',
          body: 'Series por grupo muscular, volumen, peso corporal y fotos de progreso con guía. Después de un mes no adivinás: sabés.',
        },
        {
          title: 'Hábitos que se sostienen',
          body: 'Los hábitos del día conviven con el entrenamiento en la misma pantalla, con rachas y recordatorios. Entrenar es una parte; el resto de la semana también cuenta.',
        },
      ],

      sections: [
        {
          id: 'entrenar',
          eyebrow: 'Entrenar',
          title: 'La sesión, tal como la vive el cliente',
          body: 'Abrir, dar play y no volver a pensar en la app hasta la próxima serie.',
          image: '/gc-fitness/screenshots/logging.webp',
          imageAlt: 'Pantalla de registro de una serie en GC Fitness',
          items: [
            {
              title: 'Series, repeticiones y kilos',
              body: 'Cada serie se marca con un toque, y al lado ves lo que levantaste la última vez para saber si toca subir.',
            },
            {
              title: 'Descansos automáticos',
              body: 'El temporizador arranca solo al cerrar la serie, con la próxima y el peso que toca. Nada de mirar el reloj de la pared.',
            },
            {
              title: 'Las notas del coach, en contexto',
              body: 'La indicación de cada ejercicio aparece en el ejercicio, no en un PDF aparte.',
            },
            {
              title: 'Supersets y bloques',
              body: 'Los ejercicios agrupados se ejecutan como bloque, con el descanso donde corresponde.',
            },
          ],
        },
        {
          id: 'medir',
          eyebrow: 'Medir',
          title: 'Cada serie registrada se convierte en una línea del gráfico',
          body: 'El progreso deja de ser una sensación y pasa a ser algo que se mira.',
          image: '/gc-fitness/screenshots/progress.webp',
          imageAlt: 'Gráficos de progreso por grupo muscular en GC Fitness',
          items: [
            {
              title: 'Series por grupo muscular',
              body: 'Semana a semana, con el rango objetivo marcado, para ver de un vistazo qué músculo se está quedando corto.',
            },
            {
              title: 'Volumen y peso corporal',
              body: 'En el mismo lugar que el resto, sin otra app ni otra planilla.',
            },
            {
              title: 'Proyección de la semana',
              body: 'Lo que falta según los entrenamientos ya asignados, en línea punteada.',
            },
            {
              title: 'Fotos de progreso con guía',
              body: 'Frente, costado y dorso, siempre en la misma pose, para que la comparación signifique algo.',
            },
          ],
        },
        {
          id: 'watch',
          eyebrow: 'En la muñeca',
          title: 'El teléfono se queda en el bolso',
          body: 'La app de Apple Watch no es un espejo: registra por sí sola y sincroniza cuando vuelve la conexión.',
          image: '/gc-fitness/screenshots/watch.webp',
          imageAlt: 'GC Fitness en el Apple Watch, registrando una serie',
          items: [
            {
              title: 'Registrás desde el reloj',
              body: 'Repeticiones y kilos con la corona digital, y el check con el pulgar.',
            },
            {
              title: 'El descanso te sigue',
              body: 'La cuenta regresiva y la próxima serie aparecen en la muñeca, con un toque háptico al terminar.',
            },
            {
              title: 'Entrenamiento de verdad',
              body: 'La sesión se registra como workout de HealthKit, con pulsaciones y calorías.',
            },
          ],
        },
        {
          id: 'coach',
          eyebrow: 'Para el coach',
          title: 'Un backoffice para armar la semana de todos tus clientes',
          body: 'La otra mitad del producto: donde el entrenamiento se diseña antes de llegar al teléfono.',
          items: [
            {
              title: 'Rutinas reutilizables',
              body: 'Armás una plantilla una vez y la asignás a quien quieras, con recurrencia semanal.',
            },
            {
              title: 'Biblioteca de ejercicios',
              body: 'Con GIFs, músculos trabajados e instrucciones, más los ejercicios propios de cada coach.',
            },
            {
              title: 'Seguimiento en vivo',
              body: 'Cada serie registrada, cada hábito marcado y cada foto de check-in, apenas ocurren.',
            },
            {
              title: 'Chat con el cliente',
              body: 'Las consultas quedan en la app, junto al entrenamiento que las motivó.',
            },
          ],
        },
      ],

      ethicsTitle: 'Datos y privacidad',
      ethicsBody: 'Los datos de entrenamiento son de quien entrena.',
      ethicsItems: [
        'Autenticación con Google o Apple; no guardamos contraseñas.',
        'La información de salud del Apple Watch se queda en el dispositivo y en HealthKit.',
        'Las fotos de progreso solo las ve el cliente y su coach.',
        'Borrado de cuenta y de todos sus datos desde la propia app.',
        'No vendemos datos ni los usamos para publicidad de terceros.',
      ],

      ctaTitle: 'Probá GC Fitness',
      ctaBody:
        'Está en la App Store y en Google Play. Y si lo que querés es un producto así para tu negocio, esa es exactamente nuestra otra mitad del trabajo.',
      ctaPrimaryLabel: 'Descargar la app',
      ctaPrimaryHref: '/gc-fitness/download',
      ctaSecondaryLabel: 'Hablemos de tu proyecto',
      ctaSecondaryHref: '/#booking',
    },
  },

  en: {
    nav: [
      { label: 'The product', path: '/gc-fitness', slug: 'product' },
      { label: 'Download', path: '/gc-fitness/download', slug: 'download' },
      { label: 'Privacy', path: '/gc-fitness/privacy', slug: 'privacy' },
    ],
    page: {
      title: 'GC Fitness — Workouts, habits and progress in one app',
      navLabel: 'GC Fitness sections',
      eyebrow: 'A Golden Crow product',
      heroTitle: 'Your gym fits in your pocket',
      heroLead:
        'Coaches build the week from the backoffice; clients run it, log it and measure it from their phone or Apple Watch. With a coach or on your own.',
      heroImage: '/gc-fitness-card.webp',
      heroImageAlt: 'GC Fitness on iPhone and Apple Watch',
      primaryActionLabel: 'Download the app',
      primaryActionHref: '/gc-fitness/download',
      secondaryActionLabel: 'I want an app like this',
      secondaryActionHref: '/#booking',

      introEyebrow: 'Why we built it',
      introTitle: 'Training plans get lost between the spreadsheet and the camera roll',
      introBody: [
        'The coach builds the week in a spreadsheet. The client screenshots it, and the screenshot disappears into the camera roll. At the gym nobody remembers last week’s numbers, and the coach only finds out how it went at the next check-in.',
        'GC Fitness closes that loop: the coach assigns the workout, the client opens it, hits play and logs every set. What gets logged reaches the coach right away — weight, reps and the real duration of each session.',
        'And it works just as well without a coach: clients build their own routines, repeat them whenever they want, and track progress with the same charts.',
      ],

      stats: [
        { value: 'iOS + Android', label: 'Native on both platforms' },
        { value: 'Apple Watch', label: 'Log without taking out your phone' },
        { value: 'Live', label: 'Coaches see every set as it lands' },
      ],

      pillarsTitle: 'Four things the app does well',
      pillarsSubtitle:
        'No endless menus: it is built to be used one-handed, between sets.',
      pillars: [
        {
          title: 'With a coach or on your own',
          body: 'With a coach, they build your week and you just hit play. On your own, you build your routines and repeat them whenever you like. Same app, same data.',
        },
        {
          title: 'Friction-free logging',
          body: 'Reps, weight, one check. The app shows what you did last time, computes volume, and starts the rest timer by itself when you close a set.',
        },
        {
          title: 'Progress measured, not guessed',
          body: 'Sets per muscle group, volume, body weight and guided progress photos. After a month you don’t guess — you know.',
        },
        {
          title: 'Habits that stick',
          body: 'Daily habits live on the same screen as the workout, with streaks and reminders. Training is one part; the rest of the week counts too.',
        },
      ],

      sections: [
        {
          id: 'train',
          eyebrow: 'Training',
          title: 'The session, as the client lives it',
          body: 'Open it, hit play, and forget about the app until the next set.',
          image: '/gc-fitness/screenshots/logging.webp',
          imageAlt: 'Set logging screen in GC Fitness',
          items: [
            {
              title: 'Sets, reps and weight',
              body: 'One tap per set, with last session’s numbers right beside it so you know whether to go up.',
            },
            {
              title: 'Automatic rest timers',
              body: 'The timer starts on its own when you close a set, showing what comes next and at what weight.',
            },
            {
              title: 'Coach notes in context',
              body: 'Each exercise carries its own cue, instead of a separate PDF.',
            },
            {
              title: 'Supersets and blocks',
              body: 'Grouped exercises run as a block, with the rest where it belongs.',
            },
          ],
        },
        {
          id: 'measure',
          eyebrow: 'Measuring',
          title: 'Every logged set becomes a line on the chart',
          body: 'Progress stops being a feeling and becomes something you can look at.',
          image: '/gc-fitness/screenshots/progress.webp',
          imageAlt: 'Progress charts per muscle group in GC Fitness',
          items: [
            {
              title: 'Sets per muscle group',
              body: 'Week by week, with the target range marked, so an undertrained muscle is obvious at a glance.',
            },
            {
              title: 'Volume and body weight',
              body: 'In the same place as everything else — no second app, no second spreadsheet.',
            },
            {
              title: 'Week projection',
              body: 'What is still ahead based on already-assigned workouts, drawn as a dashed line.',
            },
            {
              title: 'Guided progress photos',
              body: 'Front, side and back, always in the same pose, so the comparison actually means something.',
            },
          ],
        },
        {
          id: 'watch',
          eyebrow: 'On the wrist',
          title: 'The phone stays in the bag',
          body: 'The Apple Watch app is not a mirror: it logs on its own and syncs when the connection is back.',
          image: '/gc-fitness/screenshots/watch.webp',
          imageAlt: 'GC Fitness on Apple Watch, logging a set',
          items: [
            {
              title: 'Log from the watch',
              body: 'Reps and weight with the Digital Crown, the check with your thumb.',
            },
            {
              title: 'Rest follows you',
              body: 'The countdown and the next set show up on your wrist, with a haptic tap when time is up.',
            },
            {
              title: 'A real workout',
              body: 'The session is recorded as a HealthKit workout, with heart rate and calories.',
            },
          ],
        },
        {
          id: 'coach',
          eyebrow: 'For coaches',
          title: 'A backoffice to build every client’s week',
          body: 'The other half of the product: where the training is designed before it reaches the phone.',
          items: [
            {
              title: 'Reusable routines',
              body: 'Build a template once and assign it to anyone, with weekly recurrence.',
            },
            {
              title: 'Exercise library',
              body: 'GIFs, worked muscles and instructions, plus each coach’s own exercises.',
            },
            {
              title: 'Live tracking',
              body: 'Every logged set, checked habit and check-in photo, as it happens.',
            },
            {
              title: 'Chat with the client',
              body: 'Questions stay in the app, next to the workout that prompted them.',
            },
          ],
        },
      ],

      ethicsTitle: 'Data and privacy',
      ethicsBody: 'Training data belongs to the person training.',
      ethicsItems: [
        'Sign in with Google or Apple; we never store passwords.',
        'Apple Watch health data stays on the device and in HealthKit.',
        'Progress photos are visible to the client and their coach only.',
        'Account and full data deletion from inside the app.',
        'We do not sell data or use it for third-party advertising.',
      ],

      ctaTitle: 'Try GC Fitness',
      ctaBody:
        'It is on the App Store and Google Play. And if what you want is a product like this for your own business, that is exactly the other half of what we do.',
      ctaPrimaryLabel: 'Download the app',
      ctaPrimaryHref: '/gc-fitness/download',
      ctaSecondaryLabel: 'Tell us about your project',
      ctaSecondaryHref: '/#booking',
    },
  },
};

export function getGCFitnessStoryPage(lang: Lang): ProductStoryPageData {
  return copy[lang].page;
}

export function getGCFitnessStoryNav(lang: Lang): StoryNavItem[] {
  return copy[lang].nav;
}
