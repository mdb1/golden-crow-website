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
      'Explains how to report security, privacy, accessibility, and community safety concerns, what to include, and how Pocket Genes reviews reports.',
    owner: 'Security',
    lastReviewed: 'July 2026',
    status: 'Active contact page',
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'Pocket Genes uses this incident-reporting channel for concerns that may affect the confidentiality, integrity, availability, safety, or accessibility of Pocket Genes services.',
          'Reports may involve account security, suspected unauthorized access, privacy concerns, exposed personal information, abusive community behavior, impersonation, scams, accessibility barriers, trusted organization behavior, or other platform safety issues.',
          'This channel is not an emergency medical service and is not a place to request clinical interpretation of a genetic report. Medical emergencies, urgent safety risks, or crisis situations should be directed to local emergency services or an appropriate qualified professional.',
        ],
      },
      {
        heading: 'How to report',
        body:
          `Security, privacy, accessibility, and trust concerns can be sent to ${POCKET_GENES_SUPPORT_EMAIL}. A clear subject line such as "Pocket Genes security report," "Pocket Genes privacy report," or "Pocket Genes community safety report" helps route the issue faster.`,
      },
      {
        heading: 'What to include',
        body:
          'A useful report gives the team enough context to identify the affected workflow without exposing unnecessary sensitive information.',
        bullets: [
          'The affected page, feature, account workflow, organization profile, community area, or mobile app screen.',
          'The approximate date, time, and time zone when the issue occurred.',
          'Steps to reproduce the issue, when applicable.',
          'Device, operating system, browser, app version, or assistive technology details when relevant.',
          'Screenshots, screen recordings, or message examples with genetic report content, passwords, authentication codes, and unrelated personal information removed when possible.',
          'The names or profile identifiers involved in a community safety report, when known.',
          'A safe callback email and whether Pocket Genes may contact you for follow-up questions.',
        ],
      },
      {
        heading: 'What not to include',
        body:
          'Do not send passwords, authentication tokens, one-time codes, full genetic reports, complete medical records, or another person\'s private information unless Pocket Genes specifically asks for a limited item through a secure follow-up path.',
      },
      {
        heading: 'Triage and handling',
        body:
          'Pocket Genes reviews incoming reports and routes them according to the type and severity of the concern.',
        subsections: [
          {
            heading: 'Initial review',
            body: 'The team checks whether the report involves security, privacy, accessibility, community safety, operational reliability, or a trusted organization concern.',
          },
          {
            heading: 'Severity assessment',
            body: 'Reports are prioritized by potential user impact, data sensitivity, exploitability, active abuse, legal obligations, and whether a workaround is available.',
          },
          {
            heading: 'Need-to-know access',
            body: 'Report details are shared internally only with people who need the information to investigate, mitigate, support the user, or satisfy legal and operational requirements.',
          },
          {
            heading: 'Follow-up',
            body: 'Pocket Genes may ask for additional details, provide a workaround, confirm receipt, or explain when the report falls outside the Pocket Genes service boundary.',
          },
        ],
      },
      {
        heading: 'Security and privacy incidents',
        body:
          'If a report suggests unauthorized access, exposed personal information, account compromise, data leakage, or abuse of platform infrastructure, Pocket Genes may investigate logs, configuration, access controls, affected workflows, and related service-provider information. When a confirmed incident requires user, partner, regulator, or provider notification, Pocket Genes handles that notification according to applicable obligations and the facts of the incident.',
      },
      {
        heading: 'Community safety reports',
        body:
          'Community reports may involve harassment, medical misinformation, impersonation, spam, scams, pressure to disclose medical or genetic information, publication of somebody else\'s private information, predatory commercial solicitation, or dangerous medical instructions.',
        bullets: [
          'Possible actions include content removal, warning, account limitation, account suspension, blocking support, trusted organization review, or escalation for additional review.',
          'Pocket Genes may preserve relevant moderation records when needed to investigate repeat abuse, protect users, document decisions, or comply with legal obligations.',
          'Trusted Organizations do not receive special access to private user information through the incident process.',
        ],
      },
      {
        heading: 'Responsible disclosure',
        body:
          'Good-faith security testing should be limited to public surfaces or accounts and data you control. Do not disrupt Pocket Genes services, access or extract other users\' information, attempt social engineering, bypass rate limits at scale, or publicly disclose a vulnerability before Pocket Genes has had a reasonable opportunity to review and mitigate it. Pocket Genes does not operate a public bug-bounty program unless one is separately announced.',
      },
      {
        heading: 'Recordkeeping',
        body:
          'Pocket Genes may retain incident reports, triage notes, moderation outcomes, and remediation records for security, accountability, legal, audit, and platform-improvement purposes.',
      },
    ],
  },
  {
    slug: 'accessibility-statement',
    title: 'Accessibility Statement',
    category: 'Accessibility',
    summary:
      'Describes Pocket Genes accessibility goals, covered experiences, testing approach, known third-party limits, and how users can report barriers.',
    owner: 'Product',
    lastReviewed: 'July 2026',
    status: 'Published',
    sections: [
      {
        heading: 'Commitment and scope',
        paragraphs: [
          'Pocket Genes is designed for people who may be navigating complex genetic information, health-adjacent questions, community resources, and mobile workflows under real-world conditions. Accessibility is part of making that information usable, understandable, and safe.',
          'This statement applies to Pocket Genes public pages, Trust Center pages, mobile-centered product experiences, community and discovery surfaces, and account or integration workflows controlled by Pocket Genes.',
          'Pocket Genes targets WCAG 2.2 AA principles where reasonably applicable to the experience, while recognizing that some provider reports, third-party widgets, linked resources, and platform stores are outside direct Pocket Genes control.',
        ],
      },
      {
        heading: 'Accessibility targets',
        body:
          'Pocket Genes accessibility work focuses on practical usability across visual, motor, cognitive, language, and assistive-technology needs.',
        bullets: [
          'Semantic headings, landmarks, lists, buttons, links, and tables so assistive technology can understand page structure.',
          'Keyboard-accessible navigation and visible focus states for public web pages and interactive controls.',
          'Readable color contrast for text, controls, cards, alerts, and status indicators.',
          'Responsive layouts that keep text readable and controls usable on small screens.',
          'Labels, descriptions, and error messages that make forms understandable without relying only on placeholder text.',
          'Meaningful link text and button labels that describe the destination or action.',
          'Reduced reliance on color alone to communicate meaning in statuses, categories, charts, or warnings.',
          'Motion and animation choices that avoid blocking use and respect reduced-motion preferences where supported.',
          'Plain-language explanations for complex genetic, privacy, security, and community concepts.',
        ],
      },
      {
        heading: 'Mobile app considerations',
        body:
          'Pocket Genes is mobile-centered, so accessibility work includes touch targets, readable spacing, clear navigation paths, screen-reader-friendly labels, and support for platform accessibility features where the native app experience permits it. Product screens that involve report access, educational context, consent, community participation, or organization discovery should remain understandable without requiring users to infer meaning from visual layout alone.',
      },
      {
        heading: 'Content and data displays',
        body:
          'Genetic and health-adjacent content can be dense, so Pocket Genes aims to separate headings, summaries, definitions, source context, warnings, and user actions clearly. Diagrams, tables, and lists should not rely only on color, abbreviations, or visual position to convey important meaning.',
      },
      {
        heading: 'Third-party and provider content',
        body:
          'Some experiences may include provider reports, external resources, booking widgets, app-store pages, organization links, embedded tools, or other third-party content that Pocket Genes does not fully control. When a barrier appears in a third-party or provider-controlled surface, Pocket Genes may document the issue, look for an alternate path, or relay feedback to the relevant provider when appropriate.',
      },
      {
        heading: 'Testing and review',
        body:
          'Pocket Genes reviews accessibility through a mix of product design review, semantic markup checks, keyboard checks for public web pages, contrast review, responsive layout review, and user-reported barrier investigation. New or changed components should be checked for readable text, focus visibility, control labels, form error clarity, and mobile layout stability.',
      },
      {
        heading: 'Feedback and barrier reports',
        body:
          `Accessibility barriers can be reported to ${POCKET_GENES_SUPPORT_EMAIL}.`,
        bullets: [
          'The affected page, app screen, feature, or workflow.',
          'The device, operating system, browser, app version, and assistive technology used when relevant.',
          'What you were trying to do and what prevented completion.',
          'Whether the issue blocks account access, report access, community participation, consent, support contact, or another important action.',
          'Screenshots or recordings when helpful, with sensitive genetic, medical, account, or contact information removed when possible.',
          'A safe callback email for follow-up.',
        ],
      },
      {
        heading: 'Response and remediation',
        body:
          'Pocket Genes reviews accessibility reports by severity and user impact. Issues that block account access, report access, consent, security contact, or core navigation are prioritized for investigation. When immediate remediation is not possible, Pocket Genes may provide a workaround or alternate support path where feasible.',
      },
      {
        heading: 'Ongoing improvement',
        body:
          'Accessibility is an ongoing process. Pocket Genes may update this statement, revise design patterns, improve content structure, or adjust product workflows as new barriers are found, standards evolve, or the platform changes.',
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
      'Explica cómo informar problemas de seguridad, privacidad, accesibilidad o seguridad comunitaria, qué incluir y cómo Pocket Genes revisa los reportes.',
    owner: 'Seguridad',
    lastReviewed: 'Julio 2026',
    status: 'Canal disponible',
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Pocket Genes usa este canal de reporte para inquietudes que puedan afectar la confidencialidad, integridad, disponibilidad, seguridad o accesibilidad de los servicios de Pocket Genes.',
          'Los reportes pueden involucrar seguridad de cuenta, sospecha de acceso no autorizado, problemas de privacidad, información personal expuesta, conducta abusiva en la comunidad, suplantación de identidad, estafas, barreras de accesibilidad, conducta de organizaciones de confianza u otros problemas de seguridad de la plataforma.',
          'Este canal no es un servicio médico de emergencia ni un lugar para solicitar interpretación clínica de un informe genético. Las emergencias médicas, riesgos urgentes de seguridad o situaciones de crisis deben dirigirse a servicios locales de emergencia o a un profesional calificado apropiado.',
        ],
      },
      {
        heading: 'Cómo reportar',
        body:
          `Las inquietudes de seguridad, privacidad, accesibilidad y confianza pueden enviarse a ${POCKET_GENES_SUPPORT_EMAIL}. Un asunto claro, como "reporte de seguridad de Pocket Genes", "reporte de privacidad de Pocket Genes" o "reporte de seguridad comunitaria de Pocket Genes", ayuda a derivar el problema más rápido.`,
      },
      {
        heading: 'Qué incluir',
        body:
          'Un reporte útil brinda contexto suficiente para identificar el flujo afectado sin exponer información sensible innecesaria.',
        bullets: [
          'La página, función, flujo de cuenta, perfil de organización, área comunitaria o pantalla móvil afectada.',
          'La fecha, hora aproximada y zona horaria en que ocurrió el problema.',
          'Pasos para reproducir el problema, cuando corresponda.',
          'Datos de dispositivo, sistema operativo, navegador, versión de la app o tecnología de asistencia cuando sean relevantes.',
          'Capturas, grabaciones o ejemplos de mensajes con contenido de informes genéticos, contraseñas, códigos de autenticación e información personal no relacionada removida cuando sea posible.',
          'Los nombres o identificadores de perfiles involucrados en un reporte de seguridad comunitaria, cuando se conozcan.',
          'Un email seguro de respuesta y si Pocket Genes puede contactarte para preguntas de seguimiento.',
        ],
      },
      {
        heading: 'Qué no incluir',
        body:
          'No envíes contraseñas, tokens de autenticación, códigos de un solo uso, informes genéticos completos, historias clínicas completas ni información privada de otra persona salvo que Pocket Genes solicite específicamente un elemento limitado mediante un canal seguro de seguimiento.',
      },
      {
        heading: 'Clasificación y manejo',
        body:
          'Pocket Genes revisa los reportes recibidos y los deriva según el tipo y la gravedad de la inquietud.',
        subsections: [
          {
            heading: 'Revisión inicial',
            body: 'El equipo evalúa si el reporte involucra seguridad, privacidad, accesibilidad, seguridad comunitaria, confiabilidad operativa o una inquietud sobre una organización de confianza.',
          },
          {
            heading: 'Evaluación de gravedad',
            body: 'Los reportes se priorizan según impacto potencial en usuarios, sensibilidad de datos, posibilidad de explotación, abuso activo, obligaciones legales y disponibilidad de una solución alternativa.',
          },
          {
            heading: 'Acceso por necesidad',
            body: 'Los detalles del reporte se comparten internamente solo con las personas que necesitan la información para investigar, mitigar, brindar soporte al usuario o cumplir requisitos legales y operativos.',
          },
          {
            heading: 'Seguimiento',
            body: 'Pocket Genes puede pedir detalles adicionales, ofrecer una solución alternativa, confirmar recepción o explicar cuando el reporte queda fuera del límite del servicio de Pocket Genes.',
          },
        ],
      },
      {
        heading: 'Incidentes de seguridad y privacidad',
        body:
          'Si un reporte sugiere acceso no autorizado, información personal expuesta, compromiso de cuenta, fuga de datos o abuso de infraestructura de la plataforma, Pocket Genes puede investigar registros, configuración, controles de acceso, flujos afectados e información relacionada de proveedores de servicio. Cuando un incidente confirmado requiere notificación a usuarios, socios, reguladores o proveedores, Pocket Genes maneja esa notificación según las obligaciones aplicables y los hechos del incidente.',
      },
      {
        heading: 'Reportes de seguridad comunitaria',
        body:
          'Los reportes comunitarios pueden involucrar acoso, desinformación médica, suplantación de identidad, spam, estafas, presión para revelar información médica o genética, publicación de información privada de otra persona, solicitud comercial predatoria o instrucciones médicas peligrosas.',
        bullets: [
          'Las acciones posibles incluyen eliminación de contenido, advertencia, limitación de cuenta, suspensión de cuenta, soporte para bloqueo, revisión de organización de confianza o escalamiento para revisión adicional.',
          'Pocket Genes puede preservar registros de moderación relevantes cuando sea necesario para investigar abuso repetido, proteger usuarios, documentar decisiones o cumplir obligaciones legales.',
          'Las organizaciones de confianza no reciben acceso especial a información privada de usuarios mediante el proceso de incidentes.',
        ],
      },
      {
        heading: 'Divulgación responsable',
        body:
          'Las pruebas de seguridad de buena fe deben limitarse a superficies públicas o a cuentas y datos que controles. No interrumpas servicios de Pocket Genes, no accedas ni extraigas información de otros usuarios, no intentes ingeniería social, no evadas límites de tasa a escala y no divulgues públicamente una vulnerabilidad antes de que Pocket Genes haya tenido una oportunidad razonable de revisarla y mitigarla. Pocket Genes no opera un programa público de recompensas por vulnerabilidades salvo que se anuncie por separado.',
      },
      {
        heading: 'Registro',
        body:
          'Pocket Genes puede conservar reportes de incidentes, notas de clasificación, resultados de moderación y registros de remediación con fines de seguridad, responsabilidad, legales, auditoría y mejora de la plataforma.',
      },
    ],
  },
  {
    slug: 'accessibility-statement',
    title: 'Declaración de Accesibilidad',
    category: 'Accesibilidad',
    summary:
      'Describe los objetivos de accesibilidad de Pocket Genes, las experiencias cubiertas, el enfoque de pruebas, límites de terceros y cómo reportar barreras.',
    owner: 'Producto',
    lastReviewed: 'Julio 2026',
    status: 'Publicado',
    sections: [
      {
        heading: 'Compromiso y alcance',
        paragraphs: [
          'Pocket Genes está diseñado para personas que pueden estar navegando información genética compleja, preguntas relacionadas con salud, recursos comunitarios y flujos móviles en condiciones reales. La accesibilidad es parte de hacer que esa información sea usable, comprensible y segura.',
          'Esta declaración se aplica a las páginas públicas de Pocket Genes, páginas del Centro de confianza, experiencias del producto centradas en móvil, superficies comunitarias y de descubrimiento, y flujos de cuenta o integración controlados por Pocket Genes.',
          'Pocket Genes apunta a principios WCAG 2.2 AA cuando sean razonablemente aplicables a la experiencia, reconociendo que algunos informes de proveedores, widgets de terceros, recursos vinculados y tiendas de plataformas están fuera del control directo de Pocket Genes.',
        ],
      },
      {
        heading: 'Objetivos de accesibilidad',
        body:
          'El trabajo de accesibilidad de Pocket Genes se enfoca en la usabilidad práctica para necesidades visuales, motrices, cognitivas, de idioma y de tecnología de asistencia.',
        bullets: [
          'Encabezados, regiones, listas, botones, enlaces y tablas semánticos para que la tecnología de asistencia pueda entender la estructura de la página.',
          'Navegación accesible por teclado y estados de foco visibles en páginas públicas y controles interactivos.',
          'Contraste legible para textos, controles, tarjetas, alertas e indicadores de estado.',
          'Diseños responsivos que mantienen el texto legible y los controles utilizables en pantallas pequeñas.',
          'Etiquetas, descripciones y mensajes de error que hacen comprensibles los formularios sin depender solo de texto placeholder.',
          'Textos de enlaces y botones que describen el destino o la acción.',
          'Menor dependencia del color como único medio para comunicar significado en estados, categorías, gráficos o advertencias.',
          'Decisiones de movimiento y animación que no bloquean el uso y respetan preferencias de movimiento reducido cuando hay soporte.',
          'Explicaciones en lenguaje claro para conceptos complejos de genética, privacidad, seguridad y comunidad.',
        ],
      },
      {
        heading: 'Consideraciones de la app móvil',
        body:
          'Pocket Genes está centrado en móvil, por lo que el trabajo de accesibilidad incluye áreas táctiles, espaciado legible, caminos de navegación claros, etiquetas compatibles con lectores de pantalla y soporte para funciones de accesibilidad de la plataforma cuando la experiencia nativa lo permite. Las pantallas relacionadas con acceso a informes, contexto educativo, consentimiento, participación comunitaria o descubrimiento de organizaciones deben seguir siendo comprensibles sin exigir que los usuarios infieran significado solo por la disposición visual.',
      },
      {
        heading: 'Contenido y visualizaciones de datos',
        body:
          'El contenido genético y relacionado con salud puede ser denso, por lo que Pocket Genes busca separar claramente encabezados, resúmenes, definiciones, contexto de fuente, advertencias y acciones del usuario. Los diagramas, tablas y listas no deberían depender solo del color, abreviaturas o posición visual para comunicar significado importante.',
      },
      {
        heading: 'Contenido de terceros y proveedores',
        body:
          'Algunas experiencias pueden incluir informes de proveedores, recursos externos, widgets de reserva, páginas de tiendas de apps, enlaces de organizaciones, herramientas embebidas u otro contenido de terceros que Pocket Genes no controla por completo. Cuando aparece una barrera en una superficie controlada por un tercero o proveedor, Pocket Genes puede documentar el problema, buscar un camino alternativo o trasladar el comentario al proveedor correspondiente cuando sea apropiado.',
      },
      {
        heading: 'Pruebas y revisión',
        body:
          'Pocket Genes revisa la accesibilidad mediante una combinación de revisión de diseño de producto, controles de marcado semántico, pruebas de teclado para páginas públicas, revisión de contraste, revisión de diseño responsivo e investigación de barreras reportadas por usuarios. Los componentes nuevos o modificados deben revisarse por legibilidad del texto, visibilidad del foco, etiquetas de controles, claridad de errores en formularios y estabilidad del diseño móvil.',
      },
      {
        heading: 'Feedback y reportes de barreras',
        body:
          `Las barreras de accesibilidad pueden reportarse a ${POCKET_GENES_SUPPORT_EMAIL}.`,
        bullets: [
          'La página, pantalla de app, función o flujo afectado.',
          'El dispositivo, sistema operativo, navegador, versión de la app y tecnología de asistencia usados cuando sean relevantes.',
          'Qué estabas intentando hacer y qué impidió completarlo.',
          'Si el problema bloquea acceso a cuenta, acceso a informes, participación comunitaria, consentimiento, contacto de soporte u otra acción importante.',
          'Capturas o grabaciones cuando ayuden, con información genética, médica, de cuenta o contacto removida cuando sea posible.',
          'Un email seguro para seguimiento.',
        ],
      },
      {
        heading: 'Respuesta y remediación',
        body:
          'Pocket Genes revisa los reportes de accesibilidad según gravedad e impacto en usuarios. Los problemas que bloquean acceso a cuenta, acceso a informes, consentimiento, contacto de seguridad o navegación central se priorizan para investigación. Cuando la remediación inmediata no es posible, Pocket Genes puede ofrecer una solución alternativa o un camino de soporte alternativo cuando sea viable.',
      },
      {
        heading: 'Mejora continua',
        body:
          'La accesibilidad es un proceso continuo. Pocket Genes puede actualizar esta declaración, revisar patrones de diseño, mejorar la estructura de contenido o ajustar flujos del producto a medida que se encuentren nuevas barreras, evolucionen los estándares o cambie la plataforma.',
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
