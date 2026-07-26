export const APP_STORE_URL = 'https://apps.apple.com/ar/app/pocket-genes/id6748587627';

export const POCKET_GENES_EMAILS = {
  hello: 'hello@pocketgenes.com',
  trust: 'trust@pocketgenes.com',
  security: 'security@pocketgenes.com',
  accessibility: 'accessibility@pocketgenes.com',
};

export const publicNavItems = [
  { label: 'Home', href: '/pocket-genes/home' },
  { label: 'Community', href: '/pocket-genes/rarefriends' },
  { label: 'Trust Center', href: '/pocket-genes/trust-center' },
  { label: 'Public Demo', href: '/pocket-genes/demo' },
  { label: 'Integration', href: '/pocket-genes/integration' },
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
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'Scope',
        body:
          'Pocket Genes treats genetic reports, report metadata, notes, and community profile choices as sensitive information. The privacy policy should separate account data, uploaded documents, parsed report fields, educational interactions, device diagnostics, and community participation.',
      },
      {
        heading: 'User control',
        body:
          'The policy should make clear that reports and exact variants are private by default and that community participation is opt-in.',
        bullets: [
          'Users can choose what to store, delete, or share.',
          'Community visibility should be explicit and reversible.',
          'Institutional demonstrations should use synthetic data unless a separate agreement says otherwise.',
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
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'Product boundaries',
        body:
          'The terms should state that Pocket Genes is an educational and organizational product. It does not provide diagnosis, treatment, emergency support, genetic counseling, or medical decision-making.',
      },
      {
        heading: 'User responsibilities',
        body:
          'Users should only upload materials they have the right to store and should not use the product to harass, identify, or pressure community members.',
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
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'RareFriends by Pocket Genes',
        body:
          'RareFriends by Pocket Genes is the community layer connected to Pocket Genes. It should be described consistently with the product name to reduce search ambiguity and to make ownership clear.',
      },
      {
        heading: 'Participation rules',
        body:
          'Community members should be able to participate with a limited profile, leave groups, block contacts, and report unsafe behavior.',
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
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'Safety model',
        body:
          'The safety policy should define how Pocket Genes handles reports, blocks, content removal, repeated abuse, and attempts to identify vulnerable members.',
      },
      {
        heading: 'Escalation',
        body:
          'The policy should include a clear contact path for urgent safety reports and a response workflow for institutional partners.',
      },
    ],
  },
  {
    slug: 'security-overview',
    title: 'Security Overview',
    category: 'Security',
    summary:
      'Summarizes the security controls Pocket Genes is designed around and the controls to verify before broader institutional rollout.',
    owner: 'Security',
    lastReviewed: 'July 2026',
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'Core controls',
        body:
          'The security overview should document transport security, access control, environment separation, auditability, and secure handling of uploaded reports.',
        bullets: [
          'Encryption in transit for user and institutional traffic.',
          'Least-privilege access for operational tooling.',
          'Sensitive report access scoped to the user and authorized workflows.',
        ],
      },
      {
        heading: 'Institutional review',
        body:
          'Before an institutional launch, Pocket Genes should make the security checklist, data processing scope, and incident contact available for review.',
      },
    ],
  },
  {
    slug: 'data-flow-diagram',
    title: 'Data-Flow Diagram',
    category: 'Security',
    summary:
      'Shows how a synthetic laboratory report becomes a private Pocket Genes experience and what can optionally move into community sharing.',
    owner: 'Security and Product',
    lastReviewed: 'July 2026',
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'Flow',
        body:
          'The public diagram separates laboratory-provided fields, Pocket Genes reformatting, educational explanations, user storage, optional sharing, and deletion paths.',
      },
      {
        heading: 'Default visibility',
        body:
          'Uploaded reports, parsed variants, provider names, and health notes should remain private unless a user explicitly shares a limited summary.',
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
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'Public register',
        body:
          'The subprocessor list should identify each provider, purpose, data category, processing location when known, and change notification process.',
      },
      {
        heading: 'Institutional agreements',
        body:
          'Partner-specific subprocessors should be reflected in the applicable data processing agreement before production use.',
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
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'Retention principles',
        body:
          'Pocket Genes should keep personal and genetic data only for the product purpose, user request, legal need, or partner obligation that justifies retention.',
      },
      {
        heading: 'Deletion',
        body:
          'Deletion workflows should explain what is removed immediately, what may remain in backups for a limited period, and what anonymized operational records may be retained.',
      },
    ],
  },
  {
    slug: 'incident-reporting',
    title: 'Incident-Reporting Contact',
    category: 'Security',
    summary:
      'Provides a direct channel for security, privacy, community safety, and institutional incident reports.',
    owner: 'Security',
    lastReviewed: 'July 2026',
    status: 'Active contact page',
    sections: [
      {
        heading: 'Contact',
        body:
          'Security and privacy incidents should be sent to security@pocketgenes.com. General trust questions should be sent to trust@pocketgenes.com.',
      },
      {
        heading: 'What to include',
        body:
          'Reports should include the affected feature, approximate time, steps to reproduce when applicable, screenshots without sensitive genetic data when possible, and a safe callback email.',
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
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'Target',
        body:
          'Pocket Genes should target accessible navigation, readable contrast, keyboard-accessible public pages, semantic page structure, and clear alternatives for visual data displays.',
      },
      {
        heading: 'Feedback',
        body:
          'Accessibility barriers should be reported to accessibility@pocketgenes.com with the page, device, assistive technology if relevant, and a description of the issue.',
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
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'Source hierarchy',
        body:
          'Educational explanations should be written from the laboratory report first, then reviewed against public scientific references, professional terminology, and product safety rules.',
      },
      {
        heading: 'Review controls',
        body:
          'The methodology should separate reported facts, reformatted display fields, educational definitions, and clinical interpretation that remains outside Pocket Genes.',
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
    status: 'Public draft for institutional review',
    sections: [
      {
        heading: 'Intended use',
        body:
          'Pocket Genes is intended to help users organize genetic reports, review educational explanations, prepare conversations, and optionally participate in RareFriends by Pocket Genes.',
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
