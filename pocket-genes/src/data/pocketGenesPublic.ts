export const APP_STORE_URL = 'https://apps.apple.com/ar/app/pocket-genes/id6748587627';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=goldencrowvs.pocketgenes&hl=en';
export const POCKET_GENES_SUPPORT_EMAIL = 'support@goldencrowvs.com';

export const POCKET_GENES_EMAILS = {
  hello: POCKET_GENES_SUPPORT_EMAIL,
  trust: POCKET_GENES_SUPPORT_EMAIL,
  security: POCKET_GENES_SUPPORT_EMAIL,
  accessibility: POCKET_GENES_SUPPORT_EMAIL,
};

export const POCKET_GENES_OPERATOR = {
  legalName: 'Golden Crow',
  country: 'Argentina',
  productName: 'Pocket Genes',
  privacyContact: POCKET_GENES_SUPPORT_EMAIL,
  securityContact: POCKET_GENES_SUPPORT_EMAIL,
  accessibilityContact: POCKET_GENES_SUPPORT_EMAIL,
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
  effectiveDate?: string;
  version?: string;
  sections: TrustDocumentSection[];
}

const TRUST_EFFECTIVE_DATE_EN = 'August 14, 2026';
const TRUST_EFFECTIVE_DATE_ES = '14 de agosto de 2026';
const TRUST_LAST_REVIEWED_EN = 'August 2026';
const TRUST_LAST_REVIEWED_ES = 'Agosto 2026';
const TRUST_VERSION = '1.1';

const documentGovernanceEn = (relatedDocuments: string[]): TrustDocumentSection[] => [
  {
    heading: 'How to make a request or report a problem',
    paragraphs: [
      `Privacy, account, deletion, accessibility, safety, trusted-organization, and security requests can be sent to ${POCKET_GENES_EMAILS.trust}. Use a subject line that identifies the issue, the affected Pocket Genes account or workflow, and whether the request is urgent.`,
      'Pocket Genes may need to verify the requester before changing or disclosing account information. Verification is handled proportionally to the request, the sensitivity of the information, and the risk of giving account access or private information to the wrong person.',
    ],
  },
  {
    heading: 'Effective date, version, and review history',
    table: {
      headers: ['Item', 'Value'],
      rows: [
        ['Effective date', TRUST_EFFECTIVE_DATE_EN],
        ['Version', TRUST_VERSION],
        ['Last reviewed', TRUST_LAST_REVIEWED_EN],
        ['Material changes', 'Expanded Trust Center format, operator identity, data-map boundaries, request paths, and responsibility sections.'],
        ['Previous version', 'July 2026 Trust Center overview copy.'],
      ],
    },
  },
  {
    heading: 'Related documents',
    bullets: relatedDocuments,
  },
];

const documentGovernanceEs = (relatedDocuments: string[]): TrustDocumentSection[] => [
  {
    heading: 'Cómo hacer una solicitud o reportar un problema',
    paragraphs: [
      `Las solicitudes de privacidad, cuenta, eliminación, accesibilidad, seguridad, organizaciones de confianza e incidentes pueden enviarse a ${POCKET_GENES_EMAILS.trust}. Usá un asunto que identifique el problema, la cuenta o flujo afectado y si la solicitud es urgente.`,
      'Pocket Genes puede necesitar verificar la identidad de quien solicita antes de modificar o revelar información de una cuenta. La verificación se aplica de manera proporcional al tipo de solicitud, la sensibilidad de la información y el riesgo de entregar acceso o información privada a la persona equivocada.',
    ],
  },
  {
    heading: 'Vigencia, versión e historial de revisión',
    table: {
      headers: ['Elemento', 'Valor'],
      rows: [
        ['Fecha de vigencia', TRUST_EFFECTIVE_DATE_ES],
        ['Versión', TRUST_VERSION],
        ['Última revisión', TRUST_LAST_REVIEWED_ES],
        ['Cambios materiales', 'Se amplió el formato del Centro de confianza, la identidad del operador, los límites del mapa de datos, las vías de solicitud y las secciones de responsabilidad.'],
        ['Versión anterior', 'Texto de resumen del Centro de confianza de julio de 2026.'],
      ],
    },
  },
  {
    heading: 'Documentos relacionados',
    bullets: relatedDocuments,
  },
];

const baseDocumentMetaEn = {
  lastReviewed: TRUST_LAST_REVIEWED_EN,
  effectiveDate: TRUST_EFFECTIVE_DATE_EN,
  version: TRUST_VERSION,
};

const baseDocumentMetaEs = {
  lastReviewed: TRUST_LAST_REVIEWED_ES,
  effectiveDate: TRUST_EFFECTIVE_DATE_ES,
  version: TRUST_VERSION,
};

export const trustDocuments: TrustDocument[] = [
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    category: 'Privacy and rights',
    summary:
      'Explains what personal information Pocket Genes processes, why we need it, how it is protected, when it may be shared, and the choices available to users.',
    owner: 'Trust and Privacy',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'This Privacy Policy explains how Pocket Genes processes personal information in the mobile application, public Pocket Genes pages, Trust Center, account flows, report-access integrations, discovery features, trusted-organization features, and RareFriends by Pocket Genes community features.',
          'Pocket Genes processes limited account and contact information, authentication information, integration information, consent records, technical information, support information, and community information depending on the features a person uses. It does not publish a broad claim that Pocket Genes never processes sensitive data, because community participation, RareFriends matching fields, report-access references, and user-provided context may reveal health or genetic information.',
          'Genetic reports remain associated with the participating provider that created or delivered them. Pocket Genes helps authorized users reach and navigate the provider-connected mobile experience. Any provider URL, access token, report reference, or identifier handled by Pocket Genes is treated as confidential access information even when it is not the report itself.',
        ],
      },
      {
        heading: 'Who this document applies to',
        bullets: [
          'People who create or use a Pocket Genes account.',
          'People invited to a Pocket Genes workflow by an integrator, provider, clinic, laboratory, organization, or support program.',
          'Parents, guardians, caregivers, or representatives who manage an account or workflow for another person where permitted.',
          'People who participate in RareFriends, follow organizations, post, comment, send messages, or use matching features.',
          'Trusted Organizations, integrators, and report providers that provide contact data, publish content, or operate report-access workflows connected to Pocket Genes.',
        ],
      },
      {
        heading: 'Who controls the information',
        table: {
          headers: ['Field', 'Current public value'],
          rows: [
            ['Operator/controller', POCKET_GENES_OPERATOR.legalName],
            ['Country', POCKET_GENES_OPERATOR.country],
            ['Product name', POCKET_GENES_OPERATOR.productName],
            ['Privacy contact', POCKET_GENES_OPERATOR.privacyContact],
            ['Security contact', POCKET_GENES_OPERATOR.securityContact],
            ['Accessibility contact', POCKET_GENES_OPERATOR.accessibilityContact],
            ['Data-protection representative or DPO', 'Not separately appointed in this Trust Center. Requests are routed through the privacy contact.'],
          ],
        },
      },
      {
        heading: 'Definitions',
        subsections: [
          {
            heading: 'Personal information',
            body: 'Information relating to an identified or identifiable person, including account, contact, technical, integration, consent, support, and community information.',
          },
          {
            heading: 'Account information',
            body: 'Name, surname, email address, optional phone number, account identifier, profile settings, language, and other information used to create, maintain, secure, or support a Pocket Genes account.',
          },
          {
            heading: 'Integration information',
            body: 'Limited information provided by a participating organization or generated by Pocket Genes to connect the intended person with a report-access, invitation, consent, or organization workflow.',
          },
          {
            heading: 'Consent record',
            body: 'A record that identifies the purpose of the consent or authorization, the document or workflow version, the status, the time, and the related account, provider, or organization where applicable.',
          },
          {
            heading: 'Community information',
            body: 'Profile fields, posts, comments, follows, groups, messages, interests, tags, role, country, language, journey stage, and other information a user voluntarily adds to RareFriends or community features.',
          },
          {
            heading: 'Technical information',
            body: 'Device, browser, app, authentication, logging, diagnostic, security, and operational information needed to operate and protect the service.',
          },
          {
            heading: 'Report provider',
            body: 'A laboratory, clinic, hospital, genetic testing company, rare disease organization, or other participating entity that creates, delivers, controls, or remains responsible for a genetic report or provider-controlled report resource.',
          },
          {
            heading: 'Trusted Organization',
            body: 'An organization reviewed by Pocket Genes for a curated publishing or community presence. Trusted status is not a blanket endorsement of every service, claim, event, or resource from that organization.',
          },
          {
            heading: 'Service provider',
            body: 'A vendor that processes information for Pocket Genes, such as cloud infrastructure, authentication, database, hosting, diagnostics, support, scheduling, or communication providers.',
          },
        ],
      },
      {
        heading: 'Processing table',
        table: {
          headers: ['Category', 'Examples', 'Source', 'Purpose', 'Shared with', 'Retention'],
          rows: [
            ['Account data', 'Name, surname, email, optional phone, language, profile settings, account id.', 'User, caregiver, authorized representative, or integrator when an invitation starts.', 'Create account, communicate, provide support, route report access, preserve account security.', 'Infrastructure providers and authorized support personnel with need-to-know access.', 'While the account is active, then deleted or de-identified through the account-deletion workflow subject to legal, safety, backup, and fraud-prevention limits.'],
            ['Authentication', 'Firebase user id, login records, session information, password-reset activity, security events.', 'User, device, Firebase Authentication, and Pocket Genes backend.', 'Sign-in, account recovery, session protection, abuse prevention, and access control.', 'Google Firebase and Pocket Genes systems that verify identity and sessions.', 'For the account and security period needed to operate authentication, investigate misuse, and comply with provider security logs.'],
            ['Integration data', 'Provider or organization, invitation state, access reference, report code, provider reference, contact fields needed to reach the intended user.', 'Integrator, report provider, Pocket Genes, or the user during onboarding.', 'Connect the intended user with the authorized Pocket Genes experience, consent flow, provider report path, or organization workflow.', 'Relevant backend, database, authentication, and infrastructure providers; the originating integrator only as needed for the integration.', 'Current system behavior is tied to workflow completion, rejection, revocation, account deletion, or manual cleanup. No public automatic expiration is stated unless a specific integration publishes one.'],
            ['Consent records', 'Purpose, document version, status, timestamp, workflow, account, provider or organization reference.', 'User action, caregiver or authorized representative action, and Pocket Genes workflow records.', 'Document authorization, privacy acceptance, provider experience authorization, informed-consent acceptance, optional communication choices, and accountability.', 'Infrastructure providers and internal reviewers who need the record for the relevant workflow.', 'May outlive temporary contact information where needed to prove the decision, handle audit, resolve disputes, or satisfy legal obligations.'],
            ['Community data', 'RareFriends profile, nickname, role, country, language, gene or condition tags, symptom tags, journey stage, posts, comments, follows, groups, messages, reports, blocks.', 'User, community interactions, and moderation actions.', 'Community participation, matching, moderation, safety, reporting, user controls, and support.', 'Other users according to visibility settings; infrastructure providers; moderators where needed.', 'Until the user deletes content or account, moderation removes it, the workflow is closed, or records are retained for safety/legal reasons.'],
            ['Technical data', 'Device type, browser, app version, logs, errors, security events, IP-derived operational data, diagnostic traces.', 'Device, browser, app, infrastructure, and backend services.', 'Reliability, security, troubleshooting, abuse prevention, audit, and incident response.', 'AWS, Firebase, diagnostic or hosting providers when used, and authorized operators.', 'For provider log cycles, security investigation windows, incident records, or de-identified operational analysis.'],
          ],
        },
      },
      {
        heading: 'Information received from integrators',
        paragraphs: [
          'A participating provider, laboratory, clinic, patient organization, support program, or other integrator may provide limited contact or identifying information to start an invitation, report-access, consent, or resource workflow for an intended person. This may include name, surname, email, phone number where applicable, provider or organization name, invitation status, and a reference needed to connect the workflow.',
          'Pocket Genes uses that information for service-related contact and workflow setup. Receiving an invitation does not automatically create community participation, publish information, accept all terms for the invited person, or give the integrator general access to the person subsequent Pocket Genes activity.',
          'The person is informed during the invitation or onboarding path about who provided the information, why Pocket Genes received it, what consent or authorization is requested, and how to decline, object, or request deletion where applicable.',
        ],
      },
      {
        heading: 'What consent means',
        body:
          'Pocket Genes records consent by purpose and version. A single timestamp is not enough unless it can be linked to the document, workflow, and decision it records.',
        subsections: [
          {
            heading: 'Contact consent',
            body: 'Permission for Pocket Genes to contact a person about a specific invitation, access process, support request, organization workflow, or requested communication.',
          },
          {
            heading: 'Privacy Policy and Terms acceptance',
            body: 'Acceptance of the documents that apply to creating or using an account. These records are separate from medical or research consent.',
          },
          {
            heading: 'Provider experience authorization',
            body: 'Authorization to connect the user with a participating provider report-access experience or related provider resource.',
          },
          {
            heading: 'Informed-consent documents',
            body: 'A workflow-specific consent record for a provider, study, clinical, research, or support process when such a document is presented through Pocket Genes.',
          },
          {
            heading: 'Community participation and optional communications',
            body: 'Separate choices for RareFriends participation, profile visibility, matching fields, follows, groups, posts, messages, event notices, newsletters, or other optional communications.',
          },
        ],
      },
      {
        heading: 'Report access and confidential references',
        paragraphs: [
          'The participating provider remains responsible for the report, the findings, the scientific or clinical interpretation, and the provider-controlled delivery path. Pocket Genes is responsible for the account, integration, access, consent, and user-experience layers it operates.',
          'Depending on the integration, Pocket Genes may receive or create a report code, provider reference, URL, token, access state, or similar identifier. These items are handled as confidential access information. They should not be posted in community spaces, public profiles, analytics, screenshots, or logs unless strictly needed for support or security investigation.',
          'Where a link or reference expires or can be revoked, the expiration or revocation path should be reflected in the user workflow or provider agreement. Provider resources may become unavailable independently of Pocket Genes if the provider changes, removes, or disables the underlying report or service.',
        ],
      },
      {
        heading: 'Community privacy',
        paragraphs: [
          'RareFriends participation is voluntary and separate from private report access. Creating an account, viewing a report, following an organization, or joining RareFriends does not automatically publish a private report.',
          'Community information a user chooses to add may reveal health or genetic context. Matching may use user-provided gene, condition, symptom, country, language, role, interest, or journey-stage fields where those features are active. Visibility depends on the feature, user settings, group rules, and moderation actions.',
        ],
      },
      {
        heading: 'Service providers, transfers, cookies, and tracking',
        paragraphs: [
          'Pocket Genes uses established service providers, including Amazon Web Services and Google Firebase, to operate different technical components. The Subprocessor List identifies public providers and the categories of information they may process.',
          'Some providers may process information outside the user country. Pocket Genes remains responsible for selecting, configuring, and operating its own application safely even when the underlying cloud provider supplies infrastructure security.',
          'Pocket Genes does not publish a sale of personal information or advertising-use model for Pocket Genes user data in this Trust Center. If cookies, website analytics, crash reporting, product analytics, push notifications, attribution, or marketing communications are introduced or expanded, Pocket Genes should identify the tool, purpose, choice, and retention path in the relevant notice.',
        ],
      },
      {
        heading: 'Rights and request process',
        paragraphs: [
          `Users can contact ${POCKET_GENES_OPERATOR.privacyContact} to request access, correction, deletion, withdrawal of consent where applicable, account closure, or information about a specific integration source.`,
          'Pocket Genes reviews the request, verifies identity when needed, checks whether the information is controlled by Pocket Genes or by a provider, and explains the expected action or limitation. A request may be limited when another person privacy is affected, a provider remains responsible for the underlying report, a legal or safety hold applies, a security investigation is active, or the information is needed to enforce terms or resolve a dispute.',
          'Where Argentine personal-data law applies, people may have rights to access, rectify, update, or delete personal information and may contact the Agencia de Acceso a la Informacion Publica if a request is not resolved as required by applicable law. Where GDPR or another privacy law applies, additional rights or complaint paths may be available.',
        ],
      },
      {
        heading: 'Children, caregivers, optional communications, and matching',
        bullets: [
          'Children and minors should use Pocket Genes only through a parent, guardian, caregiver, provider, or other authorized arrangement where required by law and product configuration.',
          'Caregiver-managed accounts must respect the authority and privacy boundaries that apply to the person whose information is being managed.',
          'Service communications are limited to account, support, invitation, consent, report-access, security, accessibility, incident, and operational needs.',
          'Optional newsletters, event notices, organization updates, or marketing communications should have a clear opt-in or opt-out path.',
          'Automated matching or recommendations in RareFriends should rely on user-provided or permitted fields and should not be presented as diagnosis, treatment, clinical prioritization, or an endorsement.',
          'Changes to this policy are published through the Trust Center. Material changes should be communicated through an appropriate product or account notice when required.',
        ],
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Process only the information needed for the feature, integration, support, security, or community purpose.',
          'Keep private report access separate from public or community participation.',
          'Protect access references, tokens, report codes, and provider identifiers as confidential access information.',
          'Configure service providers, authentication, access control, logging, moderation, and support workflows with appropriate safeguards.',
          'Maintain request, deletion, incident, accessibility, and moderation channels.',
        ],
      },
      {
        heading: 'User, integrator, and organization responsibilities',
        bullets: [
          'Users should keep credentials secure, avoid sharing report links or codes publicly, choose community disclosures carefully, and use request channels when they need changes.',
          'Integrators must have authority to provide contact or identifying information to Pocket Genes and must provide accurate source, purpose, and consent context.',
          'Trusted Organizations must label promotional material, avoid medical pressure, respect privacy boundaries, and avoid using community access to infer or collect private report information.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Pocket Genes cannot delete a provider report or provider-controlled medical record that remains with the provider.',
          'Deleted information may briefly remain in backups or logs until rotation or restoration handling is complete.',
          'Moderation, incident, fraud-prevention, legal, audit, or security records may be retained where narrowly necessary.',
          'Third-party provider reports, app stores, external websites, booking tools, or embedded resources may have their own privacy practices.',
        ],
      },
      ...documentGovernanceEn([
        'Subprocessor List',
        'Data-Retention and Deletion Policy',
        'Data-Flow Diagram',
        'Security Overview',
        'Community Terms',
        'Community Safety Policy',
        'Terms of Service',
      ]),
    ],
  },
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    category: 'Product terms',
    summary:
      'Defines permitted use, account responsibilities, product limits, intellectual property, acceptable content, trusted-organization limits, and dispute handling.',
    owner: 'Product and Legal',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          `These Terms of Service govern access to and use of Pocket Genes, a product operated by ${POCKET_GENES_OPERATOR.legalName} in ${POCKET_GENES_OPERATOR.country}. By creating an account, accepting the Terms in a product workflow, using Pocket Genes, participating in RareFriends, or using a report-access experience, the user agrees to these Terms as they apply to that use.`,
          'An invitation from a provider, integrator, or organization starts a service workflow. Receiving an invitation does not, by itself, mean the invited person has accepted all Pocket Genes terms, joined RareFriends, authorized optional communications, or agreed to publish any information.',
        ],
      },
      {
        heading: 'Who the Terms apply to',
        bullets: [
          'Pocket Genes account holders and visitors to Pocket Genes public pages.',
          'People invited by a provider, laboratory, clinic, organization, support program, caregiver, or authorized representative.',
          'Parents, guardians, caregivers, or representatives using Pocket Genes for another person where permitted.',
          'RareFriends members, posters, commenters, message participants, and followers.',
          'Trusted Organizations, integrators, publishers, and professionals that use organization or community features.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Pocket Genes', body: 'The mobile-centered product, public pages, Trust Center, account services, report-access experiences, education, discovery, organization, and community features controlled by Pocket Genes.' },
          { heading: 'User', body: 'A person who accesses or uses Pocket Genes directly or through a permitted caregiver, guardian, representative, or organization workflow.' },
          { heading: 'Provider report', body: 'A genetic report, finding, file, provider resource, or report-access experience created, delivered, or controlled by an independent provider.' },
          { heading: 'RareFriends', body: 'The optional community layer connected to Pocket Genes.' },
          { heading: 'Trusted Organization', body: 'An organization reviewed for a curated Pocket Genes presence, subject to standards and ongoing moderation.' },
          { heading: 'User content', body: 'Profile fields, posts, comments, messages, reports, feedback, organization submissions, or other content a user or organization provides.' },
        ],
      },
      {
        heading: 'Eligibility and accounts',
        paragraphs: [
          'Users must be legally able to use Pocket Genes in their location and must provide accurate account information. If a user is under the applicable age or lacks legal capacity to accept these Terms alone, a parent, guardian, caregiver, provider, or other authorized person must be involved where required.',
          'Users are responsible for credential protection, device security, truthful account information, avoiding account sharing, and promptly reporting unauthorized use. Pocket Genes may require account recovery, identity verification, or additional checks before restoring access or changing sensitive information.',
        ],
      },
      {
        heading: 'Service description',
        paragraphs: [
          'Pocket Genes may provide mobile access to provider-connected genetic reports, education about genetic concepts, glossary and lesson content, discovery of organizations, resources and events, trusted-organization content, RareFriends community features, consent workflows, support, and optional communications.',
          'Features can vary by region, app version, account status, provider availability, organization participation, integration configuration, and user choices. Pocket Genes may change, pause, discontinue, or limit a feature when needed for product, safety, security, legal, or operational reasons.',
        ],
      },
      {
        heading: 'Reports and third-party providers',
        paragraphs: [
          'Genetic reports originate from independent providers. The provider is responsible for testing, report accuracy, findings, clinical interpretation, delivery, and provider-controlled resources. Pocket Genes does not replace the provider report or the provider relationship.',
          'Pocket Genes may organize access, display an authorized mobile experience, connect education around concepts, or provide a report-access path. Pocket Genes does not modify the provider original findings unless a specific integration expressly provides an edited or transformed provider-controlled experience.',
          'Provider links, portals, documents, laboratory services, clinical services, or external resources may have separate terms, privacy notices, availability limits, and support channels. Pocket Genes cannot guarantee that provider-controlled resources will remain available.',
        ],
      },
      {
        heading: 'Integrator responsibilities',
        paragraphs: [
          'An integrator that provides names, emails, phone numbers, provider references, report codes, or invitation information to Pocket Genes must be authorized to do so, must provide accurate information, must explain the source and purpose when required, and must not use Pocket Genes to contact people without a valid basis.',
          'Integrator access to a workflow does not give the integrator unrestricted visibility into later account activity, RareFriends participation, follows, messages, posts, or private report access unless the product and applicable notices expressly allow that visibility.',
        ],
      },
      {
        heading: 'Consent and invitations',
        bullets: [
          'An invitation may let a person create an account, confirm identity, authorize report access, review a consent document, or decide whether to continue.',
          'Consent records must identify the purpose, document or workflow version, status, time, and related provider or organization where applicable.',
          'Declining or ignoring an invitation may prevent the related workflow from continuing, but it should not create community participation or optional communications.',
          'Withdrawing consent may stop a future workflow but may not erase provider records, past lawful processing, security records, or evidence needed for legal or audit reasons.',
        ],
      },
      {
        heading: 'Non-medical nature',
        paragraphs: [
          'Pocket Genes is an access, education, organization, discovery, and community product. It does not perform genetic testing, independently classify variants, diagnose disease, prescribe treatment, determine clinical actionability, provide emergency monitoring, or replace a qualified clinician, genetic counselor, laboratory, or report provider.',
          'Educational content, community experiences, and organization posts can help users understand concepts or prepare questions. They are not medical advice. Users should contact their provider or a qualified professional for questions about diagnosis, treatment, risk, family planning, testing, or medical decisions.',
        ],
      },
      {
        heading: 'Acceptable use',
        bullets: [
          'Do not attempt unauthorized access, credential sharing, public sharing of private report links or codes, scraping, bulk extraction, reverse engineering where legally restricted, or circumvention of access controls.',
          'Do not impersonate another person or organization, submit false account information, use another person information without authority, or create multiple accounts to avoid enforcement.',
          'Do not harass, threaten, shame, exploit, pressure, or target people based on health, genetic, disability, family, caregiver, country, language, or identity context.',
          'Do not post unlawful content, another person report, private links, medical records, personal identifiers, re-identification clues, spam, scams, fraudulent cures, or dangerous medical instructions.',
          'Do not use Pocket Genes to collect users private medical or genetic information outside the intended feature or to move private conversations off-platform without permission.',
        ],
      },
      {
        heading: 'Community participation and Trusted Organizations',
        paragraphs: [
          'RareFriends participation is governed by these Terms, the Community Terms, and the Community Safety Policy. Users choose what to share and remain responsible for their content and interactions.',
          'Trusted Organization status means Pocket Genes has reviewed the organization for identity, relevance, content fit, and safety expectations. It is not a blanket endorsement of every claim, service, product, event, publication, provider, professional, or external resource from that organization.',
        ],
      },
      {
        heading: 'User content and intellectual property',
        paragraphs: [
          'Users and organizations keep ownership of content they provide, subject to any rights held by providers, publishers, employers, or third parties. By submitting content to Pocket Genes, they grant Pocket Genes the limited rights needed to host, display, format, translate, moderate, remove, preserve, and operate that content within the product and related safety workflows.',
          'Pocket Genes and its licensors own the Pocket Genes product, software, interface, design, brand, educational content authored by Pocket Genes, and related intellectual property. Providers own or control their reports and provider materials. Organizations own or control their submitted organization content subject to the rules that apply to publication.',
          'After account closure, content may be deleted, removed from public view, retained for moderation or legal reasons, or preserved in de-identified operational records depending on the feature and applicable policy.',
        ],
      },
      {
        heading: 'Availability, suspension, and termination',
        paragraphs: [
          'Pocket Genes may perform maintenance, update features, suspend integrations, change eligibility, remove content, restrict accounts, suspend organizations, or terminate access when needed for safety, security, compliance, abuse prevention, provider requirements, non-payment where applicable, or violation of these Terms.',
          'Suspension or termination may affect account access, community visibility, organization publishing, report-access paths, support workflows, and stored user content. Pocket Genes may provide an appeal or re-review path where the decision is not urgent, abusive, legally restricted, or security-sensitive.',
        ],
      },
      {
        heading: 'Disclaimers, liability, disputes, and governing law',
        paragraphs: [
          'Pocket Genes is provided to the extent permitted by applicable law without a guarantee that every feature will be uninterrupted, error-free, compatible with every device, available in every region, or suitable for every person specific medical, scientific, or community need.',
          `To the extent permitted by applicable law, ${POCKET_GENES_OPERATOR.legalName} is not responsible for provider report accuracy, external provider resources, third-party organization services, user-generated content, community decisions made outside Pocket Genes, or medical decisions made without qualified professional advice.`,
          `These Terms are governed by the laws of ${POCKET_GENES_OPERATOR.country}, unless mandatory consumer, privacy, health, or other laws in a user location require a different rule. Users can contact ${POCKET_GENES_EMAILS.trust} before escalating a dispute so the issue can be reviewed through the relevant privacy, security, accessibility, community, or support path.`,
        ],
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Operate account, access, consent, education, discovery, community, and support workflows according to published Trust Center boundaries.',
          'Separate private report access from optional community participation.',
          'Maintain reasonable security, moderation, request, accessibility, and incident processes.',
          'Label provider, organization, community, and Pocket Genes-authored content clearly enough for users to understand source responsibility.',
        ],
      },
      {
        heading: 'User, integrator, and organization responsibilities',
        bullets: [
          'Users are responsible for lawful use, accurate account information, credential protection, careful sharing, and respectful community conduct.',
          'Integrators are responsible for authority, accuracy, source notices, provider obligations, and respecting limits on subsequent user activity visibility.',
          'Organizations are responsible for identity accuracy, content quality, promotional labeling, conflict disclosure, privacy boundaries, and cooperation with review or moderation.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Provider resources, app stores, linked websites, embedded widgets, and external organization services may be governed by separate terms.',
          'Pocket Genes does not control every provider report, third-party document, external resource, or user statement.',
          'Some rights and obligations may vary by user location, provider agreement, product surface, caregiver arrangement, or applicable law.',
        ],
      },
      ...documentGovernanceEn([
        'Privacy Policy',
        'Community Terms',
        'Community Safety Policy',
        'Trusted Organization Standards',
        'Regulatory and Intended-Use Statement',
        'Scientific Methodology',
      ]),
    ],
  },
  {
    slug: 'community-terms',
    title: 'Community Terms',
    category: 'Community',
    summary:
      'Sets the rules for RareFriends by Pocket Genes, including identity choices, visibility, respectful participation, medical-discussion boundaries, and content rights.',
    owner: 'Community Operations',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'These Community Terms govern RareFriends by Pocket Genes and any Pocket Genes feature that allows users, caregivers, professionals, or organizations to create profiles, join groups, follow organizations, post, comment, send messages, report content, or participate in matching.',
          'RareFriends is intended to support careful peer connection, education, discovery, and practical next steps without turning private genetic reports into public community content.',
        ],
      },
      {
        heading: 'Who this document applies to',
        bullets: [
          'People who create or view RareFriends profiles.',
          'People who post, comment, message, follow, block, report, join groups, or use matching.',
          'Parents, caregivers, and representatives participating for another person where permitted.',
          'Professionals and organizations participating in community or trusted-organization features.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Community profile', body: 'The identity and optional fields a member chooses to show in RareFriends.' },
          { heading: 'Matching fields', body: 'Optional gene, condition, symptom, role, country, language, journey-stage, interest, or group fields used to help users find relevant people or resources.' },
          { heading: 'Private report access', body: 'Report-access functionality that remains separate from RareFriends unless a user intentionally shares information.' },
          { heading: 'Pseudonymous participation', body: 'Participation using a nickname or limited profile instead of a full public identity where the feature allows it.' },
          { heading: 'Organization content', body: 'Posts, events, resources, education updates, or profile material published by a Trusted Organization or professional account.' },
        ],
      },
      {
        heading: 'Eligibility and identities',
        paragraphs: [
          'Community participation may be available to affected people, family members, caregivers, learners, professionals, and organizations depending on feature availability and account configuration. Users must not impersonate a person, clinician, researcher, organization, provider, or support program.',
          'Real names are not required for every community interaction unless a specific workflow, provider, legal requirement, or organization review process requires accountable identity. Multiple accounts may be restricted when they are used to evade moderation or mislead others.',
        ],
      },
      {
        heading: 'Community visibility',
        bullets: [
          'Some profile fields may be visible to other users according to product settings.',
          'Group participation may be visible inside the group and to moderators.',
          'Posts and comments may be visible to the audience selected by the feature or group.',
          'Direct messages are not public but may be reviewed when reported, legally required, or necessary for safety investigation.',
          'Matching may use optional fields such as gene, condition, symptom, country, language, role, and journey stage.',
          'Private report access is not automatically visible to RareFriends members, followers, organizations, or integrators.',
        ],
      },
      {
        heading: 'User choices and controls',
        bullets: [
          'Users can choose whether to participate in RareFriends separately from report access.',
          'Users should be able to manage profile fields, tags, groups, follows, blocks, reports, and content deletion where the feature supports it.',
          'Users should not be pressured to share exact variants, full reports, contact details, location, family history, or identity information.',
          'Leaving a group, blocking a user, deleting content, or closing an account may not remove every moderation, legal, backup, or safety record.',
        ],
      },
      {
        heading: 'Medical and scientific discussions',
        paragraphs: [
          'Community members may share personal experiences, practical support, questions for appointments, and general education. They must not present community statements as diagnosis, treatment instructions, emergency advice, genetic counseling, or a substitute for professional care.',
          'Professionals and organizations must distinguish general education from professional advice, disclose promotional or sponsored material, avoid unsupported treatment claims, and avoid using community trust to solicit vulnerable users aggressively.',
        ],
      },
      {
        heading: 'Privacy rules',
        bullets: [
          'Do not share another person report, medical records, private messages, identifiers, report-access links, codes, or screenshots without permission.',
          'Do not doxx, re-identify, scrape, export, republish, or combine community information to identify people outside the intended feature.',
          'Do not pressure users to disclose diagnosis, variant, family history, symptoms, country, contact details, provider, or report contents.',
          'Do not move private conversations outside Pocket Genes without permission or use off-platform contact to bypass blocks or moderation.',
        ],
      },
      {
        heading: 'Commercial behavior and organizations',
        paragraphs: [
          'Organizations and professionals may publish education, resources, events, program updates, support information, and patient-engagement material only within the rules for their account type. Promotional content must be labeled clearly and must not be disguised as peer support or neutral education.',
          'Aggressive solicitation, fear-based messaging, unsupported cures, requests for private reports, or attempts to collect users health or genetic information outside the intended workflow can lead to content removal, account limits, or Trusted Organization review.',
        ],
      },
      {
        heading: 'User content and moderation',
        paragraphs: [
          'Users keep ownership of content they create, but grant Pocket Genes the limited rights needed to host, display, format, translate, moderate, remove, preserve, and operate the community. Users remain responsible for the accuracy, legality, and privacy impact of what they publish.',
          'Pocket Genes may remove content, reduce visibility, add labels, lock a thread, disable messaging, restrict features, suspend an account, remove an organization, or preserve records when needed for safety, legal, privacy, security, or community reasons.',
        ],
      },
      {
        heading: 'Leaving RareFriends',
        paragraphs: [
          'A user may stop community participation separately from private report access. Depending on the feature, leaving RareFriends may hide or remove the profile, end matching, remove follows, leave groups, disable messaging, and start deletion or de-identification of community records.',
          'Some posts, comments, reports, moderation records, or message metadata may remain temporarily or longer when needed for safety, legal compliance, dispute resolution, or backup rotation.',
        ],
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Keep community participation separate from private report access.',
          'Provide reporting, blocking, moderation, and trusted-organization review paths.',
          'Label source responsibility for user, organization, provider, and Pocket Genes content.',
          'Respond to privacy and safety reports according to severity and available information.',
        ],
      },
      {
        heading: 'User and organization responsibilities',
        bullets: [
          'Users must share carefully, respect privacy, avoid harassment, and avoid giving medical instructions.',
          'Caregivers and representatives must respect the privacy and authority boundaries that apply to the person they support.',
          'Organizations and professionals must avoid undisclosed promotion, patient pressure, privacy overreach, and unsupported claims.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Pocket Genes does not continuously monitor every community interaction.',
          'Blocking and reporting help reduce contact but cannot guarantee that a person will never see public information.',
          'External resources, events, or organizations may have their own terms, privacy practices, and safety limits.',
        ],
      },
      ...documentGovernanceEn([
        'Community Safety Policy',
        'Privacy Policy',
        'Terms of Service',
        'Trusted Organization Standards',
        'Scientific Methodology',
      ]),
    ],
  },
  {
    slug: 'community-safety-policy',
    title: 'Community Safety Policy',
    category: 'Community',
    summary:
      'Details moderation, reporting, blocking, escalation, abuse prevention, sensitive disclosures, crisis boundaries, and organization safety review for RareFriends.',
    owner: 'Community Operations',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'Rare-disease and genetics communities require particular care because users may be newly diagnosed, undiagnosed, caring for a child, unsure how to interpret a report, or looking for urgent next steps. This policy explains how Pocket Genes handles safety reports, moderation, blocking, sensitive disclosures, organization behavior, and appeals.',
          'The policy applies to RareFriends, community profiles, posts, comments, messages, groups, organization content, trusted-organization activity, reports, and community-adjacent support interactions controlled by Pocket Genes.',
        ],
      },
      {
        heading: 'Who this policy applies to',
        bullets: [
          'Community members, caregivers, learners, and visitors who interact with community content.',
          'Trusted Organizations, professionals, moderators, and support reviewers.',
          'People who are reported, people who report concerns, and people affected by community content.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Safety report', body: 'A user, moderator, organization, or support report about behavior or content that may harm privacy, safety, trust, or community integrity.' },
          { heading: 'Sensitive disclosure', body: 'Accidental or intentional publication of report content, medical information, personal identifiers, access links, codes, or another person information.' },
          { heading: 'Protective action', body: 'A temporary or permanent step such as hiding content, disabling messaging, limiting an account, contacting a user, or reviewing a trusted organization.' },
          { heading: 'Emergency content', body: 'Content suggesting imminent physical harm, self-harm, abuse, urgent medical danger, or crisis needs.' },
        ],
      },
      {
        heading: 'Safety principles',
        bullets: [
          'Protect privacy before curiosity. Users should not be pushed into revealing reports, exact variants, family details, or identity.',
          'Separate peer support from medical authority. Personal experience is welcome; diagnosis and treatment instructions are not.',
          'Treat organization access as higher responsibility. Trusted status requires clearer identity, labeling, and restraint.',
          'Act proportionally. Pocket Genes considers severity, intent, repeat behavior, affected users, context, and available evidence.',
        ],
      },
      {
        heading: 'Prohibited conduct',
        bullets: [
          'Harassment, bullying, threats, intimidation, hate, or discriminatory behavior.',
          'Impersonation of a user, caregiver, clinician, researcher, provider, organization, or Pocket Genes representative.',
          'Doxxing, re-identification, publishing another person medical or genetic information, or posting report codes and private links.',
          'Scams, financial exploitation, aggressive patient solicitation, spam, repeated unsolicited messages, or fraudulent cures.',
          'Dangerous medical misinformation, urgent-care claims, treatment instructions, or pressure to ignore qualified professional advice.',
          'Sexual exploitation, inappropriate conduct involving minors, attempts to obtain report codes, coordinated abuse, and evasion after suspension.',
        ],
      },
      {
        heading: 'Sensitive disclosures',
        paragraphs: [
          'If a user appears to have accidentally published a complete report, access link, medical record, personal identifier, or another person information, Pocket Genes may hide or remove the content while reviewing the issue. The goal is to reduce exposure first, then determine whether education, warning, account action, or further escalation is needed.',
          'Moderators may preserve limited evidence when needed to investigate abuse, document the decision, handle repeat behavior, or comply with legal obligations. Preserved evidence should be restricted to people with a need to know.',
        ],
      },
      {
        heading: 'Reporting and blocking',
        paragraphs: [
          `Users can report safety concerns in the product where available or by emailing ${POCKET_GENES_EMAILS.trust}. Useful reports include the profile, post, message, group, organization, screenshot with sensitive information redacted, approximate time, and a description of the risk.`,
          'Blocking can reduce contact from another user, but it may not remove public content, undo screenshots, or prevent all indirect exposure. The reported person may be notified of an outcome if action is taken, but Pocket Genes does not reveal unnecessary reporter information.',
        ],
      },
      {
        heading: 'Moderation process',
        subsections: [
          { heading: 'Intake', body: 'Pocket Genes receives the report, identifies the affected surface, and checks whether immediate protective action is needed.' },
          { heading: 'Initial assessment', body: 'The report is classified by severity, privacy risk, medical-safety risk, exploitation risk, repeat behavior, organization involvement, and evidence quality.' },
          { heading: 'Protective action', body: 'Pocket Genes may hide content, disable messages, lock a thread, restrict an account, or suspend organization publishing before the final decision when exposure or harm is urgent.' },
          { heading: 'Review and decision', body: 'A reviewer considers context, rules, prior behavior, affected users, and applicable legal or provider obligations.' },
          { heading: 'Communication', body: 'Pocket Genes may inform the reporter, affected user, account holder, or organization about the result when appropriate and safe.' },
          { heading: 'Record retention', body: 'Moderation records may be retained for accountability, repeat-abuse prevention, legal, security, or appeal reasons under the retention policy.' },
        ],
      },
      {
        heading: 'Emergency and crisis content',
        paragraphs: [
          'Pocket Genes is not an emergency service, crisis hotline, clinical triage service, or 24/7 monitoring service. Users facing imminent medical, physical, or mental-health danger should contact local emergency services or qualified professionals.',
          'When Pocket Genes becomes aware of content suggesting imminent harm, it may prioritize review, remove public exposure, contact the account through available channels, preserve relevant evidence, or take other reasonable steps consistent with the information available and legal limits.',
        ],
      },
      {
        heading: 'Trusted Organizations and appeals',
        paragraphs: [
          'Trusted Organizations are held to a higher standard because users may interpret their presence as a trust signal. Organization misconduct can lead to content labels, removal, temporary publishing limits, review of trusted status, suspension, or removal from Pocket Genes.',
          `A user or organization may request reconsideration by emailing ${POCKET_GENES_EMAILS.trust} with the decision, affected content, and reason for review. Pocket Genes may decline appeals that are abusive, repetitive, legally restricted, or involve active security or safety risk.`,
        ],
      },
      {
        heading: 'Transparency',
        body:
          'Pocket Genes may publish aggregate moderation information, such as categories of reports or actions taken, if the information does not identify users, disclose private reports, reveal sensitive details, or compromise safety or security investigations.',
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Maintain reporting, blocking, moderation, escalation, and organization-review paths.',
          'Act proportionally and document important decisions.',
          'Treat sensitive disclosures and report-access references as private and urgent when exposed.',
          'Avoid implying continuous emergency monitoring unless such capability is actually provided.',
        ],
      },
      {
        heading: 'User and organization responsibilities',
        bullets: [
          'Users must avoid harassment, privacy exposure, report sharing, scams, re-identification, and medical pressure.',
          'Organizations must label content, avoid aggressive solicitation, protect user privacy, and cooperate with review.',
          'Reporters should avoid sending full reports, passwords, tokens, or unnecessary private information unless Pocket Genes requests a limited item for investigation.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Pocket Genes may not see or review every interaction before harm occurs.',
          'External resources and off-platform conversations may fall outside Pocket Genes control.',
          'Legal, safety, provider, or security obligations may limit what Pocket Genes can disclose about an investigation.',
        ],
      },
      ...documentGovernanceEn([
        'Community Terms',
        'Incident-Reporting Contact',
        'Trusted Organization Standards',
        'Privacy Policy',
        'Data-Retention and Deletion Policy',
      ]),
    ],
  },
  {
    slug: 'security-overview',
    title: 'Security Overview',
    category: 'Security',
    summary:
      'Summarizes the security controls Pocket Genes is designed around, including authentication, authorization, report-access protection, infrastructure, logging, vendors, and incident response.',
    owner: 'Security',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'This Security Overview explains the controls Pocket Genes uses or designs around to protect accounts, integration workflows, report-access references, community features, support requests, and platform operations.',
          'Security is shared between Pocket Genes and its infrastructure providers. AWS and Firebase provide infrastructure and platform controls. Pocket Genes remains responsible for application configuration, authorization logic, credentials, code, product behavior, operational access, monitoring, and response.',
        ],
      },
      {
        heading: 'Who this document applies to',
        bullets: [
          'Pocket Genes users and invited users.',
          'Integrators, providers, and Trusted Organizations.',
          'Security researchers and people reporting incidents.',
          'Internal operators and administrators who handle Pocket Genes systems.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Authentication', body: 'The process used to verify a user or administrator identity before granting account access.' },
          { heading: 'Authorization', body: 'Application checks that decide whether an authenticated user may access a specific record, feature, provider reference, community resource, or admin action.' },
          { heading: 'Confidential access information', body: 'Report codes, provider references, URLs, access tokens, identifiers, and similar values that can connect a user to a private report-access path.' },
          { heading: 'Administrative access', body: 'Privileged access used to operate, support, moderate, debug, secure, or maintain Pocket Genes.' },
        ],
      },
      {
        heading: 'Authentication and sessions',
        paragraphs: [
          'Private account functionality requires authenticated identity. Repository evidence shows Firebase Authentication and server-created session cookies are used for protected account and backoffice flows. Supported sign-in methods may vary by product surface and provider configuration.',
          'Password reset, account recovery, and session handling are designed to reduce unauthorized takeover risk. Session lifetime, reauthentication, and recovery behavior are configured by the relevant authentication surface, and Pocket Genes does not advertise multi-factor authentication unless it is enabled for the relevant users.',
        ],
      },
      {
        heading: 'Authorization',
        paragraphs: [
          'Authentication does not grant universal access. Pocket Genes must check user-resource relationships before returning account records, report references, community records, support records, organization publishing tools, or admin actions.',
          'Administrative tools should enforce role-based access, least privilege, and separation between production operations and development or testing activity.',
        ],
      },
      {
        heading: 'Report-access protection',
        bullets: [
          'Report links, provider references, report codes, and access tokens are treated as confidential access information.',
          'They should not be intentionally exposed in public profiles, organization content, community posts, screenshots, analytics, or logs unless strictly needed for support or security.',
          'Access should be limited to the intended user, authorized caregiver, or authorized workflow.',
          'Expiration, revocation, and provider availability should be described in the integration or user flow when implemented.',
        ],
      },
      {
        heading: 'Encryption and infrastructure',
        paragraphs: [
          'Pocket Genes uses encrypted connections for protected network communications. Cloud providers may also provide provider-managed encryption at rest for managed databases, storage, and infrastructure services.',
          'This overview does not claim custom application-level encryption unless a specific Pocket Genes component implements it. Device-level protection also depends on the user device, operating system, app store, and account security settings.',
        ],
      },
      {
        heading: 'Administrative access',
        bullets: [
          'Grant production access only to people who need it for a defined operational role.',
          'Use role-based permissions and remove access when responsibilities change.',
          'Require strong authentication for administrative systems and enable multi-factor authentication where the system supports it.',
          'Log sensitive administrative actions and review access periodically.',
          'Avoid using production user information for development or demonstrations unless approved and minimized.',
        ],
      },
      {
        heading: 'Secure development',
        bullets: [
          'Use code review, dependency updates, release review, and environment separation for product changes.',
          'Store secrets outside source code and rotate them when exposure is suspected.',
          'Use test data or minimized datasets for testing whenever possible.',
          'Review authentication, authorization, Firestore rules, API routes, and mobile/API behavior before release.',
          'Track reported vulnerabilities through triage, remediation, validation, and closure.',
        ],
      },
      {
        heading: 'Logging, monitoring, backups, and continuity',
        paragraphs: [
          'Pocket Genes may log operational, security, authentication, support, and diagnostic events to detect errors, abuse, unusual access, and service reliability issues. Monitoring is intended to protect the platform and is not a promise of continuous review of private community content.',
          'Backups and managed-provider durability help support business continuity and disaster recovery. Restores should be handled so deleted or restricted records are not unintentionally re-exposed after recovery.',
        ],
      },
      {
        heading: 'Vendor management',
        paragraphs: [
          'Pocket Genes assesses providers according to service purpose, information involved, security controls, contractual terms, privacy documentation, and operational need. The Subprocessor List identifies public providers used for Pocket Genes components.',
        ],
      },
      {
        heading: 'Incident response',
        paragraphs: [
          'Incident response includes preparation, intake, detection, severity assessment, containment, investigation, remediation, recovery, communication, and lessons learned. Privacy incidents, account compromise, organization abuse, community safety issues, accessibility barriers, and security vulnerabilities use different handling paths.',
          'Security concerns and vulnerabilities can be reported through the Incident-Reporting Contact page and the published security.txt file.',
        ],
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Configure authentication, authorization, infrastructure, and application controls safely.',
          'Protect confidential access information and private user data.',
          'Keep administrative access limited, reviewed, and logged where feasible.',
          'Maintain a vulnerability and incident reporting path.',
        ],
      },
      {
        heading: 'User, integrator, and organization responsibilities',
        bullets: [
          'Users should protect credentials, devices, report links, and report codes.',
          'Integrators should send only necessary data and protect provider references before and after transfer.',
          'Organizations should not request private reports or access codes through community content or messages.',
          'Security researchers should follow the vulnerability-disclosure scope and avoid accessing other users information.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'No system can guarantee perfect security.',
          'Provider portals, app stores, external websites, and user devices may be outside Pocket Genes control.',
          'Security details may be withheld when disclosure would increase risk.',
        ],
      },
      ...documentGovernanceEn([
        'Incident-Reporting Contact',
        'Subprocessor List',
        'Data-Flow Diagram',
        'Data-Retention and Deletion Policy',
        'Privacy Policy',
      ]),
    ],
  },
  {
    slug: 'data-flow-diagram',
    title: 'Data-Flow Diagram',
    category: 'Security',
    summary:
      'Shows how providers, Pocket Genes, infrastructure providers, and users interact when a report is accessed through the mobile experience.',
    owner: 'Security and Product',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'This page describes the movement of information through a typical Pocket Genes report-access, education, discovery, and community journey. It is not a server topology diagram and does not expose implementation secrets.',
          'The goal is to show what information enters each step, who is responsible, what Pocket Genes does, whether information is retained, and what the user controls.',
        ],
      },
      {
        heading: 'Who this document applies to',
        bullets: [
          'Users and caregivers trying to understand report-access and community boundaries.',
          'Providers and integrators that initiate invitations or report-access workflows.',
          'Trusted Organizations and community publishers.',
          'Privacy, security, and support reviewers handling requests.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Provider', body: 'The organization that created, delivered, or controls the genetic report or provider resource.' },
          { heading: 'Integrator', body: 'A provider, clinic, laboratory, organization, or support program that connects a person to a Pocket Genes workflow.' },
          { heading: 'Access reference', body: 'A URL, code, token, identifier, provider reference, or similar value used to connect an authorized user to a report-access path.' },
          { heading: 'Community participation', body: 'Optional RareFriends actions such as profile creation, matching, follows, groups, posts, comments, and messages.' },
        ],
      },
      {
        heading: 'Data-flow table',
        table: {
          headers: ['Step', 'Actor', 'Information involved', 'Pocket Genes action', 'Retained?', 'User control'],
          rows: [
            ['Provider initiates', 'Integrator or provider', 'Name, email, optional phone, provider reference, workflow purpose.', 'Creates or prepares the invitation or access process.', 'According to integration policy and current workflow state.', 'User may continue, decline, object, or request deletion where applicable.'],
            ['User contact', 'Pocket Genes', 'Contact details, invitation state, source organization, support context.', 'Sends service communication for the invitation or access path.', 'Temporarily or until workflow/account cleanup; no public automatic TTL unless stated for a specific integration.', 'User can ignore, decline, contact support, or request deletion.'],
            ['Consent', 'User and Pocket Genes', 'Consent purpose, version, status, timestamp, related provider or workflow.', 'Records the decision and continues or stops the workflow.', 'Consent records may outlive temporary contact data for accountability.', 'User can withdraw where applicable, subject to limits.'],
            ['Authentication', 'User, Firebase, Pocket Genes', 'Account id, login information, session state, security events.', 'Verifies identity before private operations.', 'Account and security schedule.', 'User manages account and can request closure.'],
            ['Report access', 'Provider, Pocket Genes, user', 'Provider link, report code, access token, identifier, report reference, authorization state.', 'Connects authorized user to the provider-connected report experience.', 'State depends on integration, expiry, revocation, provider relationship, and account deletion.', 'User can protect links, sign out, request revocation or deletion where applicable.'],
            ['Education and discovery', 'Pocket Genes and user', 'Interests, interactions, saved resources, organization follows where applicable.', 'Shows glossary, lessons, resources, events, and relevant organization content.', 'According to account and interaction records.', 'User can manage interests, follows, and optional communications.'],
            ['Community', 'User, RareFriends, organizations', 'Optional profile, tags, posts, comments, follows, groups, messages, reports, blocks.', 'Publishes and matches according to settings and rules.', 'Community schedule and moderation records.', 'User controls participation, content, visibility, blocks, and deletion subject to limits.'],
          ],
        },
      },
      {
        heading: 'Explicit boundaries',
        bullets: [
          'The provider remains responsible for the underlying report and findings.',
          'Pocket Genes is responsible for the account, access, integration, consent, education, discovery, and community processes it operates.',
          'Accessing a report does not publish it.',
          'Joining RareFriends does not disclose a report to other users.',
          'Trusted Organizations do not receive unrestricted account access.',
          'An integrator does not automatically receive the user subsequent community activity.',
          'Report information is not used for advertising under the Trust Center data map.',
        ],
      },
      {
        heading: 'User device and local state',
        paragraphs: [
          'The user device may hold app state, cached screens, notifications, downloaded files, screenshots, browser history, or operating-system records depending on device settings and app behavior. Users should protect the device with a passcode or biometric lock and avoid saving or sharing report screenshots publicly.',
          'Pocket Genes should avoid storing provider links, report codes, or private report content in places where they are not needed, such as public profiles, community posts, analytics, or support screenshots.',
        ],
      },
      {
        heading: 'Infrastructure',
        body:
          'Pocket Genes uses established service providers, including Amazon Web Services and Google Firebase, to operate different components. Infrastructure providers support hosting, authentication, database, backend, logging, and operational reliability depending on the feature.',
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Limit each step to the information needed for the workflow.',
          'Keep source responsibility clear between providers, Pocket Genes, organizations, and users.',
          'Protect access references and private account data.',
          'Document consent, request, deletion, and incident paths.',
        ],
      },
      {
        heading: 'User, integrator, and organization responsibilities',
        bullets: [
          'Users should review invitations, manage community choices, and avoid posting private report information.',
          'Integrators should provide only authorized and necessary information.',
          'Organizations should not infer private account or report data from follows, comments, or community membership.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Specific integrations may have additional provider terms, retention rules, or support paths.',
          'External provider resources may become unavailable outside Pocket Genes control.',
          'Backups, logs, and legal holds may affect deletion timing.',
        ],
      },
      ...documentGovernanceEn([
        'Privacy Policy',
        'Security Overview',
        'Data-Retention and Deletion Policy',
        'Subprocessor List',
        'Regulatory and Intended-Use Statement',
      ]),
    ],
  },
  {
    slug: 'subprocessor-list',
    title: 'Subprocessor List',
    category: 'Privacy and rights',
    summary:
      'Lists third parties that may process account, authentication, infrastructure, operational, scheduling, or limited application data for Pocket Genes.',
    owner: 'Trust and Privacy',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'This Subprocessor List identifies public service providers that may process personal information for Pocket Genes infrastructure, authentication, database, backend, hosting, operations, diagnostics, support, or scheduling workflows.',
          'The list focuses on providers evidenced by the current public product and repository context. Pocket Genes should update the register when a provider is added, replaced, removed, or starts processing a new category of personal information.',
        ],
      },
      {
        heading: 'Who this document applies to',
        bullets: [
          'Pocket Genes users, invited users, caregivers, and community participants.',
          'Integrators, providers, and Trusted Organizations evaluating Pocket Genes data handling.',
          'People who submit support, booking, incident, accessibility, or trusted-organization requests.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Subprocessor', body: 'A service provider that processes personal information for Pocket Genes according to Pocket Genes instructions or configuration.' },
          { heading: 'Infrastructure provider', body: 'A cloud or platform provider that hosts, stores, authenticates, transmits, logs, or supports Pocket Genes technical components.' },
          { heading: 'International processing', body: 'Processing, storage, support, or access that may occur outside the user country depending on provider architecture and support operations.' },
          { heading: 'Provider documentation', body: 'Public privacy, security, data-processing, or service documentation published by the provider.' },
        ],
      },
      {
        heading: 'Public register',
        body:
          'Each provider entry identifies the legal entity, service, purpose, information categories, processing role, transfer context, documentation, and review date.',
        subsections: [
          {
            heading: 'Amazon Web Services',
            bullets: [
              'Legal provider entity: Amazon Web Services, Inc. or applicable AWS contracting affiliate.',
              'Product or service used: Cloud infrastructure and backend services used by Pocket Genes components.',
              'Purpose: Hosting, compute, storage, network, operational reliability, security, and backend service operation.',
              'Categories of information: Application, operational, logging, integration, support, and limited account information depending on hosted component.',
              'Processing role: Hosts, stores, transmits, and supports infrastructure under Pocket Genes configuration.',
              'Jurisdictions or transfers: International processing may apply depending on AWS region, support, and service configuration.',
              'Documentation: AWS privacy, data processing, security, and compliance documentation.',
              `Added or reviewed: ${TRUST_LAST_REVIEWED_EN}.`,
            ],
          },
          {
            heading: 'Google Firebase',
            bullets: [
              'Legal provider entity: Google LLC or applicable Google contracting affiliate.',
              'Product or service used: Firebase Authentication, Firebase or Google Cloud database and application infrastructure where configured.',
              'Purpose: Authentication, account identity, database, application operations, security events, and app infrastructure.',
              'Categories of information: Account identifiers, authentication data, login records, profile/application data, integration references, technical logs, and diagnostic information depending on feature.',
              'Processing role: Authenticates, hosts, stores, transmits, and supports application infrastructure.',
              'Jurisdictions or transfers: International processing may apply under Google and Firebase service terms and infrastructure.',
              'Documentation: Google Cloud, Firebase, privacy, data processing, and security documentation.',
              `Added or reviewed: ${TRUST_LAST_REVIEWED_EN}.`,
            ],
          },
          {
            heading: 'Relayhook',
            bullets: [
              'Legal provider entity: Connex, operator of the Relayhook service.',
              'Product or service used: Webhook notification endpoint for public booking and trusted-organization meeting requests.',
              'Purpose: Forwarding booking or meeting-request details so Pocket Genes can respond.',
              'Categories of information: Full name, email, optional WhatsApp or phone, company name, meeting details, source page, locale, and request context.',
              'Processing role: Transmits and notifies request information submitted through the booking workflow.',
              'Jurisdictions or transfers: International processing may apply depending on Relayhook hosting and operations.',
              'Documentation: Relayhook privacy documentation is recorded in the vendor file.',
              `Added or reviewed: ${TRUST_LAST_REVIEWED_EN}.`,
            ],
          },
        ],
      },
      {
        heading: 'Provider selection',
        body:
          'Pocket Genes assesses service providers according to the service purpose, information categories involved, security controls, privacy terms, contractual terms, reliability, support model, and whether the provider is necessary for the relevant feature.',
      },
      {
        heading: 'Changes and notice',
        paragraphs: [
          'Material additions, replacements, removals, or new processing purposes should be reflected in this list. Pocket Genes may notify users, integrators, or organizations separately when a change materially affects their information, contract, integration, or legal rights.',
          'A provider used only for a different Golden Crow product should not be treated as a Pocket Genes subprocessor unless it processes Pocket Genes information.',
        ],
      },
      {
        heading: 'Shared responsibility',
        paragraphs: [
          'Using AWS, Firebase, or another provider does not transfer Pocket Genes responsibility for safe application design. Pocket Genes remains responsible for access rules, database security rules, credentials, code, product configuration, data minimization, support workflows, and incident response.',
        ],
      },
      {
        heading: 'Audit areas',
        bullets: [
          'Email delivery and transactional communications.',
          'Push notifications.',
          'Crash reporting and diagnostics.',
          'Product analytics and website analytics.',
          'Customer support tools.',
          'Scheduling and booking tools.',
          'Hosting, error monitoring, storage, and content delivery.',
        ],
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Maintain an accurate provider register for Pocket Genes services.',
          'Limit data sent to each provider to the purpose of the integration.',
          'Review provider security and privacy information before material use.',
          'Update users or partners when a material provider change requires notice.',
        ],
      },
      {
        heading: 'User, integrator, and organization responsibilities',
        bullets: [
          'Users should use privacy request channels for questions about provider processing.',
          'Integrators should not assume their own vendors are covered by this Pocket Genes list.',
          'Organizations should disclose their own external tools when they send users away from Pocket Genes or collect information independently.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Provider legal entities and product names can vary by contract and region.',
          'Emergency support, legal requests, fraud investigations, and provider outages may involve additional processors or disclosures where permitted.',
          'This list does not cover independent providers that control their own reports, websites, clinical services, events, or resources.',
        ],
      },
      ...documentGovernanceEn([
        'Privacy Policy',
        'Security Overview',
        'Data-Flow Diagram',
        'Incident-Reporting Contact',
      ]),
    ],
  },
  {
    slug: 'data-retention-deletion',
    title: 'Data-Retention and Deletion Policy',
    category: 'Privacy and rights',
    summary:
      'Explains how long Pocket Genes retains account information, temporary integration data, consent records, community content, operational logs, backups, and what happens when information is deleted.',
    owner: 'Trust and Privacy',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'This policy explains how Pocket Genes retains, deletes, de-identifies, or preserves information in account, integration, consent, report-access, community, support, log, and backup workflows.',
          'Retention values must reflect implemented behavior. Where Pocket Genes has not published a fixed automated expiration period, this policy states the current deletion trigger instead of inventing a fixed number of days.',
        ],
      },
      {
        heading: 'Who this policy applies to',
        bullets: [
          'Pocket Genes users, invited users, caregivers, and representatives.',
          'People whose contact information is provided by an integrator.',
          'RareFriends community participants.',
          'Trusted Organizations, providers, and integrators connected to a workflow.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Active systems', body: 'Databases, authentication services, storage, and application records used to operate live Pocket Genes features.' },
          { heading: 'Backup', body: 'A provider or operational copy used for disaster recovery or service restoration, not ordinary user access.' },
          { heading: 'Deletion trigger', body: 'The user request, account closure, workflow closure, moderation action, expiration, revocation, or operational action that starts deletion.' },
          { heading: 'Legal or safety hold', body: 'A narrow preservation reason such as security investigation, legal claim, abuse evidence, fraud prevention, audit, or statutory obligation.' },
          { heading: 'De-identified information', body: 'Information no longer reasonably linked to an identifiable person. Truly anonymous data is not treated as account data in this policy.' },
        ],
      },
      {
        heading: 'Retention schedule',
        table: {
          headers: ['Information', 'Retention begins', 'Retention ends', 'Deletion trigger', 'Possible exception'],
          rows: [
            ['Uncompleted integration invitation', 'Receipt from integrator or provider.', 'Workflow completion, rejection, manual cleanup, account deletion, or a published integration-specific expiry.', 'User declines, requests deletion, invitation is revoked, or operator closes the workflow.', 'Security investigation, legal hold, abuse review, or provider dispute.'],
            ['Account data', 'Account creation or invitation acceptance.', 'Account deletion plus active-system deletion process and backup rotation.', 'Verified user request, authorized admin deletion, or account closure workflow.', 'Legal, fraud-prevention, security, payment, audit, or dispute requirement.'],
            ['Consent record', 'Consent decision or refusal.', 'When the evidentiary, provider, audit, or legal need ends.', 'Expiry of evidentiary requirement, deletion request where applicable, or workflow retirement.', 'Legal claim, provider audit, compliance requirement, or dispute.'],
            ['Report access reference or link', 'Link, code, token, reference, or authorization creation.', 'Expiry, revocation, provider relationship end, account deletion, or provider workflow cleanup.', 'User request, provider revocation, account deletion, or integration cleanup.', 'Support investigation, security incident, legal hold, provider dispute.'],
            ['Community profile', 'Profile creation or RareFriends enrollment.', 'Profile deletion, RareFriends exit, account deletion, or moderation removal.', 'User request, account closure, or moderator action.', 'Moderation record, safety evidence, legal hold.'],
            ['Posts and comments', 'Publication.', 'User deletion, account deletion cascade, moderation removal, or community feature retirement.', 'User action, account closure, or moderation action.', 'Safety investigation, legal preservation, abuse evidence.'],
            ['Messages', 'Message sent or received.', 'Deletion, account closure, feature-specific retention, or moderation cleanup where messaging is enabled.', 'User or account deletion, report, or moderation action.', 'Abuse investigation, safety review, legal hold.'],
            ['Support and booking requests', 'Ticket, email, form, or booking submission.', 'Closure, manual archive, deletion request, or operational cleanup.', 'User request, support closure, or operator archive.', 'Legal dispute, billing, abuse, or security investigation.'],
            ['Security logs', 'Security, authentication, system, or access event.', 'Provider log cycle, configured log expiry, incident closure, or operational cleanup.', 'Automated expiry where configured or manual cleanup.', 'Active incident, abuse investigation, legal hold.'],
            ['Backups', 'Backup creation by provider or operational process.', 'Maximum provider backup cycle or rotation.', 'Automatic rotation, restoration cleanup, or provider process.', 'Disaster recovery, legal hold, active incident.'],
            ['De-identified analytics', 'Creation from operational or usage information.', 'When no longer useful or according to analytics configuration; may be indefinite if genuinely anonymous.', 'Policy schedule or dataset retirement.', 'Not applicable if no longer personal information.'],
          ],
        },
      },
      {
        heading: 'Active systems versus backups',
        paragraphs: [
          'Deletion from active systems means Pocket Genes removes or de-identifies the record from the systems used for ordinary product functionality. The exact timing can depend on the account, provider workflow, queue, database, storage, and support process.',
          'Deleted data may remain briefly in backups until provider or operational backup rotation completes. Backups are intended for restoration and continuity, not normal lookup. If a backup is restored, Pocket Genes should reapply known deletion, restriction, or moderation states where feasible.',
        ],
      },
      {
        heading: 'Consent records',
        paragraphs: [
          'Consent records may outlive temporary contact information because Pocket Genes may need evidence of the decision, document version, workflow, time, and provider or organization relationship. This is separate from retaining a complete report or unnecessary invitation information.',
          'A consent record should keep the minimum information needed to understand what was accepted, declined, withdrawn, or superseded.',
        ],
      },
      {
        heading: 'Account deletion',
        paragraphs: [
          'The current backend includes a cascade-deletion path for Firebase Auth account, private profile, public profile, community user document and events, authored posts and comments up to operational batch limits, report codes, user progress, report owner records, and uploaded report records linked to the user.',
          'Account deletion does not delete provider-controlled reports, provider medical records, provider portals, app-store records, external organization records, or information other users lawfully retain outside Pocket Genes. It also may not remove moderation, legal, security, backup, or de-identified operational records.',
        ],
      },
      {
        heading: 'Legal and safety exceptions',
        bullets: [
          'Fraud, security, or account-compromise investigation.',
          'Legal claim, subpoena, court order, regulator request, or statutory obligation.',
          'Abuse, harassment, scam, exploitation, or moderation evidence.',
          'Enforcement of Terms of Service, Community Terms, or Trusted Organization Standards.',
          'Protection of another user privacy, safety, or rights.',
        ],
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'State retention based on implemented behavior, not aspirational periods.',
          'Delete or de-identify active-system information when a valid deletion trigger applies.',
          'Preserve only narrow records needed for legal, safety, audit, or security reasons.',
          'Explain what Pocket Genes cannot delete because it remains with a provider or third party.',
        ],
      },
      {
        heading: 'User, integrator, and organization responsibilities',
        bullets: [
          'Users should request deletion from Pocket Genes and separately from providers or organizations when those parties control their own records.',
          'Integrators should avoid sending unnecessary data and should honor revocation or correction requests in their own systems.',
          'Organizations should delete or correct independently collected user information under their own notices and obligations.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Operational batch limits may require staged deletion for unusually large content histories.',
          'Backups and provider-managed logs can delay final removal from every copy.',
          'Some records may be retained in de-identified, aggregated, or legal-hold form.',
        ],
      },
      ...documentGovernanceEn([
        'Privacy Policy',
        'Data-Flow Diagram',
        'Security Overview',
        'Community Safety Policy',
      ]),
    ],
  },
  {
    slug: 'incident-reporting',
    title: 'Incident-Reporting Contact',
    category: 'Security',
    summary:
      'Explains how to report privacy, account, safety, accessibility, and security concerns, including a vulnerability-disclosure path.',
    owner: 'Security',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'This page explains how to report a privacy incident, account issue, exposed access reference, community safety problem, organization concern, accessibility barrier, or security vulnerability involving Pocket Genes.',
          'It separates user incidents from vulnerability research so reporters know what to include, what not to include, and what Pocket Genes will do next.',
        ],
      },
      {
        heading: 'Who this page applies to',
        bullets: [
          'Pocket Genes users, caregivers, invited users, and account holders.',
          'People affected by a privacy, community, accessibility, or organization issue.',
          'Security researchers reporting a vulnerability in good faith.',
          'Integrators, providers, and Trusted Organizations reporting a workflow issue.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Privacy, account, or safety incident', body: 'A concern involving unauthorized account access, unexpected exposure of personal information, misdirected invitations, disclosed links or codes, community safety issues, organization misuse, or loss of account control.' },
          { heading: 'Security vulnerability', body: 'A technical weakness that could affect confidentiality, integrity, availability, authentication, authorization, or access controls in Pocket Genes.' },
          { heading: 'Good-faith research', body: 'Testing that stays within the published scope, avoids harm, avoids unnecessary data access, reports promptly, and gives Pocket Genes a reasonable opportunity to remediate.' },
        ],
      },
      {
        heading: 'Report a privacy, account, accessibility, or safety incident',
        paragraphs: [
          `Email ${POCKET_GENES_EMAILS.trust} with a subject such as "Pocket Genes privacy incident", "Pocket Genes account compromise", "Pocket Genes exposed report link", "Pocket Genes accessibility barrier", or "Pocket Genes community safety report".`,
          'Reportable situations include unauthorized account access, an invitation sent to the wrong person, unexpected exposure of personal information, a private link or access code disclosed, information received without expected authorization, community disclosure of another person information, suspected abuse by an organization, and loss of account control.',
        ],
      },
      {
        heading: 'What to include and what not to include',
        bullets: [
          'Include the affected page, app screen, organization, account workflow, report code type, community area, or API if known.',
          'Include approximate date, time, time zone, device, browser, app version, assistive technology, and steps to reproduce when relevant.',
          'Include screenshots only when useful and redact passwords, tokens, full genetic reports, unrelated medical information, and other people personal information where possible.',
          'Do not send passwords, one-time codes, authentication tokens, full reports, full medical records, or private keys unless Pocket Genes asks for a limited item through a safer follow-up path.',
        ],
      },
      {
        heading: 'Triage and updates',
        paragraphs: [
          'Pocket Genes reviews reports, classifies the issue, checks urgency, limits internal access to people who need the information, and may request identity verification before discussing account-specific details.',
          'Urgent risks involving active account compromise, exposed report-access references, vulnerable users, organization abuse, or broad security impact are prioritized. Updates may be limited when disclosure would affect another person privacy, security, legal obligations, or an active investigation.',
        ],
      },
      {
        heading: 'Report a security vulnerability',
        paragraphs: [
          `Security vulnerabilities can be reported to ${POCKET_GENES_EMAILS.security}. The public security.txt file also points researchers to this channel.`,
          'Covered scope includes public Pocket Genes pages, Pocket Genes Trust Center, Pocket Genes account and report-access APIs, Pocket Genes mobile app surfaces, RareFriends community features, and trusted-organization publishing workflows controlled by Pocket Genes.',
        ],
      },
      {
        heading: 'Authorized research and prohibited activity',
        bullets: [
          'Allowed: good-faith testing against accounts and data you control, passive inspection of public pages, and minimal proof-of-concept testing needed to demonstrate impact.',
          'Do not perform denial-of-service testing, social engineering, physical attacks, destructive testing, spam, credential stuffing, or attempts to bypass rate limits at scale.',
          'Do not access, copy, retain, modify, delete, or share another user information beyond the minimum needed to demonstrate a vulnerability.',
          'Do not publish details before Pocket Genes has had a reasonable opportunity to investigate and remediate.',
        ],
      },
      {
        heading: 'Safe harbor and response process',
        paragraphs: [
          'Pocket Genes intends not to pursue good-faith researchers for accidental, limited activity that follows this policy, avoids privacy harm, avoids service disruption, and is reported promptly. This safe-harbor statement is subject to applicable law and does not protect extortion, privacy violations, destructive activity, or bad-faith conduct.',
          'A useful vulnerability report includes affected component, reproduction steps, impact, supporting evidence, researcher contact, whether any user information was accessed, and whether the issue appears actively exploitable. Pocket Genes aims to acknowledge receipt, triage based on severity, provide status updates when practical, remediate according to risk, and coordinate disclosure where appropriate.',
        ],
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Maintain clear reporting channels for incidents and vulnerabilities.',
          'Triage reports according to privacy, safety, security, accessibility, and operational risk.',
          'Contain and remediate confirmed issues according to severity.',
          'Communicate with reporters where appropriate and preserve records needed for accountability.',
        ],
      },
      {
        heading: 'Reporter responsibilities',
        bullets: [
          'Report promptly and provide enough detail to investigate.',
          'Avoid unnecessary access to private information.',
          'Do not disrupt services or test outside scope.',
          'Keep vulnerability details confidential until coordinated disclosure is agreed or a reasonable remediation window has passed.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Pocket Genes is not an emergency medical, crisis, law-enforcement, or 24/7 monitoring service.',
          'Some reports may belong to a provider, app store, external website, or organization outside Pocket Genes control.',
          'Legal, security, and privacy constraints may limit the detail Pocket Genes can share about outcomes.',
        ],
      },
      ...documentGovernanceEn([
        'Security Overview',
        'Privacy Policy',
        'Community Safety Policy',
        'Accessibility Statement',
      ]),
    ],
  },
  {
    slug: 'accessibility-statement',
    title: 'Accessibility Statement',
    category: 'Accessibility',
    summary:
      'Describes Pocket Genes accessibility scope, WCAG target, current conformance status, supported features, testing methods, known limitations, and feedback process.',
    owner: 'Product',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'Accessibility in Pocket Genes means people should be able to physically operate the product and understand complex genetic, privacy, security, report-access, and community concepts. The statement covers the public website, Trust Center, mobile-centered product experience, report-access flows, community features, and Pocket Genes-controlled documents.',
          'Provider reports, app stores, linked websites, embedded booking tools, external organization resources, and third-party documents may have their own accessibility limits because Pocket Genes does not control every part of those experiences.',
        ],
      },
      {
        heading: 'Who this statement applies to',
        bullets: [
          'People using Pocket Genes public pages, Trust Center, app screens, report-access flows, account workflows, or community features.',
          'People using assistive technology such as screen readers, keyboard navigation, switch controls, zoom, text scaling, captions, or alternative input.',
          'Caregivers, providers, organizations, and support contacts helping someone access Pocket Genes.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'WCAG', body: 'Web Content Accessibility Guidelines, the W3C standard used to evaluate web accessibility.' },
          { heading: 'Assistive technology', body: 'Technology such as VoiceOver, TalkBack, screen readers, magnifiers, keyboard navigation, switch control, captions, voice input, or browser accessibility features.' },
          { heading: 'Partially conformant', body: 'Some content meets the target standard, but not every screen, document, third-party component, or workflow has completed documented evaluation.' },
          { heading: 'Alternative format', body: 'A practical support path, explanation, document, or assisted process provided when the ordinary format creates a barrier.' },
        ],
      },
      {
        heading: 'Accessibility standard and conformance status',
        paragraphs: [
          'Pocket Genes aims to meet WCAG 2.2 Level AA for public web experiences and applies corresponding accessible-design principles to mobile applications.',
          'Current conformance status: partially conformant and still being evaluated. Pocket Genes does not claim full WCAG conformance until a complete evaluation is performed and documented for the relevant pages, app screens, and workflows.',
          `Last accessibility review date for this statement: ${TRUST_EFFECTIVE_DATE_EN}.`,
        ],
      },
      {
        heading: 'Supported accessibility features',
        bullets: [
          'Semantic headings, landmarks, lists, tables, links, and buttons for public web pages.',
          'Keyboard navigation and visible focus indicators where controls are present on public pages.',
          'Readable contrast, responsive layout, non-color indicators, and stable text wrapping.',
          'VoiceOver and TalkBack-friendly labels for mobile app controls where native implementation permits.',
          'Dynamic Type and text scaling principles for mobile layouts.',
          'Clear form labels, validation messages, error states, and recovery paths.',
          'Touch targets sized for mobile use and layouts that avoid requiring a specific orientation when possible.',
          'Reduced-motion consideration for non-essential animation.',
          'Plain-language labels and alternatives for charts, tables, genomic visuals, and dense scientific content.',
          'Captions, transcripts, or text alternatives where Pocket Genes publishes media that needs them.',
        ],
      },
      {
        heading: 'Testing methodology',
        paragraphs: [
          'Pocket Genes accessibility review includes semantic markup checks, keyboard checks for public pages, responsive layout review, color-contrast review, content readability review, and investigation of user-reported barriers.',
          'The intended testing program includes automated accessibility tools, manual keyboard review, screen-reader review, text scaling, contrast checks, mobile device testing, and user testing with people with disabilities. The statement will be updated as those methods are completed and documented.',
        ],
      },
      {
        heading: 'Known limitations',
        table: {
          headers: ['Affected feature', 'User impact', 'Workaround', 'Planned correction'],
          rows: [
            ['Provider reports and external resources', 'A linked report, PDF, portal, or organization site may not meet the same accessibility target.', 'Contact Pocket Genes or the provider for an alternate path or accessible copy where available.', 'Document provider limitations and request accessible alternatives from partners.'],
            ['Embedded booking or third-party widgets', 'Keyboard, screen-reader, or contrast behavior may depend on the third-party component.', 'Email the support address directly with the meeting request or accessibility barrier.', 'Review widgets during vendor assessment and provide a direct email fallback.'],
            ['Mobile app screens not yet fully evaluated', 'Some native labels, focus order, text scaling, or chart alternatives may need additional testing.', 'Report the screen and task that failed so support can assist or prioritize a fix.', 'Complete screen-reader, text scaling, and touch-target reviews for core flows.'],
            ['Visual genomic information', 'Charts or dense tables may be hard to interpret without text alternatives.', 'Request an explanation or alternate format through the accessibility contact.', 'Add structured summaries and non-color labels to genomic displays.'],
          ],
        },
      },
      {
        heading: 'Feedback process',
        paragraphs: [
          `Accessibility barriers can be reported to ${POCKET_GENES_EMAILS.accessibility}. Include the page, screen, workflow, device, browser, operating system, app version, assistive technology, what you tried to do, what happened, and whether the issue blocks account access, report access, consent, community participation, or support contact.`,
          'Pocket Genes reviews accessibility reports by severity and user impact. If the first response does not resolve the barrier, reply to the same thread and ask for review. Pocket Genes may provide an alternative format or assisted path where feasible while a product fix is evaluated.',
        ],
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Use WCAG 2.2 Level AA as the public web target.',
          'Avoid claiming full conformance before documented evaluation.',
          'Provide feedback and alternative access paths.',
          'Track and prioritize barriers that block core account, report, consent, community, security, or support workflows.',
        ],
      },
      {
        heading: 'User, integrator, and organization responsibilities',
        bullets: [
          'Users should report barriers with enough detail to reproduce the issue.',
          'Integrators and providers should make provider reports and linked resources accessible where they control the content.',
          'Organizations should publish resources and events in accessible formats and provide alternatives when requested.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Pocket Genes cannot guarantee the accessibility of provider reports, external websites, app stores, embedded tools, or user-generated content.',
          'Some remediation requires changes by a third-party provider or native platform.',
          'Security or privacy constraints may limit assisted access until identity is verified.',
        ],
      },
      ...documentGovernanceEn([
        'Incident-Reporting Contact',
        'Privacy Policy',
        'Data-Flow Diagram',
        'Terms of Service',
      ]),
    ],
  },
  {
    slug: 'scientific-methodology',
    title: 'Scientific Methodology',
    category: 'Science',
    summary:
      'Explains how Pocket Genes separates provider findings, educational content, source review, update cadence, correction handling, third-party content, and clinical interpretation boundaries.',
    owner: 'Scientific Review',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'This methodology explains how Pocket Genes handles scientific and educational information. It distinguishes provider-supplied report findings, Pocket Genes educational explanations, glossary content, organization-published content, user-generated community content, news, events, and external resources.',
          'Pocket Genes does not present provider findings as independently generated Pocket Genes conclusions. When a report comes from a provider, the provider remains the source and authority for the findings and clinical interpretation.',
        ],
      },
      {
        heading: 'Who this document applies to',
        bullets: [
          'Users reading educational content or glossary explanations.',
          'Users accessing provider-connected reports through Pocket Genes.',
          'Trusted Organizations and publishers submitting educational resources.',
          'Providers and integrators using Pocket Genes to support post-result education.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Provider finding', body: 'A result, interpretation, variant, panel, document, or conclusion supplied by the report provider.' },
          { heading: 'Pocket Genes educational content', body: 'Content authored or curated by Pocket Genes to explain terminology, concepts, workflows, or general context.' },
          { heading: 'Organization content', body: 'Resources, events, education updates, or posts attributed to a third-party organization.' },
          { heading: 'Clinical interpretation', body: 'A medical or professional explanation of what a report means for diagnosis, treatment, screening, family planning, or clinical action.' },
          { heading: 'Correction', body: 'A content update that fixes an error, outdated source, misleading simplification, or attribution problem.' },
        ],
      },
      {
        heading: 'Types of scientific information',
        bullets: [
          'Provider-supplied report findings and provider documents.',
          'Pocket Genes glossary definitions, lessons, and plain-language explanations.',
          'Organization-published articles, events, resources, and education updates.',
          'User-generated community posts, comments, questions, and experiences.',
          'News, event listings, external resources, and support materials.',
        ],
      },
      {
        heading: 'Educational-content lifecycle',
        subsections: [
          { heading: 'Topic selection', body: 'Topics are selected based on product workflows, common report concepts, user confusion, provider or organization needs, and safety value.' },
          { heading: 'Source research', body: 'Drafting should use sources appropriate to the topic, such as government or public-health resources, recognized genetics databases actually used in the process, professional guidelines, peer-reviewed literature, provider documentation, and standard scientific terminology.' },
          { heading: 'Drafting and plain-language review', body: 'Content should explain concepts without changing source meaning, overstating certainty, or implying medical advice.' },
          { heading: 'Scientific review and approval', body: 'Material that explains scientific or clinical-adjacent concepts should be reviewed by someone with appropriate genetics, scientific, clinical, or product-safety competence before publication.' },
          { heading: 'Versioning and publication', body: 'Material changes should keep a version or review record when content is used in a regulated, consent, provider, or safety-sensitive context.' },
          { heading: 'Periodic review, correction, and retirement', body: 'Content should be reviewed on a cadence or when sources, terminology, guidelines, provider expectations, or product risk changes. Outdated content should be corrected, labeled, or removed.' },
        ],
      },
      {
        heading: 'Evidence and citations',
        paragraphs: [
          'Pocket Genes should cite or identify source categories when content makes scientific claims beyond basic definitions. Publication dates, guideline updates, source hierarchy, and conflicting evidence should be considered.',
          'When evidence is uncertain, changing, or disputed, educational content should say so in plain language. Simplification should make content easier to understand without turning uncertainty into certainty.',
        ],
      },
      {
        heading: 'Third-party organizations and user content',
        paragraphs: [
          'Trusted Organization content is attributed to the publishing organization and does not become Pocket Genes-authored scientific content merely because it appears in the app. Organization content must follow content, promotion, and safety standards.',
          'User community content reflects personal experience or opinion unless clearly identified otherwise. Community content is not scientific review, medical advice, diagnosis, or treatment guidance.',
        ],
      },
      {
        heading: 'Artificial intelligence',
        paragraphs: [
          'AI-assisted drafting, translation, summarization, categorization, or moderation support may be used only as an aid and should not publish scientific or clinical-adjacent content autonomously.',
          'Human review is required before AI-assisted educational content is presented as Pocket Genes content. Errors can be reported through the Trust Center contact and should be corrected through the content-review process.',
        ],
      },
      {
        heading: 'Clinical boundary',
        body:
          'Users should contact the report provider, qualified clinician, or genetic counselor when a report raises questions about diagnosis, treatment, screening, medication, reproductive choices, family risk, urgent symptoms, or clinical next steps.',
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Separate provider findings, Pocket Genes education, organization content, and user content.',
          'Use sources actually reviewed for the content.',
          'Communicate uncertainty and source responsibility clearly.',
          'Review, correct, label, or retire outdated educational content.',
        ],
      },
      {
        heading: 'User, provider, and organization responsibilities',
        bullets: [
          'Users should use education to prepare questions, not to self-diagnose or self-treat.',
          'Providers remain responsible for report findings and clinical interpretation.',
          'Organizations are responsible for the accuracy, sourcing, labeling, and promotional transparency of their own content.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Source availability, scientific terminology, and guidelines can change.',
          'Pocket Genes does not independently verify every provider report finding.',
          'External resources may be updated or removed by their publisher without notice to Pocket Genes.',
        ],
      },
      ...documentGovernanceEn([
        'Regulatory and Intended-Use Statement',
        'Terms of Service',
        'Community Terms',
        'Trusted Organization Standards',
      ]),
    ],
  },
  {
    slug: 'regulatory-intended-use',
    title: 'Regulatory and Intended-Use Statement',
    category: 'Science',
    summary:
      'States what Pocket Genes is intended to do, who it is for, where it is used, and what it is not intended to do.',
    owner: 'Product and Legal',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'This statement describes the intended users, environment, functions, and limitations of Pocket Genes. It helps users, providers, organizations, and reviewers understand what Pocket Genes is designed to do and what it is not designed to do.',
          'Availability, legal classification, and regulatory obligations may vary by region and by product functionality. Pocket Genes should review this statement before launching materially different clinical, diagnostic, research, or decision-support functionality.',
        ],
      },
      {
        heading: 'Who this statement applies to',
        bullets: [
          'Adults receiving or accessing genetic reports.',
          'Parents, guardians, caregivers, family members, and learners using authorized workflows.',
          'Professionals and organizations using Pocket Genes as an access, education, or engagement tool.',
          'Providers or integrators that make reports or resources available through Pocket Genes.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Intended use', body: 'The purpose and context for which Pocket Genes is designed, described, and offered.' },
          { heading: 'Intended user', body: 'The person or organization expected to use Pocket Genes for the stated purpose.' },
          { heading: 'Provider responsibility', body: 'The provider role in testing, issuing reports, determining findings, and answering report-specific clinical questions.' },
          { heading: 'Education and engagement', body: 'General information, organization, resources, community, and preparation tools that help users understand concepts and next steps.' },
        ],
      },
      {
        heading: 'Intended environment',
        body:
          'Pocket Genes is a mobile-centered consumer and patient engagement, education, access, discovery, and community platform. It is not a laboratory information system, electronic health record, emergency service, diagnostic engine, or clinical monitoring system.',
      },
      {
        heading: 'Intended functions',
        bullets: [
          'Help authorized users access provider-made reports or provider-connected report experiences.',
          'Organize access paths, report references, educational context, and related resources.',
          'Provide general education about genetic terminology and concepts.',
          'Help users discover organizations, events, resources, and education updates.',
          'Support optional RareFriends community participation.',
          'Help users prepare questions for qualified professionals.',
        ],
      },
      {
        heading: 'Provider responsibility',
        paragraphs: [
          'Providers perform testing, issue reports, determine report findings, control provider resources, and remain responsible for report accuracy and report-specific clinical interpretation.',
          'Questions about result validity, variant classification, pathogenicity, diagnostic meaning, family implications, treatment, screening, or clinical actionability should be directed to the report provider or another qualified professional.',
        ],
      },
      {
        heading: 'Pocket Genes limitations',
        bullets: [
          'Does not perform genetic testing.',
          'Does not generate laboratory results.',
          'Does not independently classify variants or determine pathogenicity.',
          'Does not calculate clinical actionability unless a specific value is provided by the source and presented as source-provided information.',
          'Does not diagnose disease or prescribe treatment.',
          'Does not provide emergency monitoring, crisis response, or urgent clinical triage.',
          'Does not guarantee that a third-party resource, organization, event, or community answer is suitable for every person.',
          'Does not replace professional medical, genetic, legal, or psychosocial advice.',
        ],
      },
      {
        heading: 'Community and third-party limitations',
        paragraphs: [
          'Peer experience, community posts, organization content, and event information do not become medical advice because they appear in Pocket Genes. Trusted Organization status is a review signal, not an endorsement of every service or claim.',
          'External provider resources may have separate terms, privacy notices, accessibility limits, support channels, and availability constraints. They may become unavailable independently of Pocket Genes.',
        ],
      },
      {
        heading: 'Children and caregivers',
        body:
          'Children, minors, and people who need assistance should use Pocket Genes through a parent, guardian, caregiver, provider, or authorized representative where required. Caregiver-managed use must respect the authority, privacy, and best-interest obligations that apply to the person whose information is managed.',
      },
      {
        heading: 'Geographic and regulatory scope',
        body:
          'Pocket Genes availability and legal status may vary by region, provider arrangement, integration type, and product function. This statement avoids a broad claim that Pocket Genes is or is not a medical device in every market. Any material expansion into diagnosis, treatment recommendation, variant interpretation, risk scoring, or clinical decision support should trigger a regulatory review.',
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Keep intended-use statements aligned with actual product functionality.',
          'Separate access, education, community, and provider report responsibilities.',
          'Review intended use before materially expanding clinical or scientific functionality.',
          'Avoid presenting education, matching, or community content as clinical advice.',
        ],
      },
      {
        heading: 'User, provider, and organization responsibilities',
        bullets: [
          'Users should seek qualified professional advice for clinical decisions.',
          'Providers remain responsible for reports and report-specific clinical interpretation.',
          'Organizations should label content accurately and avoid claims outside their authority or evidence.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'A provider-specific integration may have additional intended-use statements.',
          'A future feature may require separate regulatory analysis.',
          'Local law may impose additional restrictions or obligations.',
        ],
      },
      ...documentGovernanceEn([
        'Scientific Methodology',
        'Terms of Service',
        'Privacy Policy',
        'Data-Flow Diagram',
      ]),
    ],
  },
  {
    slug: 'trusted-organization-standards',
    title: 'Trusted Organization Standards',
    category: 'Community',
    summary:
      'Explains how Pocket Genes reviews organizations, labels content, handles promotion, investigates complaints, and limits endorsement.',
    owner: 'Trust and Community Operations',
    status: 'Published',
    ...baseDocumentMetaEn,
    sections: [
      {
        heading: 'Purpose and scope',
        paragraphs: [
          'These standards explain what Pocket Genes reviews before giving an organization a trusted place in the ecosystem and what ongoing rules apply after approval.',
          'Trusted Organizations may help people who received or are reviewing a confusing genetic report find education, resources, events, support, and better questions. Trusted status is not a commercial plan, a guarantee of quality, or an endorsement of every service or claim.',
        ],
      },
      {
        heading: 'Who these standards apply to',
        bullets: [
          'Organizations applying for or holding trusted status.',
          'Organization administrators, staff, professionals, volunteers, and publishers.',
          'Users who follow, report, or interact with organizations.',
          'Pocket Genes reviewers and moderators.',
        ],
      },
      {
        heading: 'Definitions',
        subsections: [
          { heading: 'Trusted Organization', body: 'An organization reviewed for accountable identity, mission fit, community value, content standards, and safety fit.' },
          { heading: 'Organization content', body: 'Profile text, posts, events, resources, education updates, links, images, and calls to action published through organization features.' },
          { heading: 'Promotional content', body: 'Content intended to sell, recruit, advertise, collect leads, promote a paid service, or drive users to a specific product, provider, test, event, or program.' },
          { heading: 'No-endorsement boundary', body: 'The rule that trusted status is a participation signal, not Pocket Genes approval of every claim, service, clinician, product, study, or external resource.' },
        ],
      },
      {
        heading: 'Verification and eligibility',
        bullets: [
          'The organization must have a clear public identity, accountable contact, real mission, and relevant relationship to genetics, rare disease, patient support, education, research, care navigation, advocacy, or related resources.',
          'Pocket Genes may review public website, leadership or administrator identity, contact information, mission, jurisdiction, conflicts, content examples, privacy posture, and community value.',
          'Organizations must be able to explain who publishes content, who reviews content, how users can contact them, and how promotional or sponsored material is identified.',
        ],
      },
      {
        heading: 'Review criteria',
        bullets: [
          'Identity and accountability.',
          'Relevant community value after a genetic result or during a rare-disease journey.',
          'Content usefulness, readability, source quality, and review process.',
          'Privacy boundaries and refusal to pressure users for private reports or codes.',
          'Separation between education, support, patient engagement, fundraising, promotion, and medical services.',
          'Ability to respond to complaints or corrections.',
        ],
      },
      {
        heading: 'Content labeling and promotion',
        paragraphs: [
          'Organization content must identify the publisher. Promotional material, sponsored content, fundraising, recruitment, commercial programs, clinical-service promotion, or paid opportunities must be labeled clearly and not disguised as neutral education or peer support.',
          'Organizations must not use fear, urgency, diagnosis uncertainty, caregiver stress, or rare-disease vulnerability to pressure users into buying services, sharing private reports, joining external groups, or sending personal information outside Pocket Genes.',
        ],
      },
      {
        heading: 'Ongoing review, complaints, and enforcement',
        paragraphs: [
          `Users can complain about an organization by reporting content in the product where available or emailing ${POCKET_GENES_EMAILS.trust}. Useful reports include the organization name, content link or screenshot, date, concern, and any privacy or safety risk.`,
          'Pocket Genes may periodically review trusted status, request corrections, add labels, remove content, pause publishing, suspend trusted status, remove an organization, or require re-application when standards are not met.',
        ],
      },
      {
        heading: 'No endorsement',
        body:
          'Trusted status means Pocket Genes reviewed the organization for participation fit. It does not mean Pocket Genes endorses every article, event, provider, professional, resource, treatment claim, product, fundraising campaign, study, trial, or service connected to that organization.',
      },
      {
        heading: 'Pocket Genes responsibilities',
        bullets: [
          'Review organizations before assigning trusted status.',
          'Provide clear labeling and complaint paths.',
          'Act on organization reports proportionally to risk.',
          'Suspend or remove trusted status when privacy, safety, promotion, identity, or content standards are violated.',
        ],
      },
      {
        heading: 'Organization responsibilities',
        bullets: [
          'Maintain accurate identity, contact, and mission information.',
          'Publish useful and reviewed content appropriate for patients, families, caregivers, and people newly trying to understand results.',
          'Respect privacy boundaries and do not request private report links or codes through community content.',
          'Label promotion and conflicts clearly.',
          'Cooperate with corrections, complaints, and periodic review.',
        ],
      },
      {
        heading: 'Exceptions and limitations',
        bullets: [
          'Pocket Genes review is not a professional license verification unless a specific workflow says so.',
          'Pocket Genes may not review every external page linked by an organization in real time.',
          'Local laws, professional rules, and provider obligations may impose additional requirements on an organization.',
        ],
      },
      ...documentGovernanceEn([
        'Community Terms',
        'Community Safety Policy',
        'Privacy Policy',
        'Scientific Methodology',
        'Terms of Service',
      ]),
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
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Esta Política de Privacidad explica cómo Pocket Genes procesa información personal en la aplicación móvil, las páginas públicas, el Centro de confianza, los flujos de cuenta, las integraciones de acceso a informes, las funciones de descubrimiento, las funciones de organizaciones de confianza y RareFriends by Pocket Genes.',
          'Pocket Genes procesa información limitada de cuenta y contacto, autenticación, integración, consentimiento, técnica, soporte y comunidad según las funciones que cada persona usa. No publicamos una afirmación absoluta de que Pocket Genes nunca procesa datos sensibles, porque la participación comunitaria, los campos de matching de RareFriends, las referencias de acceso a informes y el contexto voluntario pueden revelar información de salud o genética.',
          'Los informes genéticos permanecen asociados al proveedor participante que los creó o entregó. Pocket Genes ayuda a usuarios autorizados a llegar a la experiencia móvil conectada con ese proveedor. Cualquier URL, token, referencia o identificador de informe tratado por Pocket Genes se maneja como información confidencial de acceso aunque no sea el informe en sí.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Personas que crean o usan una cuenta de Pocket Genes.',
          'Personas invitadas a un flujo de Pocket Genes por un integrador, proveedor, clínica, laboratorio, organización o programa de apoyo.',
          'Madres, padres, tutores, cuidadores o representantes que gestionan una cuenta o flujo para otra persona cuando corresponde.',
          'Personas que participan en RareFriends, siguen organizaciones, publican, comentan, envían mensajes o usan funciones de matching.',
          'Organizaciones de confianza, integradores y proveedores de informes que aportan datos de contacto, publican contenido u operan flujos conectados con Pocket Genes.',
        ],
      },
      {
        heading: 'Quién controla la información',
        table: {
          headers: ['Campo', 'Valor público actual'],
          rows: [
            ['Operador/responsable', POCKET_GENES_OPERATOR.legalName],
            ['País', POCKET_GENES_OPERATOR.country],
            ['Producto', POCKET_GENES_OPERATOR.productName],
            ['Contacto de privacidad', POCKET_GENES_OPERATOR.privacyContact],
            ['Contacto de seguridad', POCKET_GENES_OPERATOR.securityContact],
            ['Contacto de accesibilidad', POCKET_GENES_OPERATOR.accessibilityContact],
            ['Representante de protección de datos o DPO', 'No se designa por separado en este Centro de confianza. Las solicitudes se canalizan por el contacto de privacidad.'],
          ],
        },
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Información personal', body: 'Información referida a una persona identificada o identificable, incluyendo datos de cuenta, contacto, técnicos, integración, consentimiento, soporte y comunidad.' },
          { heading: 'Información de cuenta', body: 'Nombre, apellido, email, teléfono opcional, identificador de cuenta, preferencias de perfil, idioma y otros datos usados para crear, mantener, proteger o asistir una cuenta de Pocket Genes.' },
          { heading: 'Información de integración', body: 'Información limitada provista por una organización participante o generada por Pocket Genes para conectar a la persona prevista con un flujo de acceso a informes, invitación, consentimiento u organización.' },
          { heading: 'Registro de consentimiento', body: 'Registro que identifica el propósito, la versión del documento o flujo, el estado, la fecha y la cuenta, proveedor u organización relacionados cuando corresponde.' },
          { heading: 'Información comunitaria', body: 'Campos de perfil, publicaciones, comentarios, seguimientos, grupos, mensajes, intereses, etiquetas, rol, país, idioma, etapa del recorrido y otra información que el usuario agrega voluntariamente a RareFriends o funciones comunitarias.' },
          { heading: 'Información técnica', body: 'Datos de dispositivo, navegador, app, autenticación, registros, diagnóstico, seguridad y operación necesarios para operar y proteger el servicio.' },
          { heading: 'Proveedor de informes', body: 'Laboratorio, clínica, hospital, empresa de estudios genéticos, organización de EPOF u otra entidad participante que crea, entrega, controla o conserva responsabilidad sobre un informe o recurso de informe.' },
          { heading: 'Organización de confianza', body: 'Organización revisada por Pocket Genes para una presencia curada. No implica aval total de cada servicio, afirmación, evento o recurso.' },
          { heading: 'Proveedor de servicio', body: 'Proveedor que procesa información para Pocket Genes, como infraestructura, autenticación, base de datos, hosting, diagnóstico, soporte, agenda o comunicaciones.' },
        ],
      },
      {
        heading: 'Tabla de procesamiento',
        table: {
          headers: ['Categoría', 'Ejemplos', 'Fuente', 'Propósito', 'Compartido con', 'Retención'],
          rows: [
            ['Datos de cuenta', 'Nombre, apellido, email, teléfono opcional, idioma, preferencias e identificador de cuenta.', 'Usuario, cuidador, representante autorizado o integrador cuando inicia una invitación.', 'Crear cuenta, comunicar, dar soporte, enrutar acceso a informes y preservar seguridad.', 'Proveedores de infraestructura y personal autorizado con necesidad de acceso.', 'Mientras la cuenta esté activa; luego eliminación o desidentificación por el flujo de eliminación, con límites legales, de seguridad, backup y fraude.'],
            ['Autenticación', 'ID de Firebase, registros de login, sesión, recuperación de contraseña y eventos de seguridad.', 'Usuario, dispositivo, Firebase Authentication y backend de Pocket Genes.', 'Inicio de sesión, recuperación, protección de sesión, prevención de abuso y control de acceso.', 'Google Firebase y sistemas de Pocket Genes que verifican identidad y sesiones.', 'Durante el período de cuenta y seguridad necesario para operar autenticación, investigar abuso y cumplir ciclos de logs del proveedor.'],
            ['Datos de integración', 'Proveedor u organización, estado de invitación, referencia de acceso, código de informe, referencia de proveedor y campos de contacto.', 'Integrador, proveedor, Pocket Genes o usuario durante onboarding.', 'Conectar a la persona con la experiencia autorizada, flujo de consentimiento, acceso a informe o flujo de organización.', 'Backend, base de datos, autenticación e infraestructura relevantes; el integrador de origen solo cuando sea necesario.', 'El comportamiento actual se vincula a finalización, rechazo, revocación, eliminación de cuenta o limpieza manual. No se publica vencimiento automático salvo que una integración lo indique.'],
            ['Consentimientos', 'Propósito, versión, estado, fecha, flujo, cuenta y referencia de proveedor u organización.', 'Acción del usuario, cuidador o representante y registros de Pocket Genes.', 'Documentar autorización, aceptación de privacidad, acceso a experiencia de proveedor, consentimiento informado y comunicaciones opcionales.', 'Proveedores de infraestructura y revisores internos que necesitan el registro.', 'Puede sobrevivir a datos temporales de contacto si hace falta probar la decisión, auditar, resolver disputas o cumplir obligaciones.'],
            ['Datos comunitarios', 'Perfil, nickname, rol, país, idioma, etiquetas de gen/condición/síntoma, etapa, publicaciones, comentarios, grupos, mensajes y bloqueos.', 'Usuario, interacciones comunitarias y moderación.', 'Participación, matching, moderación, seguridad, reportes, controles de usuario y soporte.', 'Otros usuarios según visibilidad; infraestructura; moderadores cuando corresponde.', 'Hasta eliminación del usuario o cuenta, remoción por moderación, cierre del flujo o retención por seguridad/legal.'],
            ['Datos técnicos', 'Dispositivo, navegador, versión de app, logs, errores, eventos de seguridad y datos operativos derivados de IP.', 'Dispositivo, navegador, app, infraestructura y backend.', 'Confiabilidad, seguridad, diagnóstico, prevención de abuso, auditoría e incidentes.', 'AWS, Firebase, proveedores de diagnóstico u hosting cuando se usen y operadores autorizados.', 'Durante ciclos de logs del proveedor, ventanas de investigación, registros de incidente o análisis operativo desidentificado.'],
          ],
        },
      },
      {
        heading: 'Información recibida de integradores',
        paragraphs: [
          'Un proveedor, laboratorio, clínica, organización de pacientes, programa de apoyo u otro integrador puede aportar información limitada de contacto o identificación para iniciar una invitación, acceso a informe, consentimiento o flujo de recursos. Puede incluir nombre, apellido, email, teléfono cuando corresponda, organización o proveedor, estado de invitación y referencia para conectar el flujo.',
          'Pocket Genes usa esa información para contacto de servicio y configuración del flujo. Recibir una invitación no crea automáticamente participación comunitaria, no publica información, no acepta todos los términos por la persona invitada ni da acceso general al integrador sobre la actividad posterior en Pocket Genes.',
          'La persona recibe información durante la invitación u onboarding sobre quién aportó los datos, por qué Pocket Genes los recibió, qué consentimiento o autorización se solicita y cómo rechazar, oponerse o pedir eliminación cuando corresponda.',
        ],
      },
      {
        heading: 'Qué significa consentimiento',
        body:
          'Pocket Genes registra consentimientos por propósito y versión. Una fecha aislada no alcanza si no puede conectarse con el documento, flujo y decisión que registra.',
        subsections: [
          { heading: 'Consentimiento de contacto', body: 'Permiso para que Pocket Genes contacte por una invitación, proceso de acceso, soporte, flujo de organización o comunicación solicitada.' },
          { heading: 'Aceptación de privacidad y términos', body: 'Aceptación de documentos aplicables a crear o usar una cuenta. No es consentimiento médico o de investigación.' },
          { heading: 'Autorización de experiencia de proveedor', body: 'Autorización para conectar al usuario con una experiencia de acceso a informe o recurso del proveedor.' },
          { heading: 'Consentimientos informados', body: 'Registro específico de un flujo de proveedor, estudio, proceso clínico, investigación o apoyo cuando se presenta un documento mediante Pocket Genes.' },
          { heading: 'Comunidad y comunicaciones opcionales', body: 'Opciones separadas para RareFriends, visibilidad de perfil, campos de matching, seguimientos, grupos, publicaciones, mensajes, eventos, newsletter u otras comunicaciones opcionales.' },
        ],
      },
      {
        heading: 'Acceso a informes y referencias confidenciales',
        paragraphs: [
          'El proveedor participante conserva responsabilidad por el informe, los hallazgos, la interpretación científica o clínica y el camino de entrega bajo su control. Pocket Genes responde por las capas de cuenta, integración, acceso, consentimiento y experiencia que opera.',
          'Según la integración, Pocket Genes puede recibir o crear un código de informe, referencia de proveedor, URL, token, estado de acceso o identificador similar. Estos elementos se tratan como información confidencial de acceso y no deben publicarse en comunidad, perfiles, analytics, capturas o logs salvo necesidad estricta de soporte o seguridad.',
          'Cuando un enlace o referencia vence o puede revocarse, ese camino debe reflejarse en el flujo de usuario o acuerdo con el proveedor. Un recurso de proveedor puede dejar de estar disponible por decisiones del proveedor fuera de Pocket Genes.',
        ],
      },
      {
        heading: 'Privacidad comunitaria',
        paragraphs: [
          'La participación en RareFriends es voluntaria y separada del acceso privado a informes. Crear cuenta, ver un informe, seguir una organización o unirse a RareFriends no publica automáticamente un informe privado.',
          'La información comunitaria que una persona agrega puede revelar contexto de salud o genética. El matching puede usar campos voluntarios de gen, condición, síntoma, país, idioma, rol, interés o etapa cuando esas funciones están activas. La visibilidad depende de la función, configuración, reglas del grupo y moderación.',
        ],
      },
      {
        heading: 'Proveedores, transferencias, cookies y tracking',
        paragraphs: [
          'Pocket Genes usa proveedores establecidos, incluidos Amazon Web Services y Google Firebase, para operar distintos componentes. La lista de proveedores que procesan datos identifica proveedores públicos y categorías de información.',
          'Algunos proveedores pueden procesar información fuera del país del usuario. Pocket Genes sigue siendo responsable de seleccionar, configurar y operar su aplicación de forma segura aun cuando la nube aporta seguridad de infraestructura.',
          'Pocket Genes no publica en este Centro de confianza un modelo de venta de información personal o uso publicitario de datos de usuarios de Pocket Genes. Si se introducen o amplían cookies, analytics, crash reporting, notificaciones push, atribución o marketing, Pocket Genes debe identificar herramienta, propósito, opción y retención en el aviso correspondiente.',
        ],
      },
      {
        heading: 'Derechos y proceso de solicitudes',
        paragraphs: [
          `Los usuarios pueden escribir a ${POCKET_GENES_EMAILS.trust} para solicitar acceso, corrección, eliminación, retiro de consentimiento cuando corresponda, cierre de cuenta o información sobre una fuente de integración.`,
          'Pocket Genes revisa la solicitud, verifica identidad cuando hace falta, determina si la información está bajo control de Pocket Genes o de un proveedor y explica la acción o limitación esperada. Una solicitud puede limitarse si afecta la privacidad de otra persona, el informe queda bajo responsabilidad del proveedor, hay retención legal o de seguridad, investigación activa o necesidad de hacer cumplir términos.',
          'Cuando aplica la ley argentina de protección de datos, las personas pueden tener derechos de acceso, rectificación, actualización o supresión y pueden acudir a la Agencia de Acceso a la Informacion Publica si la solicitud no se resuelve según corresponda. Cuando aplica GDPR u otra ley, pueden existir derechos o vías de reclamo adicionales.',
        ],
      },
      {
        heading: 'Niñez, cuidadores, comunicaciones opcionales y matching',
        bullets: [
          'Niñas, niños, adolescentes y menores deben usar Pocket Genes mediante madre, padre, tutor, cuidador, proveedor u otro arreglo autorizado cuando la ley o configuración lo requiera.',
          'Las cuentas gestionadas por cuidadores deben respetar autoridad y privacidad de la persona cuya información se administra.',
          'Las comunicaciones de servicio se limitan a cuenta, soporte, invitación, consentimiento, acceso a informe, seguridad, accesibilidad, incidentes y operación.',
          'Newsletters, eventos, novedades de organizaciones o marketing opcional deben tener un camino claro de aceptación o baja.',
          'El matching o recomendaciones en RareFriends debe apoyarse en campos aportados o permitidos por el usuario y no presentarse como diagnóstico, tratamiento, priorización clínica ni aval.',
          'Los cambios de esta política se publican en el Centro de confianza. Los cambios materiales deben comunicarse por un aviso de producto o cuenta cuando corresponda.',
        ],
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Procesar solo la información necesaria para la función, integración, soporte, seguridad o propósito comunitario.',
          'Mantener separado el acceso privado a informes de la participación pública o comunitaria.',
          'Proteger referencias, tokens, códigos e identificadores de proveedor como información confidencial de acceso.',
          'Configurar proveedores, autenticación, acceso, logs, moderación y soporte con salvaguardas adecuadas.',
          'Mantener canales de solicitudes, eliminación, incidentes, accesibilidad y moderación.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios, integradores y organizaciones',
        bullets: [
          'Los usuarios deben proteger credenciales, evitar publicar enlaces o códigos de informes, elegir cuidadosamente qué compartir y usar los canales de solicitud.',
          'Los integradores deben tener autoridad para aportar datos de contacto o identificación y brindar contexto de fuente, propósito y consentimiento.',
          'Las organizaciones de confianza deben etiquetar promoción, evitar presión médica, respetar privacidad y no usar la comunidad para inferir o recolectar información privada de informes.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Pocket Genes no puede eliminar un informe o historia clínica controlada por el proveedor.',
          'La información eliminada puede permanecer brevemente en backups o logs hasta rotación o restauración.',
          'Pueden conservarse registros de moderación, incidentes, fraude, legales, auditoría o seguridad cuando sea necesario.',
          'Informes de terceros, tiendas de apps, sitios externos, herramientas de reserva o recursos embebidos pueden tener sus propias prácticas.',
        ],
      },
      ...documentGovernanceEs([
        'Proveedores que procesan datos',
        'Política de Retención y Eliminación de Datos',
        'Diagrama de Flujo de Datos',
        'Resumen de Seguridad',
        'Términos de Comunidad',
        'Política de Seguridad Comunitaria',
        'Términos de Servicio',
      ]),
    ],
  },
  {
    slug: 'terms-of-service',
    title: 'Términos de Servicio',
    category: 'Términos del producto',
    summary:
      'Define condiciones de uso, responsabilidades de cuenta, límites del producto, propiedad intelectual, contenido aceptable, límites de organizaciones de confianza y disputas.',
    owner: 'Producto y legal',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          `Estos Términos de Servicio rigen el acceso y uso de Pocket Genes, un producto operado por ${POCKET_GENES_OPERATOR.legalName} en ${POCKET_GENES_OPERATOR.country}. Al crear una cuenta, aceptar los Términos en un flujo, usar Pocket Genes, participar en RareFriends o usar una experiencia de acceso a informes, el usuario acepta estos Términos en lo aplicable.`,
          'Una invitación de un proveedor, integrador u organización inicia un flujo de servicio. Recibir una invitación no significa por sí solo que la persona invitada aceptó todos los términos de Pocket Genes, se unió a RareFriends, autorizó comunicaciones opcionales o aceptó publicar información.',
        ],
      },
      {
        heading: 'A quién se aplican',
        bullets: [
          'Titulares de cuentas y visitantes de páginas públicas de Pocket Genes.',
          'Personas invitadas por proveedor, laboratorio, clínica, organización, programa de apoyo, cuidador o representante autorizado.',
          'Madres, padres, tutores, cuidadores o representantes que usan Pocket Genes para otra persona cuando está permitido.',
          'Miembros de RareFriends, personas que publican, comentan, envían mensajes o siguen contenido.',
          'Organizaciones de confianza, integradores, editores y profesionales que usan funciones comunitarias u organizacionales.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Pocket Genes', body: 'Producto móvil, páginas públicas, Centro de confianza, cuentas, acceso a informes, educación, descubrimiento, organizaciones y comunidad controlados por Pocket Genes.' },
          { heading: 'Usuario', body: 'Persona que accede o usa Pocket Genes directamente o mediante un cuidador, tutor, representante u organización autorizada.' },
          { heading: 'Informe de proveedor', body: 'Informe genético, hallazgo, archivo, recurso o experiencia de acceso creada, entregada o controlada por un proveedor independiente.' },
          { heading: 'RareFriends', body: 'Capa comunitaria opcional conectada a Pocket Genes.' },
          { heading: 'Organización de confianza', body: 'Organización revisada para una presencia curada en Pocket Genes, sujeta a estándares y moderación.' },
          { heading: 'Contenido de usuario', body: 'Campos de perfil, publicaciones, comentarios, mensajes, reportes, feedback, envíos de organizaciones u otro contenido provisto por usuarios u organizaciones.' },
        ],
      },
      {
        heading: 'Elegibilidad y cuentas',
        paragraphs: [
          'Los usuarios deben poder usar Pocket Genes legalmente en su ubicación y brindar información de cuenta precisa. Si una persona no tiene edad o capacidad legal para aceptar estos Términos sola, debe intervenir madre, padre, tutor, cuidador, proveedor u otra persona autorizada cuando corresponda.',
          'Los usuarios son responsables de proteger credenciales y dispositivos, usar información verdadera, evitar compartir cuentas y reportar usos no autorizados. Pocket Genes puede requerir recuperación de cuenta, verificación de identidad o controles adicionales antes de restaurar acceso o cambiar información sensible.',
        ],
      },
      {
        heading: 'Descripción del servicio',
        paragraphs: [
          'Pocket Genes puede brindar acceso móvil a informes conectados con proveedores, educación sobre conceptos genéticos, glosario y lecciones, descubrimiento de organizaciones, recursos y eventos, contenido de organizaciones de confianza, RareFriends, flujos de consentimiento, soporte y comunicaciones opcionales.',
          'Las funciones pueden variar por región, versión de app, estado de cuenta, disponibilidad del proveedor, participación de organizaciones, configuración de integración y elecciones del usuario. Pocket Genes puede cambiar, pausar, discontinuar o limitar funciones por razones de producto, seguridad, cumplimiento, abuso, proveedor u operación.',
        ],
      },
      {
        heading: 'Informes y proveedores externos',
        paragraphs: [
          'Los informes genéticos se originan en proveedores independientes. El proveedor es responsable de pruebas, exactitud, hallazgos, interpretación clínica, entrega y recursos bajo su control. Pocket Genes no reemplaza el informe ni la relación con el proveedor.',
          'Pocket Genes puede organizar acceso, mostrar una experiencia móvil autorizada, conectar educación alrededor de conceptos o brindar un camino de acceso. Pocket Genes no modifica los hallazgos originales del proveedor salvo que una integración específica declare una experiencia editada o transformada bajo control del proveedor.',
          'Los enlaces, portales, documentos, servicios de laboratorio o clínicos y recursos externos del proveedor pueden tener términos, privacidad, disponibilidad y soporte propios. Pocket Genes no garantiza disponibilidad continua de recursos controlados por proveedores.',
        ],
      },
      {
        heading: 'Responsabilidades de integradores',
        paragraphs: [
          'Un integrador que aporta nombres, emails, teléfonos, referencias de proveedor, códigos de informe o invitaciones debe estar autorizado, brindar información precisa, explicar fuente y propósito cuando corresponda y no usar Pocket Genes para contactar personas sin base válida.',
          'El acceso del integrador a un flujo no le da visibilidad irrestricta de actividad posterior de cuenta, RareFriends, seguimientos, mensajes, publicaciones o acceso privado a informes salvo que el producto y los avisos aplicables lo permitan expresamente.',
        ],
      },
      {
        heading: 'Consentimiento e invitaciones',
        bullets: [
          'Una invitación puede permitir crear cuenta, confirmar identidad, autorizar acceso a informe, revisar consentimiento o decidir si continuar.',
          'Los registros de consentimiento deben identificar propósito, versión, estado, fecha y proveedor u organización relacionados cuando corresponda.',
          'Rechazar o ignorar una invitación puede impedir que el flujo continúe, pero no debe crear participación comunitaria ni comunicaciones opcionales.',
          'Retirar consentimiento puede detener flujos futuros, pero no borrar registros de proveedor, procesamiento previo válido, registros de seguridad o evidencia legal/auditoría.',
        ],
      },
      {
        heading: 'Naturaleza no médica',
        paragraphs: [
          'Pocket Genes es un producto de acceso, educación, organización, descubrimiento y comunidad. No realiza estudios genéticos, no clasifica variantes de forma independiente, no diagnostica, no prescribe, no determina accionabilidad clínica, no monitorea emergencias ni reemplaza profesionales, asesores genéticos, laboratorios o proveedores.',
          'El contenido educativo, experiencias comunitarias y publicaciones de organizaciones pueden ayudar a entender conceptos o preparar preguntas. No son consejo médico. Los usuarios deben consultar al proveedor o profesional calificado por diagnóstico, tratamiento, riesgo, planificación familiar, estudios o decisiones médicas.',
        ],
      },
      {
        heading: 'Uso aceptable',
        bullets: [
          'No intentes acceso no autorizado, compartir credenciales, publicar enlaces/códigos privados, scraping, extracción masiva, ingeniería inversa restringida o evasión de controles.',
          'No suplantes personas u organizaciones, no cargues datos falsos, no uses datos de otra persona sin autoridad ni crees cuentas para evadir moderación.',
          'No acoses, amenaces, averguences, explotes, presiones o ataques por contexto de salud, genética, discapacidad, familia, cuidado, país, idioma o identidad.',
          'No publiques contenido ilegal, informes ajenos, enlaces privados, historias clínicas, identificadores, pistas de reidentificación, spam, estafas, curas fraudulentas ni instrucciones médicas peligrosas.',
          'No uses Pocket Genes para recolectar información médica o genética privada fuera de la función prevista ni para trasladar conversaciones privadas fuera de la plataforma sin permiso.',
        ],
      },
      {
        heading: 'Comunidad y organizaciones de confianza',
        paragraphs: [
          'RareFriends se rige por estos Términos, los Términos de Comunidad y la Política de Seguridad Comunitaria. Los usuarios eligen qué compartir y son responsables de su contenido e interacciones.',
          'La condición de organización de confianza significa que Pocket Genes revisó identidad, relevancia, encaje de contenido y expectativas de seguridad. No es aval total de cada afirmación, servicio, producto, evento, publicación, proveedor, profesional o recurso externo.',
        ],
      },
      {
        heading: 'Contenido de usuario y propiedad intelectual',
        paragraphs: [
          'Usuarios y organizaciones conservan la titularidad del contenido que aportan, sujeto a derechos de proveedores, editores, empleadores o terceros. Al enviar contenido a Pocket Genes, otorgan los derechos limitados necesarios para alojar, mostrar, formatear, traducir, moderar, retirar, preservar y operar ese contenido dentro del producto y flujos de seguridad.',
          'Pocket Genes y sus licenciantes son titulares del producto, software, interfaz, diseño, marca, contenido educativo propio y propiedad intelectual relacionada. Los proveedores controlan sus informes y materiales. Las organizaciones controlan su contenido sujeto a reglas de publicación.',
          'Después del cierre de cuenta, el contenido puede eliminarse, ocultarse, conservarse por moderación/legal o preservarse en registros operativos desidentificados según la función y política aplicable.',
        ],
      },
      {
        heading: 'Disponibilidad, suspensión y terminación',
        paragraphs: [
          'Pocket Genes puede hacer mantenimiento, actualizar funciones, suspender integraciones, cambiar elegibilidad, retirar contenido, restringir cuentas, suspender organizaciones o finalizar acceso por seguridad, cumplimiento, abuso, requisitos de proveedor, falta de pago cuando aplique o violación de estos Términos.',
          'La suspensión o terminación puede afectar cuenta, visibilidad comunitaria, publicación de organizaciones, caminos de acceso a informes, soporte y contenido. Pocket Genes puede ofrecer apelación o revisión cuando la decisión no sea urgente, abusiva, legalmente restringida o sensible de seguridad.',
        ],
      },
      {
        heading: 'Descargos, responsabilidad, disputas y ley aplicable',
        paragraphs: [
          'Pocket Genes se proporciona en la medida permitida por la ley aplicable sin garantía de que cada función sea ininterrumpida, libre de errores, compatible con todo dispositivo, disponible en toda región o adecuada para cada necesidad médica, científica o comunitaria.',
          `En la medida permitida por la ley, ${POCKET_GENES_OPERATOR.legalName} no responde por exactitud de informes de proveedores, recursos externos, servicios de organizaciones, contenido de usuarios, decisiones comunitarias fuera de Pocket Genes ni decisiones médicas tomadas sin asesoramiento profesional calificado.`,
          `Estos Términos se rigen por las leyes de ${POCKET_GENES_OPERATOR.country}, salvo que normas obligatorias de consumo, privacidad, salud u otras en la ubicación del usuario exijan otra regla. Los usuarios pueden escribir a ${POCKET_GENES_EMAILS.trust} antes de escalar una disputa.`,
        ],
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Operar cuentas, acceso, consentimiento, educación, descubrimiento, comunidad y soporte según los límites publicados.',
          'Separar acceso privado a informes de participación comunitaria opcional.',
          'Mantener procesos razonables de seguridad, moderación, solicitudes, accesibilidad e incidentes.',
          'Etiquetar suficientemente la fuente de contenido de proveedores, organizaciones, comunidad y Pocket Genes.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios, integradores y organizaciones',
        bullets: [
          'Los usuarios deben usar legalmente, brindar datos precisos, proteger credenciales, compartir con cuidado y respetar la comunidad.',
          'Los integradores responden por autoridad, exactitud, avisos de fuente, obligaciones de proveedor y límites de visibilidad posterior.',
          'Las organizaciones responden por identidad, calidad de contenido, etiquetado promocional, conflictos, privacidad y cooperación con revisión o moderación.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Recursos de proveedores, tiendas de apps, sitios externos, widgets y servicios de organizaciones pueden tener términos propios.',
          'Pocket Genes no controla cada informe de proveedor, documento externo, recurso o declaración de usuario.',
          'Algunos derechos y obligaciones varían por ubicación, acuerdo de proveedor, superficie, cuidador o ley aplicable.',
        ],
      },
      ...documentGovernanceEs([
        'Política de Privacidad',
        'Términos de Comunidad',
        'Política de Seguridad Comunitaria',
        'Estándares de Organizaciones de Confianza',
        'Declaración Regulatoria y de Uso Previsto',
        'Metodología Científica',
      ]),
    ],
  },
  {
    slug: 'community-terms',
    title: 'Términos de Comunidad',
    category: 'Comunidad',
    summary:
      'Establece las reglas de RareFriends by Pocket Genes, incluyendo identidad, visibilidad, participación respetuosa, límites médicos y derechos sobre contenido.',
    owner: 'Operaciones comunitarias',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Estos Términos de Comunidad rigen RareFriends by Pocket Genes y toda función que permita crear perfiles, unirse a grupos, seguir organizaciones, publicar, comentar, enviar mensajes, reportar contenido o participar en matching.',
          'RareFriends busca permitir conexión cuidadosa, educación, descubrimiento y próximos pasos prácticos sin convertir informes genéticos privados en contenido público.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Personas que crean o ven perfiles de RareFriends.',
          'Personas que publican, comentan, envían mensajes, siguen, bloquean, reportan, se unen a grupos o usan matching.',
          'Cuidadores y representantes que participan por otra persona cuando está permitido.',
          'Profesionales y organizaciones que participan en comunidad o funciones de organizaciones de confianza.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Perfil comunitario', body: 'Identidad y campos opcionales que un miembro decide mostrar en RareFriends.' },
          { heading: 'Campos de matching', body: 'Campos opcionales de gen, condición, síntoma, rol, país, idioma, etapa, interés o grupo usados para encontrar personas o recursos relevantes.' },
          { heading: 'Acceso privado a informes', body: 'Funcionalidad de acceso a informes separada de RareFriends salvo que el usuario comparta información intencionalmente.' },
          { heading: 'Participación pseudónima', body: 'Uso de nickname o perfil limitado en lugar de identidad pública completa cuando la función lo permite.' },
          { heading: 'Contenido de organización', body: 'Publicaciones, eventos, recursos, novedades educativas o material de perfil publicado por una organización o cuenta profesional.' },
        ],
      },
      {
        heading: 'Elegibilidad e identidades',
        paragraphs: [
          'La comunidad puede estar disponible para personas afectadas, familiares, cuidadores, aprendices, profesionales y organizaciones según disponibilidad y configuración. No se permite suplantar usuarios, clínicos, investigadores, proveedores, organizaciones o representantes de Pocket Genes.',
          'El nombre real no es obligatorio para toda interacción comunitaria salvo que un flujo, proveedor, requisito legal o revisión organizacional requiera identidad verificable. Las cuentas múltiples pueden restringirse si evaden moderación o confunden a otros.',
        ],
      },
      {
        heading: 'Visibilidad comunitaria',
        bullets: [
          'Algunos campos de perfil pueden ser visibles para otros usuarios según configuración.',
          'La participación en grupos puede ser visible dentro del grupo y para moderadores.',
          'Publicaciones y comentarios pueden ser visibles para la audiencia elegida por la función o grupo.',
          'Los mensajes directos no son públicos, pero pueden revisarse cuando son reportados o necesarios por seguridad o ley.',
          'El matching puede usar campos opcionales como gen, condición, síntoma, país, idioma, rol y etapa.',
          'El acceso privado a informes no es automáticamente visible para miembros, seguidores, organizaciones o integradores.',
        ],
      },
      {
        heading: 'Opciones y controles del usuario',
        bullets: [
          'Los usuarios pueden decidir participar en RareFriends por separado del acceso a informes.',
          'Deben poder gestionar campos de perfil, etiquetas, grupos, seguimientos, bloqueos, reportes y eliminación de contenido cuando la función lo soporte.',
          'Nadie debe presionar para compartir variantes exactas, informes completos, contacto, ubicación, historia familiar o identidad.',
          'Salir de un grupo, bloquear, eliminar contenido o cerrar cuenta puede no retirar todos los registros de moderación, legales, backup o seguridad.',
        ],
      },
      {
        heading: 'Conversaciones médicas y científicas',
        paragraphs: [
          'Los miembros pueden compartir experiencias, apoyo práctico, preguntas para consultas y educación general. No deben presentar mensajes comunitarios como diagnóstico, tratamiento, emergencia, asesoramiento genético o reemplazo del cuidado profesional.',
          'Profesionales y organizaciones deben distinguir educación general de consejo profesional, revelar promoción o patrocinio, evitar afirmaciones no respaldadas y no usar la confianza comunitaria para solicitar agresivamente a usuarios vulnerables.',
        ],
      },
      {
        heading: 'Reglas de privacidad',
        bullets: [
          'No compartas informes, historias clínicas, mensajes privados, identificadores, enlaces o códigos de otra persona sin permiso.',
          'No hagas doxxing, reidentificación, scraping, exportación, republicación o combinación de datos comunitarios para identificar personas fuera de la función prevista.',
          'No presiones para revelar diagnóstico, variante, historia familiar, síntomas, país, contacto, proveedor o contenido de informe.',
          'No lleves conversaciones privadas fuera de Pocket Genes sin permiso ni uses contacto externo para evadir bloqueos o moderación.',
        ],
      },
      {
        heading: 'Comportamiento comercial y organizaciones',
        paragraphs: [
          'Organizaciones y profesionales pueden publicar educación, recursos, eventos, programas, apoyo y material de participación según las reglas de su cuenta. El contenido promocional debe estar claramente etiquetado y no disfrazarse de educación neutral o apoyo entre pares.',
          'La solicitud agresiva, mensajes basados en miedo, curas no respaldadas, pedidos de informes privados o intentos de recolectar información de salud o genética fuera del flujo previsto pueden causar remoción, límites de cuenta o revisión de organización de confianza.',
        ],
      },
      {
        heading: 'Contenido y moderación',
        paragraphs: [
          'Los usuarios conservan la titularidad de su contenido pero otorgan a Pocket Genes derechos limitados para alojar, mostrar, formatear, traducir, moderar, remover, preservar y operar la comunidad. Cada usuario responde por exactitud, legalidad e impacto de privacidad de lo que publica.',
          'Pocket Genes puede remover contenido, reducir visibilidad, agregar etiquetas, cerrar un hilo, deshabilitar mensajes, restringir funciones, suspender cuentas, remover organizaciones o preservar registros por seguridad, privacidad, ley o comunidad.',
        ],
      },
      {
        heading: 'Salir de RareFriends',
        paragraphs: [
          'Una persona puede detener participación comunitaria por separado del acceso privado a informes. Salir puede ocultar o eliminar perfil, terminar matching, remover seguimientos, salir de grupos, desactivar mensajes e iniciar eliminación o desidentificación de registros comunitarios.',
          'Algunas publicaciones, comentarios, reportes, registros de moderación o metadatos de mensajes pueden permanecer temporalmente o por más tiempo por seguridad, ley, disputas o backups.',
        ],
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Mantener separada la comunidad del acceso privado a informes.',
          'Brindar reportes, bloqueos, moderación y revisión de organizaciones.',
          'Etiquetar responsabilidad de fuente entre usuarios, organizaciones, proveedores y Pocket Genes.',
          'Responder a reportes de privacidad y seguridad según gravedad e información disponible.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios y organizaciones',
        bullets: [
          'Los usuarios deben compartir con cuidado, respetar privacidad, evitar acoso y no dar instrucciones médicas.',
          'Cuidadores y representantes deben respetar privacidad y autoridad de la persona a la que apoyan.',
          'Organizaciones y profesionales deben evitar promoción no revelada, presión, exceso de recolección y afirmaciones no respaldadas.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Pocket Genes no monitorea continuamente cada interacción.',
          'Bloquear y reportar reduce contacto pero no garantiza que una persona nunca vea información pública.',
          'Recursos, eventos u organizaciones externas tienen términos, privacidad y límites propios.',
        ],
      },
      ...documentGovernanceEs([
        'Política de Seguridad Comunitaria',
        'Política de Privacidad',
        'Términos de Servicio',
        'Estándares de Organizaciones de Confianza',
        'Metodología Científica',
      ]),
    ],
  },
  {
    slug: 'community-safety-policy',
    title: 'Política de Seguridad Comunitaria',
    category: 'Comunidad',
    summary:
      'Detalla moderación, reportes, bloqueos, escalamiento, prevención de abuso, divulgaciones sensibles, límites de crisis y revisión de organizaciones.',
    owner: 'Operaciones comunitarias',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Las comunidades de EPOF y genética requieren cuidado especial porque puede haber personas recién diagnosticadas, sin diagnóstico, cuidando a un niño, sin saber interpretar un informe o buscando próximos pasos urgentes. Esta política explica reportes, moderación, bloqueos, divulgaciones sensibles, conducta de organizaciones y apelaciones.',
          'Aplica a RareFriends, perfiles, publicaciones, comentarios, mensajes, grupos, contenido de organizaciones, actividad de organizaciones de confianza, reportes e interacciones de soporte controladas por Pocket Genes.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Miembros, cuidadores, aprendices y visitantes que interactúan con contenido comunitario.',
          'Organizaciones de confianza, profesionales, moderadores y revisores de soporte.',
          'Personas reportadas, personas que reportan y personas afectadas por contenido comunitario.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Reporte de seguridad', body: 'Aviso de usuario, moderador, organización o soporte sobre conducta o contenido que puede dañar privacidad, seguridad, confianza o integridad comunitaria.' },
          { heading: 'Divulgación sensible', body: 'Publicación accidental o intencional de informe, información médica, identificadores, enlaces de acceso, códigos o información de otra persona.' },
          { heading: 'Medida protectora', body: 'Paso temporal o permanente como ocultar contenido, deshabilitar mensajes, limitar cuenta, contactar al usuario o revisar una organización.' },
          { heading: 'Contenido de emergencia', body: 'Contenido que sugiere daño físico inminente, autolesión, abuso, riesgo médico urgente o crisis.' },
        ],
      },
      {
        heading: 'Principios de seguridad',
        bullets: [
          'Proteger privacidad antes que curiosidad. Nadie debe ser empujado a revelar informes, variantes, familia o identidad.',
          'Separar apoyo entre pares de autoridad médica. La experiencia personal es bienvenida; instrucciones diagnósticas o terapéuticas no.',
          'Tratar el acceso organizacional como una responsabilidad mayor. La confianza exige identidad, etiquetado y prudencia.',
          'Actuar proporcionalmente según gravedad, intención, repetición, usuarios afectados, contexto y evidencia.',
        ],
      },
      {
        heading: 'Conductas prohibidas',
        bullets: [
          'Acoso, bullying, amenazas, intimidación, odio o discriminación.',
          'Suplantación de usuarios, cuidadores, clínicos, investigadores, proveedores, organizaciones o representantes de Pocket Genes.',
          'Doxxing, reidentificación, publicación de información médica o genética ajena, códigos o enlaces privados.',
          'Estafas, explotación económica, solicitud agresiva de pacientes, spam, mensajes no solicitados repetidos o curas fraudulentas.',
          'Desinformación médica peligrosa, afirmaciones de urgencia, instrucciones de tratamiento o presión para ignorar profesionales.',
          'Explotación sexual, conducta inapropiada con menores, intentos de obtener códigos de informe, abuso coordinado y evasión de suspensión.',
        ],
      },
      {
        heading: 'Divulgaciones sensibles',
        paragraphs: [
          'Si un usuario parece haber publicado accidentalmente un informe completo, enlace, historia clínica, identificador o información de otra persona, Pocket Genes puede ocultar o retirar el contenido mientras revisa. El objetivo es reducir exposición primero y luego decidir educación, advertencia, acción sobre cuenta o escalamiento.',
          'Moderadores pueden preservar evidencia limitada para investigar abuso, documentar decisiones, manejar repetición o cumplir obligaciones. Esa evidencia debe quedar restringida a personas con necesidad de acceso.',
        ],
      },
      {
        heading: 'Reportes y bloqueos',
        paragraphs: [
          `Los usuarios pueden reportar en el producto cuando esté disponible o escribiendo a ${POCKET_GENES_EMAILS.trust}. Un reporte útil incluye perfil, publicación, mensaje, grupo, organización, captura redactada, fecha aproximada y descripción del riesgo.`,
          'Bloquear puede reducir contacto, pero no remueve contenido público, no deshace capturas y no evita toda exposición indirecta. La persona reportada puede recibir información del resultado si hay acción, pero Pocket Genes no revela datos innecesarios de quien reporta.',
        ],
      },
      {
        heading: 'Proceso de moderación',
        subsections: [
          { heading: 'Recepción', body: 'Pocket Genes recibe el reporte, identifica la superficie afectada y verifica si hace falta una medida protectora inmediata.' },
          { heading: 'Evaluación inicial', body: 'El reporte se clasifica por gravedad, privacidad, riesgo médico, explotación, repetición, participación de organización y calidad de evidencia.' },
          { heading: 'Medida protectora', body: 'Pocket Genes puede ocultar contenido, deshabilitar mensajes, cerrar hilos, restringir cuentas o pausar publicación organizacional antes de la decisión final cuando la exposición o daño es urgente.' },
          { heading: 'Revisión y decisión', body: 'Un revisor considera contexto, reglas, historial, usuarios afectados y obligaciones legales o de proveedor.' },
          { heading: 'Comunicación', body: 'Pocket Genes puede informar resultado a quien reportó, usuario afectado, titular de cuenta u organización cuando sea apropiado y seguro.' },
          { heading: 'Retención', body: 'Los registros de moderación pueden conservarse para responsabilidad, prevención de abuso repetido, ley, seguridad o apelación.' },
        ],
      },
      {
        heading: 'Emergencias y crisis',
        paragraphs: [
          'Pocket Genes no es servicio de emergencia, línea de crisis, triage clínico ni monitoreo 24/7. Ante riesgo médico, físico o de salud mental inminente, los usuarios deben contactar servicios locales de emergencia o profesionales calificados.',
          'Si Pocket Genes toma conocimiento de contenido que sugiere daño inminente, puede priorizar revisión, reducir exposición pública, contactar la cuenta, preservar evidencia o tomar medidas razonables según la información y límites legales.',
        ],
      },
      {
        heading: 'Organizaciones de confianza y apelaciones',
        paragraphs: [
          'Las organizaciones de confianza tienen un estándar más alto porque su presencia puede interpretarse como señal de confianza. La mala conducta puede causar etiquetas, remoción, límites de publicación, revisión, suspensión o remoción de Pocket Genes.',
          `Un usuario u organización puede pedir reconsideración escribiendo a ${POCKET_GENES_EMAILS.trust} con la decisión, contenido afectado y motivo. Pocket Genes puede rechazar apelaciones abusivas, repetitivas, restringidas legalmente o con riesgo activo de seguridad.`,
        ],
      },
      {
        heading: 'Transparencia',
        body:
          'Pocket Genes puede publicar información agregada de moderación, como categorías de reportes o acciones, si no identifica usuarios, revela informes privados, expone detalles sensibles ni compromete investigaciones.',
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Mantener reportes, bloqueos, moderación, escalamiento y revisión de organizaciones.',
          'Actuar proporcionalmente y documentar decisiones importantes.',
          'Tratar divulgaciones sensibles y referencias de acceso como privadas y urgentes.',
          'No sugerir monitoreo continuo de emergencias salvo que exista esa capacidad.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios y organizaciones',
        bullets: [
          'Los usuarios deben evitar acoso, exposición de privacidad, compartir informes, estafas, reidentificación y presión médica.',
          'Las organizaciones deben etiquetar contenido, evitar solicitud agresiva, proteger privacidad y cooperar con revisión.',
          'Quien reporta debe evitar enviar informes completos, contraseñas, tokens o datos innecesarios salvo pedido limitado de Pocket Genes.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Pocket Genes puede no ver o revisar cada interacción antes de que ocurra un daño.',
          'Recursos externos y conversaciones fuera de la plataforma pueden quedar fuera del control de Pocket Genes.',
          'Obligaciones legales, de seguridad o privacidad pueden limitar lo que se informa sobre una investigación.',
        ],
      },
      ...documentGovernanceEs([
        'Términos de Comunidad',
        'Informar un incidente',
        'Estándares de Organizaciones de Confianza',
        'Política de Privacidad',
        'Política de Retención y Eliminación de Datos',
      ]),
    ],
  },
  {
    slug: 'security-overview',
    title: 'Resumen de Seguridad',
    category: 'Seguridad',
    summary:
      'Resume controles de seguridad, autenticación, autorización, protección de acceso a informes, infraestructura, logs, proveedores e incidentes.',
    owner: 'Seguridad',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Este resumen explica controles que Pocket Genes usa o diseña para proteger cuentas, integraciones, referencias de acceso a informes, comunidad, soporte y operaciones.',
          'La seguridad se comparte entre Pocket Genes y proveedores de infraestructura. AWS y Firebase aportan controles de plataforma. Pocket Genes responde por configuración de aplicación, autorización, credenciales, código, comportamiento del producto, acceso operativo, monitoreo y respuesta.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Usuarios e invitados de Pocket Genes.',
          'Integradores, proveedores y organizaciones de confianza.',
          'Investigadores de seguridad y personas que reportan incidentes.',
          'Operadores y administradores internos que gestionan sistemas de Pocket Genes.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Autenticación', body: 'Proceso para verificar identidad antes de otorgar acceso a una cuenta.' },
          { heading: 'Autorización', body: 'Controles de aplicación que deciden si un usuario autenticado puede acceder a un registro, función, referencia, comunidad o acción administrativa.' },
          { heading: 'Información confidencial de acceso', body: 'Códigos, referencias, URLs, tokens, identificadores y valores similares que conectan a un usuario con acceso privado a informes.' },
          { heading: 'Acceso administrativo', body: 'Acceso privilegiado para operar, asistir, moderar, depurar, proteger o mantener Pocket Genes.' },
        ],
      },
      {
        heading: 'Autenticación y sesiones',
        paragraphs: [
          'Las funciones privadas requieren identidad autenticada. La evidencia del repositorio muestra Firebase Authentication y cookies de sesión creadas por servidor para flujos protegidos de cuenta y backoffice. Los métodos de ingreso pueden variar por superficie y configuración.',
          'La recuperación de contraseña, recuperación de cuenta y manejo de sesión están diseñados para reducir el riesgo de toma de cuenta. La duración de sesión, reautenticación y recuperación se configuran según la superficie correspondiente, y Pocket Genes no anuncia MFA salvo que esté habilitado para los usuarios relevantes.',
        ],
      },
      {
        heading: 'Autorización',
        paragraphs: [
          'Autenticarse no otorga acceso universal. Pocket Genes debe verificar relaciones usuario-recurso antes de devolver cuentas, referencias de informes, comunidad, soporte, publicación organizacional o acciones admin.',
          'Las herramientas administrativas deben aplicar roles, privilegio mínimo y separación entre producción y desarrollo/pruebas.',
        ],
      },
      {
        heading: 'Protección de acceso a informes',
        bullets: [
          'Enlaces, referencias, códigos y tokens se tratan como información confidencial de acceso.',
          'No deben exponerse intencionalmente en perfiles públicos, contenido organizacional, comunidad, capturas, analytics o logs salvo necesidad estricta.',
          'El acceso debe limitarse al usuario previsto, cuidador autorizado o flujo autorizado.',
          'Vencimiento, revocación y disponibilidad del proveedor deben describirse cuando estén implementados.',
        ],
      },
      {
        heading: 'Cifrado e infraestructura',
        paragraphs: [
          'Pocket Genes usa conexiones cifradas para comunicaciones protegidas. Los proveedores cloud pueden aportar cifrado administrado en reposo para bases de datos, almacenamiento e infraestructura.',
          'Este resumen no afirma cifrado personalizado a nivel de aplicación salvo que un componente específico lo implemente. La protección del dispositivo depende también del teléfono, sistema operativo, tienda de apps y configuración de cuenta.',
        ],
      },
      {
        heading: 'Acceso administrativo',
        bullets: [
          'Otorgar acceso de producción solo a quienes lo necesitan por rol operativo.',
          'Usar permisos por rol y remover acceso cuando cambian responsabilidades.',
          'Exigir autenticación fuerte y MFA en sistemas administrativos cuando el sistema lo soporte.',
          'Registrar acciones administrativas sensibles y revisar accesos periódicamente.',
          'Evitar datos de producción para desarrollo o demos salvo aprobación y minimización.',
        ],
      },
      {
        heading: 'Desarrollo seguro',
        bullets: [
          'Usar revisión de código, actualizaciones de dependencias, revisión de release y separación de entornos.',
          'Guardar secretos fuera del código fuente y rotarlos si se sospecha exposición.',
          'Usar datos de prueba o minimizados cuando sea posible.',
          'Revisar autenticación, autorización, reglas de Firestore, rutas de API y comportamiento móvil/API antes de publicar.',
          'Seguir vulnerabilidades reportadas desde triage hasta remediación, validación y cierre.',
        ],
      },
      {
        heading: 'Logs, monitoreo, backups y continuidad',
        paragraphs: [
          'Pocket Genes puede registrar eventos operativos, seguridad, autenticación, soporte y diagnóstico para detectar errores, abuso, accesos inusuales y confiabilidad. El monitoreo protege la plataforma y no promete revisión continua de contenido privado.',
          'Backups y durabilidad administrada por proveedores ayudan a continuidad y recuperación. Las restauraciones deben manejarse para no reexponer registros eliminados o restringidos.',
        ],
      },
      {
        heading: 'Gestión de proveedores',
        paragraphs: [
          'Pocket Genes evalúa proveedores por propósito, información involucrada, controles, términos, privacidad, confiabilidad, soporte y necesidad. La lista de proveedores identifica servicios públicos usados por componentes de Pocket Genes.',
        ],
      },
      {
        heading: 'Respuesta a incidentes',
        paragraphs: [
          'La respuesta incluye preparación, recepción, detección, severidad, contención, investigación, remediación, recuperación, comunicación y aprendizaje. Incidentes de privacidad, cuenta, organizaciones, comunidad, accesibilidad y vulnerabilidades usan caminos diferentes.',
          'Los problemas de seguridad y vulnerabilidades pueden reportarse mediante Informar un incidente y el archivo security.txt publicado.',
        ],
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Configurar autenticación, autorización, infraestructura y controles de aplicación de forma segura.',
          'Proteger información confidencial de acceso y datos privados.',
          'Mantener acceso administrativo limitado, revisado y registrado cuando sea viable.',
          'Mantener vía de reporte de vulnerabilidades e incidentes.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios, integradores y organizaciones',
        bullets: [
          'Los usuarios deben proteger credenciales, dispositivos, enlaces y códigos.',
          'Los integradores deben enviar solo datos necesarios y proteger referencias antes y después de transferirlas.',
          'Las organizaciones no deben pedir informes privados ni códigos mediante comunidad.',
          'Investigadores deben seguir alcance de divulgación y evitar acceder a información de otros usuarios.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Ningún sistema garantiza seguridad perfecta.',
          'Portales de proveedor, tiendas, sitios externos y dispositivos de usuarios pueden quedar fuera del control de Pocket Genes.',
          'Algunos detalles de seguridad pueden reservarse si publicarlos aumenta el riesgo.',
        ],
      },
      ...documentGovernanceEs([
        'Informar un incidente',
        'Proveedores que procesan datos',
        'Diagrama de Flujo de Datos',
        'Política de Retención y Eliminación de Datos',
        'Política de Privacidad',
      ]),
    ],
  },
  {
    slug: 'data-flow-diagram',
    title: 'Diagrama de Flujo de Datos',
    category: 'Seguridad',
    summary:
      'Muestra cómo interactúan proveedores, Pocket Genes, proveedores de infraestructura y usuarios cuando se accede a un informe desde la experiencia móvil.',
    owner: 'Seguridad y producto',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Esta página describe el movimiento de información en un recorrido típico de acceso a informes, educación, descubrimiento y comunidad en Pocket Genes. No es un diagrama de topología de servidores ni expone secretos de implementación.',
          'El objetivo es mostrar qué información entra en cada paso, quién responde, qué hace Pocket Genes, si se conserva y qué controla el usuario.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Usuarios y cuidadores que quieren entender límites entre informes y comunidad.',
          'Proveedores e integradores que inician invitaciones o acceso a informes.',
          'Organizaciones de confianza y editores comunitarios.',
          'Revisores de privacidad, seguridad y soporte.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Proveedor', body: 'Organización que creó, entregó o controla el informe genético o recurso del proveedor.' },
          { heading: 'Integrador', body: 'Proveedor, clínica, laboratorio, organización o programa que conecta a una persona con un flujo de Pocket Genes.' },
          { heading: 'Referencia de acceso', body: 'URL, código, token, identificador, referencia de proveedor o valor similar usado para conectar un usuario autorizado con un informe.' },
          { heading: 'Participación comunitaria', body: 'Acciones opcionales de RareFriends como perfil, matching, seguimientos, grupos, publicaciones, comentarios y mensajes.' },
        ],
      },
      {
        heading: 'Tabla de flujo de datos',
        table: {
          headers: ['Paso', 'Actor', 'Información involucrada', 'Acción de Pocket Genes', '¿Se conserva?', 'Control del usuario'],
          rows: [
            ['Inicio por proveedor', 'Integrador o proveedor', 'Nombre, email, teléfono opcional, referencia de proveedor, propósito del flujo.', 'Crea o prepara invitación o proceso de acceso.', 'Según política de integración y estado del flujo.', 'El usuario puede continuar, rechazar, oponerse o pedir eliminación.'],
            ['Contacto al usuario', 'Pocket Genes', 'Datos de contacto, estado de invitación, organización fuente y soporte.', 'Envía comunicación de servicio.', 'Temporalmente o hasta limpieza de flujo/cuenta; sin TTL automático público salvo integración específica.', 'El usuario puede ignorar, rechazar, contactar soporte o pedir eliminación.'],
            ['Consentimiento', 'Usuario y Pocket Genes', 'Propósito, versión, estado, fecha y proveedor o flujo relacionado.', 'Registra decisión y continúa o detiene el flujo.', 'Puede sobrevivir a datos temporales por responsabilidad.', 'El usuario puede retirar donde corresponda, con límites.'],
            ['Autenticación', 'Usuario, Firebase, Pocket Genes', 'ID de cuenta, login, sesión y eventos de seguridad.', 'Verifica identidad antes de operaciones privadas.', 'Cronograma de cuenta y seguridad.', 'El usuario gestiona cuenta y puede pedir cierre.'],
            ['Acceso a informe', 'Proveedor, Pocket Genes, usuario', 'Enlace, código, token, identificador, referencia y estado de autorización.', 'Conecta al usuario autorizado con la experiencia del proveedor.', 'Depende de integración, vencimiento, revocación, relación con proveedor y eliminación de cuenta.', 'El usuario protege enlaces, cierra sesión y puede pedir revocación o eliminación.'],
            ['Educación y descubrimiento', 'Pocket Genes y usuario', 'Intereses, interacciones, recursos guardados y seguimientos cuando aplica.', 'Muestra glosario, lecciones, recursos, eventos y contenido de organizaciones.', 'Según cuenta e interacciones.', 'El usuario gestiona intereses, seguimientos y comunicaciones opcionales.'],
            ['Comunidad', 'Usuario, RareFriends, organizaciones', 'Perfil opcional, etiquetas, publicaciones, comentarios, seguimientos, grupos, mensajes, reportes y bloqueos.', 'Publica y matchea según configuración y reglas.', 'Cronograma comunitario y registros de moderación.', 'El usuario controla participación, contenido, visibilidad, bloqueos y eliminación con límites.'],
          ],
        },
      },
      {
        heading: 'Límites explícitos',
        bullets: [
          'El proveedor conserva responsabilidad sobre el informe y sus hallazgos.',
          'Pocket Genes responde por cuenta, acceso, integración, consentimiento, educación, descubrimiento y comunidad que opera.',
          'Acceder a un informe no lo publica.',
          'Unirse a RareFriends no revela un informe a otros usuarios.',
          'Las organizaciones de confianza no reciben acceso irrestricto a cuentas.',
          'Un integrador no recibe automáticamente actividad comunitaria posterior.',
          'La información de informes no se usa para publicidad bajo el mapa de datos del Centro de confianza.',
        ],
      },
      {
        heading: 'Dispositivo del usuario y estado local',
        paragraphs: [
          'El dispositivo puede conservar estado de app, pantallas cacheadas, notificaciones, archivos descargados, capturas, historial o registros del sistema según configuración y comportamiento. Los usuarios deben proteger el dispositivo y evitar compartir capturas de informes.',
          'Pocket Genes debe evitar guardar enlaces, códigos o contenido privado donde no son necesarios, como perfiles públicos, comunidad, analytics o capturas de soporte.',
        ],
      },
      {
        heading: 'Infraestructura',
        body:
          'Pocket Genes usa proveedores establecidos, incluidos Amazon Web Services y Google Firebase, para operar distintos componentes como hosting, autenticación, base de datos, backend, logs y confiabilidad.',
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Limitar cada paso a la información necesaria.',
          'Mantener clara la responsabilidad de fuente entre proveedores, Pocket Genes, organizaciones y usuarios.',
          'Proteger referencias de acceso y datos privados.',
          'Documentar consentimiento, solicitudes, eliminación e incidentes.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios, integradores y organizaciones',
        bullets: [
          'Los usuarios deben revisar invitaciones, gestionar opciones comunitarias y evitar publicar información privada.',
          'Los integradores deben aportar solo información autorizada y necesaria.',
          'Las organizaciones no deben inferir datos privados de cuentas o informes por seguimientos, comentarios o comunidad.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Integraciones específicas pueden tener términos, retención o soporte adicionales.',
          'Recursos externos de proveedores pueden quedar indisponibles fuera del control de Pocket Genes.',
          'Backups, logs y retenciones legales pueden afectar tiempos de eliminación.',
        ],
      },
      ...documentGovernanceEs([
        'Política de Privacidad',
        'Resumen de Seguridad',
        'Política de Retención y Eliminación de Datos',
        'Proveedores que procesan datos',
        'Declaración Regulatoria y de Uso Previsto',
      ]),
    ],
  },
  {
    slug: 'subprocessor-list',
    title: 'Proveedores que procesan datos',
    category: 'Privacidad y derechos',
    summary:
      'Enumera terceros que pueden procesar datos de cuenta, autenticación, infraestructura, operación, agenda o aplicación limitada para Pocket Genes.',
    owner: 'Confianza y privacidad',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Esta lista identifica proveedores públicos que pueden procesar información personal para infraestructura, autenticación, base de datos, backend, hosting, operaciones, diagnóstico, soporte o agenda de Pocket Genes.',
          'La lista se enfoca en proveedores evidenciados por el producto público y el contexto actual del repositorio. Pocket Genes debe actualizar el registro cuando se agregue, reemplace o retire un proveedor, o cuando procese una nueva categoría de información.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Usuarios, invitados, cuidadores y participantes de comunidad.',
          'Integradores, proveedores y organizaciones de confianza que evalúan manejo de datos.',
          'Personas que envían solicitudes de soporte, reuniones, incidentes, accesibilidad u organización.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Proveedor que procesa datos', body: 'Proveedor que procesa información personal para Pocket Genes según instrucciones o configuración de Pocket Genes.' },
          { heading: 'Proveedor de infraestructura', body: 'Proveedor cloud o plataforma que aloja, almacena, autentica, transmite, registra o soporta componentes técnicos.' },
          { heading: 'Procesamiento internacional', body: 'Procesamiento, almacenamiento, soporte o acceso fuera del país del usuario según arquitectura y operaciones del proveedor.' },
          { heading: 'Documentación del proveedor', body: 'Documentación pública de privacidad, seguridad, procesamiento o servicio publicada por el proveedor.' },
        ],
      },
      {
        heading: 'Registro público',
        body:
          'Cada proveedor se presenta con entidad legal, servicio, propósito, categorías de información, rol de procesamiento, contexto de transferencias, documentación y fecha de revisión.',
        subsections: [
          {
            heading: 'Amazon Web Services',
            bullets: [
              'Entidad legal proveedora: Amazon Web Services, Inc. o afiliada contractual aplicable.',
              'Producto o servicio: Infraestructura cloud y backend usada por componentes de Pocket Genes.',
              'Propósito: Hosting, cómputo, almacenamiento, red, confiabilidad, seguridad y backend.',
              'Categorías de información: Información de aplicación, operación, logs, integración, soporte y cuenta limitada según componente.',
              'Rol de procesamiento: Aloja, almacena, transmite y soporta infraestructura bajo configuración de Pocket Genes.',
              'Jurisdicciones o transferencias: Puede aplicar procesamiento internacional según región, soporte y servicio.',
              'Documentación: Documentación de privacidad, procesamiento, seguridad y compliance de AWS.',
              `Agregado o revisado: ${TRUST_LAST_REVIEWED_ES}.`,
            ],
          },
          {
            heading: 'Google Firebase',
            bullets: [
              'Entidad legal proveedora: Google LLC o afiliada contractual aplicable.',
              'Producto o servicio: Firebase Authentication, base de datos e infraestructura de aplicación Firebase/Google Cloud cuando se configure.',
              'Propósito: Autenticación, identidad de cuenta, base de datos, operación, eventos de seguridad e infraestructura.',
              'Categorías de información: Identificadores, autenticación, login, datos de perfil/aplicación, referencias de integración, logs y diagnóstico.',
              'Rol de procesamiento: Autentica, aloja, almacena, transmite y soporta infraestructura.',
              'Jurisdicciones o transferencias: Puede aplicar procesamiento internacional bajo términos de Google y Firebase.',
              'Documentación: Documentación de Google Cloud, Firebase, privacidad, procesamiento y seguridad.',
              `Agregado o revisado: ${TRUST_LAST_REVIEWED_ES}.`,
            ],
          },
          {
            heading: 'Relayhook',
            bullets: [
              'Entidad legal proveedora: Connex, operador del servicio Relayhook.',
              'Producto o servicio: Endpoint webhook para solicitudes públicas de reunión y organización de confianza.',
              'Propósito: Reenviar detalles de solicitudes para que Pocket Genes pueda responder.',
              'Categorías de información: Nombre, email, WhatsApp o teléfono opcional, empresa, reunión, página fuente, idioma y contexto.',
              'Rol de procesamiento: Transmite y notifica información enviada mediante el flujo de reserva.',
              'Jurisdicciones o transferencias: Puede aplicar procesamiento internacional según hosting y operación de Relayhook.',
              'Documentación: La documentación de privacidad de Relayhook queda registrada en el archivo de proveedor.',
              `Agregado o revisado: ${TRUST_LAST_REVIEWED_ES}.`,
            ],
          },
        ],
      },
      {
        heading: 'Selección de proveedores',
        body:
          'Pocket Genes evalúa proveedores según propósito, categorías de información, controles de seguridad, términos de privacidad, términos contractuales, confiabilidad, soporte y necesidad de la función.',
      },
      {
        heading: 'Cambios y aviso',
        paragraphs: [
          'Altas, reemplazos, bajas o nuevos propósitos materiales deben reflejarse en esta lista. Pocket Genes puede notificar a usuarios, integradores u organizaciones cuando un cambio afecte materialmente su información, contrato, integración o derechos.',
          'Un proveedor usado solo por otro producto de Golden Crow no debe tratarse como proveedor de Pocket Genes salvo que procese información de Pocket Genes.',
        ],
      },
      {
        heading: 'Responsabilidad compartida',
        paragraphs: [
          'Usar AWS, Firebase u otro proveedor no transfiere la responsabilidad de diseño seguro de Pocket Genes. Pocket Genes sigue respondiendo por reglas de acceso, reglas de base de datos, credenciales, código, configuración, minimización, soporte e incidentes.',
        ],
      },
      {
        heading: 'Áreas de auditoría',
        bullets: [
          'Email transaccional y comunicaciones.',
          'Notificaciones push.',
          'Crash reporting y diagnóstico.',
          'Analytics de producto y web.',
          'Herramientas de soporte.',
          'Agenda y reserva.',
          'Hosting, monitoreo de errores, almacenamiento y distribución de contenido.',
        ],
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Mantener un registro preciso de proveedores de Pocket Genes.',
          'Limitar datos enviados a cada proveedor al propósito de la integración.',
          'Revisar seguridad y privacidad antes de uso material.',
          'Actualizar a usuarios o socios cuando un cambio material requiera aviso.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios, integradores y organizaciones',
        bullets: [
          'Los usuarios pueden usar canales de privacidad para preguntas sobre proveedores.',
          'Los integradores no deben asumir que sus propios proveedores están cubiertos por esta lista.',
          'Las organizaciones deben revelar sus herramientas externas cuando sacan usuarios de Pocket Genes o recolectan datos por su cuenta.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Las entidades legales y nombres de producto pueden variar por contrato y región.',
          'Soporte de emergencia, pedidos legales, fraude y caídas pueden involucrar procesadores o divulgaciones adicionales permitidas.',
          'Esta lista no cubre proveedores independientes que controlan informes, sitios, servicios clínicos, eventos o recursos propios.',
        ],
      },
      ...documentGovernanceEs([
        'Política de Privacidad',
        'Resumen de Seguridad',
        'Diagrama de Flujo de Datos',
        'Informar un incidente',
      ]),
    ],
  },
  {
    slug: 'data-retention-deletion',
    title: 'Política de Retención y Eliminación de Datos',
    category: 'Privacidad y derechos',
    summary:
      'Explica cuánto conserva Pocket Genes datos de cuenta, integración, consentimiento, comunidad, logs, backups y qué ocurre al eliminar información.',
    owner: 'Confianza y privacidad',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Esta política explica cómo Pocket Genes conserva, elimina, desidentifica o preserva información en cuentas, integraciones, consentimiento, acceso a informes, comunidad, soporte, logs y backups.',
          'Los valores de retención deben reflejar comportamiento implementado. Cuando Pocket Genes no publica un vencimiento automático fijo, esta política informa el disparador actual en lugar de inventar un número de días.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Usuarios, invitados, cuidadores y representantes de Pocket Genes.',
          'Personas cuyos datos de contacto fueron aportados por un integrador.',
          'Participantes de RareFriends.',
          'Organizaciones de confianza, proveedores e integradores conectados a un flujo.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Sistemas activos', body: 'Bases de datos, autenticación, almacenamiento y registros usados para operar funciones vivas.' },
          { heading: 'Backup', body: 'Copia de proveedor u operación usada para recuperación o continuidad, no para acceso ordinario.' },
          { heading: 'Disparador de eliminación', body: 'Solicitud, cierre de cuenta, cierre de flujo, moderación, vencimiento, revocación o acción operativa que inicia eliminación.' },
          { heading: 'Retención legal o de seguridad', body: 'Motivo acotado de preservación como investigación de seguridad, reclamo legal, abuso, fraude, auditoría u obligación.' },
          { heading: 'Información desidentificada', body: 'Información que ya no se vincula razonablemente con una persona identificable. Los datos realmente anónimos no son datos de cuenta.' },
        ],
      },
      {
        heading: 'Cronograma de retención',
        table: {
          headers: ['Información', 'Comienza', 'Termina', 'Disparador de eliminación', 'Excepción posible'],
          rows: [
            ['Invitación de integración incompleta', 'Recepción desde integrador o proveedor.', 'Finalización, rechazo, limpieza manual, eliminación de cuenta o vencimiento específico publicado.', 'Usuario rechaza, solicita eliminación, se revoca invitación o se cierra flujo.', 'Investigación de seguridad, retención legal, abuso o disputa con proveedor.'],
            ['Datos de cuenta', 'Creación de cuenta o aceptación de invitación.', 'Eliminación de cuenta más proceso activo y rotación de backups.', 'Solicitud verificada, eliminación admin autorizada o cierre de cuenta.', 'Requisito legal, fraude, seguridad, pago, auditoría o disputa.'],
            ['Registro de consentimiento', 'Decisión o rechazo.', 'Cuando termina necesidad probatoria, de proveedor, auditoría o legal.', 'Fin de requerimiento probatorio, solicitud aplicable o retiro de flujo.', 'Reclamo legal, auditoría de proveedor, cumplimiento o disputa.'],
            ['Referencia o enlace de informe', 'Creación de enlace, código, token, referencia o autorización.', 'Vencimiento, revocación, fin de relación con proveedor, eliminación de cuenta o limpieza.', 'Solicitud, revocación de proveedor, eliminación de cuenta o limpieza de integración.', 'Soporte, incidente de seguridad, retención legal, disputa con proveedor.'],
            ['Perfil comunitario', 'Creación de perfil o alta en RareFriends.', 'Eliminación de perfil, salida de RareFriends, eliminación de cuenta o moderación.', 'Solicitud, cierre de cuenta o acción de moderación.', 'Registro de moderación, evidencia de seguridad, retención legal.'],
            ['Publicaciones y comentarios', 'Publicación.', 'Eliminación por usuario, cascada de cuenta, remoción por moderación o retiro de función.', 'Acción del usuario, cierre de cuenta o moderación.', 'Investigación, preservación legal, evidencia de abuso.'],
            ['Mensajes', 'Envío o recepción.', 'Eliminación, cierre de cuenta, retención de función o limpieza por moderación cuando mensajes estén habilitados.', 'Eliminación de usuario/cuenta, reporte o moderación.', 'Investigación de abuso, seguridad o retención legal.'],
            ['Soporte y reservas', 'Ticket, email, formulario o reserva.', 'Cierre, archivo manual, solicitud de eliminación o limpieza operativa.', 'Solicitud, cierre de soporte o archivo.', 'Disputa legal, facturación, abuso o seguridad.'],
            ['Logs de seguridad', 'Evento de seguridad, auth, sistema o acceso.', 'Ciclo de logs del proveedor, expiración configurada, cierre de incidente o limpieza.', 'Expiración automática donde esté configurada o limpieza manual.', 'Incidente activo, abuso, retención legal.'],
            ['Backups', 'Creación de backup.', 'Ciclo máximo de backup o rotación del proveedor.', 'Rotación automática, limpieza post restauración o proceso de proveedor.', 'Recuperación, retención legal, incidente activo.'],
            ['Analytics desidentificada', 'Creación desde información operativa o de uso.', 'Cuando deje de ser útil o según configuración; puede ser indefinida si es realmente anónima.', 'Cronograma de política o retiro de dataset.', 'No aplica si ya no es información personal.'],
          ],
        },
      },
      {
        heading: 'Sistemas activos versus backups',
        paragraphs: [
          'Eliminar de sistemas activos significa remover o desidentificar registros de sistemas usados para funcionalidad ordinaria. El tiempo exacto depende de cuenta, flujo de proveedor, cola, base de datos, almacenamiento y soporte.',
          'Datos eliminados pueden permanecer brevemente en backups hasta rotación. Los backups son para restauración y continuidad, no consulta ordinaria. Si se restaura un backup, Pocket Genes debe reaplicar estados conocidos de eliminación, restricción o moderación cuando sea viable.',
        ],
      },
      {
        heading: 'Registros de consentimiento',
        paragraphs: [
          'Los consentimientos pueden sobrevivir a datos temporales de contacto porque Pocket Genes puede necesitar evidencia de decisión, versión, flujo, fecha y proveedor u organización. Esto es distinto de conservar un informe completo o información de invitación innecesaria.',
          'Un registro de consentimiento debe conservar la mínima información necesaria para entender qué fue aceptado, rechazado, retirado o reemplazado.',
        ],
      },
      {
        heading: 'Eliminación de cuenta',
        paragraphs: [
          'El backend actual incluye un camino de eliminación en cascada para cuenta Firebase Auth, perfil privado, perfil público, documento de usuario comunitario y eventos, publicaciones y comentarios propios hasta límites operativos de lote, códigos de informe, progreso, registros de titular de informe e informes cargados vinculados.',
          'La eliminación de cuenta no elimina informes del proveedor, historias clínicas de proveedor, portales de proveedor, registros de tiendas, registros externos de organizaciones ni información que otros usuarios conserven fuera de Pocket Genes. Tampoco necesariamente elimina registros de moderación, legal, seguridad, backups u operación desidentificada.',
        ],
      },
      {
        heading: 'Excepciones legales y de seguridad',
        bullets: [
          'Investigación de fraude, seguridad o compromiso de cuenta.',
          'Reclamo legal, orden, regulador u obligación normativa.',
          'Evidencia de abuso, acoso, estafa, explotación o moderación.',
          'Cumplimiento de Términos, Comunidad o Estándares de Organizaciones.',
          'Protección de privacidad, seguridad o derechos de otra persona.',
        ],
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Informar retención basada en comportamiento implementado, no períodos aspiracionales.',
          'Eliminar o desidentificar sistemas activos cuando aplica un disparador válido.',
          'Preservar solo registros acotados por motivos legales, seguridad, auditoría o incidentes.',
          'Explicar qué no puede eliminar porque queda con un proveedor o tercero.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios, integradores y organizaciones',
        bullets: [
          'Los usuarios deben pedir eliminación a Pocket Genes y por separado a proveedores u organizaciones cuando esos terceros controlen registros.',
          'Los integradores deben evitar enviar datos innecesarios y atender revocaciones o correcciones en sus sistemas.',
          'Las organizaciones deben eliminar o corregir información recolectada por ellas bajo sus avisos y obligaciones.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Límites operativos de lote pueden requerir eliminación por etapas en historiales grandes.',
          'Backups y logs administrados por proveedores pueden demorar remoción final de toda copia.',
          'Algunos registros pueden conservarse desidentificados, agregados o bajo retención legal.',
        ],
      },
      ...documentGovernanceEs([
        'Política de Privacidad',
        'Diagrama de Flujo de Datos',
        'Resumen de Seguridad',
        'Política de Seguridad Comunitaria',
      ]),
    ],
  },
  {
    slug: 'incident-reporting',
    title: 'Informar un incidente',
    category: 'Seguridad',
    summary:
      'Explica cómo informar problemas de privacidad, cuenta, seguridad, accesibilidad y vulnerabilidades técnicas.',
    owner: 'Seguridad',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Esta página explica cómo informar un incidente de privacidad, cuenta, referencia expuesta, seguridad comunitaria, organización, accesibilidad o vulnerabilidad de seguridad relacionada con Pocket Genes.',
          'Separa incidentes de usuarios de investigación de vulnerabilidades para que cada reporte incluya lo necesario y se entienda qué hará Pocket Genes después.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Usuarios, cuidadores, invitados y titulares de cuenta.',
          'Personas afectadas por privacidad, comunidad, accesibilidad u organizaciones.',
          'Investigadores de seguridad que reportan de buena fe.',
          'Integradores, proveedores y organizaciones de confianza que reportan problemas de flujo.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Incidente de privacidad, cuenta o seguridad', body: 'Problema de acceso no autorizado, exposición inesperada, invitación mal dirigida, enlaces o códigos divulgados, comunidad, abuso organizacional o pérdida de control.' },
          { heading: 'Vulnerabilidad de seguridad', body: 'Debilidad técnica que puede afectar confidencialidad, integridad, disponibilidad, autenticación, autorización o controles de acceso.' },
          { heading: 'Investigación de buena fe', body: 'Prueba dentro de alcance, sin daño, sin acceso innecesario, reportada rápido y con oportunidad razonable de remediación.' },
        ],
      },
      {
        heading: 'Reportar privacidad, cuenta, accesibilidad o seguridad',
        paragraphs: [
          `Escribí a ${POCKET_GENES_EMAILS.trust} con un asunto como "incidente de privacidad Pocket Genes", "cuenta comprometida Pocket Genes", "enlace de informe expuesto", "barrera de accesibilidad Pocket Genes" o "reporte de seguridad comunitaria Pocket Genes".`,
          'Situaciones reportables incluyen acceso no autorizado, invitación a persona equivocada, exposición inesperada, enlace o código divulgado, información recibida sin autorización esperada, divulgación comunitaria de información de otra persona, abuso de organización y pérdida de control de cuenta.',
        ],
      },
      {
        heading: 'Qué incluir y qué no incluir',
        bullets: [
          'Incluí página, pantalla, organización, flujo de cuenta, tipo de código, comunidad o API afectada si lo sabés.',
          'Incluí fecha, hora, zona horaria, dispositivo, navegador, versión de app, tecnología de asistencia y pasos de reproducción cuando aplique.',
          'Incluí capturas solo si ayudan y redactá contraseñas, tokens, informes completos, datos médicos no relacionados e información de otras personas.',
          'No envíes contraseñas, códigos de un solo uso, tokens, informes completos, historias clínicas completas ni claves privadas salvo pedido limitado por un canal más seguro.',
        ],
      },
      {
        heading: 'Triage y actualizaciones',
        paragraphs: [
          'Pocket Genes revisa reportes, clasifica el problema, evalúa urgencia, limita acceso interno a quienes lo necesitan y puede pedir verificación de identidad antes de tratar detalles de cuenta.',
          'Riesgos urgentes como cuenta comprometida, referencias de informe expuestas, usuarios vulnerables, abuso organizacional o impacto técnico amplio tienen prioridad. Las actualizaciones pueden limitarse por privacidad, seguridad, ley o investigación activa.',
        ],
      },
      {
        heading: 'Reportar una vulnerabilidad de seguridad',
        paragraphs: [
          `Las vulnerabilidades pueden reportarse a ${POCKET_GENES_EMAILS.security}. El archivo security.txt público también dirige a este canal.`,
          'El alcance incluye páginas públicas de Pocket Genes, Centro de confianza, APIs de cuenta y acceso a informes, superficies móviles, RareFriends y flujos de publicación de organizaciones controlados por Pocket Genes.',
        ],
      },
      {
        heading: 'Investigación autorizada y actividad prohibida',
        bullets: [
          'Permitido: pruebas de buena fe sobre cuentas y datos propios, inspección pasiva de páginas públicas y prueba mínima para demostrar impacto.',
          'No hagas denegación de servicio, ingeniería social, ataques físicos, pruebas destructivas, spam, credential stuffing ni evasión masiva de límites.',
          'No accedas, copies, conserves, modifiques, elimines ni compartas información de otros usuarios más allá de lo mínimo para demostrar el problema.',
          'No publiques detalles antes de que Pocket Genes tenga una oportunidad razonable de investigar y remediar.',
        ],
      },
      {
        heading: 'Safe harbor y proceso de respuesta',
        paragraphs: [
          'Pocket Genes busca no perseguir a investigadores de buena fe por actividad accidental y limitada que siga esta política, evite daño, no interrumpa servicios y se reporte pronto. Esta declaración está sujeta a ley aplicable y no protege extorsión, violaciones de privacidad, actividad destructiva o mala fe.',
          'Un reporte útil incluye componente afectado, pasos, impacto, evidencia, contacto, si se accedió a información de usuarios y si parece explotable. Pocket Genes busca acusar recibo, clasificar por gravedad, actualizar cuando sea práctico, remediar según riesgo y coordinar divulgación cuando corresponda.',
        ],
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Mantener canales claros para incidentes y vulnerabilidades.',
          'Clasificar reportes por privacidad, seguridad, accesibilidad y riesgo operativo.',
          'Contener y remediar problemas confirmados según gravedad.',
          'Comunicar cuando corresponda y preservar registros de responsabilidad.',
        ],
      },
      {
        heading: 'Responsabilidades de quien reporta',
        bullets: [
          'Reportar rápido y con suficiente detalle.',
          'Evitar acceso innecesario a información privada.',
          'No interrumpir servicios ni probar fuera de alcance.',
          'Mantener confidencialidad hasta coordinar divulgación o pasar una ventana razonable de remediación.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Pocket Genes no es emergencia médica, crisis, policía ni monitoreo 24/7.',
          'Algunos reportes pertenecen a proveedor, tienda, sitio externo u organización fuera de Pocket Genes.',
          'Límites legales, seguridad y privacidad pueden restringir detalles sobre resultados.',
        ],
      },
      ...documentGovernanceEs([
        'Resumen de Seguridad',
        'Política de Privacidad',
        'Política de Seguridad Comunitaria',
        'Declaración de Accesibilidad',
      ]),
    ],
  },
  {
    slug: 'accessibility-statement',
    title: 'Declaración de Accesibilidad',
    category: 'Accesibilidad',
    summary:
      'Describe alcance de accesibilidad, objetivo WCAG, estado de conformidad, funciones soportadas, pruebas, límites conocidos y feedback.',
    owner: 'Producto',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Accesibilidad en Pocket Genes significa que las personas deben poder operar el producto y entender conceptos complejos de genética, privacidad, seguridad, acceso a informes y comunidad. La declaración cubre sitio público, Centro de confianza, experiencia móvil, flujos de informes, comunidad y documentos controlados por Pocket Genes.',
          'Informes de proveedores, tiendas de apps, sitios vinculados, herramientas de reserva embebidas, recursos de organizaciones y documentos externos pueden tener límites propios porque Pocket Genes no controla todas esas experiencias.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Personas que usan páginas públicas, Centro de confianza, pantallas de app, acceso a informes, cuenta o comunidad.',
          'Personas que usan lectores de pantalla, teclado, switch, zoom, escalado de texto, subtítulos o entradas alternativas.',
          'Cuidadores, proveedores, organizaciones y soporte que ayudan a acceder a Pocket Genes.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'WCAG', body: 'Web Content Accessibility Guidelines, estándar W3C para evaluar accesibilidad web.' },
          { heading: 'Tecnología de asistencia', body: 'VoiceOver, TalkBack, lectores de pantalla, lupas, teclado, switch, subtítulos, voz o funciones del navegador.' },
          { heading: 'Parcialmente conforme', body: 'Parte del contenido cumple el objetivo, pero no toda pantalla, documento, componente externo o flujo tiene evaluación documentada.' },
          { heading: 'Formato alternativo', body: 'Camino de soporte, explicación, documento o asistencia cuando el formato ordinario genera una barrera.' },
        ],
      },
      {
        heading: 'Estándar y estado de conformidad',
        paragraphs: [
          'Pocket Genes apunta a cumplir WCAG 2.2 Nivel AA para experiencias web públicas y aplica principios equivalentes de diseño accesible en aplicaciones móviles.',
          'Estado actual: parcialmente conforme y todavía en evaluación. Pocket Genes no afirma conformidad completa hasta completar y documentar evaluación de páginas, pantallas y flujos relevantes.',
          `Fecha de última revisión de esta declaración: ${TRUST_EFFECTIVE_DATE_ES}.`,
        ],
      },
      {
        heading: 'Funciones de accesibilidad soportadas',
        bullets: [
          'Encabezados, regiones, listas, tablas, enlaces y botones semánticos en páginas públicas.',
          'Navegación por teclado y foco visible donde hay controles en páginas públicas.',
          'Contraste legible, diseño responsivo, indicadores no solo por color y ajuste estable de texto.',
          'Etiquetas compatibles con VoiceOver y TalkBack en controles móviles cuando la implementación nativa lo permite.',
          'Principios de Dynamic Type y escalado de texto en diseño móvil.',
          'Etiquetas de formulario, validaciones, errores y recuperación claros.',
          'Áreas táctiles adecuadas y diseños que evitan exigir orientación específica cuando sea posible.',
          'Consideración de movimiento reducido para animaciones no esenciales.',
          'Lenguaje claro y alternativas para gráficos, tablas, visualizaciones genómicas y contenido científico denso.',
          'Subtítulos, transcripciones o alternativas de texto cuando Pocket Genes publique medios que lo requieran.',
        ],
      },
      {
        heading: 'Metodología de pruebas',
        paragraphs: [
          'La revisión incluye controles de marcado semántico, teclado en páginas públicas, responsive, contraste, legibilidad e investigación de barreras reportadas.',
          'El programa previsto incluye herramientas automáticas, revisión manual de teclado, lectores de pantalla, escalado de texto, contraste, pruebas móviles y pruebas con personas con discapacidad. La declaración se actualizará a medida que esas pruebas se completen y documenten.',
        ],
      },
      {
        heading: 'Limitaciones conocidas',
        table: {
          headers: ['Función afectada', 'Impacto', 'Alternativa', 'Corrección prevista'],
          rows: [
            ['Informes de proveedores y recursos externos', 'Un PDF, portal o sitio externo puede no alcanzar el mismo objetivo.', 'Contactar a Pocket Genes o al proveedor por un camino o copia accesible.', 'Documentar límites y pedir alternativas accesibles a socios.'],
            ['Widgets de reserva o terceros', 'Teclado, lector o contraste dependen del componente externo.', 'Enviar la solicitud por email directo.', 'Revisar widgets y mantener fallback por email.'],
            ['Pantallas móviles aún no evaluadas por completo', 'Algunas etiquetas, foco, escalado o alternativas pueden requerir pruebas.', 'Reportar pantalla y tarea para asistencia o priorización.', 'Completar revisión de lector, escalado y áreas táctiles en flujos centrales.'],
            ['Información genómica visual', 'Gráficos o tablas densas pueden ser difíciles sin alternativas.', 'Solicitar explicación o formato alternativo.', 'Agregar resúmenes estructurados y etiquetas no solo por color.'],
          ],
        },
      },
      {
        heading: 'Proceso de feedback',
        paragraphs: [
          `Las barreras pueden reportarse a ${POCKET_GENES_EMAILS.accessibility}. Incluí página, pantalla, flujo, dispositivo, navegador, sistema operativo, versión de app, tecnología de asistencia, qué intentabas hacer, qué pasó y si bloquea cuenta, informe, consentimiento, comunidad o soporte.`,
          'Pocket Genes revisa reportes por gravedad e impacto. Si la primera respuesta no resuelve, respondé al mismo hilo y pedí revisión. Pocket Genes puede ofrecer formato alternativo o asistencia mientras evalúa una corrección.',
        ],
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Usar WCAG 2.2 Nivel AA como objetivo web público.',
          'No afirmar conformidad completa antes de evaluación documentada.',
          'Brindar canales de feedback y acceso alternativo.',
          'Priorizar barreras que bloquean cuenta, informes, consentimiento, comunidad, seguridad o soporte.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios, integradores y organizaciones',
        bullets: [
          'Los usuarios deben reportar barreras con detalle suficiente.',
          'Integradores y proveedores deben hacer accesibles informes y recursos que controlan.',
          'Las organizaciones deben publicar recursos y eventos accesibles y ofrecer alternativas cuando se pidan.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Pocket Genes no garantiza accesibilidad de informes de proveedores, sitios externos, tiendas, widgets o contenido de usuarios.',
          'Algunas remediaciones dependen de terceros o plataformas nativas.',
          'Seguridad o privacidad pueden limitar acceso asistido hasta verificar identidad.',
        ],
      },
      ...documentGovernanceEs([
        'Informar un incidente',
        'Política de Privacidad',
        'Diagrama de Flujo de Datos',
        'Términos de Servicio',
      ]),
    ],
  },
  {
    slug: 'scientific-methodology',
    title: 'Metodología Científica',
    category: 'Ciencia',
    summary:
      'Explica separación de hallazgos de proveedores, educación, fuentes, actualización, correcciones, contenido externo y límites clínicos.',
    owner: 'Revisión científica',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Esta metodología explica cómo Pocket Genes maneja información científica y educativa. Distingue hallazgos de proveedores, explicaciones educativas de Pocket Genes, glosario, contenido de organizaciones, contenido de usuarios, noticias, eventos y recursos externos.',
          'Pocket Genes no presenta hallazgos de proveedores como conclusiones generadas independientemente por Pocket Genes. Cuando el informe viene de un proveedor, ese proveedor conserva fuente y autoridad sobre hallazgos e interpretación clínica.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Usuarios que leen contenido educativo o glosario.',
          'Usuarios que acceden a informes conectados con proveedores.',
          'Organizaciones de confianza y editores que envían recursos educativos.',
          'Proveedores e integradores que usan Pocket Genes para educación posterior al resultado.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Hallazgo de proveedor', body: 'Resultado, interpretación, variante, panel, documento o conclusión aportada por el proveedor del informe.' },
          { heading: 'Contenido educativo de Pocket Genes', body: 'Contenido creado o curado por Pocket Genes para explicar terminología, conceptos, flujos o contexto general.' },
          { heading: 'Contenido de organización', body: 'Recursos, eventos, actualizaciones o publicaciones atribuidas a una organización externa.' },
          { heading: 'Interpretación clínica', body: 'Explicación médica o profesional de lo que un informe significa para diagnóstico, tratamiento, screening, planificación familiar o acción clínica.' },
          { heading: 'Corrección', body: 'Actualización que arregla error, fuente desactualizada, simplificación engañosa o problema de atribución.' },
        ],
      },
      {
        heading: 'Tipos de información científica',
        bullets: [
          'Hallazgos y documentos provistos por proveedores.',
          'Glosario, lecciones y explicaciones en lenguaje claro de Pocket Genes.',
          'Artículos, eventos, recursos y actualizaciones de organizaciones.',
          'Publicaciones, comentarios, preguntas y experiencias de usuarios.',
          'Noticias, eventos, recursos externos y materiales de apoyo.',
        ],
      },
      {
        heading: 'Ciclo de vida del contenido educativo',
        subsections: [
          { heading: 'Selección de temas', body: 'Los temas se eligen por flujos de producto, conceptos comunes de informes, confusión de usuarios, necesidades de proveedores u organizaciones y valor de seguridad.' },
          { heading: 'Investigación de fuentes', body: 'La redacción debe usar fuentes apropiadas al tema, como recursos gubernamentales o de salud pública, bases de genética realmente usadas, guías profesionales, literatura revisada por pares, documentación de proveedores y terminología científica estándar.' },
          { heading: 'Redacción y lenguaje claro', body: 'El contenido debe explicar sin cambiar el sentido de la fuente, sobredimensionar certeza ni implicar consejo médico.' },
          { heading: 'Revisión científica y aprobación', body: 'El material científico o clínicamente cercano debe revisarse por alguien con competencia genética, científica, clínica o de seguridad de producto antes de publicarse.' },
          { heading: 'Versionado y publicación', body: 'Los cambios materiales deben conservar versión o revisión cuando el contenido se usa en contextos regulados, de consentimiento, proveedor o seguridad.' },
          { heading: 'Revisión, corrección y retiro', body: 'El contenido debe revisarse por cadencia o cuando cambian fuentes, terminología, guías, expectativas de proveedor o riesgo. Lo desactualizado debe corregirse, etiquetarse o retirarse.' },
        ],
      },
      {
        heading: 'Evidencia y citas',
        paragraphs: [
          'Pocket Genes debe citar o identificar categorías de fuente cuando hace afirmaciones científicas más allá de definiciones básicas. Deben considerarse fechas de publicación, actualizaciones de guías, jerarquía de fuentes y evidencia conflictiva.',
          'Cuando la evidencia es incierta, cambiante o disputada, el contenido debe decirlo claramente. Simplificar debe ayudar a entender sin convertir incertidumbre en certeza.',
        ],
      },
      {
        heading: 'Organizaciones externas y contenido de usuarios',
        paragraphs: [
          'El contenido de organizaciones de confianza se atribuye a la organización y no se vuelve contenido científico de Pocket Genes por aparecer en la app. Debe cumplir estándares de contenido, promoción y seguridad.',
          'El contenido comunitario de usuarios refleja experiencia u opinión personal salvo identificación expresa. No es revisión científica, consejo médico, diagnóstico ni tratamiento.',
        ],
      },
      {
        heading: 'Inteligencia artificial',
        paragraphs: [
          'La asistencia de IA para redactar, traducir, resumir, categorizar o apoyar moderación puede usarse solo como ayuda y no debe publicar contenido científico o clínicamente cercano de forma autónoma.',
          'Se requiere revisión humana antes de presentar contenido educativo asistido por IA como contenido de Pocket Genes. Los errores pueden reportarse por el contacto del Centro de confianza y deben corregirse mediante revisión.',
        ],
      },
      {
        heading: 'Límite clínico',
        body:
          'Los usuarios deben contactar al proveedor del informe, profesional de salud o asesor genético cuando el informe genere preguntas de diagnóstico, tratamiento, screening, medicación, reproducción, riesgo familiar, síntomas urgentes o próximos pasos clínicos.',
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Separar hallazgos de proveedor, educación de Pocket Genes, contenido de organizaciones y contenido de usuarios.',
          'Usar fuentes realmente revisadas para el contenido.',
          'Comunicar incertidumbre y responsabilidad de fuente con claridad.',
          'Revisar, corregir, etiquetar o retirar contenido educativo desactualizado.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios, proveedores y organizaciones',
        bullets: [
          'Los usuarios deben usar educación para preparar preguntas, no para autodiagnóstico o autotratamiento.',
          'Los proveedores conservan responsabilidad por hallazgos e interpretación clínica.',
          'Las organizaciones responden por exactitud, fuentes, etiquetado y transparencia promocional de su contenido.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'La disponibilidad de fuentes, terminología y guías puede cambiar.',
          'Pocket Genes no verifica independientemente cada hallazgo de proveedor.',
          'Recursos externos pueden actualizarse o eliminarse sin aviso a Pocket Genes.',
        ],
      },
      ...documentGovernanceEs([
        'Declaración Regulatoria y de Uso Previsto',
        'Términos de Servicio',
        'Términos de Comunidad',
        'Estándares de Organizaciones de Confianza',
      ]),
    ],
  },
  {
    slug: 'regulatory-intended-use',
    title: 'Declaración Regulatoria y de Uso Previsto',
    category: 'Ciencia',
    summary:
      'Aclara qué está destinado a hacer Pocket Genes, para quién, en qué entorno y qué no está destinado a hacer.',
    owner: 'Producto y legal',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Esta declaración describe usuarios previstos, entorno, funciones y límites de Pocket Genes. Ayuda a usuarios, proveedores, organizaciones y revisores a entender para qué está diseñado el producto.',
          'La disponibilidad, clasificación legal y obligaciones regulatorias pueden variar por región y función. Pocket Genes debe revisar esta declaración antes de lanzar funciones clínicas, diagnósticas, de investigación o soporte de decisión materialmente distintas.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Adultos que reciben o acceden a informes genéticos.',
          'Madres, padres, tutores, cuidadores, familiares y aprendices mediante flujos autorizados.',
          'Profesionales y organizaciones que usan Pocket Genes como herramienta de acceso, educación o participación.',
          'Proveedores o integradores que ponen informes o recursos a disposición mediante Pocket Genes.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Uso previsto', body: 'Propósito y contexto para el que Pocket Genes se diseña, describe y ofrece.' },
          { heading: 'Usuario previsto', body: 'Persona u organización que se espera que use Pocket Genes para el propósito indicado.' },
          { heading: 'Responsabilidad del proveedor', body: 'Rol del proveedor en pruebas, emisión de informes, hallazgos y preguntas clínicas específicas.' },
          { heading: 'Educación y participación', body: 'Información general, organización, recursos, comunidad y preparación para ayudar a entender conceptos y próximos pasos.' },
        ],
      },
      {
        heading: 'Entorno previsto',
        body:
          'Pocket Genes es una plataforma móvil de acceso, educación, descubrimiento, comunidad y participación de consumidores/pacientes. No es sistema de laboratorio, historia clínica electrónica, emergencia, motor diagnóstico ni monitoreo clínico.',
      },
      {
        heading: 'Funciones previstas',
        bullets: [
          'Ayudar a usuarios autorizados a acceder a informes hechos por proveedores o experiencias conectadas.',
          'Organizar caminos de acceso, referencias, contexto educativo y recursos relacionados.',
          'Brindar educación general sobre terminología y conceptos genéticos.',
          'Ayudar a descubrir organizaciones, eventos, recursos y actualizaciones educativas.',
          'Soportar participación opcional en RareFriends.',
          'Ayudar a preparar preguntas para profesionales calificados.',
        ],
      },
      {
        heading: 'Responsabilidad del proveedor',
        paragraphs: [
          'Los proveedores realizan estudios, emiten informes, determinan hallazgos, controlan recursos y conservan responsabilidad por exactitud e interpretación clínica específica.',
          'Las preguntas sobre validez, clasificación, patogenicidad, diagnóstico, familia, tratamiento, screening o accionabilidad deben dirigirse al proveedor o profesional calificado.',
        ],
      },
      {
        heading: 'Límites de Pocket Genes',
        bullets: [
          'No realiza estudios genéticos.',
          'No genera resultados de laboratorio.',
          'No clasifica variantes ni determina patogenicidad de forma independiente.',
          'No calcula accionabilidad clínica salvo que un valor sea provisto por la fuente y presentado como tal.',
          'No diagnostica ni prescribe tratamiento.',
          'No monitorea emergencias, crisis ni triage clínico urgente.',
          'No garantiza que recursos, organizaciones, eventos o respuestas comunitarias sean adecuados para toda persona.',
          'No reemplaza asesoramiento médico, genético, legal o psicosocial profesional.',
        ],
      },
      {
        heading: 'Límites comunitarios y de terceros',
        paragraphs: [
          'La experiencia entre pares, publicaciones comunitarias, contenido de organizaciones e información de eventos no se convierten en consejo médico por aparecer en Pocket Genes. La condición de organización de confianza es una señal de revisión, no aval de todo servicio o afirmación.',
          'Los recursos externos de proveedores pueden tener términos, privacidad, accesibilidad, soporte y disponibilidad propios. Pueden dejar de estar disponibles sin depender de Pocket Genes.',
        ],
      },
      {
        heading: 'Niñez y cuidadores',
        body:
          'Niñas, niños, adolescentes y personas que necesitan asistencia deben usar Pocket Genes mediante madre, padre, tutor, cuidador, proveedor o representante autorizado cuando corresponda. El uso gestionado debe respetar autoridad, privacidad e interés de la persona cuya información se administra.',
      },
      {
        heading: 'Alcance geográfico y regulatorio',
        body:
          'La disponibilidad y estado legal de Pocket Genes puede variar por región, acuerdo de proveedor, tipo de integración y función. Esta declaración evita afirmar de manera amplia que Pocket Genes es o no es producto médico en todo mercado. Cualquier expansión material hacia diagnóstico, recomendación de tratamiento, interpretación de variantes, scoring de riesgo o soporte de decisión clínica debe activar revisión regulatoria.',
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Mantener el uso previsto alineado con la funcionalidad real.',
          'Separar acceso, educación, comunidad y responsabilidades de proveedores.',
          'Revisar uso previsto antes de expandir funcionalidad clínica o científica.',
          'No presentar educación, matching o comunidad como consejo clínico.',
        ],
      },
      {
        heading: 'Responsabilidades de usuarios, proveedores y organizaciones',
        bullets: [
          'Los usuarios deben buscar asesoramiento profesional para decisiones clínicas.',
          'Los proveedores conservan responsabilidad por informes e interpretación clínica.',
          'Las organizaciones deben etiquetar contenido y evitar afirmaciones fuera de su autoridad o evidencia.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'Una integración específica puede tener declaraciones de uso adicionales.',
          'Una función futura puede requerir análisis regulatorio separado.',
          'La ley local puede imponer restricciones u obligaciones adicionales.',
        ],
      },
      ...documentGovernanceEs([
        'Metodología Científica',
        'Términos de Servicio',
        'Política de Privacidad',
        'Diagrama de Flujo de Datos',
      ]),
    ],
  },
  {
    slug: 'trusted-organization-standards',
    title: 'Estándares de Organizaciones de Confianza',
    category: 'Comunidad',
    summary:
      'Explica cómo Pocket Genes revisa organizaciones, etiqueta contenido, maneja promoción, investiga quejas y limita el aval.',
    owner: 'Confianza y operaciones comunitarias',
    status: 'Publicado',
    ...baseDocumentMetaEs,
    sections: [
      {
        heading: 'Propósito y alcance',
        paragraphs: [
          'Estos estándares explican qué revisa Pocket Genes antes de dar a una organización un lugar de confianza y qué reglas aplican después de la aprobación.',
          'Las organizaciones de confianza pueden ayudar a personas que recibieron o están revisando un informe genético confuso a encontrar educación, recursos, eventos, apoyo y mejores preguntas. La confianza no es un plan comercial, garantía de calidad ni aval de cada servicio o afirmación.',
        ],
      },
      {
        heading: 'A quién se aplica',
        bullets: [
          'Organizaciones que solicitan o tienen estado de confianza.',
          'Administradores, equipo, profesionales, voluntarios y editores de organizaciones.',
          'Usuarios que siguen, reportan o interactúan con organizaciones.',
          'Revisores y moderadores de Pocket Genes.',
        ],
      },
      {
        heading: 'Definiciones',
        subsections: [
          { heading: 'Organización de confianza', body: 'Organización revisada por identidad, misión, valor comunitario, estándares de contenido y seguridad.' },
          { heading: 'Contenido de organización', body: 'Perfil, publicaciones, eventos, recursos, educación, enlaces, imágenes y llamadas a la acción publicados mediante funciones de organización.' },
          { heading: 'Contenido promocional', body: 'Contenido destinado a vender, reclutar, publicitar, generar leads, promover un servicio pago o dirigir a producto, proveedor, estudio, evento o programa.' },
          { heading: 'Límite de no aval', body: 'Regla por la cual el estado de confianza es una señal de participación, no aprobación de cada afirmación, servicio, profesional, producto, estudio o recurso externo.' },
        ],
      },
      {
        heading: 'Verificación y elegibilidad',
        bullets: [
          'La organización debe tener identidad pública clara, contacto responsable, misión real y relación relevante con genética, EPOF, apoyo a pacientes, educación, investigación, navegación, advocacy o recursos.',
          'Pocket Genes puede revisar sitio público, identidad de liderazgo o administradores, contacto, misión, jurisdicción, conflictos, ejemplos de contenido, postura de privacidad y valor comunitario.',
          'La organización debe explicar quién publica, quién revisa, cómo contactarla y cómo identifica promoción o patrocinio.',
        ],
      },
      {
        heading: 'Criterios de revisión',
        bullets: [
          'Identidad y responsabilidad.',
          'Valor comunitario relevante después de un resultado genético o para personas y familias que conviven con una EPOF.',
          'Utilidad, claridad, fuentes y revisión del contenido.',
          'Límites de privacidad y rechazo de presión por informes o códigos privados.',
          'Separación entre educación, apoyo, participación, recaudación, promoción y servicios médicos.',
          'Capacidad de responder quejas o correcciones.',
        ],
      },
      {
        heading: 'Etiquetado de contenido y promoción',
        paragraphs: [
          'El contenido de organización debe identificar al editor. Promoción, patrocinio, fundraising, reclutamiento, programas comerciales, servicios clínicos o oportunidades pagas deben etiquetarse claramente y no disfrazarse de educación neutral o apoyo entre pares.',
          'Las organizaciones no deben usar miedo, urgencia, incertidumbre diagnóstica, estrés de cuidadores o vulnerabilidad de EPOF para presionar compra de servicios, compartir informes, unirse a grupos externos o enviar datos personales fuera de Pocket Genes.',
        ],
      },
      {
        heading: 'Revisión continua, quejas y medidas',
        paragraphs: [
          `Los usuarios pueden quejarse de una organización reportando contenido o escribiendo a ${POCKET_GENES_EMAILS.trust}. Un reporte útil incluye nombre de organización, enlace o captura, fecha, preocupación y riesgo de privacidad o seguridad.`,
          'Pocket Genes puede revisar periódicamente el estado, pedir correcciones, agregar etiquetas, retirar contenido, pausar publicación, suspender confianza, remover organización o exigir nueva solicitud cuando no se cumplen estándares.',
        ],
      },
      {
        heading: 'Sin aval',
        body:
          'La confianza significa que Pocket Genes revisó a la organización para participar. No significa que Pocket Genes avale cada artículo, evento, proveedor, profesional, recurso, tratamiento, producto, campaña, estudio, ensayo o servicio conectado con esa organización.',
      },
      {
        heading: 'Responsabilidades de Pocket Genes',
        bullets: [
          'Revisar organizaciones antes de asignar confianza.',
          'Brindar etiquetado y vías de queja.',
          'Actuar proporcionalmente ante reportes.',
          'Suspender o remover confianza ante violaciones de privacidad, seguridad, promoción, identidad o contenido.',
        ],
      },
      {
        heading: 'Responsabilidades de la organización',
        bullets: [
          'Mantener identidad, contacto y misión precisos.',
          'Publicar contenido útil y revisado para pacientes, familias, cuidadores y personas que intentan entender resultados.',
          'Respetar límites de privacidad y no pedir enlaces o códigos privados mediante comunidad.',
          'Etiquetar promoción y conflictos claramente.',
          'Cooperar con correcciones, quejas y revisión periódica.',
        ],
      },
      {
        heading: 'Excepciones y límites',
        bullets: [
          'La revisión de Pocket Genes no verifica licencias profesionales salvo que un flujo específico lo indique.',
          'Pocket Genes puede no revisar cada página externa vinculada en tiempo real.',
          'Leyes locales, reglas profesionales y obligaciones de proveedor pueden imponer requisitos adicionales.',
        ],
      },
      ...documentGovernanceEs([
        'Términos de Comunidad',
        'Política de Seguridad Comunitaria',
        'Política de Privacidad',
        'Metodología Científica',
        'Términos de Servicio',
      ]),
    ],
  },
];

export function getLocalizedTrustDocuments(locale: PocketGenesPublicLocale) {
  return locale === 'es' ? trustDocumentsEs : trustDocuments;
}

export function getTrustDocument(slug: string, locale: PocketGenesPublicLocale = 'en') {
  return getLocalizedTrustDocuments(locale).find((document) => document.slug === slug);
}
