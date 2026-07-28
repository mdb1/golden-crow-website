export const APP_STORE_URL = 'https://apps.apple.com/ar/app/pocket-genes/id6748587627';
export const POCKET_GENES_SUPPORT_EMAIL = 'support@goldencrowvs.com';

export const POCKET_GENES_EMAILS = {
  hello: POCKET_GENES_SUPPORT_EMAIL,
  trust: POCKET_GENES_SUPPORT_EMAIL,
  security: POCKET_GENES_SUPPORT_EMAIL,
  accessibility: POCKET_GENES_SUPPORT_EMAIL,
};

export type PocketGenesPublicLocale = 'en' | 'es';

const publicNavItemsByLocale: Record<PocketGenesPublicLocale, { label: string; href: string }[]> = {
  en: [
    { label: 'Home', href: '/pocket-genes/home' },
    { label: 'Community', href: '/pocket-genes/rarefriends' },
    { label: 'Trust Center', href: '/pocket-genes/trust-center' },
    { label: 'Integration', href: '/pocket-genes/website/integration' },
    { label: 'Download', href: '/pocket-genes/download' },
  ],
  es: [
    { label: 'Inicio', href: '/pocket-genes/home' },
    { label: 'Comunidad', href: '/pocket-genes/rarefriends' },
    { label: 'Centro de confianza', href: '/pocket-genes/trust-center' },
    { label: 'Integración', href: '/pocket-genes/website/integration' },
    { label: 'Descargar', href: '/pocket-genes/download' },
  ],
};

export const publicNavItems = publicNavItemsByLocale.en;

export function getPublicNavItems(locale: PocketGenesPublicLocale) {
  return publicNavItemsByLocale[locale];
}

export interface TrustDocumentSection {
  heading: string;
  body: string;
  bullets?: string[];
}

export interface TrustDocument {
  slug: string;
  title: string;
  category: string;
  summary: string;
  owner: string;
  lastReviewed: string;
  status: string;
  sections: TrustDocumentSection[];
}

export const trustDocuments: TrustDocument[] = [
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    category: 'Privacy and rights',
    summary:
      'Explains what information Pocket Genes collects, why it is collected, and how users control sensitive genetic and health-adjacent data.',
    owner: 'Trust and Privacy',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Scope',
        body:
          'Pocket Genes treats genetic reports, report metadata, notes, and community profile choices as sensitive information. Account data, uploaded documents, parsed report fields, educational interactions, device diagnostics, and community participation are described separately.',
      },
      {
        heading: 'User control',
        body:
          'Reports and exact variants are private by default, and community participation is opt-in.',
        bullets: [
          'Users can choose what to store, delete, or share.',
          'Community visibility is explicit and reversible.',
          'Private reports are never exposed in public community spaces by default.',
        ],
      },
    ],
  },
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    category: 'Product terms',
    summary:
      'Defines permitted use, account responsibilities, product limits, intellectual property, acceptable content, and dispute handling.',
    owner: 'Product and Legal',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Product boundaries',
        body:
          'Pocket Genes is an educational and organizational product. It does not provide diagnosis, treatment, emergency support, genetic counseling, or medical decision-making.',
      },
      {
        heading: 'User responsibilities',
        body:
          'Users may upload materials they have the right to store and may not use the product to harass, identify, or pressure community members.',
      },
    ],
  },
  {
    slug: 'community-terms',
    title: 'Community Terms',
    category: 'Community',
    summary:
      'Sets the rules for RareFriends by Pocket Genes, including identity choices, respectful participation, and limits on medical advice.',
    owner: 'Community Operations',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'RareFriends by Pocket Genes',
        body:
          'RareFriends by Pocket Genes is the community layer connected to Pocket Genes. The full name is used consistently so people understand the relationship between the community and the app.',
      },
      {
        heading: 'Participation rules',
        body:
          'Community members can participate with a limited profile, leave groups, block contacts, and report unsafe behavior.',
        bullets: [
          'No diagnosis or treatment instructions from community members.',
          'No pressure to disclose exact variants, reports, or identity.',
          'No scraping, re-identification, or external redistribution of community posts.',
        ],
      },
    ],
  },
  {
    slug: 'community-safety-policy',
    title: 'Community Safety Policy',
    category: 'Community',
    summary:
      'Details moderation, reporting, escalation, abuse prevention, and crisis handling for RareFriends by Pocket Genes.',
    owner: 'Community Operations',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Safety model',
        body:
          'The safety policy explains how Pocket Genes handles reports, blocks, content removal, repeated abuse, and attempts to identify vulnerable members.',
      },
      {
        heading: 'Escalation',
        body:
          'Pocket Genes provides a clear contact path for urgent safety reports.',
      },
    ],
  },
  {
    slug: 'security-overview',
    title: 'Security Overview',
    category: 'Security',
    summary:
      'Summarizes the security controls Pocket Genes is designed around.',
    owner: 'Security',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Core controls',
        body:
          'The security overview covers transport security, access control, environment separation, auditability, and secure handling of uploaded reports.',
        bullets: [
          'Encryption in transit for user traffic.',
          'Least-privilege access for operational tooling.',
          'Sensitive report access scoped to the user and authorized workflows.',
        ],
      },
      {
        heading: 'Security questions',
        body:
          `Security questions can be sent to ${POCKET_GENES_SUPPORT_EMAIL}.`,
      },
    ],
  },
  {
    slug: 'data-flow-diagram',
    title: 'Data-Flow Diagram',
    category: 'Security',
    summary:
      'Shows how a report becomes a private Pocket Genes experience and what can optionally move into community sharing.',
    owner: 'Security and Product',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Flow',
        body:
          'The diagram separates source report fields, Pocket Genes organization, educational explanations, user storage, optional sharing, and deletion paths.',
      },
      {
        heading: 'Default visibility',
        body:
          'Uploaded reports, parsed variants, report sources, and health notes remain private unless a user explicitly shares a limited summary.',
      },
    ],
  },
  {
    slug: 'subprocessor-list',
    title: 'Subprocessor List',
    category: 'Privacy and rights',
    summary:
      'Lists third parties that may process account, hosting, analytics, storage, support, or communication data for Pocket Genes.',
    owner: 'Trust and Privacy',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Public register',
        body:
          'The subprocessor list identifies each service, purpose, data category, processing location when known, and change notification process.',
      },
      {
        heading: 'Data processing terms',
        body:
          'Product-specific subprocessors are reflected in the applicable data processing terms before production use.',
      },
    ],
  },
  {
    slug: 'data-retention-deletion',
    title: 'Data-Retention and Deletion Policy',
    category: 'Privacy and rights',
    summary:
      'Explains how long Pocket Genes keeps account data, reports, parsed fields, community content, logs, and backups.',
    owner: 'Trust and Privacy',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Retention principles',
        body:
          'Pocket Genes keeps personal and genetic data only for the product purpose, user request, legal need, or support obligation that justifies retention.',
      },
      {
        heading: 'Deletion',
        body:
          'Deletion workflows explain what is removed immediately, what may remain in backups for a limited period, and what anonymized operational records may be retained.',
      },
    ],
  },
  {
    slug: 'incident-reporting',
    title: 'Incident-Reporting Contact',
    category: 'Security',
    summary:
      'Provides a direct channel for security, privacy, and community safety reports.',
    owner: 'Security',
    lastReviewed: 'July 2026',
    status: 'Active contact page',
    sections: [
      {
        heading: 'Contact',
        body:
          `Security, privacy, and trust questions can be sent to ${POCKET_GENES_SUPPORT_EMAIL}.`,
      },
      {
        heading: 'What to include',
        body:
          'Helpful reports include the affected feature, approximate time, steps to reproduce when applicable, screenshots without sensitive genetic data when possible, and a safe callback email.',
      },
    ],
  },
  {
    slug: 'accessibility-statement',
    title: 'Accessibility Statement',
    category: 'Accessibility',
    summary:
      'Sets the accessibility target for Pocket Genes public pages and mobile experiences, plus a contact path for barriers.',
    owner: 'Product',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Target',
        body:
          'Pocket Genes targets accessible navigation, readable contrast, keyboard-accessible public pages, semantic page structure, and clear alternatives for visual data displays.',
      },
      {
        heading: 'Feedback',
        body:
          `Accessibility barriers can be reported to ${POCKET_GENES_SUPPORT_EMAIL} with the page, device, assistive technology if relevant, and a description of the issue.`,
      },
    ],
  },
  {
    slug: 'scientific-methodology',
    title: 'Scientific Methodology',
    category: 'Science',
    summary:
      'Explains how Pocket Genes turns report fields into educational summaries without making unsupported clinical claims.',
    owner: 'Scientific Review',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Source hierarchy',
        body:
          'Educational explanations start from the report first, then are reviewed against public scientific references, professional terminology, and product safety rules.',
      },
      {
        heading: 'Review controls',
        body:
          'The methodology separates reported facts, reformatted display fields, educational definitions, and clinical interpretation that remains outside Pocket Genes.',
      },
    ],
  },
  {
    slug: 'regulatory-intended-use',
    title: 'Regulatory and Intended-Use Statement',
    category: 'Science',
    summary:
      'States what Pocket Genes is intended to do and what it is not intended to do.',
    owner: 'Product and Legal',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Intended use',
        body:
          'Pocket Genes is intended to help users organize genetic reports, review educational explanations, prepare conversations, and optionally use community features.',
      },
      {
        heading: 'Not intended for',
        body:
          'Pocket Genes is not intended to diagnose disease, interpret variants independently, prescribe treatment, replace genetic counseling, or provide emergency medical advice.',
      },
    ],
  },
];

export const trustDocumentsEs: TrustDocument[] = [
  {
    slug: 'privacy-policy',
    title: 'Política de Privacidad',
    category: 'Privacidad y derechos',
    summary:
      'Explica qué información recopila Pocket Genes, por qué se recopila y cómo los usuarios controlan datos genéticos y de salud sensibles.',
    owner: 'Confianza y privacidad',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Alcance',
        body:
          'Pocket Genes trata los informes genéticos, metadatos de informes, notas y elecciones de perfil comunitario como información sensible. Los datos de cuenta, documentos cargados, campos interpretados, interacciones educativas, diagnósticos de dispositivo y participación comunitaria se describen por separado.',
      },
      {
        heading: 'Control del usuario',
        body:
          'Los informes y variantes exactas son privados por defecto, y la participación comunitaria es opcional.',
        bullets: [
          'Los usuarios pueden elegir qué guardar, eliminar o compartir.',
          'La visibilidad comunitaria es explícita y reversible.',
          'Los informes privados nunca se exponen en espacios comunitarios públicos por defecto.',
        ],
      },
    ],
  },
  {
    slug: 'terms-of-service',
    title: 'Términos de Servicio',
    category: 'Términos del producto',
    summary:
      'Define uso permitido, responsabilidades de cuenta, límites del producto, propiedad intelectual, contenido aceptable y manejo de disputas.',
    owner: 'Producto y legal',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Límites del producto',
        body:
          'Pocket Genes es un producto educativo y organizacional. No brinda diagnóstico, tratamiento, soporte de emergencia, asesoramiento genético ni toma de decisiones médicas.',
      },
      {
        heading: 'Responsabilidades del usuario',
        body:
          'Los usuarios pueden cargar materiales que tienen derecho a almacenar y no pueden usar el producto para acosar, identificar o presionar a miembros de la comunidad.',
      },
    ],
  },
  {
    slug: 'community-terms',
    title: 'Términos de Comunidad',
    category: 'Comunidad',
    summary:
      'Establece las reglas para RareFriends by Pocket Genes, incluyendo opciones de identidad, participación respetuosa y límites sobre consejo médico.',
    owner: 'Operaciones comunitarias',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'RareFriends by Pocket Genes',
        body:
          'RareFriends by Pocket Genes es la capa comunitaria conectada a Pocket Genes. El nombre completo se usa de forma consistente para que las personas entiendan la relación entre la comunidad y la app.',
      },
      {
        heading: 'Reglas de participación',
        body:
          'Los miembros pueden participar con un perfil limitado, salir de grupos, bloquear contactos y reportar comportamientos inseguros.',
        bullets: [
          'Sin instrucciones de diagnóstico o tratamiento por parte de miembros de la comunidad.',
          'Sin presión para revelar variantes exactas, informes o identidad.',
          'Sin scraping, reidentificación o redistribución externa de publicaciones comunitarias.',
        ],
      },
    ],
  },
  {
    slug: 'community-safety-policy',
    title: 'Política de Seguridad Comunitaria',
    category: 'Comunidad',
    summary:
      'Detalla moderación, reportes, escalamiento, prevención de abuso y manejo de crisis para RareFriends by Pocket Genes.',
    owner: 'Operaciones comunitarias',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Modelo de seguridad',
        body:
          'La política de seguridad explica cómo Pocket Genes maneja reportes, bloqueos, eliminación de contenido, abuso repetido e intentos de identificar a miembros vulnerables.',
      },
      {
        heading: 'Escalamiento',
        body:
          'Pocket Genes ofrece una vía clara de contacto para reportes urgentes de seguridad.',
      },
    ],
  },
  {
    slug: 'security-overview',
    title: 'Resumen de Seguridad',
    category: 'Seguridad',
    summary:
      'Resume los controles de seguridad sobre los que se diseña Pocket Genes.',
    owner: 'Seguridad',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Controles principales',
        body:
          'El resumen de seguridad cubre seguridad de transporte, control de acceso, separación de entornos, auditabilidad y manejo seguro de informes cargados.',
        bullets: [
          'Cifrado en tránsito para el tráfico de usuarios.',
          'Acceso de privilegio mínimo para herramientas operativas.',
          'Acceso a informes sensibles acotado al usuario y a flujos autorizados.',
        ],
      },
      {
        heading: 'Preguntas de seguridad',
        body:
          `Las preguntas de seguridad pueden enviarse a ${POCKET_GENES_SUPPORT_EMAIL}.`,
      },
    ],
  },
  {
    slug: 'data-flow-diagram',
    title: 'Diagrama de Flujo de Datos',
    category: 'Seguridad',
    summary:
      'Muestra cómo un informe se convierte en una experiencia privada de Pocket Genes y qué puede moverse opcionalmente hacia la comunidad.',
    owner: 'Seguridad y producto',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Flujo',
        body:
          'El diagrama separa campos del informe fuente, organización en Pocket Genes, explicaciones educativas, almacenamiento del usuario, uso compartido opcional y rutas de eliminación.',
      },
      {
        heading: 'Visibilidad por defecto',
        body:
          'Los informes cargados, variantes interpretadas, fuentes del informe y notas de salud permanecen privados salvo que el usuario comparta explícitamente un resumen limitado.',
      },
    ],
  },
  {
    slug: 'subprocessor-list',
    title: 'Lista de Subprocesadores',
    category: 'Privacidad y derechos',
    summary:
      'Lista terceros que pueden procesar datos de cuenta, hosting, analítica, almacenamiento, soporte o comunicación para Pocket Genes.',
    owner: 'Confianza y privacidad',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Registro público',
        body:
          'La lista de subprocesadores identifica cada servicio, propósito, categoría de datos, ubicación de procesamiento cuando se conoce y proceso de notificación de cambios.',
      },
      {
        heading: 'Términos de procesamiento de datos',
        body:
          'Los subprocesadores específicos del producto se reflejan en los términos de procesamiento de datos aplicables antes del uso en producción.',
      },
    ],
  },
  {
    slug: 'data-retention-deletion',
    title: 'Política de Retención y Eliminación de Datos',
    category: 'Privacidad y derechos',
    summary:
      'Explica cuánto tiempo Pocket Genes conserva datos de cuenta, informes, campos interpretados, contenido comunitario, registros y copias de seguridad.',
    owner: 'Confianza y privacidad',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Principios de retención',
        body:
          'Pocket Genes conserva datos personales y genéticos solo por el propósito del producto, solicitud del usuario, necesidad legal u obligación de soporte que justifica la retención.',
      },
      {
        heading: 'Eliminación',
        body:
          'Los flujos de eliminación explican qué se elimina de inmediato, qué puede permanecer en copias de seguridad por un período limitado y qué registros operativos anonimizados pueden conservarse.',
      },
    ],
  },
  {
    slug: 'incident-reporting',
    title: 'Contacto para Reporte de Incidentes',
    category: 'Seguridad',
    summary:
      'Ofrece un canal directo para reportes de seguridad, privacidad y seguridad comunitaria.',
    owner: 'Seguridad',
    lastReviewed: 'Julio 2026',
    status: 'Página de contacto activa',
    sections: [
      {
        heading: 'Contacto',
        body:
          `Las preguntas de seguridad, privacidad y confianza pueden enviarse a ${POCKET_GENES_SUPPORT_EMAIL}.`,
      },
      {
        heading: 'Qué incluir',
        body:
          'Los reportes útiles incluyen la función afectada, hora aproximada, pasos para reproducir cuando corresponda, capturas sin datos genéticos sensibles cuando sea posible y un email seguro de respuesta.',
      },
    ],
  },
  {
    slug: 'accessibility-statement',
    title: 'Declaración de Accesibilidad',
    category: 'Accesibilidad',
    summary:
      'Establece el objetivo de accesibilidad para las páginas públicas y experiencias móviles de Pocket Genes, más una vía de contacto para barreras.',
    owner: 'Producto',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Objetivo',
        body:
          'Pocket Genes apunta a navegación accesible, contraste legible, páginas públicas accesibles por teclado, estructura semántica clara y alternativas claras para visualizaciones de datos.',
      },
      {
        heading: 'Feedback',
        body:
          `Las barreras de accesibilidad pueden reportarse a ${POCKET_GENES_SUPPORT_EMAIL} con la página, dispositivo, tecnología asistiva si corresponde y una descripción del problema.`,
      },
    ],
  },
  {
    slug: 'scientific-methodology',
    title: 'Metodología Científica',
    category: 'Ciencia',
    summary:
      'Explica cómo Pocket Genes convierte campos de informes en resúmenes educativos sin hacer afirmaciones clínicas no respaldadas.',
    owner: 'Revisión científica',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Jerarquía de fuentes',
        body:
          'Las explicaciones educativas parten primero del informe y luego se revisan contra referencias científicas públicas, terminología profesional y reglas de seguridad del producto.',
      },
      {
        heading: 'Controles de revisión',
        body:
          'La metodología separa hechos reportados, campos reformateados para visualización, definiciones educativas e interpretación clínica que queda fuera de Pocket Genes.',
      },
    ],
  },
  {
    slug: 'regulatory-intended-use',
    title: 'Declaración Regulatoria y de Uso Previsto',
    category: 'Ciencia',
    summary:
      'Establece qué pretende hacer Pocket Genes y qué no pretende hacer.',
    owner: 'Producto y legal',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Uso previsto',
        body:
          'Pocket Genes está pensado para ayudar a los usuarios a organizar informes genéticos, revisar explicaciones educativas, preparar conversaciones y usar opcionalmente funciones comunitarias.',
      },
      {
        heading: 'No previsto para',
        body:
          'Pocket Genes no está pensado para diagnosticar enfermedades, interpretar variantes de forma independiente, prescribir tratamientos, reemplazar asesoramiento genético ni brindar consejo médico de emergencia.',
      },
    ],
  },
];

export function getLocalizedTrustDocuments(locale: PocketGenesPublicLocale) {
  return locale === 'es' ? trustDocumentsEs : trustDocuments;
}

export function getTrustDocument(slug: string, locale: PocketGenesPublicLocale = 'en') {
  return getLocalizedTrustDocuments(locale).find((document) => document.slug === slug);
}
