export const APP_STORE_URL = 'https://apps.apple.com/ar/app/pocket-genes/id6748587627';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=goldencrowvs.pocketgenes&hl=en';
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
    { label: 'Join us', href: '/pocket-genes/join-us' },
    { label: 'Integration', href: '/pocket-genes/website/integration' },
    { label: 'Download the app', href: '/pocket-genes/download' },
  ],
  es: [
    { label: 'Inicio', href: '/pocket-genes/home' },
    { label: 'Comunidad', href: '/pocket-genes/rarefriends' },
    { label: 'Sumate', href: '/pocket-genes/join-us' },
    { label: 'Integración', href: '/pocket-genes/website/integration' },
    { label: 'Descargar la app', href: '/pocket-genes/download' },
  ],
};

export const publicNavItems = publicNavItemsByLocale.en;

export function getPublicNavItems(locale: PocketGenesPublicLocale) {
  return publicNavItemsByLocale[locale];
}

export interface TrustDocumentSection {
  heading: string;
  body?: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: {
    heading: string;
    body?: string;
    bullets?: string[];
  }[];
  table?: {
    headers: string[];
    rows: string[][];
  };
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
      'Explains what personal information Pocket Genes processes, why we need it, how it is protected, when it may be shared, and the choices available to users.',
    owner: 'Trust and Privacy',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Scope',
        paragraphs: [
          'This Privacy Policy applies to personal information processed through the Pocket Genes mobile application, website, community features, integrations, and related services.',
          'Pocket Genes processes limited personal information necessary to operate these services. Depending on how a person uses Pocket Genes, this may include account information, contact information, integration information, consent records, community activity, and technical information associated with use of the platform.',
          'Genetic reports accessed through participating providers remain associated with their original source. Pocket Genes uses the information required to provide the corresponding access and experience without treating the complete underlying report as general account or community data.',
        ],
      },
      {
        heading: 'Information we process',
        body:
          'The information Pocket Genes processes depends on the feature, integration, or community activity a person chooses to use.',
        subsections: [
          {
            heading: 'Account information',
            bullets: [
              'Name.',
              'Surname.',
              'Email.',
              'Phone number, when provided.',
              'Account identifier.',
              'Authentication information.',
            ],
          },
          {
            heading: 'Integration information',
            bullets: [
              'Organization or provider.',
              'Information required to connect the intended person with an integration.',
              'Invitation or delivery status.',
            ],
          },
          {
            heading: 'Consent information',
            bullets: [
              'Consent status.',
              'Version.',
              'Timestamp.',
              'Related workflow or provider.',
            ],
          },
          {
            heading: 'Community information',
            bullets: [
              'Profile.',
              'Posts.',
              'Comments.',
              'Follows.',
              'Messages or participation where applicable.',
            ],
          },
          {
            heading: 'Technical information',
            bullets: [
              'Device and app information.',
              'Logs.',
              'Security or diagnostic events.',
            ],
          },
        ],
      },
      {
        heading: 'Why we process it',
        body:
          'We process personal information to create and protect accounts, communicate with users, provide requested integrations, establish access to relevant reports and resources, document consent where required, operate community functionality, provide support, prevent abuse, and maintain the security and reliability of Pocket Genes.',
      },
      {
        heading: 'Report access',
        body:
          'Pocket Genes may provide access to genetic reports made available by participating providers. The original provider remains the source of the report and its findings. Pocket Genes facilitates the user experience around accessing and understanding that information rather than replacing the provider\'s underlying report.',
      },
      {
        heading: 'Information from organizations',
        paragraphs: [
          'Participating organizations may provide limited contact or identifying information when necessary to initiate a Pocket Genes experience for an intended user. Depending on the integration, this may include a name, surname, email address, or phone number.',
          'Pocket Genes uses this information for the corresponding communication, access, consent, or integration process and does not treat the originating organization as having general access to the user\'s Pocket Genes activity.',
        ],
      },
      {
        heading: 'Service providers and international processing',
        body:
          'Pocket Genes uses third-party infrastructure and technology providers, including Amazon Web Services and Google Firebase. Some providers may process information outside the user\'s country. Further information is available in our Subprocessor List.',
      },
      {
        heading: 'User rights',
        body:
          `Users can contact ${POCKET_GENES_SUPPORT_EMAIL} for privacy questions and requests related to their information.`,
        bullets: [
          'Access.',
          'Correction.',
          'Deletion.',
          'Withdrawal of consent where applicable.',
          'Account deletion.',
          'Privacy questions.',
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
        heading: 'Eligibility and accounts',
        body:
          'Pocket Genes accounts are intended for people who are permitted to use the service under applicable law and who provide accurate account information. Users are responsible for keeping their sign-in credentials secure and for activity that occurs through their account.',
      },
      {
        heading: 'Pocket Genes services',
        body:
          'Pocket Genes may include mobile report access, educational content, resource discovery, trusted organization content, and community functionality. Some features may depend on a participating provider, organization, invitation, or consent workflow.',
      },
      {
        heading: 'Report providers',
        body:
          'Reports and findings accessible through Pocket Genes may originate from independent laboratories, providers, or organizations. Those providers remain responsible for the reports and services they issue.',
      },
      {
        heading: 'No medical services',
        body:
          'Pocket Genes is an educational and access-oriented product. It does not provide diagnosis, treatment, emergency support, genetic counseling, medical decision-making, or a replacement for the report provider.',
      },
      {
        heading: 'User responsibilities',
        body:
          'Users must use Pocket Genes lawfully, respect community rules, protect their account, avoid harassment or re-identification attempts, and avoid pressuring others to disclose private medical, genetic, or identity information.',
      },
      {
        heading: 'Organizations',
        body:
          'Trusted organization status means an organization has been reviewed for participation in the Pocket Genes ecosystem. It is not an endorsement of every statement, service, product, event, or resource published by that organization.',
      },
      {
        heading: 'Intellectual property',
        body:
          'Pocket Genes owns or licenses the Pocket Genes product experience, branding, and educational content. Providers remain responsible for their own report content. Users and organizations remain responsible for content they choose to publish or provide through community and organization features.',
      },
      {
        heading: 'Availability and account action',
        body:
          'Pocket Genes services may change, pause, or be interrupted. Pocket Genes may suspend or terminate access when needed to protect users, the community, the platform, or legal obligations.',
      },
      {
        heading: 'Privacy, liability, and governing law',
        body:
          'Use of Pocket Genes is also governed by the Privacy Policy. Liability limits, dispute terms, and governing law should be reviewed with legal counsel before relying on this page as a final legal agreement.',
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
      {
        heading: 'What users control',
        body:
          'Users choose how they participate in community spaces and can adjust or stop participation separately from private report access.',
        bullets: [
          'Profile information.',
          'Whether to participate.',
          'What they publish.',
          'Who they interact with.',
          'Groups or circles they join.',
          'Blocking and reporting.',
        ],
      },
      {
        heading: 'Private information',
        body:
          'Information available through private Pocket Genes functionality is not automatically part of a user\'s RareFriends profile or community activity.',
      },
      {
        heading: 'Trusted organizations',
        body:
          'Trusted Organizations do not receive privileged access to private user information simply because they are trusted. Organizations must not use community access to aggressively solicit vulnerable users or blur promotional content with education or support.',
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
        heading: 'Content and behavior we review',
        body:
          'Pocket Genes may review and act on behavior that puts users, families, caregivers, or organizations at risk.',
        bullets: [
          'Harassment.',
          'Medical misinformation.',
          'Impersonation.',
          'Spam or scams.',
          'Pressure to disclose medical or genetic information.',
          'Publication of somebody else\'s private information.',
          'Predatory commercial solicitation.',
          'Dangerous medical instructions or urgent-care claims.',
        ],
      },
      {
        heading: 'Escalation',
        body:
          `Pocket Genes provides a clear contact path for urgent safety reports through ${POCKET_GENES_SUPPORT_EMAIL}. Reports may lead to content removal, account limits, organization review, or other protective action.`,
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
          'Pocket Genes uses layered security controls to protect accounts, personal information, integrations, and platform services from unauthorized access, disclosure, or modification.',
        subsections: [
          {
            heading: 'Authentication',
            body: 'Access to private account functionality requires authenticated user identity.',
          },
          {
            heading: 'Authorization',
            body: 'Authentication does not provide unrestricted access to Pocket Genes resources. Application controls determine which information and functionality are available to each authenticated user.',
          },
          {
            heading: 'Encryption in transit',
            body: 'Network communications involving protected Pocket Genes services use encrypted connections.',
          },
          {
            heading: 'Infrastructure security',
            body: 'Pocket Genes uses established cloud infrastructure providers, including AWS and Google Firebase, and relies on their platform security controls together with Pocket Genes application-level protections.',
          },
          {
            heading: 'Least privilege',
            body: 'Administrative and production access is limited according to operational need.',
          },
          {
            heading: 'Environment separation',
            body: 'Pocket Genes separates production and development operations so testing activity does not intentionally rely on production user workflows.',
          },
          {
            heading: 'Monitoring and incident handling',
            body: 'Security and operational events may be logged to identify errors, abuse, and potentially unauthorized activity. Reported security concerns are reviewed through Pocket Genes\' incident process.',
          },
          {
            heading: 'Data minimization',
            body: 'Limiting the information handled by Pocket Genes is itself part of our security approach. Integrations and platform features are designed to use only the information necessary for their intended function.',
          },
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
      'Shows how providers, Pocket Genes, and users interact when a report is accessed through the mobile experience.',
    owner: 'Security and Product',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Flow',
        body:
          'The flow separates the report provider, the Pocket Genes integration and mobile experience, and user-controlled learning, discovery, and community participation.',
      },
      {
        heading: 'Actors and boundaries',
        body:
          'A participating provider remains the source of the report and its findings. Pocket Genes supports the access experience and related educational or community features without automatically publishing report contents to other users or organizations.',
      },
    ],
  },
  {
    slug: 'subprocessor-list',
    title: 'Subprocessor List',
    category: 'Privacy and rights',
    summary:
      'Lists third parties that may process account, authentication, infrastructure, operational, or limited application data for Pocket Genes.',
    owner: 'Trust and Privacy',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Public register',
        body:
          'Pocket Genes publishes the subprocessors used for core infrastructure and application services. This list is updated as providers are added or materially changed.',
        table: {
          headers: ['Provider', 'Purpose', 'Data involved', 'International processing'],
          rows: [
            [
              'Amazon Web Services',
              'Cloud infrastructure and backend services.',
              'Application and operational information required by the services hosted through AWS.',
              'May apply.',
            ],
            [
              'Google Firebase',
              'Authentication, database, and application infrastructure.',
              'Account identifiers, authentication information, and limited application or integration information according to the feature being used.',
              'May apply.',
            ],
          ],
        },
      },
      {
        heading: 'Change process',
        body:
          `Questions about subprocessors or data-processing terms can be sent to ${POCKET_GENES_SUPPORT_EMAIL}.`,
      },
    ],
  },
  {
    slug: 'data-retention-deletion',
    title: 'Data-Retention and Deletion Policy',
    category: 'Privacy and rights',
    summary:
      'Explains how long Pocket Genes retains account information, temporary integration data, consent records, community content, operational logs, and backups, and what happens when information is deleted.',
    owner: 'Trust and Privacy',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Account information',
        body:
          'Account information is retained while necessary to maintain the user\'s Pocket Genes account and deleted or de-identified following account deletion, subject to applicable legal and security requirements.',
      },
      {
        heading: 'Temporary integration information',
        body:
          'Contact or identifying information received for a specific integration is retained only for the period necessary to complete or conclude that process.',
      },
      {
        heading: 'Consent records',
        body:
          'Records necessary to demonstrate that a user provided or declined an applicable consent may be retained separately when required for accountability, legal, or audit purposes.',
      },
      {
        heading: 'Community content',
        body:
          'Community posts, comments, and participation records may be removed when a user deletes content, deletes an account, or when moderation removes content under the Community Terms or Community Safety Policy.',
      },
      {
        heading: 'Logs and backups',
        body:
          'Operational logs and backups may be retained for security, reliability, troubleshooting, and business-continuity purposes. Specific retention periods should be published once finalized.',
      },
      {
        heading: 'Deletion',
        body:
          'Deletion workflows explain what is removed from active systems, what may remain in backups for a limited period, and what de-identified operational records may be retained.',
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
      'Explains how Pocket Genes separates provider findings, educational content, source review, and clinical interpretation boundaries.',
    owner: 'Scientific Review',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Source hierarchy',
        body:
          'Findings shown through a report originate from the organization responsible for that report. Pocket Genes does not independently recreate a laboratory result.',
      },
      {
        heading: 'Educational content',
        body:
          'Pocket Genes provides educational explanations intended to make genetic concepts and terminology easier to understand.',
      },
      {
        heading: 'Source hierarchy for education',
        body:
          'Educational material may be reviewed against recognized scientific databases, peer-reviewed literature, professional terminology, authoritative health and genetics resources, and product safety rules.',
      },
      {
        heading: 'Separation of facts and education',
        body:
          'Information originating from a report, general educational information, and content published by third-party organizations are presented as distinct sources of information.',
      },
      {
        heading: 'Updating',
        body:
          'Educational information may be reviewed and updated as scientific understanding, terminology, or product safety requirements change.',
      },
      {
        heading: 'Clinical interpretation',
        body:
          'Clinical interpretation remains outside Pocket Genes and should be addressed with the report provider, a qualified clinician, or a genetic counselor where appropriate.',
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
          'Pocket Genes is intended to help users access genetic reports through a mobile-centered experience, understand relevant genetic concepts, discover educational resources and organizations, and optionally participate in related communities.',
      },
      {
        heading: 'Not intended for',
        body: 'Pocket Genes does not:',
        bullets: [
          'Perform genetic testing.',
          'Generate laboratory results.',
          'Independently determine genetic variants.',
          'Diagnose disease.',
          'Prescribe treatment.',
          'Determine clinical actionability.',
          'Replace genetic counseling.',
          'Replace the report provider.',
          'Provide emergency services.',
        ],
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
      'Explica qué información personal procesa Pocket Genes, por qué la necesitamos, cómo se protege, cuándo puede compartirse y qué opciones tienen los usuarios.',
    owner: 'Confianza y privacidad',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Alcance',
        paragraphs: [
          'Esta Política de Privacidad se aplica a la información personal procesada a través de la aplicación móvil Pocket Genes, el sitio web, las funciones comunitarias, las integraciones y los servicios relacionados.',
          'Pocket Genes procesa información personal limitada necesaria para operar estos servicios. Según cómo una persona use Pocket Genes, esto puede incluir información de cuenta, datos de contacto, información de integración, registros de consentimiento, actividad comunitaria e información técnica asociada al uso de la plataforma.',
          'Los informes genéticos accedidos a través de proveedores participantes permanecen asociados a su fuente original. Pocket Genes usa la información necesaria para brindar el acceso y la experiencia correspondiente sin tratar el informe subyacente completo como datos generales de cuenta o comunidad.',
        ],
      },
      {
        heading: 'Información que procesamos',
        body:
          'La información que procesa Pocket Genes depende de la función, integración o actividad comunitaria que cada persona elija usar.',
        subsections: [
          {
            heading: 'Información de cuenta',
            bullets: [
              'Nombre.',
              'Apellido.',
              'Email.',
              'Número de teléfono, cuando se proporciona.',
              'Identificador de cuenta.',
              'Información de autenticación.',
            ],
          },
          {
            heading: 'Información de integración',
            bullets: [
              'Organización o proveedor.',
              'Información necesaria para conectar a la persona prevista con una integración.',
              'Estado de invitación o entrega.',
            ],
          },
          {
            heading: 'Información de consentimiento',
            bullets: [
              'Estado del consentimiento.',
              'Versión.',
              'Marca de tiempo.',
              'Flujo o proveedor relacionado.',
            ],
          },
          {
            heading: 'Información comunitaria',
            bullets: [
              'Perfil.',
              'Publicaciones.',
              'Comentarios.',
              'Seguimientos.',
              'Mensajes o participación cuando corresponda.',
            ],
          },
          {
            heading: 'Información técnica',
            bullets: [
              'Información del dispositivo y la app.',
              'Registros.',
              'Eventos de seguridad o diagnóstico.',
            ],
          },
        ],
      },
      {
        heading: 'Por qué la procesamos',
        body:
          'Procesamos información personal para crear y proteger cuentas, comunicarnos con usuarios, brindar integraciones solicitadas, establecer acceso a informes y recursos relevantes, documentar consentimientos cuando corresponda, operar funciones comunitarias, brindar soporte, prevenir abusos y mantener la seguridad y confiabilidad de Pocket Genes.',
      },
      {
        heading: 'Acceso a informes',
        body:
          'Pocket Genes puede brindar acceso a informes genéticos puestos a disposición por proveedores participantes. El proveedor original sigue siendo la fuente del informe y sus hallazgos. Pocket Genes facilita la experiencia de acceso y comprensión de esa información sin reemplazar el informe subyacente del proveedor.',
      },
      {
        heading: 'Información de organizaciones',
        paragraphs: [
          'Las organizaciones participantes pueden proporcionar información limitada de contacto o identificación cuando sea necesario para iniciar una experiencia de Pocket Genes para una persona determinada. Según la integración, esto puede incluir nombre, apellido, dirección de email o número de teléfono.',
          'Pocket Genes usa esta información para el proceso correspondiente de comunicación, acceso, consentimiento o integración, y no considera que la organización de origen tenga acceso general a la actividad del usuario en Pocket Genes.',
        ],
      },
      {
        heading: 'Proveedores de servicios y procesamiento internacional',
        body:
          'Pocket Genes usa proveedores externos de infraestructura y tecnología, incluidos Amazon Web Services y Google Firebase. Algunos proveedores pueden procesar información fuera del país del usuario. Hay más información disponible en nuestra lista de proveedores que procesan datos.',
      },
      {
        heading: 'Derechos de los usuarios',
        body:
          `Los usuarios pueden escribir a ${POCKET_GENES_SUPPORT_EMAIL} por consultas de privacidad o solicitudes relacionadas con su información.`,
        bullets: [
          'Acceso.',
          'Corrección.',
          'Eliminación.',
          'Retiro del consentimiento cuando corresponda.',
          'Eliminación de cuenta.',
          'Consultas de privacidad.',
        ],
      },
    ],
  },
  {
    slug: 'terms-of-service',
    title: 'Términos de Servicio',
    category: 'Términos del producto',
    summary:
      'Define las condiciones de uso, las responsabilidades de cada cuenta y los límites del servicio.',
    owner: 'Producto y legal',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Elegibilidad y cuentas',
        body:
          'Las cuentas de Pocket Genes están pensadas para personas autorizadas a usar el servicio según la normativa aplicable y que proporcionan información de cuenta precisa. Los usuarios son responsables de mantener seguras sus credenciales y de la actividad realizada desde su cuenta.',
      },
      {
        heading: 'Servicios de Pocket Genes',
        body:
          'Pocket Genes puede incluir acceso móvil a informes, contenido educativo, descubrimiento de recursos, contenido de organizaciones de confianza y funciones comunitarias. Algunas funciones pueden depender de un proveedor u organización participante, una invitación o un flujo de consentimiento.',
      },
      {
        heading: 'Proveedores de informes',
        body:
          'Los informes y hallazgos accesibles a través de Pocket Genes pueden originarse en laboratorios, proveedores u organizaciones independientes. Esos proveedores siguen siendo responsables de los informes y servicios que emiten.',
      },
      {
        heading: 'Sin servicios médicos',
        body:
          'Pocket Genes es un producto educativo y orientado al acceso. No brinda diagnóstico, tratamiento, soporte de emergencia, asesoramiento genético, toma de decisiones médicas ni reemplaza al proveedor del informe.',
      },
      {
        heading: 'Responsabilidades del usuario',
        body:
          'Los usuarios deben usar Pocket Genes de forma lícita, respetar las reglas comunitarias, proteger su cuenta, evitar acoso o intentos de reidentificación y no presionar a otras personas para que revelen información médica, genética o de identidad.',
      },
      {
        heading: 'Organizaciones',
        body:
          'La condición de organización de confianza significa que una organización fue revisada para participar en el ecosistema de Pocket Genes. No implica avalar cada declaración, servicio, producto, evento o recurso publicado por esa organización.',
      },
      {
        heading: 'Propiedad intelectual',
        body:
          'Pocket Genes posee o licencia la experiencia del producto, la marca y el contenido educativo de Pocket Genes. Los proveedores siguen siendo responsables de sus propios informes. Los usuarios y organizaciones siguen siendo responsables del contenido que deciden publicar o proporcionar mediante funciones comunitarias y de organización.',
      },
      {
        heading: 'Disponibilidad y medidas sobre cuentas',
        body:
          'Los servicios de Pocket Genes pueden cambiar, pausarse o interrumpirse. Pocket Genes puede suspender o finalizar el acceso cuando sea necesario para proteger a usuarios, la comunidad, la plataforma o cumplir obligaciones legales.',
      },
      {
        heading: 'Privacidad, responsabilidad y ley aplicable',
        body:
          'El uso de Pocket Genes también se rige por la Política de Privacidad. Los límites de responsabilidad, términos de disputa y ley aplicable deben revisarse con asesoría legal antes de usar esta página como acuerdo legal final.',
      },
    ],
  },
  {
    slug: 'community-terms',
    title: 'Términos de Comunidad',
    category: 'Comunidad',
    summary:
      'Establece las reglas de RareFriends™, las opciones de identidad, las normas de participación y los límites del asesoramiento médico.',
    owner: 'Operaciones comunitarias',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'RareFriends™ by Pocket Genes',
        body:
          'RareFriends™ by Pocket Genes es la comunidad conectada a Pocket Genes. El nombre completo se usa de forma consistente para que las personas entiendan la relación entre la comunidad y la app.',
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
      {
        heading: 'Qué controlan los usuarios',
        body:
          'Los usuarios eligen cómo participar en espacios comunitarios y pueden ajustar o detener esa participación de forma separada del acceso privado a informes.',
        bullets: [
          'Información de perfil.',
          'Si participan o no.',
          'Qué publican.',
          'Con quién interactúan.',
          'Grupos o círculos a los que se unen.',
          'Bloqueos y reportes.',
        ],
      },
      {
        heading: 'Información privada',
        body:
          'La información disponible mediante funciones privadas de Pocket Genes no pasa automáticamente a formar parte del perfil de RareFriends ni de la actividad comunitaria del usuario.',
      },
      {
        heading: 'Organizaciones de confianza',
        body:
          'Las organizaciones de confianza no reciben acceso privilegiado a información privada de usuarios por el hecho de estar evaluadas. Las organizaciones no deben usar el acceso comunitario para solicitar de forma agresiva a usuarios vulnerables ni mezclar contenido promocional con educación o apoyo.',
      },
    ],
  },
  {
    slug: 'community-safety-policy',
    title: 'Política de Seguridad Comunitaria',
    category: 'Comunidad',
    summary:
      'Explica cómo moderamos la comunidad, gestionamos denuncias y respondemos ante abusos o situaciones sensibles.',
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
        heading: 'Contenido y conductas que revisamos',
        body:
          'Pocket Genes puede revisar y actuar frente a conductas que pongan en riesgo a usuarios, familias, cuidadores u organizaciones.',
        bullets: [
          'Acoso.',
          'Desinformación médica.',
          'Suplantación de identidad.',
          'Spam o estafas.',
          'Presión para revelar información médica o genética.',
          'Publicación de información privada de otra persona.',
          'Solicitud comercial predatoria.',
          'Instrucciones médicas peligrosas o afirmaciones de atención urgente.',
        ],
      },
      {
        heading: 'Escalamiento',
        body:
          `Pocket Genes ofrece una vía clara de contacto para reportes urgentes de seguridad a través de ${POCKET_GENES_SUPPORT_EMAIL}. Los reportes pueden derivar en eliminación de contenido, límites de cuenta, revisión de organizaciones u otras medidas de protección.`,
      },
    ],
  },
  {
    slug: 'security-overview',
    title: 'Resumen de Seguridad',
    category: 'Seguridad',
    summary:
      'Resume las principales medidas de seguridad incorporadas en Pocket Genes.',
    owner: 'Seguridad',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Controles principales',
        body:
          'Pocket Genes usa controles de seguridad en capas para proteger cuentas, información personal, integraciones y servicios de la plataforma frente a accesos, divulgaciones o modificaciones no autorizadas.',
        subsections: [
          {
            heading: 'Autenticación',
            body: 'El acceso a funciones privadas de cuenta requiere identidad de usuario autenticada.',
          },
          {
            heading: 'Autorización',
            body: 'La autenticación no otorga acceso irrestricto a los recursos de Pocket Genes. Los controles de la aplicación determinan qué información y funcionalidad están disponibles para cada usuario autenticado.',
          },
          {
            heading: 'Cifrado en tránsito',
            body: 'Las comunicaciones de red que involucran servicios protegidos de Pocket Genes usan conexiones cifradas.',
          },
          {
            heading: 'Seguridad de infraestructura',
            body: 'Pocket Genes usa proveedores establecidos de infraestructura en la nube, incluidos AWS y Google Firebase, y se apoya en sus controles de seguridad de plataforma junto con protecciones a nivel de aplicación de Pocket Genes.',
          },
          {
            heading: 'Privilegio mínimo',
            body: 'El acceso administrativo y de producción se limita según la necesidad operativa.',
          },
          {
            heading: 'Separación de entornos',
            body: 'Pocket Genes separa operaciones de producción y desarrollo para que la actividad de prueba no dependa intencionalmente de flujos de usuarios de producción.',
          },
          {
            heading: 'Monitoreo y manejo de incidentes',
            body: 'Los eventos de seguridad y operación pueden registrarse para identificar errores, abusos y actividad potencialmente no autorizada. Las inquietudes de seguridad reportadas se revisan mediante el proceso de incidentes de Pocket Genes.',
          },
          {
            heading: 'Minimización de datos',
            body: 'Limitar la información manejada por Pocket Genes es parte de nuestro enfoque de seguridad. Las integraciones y funciones de la plataforma están diseñadas para usar solo la información necesaria para su función prevista.',
          },
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
      'Muestra cómo interactúan proveedores, Pocket Genes y usuarios cuando se accede a un informe desde la experiencia móvil.',
    owner: 'Seguridad y producto',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Flujo',
        body:
          'El flujo separa al proveedor del informe, la integración y experiencia móvil de Pocket Genes, y el aprendizaje, descubrimiento y participación comunitaria controlados por el usuario.',
      },
      {
        heading: 'Actores y límites',
        body:
          'Un proveedor participante sigue siendo la fuente del informe y sus hallazgos. Pocket Genes acompaña la experiencia de acceso y las funciones educativas o comunitarias relacionadas sin publicar automáticamente el contenido del informe a otros usuarios u organizaciones.',
      },
    ],
  },
  {
    slug: 'subprocessor-list',
    title: 'Proveedores que procesan datos',
    category: 'Privacidad y derechos',
    summary:
      'Enumera los servicios externos que pueden procesar datos para el funcionamiento de Pocket Genes.',
    owner: 'Confianza y privacidad',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Registro público',
        body:
          'Pocket Genes publica los proveedores que procesan datos usados para infraestructura central y servicios de la aplicación. Esta lista se actualiza cuando se agregan proveedores o hay cambios materiales.',
        table: {
          headers: ['Proveedor', 'Propósito', 'Datos involucrados', 'Procesamiento internacional'],
          rows: [
            [
              'Amazon Web Services',
              'Infraestructura cloud y servicios backend.',
              'Información operativa y de aplicación requerida por los servicios alojados en AWS.',
              'Puede aplicar.',
            ],
            [
              'Google Firebase',
              'Autenticación, base de datos e infraestructura de aplicación.',
              'Identificadores de cuenta, información de autenticación e información limitada de aplicación o integración según la función usada.',
              'Puede aplicar.',
            ],
          ],
        },
      },
      {
        heading: 'Proceso de cambios',
        body:
          `Las preguntas sobre proveedores que procesan datos o términos de procesamiento pueden enviarse a ${POCKET_GENES_SUPPORT_EMAIL}.`,
      },
    ],
  },
  {
    slug: 'data-retention-deletion',
    title: 'Política de Retención y Eliminación de Datos',
    category: 'Privacidad y derechos',
    summary:
      'Explica durante cuánto tiempo Pocket Genes conserva información de cuenta, datos temporales de integración, consentimientos, contenido comunitario, registros operativos y copias de seguridad, y qué ocurre cuando se elimina información.',
    owner: 'Confianza y privacidad',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Información de cuenta',
        body:
          'La información de cuenta se conserva mientras sea necesaria para mantener la cuenta de Pocket Genes del usuario y se elimina o desidentifica después de la eliminación de la cuenta, sujeta a requisitos legales y de seguridad aplicables.',
      },
      {
        heading: 'Información temporal de integración',
        body:
          'La información de contacto o identificación recibida para una integración específica se conserva solo durante el período necesario para completar o concluir ese proceso.',
      },
      {
        heading: 'Registros de consentimiento',
        body:
          'Los registros necesarios para demostrar que un usuario otorgó o rechazó un consentimiento aplicable pueden conservarse por separado cuando se requiera por responsabilidad, motivos legales o auditoría.',
      },
      {
        heading: 'Contenido comunitario',
        body:
          'Las publicaciones, comentarios y registros de participación comunitaria pueden eliminarse cuando un usuario borra contenido, elimina una cuenta o cuando moderación remueve contenido bajo los Términos de Comunidad o la Política de Seguridad Comunitaria.',
      },
      {
        heading: 'Registros y copias de seguridad',
        body:
          'Los registros operativos y copias de seguridad pueden conservarse por seguridad, confiabilidad, resolución de problemas y continuidad del negocio. Los períodos específicos de retención deben publicarse cuando estén finalizados.',
      },
      {
        heading: 'Eliminación',
        body:
          'Los flujos de eliminación explican qué se elimina de los sistemas activos, qué puede permanecer en copias de seguridad por un período limitado y qué registros operativos desidentificados pueden conservarse.',
      },
    ],
  },
  {
    slug: 'incident-reporting',
    title: 'Informar un incidente',
    category: 'Seguridad',
    summary:
      'Ofrece un canal directo para informar problemas de seguridad, privacidad o conducta dentro de la comunidad.',
    owner: 'Seguridad',
    lastReviewed: 'Julio 2026',
    status: 'Canal disponible',
    sections: [
      {
        heading: 'Contacto',
        body:
          `Las preguntas de seguridad, privacidad y confianza pueden enviarse a ${POCKET_GENES_SUPPORT_EMAIL}.`,
      },
      {
        heading: 'Qué incluir',
        body:
          'Los reportes útiles incluyen la función afectada, hora aproximada, pasos para reproducir cuando corresponda, capturas sin datos genéticos sensibles cuando sea posible y un email de contacto seguro.',
      },
    ],
  },
  {
    slug: 'accessibility-statement',
    title: 'Declaración de Accesibilidad',
    category: 'Accesibilidad',
    summary:
      'Explica nuestros objetivos de accesibilidad y cómo informar una barrera o dificultad de uso.',
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
          `Las barreras de accesibilidad pueden reportarse a ${POCKET_GENES_SUPPORT_EMAIL} indicando la página, el dispositivo, la tecnología de asistencia si corresponde y una descripción del problema.`,
      },
    ],
  },
  {
    slug: 'scientific-methodology',
    title: 'Metodología Científica',
    category: 'Ciencia',
    summary:
      'Explica cómo Pocket Genes separa hallazgos de proveedores, contenido educativo, revisión de fuentes y límites de interpretación clínica.',
    owner: 'Revisión científica',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Jerarquía de fuentes',
        body:
          'Los hallazgos mostrados a través de un informe se originan en la organización responsable de ese informe. Pocket Genes no recrea de forma independiente un resultado de laboratorio.',
      },
      {
        heading: 'Contenido educativo',
        body:
          'Pocket Genes brinda explicaciones educativas pensadas para hacer más comprensibles los conceptos y la terminología genética.',
      },
      {
        heading: 'Jerarquía de fuentes para educación',
        body:
          'El material educativo puede revisarse contra bases de datos científicas reconocidas, literatura revisada por pares, terminología profesional, recursos autorizados de salud y genética, y reglas de seguridad del producto.',
      },
      {
        heading: 'Separación de hechos y educación',
        body:
          'La información que se origina en un informe, la información educativa general y el contenido publicado por organizaciones externas se presentan como fuentes de información distintas.',
      },
      {
        heading: 'Actualización',
        body:
          'La información educativa puede revisarse y actualizarse a medida que cambien el conocimiento científico, la terminología o los requisitos de seguridad del producto.',
      },
      {
        heading: 'Interpretación clínica',
        body:
          'La interpretación clínica queda fuera de Pocket Genes y debe tratarse con el proveedor del informe, un profesional de salud calificado o un asesor genético cuando corresponda.',
      },
    ],
  },
  {
    slug: 'regulatory-intended-use',
    title: 'Declaración Regulatoria y de Uso Previsto',
    category: 'Ciencia',
    summary:
      'Aclara para qué está pensado Pocket Genes y para qué no.',
    owner: 'Producto y legal',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Uso previsto',
        body:
          'Pocket Genes está pensado para ayudar a los usuarios a acceder a informes genéticos mediante una experiencia centrada en el móvil, entender conceptos genéticos relevantes, descubrir recursos y organizaciones educativas, y participar opcionalmente en comunidades relacionadas.',
      },
      {
        heading: 'No previsto para',
        body: 'Pocket Genes no:',
        bullets: [
          'Realiza pruebas genéticas.',
          'Genera resultados de laboratorio.',
          'Determina variantes genéticas de forma independiente.',
          'Diagnostica enfermedades.',
          'Indica tratamientos.',
          'Determina accionabilidad clínica.',
          'Reemplaza el asesoramiento genético.',
          'Reemplaza al proveedor del informe.',
          'Brinda servicios de emergencia.',
        ],
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
