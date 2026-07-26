export const APP_STORE_URL = 'https://apps.apple.com/ar/app/pocket-genes/id6748587627';
export const POCKET_GENES_SUPPORT_EMAIL = 'support@goldencrowvs.com';

export const POCKET_GENES_EMAILS = {
  hello: POCKET_GENES_SUPPORT_EMAIL,
  trust: POCKET_GENES_SUPPORT_EMAIL,
  security: POCKET_GENES_SUPPORT_EMAIL,
  accessibility: POCKET_GENES_SUPPORT_EMAIL,
};

export const publicNavItems = [
  { label: 'Home', href: '/pocket-genes/home' },
  { label: 'Community', href: '/pocket-genes/rarefriends' },
  { label: 'Trust Center', href: '/pocket-genes/trust-center' },
  { label: 'Integration', href: '/pocket-genes/website/integration' },
  { label: 'Download', href: '/pocket-genes/download' },
];

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

export function getTrustDocument(slug: string) {
  return trustDocuments.find((document) => document.slug === slug);
}
