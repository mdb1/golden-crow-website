import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Dna,
  FileCode2,
  FlaskConical,
  Truck,
  Users,
} from "lucide-react";
import type { DoctorListItem, InstitutionRecord, PatientListItem } from "@/lib/admin-areas";
import { appText, type AppLanguage } from "@/lib/language";
import type { RoleAccessSpec, TwoPQTone } from "@/lib/two-pq-dashboard";

export type TwoPQAreaKey =
  | "cases"
  | "sampling"
  | "shipments"
  | "sequencing"
  | "reports"
  | "clients";

export type TwoPQCollectionKey =
  | "2pq_case"
  | "2pq_sampling"
  | "2pq_shipment"
  | "2pq_sequencing"
  | "2pq_report"
  | "2pq_client";

export interface TwoPQRecord {
  id: string;
  areaKey: TwoPQAreaKey;
  collectionKey: TwoPQCollectionKey;
  institutionId: string;
  doctorId: string;
  patientId?: string;
  parent_batch?: string;
  parent_case?: string;
  children_cases?: string[];
  children_sampling?: string[];
  three_letter_code?: string;
  stored_file_id?: string;
  last_updated_date?: string;
  caseLabel?: string;
  caseStatus?: string;
  caseType?: string;
  priority?: string;
  sampleId?: string;
  shipmentId?: string;
  trackingNumber?: string;
  requestedAt?: string;
  dueAt?: string;
  sampleType?: string;
  collectionDate?: string;
  receptionDate?: string;
  processingStatus?: string;
  runId?: string;
  qcStatus?: string;
  carrier?: string;
  dispatchDate?: string;
  deliveryDate?: string;
  deliveryStatus?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  platform?: string;
  scheduling?: string;
  analysisStatus?: string;
  providerName?: string;
  providerFormat?: string;
  phoneNumber?: string;
  reportCode?: string;
  uploadedReportId?: string;
  clientCaseStatus?: string;
  reportDelivery?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  preferredLanguage?: string;
  country?: string;
  roleEmail?: string;
  accessStatus?: string;
  communicationStatus?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdByEmail?: string;
  updatedByEmail?: string;
}

export type TwoPQMutableFieldKey = Exclude<
  keyof TwoPQRecord,
  | "id"
  | "areaKey"
  | "collectionKey"
  | "parent_batch"
  | "parent_case"
  | "children_cases"
  | "children_sampling"
  | "three_letter_code"
  | "stored_file_id"
  | "last_updated_date"
  | "createdAt"
  | "updatedAt"
  | "createdByEmail"
  | "updatedByEmail"
>;

export interface TwoPQListItem extends TwoPQRecord {
  institutionName?: string;
  doctorName?: string;
  patientName?: string;
  canReplace: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface TwoPQDetailRecord {
  record: TwoPQListItem;
  institution: InstitutionRecord | null;
  doctor: DoctorListItem | null;
  patient: PatientListItem | null;
  linkedBatch: TwoPQListItem | null;
  linkedCase: TwoPQListItem | null;
  linkedCases: TwoPQListItem[];
  linkedSamplings: TwoPQListItem[];
}

type TwoPQDisplayRecord = TwoPQRecord &
  Partial<Pick<TwoPQListItem, "institutionName" | "doctorName" | "patientName">>;

export interface TwoPQOption {
  value: string;
  label: string;
}

export interface TwoPQFieldConfig {
  key: TwoPQMutableFieldKey;
  label: string;
  type: "text" | "textarea" | "date" | "email" | "select";
  required?: boolean;
  placeholder?: string;
  description: string;
  optionSource?: "institutions" | "doctors" | "patients";
  options?: TwoPQOption[];
}

export interface TwoPQFieldGroup {
  title: string;
  description: string;
  fields: TwoPQFieldConfig[];
}

export interface TwoPQAreaConfig {
  key: TwoPQAreaKey;
  label: string;
  navLabel: string;
  route: string;
  collectionKey: TwoPQCollectionKey;
  icon: LucideIcon;
  tone: TwoPQTone;
  description: string;
  summary: string;
  helperTitle: string;
  helperBody: string;
  searchPlaceholder: string;
  createLabel: string;
  roleAccess: RoleAccessSpec[];
  fieldGroups: TwoPQFieldGroup[];
}

const ASSIGNED_SCOPE_ACCESS: RoleAccessSpec[] = [
  {
    role: "full_admin",
    scope: "global",
    capabilities: ["create", "read", "update", "delete"],
    note: "Full admins can create, replace, update, and delete records across every institution.",
  },
  {
    role: "institution_admin",
    scope: "institution",
    capabilities: ["create", "read", "update", "delete"],
    note: "Institution admins can fully manage records inside one institution boundary.",
  },
  {
    role: "institution_doctor",
    scope: "assigned",
    capabilities: ["create", "read", "update", "delete"],
    note: "Doctors can view their institution lane and write only records linked to their own doctor id.",
  },
  {
    role: "patient",
    scope: "no_access",
    capabilities: [],
    note: "Patients do not access the backoffice.",
  },
];

const CASE_STATUS_OPTIONS: TwoPQOption[] = [
  { value: "intake", label: "Intake" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
  { value: "reporting", label: "Reporting" },
  { value: "delivered", label: "Delivered" },
];

const PRIORITY_OPTIONS: TwoPQOption[] = [
  { value: "routine", label: "Routine" },
  { value: "priority", label: "Priority" },
  { value: "urgent", label: "Urgent" },
];

const PROCESSING_OPTIONS: TwoPQOption[] = [
  { value: "awaiting_reception", label: "Awaiting reception" },
  { value: "received", label: "Received" },
  { value: "processing", label: "Processing" },
  { value: "qc_hold", label: "QC hold" },
  { value: "ready_for_sequencing", label: "Ready for sequencing" },
];

const DELIVERY_OPTIONS: TwoPQOption[] = [
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "exception", label: "Exception" },
];

const ANALYSIS_OPTIONS: TwoPQOption[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
];

const REPORT_DELIVERY_OPTIONS: TwoPQOption[] = [
  { value: "pending", label: "Pending" },
  { value: "ready", label: "Ready" },
  { value: "sent", label: "Sent" },
  { value: "acknowledged", label: "Acknowledged" },
];

const ACCESS_STATUS_OPTIONS: TwoPQOption[] = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "locked", label: "Locked" },
];

export const TWO_PQ_AREA_CONFIGS: TwoPQAreaConfig[] = [
  {
    key: "cases",
    label: "2PQ Cases",
    navLabel: "2PQ Cases",
    route: "/2pq-dashboard/cases",
    collectionKey: "2pq_case",
    icon: ClipboardList,
    tone: "blue",
    description:
      "Case intake and orchestration records stored in Firebase under `2pq_case`.",
    summary:
      "This screen is the operational registry for case-level intake, ownership, and delivery tracking.",
    helperTitle: "Case records are now live Firebase documents.",
    helperBody:
      "Create establishes a new case document. Replace writes the full document shape. Update patches only changed fields. Delete removes the document from Firestore.",
    searchPlaceholder: "Search cases by label, status, tracking, priority, or patient...",
    createLabel: "New case",
    roleAccess: ASSIGNED_SCOPE_ACCESS,
    fieldGroups: [
      {
        title: "Ownership",
        description: "Institution, doctor, and patient anchors that drive permissions.",
        fields: [
          {
            key: "institutionId",
            label: "Institution",
            type: "select",
            required: true,
            optionSource: "institutions",
            description: "Institution root that owns the case.",
          },
          {
            key: "doctorId",
            label: "Doctor",
            type: "select",
            required: true,
            optionSource: "doctors",
            description: "Doctor lane that owns the case.",
          },
          {
            key: "patientId",
            label: "Patient",
            type: "select",
            optionSource: "patients",
            description: "Optional patient linkage for the case.",
          },
        ],
      },
      {
        title: "Case state",
        description: "Primary case identifiers and status.",
        fields: [
          {
            key: "caseLabel",
            label: "Case label",
            type: "text",
            required: true,
            placeholder: "CMS-2026-001",
            description: "Human-readable case identifier.",
          },
          {
            key: "caseStatus",
            label: "Case status",
            type: "select",
            required: true,
            options: CASE_STATUS_OPTIONS,
            description: "Main lifecycle state.",
          },
          {
            key: "caseType",
            label: "Case type",
            type: "text",
            placeholder: "Pharmacogenomics",
            description: "Clinical or operational case category.",
          },
          {
            key: "priority",
            label: "Priority",
            type: "select",
            options: PRIORITY_OPTIONS,
            description: "Queue priority or urgency.",
          },
        ],
      },
      {
        title: "Linked logistics",
        description: "Tracking and scheduling fields used by downstream shipment and report steps.",
        fields: [
          {
            key: "trackingNumber",
            label: "Tracking number",
            type: "text",
            placeholder: "1Z123456789",
            description: "External logistics tracking number.",
          },
          {
            key: "requestedAt",
            label: "Requested at",
            type: "date",
            description: "Original intake date.",
          },
          {
            key: "dueAt",
            label: "Due at",
            type: "date",
            description: "Expected completion date.",
          },
          {
            key: "notes",
            label: "Notes",
            type: "textarea",
            placeholder: "Escalations, blockers, or handoff detail...",
            description: "Free-form case notes.",
          },
        ],
      },
    ],
  },
  {
    key: "sampling",
    label: "2PQ Sampling",
    navLabel: "2PQ Sampling",
    route: "/2pq-dashboard/sampling",
    collectionKey: "2pq_sampling",
    icon: FlaskConical,
    tone: "mint",
    description:
      "Sampling and reception records stored in Firebase under `2pq_sampling`.",
    summary:
      "Use this area for accession, reception, processing status, and sample-specific notes.",
    helperTitle: "Sampling is a first-class CRUD surface now.",
    helperBody:
      "Every sampling record writes to Firestore and keeps the institution-doctor-patient linkage explicit.",
    searchPlaceholder: "Search sampling by case, sample, type, processing status, run, or patient...",
    createLabel: "New sampling record",
    roleAccess: ASSIGNED_SCOPE_ACCESS,
    fieldGroups: [
      {
        title: "Ownership",
        description: "Scope links for the sampling record.",
        fields: [
          {
            key: "institutionId",
            label: "Institution",
            type: "select",
            required: true,
            optionSource: "institutions",
            description: "Institution root.",
          },
          {
            key: "doctorId",
            label: "Doctor",
            type: "select",
            required: true,
            optionSource: "doctors",
            description: "Owning doctor lane.",
          },
          {
            key: "patientId",
            label: "Patient",
            type: "select",
            optionSource: "patients",
            description: "Optional patient reference.",
          },
        ],
      },
      {
        title: "Sampling state",
        description: "Primary sample metadata and progression.",
        fields: [
          {
            key: "caseLabel",
            label: "Case label",
            type: "text",
            required: true,
            placeholder: "CMS-2026-001",
            description: "Case identifier linked to sampling.",
          },
          {
            key: "sampleId",
            label: "Sample ID",
            type: "text",
            required: true,
            placeholder: "SAMP-00012",
            description: "Unique sample reference.",
          },
          {
            key: "sampleType",
            label: "Sample type",
            type: "text",
            required: true,
            placeholder: "Blood",
            description: "Type of sample collected.",
          },
          {
            key: "processingStatus",
            label: "Processing status",
            type: "select",
            required: true,
            options: PROCESSING_OPTIONS,
            description: "Current processing state.",
          },
          {
            key: "collectionDate",
            label: "Collection date",
            type: "date",
            description: "When the sample was collected.",
          },
          {
            key: "receptionDate",
            label: "Reception date",
            type: "date",
            description: "When the sample was received.",
          },
          {
            key: "runId",
            label: "Run ID",
            type: "text",
            placeholder: "SEQ-0007",
            description: "Optional sequencing run pointer.",
          },
          {
            key: "qcStatus",
            label: "QC status",
            type: "text",
            placeholder: "Passed",
            description: "Quality-control outcome.",
          },
          {
            key: "notes",
            label: "Notes",
            type: "textarea",
            placeholder: "Reception issues, missing tubes, or extraction notes...",
            description: "Sampling notes.",
          },
        ],
      },
    ],
  },
  {
    key: "shipments",
    label: "2PQ Shipments",
    navLabel: "2PQ Shipments",
    route: "/2pq-dashboard/shipments",
    collectionKey: "2pq_shipment",
    icon: Truck,
    tone: "amber",
    description:
      "Shipment and logistics records stored in Firebase under `2pq_shipment`.",
    summary:
      "Use shipments for carrier data, dispatch/delivery dates, and operational contact details.",
    helperTitle: "Shipment records now support full CRUD.",
    helperBody:
      "The list and detail screens write real Firestore data and keep logistics linked to institutions, doctors, and patients.",
    searchPlaceholder: "Search shipments by case, shipment, tracking, carrier, delivery state, or contact...",
    createLabel: "New shipment",
    roleAccess: ASSIGNED_SCOPE_ACCESS,
    fieldGroups: [
      {
        title: "Ownership",
        description: "Scope links for shipment coordination.",
        fields: [
          {
            key: "institutionId",
            label: "Institution",
            type: "select",
            required: true,
            optionSource: "institutions",
            description: "Institution root.",
          },
          {
            key: "doctorId",
            label: "Doctor",
            type: "select",
            required: true,
            optionSource: "doctors",
            description: "Owning doctor lane.",
          },
          {
            key: "patientId",
            label: "Patient",
            type: "select",
            optionSource: "patients",
            description: "Optional patient reference.",
          },
        ],
      },
      {
        title: "Shipment state",
        description: "Logistics and carrier data.",
        fields: [
          {
            key: "caseLabel",
            label: "Case label",
            type: "text",
            required: true,
            placeholder: "CMS-2026-001",
            description: "Linked case identifier.",
          },
          {
            key: "shipmentId",
            label: "Shipment ID",
            type: "text",
            required: true,
            placeholder: "SHIP-00003",
            description: "Internal shipment identifier.",
          },
          {
            key: "trackingNumber",
            label: "Tracking number",
            type: "text",
            required: true,
            placeholder: "1Z123456789",
            description: "External logistics tracking number.",
          },
          {
            key: "carrier",
            label: "Carrier",
            type: "text",
            placeholder: "UPS",
            description: "Shipping provider.",
          },
          {
            key: "dispatchDate",
            label: "Dispatch date",
            type: "date",
            description: "When the shipment left origin.",
          },
          {
            key: "deliveryDate",
            label: "Delivery date",
            type: "date",
            description: "When the shipment arrived.",
          },
          {
            key: "deliveryStatus",
            label: "Delivery status",
            type: "select",
            required: true,
            options: DELIVERY_OPTIONS,
            description: "Current delivery state.",
          },
        ],
      },
      {
        title: "Coordination",
        description: "Operational contact information.",
        fields: [
          {
            key: "contactName",
            label: "Contact name",
            type: "text",
            placeholder: "Logistics desk",
            description: "Primary contact.",
          },
          {
            key: "contactEmail",
            label: "Contact email",
            type: "email",
            placeholder: "logistics@example.com",
            description: "Contact email.",
          },
          {
            key: "contactPhone",
            label: "Contact phone",
            type: "text",
            placeholder: "+1 555 0100",
            description: "Contact phone.",
          },
          {
            key: "notes",
            label: "Notes",
            type: "textarea",
            placeholder: "Delivery exceptions, customs notes, or courier issues...",
            description: "Shipment notes.",
          },
        ],
      },
    ],
  },
  {
    key: "sequencing",
    label: "2PQ Sequencing",
    navLabel: "2PQ Sequencing",
    route: "/2pq-dashboard/sequencing",
    collectionKey: "2pq_sequencing",
    icon: Dna,
    tone: "violet",
    description:
      "Sequencing batch scheduling and analysis records stored in Firebase under `2pq_sequencing`.",
    summary:
      "This area covers batch scheduling, provider contacts, platform data, and analysis status.",
    helperTitle: "Sequencing batches are editable records now.",
    helperBody:
      "Use create, replace, update, and delete to manage sequencing batch work items directly in Firebase.",
    searchPlaceholder: "Search sequencing by batch, run, platform, analysis status, provider, or contact...",
    createLabel: "New sequencing batch",
    roleAccess: ASSIGNED_SCOPE_ACCESS,
    fieldGroups: [
      {
        title: "Ownership",
        description: "Scope links for sequencing records.",
        fields: [
          {
            key: "institutionId",
            label: "Institution",
            type: "select",
            required: true,
            optionSource: "institutions",
            description: "Institution root.",
          },
          {
            key: "doctorId",
            label: "Doctor",
            type: "select",
            required: true,
            optionSource: "doctors",
            description: "Owning doctor lane.",
          },
          {
            key: "patientId",
            label: "Patient",
            type: "select",
            optionSource: "patients",
            description: "Optional patient reference.",
          },
        ],
      },
      {
        title: "Batch state",
        description: "Main sequencing batch metadata.",
        fields: [
          {
            key: "caseLabel",
            label: "Batch label",
            type: "text",
            required: true,
            placeholder: "BATCH-APR-01",
            description: "Human-readable sequencing batch label.",
          },
          {
            key: "runId",
            label: "Batch / Run ID",
            type: "text",
            required: true,
            placeholder: "SEQ-0007",
            description: "Primary sequencing batch identifier.",
          },
          {
            key: "platform",
            label: "Platform",
            type: "text",
            required: true,
            placeholder: "Illumina NextSeq",
            description: "Sequencing platform or provider.",
          },
          {
            key: "scheduling",
            label: "Scheduling",
            type: "text",
            placeholder: "2026-04-05 AM slot",
            description: "Scheduling slot or note.",
          },
          {
            key: "analysisStatus",
            label: "Analysis status",
            type: "select",
            required: true,
            options: ANALYSIS_OPTIONS,
            description: "Current analysis state.",
          },
          {
            key: "providerName",
            label: "Provider name",
            type: "text",
            placeholder: "External lab",
            description: "Execution provider.",
          },
          {
            key: "providerFormat",
            label: "Provider format",
            type: "text",
            placeholder: "FASTQ + QC",
            description: "Provider output format.",
          },
        ],
      },
      {
        title: "Coordination",
        description: "Contacts used for run coordination.",
        fields: [
          {
            key: "contactName",
            label: "Contact name",
            type: "text",
            placeholder: "Lab scheduler",
            description: "Primary sequencing contact.",
          },
          {
            key: "contactEmail",
            label: "Contact email",
            type: "email",
            placeholder: "scheduler@example.com",
            description: "Sequencing contact email.",
          },
          {
            key: "phoneNumber",
            label: "Phone number",
            type: "text",
            placeholder: "+1 555 0101",
            description: "Sequencing contact phone.",
          },
          {
            key: "notes",
            label: "Notes",
            type: "textarea",
            placeholder: "Queue changes, platform swaps, or analysis blockers...",
            description: "Sequencing notes.",
          },
        ],
      },
    ],
  },
  {
    key: "reports",
    label: "2PQ Reports",
    navLabel: "2PQ Reports",
    route: "/2pq-dashboard/reports",
    collectionKey: "2pq_report",
    icon: FileCode2,
    tone: "rose",
    description:
      "Report-delivery records stored in Firebase under `2pq_report`.",
    summary:
      "Use this area for report codes, uploaded report linkage, client delivery state, and provider metadata.",
    helperTitle: "2PQ reports are separate from the legacy reports module.",
    helperBody:
      "These records live in their own Firestore collection but stay linked to institutions, doctors, patients, and existing report identifiers.",
    searchPlaceholder: "Search reports by case, report code, delivery state, provider, upload, or patient...",
    createLabel: "New report record",
    roleAccess: ASSIGNED_SCOPE_ACCESS,
    fieldGroups: [
      {
        title: "Ownership",
        description: "Scope links for report delivery records.",
        fields: [
          {
            key: "institutionId",
            label: "Institution",
            type: "select",
            required: true,
            optionSource: "institutions",
            description: "Institution root.",
          },
          {
            key: "doctorId",
            label: "Doctor",
            type: "select",
            required: true,
            optionSource: "doctors",
            description: "Owning doctor lane.",
          },
          {
            key: "patientId",
            label: "Patient",
            type: "select",
            optionSource: "patients",
            description: "Optional patient reference.",
          },
        ],
      },
      {
        title: "Report state",
        description: "Primary report metadata and delivery state.",
        fields: [
          {
            key: "caseLabel",
            label: "Case label",
            type: "text",
            required: true,
            placeholder: "CMS-2026-001",
            description: "Linked case identifier.",
          },
          {
            key: "reportCode",
            label: "Report code",
            type: "text",
            required: true,
            placeholder: "PG-ABC123",
            description: "External or internal report code.",
          },
          {
            key: "uploadedReportId",
            label: "Uploaded report ID",
            type: "text",
            placeholder: "upload_001",
            description: "Linked uploaded report id.",
          },
          {
            key: "providerName",
            label: "Provider name",
            type: "text",
            placeholder: "PocketGenes",
            description: "Provider or reporting lab.",
          },
          {
            key: "providerFormat",
            label: "Provider format",
            type: "text",
            placeholder: "PDF",
            description: "Provider output format.",
          },
          {
            key: "clientCaseStatus",
            label: "Client case status",
            type: "text",
            required: true,
            placeholder: "Ready for review",
            description: "Client-facing case status.",
          },
          {
            key: "reportDelivery",
            label: "Report delivery",
            type: "select",
            required: true,
            options: REPORT_DELIVERY_OPTIONS,
            description: "Client delivery state.",
          },
          {
            key: "deliveryDate",
            label: "Delivery date",
            type: "date",
            description: "When the report was delivered.",
          },
          {
            key: "notes",
            label: "Notes",
            type: "textarea",
            placeholder: "Delivery blockers, provider clarifications, or clinician notes...",
            description: "Report notes.",
          },
        ],
      },
    ],
  },
  {
    key: "clients",
    label: "2PQ Providers",
    navLabel: "2PQ Providers",
    route: "/2pq-dashboard/clients",
    collectionKey: "2pq_client",
    icon: Users,
    tone: "slate",
    description:
      "Provider and access-facing records stored in Firebase under `2pq_client`.",
    summary:
      "Use this area for provider contact state, communication status, preferred language, and role-linked access visibility.",
    helperTitle: "Provider access records are now editable documents.",
    helperBody:
      "These records let operators manage real provider-facing state while keeping institution, doctor, patient, and role links visible.",
    searchPlaceholder: "Search providers by name, email, phone, language, country, role email, or communication status...",
    createLabel: "New provider",
    roleAccess: ASSIGNED_SCOPE_ACCESS,
    fieldGroups: [
      {
        title: "Ownership",
        description: "Scope links for client-facing records.",
        fields: [
          {
            key: "institutionId",
            label: "Institution",
            type: "select",
            required: true,
            optionSource: "institutions",
            description: "Institution root.",
          },
          {
            key: "doctorId",
            label: "Doctor",
            type: "select",
            required: true,
            optionSource: "doctors",
            description: "Owning doctor lane.",
          },
          {
            key: "patientId",
            label: "Patient",
            type: "select",
            optionSource: "patients",
            description: "Optional patient reference.",
          },
        ],
      },
      {
        title: "Provider identity",
        description: "Primary provider contact fields.",
        fields: [
          {
            key: "clientName",
            label: "Provider name",
            type: "text",
            required: true,
            placeholder: "Federico Bustos",
            description: "Provider-facing name.",
          },
          {
            key: "clientEmail",
            label: "Provider email",
            type: "email",
            required: true,
            placeholder: "federico@example.com",
            description: "Primary provider email.",
          },
          {
            key: "clientPhone",
            label: "Provider phone",
            type: "text",
            placeholder: "+54 11 5555 5555",
            description: "Primary provider phone.",
          },
          {
            key: "preferredLanguage",
            label: "Preferred language",
            type: "text",
            placeholder: "Spanish",
            description: "Communication preference.",
          },
          {
            key: "country",
            label: "Country",
            type: "text",
            placeholder: "Argentina",
            description: "Country or region.",
          },
        ],
      },
      {
        title: "Access and communication",
        description: "Role-linked state and communication tracking.",
        fields: [
          {
            key: "roleEmail",
            label: "Role email",
            type: "email",
            placeholder: "operator@example.com",
            description: "Backoffice role email associated with this provider lane.",
          },
          {
            key: "accessStatus",
            label: "Access status",
            type: "select",
            options: ACCESS_STATUS_OPTIONS,
            description: "Provider access status.",
          },
          {
            key: "communicationStatus",
            label: "Communication status",
            type: "text",
            placeholder: "Awaiting confirmation",
            description: "Communication state with the provider.",
          },
          {
            key: "notes",
            label: "Notes",
            type: "textarea",
            placeholder: "Communication notes, consent status, or support context...",
            description: "Provider notes.",
          },
        ],
      },
    ],
  },
];

export function getTwoPQAreaConfig(areaKey: string) {
  return TWO_PQ_AREA_CONFIGS.find((area) => area.key === areaKey);
}

export function translateTwoPQAreaConfig(
  area: TwoPQAreaConfig,
  language: AppLanguage
): TwoPQAreaConfig {
  const t = (text: string) => appText(language, text);

  return {
    ...area,
    label: t(area.label),
    navLabel: t(area.navLabel),
    description: t(area.description),
    summary: t(area.summary),
    helperTitle: t(area.helperTitle),
    helperBody: t(area.helperBody),
    searchPlaceholder: t(area.searchPlaceholder),
    createLabel: t(area.createLabel),
    roleAccess: area.roleAccess.map((entry) => ({
      ...entry,
      note: t(entry.note),
    })),
    fieldGroups: area.fieldGroups.map((group) => ({
      ...group,
      title: t(group.title),
      description: t(group.description),
      fields: group.fields.map((field) => ({
        ...field,
        label: t(field.label),
        placeholder: field.placeholder ? t(field.placeholder) : field.placeholder,
        description: t(field.description),
        options: field.options?.map((option) => ({
          ...option,
          label: t(option.label),
        })),
      })),
    })),
  };
}

export function getTwoPQRecordTitle(area: TwoPQAreaConfig, record: TwoPQDisplayRecord) {
  if (area.key === "clients") {
    return record.clientName ?? record.id;
  }

  if (area.key === "reports") {
    return record.reportCode ?? record.caseLabel ?? record.id;
  }

  if (area.key === "sequencing") {
    return record.runId ?? record.caseLabel ?? record.id;
  }

  if (area.key === "shipments") {
    return record.shipmentId ?? record.caseLabel ?? record.id;
  }

  if (area.key === "sampling") {
    return record.sampleId ?? record.caseLabel ?? record.id;
  }

  return record.caseLabel ?? record.id;
}

export function getTwoPQRecordSubtitle(area: TwoPQAreaConfig, record: TwoPQDisplayRecord) {
  if (area.key === "clients") {
    return [
      record.clientEmail,
      record.clientPhone,
      record.preferredLanguage,
      record.country,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return [
    record.patientName,
    record.doctorName,
    record.caseStatus ?? record.processingStatus ?? record.deliveryStatus ?? record.analysisStatus,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function getTwoPQStatusPills(record: TwoPQDisplayRecord) {
  return [
    record.caseStatus,
    record.processingStatus,
    record.deliveryStatus,
    record.analysisStatus,
    record.reportDelivery,
    record.accessStatus,
  ].filter(Boolean) as string[];
}
