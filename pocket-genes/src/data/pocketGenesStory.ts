import type { Lang } from '../i18n/ui';

export type PocketGenesStorySlug = 'mission' | 'rare-disease' | 'companion' | 'community';

interface StoryNavItem {
  label: string;
  path: string;
  slug?: PocketGenesStorySlug;
}

interface StoryStat {
  value: string;
  label: string;
}

interface StoryCard {
  title: string;
  body: string;
}

interface StorySection {
  id?: string;
  eyebrow: string;
  title: string;
  body: string;
  items: StoryCard[];
  image?: string;
  imageAlt?: string;
}

export interface PocketGenesStoryPage {
  title: string;
  navLabel: string;
  eyebrow: string;
  heroTitle: string;
  heroLead: string;
  heroImage: string;
  heroImageAlt: string;
  primaryActionLabel: string;
  primaryActionHref: string;
  secondaryActionLabel: string;
  secondaryActionHref: string;
  introEyebrow: string;
  introTitle: string;
  introBody: string[];
  stats: StoryStat[];
  pillarsTitle: string;
  pillarsSubtitle: string;
  pillars: StoryCard[];
  sections: StorySection[];
  ethicsTitle: string;
  ethicsBody: string;
  ethicsItems: string[];
  ctaTitle: string;
  ctaBody: string;
  ctaPrimaryLabel: string;
  ctaPrimaryHref: string;
  ctaSecondaryLabel: string;
  ctaSecondaryHref: string;
}

interface StoryCopy {
  nav: StoryNavItem[];
  pages: Record<PocketGenesStorySlug, PocketGenesStoryPage>;
}

const copy: Record<Lang, StoryCopy> = {
  es: {
    nav: [
      { label: 'Misión', path: '/pocket-genes', slug: 'mission' },
      { label: 'EPOF', path: '/pocket-genes/rare-disease', slug: 'rare-disease' },
      { label: 'Mi espacio', path: '/pocket-genes/companion', slug: 'companion' },
      { label: 'PockeAmigos', path: '/pocket-genes/community', slug: 'community' },
      { label: 'Integración', path: '/pocket-genes/integration' },
    ],
    pages: {
      mission: {
        title: 'Pocket Genes - Información genética más clara para familias',
        navLabel: 'Secciones de Pocket Genes',
        eyebrow: 'Pocket Genes',
        heroTitle: 'Pocket Genes: genética más clara, organizada y accesible.',
        heroLead:
          'Pocket Genes ayuda a personas y familias a reunir información genética dispersa, entender conceptos complejos, preparar conversaciones médicas y encontrar apoyo cuando el recorrido es largo y por momentos confuso.',
        heroImage: '/mobile1.webp',
        heroImageAlt: 'Pocket Genes en un teléfono móvil',
        primaryActionLabel: 'Explorar EPOF',
        primaryActionHref: '/pocket-genes/rare-disease',
        secondaryActionLabel: 'Ver integración para proveedores',
        secondaryActionHref: '/pocket-genes/integration',
        introEyebrow: 'El cambio de enfoque',
        introTitle: 'Información genética clara, útil y en un solo lugar.',
        introBody: [
          'Pocket Genes está pensado para ordenar informes, paneles, proveedores, historial de estudios, conceptos de herencia y próximos pasos posibles en un lugar claro. El objetivo no es reemplazar al médico ni al genetista, sino ayudar a que las personas lleguen mejor preparadas.',
        ],
        stats: [
          { value: '1', label: 'lugar para informes, paneles y PDFs' },
          { value: '0', label: 'diagnósticos o indicaciones clínicas dentro de la app' },
          { value: '24/7', label: 'información organizada para revisar antes de una consulta' },
        ],
        pillarsTitle: 'Lo que Pocket Genes ayuda a resolver',
        pillarsSubtitle:
          'La experiencia se organiza alrededor de necesidades reales de familias que conviven con preguntas genéticas difíciles.',
        pillars: [
          {
            title: 'Organizar información',
            body: 'Reunir informes, archivos, paneles, laboratorios, fechas, genes analizados y notas familiares para que nada importante quede perdido.',
          },
          {
            title: 'Entender conceptos',
            body: 'Explicar variantes, herencia, portadores, penetrancia, paneles, secuenciación y farmacogenómica en lenguaje accesible.',
          },
          {
            title: 'Preparar conversaciones',
            body: 'Ayudar a identificar qué fue analizado, qué podría faltar y qué preguntas conviene llevar a un médico o profesional de genética.',
          },
          {
            title: 'Encontrar apoyo',
            body: 'Conectar con asociaciones, recursos, registros, especialistas y personas que atraviesan preguntas similares.',
          },
        ],
        sections: [
          {
            eyebrow: 'Para familias',
            title: 'Del archivo suelto a una historia genética organizada',
            body:
              'Muchas familias llegan a la genética después de años de síntomas, derivaciones, estudios y PDFs difíciles de comparar. Pocket Genes convierte esa acumulación en una línea de tiempo consultable.',
            image: '/integrate1.webp',
            imageAlt: 'Interfaz de informes genéticos organizada',
            items: [
              {
                title: 'Historial de estudios',
                body: 'Guardar qué estudio se hizo, cuándo, con qué proveedor y qué tipo de panel o tecnología se usó.',
              },
              {
                title: 'Cobertura genética',
                body: 'Distinguir genes analizados, genes no cubiertos y zonas donde puede hacer falta otra prueba o una consulta especializada.',
              },
              {
                title: 'Notas para consulta',
                body: 'Convertir dudas dispersas en preguntas claras para el equipo médico.',
              },
            ],
          },
          {
            eyebrow: 'Para el ecosistema',
            title: 'Un puente entre pacientes, proveedores y comunidad',
            body:
              'La misma base que permite integrar informes también puede ayudar a comparar cobertura, explicar resultados, ordenar recursos y acercar a las familias a redes de apoyo.',
            image: '/mobile2.webp',
            imageAlt: 'Teléfono junto a una pipeta en laboratorio',
            items: [
              {
                title: 'Proveedores comparables',
                body: 'Entender qué panel, laboratorio o servicio cubre qué genes, condiciones o necesidades.',
              },
              {
                title: 'Recursos confiables',
                body: 'Acercar asociaciones, registros, guías educativas y especialistas relevantes según el contexto.',
              },
              {
                title: 'Privacidad primero',
                body: 'Dar control sobre qué información se guarda, se comparte y con quién.',
              },
            ],
          },
        ],
        ethicsTitle: 'Límites clínicos claros',
        ethicsBody:
          'Pocket Genes no diagnostica, no prescribe y no reemplaza a profesionales de salud. Su rol es ayudar a organizar información, explicar conceptos y preparar conversaciones más claras.',
        ethicsItems: [
          'Lenguaje educativo, no indicaciones médicas.',
          'Separa hallazgos informados de interpretaciones pendientes.',
          'Promueve la consulta con médicos, genetistas y asesores genéticos.',
        ],
        ctaTitle: 'Dos narrativas, una misma plataforma',
        ctaBody:
          'Las familias necesitan claridad y acompañamiento. Los proveedores necesitan una forma seria de entregar informes desde el celular. Pocket Genes conecta esas dos necesidades sin mezclarlas.',
        ctaPrimaryLabel: 'Ver apoyo para EPOF',
        ctaPrimaryHref: '/pocket-genes/rare-disease',
        ctaSecondaryLabel: 'Ver integración',
        ctaSecondaryHref: '/pocket-genes/integration',
      },
      'rare-disease': {
        title: 'Pocket Genes - EPOF y enfermedades poco frecuentes',
        navLabel: 'Secciones de Pocket Genes',
        eyebrow: 'EPOF',
        heroTitle: 'Cuando una enfermedad es poco frecuente, la información necesita estar clara y ordenada.',
        heroLead:
          'Las familias que atraviesan una EPOF suelen cargar con informes dispersos, términos difíciles, años de derivaciones y pocas personas que entiendan su experiencia. Pocket Genes ayuda a ordenar ese camino.',
        heroImage: '/mobile2.webp',
        heroImageAlt: 'Laboratorio genético con teléfono móvil',
        primaryActionLabel: 'Ver espacio personal',
        primaryActionHref: '/pocket-genes/companion',
        secondaryActionLabel: 'Volver a Pocket Genes',
        secondaryActionHref: '/pocket-genes',
        introEyebrow: 'El problema humano',
        introTitle: 'Llegar a la próxima consulta con más claridad y mejores preguntas.',
        introBody: [
          'En enfermedades poco frecuentes, una familia puede pasar por pediatras, especialistas, laboratorios, estudios de panel, exomas, segundas opiniones e informes que no hablan el mismo idioma. El resultado es una carpeta llena de datos, pero poca claridad práctica.',
          'Pocket Genes propone una experiencia donde la información genética se vuelve trazable: qué se estudió, por qué se pidió, qué variantes se informaron, qué significan los términos y qué temas conviene revisar con profesionales.',
        ],
        stats: [
          { value: 'EPOF', label: 'enfermedades poco frecuentes como foco central' },
          { value: 'PDF', label: 'informes que pueden ordenarse y contextualizarse' },
          { value: '3', label: 'capas: información, preparación y apoyo' },
        ],
        pillarsTitle: 'Necesidades concretas durante un recorrido complejo',
        pillarsSubtitle:
          'El producto debe hablar menos de curiosidad genética y más de orientación, continuidad y acompañamiento.',
        pillars: [
          {
            title: 'Saber qué se analizó',
            body: 'Diferenciar genes incluidos, regiones cubiertas, variantes reportadas y posibles limitaciones del estudio.',
          },
          {
            title: 'Entender qué preguntar',
            body: 'Preparar preguntas sobre herencia, familiares, nuevas pruebas, reanálisis, asesoramiento genético y seguimiento.',
          },
          {
            title: 'Encontrar recursos',
            body: 'Acercar asociaciones, registros, centros de referencia, guías y materiales educativos relacionados con la condición.',
          },
          {
            title: 'No estar solo',
            body: 'Crear caminos para encontrar personas, familias y comunidades con experiencias compatibles.',
          },
        ],
        sections: [
          {
            eyebrow: 'Del caos a la continuidad',
            title: 'Una línea de tiempo para el recorrido genético',
            body:
              'El valor no está solo en mostrar un resultado. Está en poder reconstruir la historia: síntomas, estudios, paneles, hallazgos, dudas, consultas y próximos pasos.',
            image: '/integrate2.webp',
            imageAlt: 'Pantallas de Pocket Genes con información genómica',
            items: [
              {
                title: 'Estudios y reanálisis',
                body: 'Registrar versiones de informes y mantener visible cuando un resultado podría necesitar revisarse.',
              },
              {
                title: 'Preguntas pendientes',
                body: 'Guardar temas para hablar con especialistas sin depender de memoria o mensajes sueltos.',
              },
              {
                title: 'Contexto familiar',
                body: 'Ordenar información relevante sobre herencia, portadores y antecedentes familiares.',
              },
            ],
          },
          {
            eyebrow: 'EPOF como misión',
            title: 'La comunidad no es una función secundaria',
            body:
              'Para muchas enfermedades poco frecuentes, encontrar a otra persona con una variante, condición o recorrido parecido puede cambiar la experiencia completa.',
            items: [
              {
                title: 'Asociaciones y registros',
                body: 'Facilitar el camino hacia organizaciones y bases de datos que ya trabajan con cada condición.',
              },
              {
                title: 'Especialistas y centros',
                body: 'Ayudar a ubicar recursos de referencia para orientar mejor la próxima conversación médica.',
              },
              {
                title: 'Historias compatibles',
                body: 'Permitir conexiones responsables basadas en diagnósticos, variantes, síntomas o preguntas compartidas.',
              },
            ],
          },
        ],
        ethicsTitle: 'Acompañamiento sin invadir el acto médico',
        ethicsBody:
          'Pocket Genes acompaña la organización y la alfabetización genética, pero no entrega diagnósticos ni decisiones terapéuticas.',
        ethicsItems: [
          'No reemplaza el asesoramiento genético.',
          'No decide qué estudio corresponde.',
          'No interpreta variantes fuera del contexto clínico profesional.',
        ],
        ctaTitle: 'De la incertidumbre a una consulta mejor preparada',
        ctaBody:
          'El objetivo es que una familia llegue a la siguiente conversación con más orden, mejores preguntas y menos carga mental.',
        ctaPrimaryLabel: 'Ver espacio personal',
        ctaPrimaryHref: '/pocket-genes/companion',
        ctaSecondaryLabel: 'Ver PockeAmigos',
        ctaSecondaryHref: '/pocket-genes/community',
      },
      companion: {
        title: 'Pocket Genes - Espacio personal para información genética',
        navLabel: 'Secciones de Pocket Genes',
        eyebrow: 'Espacio personal',
        heroTitle: 'Un espacio personal para ordenar tu información genética.',
        heroLead:
          'Pocket Genes te ayuda a guardar informes, registrar proveedores, entender conceptos básicos y preparar preguntas para tus consultas.',
        heroImage: '/integrate1.webp',
        heroImageAlt: 'Pantallas móviles con informes genéticos',
        primaryActionLabel: 'Ver PockeAmigos',
        primaryActionHref: '/pocket-genes/community',
        secondaryActionLabel: 'Ver integración',
        secondaryActionHref: '/pocket-genes/integration',
        introEyebrow: 'Más que visualización',
        introTitle: 'Tus informes, tus preguntas y tus próximos pasos en un solo lugar.',
        introBody: [
          'La experiencia móvil debe mostrar datos de manera clara, pero también debe responder preguntas prácticas: dónde está mi informe, qué significa este término, qué genes cubrió este panel, qué debería revisar antes de ver al especialista y qué puedo compartir.',
          'El espacio personal organiza la información en capas: documentos, conceptos, variantes informadas, historial, notas y próximas preguntas.',
        ],
        stats: [
          { value: 'PDF+', label: 'informes convertidos en información navegable' },
          { value: 'Consultas', label: 'preguntas preparadas para consulta' },
          { value: 'Control', label: 'intercambio cuidado con familiares o profesionales' },
        ],
        pillarsTitle: 'Capas del espacio personal',
        pillarsSubtitle:
          'Cada capa responde a una necesidad concreta durante el recorrido genético.',
        pillars: [
          {
            title: 'Biblioteca personal',
            body: 'Informes, paneles, documentos, fechas, laboratorios y notas en un espacio persistente.',
          },
          {
            title: 'Glosario contextual',
            body: 'Explicaciones de variantes, herencia, penetrancia, portadores, farmacogenómica y secuenciación.',
          },
          {
            title: 'Preparación médica',
            body: 'Listas de preguntas, temas pendientes y puntos para confirmar con profesionales.',
          },
          {
            title: 'Compartir con control',
            body: 'Formas claras de compartir información relevante sin perder privacidad ni contexto.',
          },
        ],
        sections: [
          {
            eyebrow: 'Comprensión',
            title: 'Acceso a recursos claros en momentos difíciles',
            body:
              'La información genética llega cargada de términos técnicos. Pocket Genes debe convertirlos en lenguaje revisable, consistente y fácil de volver a consultar.',
            image: '/interactive1.webp',
            imageAlt: 'Visualización interactiva de datos genéticos',
            items: [
              {
                title: 'Conceptos en contexto',
                body: 'Explicar términos cuando aparecen, no en una biblioteca separada que nadie encuentra.',
              },
              {
                title: 'Diferenciar certeza de duda',
                body: 'Separar datos informados, interpretaciones clínicas y preguntas que requieren un profesional.',
              },
              {
                title: 'Lenguaje familiar',
                body: 'Hacer que una madre, un paciente adulto o un cuidador puedan revisar lo esencial sin tener formación genética.',
              },
            ],
          },
          {
            eyebrow: 'Preparación',
            title: 'Mejores consultas, no respuestas automáticas',
            body:
              'El producto no debe prometer diagnósticos. Debe ayudar a que la persona llegue a la consulta con el material correcto y preguntas más precisas.',
            items: [
              {
                title: 'Qué llevar',
                body: 'Informes, fechas, estudios previos, antecedentes y notas listos para compartir.',
              },
              {
                title: 'Qué preguntar',
                body: 'Dudas sobre genes no cubiertos, reanálisis, familiares, herencia, especialistas y próximos estudios.',
              },
              {
                title: 'Qué revisar después',
                body: 'Seguimiento de respuestas, nuevas indicaciones y recursos recomendados.',
              },
            ],
          },
        ],
        ethicsTitle: 'Diseño responsable',
        ethicsBody:
          'Un espacio personal de información genética debe ser cuidadoso con lenguaje, privacidad y expectativas. Claridad no significa simplificar de más ni hacer promesas clínicas.',
        ethicsItems: [
          'Evita lenguaje alarmista.',
          'Mantiene la privacidad como configuración central.',
          'Indica cuando una pregunta debe revisarse con un profesional.',
        ],
        ctaTitle: 'Construir confianza requiere estructura',
        ctaBody:
          'La utilidad nace cuando la información deja de estar dispersa y empieza a sostener decisiones informadas junto al equipo médico.',
        ctaPrimaryLabel: 'Ver PockeAmigos',
        ctaPrimaryHref: '/pocket-genes/community',
        ctaSecondaryLabel: 'Volver a misión',
        ctaSecondaryHref: '/pocket-genes',
      },
      community: {
        title: 'PockeAmigos - Comunidad segura para EPOF',
        navLabel: 'Secciones de Pocket Genes',
        eyebrow: 'PockeAmigos',
        heroTitle: 'PockeAmigos: pequeños círculos para no atravesar el camino en soledad.',
        heroLead:
          'Una comunidad segura y voluntaria para que personas y familias con enfermedades poco frecuentes puedan encontrar a otros, participar en círculos pequeños y compartir solo la información que elijan.',
        heroImage: '/integrate2.webp',
        heroImageAlt: 'Pantallas de Pocket Genes sobre un fondo de ADN',
        primaryActionLabel: 'Descargar Pocket Genes',
        primaryActionHref: '/pocket-genes/download',
        secondaryActionLabel: 'Cómo funciona la privacidad',
        secondaryActionHref: '#privacy',
        introEyebrow: 'Qué es PockeAmigos',
        introTitle: 'Acompañamiento y comunidad sin exponer información sensible',
        introBody: [
          'PockeAmigos no reemplaza la atención médica, el asesoramiento genético ni el trabajo de asociaciones de pacientes. Complementa ese ecosistema con un espacio más personal, cuidado y voluntario.',
          'No tenés que contar todo para pertenecer. PockeAmigos conecta personas: familias que todavía buscan diagnóstico, adultos que viven con una EPOF, cuidadores y miembros que quieren aprender genética sin miedo.',
        ],
        stats: [
          { value: 'Voluntario', label: 'participación y conexiones solo con consentimiento' },
          { value: 'Círculos', label: 'espacios pequeños por etapa, rol, tema o ubicación' },
          { value: 'Privado', label: 'informes genéticos y datos sensibles nunca públicos por defecto' },
        ],
        pillarsTitle: 'Círculos pequeños, no un foro gigante',
        pillarsSubtitle:
          'PockeAmigos se organiza alrededor de grupos más cuidados, con reglas claras, moderación y control de privacidad.',
        pillars: [
          {
            title: 'En búsqueda diagnóstica',
            body: 'Para familias que todavía intentan ordenar estudios, síntomas, derivaciones y próximos pasos.',
          },
          {
            title: 'Nuevo diagnóstico',
            body: 'Para quienes necesitan entender conceptos, encontrar orientación y hablar con otros que ya pasaron por esa etapa.',
          },
          {
            title: 'Genética sin miedo',
            body: 'Para aprender sobre variantes, paneles, herencia, portadores, VUS y secuenciación en lenguaje accesible.',
          },
          {
            title: 'Familias y cuidadores',
            body: 'Para madres, padres, parejas y cuidadores que necesitan apoyo práctico y emocional.',
          },
        ],
        sections: [
          {
            eyebrow: 'Control',
            title: 'Tu historia, tu control',
            body:
              'PockeAmigos permite participar con un apodo, mostrar solo el rol o etapa del camino, ocultar detalles diagnósticos y mantener los informes genéticos privados.',
            image: '/integrate1.webp',
            imageAlt: 'Pantallas móviles de Pocket Genes con informes genéticos',
            items: [
              {
                title: 'Privado para mí',
                body: 'Informes, archivos, variantes, historia clínica completa y datos sensibles.',
              },
              {
                title: 'Visible en círculos',
                body: 'Apodo, rol, etapa general del camino e intereses amplios.',
              },
              {
                title: 'Después de aceptar conexión',
                body: 'Nombre, historia, preferencia de contacto y diagnóstico opcional.',
              },
            ],
          },
          {
            eyebrow: 'Pocket Genes',
            title: 'La app como punto de entrada seguro',
            body:
              'Pocket Genes es una herramienta dentro del ecosistema PockeAmigos: ayuda a ordenar informes, aprender conceptos básicos y crear resúmenes más seguros para participar en comunidad.',
            items: [
              {
                title: 'Organizador de informes',
                body: 'Guardar y ordenar PDFs, paneles, proveedores, fechas y notas.',
              },
              {
                title: 'Aprendizaje genético',
                body: 'Entender variantes, paneles, herencia, VUS, portadores y secuenciación.',
              },
              {
                title: 'Preguntas para consulta',
                body: 'Preparar mejores preguntas para médicos, profesionales de genética u organizaciones de pacientes.',
              },
            ],
          },
          {
            id: 'privacy',
            eyebrow: 'Privacidad',
            title: 'Nunca público por defecto',
            body:
              'La comunidad existe para acompañar, no para exponer. Cada nivel de visibilidad debe ser claro, reversible y fácil de entender antes de compartir.',
            items: [
              {
                title: 'Informes privados',
                body: 'Los informes genéticos, variantes exactas, teléfono, dirección, DNI e historia clínica completa no se publican por defecto.',
              },
              {
                title: 'Resumen seguro',
                body: 'El perfil comunitario puede decir qué buscás sin revelar datos genéticos privados.',
              },
              {
                title: 'Bloquear o salir',
                body: 'Los miembros pueden dejar círculos, bloquear contactos o reportar situaciones en cualquier momento.',
              },
            ],
          },
        ],
        ethicsTitle: 'Reglas de seguridad comunitaria',
        ethicsBody:
          'PockeAmigos no diagnostica, no prescribe tratamientos y no permite que la comunidad reemplace conversaciones con profesionales de salud.',
        ethicsItems: [
          'No se permiten diagnósticos, tratamientos, curas milagrosas ni presión médica.',
          'No compartir información médica de otras personas.',
          'Informes genéticos privados por defecto, con consentimiento explícito para cualquier conexión.',
          'Moderación contra acoso, desinformación y exposición de datos sensibles.',
        ],
        ctaTitle: 'Entrá a PockeAmigos desde Pocket Genes',
        ctaBody:
          'Descargá Pocket Genes para empezar a organizar informes y participar en la comunidad con más seguridad.',
        ctaPrimaryLabel: 'Descargar la app',
        ctaPrimaryHref: '/pocket-genes/download',
        ctaSecondaryLabel: 'Ver integración para proveedores',
        ctaSecondaryHref: '/pocket-genes/integration',
      },
    },
  },
  en: {
    nav: [
      { label: 'Mission', path: '/pocket-genes', slug: 'mission' },
      { label: 'Rare disease', path: '/pocket-genes/rare-disease', slug: 'rare-disease' },
      { label: 'Companion', path: '/pocket-genes/companion', slug: 'companion' },
      { label: 'RareFriends™', path: '/pocket-genes/community', slug: 'community' },
      { label: 'Integration', path: '/pocket-genes/integration' },
    ],
    pages: {
      mission: {
        title: 'Pocket Genes - Genomic companion for families',
        navLabel: 'Pocket Genes sections',
        eyebrow: 'Pocket Genes',
        heroTitle: 'A genomic companion for navigating uncertainty.',
        heroLead:
          'Pocket Genes helps people and families bring scattered genetic information together, understand complex concepts, prepare better medical conversations, and find support when the path is rare, long, or confusing.',
        heroImage: '/mobile1.webp',
        heroImageAlt: 'Pocket Genes on a mobile phone',
        primaryActionLabel: 'Explore the rare disease mission',
        primaryActionHref: '/pocket-genes/rare-disease',
        secondaryActionLabel: 'See provider integration',
        secondaryActionHref: '/pocket-genes/integration',
        introEyebrow: 'The positioning shift',
        introTitle: 'Not just a report viewer. A way to turn genetic data into useful context.',
        introBody: [
          'Pocket Genes is designed to organize reports, panels, providers, test history, inheritance concepts, and possible next questions in one clear place. The goal is not to replace physicians or genetic counselors, but to help people arrive better prepared.',
        ],
        stats: [
          { value: '1', label: 'place for reports, panels, and PDFs' },
          { value: '0', label: 'diagnoses or clinical instructions inside the app' },
          { value: '24/7', label: 'organized information before an appointment' },
        ],
        pillarsTitle: 'What Pocket Genes needs to solve',
        pillarsSubtitle:
          'The experience is organized around real needs families face when genetic questions are difficult.',
        pillars: [
          {
            title: 'Organize information',
            body: 'Bring reports, files, panels, labs, dates, analyzed genes, and family notes together so important context is not lost.',
          },
          {
            title: 'Understand concepts',
            body: 'Explain variants, inheritance, carrier status, penetrance, panels, sequencing, and pharmacogenomics in accessible language.',
          },
          {
            title: 'Prepare conversations',
            body: 'Help identify what was analyzed, what may be missing, and which questions to bring to a physician or genetic counselor.',
          },
          {
            title: 'Find support',
            body: 'Connect people with associations, resources, registries, specialists, and others navigating similar questions.',
          },
        ],
        sections: [
          {
            eyebrow: 'For families',
            title: 'From loose files to an organized genetic story',
            body:
              'Many families arrive at genetics after years of symptoms, referrals, tests, and PDFs that are hard to compare. Pocket Genes turns that accumulation into a timeline people can actually use.',
            image: '/integrate1.webp',
            imageAlt: 'Organized genomic report interface',
            items: [
              {
                title: 'Test history',
                body: 'Save which test was done, when, with which provider, and what type of panel or technology was used.',
              },
              {
                title: 'Genetic coverage',
                body: 'Separate analyzed genes, genes not covered, and areas where another test or specialist discussion may be needed.',
              },
              {
                title: 'Appointment notes',
                body: 'Turn scattered concerns into clear questions for the medical team.',
              },
            ],
          },
          {
            eyebrow: 'For the ecosystem',
            title: 'A bridge between patients, providers, and community',
            body:
              'The same base that lets providers integrate reports can also help families compare coverage, understand results, organize resources, and reach support networks.',
            image: '/mobile2.webp',
            imageAlt: 'Phone beside a lab pipette',
            items: [
              {
                title: 'Comparable providers',
                body: 'Understand which panel, lab, or service covers which genes, conditions, or needs.',
              },
              {
                title: 'Trusted resources',
                body: 'Surface associations, registries, educational guides, and relevant specialists based on context.',
              },
              {
                title: 'Privacy first',
                body: 'Give people control over what information is stored, shared, and with whom.',
              },
            ],
          },
        ],
        ethicsTitle: 'Clear clinical boundaries',
        ethicsBody:
          'Pocket Genes does not diagnose, prescribe, or replace health professionals. Its role is to help people organize information, understand concepts, and prepare better conversations.',
        ethicsItems: [
          'Educational language, not medical instructions.',
          'Separates reported findings from questions that need professional interpretation.',
          'Encourages consultation with physicians, geneticists, and genetic counselors.',
        ],
        ctaTitle: 'Two narratives, one platform',
        ctaBody:
          'Families need clarity and support. Providers need a serious way to deliver mobile reports. Pocket Genes connects those needs without mixing them.',
        ctaPrimaryLabel: 'See rare disease journey',
        ctaPrimaryHref: '/pocket-genes/rare-disease',
        ctaSecondaryLabel: 'See integration',
        ctaSecondaryHref: '/pocket-genes/integration',
      },
      'rare-disease': {
        title: 'Pocket Genes - Rare disease and EPOF support',
        navLabel: 'Pocket Genes sections',
        eyebrow: 'Rare disease',
        heroTitle: 'When a disease is rare, information needs to be clear and organized.',
        heroLead:
          'Families facing rare disease uncertainty often carry scattered reports, difficult terms, years of referrals, and few people who understand their experience. Pocket Genes is built around organizing that path.',
        heroImage: '/mobile2.webp',
        heroImageAlt: 'Genetic laboratory with a mobile phone',
        primaryActionLabel: 'See genomic companion',
        primaryActionHref: '/pocket-genes/companion',
        secondaryActionLabel: 'Back to Pocket Genes',
        secondaryActionHref: '/pocket-genes',
        introEyebrow: 'The human problem',
        introTitle: 'The diagnostic odyssey is also an information odyssey.',
        introBody: [
          'In rare disease, a family may pass through pediatricians, specialists, labs, panel tests, exomes, second opinions, and reports that do not speak the same language. The result is a folder full of data, but limited practical clarity.',
          'Pocket Genes proposes an experience where genetic information becomes traceable: what was tested, why it was ordered, which variants were reported, what terms mean, and which topics should be reviewed with professionals.',
        ],
        stats: [
          { value: 'EPOF', label: 'rare diseases as a core focus' },
          { value: 'PDF', label: 'reports that can be organized and contextualized' },
          { value: '3', label: 'layers: information, preparation, and support' },
        ],
        pillarsTitle: 'Concrete needs during a complex journey',
        pillarsSubtitle:
          'The product should speak less about genetic curiosity and more about orientation, continuity, and support.',
        pillars: [
          {
            title: 'Know what was analyzed',
            body: 'Separate included genes, covered regions, reported variants, and possible limitations of the test.',
          },
          {
            title: 'Understand what to ask',
            body: 'Prepare questions about inheritance, relatives, new genetic testing, reanalysis, counseling, and follow-up.',
          },
          {
            title: 'Find resources',
            body: 'Surface associations, registries, reference centers, guides, and educational material related to the condition.',
          },
          {
            title: 'Not be alone',
            body: 'Create pathways to find people, families, and communities with compatible experiences.',
          },
        ],
        sections: [
          {
            eyebrow: 'From chaos to continuity',
            title: 'A timeline for the genetic journey',
            body:
              'The value is not only showing a result. It is being able to reconstruct the story: symptoms, tests, panels, findings, questions, appointments, and next steps.',
            image: '/integrate2.webp',
            imageAlt: 'Pocket Genes screens with genomic information',
            items: [
              {
                title: 'Tests and reanalysis',
                body: 'Track report versions and keep visible when a result may need to be revisited.',
              },
              {
                title: 'Open questions',
                body: 'Save topics to discuss with specialists instead of depending on memory or scattered messages.',
              },
              {
                title: 'Family context',
                body: 'Organize relevant information about inheritance, carrier status, and family history.',
              },
            ],
          },
          {
            eyebrow: 'Rare disease as mission',
            title: 'Community is not a secondary feature',
            body:
              'For many rare diseases, finding another person with a similar variant, condition, or path can change the entire experience.',
            items: [
              {
                title: 'Associations and registries',
                body: 'Make it easier to find organizations and databases already working with each condition.',
              },
              {
                title: 'Specialists and centers',
                body: 'Help locate reference resources to better orient the next medical conversation.',
              },
              {
                title: 'Compatible stories',
                body: 'Enable responsible connections based on diagnoses, variants, symptoms, or shared questions.',
              },
            ],
          },
        ],
        ethicsTitle: 'Support without entering the medical act',
        ethicsBody:
          'The rare disease page should make clear that Pocket Genes supports organization and genetic literacy, but does not provide diagnoses or treatment decisions.',
        ethicsItems: [
          'Does not replace genetic counseling.',
          'Does not decide which test is appropriate.',
          'Does not interpret variants outside professional clinical context.',
        ],
        ctaTitle: 'From uncertainty to a better prepared appointment',
        ctaBody:
          'The goal is for a family to arrive at the next conversation with more order, better questions, and less mental load.',
        ctaPrimaryLabel: 'See companion',
        ctaPrimaryHref: '/pocket-genes/companion',
        ctaSecondaryLabel: 'See RareFriends™',
        ctaSecondaryHref: '/pocket-genes/community',
      },
      companion: {
        title: 'Pocket Genes - Personal genomic companion',
        navLabel: 'Pocket Genes sections',
        eyebrow: 'Genomic companion',
        heroTitle: 'Your genetic information, organized for real conversations.',
        heroLead:
          'Pocket Genes turns reports, panels, and complex concepts into a personal space to review, learn, prepare questions, and share information carefully.',
        heroImage: '/integrate1.webp',
        heroImageAlt: 'Mobile screens with genomic reports',
        primaryActionLabel: 'See RareFriends™',
        primaryActionHref: '/pocket-genes/community',
        secondaryActionLabel: 'See integration',
        secondaryActionHref: '/pocket-genes/integration',
        introEyebrow: 'More than visualization',
        introTitle: 'A beautiful report helps. An organized companion changes how information is used.',
        introBody: [
          'The mobile experience should show data clearly, but it also needs to answer practical questions: where is my report, what does this term mean, which genes did this panel cover, what should I review before seeing the specialist, and what can I share.',
          'The personal companion organizes information in layers: documents, concepts, reported variants, history, notes, and next questions.',
        ],
        stats: [
          { value: 'PDF+', label: 'reports turned into navigable information' },
          { value: 'QA', label: 'questions prepared for appointments' },
          { value: 'Share', label: 'controlled sharing with relatives or professionals' },
        ],
        pillarsTitle: 'Layers of the companion',
        pillarsSubtitle:
          'Each layer responds to a concrete need during the genetic journey.',
        pillars: [
          {
            title: 'Personal library',
            body: 'Reports, panels, documents, dates, labs, and notes in one persistent space.',
          },
          {
            title: 'Contextual glossary',
            body: 'Explanations of variants, inheritance, penetrance, carrier status, pharmacogenomics, and sequencing.',
          },
          {
            title: 'Medical preparation',
            body: 'Question lists, open topics, and points to confirm with professionals.',
          },
          {
            title: 'Controlled sharing',
            body: 'Clear ways to share relevant information without losing privacy or context.',
          },
        ],
        sections: [
          {
            eyebrow: 'Understanding',
            title: 'Access to clear resources in difficult moments',
            body:
              'Genetic information arrives loaded with technical terms. Pocket Genes should turn them into language people can review, trust, and return to.',
            image: '/interactive1.webp',
            imageAlt: 'Interactive genetic data visualization',
            items: [
              {
                title: 'Concepts in context',
                body: 'Explain terms when they appear, not in a separate library no one finds.',
              },
              {
                title: 'Separate certainty from uncertainty',
                body: 'Distinguish reported data, clinical interpretations, and questions that require a professional.',
              },
              {
                title: 'Family-friendly language',
                body: 'Help a parent, adult patient, or caregiver review essentials without genetics training.',
              },
            ],
          },
          {
            eyebrow: 'Preparation',
            title: 'Better appointments, not automatic answers',
            body:
              'The product should not promise diagnoses. It should help people arrive with the right material and more precise questions.',
            items: [
              {
                title: 'What to bring',
                body: 'Reports, dates, previous tests, background, and notes ready to share.',
              },
              {
                title: 'What to ask',
                body: 'Questions about genes not covered, reanalysis, relatives, inheritance, specialists, and next tests.',
              },
              {
                title: 'What to review after',
                body: 'Track answers, new indications, and recommended resources.',
              },
            ],
          },
        ],
        ethicsTitle: 'Responsible design',
        ethicsBody:
          'A genomic companion must be careful with language, privacy, and expectations. Clarity does not mean oversimplifying or making clinical promises.',
        ethicsItems: [
          'Avoids alarmist language.',
          'Keeps privacy as a central setting.',
          'Indicates when a question should be reviewed with a professional.',
        ],
        ctaTitle: 'Trust requires structure',
        ctaBody:
          'The value appears when information stops being scattered and starts supporting informed decisions with the medical team.',
        ctaPrimaryLabel: 'See RareFriends™',
        ctaPrimaryHref: '/pocket-genes/community',
        ctaSecondaryLabel: 'Back to mission',
        ctaSecondaryHref: '/pocket-genes',
      },
      community: {
        title: 'RareFriends™ - Safe rare disease community',
        navLabel: 'Pocket Genes sections',
        eyebrow: 'RareFriends™',
        heroTitle: 'RareFriends™: find your circle in the rare disease journey.',
        heroLead:
          'A safe, opt-in space for people and families affected by rare diseases to find others, join smaller circles, and share only what they choose.',
        heroImage: '/integrate2.webp',
        heroImageAlt: 'Pocket Genes screens over a DNA background',
        primaryActionLabel: 'Download Pocket Genes',
        primaryActionHref: '/pocket-genes/download',
        secondaryActionLabel: 'How privacy works',
        secondaryActionHref: '#privacy',
        introEyebrow: 'What RareFriends™ is',
        introTitle: 'Support and community without exposing sensitive information',
        introBody: [
          'RareFriends™ does not replace medical care, genetic counseling, or the work of patient associations. It is a peer-to-peer community layer designed to help people feel less alone and find others going through similar questions.',
          'Organizations connect resources, programs, and collective efforts. RareFriends™ connects people: families still searching for diagnosis, adults living with a rare condition, caregivers, and members who want to learn genetics without fear.',
        ],
        stats: [
          { value: 'Opt-in', label: 'participation and connections only with consent' },
          { value: 'Circles', label: 'smaller spaces by journey stage, role, topic, or location' },
          { value: 'Private', label: 'private report access and optional health context are not public by default' },
        ],
        pillarsTitle: 'Small circles, not a giant public forum',
        pillarsSubtitle:
          'RareFriends™ is organized around more careful groups, clear rules, moderation, and privacy control.',
        pillars: [
          {
            title: 'Still searching',
            body: 'For families trying to organize tests, symptoms, referrals, and next steps.',
          },
          {
            title: 'New diagnosis',
            body: 'For people who need to understand concepts, find orientation, and talk with others who have been through that stage.',
          },
          {
            title: 'Genetics without fear',
            body: 'For learning about variants, panels, inheritance, carrier status, VUS, and sequencing in accessible language.',
          },
          {
            title: 'Families and caregivers',
            body: 'For parents, partners, and caregivers who need practical and emotional support.',
          },
        ],
        sections: [
          {
            eyebrow: 'Control',
            title: 'Your story, your control',
            body:
              'RareFriends™ lets members participate with a nickname, show only their role or journey stage, hide diagnosis details, and keep genetic reports private.',
            image: '/integrate1.webp',
            imageAlt: 'Pocket Genes mobile screens with genetic reports',
            items: [
              {
                title: 'Private to me',
                body: 'Private report files, exact variants you do not choose to share, direct identifiers, and detailed medical history.',
              },
              {
                title: 'Visible to circles',
                body: 'Nickname, role, general journey stage, and broad topic interests.',
              },
              {
                title: 'After accepting a connection',
                body: 'First name, story, contact preference, and optional diagnosis.',
              },
            ],
          },
          {
            eyebrow: 'Pocket Genes',
            title: 'The app as a safer entry point',
            body:
              'Pocket Genes is one tool inside the RareFriends™ ecosystem: it helps organize reports, learn basic concepts, and create safer summaries for community participation.',
            items: [
              {
                title: 'Report organizer',
                body: 'Access provider-connected reports, provider details, dates, notes, and supporting education.',
              },
              {
                title: 'Genetics Learn',
                body: 'Understand variants, panels, inheritance, VUS, carrier status, and sequencing.',
              },
              {
                title: 'Appointment questions',
                body: 'Prepare better questions for doctors, genetic counselors, or patient organizations.',
              },
            ],
          },
          {
            id: 'privacy',
            eyebrow: 'Privacy',
            title: 'Never public by default',
            body:
              'The community exists to support people, not expose them. Every visibility level should be clear, reversible, and easy to understand before sharing.',
            items: [
              {
                title: 'Private reports',
                body: 'Genetic reports, exact variants, phone number, address, national ID, and full medical records are not public by default.',
              },
              {
                title: 'Safe summary',
                body: 'A community profile can say what someone is looking for without exposing private genetic data.',
              },
              {
                title: 'Block or leave',
                body: 'Members can leave circles, block contacts, or report situations at any time.',
              },
            ],
          },
        ],
        ethicsTitle: 'Community safety rules',
        ethicsBody:
          'RareFriends™ does not diagnose, prescribe treatments, or let community conversations replace conversations with health professionals.',
        ethicsItems: [
          'No diagnoses, treatments, miracle cures, or medical pressure.',
          'No sharing another person’s medical information.',
          'Genetic reports private by default, with explicit consent for any connection.',
          'Moderation against harassment, misinformation, and exposure of sensitive data.',
        ],
        ctaTitle: 'Enter RareFriends™ through Pocket Genes',
        ctaBody:
          'Download Pocket Genes to start organizing reports and preparing safer community participation.',
        ctaPrimaryLabel: 'Download the app',
        ctaPrimaryHref: '/pocket-genes/download',
        ctaSecondaryLabel: 'See provider integration',
        ctaSecondaryHref: '/pocket-genes/integration',
      },
    },
  },
};

export function getPocketGenesStoryNav(lang: Lang): StoryNavItem[] {
  return copy[lang].nav;
}

export function getPocketGenesStoryPage(lang: Lang, slug: PocketGenesStorySlug): PocketGenesStoryPage {
  return copy[lang].pages[slug];
}
