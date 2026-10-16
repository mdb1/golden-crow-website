"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FilePenLine,
  FileUp,
  Link2,
  Loader2,
  PenLine,
  RotateCcw,
  Upload,
  UserRound,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import {
  SingleFileUpload,
  type SingleFileValue,
} from "@/components/single-file-upload";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applySignaturesToConsentPdf,
  bytesToPdfDataUrl,
  CONSENT_SIGNER_DATE_PLACEMENTS,
  CONSENT_SIGNER_DOCUMENT_PLACEMENTS,
  CONSENT_SIGNER_NAME_PLACEMENTS,
  CONSENT_TEMPLATE_LAST_PAGE_INDEX,
  CONSENT_TEMPLATE_PREVIEW_URLS,
  CONSENT_TEMPLATE_URL,
  type ConsentSignerRole,
  type ConsentSignaturePlacement,
  SIGNED_CONSENT_FILE_NAME,
} from "@/lib/consent-pdf";
import type {
  InformedConsentCaseOption,
  InformedConsentCasePage,
  InformedConsentPatientOption,
  InformedConsentPatientPage,
  InformedConsentRecord,
} from "@/lib/informed-consents";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const MAX_CONSENT_BYTES = 750_000;
const SIGNATURE_CANVAS_WIDTH = 720;
const SIGNATURE_CANVAS_HEIGHT = 240;

const PATIENT_STEPS = [
  { title: "Descargar", icon: Download },
  { title: "Datos", icon: UserRound },
  { title: "Firmar", icon: PenLine },
  { title: "Aplicar firma", icon: FilePenLine },
  { title: "Vista previa", icon: CheckCircle2 },
] as const;

const BACKOFFICE_STEPS = [
  { title: "Destino", icon: Link2 },
  ...PATIENT_STEPS,
] as const;

const INITIAL_PATIENT_PLACEMENT: ConsentSignaturePlacement = {
  x: 0.72,
  y: 0.445,
  width: 0.16,
};

const INITIAL_PARTNER_PLACEMENT: ConsentSignaturePlacement = {
  x: 0.72,
  y: 0.64,
  width: 0.16,
};

type PreviewSignature = {
  role: ConsentSignerRole;
  label: string;
  name: string;
  document?: string;
  signatureDate?: string;
  dataUrl: string;
  placement: ConsentSignaturePlacement;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function todayInBuenosAires() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function formatSignatureDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${day}/${month}/${year}`;
}

function SignaturePad({
  value,
  onChange,
  signerLabel,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  signerLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) {
      setHasInk(false);
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setHasInk(true);
    };
    image.src = value;
  }, [value]);

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  }

  function beginDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = canvasPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.strokeStyle = "#111827";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    setHasInk(true);
    if (value) onChange(null);
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    event.preventDefault();
    const point = canvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture(event.pointerId);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  }

  function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    onChange(canvas.toDataURL("image/png"));
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          width={SIGNATURE_CANVAS_WIDTH}
          height={SIGNATURE_CANVAS_HEIGHT}
          className="block aspect-[3/1] w-full cursor-crosshair touch-none"
          aria-label={`Área para dibujar la firma ${signerLabel}`}
          onPointerDown={beginDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={clearSignature}>
          <RotateCcw className="size-4" />
          Borrar
        </Button>
        <Button type="button" onClick={saveSignature} disabled={!hasInk}>
          <Check className="size-4" />
          Guardar firma {signerLabel}
        </Button>
        {value ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="size-4" />
            Firma guardada
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SignaturePagePreview({
  pageIndex,
  signatures,
  selectedRole,
  editable = false,
  onPlacementChange,
  onSelectRole,
}: {
  pageIndex: number;
  signatures: PreviewSignature[];
  selectedRole?: ConsentSignerRole;
  editable?: boolean;
  onPlacementChange?: (
    role: ConsentSignerRole,
    placement: ConsentSignaturePlacement,
  ) => void;
  onSelectRole?: (role: ConsentSignerRole) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingRoleRef = useRef<ConsentSignerRole | null>(null);

  function startDragging(
    event: ReactPointerEvent<HTMLImageElement>,
    signature: PreviewSignature,
  ) {
    if (!editable || !pageRef.current) return;
    event.preventDefault();
    onSelectRole?.(signature.role);
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = pageRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x:
        (event.clientX - bounds.left) / bounds.width - signature.placement.x,
      y:
        (event.clientY - bounds.top) / bounds.height - signature.placement.y,
    };
    draggingRoleRef.current = signature.role;
  }

  function moveSignature(
    event: ReactPointerEvent<HTMLImageElement>,
    signature: PreviewSignature,
  ) {
    if (
      !editable ||
      draggingRoleRef.current !== signature.role ||
      !pageRef.current
    ) {
      return;
    }
    event.preventDefault();
    const bounds = pageRef.current.getBoundingClientRect();
    const x =
      (event.clientX - bounds.left) / bounds.width - dragOffsetRef.current.x;
    const y =
      (event.clientY - bounds.top) / bounds.height - dragOffsetRef.current.y;
    onPlacementChange?.(signature.role, {
      ...signature.placement,
      x: clamp(x, 0, 1 - signature.placement.width),
      y: clamp(y, 0, 0.92),
    });
  }

  function stopDragging(event: ReactPointerEvent<HTMLImageElement>) {
    if (!draggingRoleRef.current) return;
    draggingRoleRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      ref={pageRef}
      className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-sm bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)] ring-1 ring-black/10"
    >
      <img
        src={CONSENT_TEMPLATE_PREVIEW_URLS[pageIndex]}
        alt={`Página ${pageIndex + 1} del consentimiento informado`}
        className="block h-auto w-full select-none"
        draggable={false}
      />
      {signatures.map((signature) => {
        const namePlacement = CONSENT_SIGNER_NAME_PLACEMENTS[signature.role];
        const documentPlacement =
          CONSENT_SIGNER_DOCUMENT_PLACEMENTS[signature.role];
        const datePlacement = CONSENT_SIGNER_DATE_PLACEMENTS[signature.role];
        return (
          <div key={signature.role}>
            {pageIndex === CONSENT_TEMPLATE_LAST_PAGE_INDEX ? (
              <span
                className="pointer-events-none absolute overflow-hidden whitespace-nowrap font-sans text-[clamp(5px,1vw,9px)] text-slate-950"
                style={{
                  left: `${namePlacement.x * 100}%`,
                  top: `${(namePlacement.baselineFromTop - 0.012) * 100}%`,
                  width: `${namePlacement.maxWidth * 100}%`,
                }}
              >
                {signature.name}
              </span>
            ) : null}
            {signature.document &&
            pageIndex === CONSENT_TEMPLATE_LAST_PAGE_INDEX ? (
              <span
                className="pointer-events-none absolute overflow-hidden whitespace-nowrap font-sans text-[clamp(5px,1vw,9px)] text-slate-950"
                style={{
                  left: `${documentPlacement.x * 100}%`,
                  top: `${(documentPlacement.baselineFromTop - 0.012) * 100}%`,
                  width: `${documentPlacement.maxWidth * 100}%`,
                }}
              >
                {signature.document}
              </span>
            ) : null}
            {signature.signatureDate &&
            pageIndex === CONSENT_TEMPLATE_LAST_PAGE_INDEX ? (
              <span
                className="pointer-events-none absolute overflow-hidden whitespace-nowrap bg-white font-sans text-[clamp(5px,1vw,9px)] text-slate-950"
                style={{
                  left: `${datePlacement.x * 100}%`,
                  top: `${(datePlacement.baselineFromTop - 0.012) * 100}%`,
                  width: `${datePlacement.maxWidth * 100}%`,
                }}
              >
                {signature.signatureDate}
              </span>
            ) : null}
            {pageIndex === CONSENT_TEMPLATE_LAST_PAGE_INDEX ? (
              <img
                src={signature.dataUrl}
                alt={`Firma ${signature.label}`}
                className={cn(
                  "absolute h-auto select-none",
                  editable &&
                    "cursor-grab touch-none rounded border border-dashed bg-primary/5 active:cursor-grabbing",
                  editable && selectedRole === signature.role
                    ? "border-primary ring-2 ring-primary/30"
                    : editable
                      ? "border-border"
                      : "border-0",
                )}
                draggable={false}
                style={{
                  left: `${signature.placement.x * 100}%`,
                  top: `${signature.placement.y * 100}%`,
                  width: `${signature.placement.width * 100}%`,
                }}
                onPointerDown={(event) => startDragging(event, signature)}
                onPointerMove={(event) => moveSignature(event, signature)}
                onPointerUp={stopDragging}
                onPointerCancel={stopDragging}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StepNavigation({
  steps,
  activeStep,
  furthestStep,
  onSelect,
}: {
  steps: ReadonlyArray<{
    title: string;
    icon: typeof Download;
  }>;
  activeStep: number;
  furthestStep: number;
  onSelect: (step: number) => void;
}) {
  return (
    <ol
      className={cn(
        "grid gap-2 sm:grid-cols-2",
        steps.length === 6 ? "xl:grid-cols-6" : "xl:grid-cols-5",
      )}
    >
      {steps.map((step, index) => {
        const Icon = step.icon;
        const active = index === activeStep;
        const complete = index < activeStep || index < furthestStep;
        return (
          <li key={step.title}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : complete
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
                    : "border-border bg-background text-muted-foreground",
              )}
              disabled={index > furthestStep}
              onClick={() => onSelect(index)}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  active ? "border-primary-foreground/70" : "border-current/30",
                )}
              >
                {complete ? <Check className="size-4" /> : index + 1}
              </span>
              <Icon className="size-4" />
              <span className="text-sm font-semibold">{step.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const records = new Map(current.map((record) => [record.id, record]));
  incoming.forEach((record) => records.set(record.id, record));
  return [...records.values()];
}

export function PatientConsentUploadWizard({
  initialPatientName = "",
  surface = "patient-portal",
  initialPatientPage,
}: {
  initialPatientName?: string;
  surface?: "patient-portal" | "backoffice";
  initialPatientPage?: InformedConsentPatientPage;
}) {
  const router = useRouter();
  const casesRequestRef = useRef(0);
  const isBackoffice = surface === "backoffice";
  const steps = isBackoffice ? BACKOFFICE_STEPS : PATIENT_STEPS;
  const stepOffset = isBackoffice ? 1 : 0;
  const destinationStep = 0;
  const downloadStep = stepOffset;
  const dataStep = stepOffset + 1;
  const signatureStep = stepOffset + 2;
  const editorStep = stepOffset + 3;
  const previewStep = stepOffset + 4;
  const [mode, setMode] = useState<"guided" | "direct">("guided");
  const [activeStep, setActiveStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [patients, setPatients] = useState(initialPatientPage?.patients ?? []);
  const [patientCursor, setPatientCursor] = useState(
    initialPatientPage?.nextCursor,
  );
  const [patientId, setPatientId] = useState("");
  const [cases, setCases] = useState<InformedConsentCaseOption[]>([]);
  const [caseCursor, setCaseCursor] = useState<string | undefined>();
  const [caseId, setCaseId] = useState("");
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [patientName, setPatientName] = useState(initialPatientName.trim());
  const [patientNameError, setPatientNameError] = useState("");
  const [patientDocument, setPatientDocument] = useState("");
  const [patientDocumentError, setPatientDocumentError] = useState("");
  const [signatureDate, setSignatureDate] = useState(todayInBuenosAires);
  const [signatureDateError, setSignatureDateError] = useState("");
  const [hasPartner, setHasPartner] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [partnerNameError, setPartnerNameError] = useState("");
  const [patientSignatureDataUrl, setPatientSignatureDataUrl] = useState<
    string | null
  >(null);
  const [partnerSignatureDataUrl, setPartnerSignatureDataUrl] = useState<
    string | null
  >(null);
  const [patientPlacement, setPatientPlacement] =
    useState<ConsentSignaturePlacement>(INITIAL_PATIENT_PLACEMENT);
  const [partnerPlacement, setPartnerPlacement] =
    useState<ConsentSignaturePlacement>(INITIAL_PARTNER_PLACEMENT);
  const [selectedRole, setSelectedRole] =
    useState<ConsentSignerRole>("patient");
  const [signedFile, setSignedFile] = useState<SingleFileValue | null>(null);
  const [directFile, setDirectFile] = useState<SingleFileValue | null>(null);
  const [directFileError, setDirectFileError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const formattedSignatureDate = formatSignatureDate(signatureDate);

  function goToStep(step: number) {
    const nextStep = clamp(step, 0, steps.length - 1);
    setActiveStep(nextStep);
    setFurthestStep((current) => Math.max(current, nextStep));
  }

  function invalidateAfter(step: number) {
    setSignedFile(null);
    setFurthestStep((current) => Math.min(current, step));
  }

  function updatePlacement(
    role: ConsentSignerRole,
    nextPlacement: ConsentSignaturePlacement,
  ) {
    if (role === "patient") {
      setPatientPlacement(nextPlacement);
    } else {
      setPartnerPlacement(nextPlacement);
    }
    invalidateAfter(editorStep);
  }

  function validateNames() {
    const nextPatientName = patientName.trim();
    const nextPatientDocument = patientDocument.trim();
    const nextPartnerName = partnerName.trim();
    const missingPatient = !nextPatientName;
    const missingPatientDocument = !nextPatientDocument;
    const missingSignatureDate = !formattedSignatureDate;
    const missingPartner = hasPartner && !nextPartnerName;
    setPatientNameError(
      missingPatient ? "Ingrese el nombre y apellido del paciente." : "",
    );
    setPatientDocumentError(
      missingPatientDocument ? "Ingrese el documento del paciente." : "",
    );
    setSignatureDateError(
      missingSignatureDate ? "Ingrese una fecha de firma válida." : "",
    );
    setPartnerNameError(
      missingPartner ? "Ingrese el nombre y apellido de la pareja." : "",
    );
    if (
      missingPatient ||
      missingPatientDocument ||
      missingSignatureDate ||
      missingPartner
    ) {
      return false;
    }
    setPatientName(nextPatientName);
    setPatientDocument(nextPatientDocument);
    if (hasPartner) setPartnerName(nextPartnerName);
    return true;
  }

  function continueFromNames() {
    if (validateNames()) goToStep(signatureStep);
  }

  const previewSignatures: PreviewSignature[] = patientSignatureDataUrl
    ? [
        {
          role: "patient",
          label: "del paciente",
          name: patientName.trim(),
          document: patientDocument.trim(),
          signatureDate: formattedSignatureDate ?? undefined,
          dataUrl: patientSignatureDataUrl,
          placement: patientPlacement,
        },
        ...(hasPartner && partnerSignatureDataUrl
          ? [
              {
                role: "partner" as const,
                label: "de la pareja",
                name: partnerName.trim(),
                signatureDate: formattedSignatureDate ?? undefined,
                dataUrl: partnerSignatureDataUrl,
                placement: partnerPlacement,
              },
            ]
          : []),
      ]
    : [];

  const signaturesComplete =
    Boolean(patientSignatureDataUrl) &&
    (!hasPartner || Boolean(partnerSignatureDataUrl));

  async function prepareSignedConsent() {
    if (!signaturesComplete || previewSignatures.length === 0) return;
    setPreparing(true);
    setToast(null);
    try {
      const response = await fetch(CONSENT_TEMPLATE_URL);
      if (!response.ok) {
        throw new Error("No se pudo abrir la plantilla de consentimiento.");
      }
      const bytes = await applySignaturesToConsentPdf(
        await response.arrayBuffer(),
        previewSignatures.map((signature) => ({
          role: signature.role,
          name: signature.name,
          document: signature.document,
          signatureDate: signature.signatureDate,
          signatureDataUrl: signature.dataUrl,
          placement: signature.placement,
        })),
      );
      if (bytes.byteLength > MAX_CONSENT_BYTES) {
        throw new Error(
          "El consentimiento firmado supera el máximo permitido de 750 KB.",
        );
      }
      setSignedFile({
        name: SIGNED_CONSENT_FILE_NAME,
        type: "application/pdf",
        size: bytes.byteLength,
        content: bytesToPdfDataUrl(bytes),
      });
      goToStep(previewStep);
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo preparar el consentimiento firmado.",
      });
    } finally {
      setPreparing(false);
    }
  }

  async function uploadConsent(file: SingleFileValue | null) {
    if (!file || saving) return;
    setSaving(true);
    setToast(null);
    try {
      const { record } = await sdkFetch<{ record: InformedConsentRecord }>(
        "/2pq/informed-consents",
        {
          method: "POST",
          body: JSON.stringify({
            ...(isBackoffice ? { patientId, caseId } : {}),
            file,
          }),
        },
      );
      router.push(
        isBackoffice
          ? `/2pq-dashboard/consents/${encodeURIComponent(record.id)}`
          : "/patient-portal/consents",
      );
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "No se pudo subir el consentimiento.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function loadCasesForPatient(
    selectedPatientId: string,
    cursor?: string,
  ) {
    if (!selectedPatientId) return;
    const requestId = casesRequestRef.current + 1;
    casesRequestRef.current = requestId;
    setLoadingCases(true);
    setToast(null);
    try {
      const query = new URLSearchParams({ patientId: selectedPatientId });
      if (cursor) query.set("cursor", cursor);
      const page = await sdkFetch<InformedConsentCasePage>(
        `/2pq/informed-consents/cases?${query.toString()}`,
      );
      if (requestId !== casesRequestRef.current) return;
      setCases((current) =>
        cursor ? mergeById(current, page.cases) : page.cases,
      );
      setCaseCursor(page.nextCursor);
    } catch (error) {
      if (requestId !== casesRequestRef.current) return;
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los casos 2PQ del paciente.",
      });
    } finally {
      if (requestId === casesRequestRef.current) {
        setLoadingCases(false);
      }
    }
  }

  async function loadMorePatients() {
    if (!patientCursor || loadingPatients) return;
    setLoadingPatients(true);
    setToast(null);
    try {
      const page = await sdkFetch<InformedConsentPatientPage>(
        `/2pq/informed-consents/patients?cursor=${encodeURIComponent(patientCursor)}`,
      );
      setPatients((current) => mergeById(current, page.patients));
      setPatientCursor(page.nextCursor);
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar más pacientes.",
      });
    } finally {
      setLoadingPatients(false);
    }
  }

  function selectPatient(nextPatientId: string) {
    const patient = patients.find((candidate) => candidate.id === nextPatientId);
    setPatientId(nextPatientId);
    setPatientName(patient?.fullName.trim() ?? "");
    setPatientNameError("");
    setPatientDocument("");
    setPatientDocumentError("");
    setCaseId("");
    setCases([]);
    setCaseCursor(undefined);
    invalidateAfter(destinationStep);
    void loadCasesForPatient(nextPatientId);
  }

  function continueFromDestination() {
    if (!patientId || !caseId) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Seleccione un paciente y uno de sus casos 2PQ.",
      });
      return;
    }
    goToStep(downloadStep);
  }

  const selectedCase = cases.find((candidate) => candidate.id === caseId);
  const destinationComplete = Boolean(patientId && caseId);

  function renderDestinationFields(showContinue: boolean) {
    return (
      <div className="max-w-3xl space-y-5">
        <div>
          <h3 className="font-heading text-lg font-semibold">
            Seleccionar paciente y caso 2PQ
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            El consentimiento se guardará para el paciente elegido y quedará
            vinculado al caso seleccionado.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="consent-owner-patient">Paciente</Label>
          <Select value={patientId} onValueChange={selectPatient}>
            <SelectTrigger id="consent-owner-patient" className="w-full">
              <SelectValue placeholder="Seleccionar paciente" />
            </SelectTrigger>
            <SelectContent align="start">
              {patients.map((patient) => (
                <SelectItem key={patient.id} value={patient.id}>
                  {patient.fullName} - {patient.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {patientCursor ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loadingPatients}
              onClick={() => void loadMorePatients()}
            >
              {loadingPatients ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Cargar más pacientes
            </Button>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="consent-owner-case">Caso 2PQ</Label>
          <Select
            value={caseId}
            disabled={!patientId || loadingCases}
            onValueChange={(nextCaseId) => {
              setCaseId(nextCaseId);
              invalidateAfter(destinationStep);
            }}
          >
            <SelectTrigger id="consent-owner-case" className="w-full">
              <SelectValue
                placeholder={
                  loadingCases
                    ? "Cargando casos..."
                    : patientId
                      ? "Seleccionar caso 2PQ"
                      : "Primero seleccione un paciente"
                }
              />
            </SelectTrigger>
            <SelectContent align="start">
              {cases.map((caseOption) => (
                <SelectItem key={caseOption.id} value={caseOption.id}>
                  {caseOption.caseLabel} - {caseOption.id}
                  {caseOption.threeLetterCode
                    ? ` - ${caseOption.threeLetterCode}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {patientId && !loadingCases && cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este paciente no tiene casos 2PQ disponibles.
            </p>
          ) : null}
          {caseCursor ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loadingCases}
              onClick={() =>
                void loadCasesForPatient(patientId, caseCursor)
              }
            >
              {loadingCases ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Cargar más casos
            </Button>
          ) : null}
        </div>

        {selectedCase?.informedConsentId ? (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-950 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-100">
            Este caso ya está vinculado al consentimiento{" "}
            <span className="font-mono font-semibold">
              {selectedCase.informedConsentId}
            </span>
            . Al completar la carga, el caso quedará vinculado al nuevo
            consentimiento; el archivo anterior no se eliminará.
          </div>
        ) : null}

        {showContinue ? (
          <Button
            type="button"
            disabled={!destinationComplete || loadingCases}
            onClick={continueFromDestination}
          >
            Continuar con el consentimiento
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link
          href={
            isBackoffice
              ? "/2pq-dashboard/consents"
              : "/patient-portal/consents"
          }
        >
          <ArrowLeft className="size-4" />
          Volver a consentimientos
        </Link>
      </Button>

      <section className="glass-panel space-y-5 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-xl font-semibold">
            Subir consentimiento
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={mode === "guided" ? "default" : "outline"}
              onClick={() => setMode("guided")}
            >
              <PenLine className="size-4" />
              Firmar en línea
            </Button>
            <Button
              type="button"
              variant={mode === "direct" ? "default" : "outline"}
              onClick={() => setMode("direct")}
            >
              <FileUp className="size-4" />
              Cargar archivo firmado
            </Button>
          </div>
        </div>

        {mode === "direct" ? (
          <div className="max-w-3xl space-y-4 border-t border-border/70 pt-5">
            {isBackoffice ? renderDestinationFields(false) : null}
            <SingleFileUpload
              id={`${surface}-direct-consent-file`}
              label="Consentimiento firmado"
              value={directFile}
              onChange={(file) => {
                setDirectFile(file);
                setDirectFileError("");
              }}
              onError={setDirectFileError}
              error={directFileError}
              uploadLabel="Elegir archivo"
              removeLabel="Quitar archivo"
              emptyLabel="Sin archivo seleccionado"
              invalidTypeMessage="Seleccione un PDF o una imagen compatible."
              tooLargeMessage="El archivo seleccionado supera los 750 KB."
              readErrorMessage="No se pudo leer el archivo seleccionado."
              helperText="PDF o imagen, máximo 750 KB."
            />
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={
                !directFile ||
                saving ||
                (isBackoffice && !destinationComplete)
              }
              onClick={() => void uploadConsent(directFile)}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Subir consentimiento
            </Button>
          </div>
        ) : (
          <div className="space-y-6 border-t border-border/70 pt-5">
            <StepNavigation
              steps={steps}
              activeStep={activeStep}
              furthestStep={furthestStep}
              onSelect={goToStep}
            />

            {isBackoffice && activeStep === destinationStep
              ? renderDestinationFields(true)
              : null}

            {activeStep === downloadStep ? (
              <div className="max-w-3xl space-y-5">
                <div className="rounded-xl border border-border/70 bg-background/60 p-5">
                  <h3 className="font-heading text-lg font-semibold">
                    Descargar el consentimiento 2PQ
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Descargue el documento para leerlo o conservar una copia.
                    Luego podrá firmarlo directamente en esta pantalla.
                  </p>
                  <Button className="mt-4" variant="outline" asChild>
                    <a
                      href={CONSENT_TEMPLATE_URL}
                      download="consentimiento-informado-2pq.pdf"
                    >
                      <Download className="size-4" />
                      Descargar consentimiento-informado-2pq.pdf
                    </a>
                  </Button>
                </div>
                <Button type="button" onClick={() => goToStep(dataStep)}>
                  Continuar con los datos
                </Button>
              </div>
            ) : null}

            {activeStep === dataStep ? (
              <div className="max-w-3xl space-y-5">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    Datos de quienes firman
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Confirme el nombre y documento del paciente e indique si
                    su pareja también firmará el consentimiento.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="consent-patient-name">
                    Nombre y apellido del paciente
                  </Label>
                  <Input
                    id="consent-patient-name"
                    value={patientName}
                    required
                    aria-invalid={Boolean(patientNameError)}
                    aria-describedby={
                      patientNameError ? "consent-patient-name-error" : undefined
                    }
                    onChange={(event) => {
                      setPatientName(event.target.value);
                      setPatientNameError("");
                      invalidateAfter(dataStep);
                    }}
                  />
                  {patientNameError ? (
                    <p
                      id="consent-patient-name-error"
                      className="text-sm font-medium text-destructive"
                    >
                      {patientNameError}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="consent-patient-document">
                    Documento del paciente
                  </Label>
                  <Input
                    id="consent-patient-document"
                    value={patientDocument}
                    required
                    maxLength={40}
                    placeholder="DNI o pasaporte"
                    aria-invalid={Boolean(patientDocumentError)}
                    aria-describedby={
                      patientDocumentError
                        ? "consent-patient-document-error"
                        : undefined
                    }
                    onChange={(event) => {
                      setPatientDocument(event.target.value);
                      setPatientDocumentError("");
                      invalidateAfter(dataStep);
                    }}
                  />
                  {patientDocumentError ? (
                    <p
                      id="consent-patient-document-error"
                      className="text-sm font-medium text-destructive"
                    >
                      {patientDocumentError}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="consent-signature-date">
                    Fecha de firma
                  </Label>
                  <Input
                    id="consent-signature-date"
                    type="date"
                    value={signatureDate}
                    required
                    aria-invalid={Boolean(signatureDateError)}
                    aria-describedby={
                      signatureDateError
                        ? "consent-signature-date-error"
                        : undefined
                    }
                    onChange={(event) => {
                      setSignatureDate(event.target.value);
                      setSignatureDateError("");
                      invalidateAfter(dataStep);
                    }}
                  />
                  {signatureDateError ? (
                    <p
                      id="consent-signature-date-error"
                      className="text-sm font-medium text-destructive"
                    >
                      {signatureDateError}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="consent-has-partner"
                      checked={hasPartner}
                      onCheckedChange={(checked) => {
                        const nextHasPartner = checked === true;
                        setHasPartner(nextHasPartner);
                        setPartnerNameError("");
                        if (!nextHasPartner) setSelectedRole("patient");
                        invalidateAfter(dataStep);
                      }}
                    />
                    <Label
                      htmlFor="consent-has-partner"
                      className="cursor-pointer leading-5"
                    >
                      El consentimiento también será firmado por la pareja
                    </Label>
                  </div>

                  {hasPartner ? (
                    <div className="mt-4 space-y-2">
                      <Label htmlFor="consent-partner-name">
                        Nombre y apellido de la pareja
                      </Label>
                      <Input
                        id="consent-partner-name"
                        value={partnerName}
                        required
                        aria-invalid={Boolean(partnerNameError)}
                        aria-describedby={
                          partnerNameError
                            ? "consent-partner-name-error"
                            : undefined
                        }
                        onChange={(event) => {
                          setPartnerName(event.target.value);
                          setPartnerNameError("");
                          invalidateAfter(dataStep);
                        }}
                      />
                      {partnerNameError ? (
                        <p
                          id="consent-partner-name-error"
                          className="text-sm font-medium text-destructive"
                        >
                          {partnerNameError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(downloadStep)}
                  >
                    <ArrowLeft className="size-4" />
                    Volver a descargar
                  </Button>
                  <Button type="button" onClick={continueFromNames}>
                    Continuar para firmar
                  </Button>
                </div>
              </div>
            ) : null}

            {activeStep === signatureStep ? (
              <div className="max-w-4xl space-y-5">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    Dibujar firmas
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dibuje cada firma en su propio recuadro y guárdela antes de
                    continuar.
                  </p>
                </div>

                <div className={cn("grid gap-5", hasPartner && "lg:grid-cols-2")}>
                  <section className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4">
                    <div>
                      <h4 className="font-semibold">Firma del paciente</h4>
                      <p className="text-sm text-muted-foreground">
                        {patientName.trim()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Documento: {patientDocument.trim()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Fecha de firma: {formattedSignatureDate}
                      </p>
                    </div>
                    <SignaturePad
                      signerLabel="del paciente"
                      value={patientSignatureDataUrl}
                      onChange={(value) => {
                        setPatientSignatureDataUrl(value);
                        invalidateAfter(signatureStep);
                      }}
                    />
                  </section>

                  {hasPartner ? (
                    <section className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4">
                      <div>
                        <h4 className="font-semibold">Firma de la pareja</h4>
                        <p className="text-sm text-muted-foreground">
                          {partnerName.trim()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Fecha de firma: {formattedSignatureDate}
                        </p>
                      </div>
                      <SignaturePad
                        signerLabel="de la pareja"
                        value={partnerSignatureDataUrl}
                        onChange={(value) => {
                          setPartnerSignatureDataUrl(value);
                          invalidateAfter(signatureStep);
                        }}
                      />
                    </section>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(dataStep)}
                  >
                    <ArrowLeft className="size-4" />
                    Volver a datos
                  </Button>
                  <Button
                    type="button"
                    disabled={!signaturesComplete}
                    onClick={() => goToStep(editorStep)}
                  >
                    Continuar al editor
                  </Button>
                </div>
              </div>
            ) : null}

            {activeStep === editorStep && signaturesComplete ? (
              <div className="space-y-5">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    Aplicar firmas al PDF
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Seleccione una firma y arrástrela directamente hasta su
                    ubicación en la última página. Las firmas nunca se aplican
                    en la primera ni en páginas intermedias.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={selectedRole === "patient" ? "default" : "outline"}
                    onClick={() => setSelectedRole("patient")}
                  >
                    Firma del paciente
                  </Button>
                  {hasPartner ? (
                    <Button
                      type="button"
                      variant={
                        selectedRole === "partner" ? "default" : "outline"
                      }
                      onClick={() => setSelectedRole("partner")}
                    >
                      Firma de la pareja
                    </Button>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Última página · Página {CONSENT_TEMPLATE_LAST_PAGE_INDEX + 1}
                  {" "}de {CONSENT_TEMPLATE_PREVIEW_URLS.length}
                </p>
                <SignaturePagePreview
                  pageIndex={CONSENT_TEMPLATE_LAST_PAGE_INDEX}
                  signatures={previewSignatures}
                  selectedRole={selectedRole}
                  editable
                  onPlacementChange={updatePlacement}
                  onSelectRole={setSelectedRole}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(signatureStep)}
                  >
                    <ArrowLeft className="size-4" />
                    Volver a firmar
                  </Button>
                  <Button
                    type="button"
                    disabled={preparing}
                    onClick={() => void prepareSignedConsent()}
                  >
                    {preparing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FilePenLine className="size-4" />
                    )}
                    Aplicar firmas y continuar
                  </Button>
                </div>
              </div>
            ) : null}

            {activeStep === previewStep && signaturesComplete && signedFile ? (
              <div className="space-y-5">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    Vista previa completa
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Revise el documento completo. Los nombres y las firmas se
                    aplican únicamente en la última página.
                  </p>
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
                  {CONSENT_TEMPLATE_PREVIEW_URLS.map((_, pageIndex) => (
                    <div key={pageIndex} className="space-y-2">
                      <p className="text-sm font-semibold">
                        Página {pageIndex + 1}
                      </p>
                      <SignaturePagePreview
                        pageIndex={pageIndex}
                        signatures={previewSignatures}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(editorStep)}
                  >
                    <ArrowLeft className="size-4" />
                    Volver al editor
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={signedFile.content} download={signedFile.name}>
                      <Download className="size-4" />
                      Descargar PDF firmado
                    </a>
                  </Button>
                  <Button
                    type="button"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={saving}
                    onClick={() => void uploadConsent(signedFile)}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    Subir consentimiento
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language="es"
      />
    </div>
  );
}
