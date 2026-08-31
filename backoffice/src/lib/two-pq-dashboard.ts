import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CircleDot,
  ClipboardList,
  Dna,
  FileCode2,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  ShieldUser,
  Sparkles,
  Stethoscope,
  Truck,
  UserPlus,
  Users,
} from "lucide-react";
import type { AdminRole } from "@/lib/admin-areas";

const AREA_ADMIN_ROLES: AdminRole[] = [
  "full_admin",
  "institution_admin",
  "institution_operator",
  "institution_laboratory_staff",
  "institution_doctor",
];
const FULL_ADMIN_ROLES: AdminRole[] = ["full_admin"];

export const CRUD_CAPABILITIES = [
  "create",
  "read",
  "update",
  "delete",
] as const;
export type CrudCapability = (typeof CRUD_CAPABILITIES)[number];
export type AccessScope =
  "global" | "institution" | "assigned" | "read_only" | "no_access";
export type TwoPQTone = "blue" | "mint" | "amber" | "violet" | "rose" | "slate";

export interface RoleAccessSpec {
  role: AdminRole;
  scope: AccessScope;
  capabilities: CrudCapability[];
  note: string;
}

function institutionOperatorNote(note: string) {
  return note
    .replace(/Institution admins/g, "Institution operators")
    .replace(/Institution admin/g, "Institution operator")
    .replace(/institution admins/g, "institution operators")
    .replace(/institution admin/g, "institution operator");
}

function institutionLaboratoryStaffNote(note: string) {
  return note
    .replace(/^Institution operators/g, "Institution laboratory staff")
    .replace(/^Institution operator/g, "Institution laboratory staff")
    .replace(/^Institution admins/g, "Institution laboratory staff")
    .replace(/^Institution admin/g, "Institution laboratory staff");
}

function withInstitutionOperatorAccess(
  entries: RoleAccessSpec[],
): RoleAccessSpec[] {
  const expandedEntries = entries.some(
    (entry) => entry.role === "institution_operator",
  )
    ? [...entries]
    : entries.flatMap((entry) =>
        entry.role === "institution_admin"
          ? [
              entry,
              {
                ...entry,
                role: "institution_operator" as const,
                capabilities: [...entry.capabilities],
                note: institutionOperatorNote(entry.note),
              },
            ]
          : [entry],
      );
  const operatorEntry = expandedEntries.find(
    (entry) => entry.role === "institution_operator",
  );
  if (
    !operatorEntry ||
    expandedEntries.some(
      (entry) => entry.role === "institution_laboratory_staff",
    )
  ) {
    return expandedEntries;
  }

  return expandedEntries.flatMap((entry) =>
    entry === operatorEntry
      ? [
          entry,
          {
            ...operatorEntry,
            role: "institution_laboratory_staff" as const,
            capabilities: [...operatorEntry.capabilities],
            note: institutionLaboratoryStaffNote(operatorEntry.note),
          },
        ]
      : [entry],
  );
}

export interface TwoPQRouteLink {
  label: string;
  href: string;
  visibleRoles?: AdminRole[];
}

export interface TwoPQFieldSpec {
  label: string;
  source: string;
  detail: string;
}

export interface TwoPQFieldGroup {
  title: string;
  description: string;
  fields: TwoPQFieldSpec[];
}

export interface TwoPQWorkflowAreaSpec {
  key:
    | "dashboard"
    | "cases"
    | "samples"
    | "shipments"
    | "sequencing_runs"
    | "reports"
    | "clients";
  label: string;
  shortLabel: string;
  description: string;
  summary: string;
  icon: LucideIcon;
  tone: TwoPQTone;
  chips: string[];
  quickLinks: TwoPQRouteLink[];
  fieldGroups: TwoPQFieldGroup[];
  roleAccess: RoleAccessSpec[];
}

export interface BackofficeAreaSpec {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: TwoPQTone;
  visibleRoles?: AdminRole[];
  chips: string[];
}

export interface AdminSurfaceSpec {
  key: "institutions" | "doctors" | "patients" | "roles";
  label: string;
  description: string;
  highlights: string[];
  roleAccess: RoleAccessSpec[];
}

const BASE_TWO_PQ_WORKFLOW_AREAS: TwoPQWorkflowAreaSpec[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    shortLabel: "Dashboard",
    description:
      "The orchestration layer for all 2PQ traffic: area handoffs, live scope boundaries, and direct routes into the current backoffice.",
    summary:
      "Use this as the intake map before jumping into institutions, doctors, patients, roles, reports, or other live surfaces.",
    icon: LayoutDashboard,
    tone: "blue",
    chips: ["Hub", "Cross-area", "Permission aware"],
    quickLinks: [
      { label: "Overview", href: "/", visibleRoles: AREA_ADMIN_ROLES },
      {
        label: "2PQ dashboard",
        href: "/2pq-dashboard",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      {
        label: "Institutions",
        href: "/areas/institutions",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      { label: "Reports", href: "/reports", visibleRoles: FULL_ADMIN_ROLES },
    ],
    fieldGroups: [
      {
        title: "Operational overview",
        description:
          "Top-level tiles and counts that let operators route work without guessing.",
        fields: [
          {
            label: "scopeLane",
            source: "Permissions",
            detail:
              "Current operator lane: global, institution scoped, assigned doctor scope, or locked.",
          },
          {
            label: "institutionCount",
            source: "Institutions",
            detail:
              "Current institution footprint visible from the live area model.",
          },
          {
            label: "doctorCount",
            source: "Doctors",
            detail: "Doctor roster count inside the currently visible scope.",
          },
          {
            label: "patientCount",
            source: "Patients",
            detail: "Patient registry volume currently exposed to the role.",
          },
        ],
      },
      {
        title: "Routing controls",
        description:
          "Fast links that keep the dashboard interoperable with the live shell.",
        fields: [
          {
            label: "primaryArea",
            source: "2PQ",
            detail:
              "The workflow area the operator should enter first: cases, samples, shipments, reports, or clients.",
          },
          {
            label: "linkedRoute",
            source: "Backoffice",
            detail:
              "The concrete route that already exists today and backs the workflow card.",
          },
          {
            label: "accessState",
            source: "Permissions",
            detail:
              "Pill-driven access state that makes read-only and locked areas obvious.",
          },
          {
            label: "handoffStatus",
            source: "2PQ",
            detail:
              "Whether the current task is still in intake, in motion, in sequencing, or ready for reporting.",
          },
        ],
      },
      {
        title: "Cross-area governance",
        description:
          "The identifiers that tie together area work without hiding the existing model.",
        fields: [
          {
            label: "institutionId",
            source: "Institutions",
            detail:
              "Institution root that anchors local access and clinical ownership.",
          },
          {
            label: "doctorId",
            source: "Doctors",
            detail:
              "Doctor scope used for assigned edits, patient ownership, and sequencing visibility.",
          },
          {
            label: "patientId",
            source: "Patients",
            detail:
              "Patient sheet identifier used for case-level and report-level context.",
          },
          {
            label: "roleEmail",
            source: "Roles",
            detail:
              "Email-scoped role record that explains why this operator can or cannot act.",
          },
        ],
      },
    ],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["read"],
        note: "Full admins use the dashboard as the global command surface for every live module.",
      },
      {
        role: "institution_admin",
        scope: "institution",
        capabilities: ["read"],
        note: "Institution admins can inspect the full 2PQ map, but every linked action stays inside one institution.",
      },
      {
        role: "institution_doctor",
        scope: "assigned",
        capabilities: ["read"],
        note: "Doctors use the shell to navigate but act only on their own doctor lane and patient roster.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not enter the backoffice.",
      },
    ],
  },
  {
    key: "cases",
    label: "Cases",
    shortLabel: "Cases",
    description:
      "Case intake and registry control that ties together institution ownership, doctor ownership, patient identity, and status transitions.",
    summary:
      "This area is the bridge between the PDF’s central case ring and the live institution-doctor-patient model already present in the SDK.",
    icon: ClipboardList,
    tone: "blue",
    chips: ["Registry", "Intake", "Scope mapped"],
    quickLinks: [
      {
        label: "Institutions",
        href: "/areas/institutions",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      {
        label: "Doctors",
        href: "/areas/doctors",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      {
        label: "Patients",
        href: "/areas/patients",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      { label: "Roles", href: "/roles", visibleRoles: AREA_ADMIN_ROLES },
    ],
    fieldGroups: [
      {
        title: "Case identity",
        description:
          "The record keys that let operators open the right case without context loss.",
        fields: [
          {
            label: "caseId",
            source: "2PQ",
            detail:
              "Human-readable case key surfaced in the central ring and downstream report delivery.",
          },
          {
            label: "caseStatus",
            source: "2PQ",
            detail:
              "Lifecycle flag such as intake, in processing, in sequencing, reporting, or delivered.",
          },
          {
            label: "institutionId",
            source: "Institutions",
            detail:
              "Institution root that owns the case and determines institution-admin scope.",
          },
          {
            label: "doctorId",
            source: "Doctors",
            detail:
              "Doctor owner that determines assigned-doctor access and local patient control.",
          },
        ],
      },
      {
        title: "Clinical routing",
        description:
          "Patient-facing and logistics-facing identifiers carried across the workflow.",
        fields: [
          {
            label: "patientId",
            source: "Patients",
            detail:
              "Patient reference that keeps case work anchored to the patient sheet.",
          },
          {
            label: "sampleId",
            source: "Samples",
            detail:
              "Primary sample pointer used for accession, reception, and processing handoff.",
          },
          {
            label: "shipmentId",
            source: "Shipments",
            detail:
              "Shipment pointer that links intake to dispatch and receipt checkpoints.",
          },
          {
            label: "trackingNumber",
            source: "Shipments",
            detail:
              "Carrier-facing identifier surfaced again in reports and client communication.",
          },
        ],
      },
      {
        title: "Operational governance",
        description:
          "Fields that explain urgency, ownership, and permission coverage.",
        fields: [
          {
            label: "priority",
            source: "2PQ",
            detail:
              "Urgency or escalation state that makes queue triage readable.",
          },
          {
            label: "requestedAt",
            source: "2PQ",
            detail: "Timestamp for intake and service-level timing.",
          },
          {
            label: "roleEmail",
            source: "Roles",
            detail:
              "Email role record used to justify who can update or only inspect the case.",
          },
          {
            label: "notes",
            source: "2PQ",
            detail:
              "Operator notes covering blockers, handoffs, and exceptions.",
          },
        ],
      },
    ],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["create", "read", "update", "delete"],
        note: "Full admins can operate the whole case lane and resolve cross-institution issues.",
      },
      {
        role: "institution_admin",
        scope: "institution",
        capabilities: ["create", "read", "update", "delete"],
        note: "Institution admins can run case operations inside one institution boundary.",
      },
      {
        role: "institution_doctor",
        scope: "assigned",
        capabilities: ["create", "read", "update"],
        note: "Doctors can work their own case lane but should not remove case history.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not access case operations here.",
      },
    ],
  },
  {
    key: "samples",
    label: "Samples",
    shortLabel: "Samples",
    description:
      "Sample accession, reception, and processing lane that keeps laboratory work tied to the clinical owner and patient record.",
    summary:
      "Sample cards keep the PDF’s lab-centric area explicit while still using the existing institution, doctor, patient, and report relationships.",
    icon: CircleDot,
    tone: "mint",
    chips: ["Lab lane", "Accession", "Patient linked"],
    quickLinks: [
      {
        label: "Patients",
        href: "/areas/patients",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      {
        label: "Doctors",
        href: "/areas/doctors",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      { label: "Reports", href: "/reports", visibleRoles: FULL_ADMIN_ROLES },
      {
        label: "Uploaded reports",
        href: "/collections/uploaded_reports",
        visibleRoles: FULL_ADMIN_ROLES,
      },
    ],
    fieldGroups: [
      {
        title: "Accession identifiers",
        description: "The fields that keep every sample traceable.",
        fields: [
          {
            label: "sampleId",
            source: "2PQ",
            detail:
              "Unique sample identifier exposed again in cases, shipments, and sequencing runs.",
          },
          {
            label: "caseId",
            source: "Cases",
            detail: "Case pointer tying the sample to the intake workflow.",
          },
          {
            label: "patientId",
            source: "Patients",
            detail:
              "Patient anchor used to keep sample history clinically meaningful.",
          },
          {
            label: "runId",
            source: "Sequencing runs",
            detail:
              "Optional sequencing-run pointer once the sample is scheduled downstream.",
          },
        ],
      },
      {
        title: "Collection and reception",
        description: "Operational fields for physical intake and custody.",
        fields: [
          {
            label: "sampleType",
            source: "2PQ",
            detail:
              "Blood, saliva, kit return, or another supported accession type.",
          },
          {
            label: "collectedAt",
            source: "2PQ",
            detail: "Collection timestamp for chain-of-custody traceability.",
          },
          {
            label: "receivedAt",
            source: "2PQ",
            detail:
              "Sample reception timestamp once the specimen is accepted into the workflow.",
          },
          {
            label: "receptionStatus",
            source: "2PQ",
            detail:
              "Pending, received, rejected, held, or another operational reception state.",
          },
        ],
      },
      {
        title: "Processing state",
        description:
          "Fields that turn sample handling into a readable CRUD workflow.",
        fields: [
          {
            label: "processingStatus",
            source: "2PQ",
            detail:
              "Extraction, queued, processing, QC blocked, or ready for sequencing.",
          },
          {
            label: "doctorId",
            source: "Doctors",
            detail: "Owning doctor lane for scoped edits and follow-up.",
          },
          {
            label: "institutionId",
            source: "Institutions",
            detail:
              "Institution root for logistics accountability and admin coverage.",
          },
          {
            label: "notes",
            source: "2PQ",
            detail: "Sample-specific issues, exceptions, and processing notes.",
          },
        ],
      },
    ],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["create", "read", "update", "delete"],
        note: "Full admins can manage the complete sample lifecycle everywhere.",
      },
      {
        role: "institution_admin",
        scope: "institution",
        capabilities: ["create", "read", "update", "delete"],
        note: "Institution admins can run sample operations for their institution end to end.",
      },
      {
        role: "institution_doctor",
        scope: "assigned",
        capabilities: ["create", "read", "update"],
        note: "Doctors can manage sample state for their own patient roster.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not handle sample administration in the backoffice.",
      },
    ],
  },
  {
    key: "shipments",
    label: "Shipments",
    shortLabel: "Shipments",
    description:
      "Logistics lane for outbound and inbound sample movement, tracking numbers, carrier coordination, and exception handling.",
    summary:
      "This area mirrors the PDF’s shipment stages while staying attached to institution, doctor, patient, and report context.",
    icon: Truck,
    tone: "amber",
    chips: ["Logistics", "Tracking", "Chain of custody"],
    quickLinks: [
      {
        label: "Institutions",
        href: "/areas/institutions",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      {
        label: "Patients",
        href: "/areas/patients",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      { label: "Reports", href: "/reports", visibleRoles: FULL_ADMIN_ROLES },
      {
        label: "Uploaded reports",
        href: "/collections/uploaded_reports",
        visibleRoles: FULL_ADMIN_ROLES,
      },
    ],
    fieldGroups: [
      {
        title: "Dispatch record",
        description:
          "The transport identifiers needed to move work across sites.",
        fields: [
          {
            label: "shipmentId",
            source: "2PQ",
            detail:
              "Internal logistics identifier for the shipment envelope or batch.",
          },
          {
            label: "trackingNumber",
            source: "2PQ",
            detail:
              "Carrier tracking number reused in case and client communication.",
          },
          {
            label: "carrier",
            source: "2PQ",
            detail: "Courier or shipping provider responsible for the move.",
          },
          {
            label: "dispatchDate",
            source: "2PQ",
            detail: "Date the shipment left the origin site.",
          },
        ],
      },
      {
        title: "Chain of custody",
        description: "Fields that document what is in motion and who owns it.",
        fields: [
          {
            label: "sampleIds",
            source: "Samples",
            detail: "List of samples contained in the shipment batch.",
          },
          {
            label: "originInstitutionId",
            source: "Institutions",
            detail: "Institution that dispatched the shipment.",
          },
          {
            label: "destinationLab",
            source: "2PQ",
            detail: "Receiving destination for sequencing or processing.",
          },
          {
            label: "doctorId",
            source: "Doctors",
            detail: "Owning doctor lane used to keep responsibility visible.",
          },
        ],
      },
      {
        title: "Coordination fields",
        description:
          "Contact and exception data for real-world logistics work.",
        fields: [
          {
            label: "contactName",
            source: "2PQ",
            detail:
              "Primary shipment contact for delivery or exception resolution.",
          },
          {
            label: "contactEmail",
            source: "2PQ",
            detail:
              "Operational email used for carrier or laboratory communication.",
          },
          {
            label: "contactPhone",
            source: "2PQ",
            detail: "Phone number for time-sensitive logistics follow-up.",
          },
          {
            label: "deliveryStatus",
            source: "2PQ",
            detail: "Pending, in transit, delivered, delayed, or exception.",
          },
        ],
      },
    ],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["create", "read", "update", "delete"],
        note: "Full admins can manage all shipment and tracking state globally.",
      },
      {
        role: "institution_admin",
        scope: "institution",
        capabilities: ["create", "read", "update"],
        note: "Institution admins can coordinate shipment activity for their institution, but destructive cleanup should stay deliberate.",
      },
      {
        role: "institution_doctor",
        scope: "assigned",
        capabilities: ["read", "update"],
        note: "Doctors can follow and annotate logistics for their own patient lane.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not administer shipments in the backoffice.",
      },
    ],
  },
  {
    key: "sequencing_runs",
    label: "Sequencing Batches",
    shortLabel: "Batches",
    description:
      "Scheduling and execution lane for sequencing batches, provider coordination, platform metadata, and analysis readiness.",
    summary:
      "This is the right-hand sequencing batch control panel from the PDF translated into the current permission model.",
    icon: Dna,
    tone: "violet",
    chips: ["Scheduling", "Provider handoff", "Run control"],
    quickLinks: [
      {
        label: "Doctors",
        href: "/areas/doctors",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      {
        label: "Patients",
        href: "/areas/patients",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      { label: "Reports", href: "/reports", visibleRoles: FULL_ADMIN_ROLES },
      {
        label: "Uploaded reports",
        href: "/collections/uploaded_reports",
        visibleRoles: FULL_ADMIN_ROLES,
      },
    ],
    fieldGroups: [
      {
        title: "Run identity",
        description: "The core metadata for the run itself.",
        fields: [
          {
            label: "runId",
            source: "2PQ",
            detail:
              "Primary sequencing run identifier linked back to samples and reports.",
          },
          {
            label: "platform",
            source: "2PQ",
            detail: "Sequencer platform or provider execution environment.",
          },
          {
            label: "panel",
            source: "2PQ",
            detail: "Assay or panel used for the run.",
          },
          {
            label: "analysisStatus",
            source: "2PQ",
            detail:
              "Queued, running, failed, completed, or ready for reporting.",
          },
        ],
      },
      {
        title: "Scheduling lane",
        description:
          "The exact fields called out on the PDF’s sequencing panel.",
        fields: [
          {
            label: "scheduling",
            source: "2PQ",
            detail:
              "Planned slot, provider queue, or appointment-style scheduling note.",
          },
          {
            label: "contactName",
            source: "2PQ",
            detail:
              "Operational owner for the sequencing provider or lab contact.",
          },
          {
            label: "email",
            source: "2PQ",
            detail: "Email for scheduling coordination and escalation.",
          },
          {
            label: "phoneNumber",
            source: "2PQ",
            detail: "Phone number for same-day sequencing coordination.",
          },
        ],
      },
      {
        title: "Clinical linkage",
        description:
          "How run activity stays interoperable with the current model.",
        fields: [
          {
            label: "institutionId",
            source: "Institutions",
            detail:
              "Institution scope used to keep sequencing visibility local when required.",
          },
          {
            label: "doctorId",
            source: "Doctors",
            detail: "Doctor lane that requested or owns the downstream result.",
          },
          {
            label: "sampleIds",
            source: "Samples",
            detail: "Samples batched into the run.",
          },
          {
            label: "uploadedReportId",
            source: "Reports",
            detail:
              "Uploaded report document created once the run resolves into report output.",
          },
        ],
      },
    ],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["create", "read", "update", "delete"],
        note: "Full admins can schedule, reroute, or close out sequencing activity everywhere.",
      },
      {
        role: "institution_admin",
        scope: "institution",
        capabilities: ["read", "update"],
        note: "Institution admins can coordinate run state for their institution but should not own platform cleanup globally.",
      },
      {
        role: "institution_doctor",
        scope: "assigned",
        capabilities: ["read"],
        note: "Doctors can inspect sequencing progress for their own lane without broad scheduling power.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not access sequencing administration in the backoffice.",
      },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    shortLabel: "Reports",
    description:
      "Report generation and delivery lane covering report codes, uploads, provider metadata, and client-facing handoff state.",
    summary:
      "This stays tightly interoperable with the existing reports module and makes report delivery visible from the 2PQ shell.",
    icon: FileCode2,
    tone: "rose",
    chips: ["Delivery", "Provider data", "Client status"],
    quickLinks: [
      { label: "Reports", href: "/reports", visibleRoles: FULL_ADMIN_ROLES },
      {
        label: "Report codes",
        href: "/collections/report_codes",
        visibleRoles: FULL_ADMIN_ROLES,
      },
      {
        label: "Uploaded reports",
        href: "/collections/uploaded_reports",
        visibleRoles: FULL_ADMIN_ROLES,
      },
      {
        label: "Report owners",
        href: "/collections/report_owners",
        visibleRoles: FULL_ADMIN_ROLES,
      },
    ],
    fieldGroups: [
      {
        title: "Report identity",
        description:
          "The primary keys that map directly into the live reports module.",
        fields: [
          {
            label: "reportCode",
            source: "Reports",
            detail:
              "Existing report code used to index owner, upload, and delivery state.",
          },
          {
            label: "uploadedReportId",
            source: "Reports",
            detail:
              "Uploaded report document backing provider file metadata and download state.",
          },
          {
            label: "providerName",
            source: "Reports",
            detail:
              "Provider identity from the uploaded report or code linkage.",
          },
          {
            label: "providerFormat",
            source: "Reports",
            detail: "Provider-specific format or assay format.",
          },
        ],
      },
      {
        title: "Delivery lane",
        description:
          "The exact client-facing fields that make report handoff trackable.",
        fields: [
          {
            label: "clientCaseStatus",
            source: "2PQ",
            detail:
              "Human-facing case status shown to clients once reporting begins.",
          },
          {
            label: "reportDelivery",
            source: "2PQ",
            detail:
              "Delivery channel or state, such as pending, sent, acknowledged, or failed.",
          },
          {
            label: "trackingStatus",
            source: "Reports",
            detail:
              "Operational upload or processing status from the current reports system.",
          },
          {
            label: "deliveryDate",
            source: "2PQ",
            detail: "Timestamp for final client handoff.",
          },
        ],
      },
      {
        title: "Ownership and scope",
        description:
          "How report work remains interoperable with institution and doctor permissions.",
        fields: [
          {
            label: "ownerId",
            source: "Reports",
            detail:
              "Report owner or community-linked identity from the live reports model.",
          },
          {
            label: "institutionId",
            source: "Institutions",
            detail: "Institution that owns the clinical context of the report.",
          },
          {
            label: "doctorId",
            source: "Doctors",
            detail:
              "Doctor lane that should receive or review the report output.",
          },
          {
            label: "patientId",
            source: "Patients",
            detail: "Patient record associated with the report delivery.",
          },
        ],
      },
    ],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["create", "read", "update", "delete"],
        note: "Full admins keep full control over report codes, uploads, owners, and delivery cleanup.",
      },
      {
        role: "institution_admin",
        scope: "read_only",
        capabilities: ["read"],
        note: "Institution admins can understand report state from 2PQ, but the live reports module stays full-admin only today.",
      },
      {
        role: "institution_doctor",
        scope: "read_only",
        capabilities: ["read"],
        note: "Doctors can monitor report readiness in the shell, without gaining access to the full reports module.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not use the backoffice reports controls.",
      },
    ],
  },
  {
    key: "clients",
    label: "Providers",
    shortLabel: "Providers",
    description:
      "Provider and stakeholder lane that makes institution, doctor, patient, and role coverage readable from one area.",
    summary:
      "This area turns the current access model into a provider-facing operations view without losing the underlying institution-doctor-patient relationships.",
    icon: Users,
    tone: "slate",
    chips: ["People", "Permissions", "Cross-scope"],
    quickLinks: [
      {
        label: "Institutions",
        href: "/areas/institutions",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      {
        label: "Doctors",
        href: "/areas/doctors",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      {
        label: "Patients",
        href: "/areas/patients",
        visibleRoles: AREA_ADMIN_ROLES,
      },
      { label: "Users", href: "/users", visibleRoles: FULL_ADMIN_ROLES },
    ],
    fieldGroups: [
      {
        title: "Identity and ownership",
        description: "The human records that make 2PQ tasks legible.",
        fields: [
          {
            label: "clientId",
            source: "2PQ",
            detail: "2PQ-facing client or stakeholder identifier.",
          },
          {
            label: "institutionName",
            source: "Institutions",
            detail:
              "Institution root displayed as the primary organizational owner.",
          },
          {
            label: "doctorName",
            source: "Doctors",
            detail: "Doctor account or clinician who owns the active lane.",
          },
          {
            label: "patientName",
            source: "Patients",
            detail: "Patient name used for case and report context.",
          },
        ],
      },
      {
        title: "Contact model",
        description: "Fields for direct communication and support.",
        fields: [
          {
            label: "email",
            source: "Users",
            detail: "Primary contact email when a linked account exists.",
          },
          {
            label: "phone",
            source: "Institutions",
            detail:
              "Support or local contact phone where the workflow is anchored.",
          },
          {
            label: "country",
            source: "Profiles",
            detail: "Geographic context for routing, shipping, and compliance.",
          },
          {
            label: "preferredLanguage",
            source: "2PQ",
            detail:
              "Communication preference for client-facing delivery state.",
          },
        ],
      },
      {
        title: "Access and clinical context",
        description:
          "The permission fields that make the shell interoperable with current roles.",
        fields: [
          {
            label: "role",
            source: "Roles",
            detail:
              "Email-based admin role used to determine backoffice access.",
          },
          {
            label: "institutionScope",
            source: "Roles",
            detail: "Institution boundary attached to the role record.",
          },
          {
            label: "doctorScope",
            source: "Roles",
            detail: "Doctor boundary attached to assigned-doctor access.",
          },
          {
            label: "patientScope",
            source: "Roles",
            detail:
              "Patient boundary attached to patient-specific role records.",
          },
        ],
      },
    ],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["create", "read", "update"],
        note: "Full admins can shape the entire client relationship model and linked permissions.",
      },
      {
        role: "institution_admin",
        scope: "institution",
        capabilities: ["create", "read", "update"],
        note: "Institution admins can manage client-facing records inside their institution.",
      },
      {
        role: "institution_doctor",
        scope: "assigned",
        capabilities: ["read", "update"],
        note: "Doctors can keep their own lane accurate without broad organization edits.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not administer client or access records here.",
      },
    ],
  },
];

export const BACKOFFICE_AREAS: BackofficeAreaSpec[] = [
  {
    key: "2pq-dashboard",
    label: "2PQ Dashboard",
    description:
      "PDF-inspired workflow map with role-aware CRUD access, field groups, and links into the live shell.",
    href: "/2pq-dashboard",
    icon: Dna,
    tone: "violet",
    visibleRoles: AREA_ADMIN_ROLES,
    chips: ["New", "Workflow hub"],
  },
  {
    key: "overview",
    label: "Overview",
    description:
      "Current mission landing page and global operational snapshot.",
    href: "/",
    icon: LayoutDashboard,
    tone: "blue",
    visibleRoles: AREA_ADMIN_ROLES,
    chips: ["Mission", "Snapshot"],
  },
  {
    key: "accounts",
    label: "Accounts",
    description: "Firebase Auth users and private account state.",
    href: "/users",
    icon: ShieldUser,
    tone: "slate",
    visibleRoles: FULL_ADMIN_ROLES,
    chips: ["Full admin", "Auth"],
  },
  {
    key: "community",
    label: "Community",
    description:
      "Public profiles, community users, posts, comments, and activity.",
    href: "/community",
    icon: MessagesSquare,
    tone: "rose",
    visibleRoles: FULL_ADMIN_ROLES,
    chips: ["Full admin", "Social"],
  },
  {
    key: "reports",
    label: "Reports",
    description: "Report codes, uploads, owners, and delivery workflows.",
    href: "/reports",
    icon: FileCode2,
    tone: "rose",
    visibleRoles: FULL_ADMIN_ROLES,
    chips: ["Full admin", "Delivery"],
  },
  {
    key: "learning",
    label: "Learning",
    description: "Lesson editing and user progress moderation.",
    href: "/learning",
    icon: Sparkles,
    tone: "mint",
    visibleRoles: FULL_ADMIN_ROLES,
    chips: ["Full admin", "Content"],
  },
  {
    key: "institutions",
    label: "Institutions",
    description:
      "Institution roots, descriptors, doctor counts, and patient totals.",
    href: "/areas/institutions",
    icon: Building2,
    tone: "blue",
    visibleRoles: AREA_ADMIN_ROLES,
    chips: ["Areas", "Root scope"],
  },
  {
    key: "doctors",
    label: "Doctors",
    description: "Institution-linked doctor records and patient ownership.",
    href: "/areas/doctors",
    icon: Stethoscope,
    tone: "mint",
    visibleRoles: AREA_ADMIN_ROLES,
    chips: ["Areas", "Clinicians"],
  },
  {
    key: "patients",
    label: "Patients",
    description: "Patient records tied to one institution and one doctor.",
    href: "/areas/patients",
    icon: UserPlus,
    tone: "amber",
    visibleRoles: AREA_ADMIN_ROLES,
    chips: ["Areas", "Registry"],
  },
  {
    key: "roles",
    label: "Roles & Permissions",
    description:
      "Email-based access tree for full admins, transport dispatchers, institution admins, institution operators, institution laboratory staff, doctors, and patients.",
    href: "/roles",
    icon: KeyRound,
    tone: "slate",
    visibleRoles: AREA_ADMIN_ROLES,
    chips: ["Access", "Email scoped"],
  },
];

const BASE_ADMIN_SURFACE_SPECS: AdminSurfaceSpec[] = [
  {
    key: "institutions",
    label: "Institutions",
    description:
      "Institution roots are the top of the scoped model. Every doctor, patient, and local role hangs from this record.",
    highlights: ["Descriptors", "Counts", "Local admins"],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["create", "read", "update", "delete"],
        note: "Full admins can create, edit, and delete institution records.",
      },
      {
        role: "institution_admin",
        scope: "institution",
        capabilities: ["read", "update"],
        note: "Institution admins can edit only their own institution root.",
      },
      {
        role: "institution_doctor",
        scope: "read_only",
        capabilities: ["read"],
        note: "Doctors can inspect the institution but cannot change it.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not enter the backoffice institution surface.",
      },
    ],
  },
  {
    key: "doctors",
    label: "Doctors",
    description:
      "Doctor records sit one level below institutions and drive doctor-owned patient access.",
    highlights: ["Roster", "Role linkage", "Assigned scope"],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["create", "read", "update", "delete"],
        note: "Full admins can create, edit, and delete doctor records globally.",
      },
      {
        role: "institution_admin",
        scope: "institution",
        capabilities: ["create", "read", "update", "delete"],
        note: "Institution admins can manage and delete doctors inside their institution.",
      },
      {
        role: "institution_laboratory_staff",
        scope: "read_only",
        capabilities: ["read"],
        note: "Institution laboratory staff can inspect doctors inside their institution but cannot create, update, or delete doctor records.",
      },
      {
        role: "institution_doctor",
        scope: "assigned",
        capabilities: ["read", "update"],
        note: "Doctors can inspect peers but only edit their own doctor record.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not administer doctor records.",
      },
    ],
  },
  {
    key: "patients",
    label: "Patients",
    description:
      "Patient records are tied directly to one institution and one doctor, which is what makes doctor-scoped CRUD possible.",
    highlights: ["Registry", "Doctor ownership", "Delete path"],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["create", "read", "update", "delete"],
        note: "Full admins can manage the complete patient registry.",
      },
      {
        role: "institution_admin",
        scope: "institution",
        capabilities: ["create", "read", "update", "delete"],
        note: "Institution admins can CRUD patients inside their institution.",
      },
      {
        role: "institution_laboratory_staff",
        scope: "read_only",
        capabilities: ["read"],
        note: "Institution laboratory staff can inspect patients inside their institution but cannot create, update, or delete patient records.",
      },
      {
        role: "institution_doctor",
        scope: "assigned",
        capabilities: ["create", "read", "update", "delete"],
        note: "Doctors can CRUD only the patients attached to their own doctor id.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not edit themselves from the backoffice.",
      },
    ],
  },
  {
    key: "roles",
    label: "Roles & Permissions",
    description:
      "Role records are email-scoped access controls that encode institution, doctor, and patient boundaries.",
    highlights: ["Email based", "Hierarchy", "Scope links"],
    roleAccess: [
      {
        role: "full_admin",
        scope: "global",
        capabilities: ["create", "read", "update"],
        note: "Full admins can create or change any non-bootstrap role record.",
      },
      {
        role: "transport_dispatcher",
        scope: "no_access",
        capabilities: [],
        note: "Transport dispatchers cannot create or modify role assignments.",
      },
      {
        role: "institution_admin",
        scope: "institution",
        capabilities: ["create", "read", "update"],
        note: "Institution admins can create and edit local institution admin, institution operator, institution laboratory staff, institution doctor, and patient roles inside their own scope.",
      },
      {
        role: "institution_operator",
        scope: "institution",
        capabilities: ["read", "update"],
        note: "Institution operators can update existing local institution operator, institution laboratory staff, institution doctor, and patient roles inside their own scope, but new role assignments must be requested from the institution administrator.",
      },
      {
        role: "institution_laboratory_staff",
        scope: "no_access",
        capabilities: [],
        note: "Institution laboratory staff can operate permitted 2PQ workflows inside their institution, but cannot create, update, or inspect role assignments.",
      },
      {
        role: "institution_doctor",
        scope: "assigned",
        capabilities: ["create", "read", "update"],
        note: "Doctors can create and edit patient role records only for their own lane.",
      },
      {
        role: "patient",
        scope: "no_access",
        capabilities: [],
        note: "Patients do not administer permissions from the backoffice.",
      },
    ],
  },
];

export const TWO_PQ_WORKFLOW_AREAS: TwoPQWorkflowAreaSpec[] =
  BASE_TWO_PQ_WORKFLOW_AREAS.map((area) => ({
    ...area,
    roleAccess: withInstitutionOperatorAccess(area.roleAccess),
  }));

export const ADMIN_SURFACE_SPECS: AdminSurfaceSpec[] =
  BASE_ADMIN_SURFACE_SPECS.map((surface) => ({
    ...surface,
    roleAccess: withInstitutionOperatorAccess(surface.roleAccess),
  }));

export function canAccessTwoPQRoute(
  role: AdminRole,
  visibleRoles?: AdminRole[],
) {
  return !visibleRoles || visibleRoles.includes(role);
}

export function getWorkflowArea(key: TwoPQWorkflowAreaSpec["key"]) {
  return TWO_PQ_WORKFLOW_AREAS.find((area) => area.key === key);
}

export function getSurfaceSpec(key: AdminSurfaceSpec["key"]) {
  return ADMIN_SURFACE_SPECS.find((surface) => surface.key === key);
}
