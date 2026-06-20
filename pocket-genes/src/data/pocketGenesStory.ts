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
      { label: 'Acompañante', path: '/pocket-genes/companion', slug: 'companion' },
      { label: 'Comunidad', path: '/pocket-genes/community', slug: 'community' },
      { label: 'Integración', path: '/pocket-genes/integration' },
    ],
    pages: {
      mission: {
        title: 'Pocket Genes - Acompañante genómico para familias',
        navLabel: 'Secciones de Pocket Genes',
        eyebrow: 'Pocket Genes',
        heroTitle: 'Un acompañante genómico para navegar la incertidumbre.',
        heroLead:
          'Pocket Genes ayuda a personas y familias a reunir información genética dispersa, entender conceptos complejos, preparar mejores conversaciones médicas y encontrar apoyo cuando el camino es raro, largo o confuso.',
        heroImage: '/mobile1.webp',
        heroImageAlt: 'Pocket Genes en un teléfono móvil',
        primaryActionLabel: 'Explorar la misión EPOF',
        primaryActionHref: '/pocket-genes/rare-disease',
        secondaryActionLabel: 'Ver integración para proveedores',
        secondaryActionHref: '/pocket-genes/integration',
        introEyebrow: 'El cambio de enfoque',
        introTitle: 'No es solo un visor de reportes. Es una forma de convertir datos genéticos en contexto útil.',
        introBody: [
          'La integración con laboratorios y proveedores sigue siendo una parte importante del producto. Pero la propuesta completa empieza antes y termina después del PDF: en la vida diaria de una familia que intenta entender qué se analizó, qué falta, qué significa una variante y qué debería preguntar en la próxima consulta.',
          'Pocket Genes está pensado para ordenar reportes, paneles, proveedores, historial de estudios, conceptos de herencia y próximos pasos posibles en un lugar claro. El objetivo no es reemplazar al médico ni al genetista, sino ayudar a que las personas lleguen mejor preparadas.',
        ],
        stats: [
          { value: '1', label: 'lugar para reportes, paneles y PDFs' },
          { value: '0', label: 'diagnósticos o indicaciones clínicas dentro de la app' },
          { value: '24/7', label: 'información organizada para revisar antes de una consulta' },
        ],
        pillarsTitle: 'Lo que Pocket Genes debe resolver',
        pillarsSubtitle:
          'La experiencia se organiza alrededor de necesidades reales de familias que conviven con preguntas genéticas difíciles.',
        pillars: [
          {
            title: 'Organizar información',
            body: 'Reunir reportes, archivos, paneles, laboratorios, fechas, genes analizados y notas familiares para que nada importante quede perdido.',
          },
          {
            title: 'Entender conceptos',
            body: 'Explicar variantes, herencia, portadores, penetrancia, paneles, secuenciación y farmacogenómica en lenguaje accesible.',
          },
          {
            title: 'Preparar conversaciones',
            body: 'Ayudar a identificar qué fue analizado, qué podría faltar y qué preguntas conviene llevar a un médico o asesor genético.',
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
            imageAlt: 'Interfaz de reportes genómicos organizada',
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
              'La misma base que permite integrar reportes también puede ayudar a comparar cobertura, explicar resultados, ordenar recursos y acercar a las familias a redes de apoyo.',
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
          'Pocket Genes no diagnostica, no prescribe y no reemplaza a profesionales de salud. Su rol es ayudar a organizar información, explicar conceptos y preparar mejores conversaciones.',
        ethicsItems: [
          'Lenguaje educativo, no indicaciones médicas.',
          'Separa hallazgos reportados de interpretaciones pendientes.',
          'Promueve la consulta con médicos, genetistas y asesores genéticos.',
        ],
        ctaTitle: 'Dos narrativas, una misma plataforma',
        ctaBody:
          'Las familias necesitan claridad y acompañamiento. Los proveedores necesitan una forma seria de entregar reportes móviles. Pocket Genes conecta esas dos necesidades sin mezclarlas.',
        ctaPrimaryLabel: 'Ver viaje EPOF',
        ctaPrimaryHref: '/pocket-genes/rare-disease',
        ctaSecondaryLabel: 'Ver integración',
        ctaSecondaryHref: '/pocket-genes/integration',
      },
      'rare-disease': {
        title: 'Pocket Genes - EPOF y enfermedades poco frecuentes',
        navLabel: 'Secciones de Pocket Genes',
        eyebrow: 'EPOF',
        heroTitle: 'Cuando la condición es poco frecuente, la información no puede estar fragmentada.',
        heroLead:
          'Las familias que atraviesan una EPOF suelen cargar con reportes dispersos, términos difíciles, años de derivaciones y pocas personas que entiendan su experiencia. Pocket Genes apunta a ordenar ese camino.',
        heroImage: '/mobile2.webp',
        heroImageAlt: 'Laboratorio genético con teléfono móvil',
        primaryActionLabel: 'Ver acompañante genómico',
        primaryActionHref: '/pocket-genes/companion',
        secondaryActionLabel: 'Volver a Pocket Genes',
        secondaryActionHref: '/pocket-genes',
        introEyebrow: 'El problema humano',
        introTitle: 'La odisea diagnóstica también es una odisea de información.',
        introBody: [
          'En enfermedades poco frecuentes, una familia puede pasar por pediatras, especialistas, laboratorios, estudios de panel, exomas, segundas opiniones y reportes que no hablan el mismo idioma. El resultado es una carpeta llena de datos, pero poca claridad práctica.',
          'Pocket Genes propone una experiencia donde la información genética se vuelve trazable: qué se estudió, por qué se pidió, qué variantes se reportaron, qué significan los términos y qué temas conviene revisar con profesionales.',
        ],
        stats: [
          { value: 'EPOF', label: 'enfermedades poco frecuentes como foco central' },
          { value: 'PDF', label: 'reportes que pueden ordenarse y contextualizarse' },
          { value: '3', label: 'capas: información, preparación y apoyo' },
        ],
        pillarsTitle: 'Necesidades concretas en una búsqueda rara',
        pillarsSubtitle:
          'El producto debe hablar menos de curiosidad genética y más de orientación, continuidad y acompañamiento.',
        pillars: [
          {
            title: 'Saber qué se analizó',
            body: 'Diferenciar genes incluidos, regiones cubiertas, variantes reportadas y posibles limitaciones del estudio.',
          },
          {
            title: 'Entender qué preguntar',
            body: 'Preparar preguntas sobre herencia, familiares, nuevas pruebas, reanálisis, asesoría genética y seguimiento.',
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
                body: 'Registrar versiones de reportes y mantener visible cuando un resultado podría necesitar revisarse.',
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
          'La página EPOF debe dejar claro que Pocket Genes acompaña la organización y la alfabetización genética, pero no entrega diagnósticos ni decisiones terapéuticas.',
        ethicsItems: [
          'No reemplaza asesoría genética.',
          'No decide qué estudio corresponde.',
          'No interpreta variantes fuera del contexto clínico profesional.',
        ],
        ctaTitle: 'De la incertidumbre a una consulta mejor preparada',
        ctaBody:
          'El objetivo es que una familia llegue a la siguiente conversación con más orden, mejores preguntas y menos carga mental.',
        ctaPrimaryLabel: 'Ver acompañante',
        ctaPrimaryHref: '/pocket-genes/companion',
        ctaSecondaryLabel: 'Ver comunidad',
        ctaSecondaryHref: '/pocket-genes/community',
      },
      companion: {
        title: 'Pocket Genes - Acompañante genómico personal',
        navLabel: 'Secciones de Pocket Genes',
        eyebrow: 'Acompañante genómico',
        heroTitle: 'Tu información genética, organizada para conversaciones reales.',
        heroLead:
          'Pocket Genes convierte reportes, paneles y conceptos complejos en un espacio personal para revisar, aprender, preparar preguntas y compartir información con cuidado.',
        heroImage: '/integrate1.webp',
        heroImageAlt: 'Pantallas móviles con reportes genómicos',
        primaryActionLabel: 'Ver comunidad',
        primaryActionHref: '/pocket-genes/community',
        secondaryActionLabel: 'Ver integración',
        secondaryActionHref: '/pocket-genes/integration',
        introEyebrow: 'Más que visualización',
        introTitle: 'Un reporte bonito ayuda. Un acompañante ordenado cambia como se usa la información.',
        introBody: [
          'La experiencia móvil debe mostrar datos de manera clara, pero también debe responder preguntas prácticas: dónde está mi reporte, qué significa este término, qué genes cubrió este panel, qué debería revisar antes de ver al especialista y qué puedo compartir.',
          'El acompañante personal organiza la información en capas: documentos, conceptos, variantes reportadas, historial, notas y próximas preguntas.',
        ],
        stats: [
          { value: 'PDF+', label: 'reportes convertidos en información navegable' },
          { value: 'QA', label: 'preguntas preparadas para consulta' },
          { value: 'Share', label: 'intercambio controlado con familiares o profesionales' },
        ],
        pillarsTitle: 'Capas del acompañante',
        pillarsSubtitle:
          'Cada capa responde a una necesidad concreta durante el recorrido genético.',
        pillars: [
          {
            title: 'Biblioteca personal',
            body: 'Reportes, paneles, documentos, fechas, laboratorios y notas en un espacio persistente.',
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
            title: 'Alfabetización genética para momentos difíciles',
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
                body: 'Separar datos reportados, interpretaciones clínicas y preguntas que requieren un profesional.',
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
                body: 'Reportes, fechas, estudios previos, antecedentes y notas listos para compartir.',
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
          'Un acompañante genómico debe ser cuidadoso con lenguaje, privacidad y expectativas. Claridad no significa simplificar de más ni hacer promesas clínicas.',
        ethicsItems: [
          'Evita lenguaje alarmista.',
          'Mantiene la privacidad como configuración central.',
          'Indica cuando una pregunta debe revisarse con un profesional.',
        ],
        ctaTitle: 'Construir confianza requiere estructura',
        ctaBody:
          'La utilidad nace cuando la información deja de estar dispersa y empieza a sostener decisiones informadas junto al equipo médico.',
        ctaPrimaryLabel: 'Ver comunidad',
        ctaPrimaryHref: '/pocket-genes/community',
        ctaSecondaryLabel: 'Volver a misión',
        ctaSecondaryHref: '/pocket-genes',
      },
      community: {
        title: 'Pocket Genes - Comunidad y recursos genéticos',
        navLabel: 'Secciones de Pocket Genes',
        eyebrow: 'Comunidad',
        heroTitle: 'La genética rara necesita redes humanas, no solo reportes.',
        heroLead:
          'Pocket Genes imagina una capa comunitaria para conectar personas con preguntas similares, asociaciones, recursos educativos, registros y especialistas, siempre con consentimiento y privacidad.',
        heroImage: '/aboutus2.webp',
        heroImageAlt: 'Equipo conversando alrededor de una mesa',
        primaryActionLabel: 'Volver a la misión',
        primaryActionHref: '/pocket-genes',
        secondaryActionLabel: 'Ver EPOF',
        secondaryActionHref: '/pocket-genes/rare-disease',
        introEyebrow: 'Apoyo',
        introTitle: 'En EPOF, encontrar a otros puede ser tan importante como entender el reporte.',
        introBody: [
          'Las personas con enfermedades poco frecuentes suelen buscar durante años: otros casos, asociaciones, especialistas, estudios clínicos, registros, explicaciones y experiencias reales. Esa búsqueda no debería depender de suerte o grupos aislados.',
          'La capa comunitaria de Pocket Genes debe ayudar a descubrir recursos y conexiones relevantes sin convertir información sensible en exposición pública.',
        ],
        stats: [
          { value: 'Opt-in', label: 'conexiones solo con consentimiento' },
          { value: 'Redes', label: 'asociaciones, registros y recursos' },
          { value: 'Cuidado', label: 'privacidad y moderación desde el diseño' },
        ],
        pillarsTitle: 'Comunidad como infraestructura de cuidado',
        pillarsSubtitle:
          'La comunidad no debe ser una función social genérica. Debe responder a necesidades de salud, información y acompañamiento.',
        pillars: [
          {
            title: 'Personas compatibles',
            body: 'Conectar por diagnóstico, variante, síntomas, camino de estudio o preguntas compartidas.',
          },
          {
            title: 'Recursos curados',
            body: 'Asociaciones, guías, registros, materiales educativos y contactos útiles en un solo lugar.',
          },
          {
            title: 'Especialistas y centros',
            body: 'Orientar hacia profesionales y centros relevantes sin reemplazar derivaciones médicas.',
          },
          {
            title: 'Moderación y privacidad',
            body: 'Crear espacios seguros con consentimiento, control de datos y expectativas claras.',
          },
        ],
        sections: [
          {
            eyebrow: 'Conexión',
            title: 'Buscar por experiencia, no solo por diagnóstico',
            body:
              'Dos familias pueden no tener el mismo diagnóstico final, pero sí compartir genes, síntomas, estudios pendientes o preguntas clínicas similares.',
            image: '/aboutus3.webp',
            imageAlt: 'Personas colaborando en una mesa de trabajo',
            items: [
              {
                title: 'Variantes y genes',
                body: 'Encontrar conversaciones relevantes alrededor de genes o variantes reportadas.',
              },
              {
                title: 'Síntomas y trayectos',
                body: 'Conectar experiencias cuando el diagnóstico todavía no está cerrado.',
              },
              {
                title: 'Etapas del camino',
                body: 'Distinguir familias en búsqueda, diagnóstico reciente, seguimiento o reanálisis.',
              },
            ],
          },
          {
            eyebrow: 'Recursos',
            title: 'Una puerta de entrada a asociaciones y registros',
            body:
              'Pocket Genes puede ayudar a que una familia descubra organizaciones y recursos que ya existen, pero que muchas veces son difíciles de encontrar en el momento correcto.',
            items: [
              {
                title: 'Asociaciones por condición',
                body: 'Mapear organizaciones, comunidades y materiales según condición o área genética.',
              },
              {
                title: 'Registros y estudios',
                body: 'Señalar oportunidades de registro o investigación cuando correspondan y con información clara.',
              },
              {
                title: 'Educación continua',
                body: 'Mantener contenidos vivos sobre herencia, reanálisis, familiares y preparación de consultas.',
              },
            ],
          },
        ],
        ethicsTitle: 'Comunidad responsable',
        ethicsBody:
          'La conexión entre personas con información genética sensible exige controles fuertes y una cultura de cuidado.',
        ethicsItems: [
          'Consentimiento explícito antes de cualquier coincidencia o contacto.',
          'Opciones para participar sin mostrar datos sensibles.',
          'Moderación y límites contra consejos médicos no verificados.',
        ],
        ctaTitle: 'Del aislamiento a una red con contexto',
        ctaBody:
          'La meta es que nadie tenga que recorrer una condición rara con información dispersa y sin encontrar a quién preguntar.',
        ctaPrimaryLabel: 'Volver a Pocket Genes',
        ctaPrimaryHref: '/pocket-genes',
        ctaSecondaryLabel: 'Ver integración',
        ctaSecondaryHref: '/pocket-genes/integration',
      },
    },
  },
  en: {
    nav: [
      { label: 'Mission', path: '/pocket-genes', slug: 'mission' },
      { label: 'Rare disease', path: '/pocket-genes/rare-disease', slug: 'rare-disease' },
      { label: 'Companion', path: '/pocket-genes/companion', slug: 'companion' },
      { label: 'Community', path: '/pocket-genes/community', slug: 'community' },
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
          'Integration with labs and providers remains an important part of the product. But the full proposal starts before and ends after the PDF: in the daily life of a family trying to understand what was analyzed, what is missing, what a variant means, and what to ask in the next appointment.',
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
        heroTitle: 'When a condition is rare, information cannot stay fragmented.',
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
        pillarsTitle: 'Concrete needs in a rare search',
        pillarsSubtitle:
          'The product should speak less about genetic curiosity and more about orientation, continuity, and support.',
        pillars: [
          {
            title: 'Know what was analyzed',
            body: 'Separate included genes, covered regions, reported variants, and possible limitations of the test.',
          },
          {
            title: 'Understand what to ask',
            body: 'Prepare questions about inheritance, relatives, new testing, reanalysis, counseling, and follow-up.',
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
        ctaSecondaryLabel: 'See community',
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
        primaryActionLabel: 'See community',
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
            title: 'Genetic literacy for difficult moments',
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
        ctaPrimaryLabel: 'See community',
        ctaPrimaryHref: '/pocket-genes/community',
        ctaSecondaryLabel: 'Back to mission',
        ctaSecondaryHref: '/pocket-genes',
      },
      community: {
        title: 'Pocket Genes - Community and genetic resources',
        navLabel: 'Pocket Genes sections',
        eyebrow: 'Community',
        heroTitle: 'Rare genetics needs human networks, not only reports.',
        heroLead:
          'Pocket Genes imagines a community layer that connects people with similar questions, associations, educational resources, registries, and specialists, always with consent and privacy.',
        heroImage: '/aboutus2.webp',
        heroImageAlt: 'Team talking around a table',
        primaryActionLabel: 'Back to mission',
        primaryActionHref: '/pocket-genes',
        secondaryActionLabel: 'See rare disease',
        secondaryActionHref: '/pocket-genes/rare-disease',
        introEyebrow: 'Support',
        introTitle: 'In rare disease, finding others can matter as much as understanding the report.',
        introBody: [
          'People with rare diseases often search for years: other cases, associations, specialists, clinical studies, registries, explanations, and lived experience. That search should not depend on luck or isolated groups.',
          'The Pocket Genes community layer should help people discover relevant resources and connections without turning sensitive information into public exposure.',
        ],
        stats: [
          { value: 'Opt-in', label: 'connections only with consent' },
          { value: 'Networks', label: 'associations, registries, and resources' },
          { value: 'Care', label: 'privacy and moderation by design' },
        ],
        pillarsTitle: 'Community as care infrastructure',
        pillarsSubtitle:
          'Community should not be a generic social feature. It should respond to health, information, and support needs.',
        pillars: [
          {
            title: 'Compatible people',
            body: 'Connect by diagnosis, variant, symptoms, testing path, or shared questions.',
          },
          {
            title: 'Curated resources',
            body: 'Associations, guides, registries, educational materials, and useful contacts in one place.',
          },
          {
            title: 'Specialists and centers',
            body: 'Orient people toward relevant professionals and centers without replacing medical referrals.',
          },
          {
            title: 'Moderation and privacy',
            body: 'Create safer spaces with consent, data control, and clear expectations.',
          },
        ],
        sections: [
          {
            eyebrow: 'Connection',
            title: 'Search by experience, not only diagnosis',
            body:
              'Two families may not share a final diagnosis, but they may share genes, symptoms, pending tests, or similar clinical questions.',
            image: '/aboutus3.webp',
            imageAlt: 'People collaborating at a work table',
            items: [
              {
                title: 'Variants and genes',
                body: 'Find relevant conversations around reported genes or variants.',
              },
              {
                title: 'Symptoms and paths',
                body: 'Connect experiences when the diagnosis is still open.',
              },
              {
                title: 'Journey stages',
                body: 'Distinguish families in search, recent diagnosis, follow-up, or reanalysis.',
              },
            ],
          },
          {
            eyebrow: 'Resources',
            title: 'A doorway to associations and registries',
            body:
              'Pocket Genes can help families discover organizations and resources that already exist but are often hard to find at the right moment.',
            items: [
              {
                title: 'Condition associations',
                body: 'Map organizations, communities, and materials by condition or genetic area.',
              },
              {
                title: 'Registries and studies',
                body: 'Point to registry or research opportunities where appropriate and with clear information.',
              },
              {
                title: 'Ongoing education',
                body: 'Keep living content around inheritance, reanalysis, relatives, and appointment preparation.',
              },
            ],
          },
        ],
        ethicsTitle: 'Responsible community',
        ethicsBody:
          'Connection between people with sensitive genetic information requires strong controls and a culture of care.',
        ethicsItems: [
          'Explicit consent before any matching or contact.',
          'Options to participate without exposing sensitive data.',
          'Moderation and boundaries against unverified medical advice.',
        ],
        ctaTitle: 'From isolation to a network with context',
        ctaBody:
          'The goal is that no one has to navigate a rare condition with scattered information and no one to ask.',
        ctaPrimaryLabel: 'Back to Pocket Genes',
        ctaPrimaryHref: '/pocket-genes',
        ctaSecondaryLabel: 'See integration',
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
