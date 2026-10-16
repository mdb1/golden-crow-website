"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Check,
  CheckCircle2,
  CloudCheck,
  Download,
  FilePenLine,
  FileUp,
  ImagePlus,
  Link2,
  LockKeyhole,
  Loader2,
  PenLine,
  Printer,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
} from "lucide-react";
import {
  forwardRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { SignatureImageImportDialog } from "@/components/signature-image-import-dialog";
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
  InformedConsentDraftMode,
  InformedConsentDraftMutation,
  InformedConsentDraftRecord,
  InformedConsentDraftSignatureMethod,
  InformedConsentDraftStepId,
  InformedConsentDraftSummary,
  InformedConsentCaseOption,
  InformedConsentCasePage,
  InformedConsentPatientOption,
  InformedConsentPatientPage,
  InformedConsentRecord,
  InformedConsentSavedSignaturePayload,
} from "@/lib/informed-consents";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const MAX_CONSENT_BYTES = 750_000;
const SIGNATURE_CANVAS_WIDTH = 720;
const SIGNATURE_CANVAS_HEIGHT = 240;
const CONSENT_REVIEW_EXPLANATION =
  "Antes de avanzar con la firma, el paciente debe leer este consentimiento informado con detenimiento. Al firmarlo, deja constancia de que comprende y acepta las condiciones del estudio.";

const CONSENT_COMPLETION_CONFETTI = [
  {
    left: "10%",
    top: "18%",
    color: "var(--chart-2)",
    delay: "0ms",
    duration: "1080ms",
  },
  {
    left: "18%",
    top: "10%",
    color: "var(--chart-1)",
    delay: "60ms",
    duration: "980ms",
  },
  {
    left: "28%",
    top: "15%",
    color: "var(--chart-4)",
    delay: "110ms",
    duration: "1120ms",
  },
  {
    left: "40%",
    top: "8%",
    color: "#93c5fd",
    delay: "170ms",
    duration: "1020ms",
  },
  {
    left: "56%",
    top: "12%",
    color: "#67e8f9",
    delay: "220ms",
    duration: "1180ms",
  },
  {
    left: "68%",
    top: "14%",
    color: "var(--chart-3)",
    delay: "280ms",
    duration: "1040ms",
  },
  {
    left: "80%",
    top: "9%",
    color: "#bfdbfe",
    delay: "330ms",
    duration: "1140ms",
  },
  {
    left: "88%",
    top: "20%",
    color: "#a5f3fc",
    delay: "390ms",
    duration: "990ms",
  },
] as const;

type ConsentFlowMode = InformedConsentDraftMode;

type SignatureMethod = InformedConsentDraftSignatureMethod;

type SavedSignatureCacheEntry =
  | { status: "pending"; promise: Promise<string | null> }
  | { status: "resolved"; value: string | null };

type SignatureFocusTarget = "chooser" | "draw" | "preview";

type ConsentStepId =
  | "method"
  | "destination"
  | "download"
  | "data"
  | "signature"
  | "editor"
  | "preview"
  | "direct-download"
  | "direct-sign"
  | "direct-upload";

type PatientPortalConsentStepId = Exclude<ConsentStepId, "destination">;

type DraftSaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

type ConsentWizardStep = {
  id: ConsentStepId;
  title: string;
  description: string;
  icon: typeof Download;
};

const DIRECT_MANUAL_STEP_IDS: readonly ConsentStepId[] = [
  "direct-download",
  "direct-sign",
  "direct-upload",
];

const PATIENT_GUIDED_STEP_IDS: readonly PatientPortalConsentStepId[] = [
  "method",
  "download",
  "data",
  "signature",
  "editor",
  "preview",
];

const PATIENT_DIRECT_STEP_IDS: readonly PatientPortalConsentStepId[] = [
  "method",
  "direct-download",
  "direct-sign",
  "direct-upload",
];

const CONSENT_STEPS: Record<ConsentStepId, ConsentWizardStep> = {
  method: {
    id: "method",
    title: "Elegir cómo continuar",
    description:
      "Firme el consentimiento paso a paso o cargue un archivo que ya esté firmado.",
    icon: FilePenLine,
  },
  destination: {
    id: "destination",
    title: "Seleccionar paciente y caso 2PQ",
    description:
      "Elija a quién pertenece el consentimiento y el caso 2PQ que debe quedar vinculado.",
    icon: Link2,
  },
  download: {
    id: "download",
    title: "Descargar consentimiento",
    description:
      "Descargue el documento para leerlo o conservar una copia antes de firmarlo en línea.",
    icon: Download,
  },
  data: {
    id: "data",
    title: "Datos de quienes firman",
    description:
      "Confirme los datos del paciente e indique si su pareja también firmará el consentimiento.",
    icon: UserRound,
  },
  signature: {
    id: "signature",
    title: "Preparar las firmas",
    description:
      "Elija cómo preparar cada firma y confirme una opción antes de continuar.",
    icon: PenLine,
  },
  editor: {
    id: "editor",
    title: "Aplicar firmas al PDF",
    description:
      "Seleccione una firma y arrástrela directamente hasta su ubicación en la última página. Las firmas nunca se aplican en la primera ni en páginas intermedias.",
    icon: FilePenLine,
  },
  preview: {
    id: "preview",
    title: "Revisar y subir",
    description:
      "Revise el consentimiento completo antes de descargarlo o guardarlo definitivamente.",
    icon: CheckCircle2,
  },
  "direct-download": {
    id: "direct-download",
    title: "Descargar la plantilla",
    description:
      "Descargue la plantilla oficial que deberá completar y firmar manualmente.",
    icon: Download,
  },
  "direct-sign": {
    id: "direct-sign",
    title: "Imprimir y firmar",
    description:
      "Imprima todas las páginas, complete los datos y firme el consentimiento a mano.",
    icon: Printer,
  },
  "direct-upload": {
    id: "direct-upload",
    title: "Subir el escaneo firmado",
    description:
      "Escanee el documento completo y cargue un único PDF o una imagen legible del consentimiento firmado.",
    icon: ScanLine,
  },
};

function consentSteps(
  isBackoffice: boolean,
  mode: ConsentFlowMode | null,
): ConsentWizardStep[] {
  if (!mode) return [CONSENT_STEPS.method];

  const destination = isBackoffice ? [CONSENT_STEPS.destination] : [];
  return mode === "guided"
    ? [
        CONSENT_STEPS.method,
        ...destination,
        CONSENT_STEPS.download,
        CONSENT_STEPS.data,
        CONSENT_STEPS.signature,
        CONSENT_STEPS.editor,
        CONSENT_STEPS.preview,
      ]
    : [
        CONSENT_STEPS.method,
        ...destination,
        CONSENT_STEPS["direct-download"],
        CONSENT_STEPS["direct-sign"],
        CONSENT_STEPS["direct-upload"],
      ];
}

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

function draftStepsForMode(mode: ConsentFlowMode) {
  return mode === "guided" ? PATIENT_GUIDED_STEP_IDS : PATIENT_DIRECT_STEP_IDS;
}

function normalizedDraftStep(
  draft: InformedConsentDraftRecord | null | undefined,
): PatientPortalConsentStepId {
  if (!draft) return "method";
  const allowedSteps = draftStepsForMode(draft.mode);
  if (!allowedSteps.includes(draft.activeStepId)) {
    return draft.mode === "guided" ? "download" : "direct-download";
  }
  // The final PDF is deliberately not stored in a draft. Return to the editor
  // so the patient can rebuild and review the exact document before accepting.
  return draft.activeStepId === "preview" ? "editor" : draft.activeStepId;
}

function normalizedDraftPlacement(
  value: InformedConsentDraftRecord["patientPlacement"] | undefined,
  fallback: ConsentSignaturePlacement,
): ConsentSignaturePlacement {
  if (
    !value ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.width)
  ) {
    return fallback;
  }
  const width = clamp(value.width, 0.08, 0.5);
  return {
    x: clamp(value.x, 0, 1 - width),
    y: clamp(value.y, 0, 0.92),
    width,
  };
}

function normalizedDraftVisitedSteps(
  draft: InformedConsentDraftRecord | null | undefined,
): PatientPortalConsentStepId[] {
  if (!draft) return [];
  const allowedSteps = draftStepsForMode(draft.mode);
  return [
    ...new Set([
      ...(draft.visitedStepIds ?? []),
      "method",
      normalizedDraftStep(draft),
    ]),
  ].filter((stepId): stepId is PatientPortalConsentStepId =>
    allowedSteps.includes(stepId as InformedConsentDraftStepId),
  );
}

type PreviewSignature = {
  role: ConsentSignerRole;
  label: string;
  name: string;
  document?: string;
  signatureDate?: string;
  dataUrl: string;
  placement: ConsentSignaturePlacement;
};

type DraftSignatureOverrides = Partial<
  Pick<
    InformedConsentDraftMutation,
    | "patientSignatureDataUrl"
    | "partnerSignatureDataUrl"
    | "patientSignatureMethod"
    | "partnerSignatureMethod"
  >
>;

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

type SignaturePadHandle = {
  saveAndContinue: () => void;
};

const SignaturePad = forwardRef<
  SignaturePadHandle,
  {
    onInkChange: (hasInk: boolean) => void;
    onSaveAndContinue: (value: string) => void;
    signerLabel: string;
  }
>(function SignaturePad({ onInkChange, onSaveAndContinue, signerLabel }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(
    () => () => {
      onInkChange(false);
    },
    [onInkChange],
  );

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
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    event.preventDefault();
    const point = canvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasInk(true);
    onInkChange(true);
  }

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture(event.pointerId);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current = false;
    setHasInk(false);
    onInkChange(false);
  }

  function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    onSaveAndContinue(canvas.toDataURL("image/png"));
  }

  useImperativeHandle(ref, () => ({ saveAndContinue: saveSignature }));

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
      </div>
    </div>
  );
});

function SignatureMethodField({
  signerLabel,
  value,
  method,
  savedSignature,
  signaturePadRef,
  onDrawInkChange,
  onMethodChange,
  onComplete,
  onDrawSaved,
  autoFocusChooser = false,
}: {
  signerLabel: string;
  value: string | null;
  method: SignatureMethod | null;
  savedSignature?: string | null;
  signaturePadRef: RefObject<SignaturePadHandle | null>;
  onDrawInkChange: (hasInk: boolean) => void;
  onMethodChange: (method: SignatureMethod | null) => void;
  onComplete: (value: string, method: SignatureMethod) => void;
  onDrawSaved: (value: string) => void;
  autoFocusChooser?: boolean;
}) {
  const [imageImportOpen, setImageImportOpen] = useState(
    method === "import" && !value,
  );
  const importAppliedRef = useRef(false);
  const pendingFocusRef = useRef<SignatureFocusTarget | null>(null);
  const chooserFirstOptionRef = useRef<HTMLButtonElement>(null);
  const drawPanelRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = pendingFocusRef.current;
    const element =
      target === "chooser" && !method
        ? chooserFirstOptionRef.current
        : target === "draw" && method === "draw" && !value
          ? drawPanelRef.current
          : target === "preview" && method && value
            ? previewRef.current
            : null;
    if (!element) return;
    element.focus();
    pendingFocusRef.current = null;
  }, [method, value]);

  useEffect(() => {
    if (!autoFocusChooser || method || value) return;
    const focusTimer = window.setTimeout(() => {
      chooserFirstOptionRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [autoFocusChooser, method, value]);

  const methodSuccessCopy =
    method === "saved"
      ? "La firma guardada del paciente está lista para reutilizarse en este consentimiento."
      : method === "import"
        ? "La imagen importada quedó preparada y lista para aplicarse al consentimiento."
        : "La firma dibujada está lista para aplicarse al consentimiento.";

  function chooseMethod(nextMethod: SignatureMethod) {
    if (nextMethod === "saved") {
      if (savedSignature) {
        pendingFocusRef.current = "preview";
        onComplete(savedSignature, "saved");
      }
      return;
    }
    pendingFocusRef.current = nextMethod === "draw" ? "draw" : null;
    onMethodChange(nextMethod);
    if (nextMethod === "import") {
      importAppliedRef.current = false;
      setImageImportOpen(true);
    }
  }

  function changeMethod() {
    setImageImportOpen(false);
    importAppliedRef.current = false;
    pendingFocusRef.current = "chooser";
    onMethodChange(null);
  }

  function handleImportOpenChange(open: boolean) {
    setImageImportOpen(open);
    if (open) return;
    const importWasApplied = importAppliedRef.current;
    if (!importWasApplied) {
      pendingFocusRef.current = "chooser";
      onMethodChange(null);
    }
    window.setTimeout(() => {
      if (importWasApplied) {
        previewRef.current?.focus();
      } else {
        chooserFirstOptionRef.current?.focus();
      }
      pendingFocusRef.current = null;
    }, 0);
    importAppliedRef.current = false;
  }

  function completeMethod(nextValue: string, nextMethod: SignatureMethod) {
    pendingFocusRef.current = "preview";
    onComplete(nextValue, nextMethod);
  }

  if (value && method) {
    return (
      <div
        ref={previewRef}
        tabIndex={-1}
        className="flex min-h-72 flex-col items-center justify-center gap-5 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-violet-50 p-6 text-center shadow-sm dark:border-emerald-400/20 dark:from-emerald-950/20 dark:via-slate-950/50 dark:to-violet-950/20"
        aria-label={`Firma ${signerLabel} lista`}
        aria-live="polite"
      >
        <div className="flex w-full max-w-2xl items-center justify-center rounded-2xl border border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-slate-950/70">
          <img
            src={value}
            alt={`Vista previa de la firma ${signerLabel}`}
            className="max-h-44 w-full max-w-xl object-contain"
          />
        </div>
        <div className="max-w-xl space-y-2">
          <p className="inline-flex items-center justify-center gap-2 text-base font-semibold text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="size-5" />
            Firma lista
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {methodSuccessCopy}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={changeMethod}>
          <RotateCcw className="size-4" />
          Cambiar método
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!method ? (
        <div
          role="group"
          className="space-y-3"
          aria-label={`Métodos de firma ${signerLabel}`}
        >
          <button
            ref={chooserFirstOptionRef}
            type="button"
            className="group flex w-full items-center gap-4 rounded-2xl border border-violet-200 bg-white/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-md dark:border-violet-400/20 dark:bg-slate-950/50"
            onClick={() => chooseMethod("draw")}
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-100">
              <PenLine className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">
                Dibujar una firma nueva
              </span>
              <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                Firme con el mouse, el dedo o un lápiz digital.
              </span>
            </span>
            <ArrowRight className="size-5 shrink-0 text-violet-500 transition-transform group-hover:translate-x-0.5" />
          </button>

          <button
            type="button"
            className="group flex w-full items-center gap-4 rounded-2xl border border-violet-200 bg-white/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-md dark:border-violet-400/20 dark:bg-slate-950/50"
            onClick={() => chooseMethod("import")}
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-100">
              <ImagePlus className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">
                Importar una imagen
              </span>
              <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                Use una foto o archivo y quite el fondo antes de aplicarlo.
              </span>
            </span>
            <ArrowRight className="size-5 shrink-0 text-violet-500 transition-transform group-hover:translate-x-0.5" />
          </button>

          {savedSignature ? (
            <button
              type="button"
              className="group flex w-full items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md dark:border-emerald-400/20 dark:bg-emerald-950/20"
              onClick={() => chooseMethod("saved")}
            >
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-200 bg-white p-1 dark:border-emerald-400/20">
                <img
                  src={savedSignature}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">
                  Reutilizar firma guardada
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  Este paciente ya tiene una firma guardada. Úsela sin volver a
                  firmar.
                </span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-emerald-600 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {method === "draw" ? (
        <div
          ref={drawPanelRef}
          role="group"
          tabIndex={-1}
          aria-label={`Dibujar firma ${signerLabel}`}
          className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4 outline-none"
        >
          <SignaturePad
            ref={signaturePadRef}
            signerLabel={signerLabel}
            onInkChange={onDrawInkChange}
            onSaveAndContinue={(nextValue) => {
              completeMethod(nextValue, "draw");
              onDrawSaved(nextValue);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className="px-0"
            onClick={changeMethod}
          >
            <ArrowLeft className="size-4" />
            Elegir otro método
          </Button>
        </div>
      ) : null}

      {method === "import" ? (
        <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-5 text-sm text-muted-foreground dark:border-violet-400/20 dark:bg-violet-950/10">
          Complete la importación en la ventana abierta.
        </div>
      ) : null}

      <SignatureImageImportDialog
        open={method === "import" && imageImportOpen}
        signerLabel={signerLabel}
        replacingSignature={false}
        onOpenChange={handleImportOpenChange}
        onApply={(nextValue) => {
          importAppliedRef.current = true;
          completeMethod(nextValue, "import");
        }}
      />
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
      x: (event.clientX - bounds.left) / bounds.width - signature.placement.x,
      y: (event.clientY - bounds.top) / bounds.height - signature.placement.y,
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

function ConsentWizardSidebar({
  steps,
  activeStepId,
  completedStepIds,
  onStepSelect,
  disabled = false,
}: {
  steps: ConsentWizardStep[];
  activeStepId: ConsentStepId;
  completedStepIds: ReadonlySet<ConsentStepId>;
  onStepSelect: (stepId: ConsentStepId) => void;
  disabled?: boolean;
}) {
  const isDirectManualFlow = steps.some((step) =>
    DIRECT_MANUAL_STEP_IDS.includes(step.id),
  );

  return (
    <aside
      data-testid="consent-wizard-sidebar"
      className="overflow-hidden rounded-lg border border-violet-200/80 bg-violet-950 text-white shadow-[0_24px_70px_-48px_rgba(76,29,149,0.8)] lg:sticky lg:top-6"
    >
      <div className="border-b border-white/10 px-5 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/12 text-violet-100">
          <FilePenLine className="size-5" />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-violet-200">
          Consentimiento informado
        </p>
        <h2 className="mt-2 font-heading text-2xl font-semibold leading-tight">
          Subir consentimiento
        </h2>
      </div>
      <ol className="grid gap-1 p-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const active = step.id === activeStepId;
          const complete = completedStepIds.has(step.id);
          const directManualStepIndex = DIRECT_MANUAL_STEP_IDS.indexOf(step.id);
          const isDirectPreparation =
            isDirectManualFlow && directManualStepIndex < 0;
          return (
            <li
              key={step.id}
              aria-current={active ? "step" : undefined}
              data-step-id={step.id}
            >
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                disabled={disabled}
                onClick={() => onStepSelect(step.id)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 focus-visible:ring-offset-2 focus-visible:ring-offset-violet-950",
                  active && "bg-white text-violet-950 shadow-sm",
                  !active &&
                    "text-violet-100/76 hover:bg-white/10 hover:text-white",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                    active && "border-violet-200 bg-violet-100 text-violet-800",
                    complete &&
                      "border-emerald-300/40 bg-emerald-400/18 text-emerald-100",
                    !active && !complete && "border-white/18 bg-white/5",
                  )}
                >
                  {complete ? (
                    <Check className="size-3.5" />
                  ) : directManualStepIndex >= 0 ? (
                    directManualStepIndex + 1
                  ) : isDirectPreparation ? (
                    <span aria-hidden="true">•</span>
                  ) : (
                    index + 1
                  )}
                </span>
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 leading-5">{step.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function ConsentStepPrerequisite({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="max-w-3xl rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 p-6 dark:border-violet-400/24 dark:bg-violet-950/16">
      <h2 className="font-heading text-xl font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <Button type="button" className="mt-5" onClick={onAction}>
        {actionLabel}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const records = new Map(current.map((record) => [record.id, record]));
  incoming.forEach((record) => records.set(record.id, record));
  return [...records.values()];
}

export function PatientConsentUploadWizard({
  initialPatientName = "",
  initialPatientDocument = "",
  surface = "patient-portal",
  initialPatientPage,
  initialDraft = null,
  initialDraftRevision = null,
}: {
  initialPatientName?: string;
  initialPatientDocument?: string;
  surface?: "patient-portal" | "backoffice";
  initialPatientPage?: InformedConsentPatientPage;
  initialDraft?: InformedConsentDraftRecord | null;
  initialDraftRevision?: number | null;
}) {
  const router = useRouter();
  const isBackoffice = surface === "backoffice";
  const restoredDraft = isBackoffice ? null : initialDraft;
  const restoredMode = restoredDraft?.mode ?? null;
  const restoredStepId = normalizedDraftStep(restoredDraft);
  const restoredHasPartner = restoredDraft?.hasPartner ?? false;
  const casesRequestRef = useRef(0);
  const savedSignatureRequestRef = useRef(0);
  const patientSignaturePadRef = useRef<SignaturePadHandle>(null);
  const partnerSignaturePadRef = useRef<SignaturePadHandle>(null);
  const uploadInFlightRef = useRef(false);
  const documentVersionRef = useRef(0);
  const preparationTokenRef = useRef(0);
  const draftRevisionRef = useRef<number | null>(
    restoredDraft?.revision ?? initialDraftRevision ?? null,
  );
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSnapshotSequenceRef = useRef(0);
  const pendingDraftRef = useRef<
    | {
        snapshot: Omit<InformedConsentDraftMutation, "expectedRevision">;
        sequence: number;
      }
    | undefined
  >(undefined);
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftSavingStoppedRef = useRef(false);
  const draftConflictRef = useRef(false);
  const mountedRef = useRef(true);
  const actionFooterRef = useRef<HTMLElement>(null);
  const savedSignatureCacheRef = useRef(
    new Map<string, SavedSignatureCacheEntry>(),
  );
  const [actionFooterHeight, setActionFooterHeight] = useState(0);
  const [mode, setMode] = useState<ConsentFlowMode | null>(restoredMode);
  const [activeStepId, setActiveStepId] =
    useState<ConsentStepId>(restoredStepId);
  const [visitedStepIds, setVisitedStepIds] = useState<ConsentStepId[]>(() =>
    normalizedDraftVisitedSteps(restoredDraft),
  );
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousActiveStepIdRef = useRef<ConsentStepId>(activeStepId);
  const steps = consentSteps(isBackoffice, mode);
  const activeStepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeStepId),
  );
  const activeStep = steps[activeStepIndex] ?? CONSENT_STEPS.method;
  const directManualStepIndex = DIRECT_MANUAL_STEP_IDS.indexOf(activeStepId);
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
  const [patientName, setPatientName] = useState(
    restoredDraft ? restoredDraft.patientName : initialPatientName.trim(),
  );
  const [patientNameError, setPatientNameError] = useState("");
  const [patientDocument, setPatientDocument] = useState(
    restoredDraft
      ? restoredDraft.patientDocument
      : initialPatientDocument.trim(),
  );
  const [patientDocumentError, setPatientDocumentError] = useState("");
  const [signatureDate, setSignatureDate] = useState(
    restoredDraft?.signatureDate || todayInBuenosAires,
  );
  const [signatureDateError, setSignatureDateError] = useState("");
  const [hasPartner, setHasPartner] = useState(restoredHasPartner);
  const [partnerName, setPartnerName] = useState(
    restoredHasPartner ? (restoredDraft?.partnerName ?? "") : "",
  );
  const [partnerNameError, setPartnerNameError] = useState("");
  const [patientSignatureDataUrl, setPatientSignatureDataUrl] = useState<
    string | null
  >(restoredDraft?.patientSignatureDataUrl ?? null);
  const [partnerSignatureDataUrl, setPartnerSignatureDataUrl] = useState<
    string | null
  >(
    restoredHasPartner
      ? (restoredDraft?.partnerSignatureDataUrl ?? null)
      : null,
  );
  const [patientSignatureMethod, setPatientSignatureMethod] =
    useState<SignatureMethod | null>(
      restoredDraft?.patientSignatureMethod ?? null,
    );
  const [partnerSignatureMethod, setPartnerSignatureMethod] =
    useState<SignatureMethod | null>(
      restoredHasPartner
        ? (restoredDraft?.partnerSignatureMethod ?? null)
        : null,
    );
  const [patientDrawHasInk, setPatientDrawHasInk] = useState(false);
  const [partnerDrawHasInk, setPartnerDrawHasInk] = useState(false);
  const [reusableSavedSignature, setReusableSavedSignature] = useState<
    string | null
  >(null);
  const [patientPlacement, setPatientPlacement] =
    useState<ConsentSignaturePlacement>(() =>
      normalizedDraftPlacement(
        restoredDraft?.patientPlacement,
        INITIAL_PATIENT_PLACEMENT,
      ),
    );
  const [partnerPlacement, setPartnerPlacement] =
    useState<ConsentSignaturePlacement>(() =>
      normalizedDraftPlacement(
        restoredDraft?.partnerPlacement,
        INITIAL_PARTNER_PLACEMENT,
      ),
    );
  const [selectedRole, setSelectedRole] = useState<ConsentSignerRole>(
    restoredHasPartner && restoredDraft?.selectedRole === "partner"
      ? "partner"
      : "patient",
  );
  const [signedFile, setSignedFile] = useState<SingleFileValue | null>(null);
  const [directFile, setDirectFile] = useState<SingleFileValue | null>(null);
  const [directFileError, setDirectFileError] = useState("");
  const [legalAttestationAccepted, setLegalAttestationAccepted] =
    useState(false);
  const [completedConsentId, setCompletedConsentId] = useState<string | null>(
    null,
  );
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>(
    restoredDraft ? "saved" : "idle",
  );
  const [inlineError, setInlineError] = useState<string | null>(null);
  const formattedSignatureDate = formatSignatureDate(signatureDate);

  function buildDraftSnapshot(
    nextMode: ConsentFlowMode,
    nextActiveStepId: ConsentStepId,
    nextVisitedStepIds: ConsentStepId[] = visitedStepIds,
    signatureOverrides: DraftSignatureOverrides = {},
  ): Omit<InformedConsentDraftMutation, "expectedRevision"> {
    const allowedSteps = draftStepsForMode(nextMode);
    const safeActiveStepId = allowedSteps.includes(
      nextActiveStepId as PatientPortalConsentStepId,
    )
      ? (nextActiveStepId as PatientPortalConsentStepId)
      : nextMode === "guided"
        ? "download"
        : "direct-download";
    const safeVisitedStepIds = nextVisitedStepIds.filter(
      (stepId): stepId is PatientPortalConsentStepId =>
        allowedSteps.includes(stepId as PatientPortalConsentStepId),
    );

    return {
      schemaVersion: 1,
      mode: nextMode,
      activeStepId: safeActiveStepId,
      visitedStepIds: [
        ...new Set<InformedConsentDraftStepId>([
          "method",
          ...safeVisitedStepIds,
        ]),
      ],
      patientName,
      patientDocument,
      signatureDate,
      hasPartner,
      partnerName: hasPartner ? partnerName : "",
      patientSignatureDataUrl,
      partnerSignatureDataUrl: hasPartner ? partnerSignatureDataUrl : null,
      patientSignatureMethod,
      partnerSignatureMethod: hasPartner ? partnerSignatureMethod : null,
      patientPlacement,
      partnerPlacement,
      selectedRole: hasPartner ? selectedRole : "patient",
      ...signatureOverrides,
    };
  }

  function markDraftConflict() {
    draftConflictRef.current = true;
    draftSavingStoppedRef.current = true;
    pendingDraftRef.current = undefined;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (!mountedRef.current) return;
    setDraftSaveStatus("conflict");
  }

  function enqueuePendingDraftSave() {
    const pendingDraft = pendingDraftRef.current;
    if (!pendingDraft || draftSavingStoppedRef.current || isBackoffice) return;
    pendingDraftRef.current = undefined;
    const { snapshot, sequence } = pendingDraft;

    draftSaveQueueRef.current = draftSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (draftSavingStoppedRef.current) return;
        try {
          const response = await sdkFetch<{
            draft: InformedConsentDraftSummary;
          }>("/2pq/informed-consents/draft", {
            method: "PUT",
            body: JSON.stringify({
              ...snapshot,
              expectedRevision: draftRevisionRef.current,
            } satisfies InformedConsentDraftMutation),
          });
          if (Number.isInteger(response?.draft?.revision)) {
            draftRevisionRef.current = response.draft.revision;
          }
          if (
            mountedRef.current &&
            !pendingDraftRef.current &&
            !draftSavingStoppedRef.current
          ) {
            setDraftSaveStatus("saved");
          }
        } catch (error) {
          if (error instanceof SdkRequestError && error.status === 409) {
            markDraftConflict();
            return;
          }
          if (mountedRef.current && !draftSavingStoppedRef.current) {
            if (
              !pendingDraftRef.current &&
              sequence === draftSnapshotSequenceRef.current
            ) {
              pendingDraftRef.current = pendingDraft;
            }
            setDraftSaveStatus("error");
          }
        }
      });
  }

  function scheduleDraftSave(
    snapshot: Omit<InformedConsentDraftMutation, "expectedRevision">,
    delayMs = 400,
  ) {
    if (isBackoffice || draftSavingStoppedRef.current) return;
    const sequence = draftSnapshotSequenceRef.current + 1;
    draftSnapshotSequenceRef.current = sequence;
    pendingDraftRef.current = { snapshot, sequence };
    setDraftSaveStatus("saving");
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      enqueuePendingDraftSave();
    }, delayMs);
  }

  async function flushDraftSave() {
    if (isBackoffice) return;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    enqueuePendingDraftSave();
    await draftSaveQueueRef.current;
  }

  function navigateToStep(
    nextStepId: ConsentStepId,
    options: {
      nextMode?: ConsentFlowMode;
      preservePreparation?: boolean;
      draftSignatureOverrides?: DraftSignatureOverrides;
    } = {},
  ) {
    if (uploadInFlightRef.current) return;
    const nextMode = options.nextMode ?? mode;
    const nextSteps = consentSteps(isBackoffice, nextMode);
    if (!nextSteps.some((step) => step.id === nextStepId)) return;

    const nextVisitedStepIds = [...new Set([...visitedStepIds, nextStepId])];
    if (nextStepId !== activeStepId && options.preservePreparation !== true) {
      preparationTokenRef.current += 1;
    }
    if (nextStepId !== activeStepId) {
      documentVersionRef.current += 1;
    }
    if (options.nextMode) setMode(options.nextMode);
    setVisitedStepIds(nextVisitedStepIds);
    setActiveStepId(nextStepId);
    setInlineError(null);
    if (!isBackoffice && nextMode) {
      scheduleDraftSave(
        buildDraftSnapshot(
          nextMode,
          nextStepId,
          nextVisitedStepIds,
          options.draftSignatureOverrides,
        ),
        0,
      );
    }
  }

  useEffect(() => {
    if (previousActiveStepIdRef.current === activeStepId) return;
    previousActiveStepIdRef.current = activeStepId;
    stepHeadingRef.current?.focus();
  }, [activeStepId]);

  useEffect(() => {
    const footer = actionFooterRef.current;
    if (!footer) return;

    const updateFooterHeight = () => {
      const nextHeight = Math.ceil(footer.getBoundingClientRect().height);
      if (nextHeight <= 0) return;
      setActionFooterHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    };

    updateFooterHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFooterHeight);
      return () => window.removeEventListener("resize", updateFooterHeight);
    }

    const observer = new ResizeObserver(updateFooterHeight);
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const enqueuePendingSave = () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      enqueuePendingDraftSave();
    };
    const enqueuePendingSaveWhenHidden = () => {
      if (document.visibilityState === "hidden") enqueuePendingSave();
    };
    window.addEventListener("pagehide", enqueuePendingSave);
    document.addEventListener("visibilitychange", enqueuePendingSaveWhenHidden);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", enqueuePendingSave);
      document.removeEventListener(
        "visibilitychange",
        enqueuePendingSaveWhenHidden,
      );
      enqueuePendingSave();
    };
  }, []);

  const observedDraftStateRef = useRef(false);
  useEffect(() => {
    if (isBackoffice || !mode || draftSavingStoppedRef.current) return;
    if (!observedDraftStateRef.current) {
      observedDraftStateRef.current = true;
      return;
    }
    scheduleDraftSave(buildDraftSnapshot(mode, activeStepId));
  }, [
    hasPartner,
    isBackoffice,
    mode,
    partnerName,
    partnerPlacement.x,
    partnerPlacement.y,
    partnerPlacement.width,
    partnerSignatureDataUrl,
    partnerSignatureMethod,
    patientDocument,
    patientName,
    patientPlacement.x,
    patientPlacement.y,
    patientPlacement.width,
    patientSignatureDataUrl,
    patientSignatureMethod,
    selectedRole,
    signatureDate,
  ]);

  useEffect(() => {
    if (activeStepId !== "signature") return;
    const targetPatientId = isBackoffice ? patientId.trim() : "";
    if (isBackoffice && !targetPatientId) return;

    const targetKey = isBackoffice
      ? `backoffice:${targetPatientId}`
      : "patient-portal:self";
    const requestId = savedSignatureRequestRef.current + 1;
    savedSignatureRequestRef.current = requestId;
    setReusableSavedSignature(null);

    let cacheEntry = savedSignatureCacheRef.current.get(targetKey);
    if (!cacheEntry) {
      const path = isBackoffice
        ? `/2pq/informed-consents/saved-signature?patientId=${encodeURIComponent(targetPatientId)}`
        : "/2pq/informed-consents/saved-signature";
      const promise = Promise.resolve(
        sdkFetch<InformedConsentSavedSignaturePayload>(path),
      )
        .then((payload) => payload?.savedSignature ?? null)
        .catch(() => null);
      cacheEntry = { status: "pending", promise };
      savedSignatureCacheRef.current.set(targetKey, cacheEntry);
      void promise.then((value) => {
        const currentEntry = savedSignatureCacheRef.current.get(targetKey);
        if (
          currentEntry?.status === "pending" &&
          currentEntry.promise === promise
        ) {
          savedSignatureCacheRef.current.set(targetKey, {
            status: "resolved",
            value,
          });
        }
      });
    }

    if (cacheEntry.status === "resolved") {
      setReusableSavedSignature(cacheEntry.value);
      return;
    }

    void cacheEntry.promise.then((value) => {
      if (savedSignatureRequestRef.current !== requestId) return;
      setReusableSavedSignature(value);
    });

    return () => {
      if (savedSignatureRequestRef.current === requestId) {
        savedSignatureRequestRef.current += 1;
      }
    };
  }, [activeStepId, isBackoffice, patientId]);

  function invalidateAfter() {
    documentVersionRef.current += 1;
    preparationTokenRef.current += 1;
    setSignedFile(null);
    setLegalAttestationAccepted(false);
  }

  function changeSignatureMethod(
    role: ConsentSignerRole,
    nextMethod: SignatureMethod | null,
  ) {
    if (role === "patient") {
      setPatientDrawHasInk(false);
      setPatientSignatureDataUrl(null);
      setPatientSignatureMethod(nextMethod);
    } else {
      setPartnerDrawHasInk(false);
      setPartnerSignatureDataUrl(null);
      setPartnerSignatureMethod(nextMethod);
    }
    invalidateAfter();
  }

  function completeSignatureMethod(
    role: ConsentSignerRole,
    nextValue: string,
    nextMethod: SignatureMethod,
  ) {
    if (role === "patient") {
      setPatientDrawHasInk(false);
      setPatientSignatureDataUrl(nextValue);
      setPatientSignatureMethod(nextMethod);
    } else {
      setPartnerDrawHasInk(false);
      setPartnerSignatureDataUrl(nextValue);
      setPartnerSignatureMethod(nextMethod);
    }
    invalidateAfter();
  }

  function selectMode(nextMode: ConsentFlowMode) {
    if (uploadInFlightRef.current) return;
    const nextStep = isBackoffice
      ? "destination"
      : nextMode === "guided"
        ? "download"
        : "direct-download";
    invalidateAfter();
    navigateToStep(nextStep, { nextMode });
  }

  function returnToPreviousStep() {
    const previousStep = steps[activeStepIndex - 1];
    if (previousStep) navigateToStep(previousStep.id);
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
    invalidateAfter();
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
    if (validateNames()) navigateToStep("signature");
  }

  function flushCurrentDraftOnBlur() {
    if (
      isBackoffice ||
      !mode ||
      uploadInFlightRef.current ||
      draftSavingStoppedRef.current
    ) {
      return;
    }
    scheduleDraftSave(buildDraftSnapshot(mode, activeStepId), 0);
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
  const activeDrawRole: ConsentSignerRole | null =
    patientSignatureMethod === "draw" && !patientSignatureDataUrl
      ? "patient"
      : hasPartner &&
          Boolean(patientSignatureDataUrl) &&
          partnerSignatureMethod === "draw" &&
          !partnerSignatureDataUrl
        ? "partner"
        : null;
  const activeDrawHasInk =
    activeDrawRole === "patient"
      ? patientDrawHasInk
      : activeDrawRole === "partner"
        ? partnerDrawHasInk
        : false;

  function saveActiveDrawnSignature() {
    if (activeDrawRole === "patient") {
      patientSignaturePadRef.current?.saveAndContinue();
    } else if (activeDrawRole === "partner") {
      partnerSignaturePadRef.current?.saveAndContinue();
    }
  }

  function continueAfterDrawnSignature(
    role: ConsentSignerRole,
    signatureDataUrl: string,
  ) {
    const allSignaturesWillBeComplete =
      role === "patient"
        ? !hasPartner || Boolean(partnerSignatureDataUrl)
        : Boolean(patientSignatureDataUrl);
    if (!allSignaturesWillBeComplete) return;
    navigateToStep("editor", {
      draftSignatureOverrides:
        role === "patient"
          ? {
              patientSignatureDataUrl: signatureDataUrl,
              patientSignatureMethod: "draw",
            }
          : {
              partnerSignatureDataUrl: signatureDataUrl,
              partnerSignatureMethod: "draw",
            },
    });
  }

  async function prepareSignedConsent() {
    if (isBackoffice && !destinationComplete) {
      navigateToStep("destination");
      setInlineError("Seleccione un paciente y uno de sus casos 2PQ.");
      return;
    }
    if (!validateNames()) {
      navigateToStep("data");
      setInlineError(
        "Complete los datos de quienes firman antes de continuar.",
      );
      return;
    }
    if (!signaturesComplete || previewSignatures.length === 0) {
      navigateToStep("signature");
      setInlineError("Prepare todas las firmas antes de generar el documento.");
      return;
    }
    const preparationDocumentVersion = documentVersionRef.current;
    const preparationToken = preparationTokenRef.current;
    const preparationIsCurrent = () =>
      mountedRef.current &&
      preparationDocumentVersion === documentVersionRef.current &&
      preparationToken === preparationTokenRef.current;
    setPreparing(true);
    setInlineError(null);
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
      if (!preparationIsCurrent()) {
        if (mountedRef.current) {
          setInlineError(
            "El contenido o el paso activo cambiaron mientras se preparaba el documento. Aplicá las firmas nuevamente cuando estés listo para continuar.",
          );
        }
        return;
      }
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
      navigateToStep("preview", { preservePreparation: true });
    } catch (error) {
      if (!preparationIsCurrent()) {
        if (mountedRef.current) {
          setInlineError(
            "El contenido o el paso activo cambiaron mientras se preparaba el documento. Aplicá las firmas nuevamente cuando estés listo para continuar.",
          );
        }
        return;
      }
      setInlineError(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el consentimiento firmado.",
      );
    } finally {
      if (mountedRef.current) setPreparing(false);
    }
  }

  async function uploadConsent(
    file: SingleFileValue | null,
    uploadMode: ConsentFlowMode,
  ) {
    if (!file || saving || uploadInFlightRef.current) return;
    if (!isBackoffice && draftConflictRef.current) {
      markDraftConflict();
      return;
    }
    if (uploadMode === "guided") {
      if (isBackoffice && !destinationComplete) {
        navigateToStep("destination");
        setInlineError("Seleccione un paciente y uno de sus casos 2PQ.");
        return;
      }
      if (!validateNames()) {
        navigateToStep("data");
        setInlineError(
          "Complete los datos de quienes firman antes de continuar.",
        );
        return;
      }
      if (!signaturesComplete || !patientSignatureDataUrl) {
        navigateToStep("signature");
        setInlineError("Prepare todas las firmas antes de continuar.");
        return;
      }
      if (!legalAttestationAccepted) return;
    }
    uploadInFlightRef.current = true;
    const submissionDocumentVersion = documentVersionRef.current;
    setSaving(true);
    setInlineError(null);
    if (!isBackoffice) {
      await flushDraftSave();
      if (draftConflictRef.current) {
        uploadInFlightRef.current = false;
        setSaving(false);
        markDraftConflict();
        return;
      }
      if (submissionDocumentVersion !== documentVersionRef.current) {
        uploadInFlightRef.current = false;
        setSaving(false);
        if (mode) {
          scheduleDraftSave(buildDraftSnapshot(mode, activeStepId), 0);
        }
        setInlineError(
          "El contenido o el paso activo cambiaron durante el guardado. Revisá la información actual y volvé a confirmar el envío.",
        );
        return;
      }
      draftSavingStoppedRef.current = true;
    }
    try {
      const { record } = await sdkFetch<{ record: InformedConsentRecord }>(
        "/2pq/informed-consents",
        {
          method: "POST",
          body: JSON.stringify({
            ...(isBackoffice
              ? { patientId, caseId }
              : { expectedDraftRevision: draftRevisionRef.current }),
            flowMode: uploadMode,
            ...(uploadMode === "guided"
              ? {
                  savedSignature: patientSignatureDataUrl,
                  signatureAttestationAccepted: true,
                }
              : {}),
            file,
          }),
        },
      );
      if (uploadMode === "guided") {
        setCompletedConsentId(record.id);
        return;
      }
      router.push(
        isBackoffice
          ? `/2pq-dashboard/consents/${encodeURIComponent(record.id)}`
          : "/patient-portal/consents",
      );
      router.refresh();
    } catch (error) {
      const isDraftConflict =
        !isBackoffice &&
        error instanceof SdkRequestError &&
        error.status === 409;
      if (isDraftConflict) {
        markDraftConflict();
      } else {
        draftSavingStoppedRef.current = false;
        if (!isBackoffice && mode) {
          scheduleDraftSave(buildDraftSnapshot(mode, activeStepId), 0);
        }
        setInlineError("No se pudo subir el consentimiento.");
      }
    } finally {
      uploadInFlightRef.current = false;
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
    setInlineError(null);
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
      setInlineError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los casos 2PQ del paciente.",
      );
    } finally {
      if (requestId === casesRequestRef.current) {
        setLoadingCases(false);
      }
    }
  }

  async function loadMorePatients() {
    if (!patientCursor || loadingPatients) return;
    setLoadingPatients(true);
    setInlineError(null);
    try {
      const page = await sdkFetch<InformedConsentPatientPage>(
        `/2pq/informed-consents/patients?cursor=${encodeURIComponent(patientCursor)}`,
      );
      setPatients((current) => mergeById(current, page.patients));
      setPatientCursor(page.nextCursor);
    } catch (error) {
      setInlineError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar más pacientes.",
      );
    } finally {
      setLoadingPatients(false);
    }
  }

  function selectPatient(nextPatientId: string) {
    const patient = patients.find(
      (candidate) => candidate.id === nextPatientId,
    );
    setPatientId(nextPatientId);
    setPatientName(patient?.fullName.trim() ?? "");
    setPatientNameError("");
    setPatientDocument("");
    setPatientDocumentError("");
    setSignatureDate(todayInBuenosAires());
    setSignatureDateError("");
    setHasPartner(false);
    setPartnerName("");
    setPartnerNameError("");
    setPatientSignatureDataUrl(null);
    setPartnerSignatureDataUrl(null);
    setPatientSignatureMethod(null);
    setPartnerSignatureMethod(null);
    savedSignatureRequestRef.current += 1;
    setReusableSavedSignature(null);
    setPatientPlacement(INITIAL_PATIENT_PLACEMENT);
    setPartnerPlacement(INITIAL_PARTNER_PLACEMENT);
    setSelectedRole("patient");
    invalidateAfter();
    setDirectFile(null);
    setDirectFileError("");
    setLegalAttestationAccepted(false);
    setCaseId("");
    setCases([]);
    setCaseCursor(undefined);
    void loadCasesForPatient(nextPatientId);
  }

  function continueFromDestination() {
    if (!patientId || !caseId) {
      setInlineError("Seleccione un paciente y uno de sus casos 2PQ.");
      return;
    }
    navigateToStep(mode === "direct" ? "direct-download" : "download");
  }

  const selectedCase = cases.find((candidate) => candidate.id === caseId);
  const destinationComplete = Boolean(patientId && caseId);
  const signerDataComplete = Boolean(
    patientName.trim() &&
    patientDocument.trim() &&
    formattedSignatureDate &&
    (!hasPartner || partnerName.trim()),
  );
  const visitedSteps = new Set(visitedStepIds);
  const completedStepIds = new Set<ConsentStepId>();
  if (mode) completedStepIds.add("method");
  if (destinationComplete) completedStepIds.add("destination");
  if (visitedSteps.has("download") && activeStepId !== "download") {
    completedStepIds.add("download");
  }
  if (signerDataComplete) completedStepIds.add("data");
  if (signaturesComplete) completedStepIds.add("signature");
  if (signedFile) completedStepIds.add("editor");
  if (completedConsentId || (signedFile && legalAttestationAccepted)) {
    completedStepIds.add("preview");
  }
  if (
    visitedSteps.has("direct-download") &&
    activeStepId !== "direct-download"
  ) {
    completedStepIds.add("direct-download");
  }
  if (visitedSteps.has("direct-sign") && activeStepId !== "direct-sign") {
    completedStepIds.add("direct-sign");
  }
  if (directFile) completedStepIds.add("direct-upload");

  function continueAfterGuidedCompletion() {
    if (!completedConsentId) return;
    const destination = isBackoffice
      ? `/2pq-dashboard/consents/${encodeURIComponent(completedConsentId)}`
      : "/patient-portal/consents";
    setCompletedConsentId(null);
    router.push(destination);
    router.refresh();
  }

  function renderDestinationFields() {
    return (
      <div className="max-w-3xl space-y-5">
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
              invalidateAfter();
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
              onClick={() => void loadCasesForPatient(patientId, caseCursor)}
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
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {saving ? (
          <div
            data-testid="consent-final-submit-lock"
            role="status"
            className="absolute inset-0 z-50 flex cursor-wait items-start justify-center rounded-2xl bg-background/58 px-4 pt-24 backdrop-blur-[2px]"
          >
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-background px-5 py-4 text-sm font-semibold text-blue-950 shadow-xl dark:border-blue-400/30 dark:text-blue-50">
              <Loader2 className="size-5 animate-spin" />
              Cerrando y guardando el consentimiento…
            </div>
          </div>
        ) : null}
        <div
          data-testid="consent-wizard-interactions"
          aria-busy={saving}
          inert={saving}
          className="grid items-start gap-6 pb-[calc(15rem+env(safe-area-inset-bottom))] lg:grid-cols-[17rem_minmax(0,1fr)] xl:gap-8 xl:pb-[calc(8rem+env(safe-area-inset-bottom))]"
          style={
            actionFooterHeight > 0
              ? { paddingBottom: `calc(${actionFooterHeight}px + 1rem)` }
              : undefined
          }
        >
          <ConsentWizardSidebar
            steps={steps}
            activeStepId={activeStepId}
            completedStepIds={completedStepIds}
            onStepSelect={navigateToStep}
            disabled={saving}
          />

          <div className="min-w-0">
            <header className="mb-6 border-b border-violet-100 pb-6 dark:border-violet-400/16">
              <div
                className="grid gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${
                    mode === "direct"
                      ? DIRECT_MANUAL_STEP_IDS.length
                      : steps.length
                  }, minmax(0, 1fr))`,
                }}
                aria-label="Progreso de carga del consentimiento"
              >
                {mode === "direct" ? (
                  DIRECT_MANUAL_STEP_IDS.map((stepId) => (
                    <span
                      key={stepId}
                      className={cn(
                        "h-1.5 rounded-full transition-colors",
                        stepId === activeStepId || completedStepIds.has(stepId)
                          ? "bg-violet-600"
                          : "bg-violet-100 dark:bg-violet-400/16",
                      )}
                    />
                  ))
                ) : mode ? (
                  steps.map((step) => (
                    <span
                      key={step.id}
                      className={cn(
                        "h-1.5 rounded-full transition-colors",
                        step.id === activeStepId ||
                          completedStepIds.has(step.id)
                          ? "bg-violet-600"
                          : "bg-violet-100 dark:bg-violet-400/16",
                      )}
                    />
                  ))
                ) : (
                  <span className="h-1.5 rounded-full bg-violet-200 dark:bg-violet-400/24" />
                )}
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">
                {mode === "direct"
                  ? directManualStepIndex >= 0
                    ? `Paso manual ${directManualStepIndex + 1} de ${DIRECT_MANUAL_STEP_IDS.length}`
                    : "Preparación del recorrido manual"
                  : mode
                    ? `Paso ${activeStepIndex + 1} de ${steps.length}`
                    : "Paso 1 · Elegir recorrido"}
              </p>
              <h1
                ref={stepHeadingRef}
                tabIndex={-1}
                className="mt-2 scroll-mt-6 font-heading text-3xl font-semibold text-foreground outline-none"
              >
                {activeStep.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {activeStep.description}
              </p>
              {!isBackoffice && mode ? (
                <div
                  data-testid="consent-draft-save-status"
                  role={
                    draftSaveStatus === "error" ||
                    draftSaveStatus === "conflict"
                      ? "alert"
                      : "status"
                  }
                  className={cn(
                    "mt-3 flex w-fit flex-wrap items-center gap-2 text-xs font-medium",
                    draftSaveStatus === "error" ||
                      draftSaveStatus === "conflict"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {draftSaveStatus === "saving" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CloudCheck className="size-3.5" />
                  )}
                  {draftSaveStatus === "saving"
                    ? "Guardando borrador…"
                    : draftSaveStatus === "conflict"
                      ? "El borrador cambió en otra sesión. Volvé a Consentimientos y elegí “Continuar desde borrador” para retomar la versión más reciente."
                      : draftSaveStatus === "error"
                        ? "No se pudo guardar el borrador. Volveremos a intentarlo con el próximo cambio."
                        : "Borrador guardado automáticamente"}
                  {draftSaveStatus === "conflict" ? (
                    <Link
                      href="/patient-portal/consents"
                      className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                    >
                      <ArrowLeft className="size-3.5" />
                      Volver a consentimientos
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </header>

            {inlineError ? (
              <div
                data-testid="consent-inline-error"
                role="alert"
                className="mb-5 flex max-w-3xl items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/8 p-4 text-destructive"
              >
                <CircleAlert className="mt-0.5 size-5 shrink-0" />
                <p className="min-w-0 flex-1 text-sm font-medium leading-6">
                  {inlineError}
                </p>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold underline underline-offset-2"
                  onClick={() => setInlineError(null)}
                >
                  Cerrar
                </button>
              </div>
            ) : null}

            <div
              key={activeStepId}
              data-step-id={activeStepId}
              className={cn(
                "min-h-[34rem]",
                mode === "guided" &&
                  "animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none",
              )}
            >
              {activeStepId === "method" ? (
                <div className="grid max-w-4xl gap-5 md:grid-cols-2">
                  <button
                    type="button"
                    aria-label="Firmar en línea"
                    className={cn(
                      "group flex min-h-64 flex-col items-start rounded-xl border bg-white/78 p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_24px_60px_-40px_rgba(109,40,217,0.7)] dark:bg-slate-950/42",
                      mode === "guided"
                        ? "border-violet-500 ring-2 ring-violet-500/20"
                        : "border-violet-100 dark:border-violet-400/16",
                    )}
                    onClick={() => selectMode("guided")}
                  >
                    <span className="flex size-12 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-400/14 dark:text-violet-100">
                      <PenLine className="size-6" />
                    </span>
                    <span className="mt-6 font-heading text-xl font-semibold text-foreground">
                      Firmar en línea
                    </span>
                    <span className="mt-2 text-sm leading-6 text-muted-foreground">
                      Complete los datos, dibuje o importe las firmas y
                      ubíquelas sobre el consentimiento desde este flujo.
                    </span>
                    <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-violet-700 dark:text-violet-200">
                      Comenzar firma guiada
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label="Cargar archivo firmado"
                    className={cn(
                      "group flex min-h-64 flex-col items-start rounded-xl border bg-white/78 p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_24px_60px_-40px_rgba(109,40,217,0.7)] dark:bg-slate-950/42",
                      mode === "direct"
                        ? "border-violet-500 ring-2 ring-violet-500/20"
                        : "border-violet-100 dark:border-violet-400/16",
                    )}
                    onClick={() => selectMode("direct")}
                  >
                    <span className="flex size-12 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-400/14 dark:text-violet-100">
                      <FileUp className="size-6" />
                    </span>
                    <span className="mt-6 font-heading text-xl font-semibold text-foreground">
                      Cargar archivo firmado
                    </span>
                    <span className="mt-2 text-sm leading-6 text-muted-foreground">
                      Descargue la plantilla, imprímala, fírmela a mano y suba
                      un escaneo del documento completo.
                    </span>
                    <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-violet-700 dark:text-violet-200">
                      Ir a la carga directa
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>
                </div>
              ) : null}

              {activeStepId === "destination"
                ? renderDestinationFields()
                : null}

              {activeStepId === "download" ? (
                <div className="max-w-3xl space-y-5 rounded-xl border border-violet-100 bg-white/78 p-6 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
                  <p className="text-sm leading-6 text-muted-foreground">
                    {CONSENT_REVIEW_EXPLANATION}
                  </p>
                  <Button variant="outline" asChild>
                    <a
                      href={CONSENT_TEMPLATE_URL}
                      download="consentimiento-informado-2pq.pdf"
                    >
                      <Download className="size-4" />
                      Descargar consentimiento-informado-2pq.pdf
                    </a>
                  </Button>
                </div>
              ) : null}

              {activeStepId === "direct-download" ? (
                <div className="max-w-3xl space-y-5">
                  <div className="rounded-xl border border-violet-200 bg-white/78 p-6 shadow-sm dark:border-violet-400/20 dark:bg-slate-950/42">
                    <div className="flex items-start gap-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-base font-bold text-violet-800 dark:bg-violet-400/16 dark:text-violet-100">
                        1
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-heading text-xl font-semibold text-foreground">
                          Descargue la plantilla oficial
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Este es el documento que debe imprimir, completar y
                          firmar. No continúe con un formulario distinto ni con
                          una plantilla vacía creada por su cuenta.
                        </p>
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                          {CONSENT_REVIEW_EXPLANATION}
                        </p>
                        <Button className="mt-5" variant="outline" asChild>
                          <a
                            href={CONSENT_TEMPLATE_URL}
                            download="consentimiento-informado-2pq.pdf"
                          >
                            <Download className="size-4" />
                            Descargar plantilla de consentimiento
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>

                  <ol
                    aria-label="Pasos para cargar un consentimiento firmado manualmente"
                    className="grid gap-3 sm:grid-cols-3"
                  >
                    {[
                      "Descargar la plantilla",
                      "Imprimir, completar y firmar",
                      "Escanear y subir el archivo",
                    ].map((label, index) => (
                      <li
                        key={label}
                        className={cn(
                          "rounded-xl border p-4 text-sm leading-5",
                          index === 0
                            ? "border-violet-300 bg-violet-50 font-semibold text-violet-950 dark:border-violet-500/40 dark:bg-violet-400/10 dark:text-violet-50"
                            : "border-border/70 bg-background/55 text-muted-foreground",
                        )}
                      >
                        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em]">
                          Paso manual {index + 1}
                        </span>
                        {label}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {activeStepId === "direct-sign" ? (
                <div className="max-w-3xl rounded-xl border border-violet-200 bg-white/78 p-6 shadow-sm dark:border-violet-400/20 dark:bg-slate-950/42">
                  <div className="flex items-start gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-base font-bold text-violet-800 dark:bg-violet-400/16 dark:text-violet-100">
                      2
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-heading text-xl font-semibold text-foreground">
                        Imprima, complete y firme la plantilla
                      </h2>
                      <ol className="mt-4 space-y-3 text-sm leading-6 text-foreground">
                        <li className="flex gap-3">
                          <Printer className="mt-1 size-4 shrink-0 text-violet-700 dark:text-violet-200" />
                          Imprima todas las páginas de la plantilla descargada.
                        </li>
                        <li className="flex gap-3">
                          <PenLine className="mt-1 size-4 shrink-0 text-violet-700 dark:text-violet-200" />
                          Complete los datos requeridos y firme a mano donde
                          corresponda. Si aplica, incluya también la firma de la
                          pareja.
                        </li>
                        <li className="flex gap-3">
                          <ScanLine className="mt-1 size-4 shrink-0 text-violet-700 dark:text-violet-200" />
                          Escanee todas las páginas ya firmadas en un único PDF
                          legible para subirlo en el próximo paso.
                        </li>
                      </ol>
                      <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-700/50 dark:bg-amber-500/10 dark:text-amber-100">
                        No suba la plantilla sin completar o sin firmar. Antes
                        de continuar, compruebe que todos los datos y firmas se
                        lean con claridad.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeStepId === "data" ? (
                <div className="max-w-3xl space-y-5">
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
                        patientNameError
                          ? "consent-patient-name-error"
                          : undefined
                      }
                      onChange={(event) => {
                        setPatientName(event.target.value);
                        setPatientNameError("");
                        invalidateAfter();
                      }}
                      onBlur={flushCurrentDraftOnBlur}
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
                        invalidateAfter();
                      }}
                      onBlur={flushCurrentDraftOnBlur}
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
                        invalidateAfter();
                      }}
                      onBlur={flushCurrentDraftOnBlur}
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
                          if (!nextHasPartner) {
                            setPartnerName("");
                            setPartnerSignatureDataUrl(null);
                            setPartnerSignatureMethod(null);
                            setPartnerPlacement(INITIAL_PARTNER_PLACEMENT);
                            setSelectedRole("patient");
                          }
                          invalidateAfter();
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
                            setPartnerSignatureDataUrl(null);
                            setPartnerSignatureMethod(null);
                            setPartnerPlacement(INITIAL_PARTNER_PLACEMENT);
                            invalidateAfter();
                          }}
                          onBlur={flushCurrentDraftOnBlur}
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
                </div>
              ) : null}

              {activeStepId === "signature" ? (
                <div className="max-w-4xl space-y-5">
                  <div
                    className={cn("grid gap-5", hasPartner && "lg:grid-cols-2")}
                  >
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
                      <SignatureMethodField
                        signerLabel="del paciente"
                        value={patientSignatureDataUrl}
                        method={patientSignatureMethod}
                        savedSignature={reusableSavedSignature}
                        signaturePadRef={patientSignaturePadRef}
                        onDrawInkChange={setPatientDrawHasInk}
                        onMethodChange={(nextMethod) =>
                          changeSignatureMethod("patient", nextMethod)
                        }
                        onComplete={(nextValue, nextMethod) =>
                          completeSignatureMethod(
                            "patient",
                            nextValue,
                            nextMethod,
                          )
                        }
                        onDrawSaved={(signatureDataUrl) =>
                          continueAfterDrawnSignature(
                            "patient",
                            signatureDataUrl,
                          )
                        }
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
                        {patientSignatureDataUrl ? (
                          <SignatureMethodField
                            signerLabel="de la pareja"
                            value={partnerSignatureDataUrl}
                            method={partnerSignatureMethod}
                            signaturePadRef={partnerSignaturePadRef}
                            onDrawInkChange={setPartnerDrawHasInk}
                            onMethodChange={(nextMethod) =>
                              changeSignatureMethod("partner", nextMethod)
                            }
                            onComplete={(nextValue, nextMethod) =>
                              completeSignatureMethod(
                                "partner",
                                nextValue,
                                nextMethod,
                              )
                            }
                            onDrawSaved={(signatureDataUrl) =>
                              continueAfterDrawnSignature(
                                "partner",
                                signatureDataUrl,
                              )
                            }
                            autoFocusChooser
                          />
                        ) : (
                          <div
                            className="flex min-h-40 items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground"
                            aria-live="polite"
                          >
                            <LockKeyhole className="size-5 shrink-0" />
                            Primero complete la firma del paciente para
                            continuar con la firma de la pareja.
                          </div>
                        )}
                      </section>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {activeStepId === "editor" ? (
                signaturesComplete && signerDataComplete ? (
                  <div className="space-y-5">
                    {hasPartner ? (
                      <div
                        role="group"
                        aria-label="Seleccionar firma para ubicar"
                        className="flex flex-wrap gap-2"
                      >
                        <Button
                          type="button"
                          variant={
                            selectedRole === "patient" ? "default" : "outline"
                          }
                          onClick={() => setSelectedRole("patient")}
                        >
                          Firma del paciente
                        </Button>
                        <Button
                          type="button"
                          variant={
                            selectedRole === "partner" ? "default" : "outline"
                          }
                          onClick={() => setSelectedRole("partner")}
                        >
                          Firma de la pareja
                        </Button>
                      </div>
                    ) : null}
                    <SignaturePagePreview
                      pageIndex={CONSENT_TEMPLATE_LAST_PAGE_INDEX}
                      signatures={previewSignatures}
                      selectedRole={selectedRole}
                      editable
                      onPlacementChange={updatePlacement}
                      onSelectRole={setSelectedRole}
                    />
                  </div>
                ) : (
                  <ConsentStepPrerequisite
                    title="Todavía faltan datos para aplicar las firmas"
                    description={
                      !signerDataComplete
                        ? "Complete los datos de quienes firman antes de preparar el documento final. Puede volver a este paso desde la barra lateral en cualquier momento."
                        : "Prepare todas las firmas requeridas antes de ubicarlas sobre la última página del consentimiento."
                    }
                    actionLabel={
                      !signerDataComplete
                        ? "Completar datos"
                        : "Preparar firmas"
                    }
                    onAction={() =>
                      navigateToStep(!signerDataComplete ? "data" : "signature")
                    }
                  />
                )
              ) : null}

              {activeStepId === "preview" ? (
                signaturesComplete && signerDataComplete && signedFile ? (
                  <div className="space-y-5">
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
                    <section className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-blue-200 bg-[linear-gradient(145deg,rgba(239,246,255,0.98),rgba(236,254,255,0.76))] shadow-[0_24px_70px_-48px_rgba(37,99,235,0.82)] dark:border-blue-400/24 dark:bg-[linear-gradient(145deg,rgba(30,58,138,0.34),rgba(8,47,73,0.26))]">
                      <div className="flex items-start gap-3 border-b border-blue-200/70 px-5 py-4 dark:border-blue-300/16">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_12px_30px_rgba(37,99,235,0.28)]">
                          <LockKeyhole className="size-5" />
                        </span>
                        <div>
                          <h2 className="font-heading text-xl font-semibold text-blue-950 dark:text-blue-50">
                            Confirmación legal de identidad y firma
                          </h2>
                          <p className="mt-1 text-sm leading-6 text-blue-900/70 dark:text-blue-50/70">
                            Revise el documento completo. Esta aceptación
                            cerrará y enviará el consentimiento informado
                            firmado.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-4 p-5">
                        {isBackoffice ? (
                          <div className="flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm leading-6 text-amber-950 dark:border-amber-400/24 dark:bg-amber-500/10 dark:text-amber-50">
                            <UserRound className="mt-0.5 size-4 shrink-0" />
                            <p>
                              Entregue el control de este dispositivo a{" "}
                              <strong>{patientName.trim()}</strong>. La
                              declaración y la aceptación final deben ser
                              realizadas personalmente por quien se realizará el
                              estudio.
                            </p>
                          </div>
                        ) : null}
                        <div className="flex items-start gap-3 rounded-xl border border-blue-300/70 bg-white/86 p-4 dark:border-blue-300/20 dark:bg-blue-950/42">
                          <Checkbox
                            id="consent-legal-attestation"
                            required
                            aria-required="true"
                            disabled={saving}
                            checked={legalAttestationAccepted}
                            onCheckedChange={(checked) =>
                              setLegalAttestationAccepted(checked === true)
                            }
                            className="mt-1 size-5 border-blue-400 data-checked:border-blue-600 data-checked:bg-blue-600 dark:data-checked:bg-blue-500"
                          />
                          <Label
                            htmlFor="consent-legal-attestation"
                            className="cursor-pointer text-sm leading-6 text-blue-950 dark:text-blue-50"
                          >
                            Declaro, bajo mi responsabilidad, que soy la persona
                            a quien se realizará este estudio, que la firma
                            incorporada en el documento me pertenece y expresa
                            mi voluntad, y que esta aceptación constituye una
                            firma electrónica vinculante del consentimiento
                            informado.
                          </Label>
                        </div>
                        {!legalAttestationAccepted ? (
                          <p className="flex items-center gap-2 text-xs font-medium text-blue-800 dark:text-blue-100/78">
                            <ShieldCheck className="size-4" />
                            Marque la declaración para habilitar el envío final.
                          </p>
                        ) : (
                          <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                            <CheckCircle2 className="size-4" />
                            Identidad y voluntad confirmadas para el cierre.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                ) : (
                  <ConsentStepPrerequisite
                    title="Prepare el documento antes de revisarlo"
                    description={
                      !signerDataComplete
                        ? "Complete los datos de quienes firman para poder generar una vista previa válida."
                        : !signaturesComplete
                          ? "Prepare todas las firmas antes de generar el consentimiento firmado."
                          : "Aplique las firmas al PDF para reconstruir la vista previa final. El PDF generado no se almacena dentro del borrador."
                    }
                    actionLabel={
                      !signerDataComplete
                        ? "Completar datos"
                        : !signaturesComplete
                          ? "Preparar firmas"
                          : "Aplicar firmas al PDF"
                    }
                    onAction={() =>
                      navigateToStep(
                        !signerDataComplete
                          ? "data"
                          : !signaturesComplete
                            ? "signature"
                            : "editor",
                      )
                    }
                  />
                )
              ) : null}

              {activeStepId === "direct-upload" ? (
                <div className="max-w-3xl space-y-5">
                  {restoredDraft?.mode === "direct" && !directFile ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm leading-6 text-amber-950 dark:border-amber-400/24 dark:bg-amber-950/20 dark:text-amber-100">
                      Por seguridad, los archivos elegidos no se guardan dentro
                      del borrador. Seleccione nuevamente el consentimiento
                      firmado para continuar.
                    </div>
                  ) : null}
                  <div className="flex items-start gap-4 rounded-xl border border-violet-200 bg-white/78 p-6 shadow-sm dark:border-violet-400/20 dark:bg-slate-950/42">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-base font-bold text-violet-800 dark:bg-violet-400/16 dark:text-violet-100">
                      3
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-heading text-xl font-semibold text-foreground">
                        Suba el documento completo y firmado
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        El archivo debe mostrar todas las páginas, los datos
                        completos y las firmas manuscritas con buena
                        legibilidad.
                      </p>
                    </div>
                  </div>
                  <SingleFileUpload
                    id={`${surface}-direct-consent-file`}
                    label="Consentimiento firmado"
                    value={directFile}
                    onChange={(file) => {
                      setDirectFile(file);
                      setDirectFileError("");
                      invalidateAfter();
                    }}
                    onError={setDirectFileError}
                    error={directFileError}
                    uploadLabel="Elegir escaneo o archivo"
                    removeLabel="Quitar archivo"
                    emptyLabel="Sin archivo seleccionado"
                    invalidTypeMessage="Seleccione un PDF o una imagen compatible."
                    tooLargeMessage="El archivo seleccionado supera los 750 KB."
                    readErrorMessage="No se pudo leer el archivo seleccionado."
                    helperText="Un único PDF con todas las páginas o una imagen completa y legible. Máximo 750 KB."
                  />
                </div>
              ) : null}
            </div>

            {mode === "guided" ? (
              <aside
                data-testid="guided-signing-security-banner"
                aria-labelledby="guided-signing-security-title"
                className="mt-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-blue-200/80 bg-[linear-gradient(135deg,rgba(239,246,255,0.96),rgba(236,254,255,0.72))] p-4 text-blue-950 shadow-[0_18px_50px_-38px_rgba(37,99,235,0.75)] dark:border-blue-400/24 dark:bg-[linear-gradient(135deg,rgba(30,58,138,0.34),rgba(8,47,73,0.28))] dark:text-blue-50"
              >
                <span
                  aria-hidden="true"
                  className="relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white/90 text-blue-700 shadow-sm dark:border-blue-300/20 dark:bg-blue-950/70 dark:text-blue-100"
                >
                  <span className="absolute inset-0 animate-pulse rounded-xl bg-blue-400/10 motion-reduce:animate-none" />
                  <ShieldCheck className="relative size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-200">
                    Proceso de firma electrónica
                  </p>
                  <h2
                    id="guided-signing-security-title"
                    className="mt-1 font-heading text-lg font-semibold"
                  >
                    Está firmando un documento digital
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-blue-900/72 dark:text-blue-50/72">
                    La identidad declarada, la firma y el documento se revisan
                    juntos antes del envío. El avance se guarda como borrador
                    privado; el consentimiento solo se envía después de la
                    aceptación final.
                  </p>
                </div>
              </aside>
            ) : null}

            <footer
              ref={actionFooterRef}
              data-testid="consent-wizard-action-footer"
              aria-label="Acciones del paso"
              className="consent-wizard-action-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 grid w-auto items-end gap-6 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-[left] duration-200 ease-linear lg:grid-cols-[17rem_minmax(0,1fr)] lg:px-6 xl:gap-8"
            >
              <span aria-hidden="true" className="hidden lg:block" />
              <div className="pointer-events-auto flex flex-col gap-3 rounded-2xl border border-violet-100/90 bg-background/96 px-4 py-3 shadow-[0_-18px_45px_-28px_rgba(15,23,42,0.42)] backdrop-blur-xl sm:flex-row sm:flex-wrap sm:items-center sm:justify-between dark:border-violet-400/18 dark:bg-background/92">
                {activeStepId === "method" ? (
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    asChild
                  >
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
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={returnToPreviousStep}
                  >
                    <ArrowLeft className="size-4" />
                    Volver
                  </Button>
                )}

                <div className="ml-auto flex w-full flex-col items-stretch justify-end gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                  {activeStepId === "destination" ? (
                    <Button
                      type="button"
                      className="h-11 rounded-full bg-violet-600 px-6 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
                      disabled={!destinationComplete || loadingCases}
                      onClick={continueFromDestination}
                    >
                      Continuar
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : null}

                  {activeStepId === "download" ? (
                    <Button
                      type="button"
                      className="h-11 rounded-full bg-violet-600 px-6 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
                      onClick={() => navigateToStep("data")}
                    >
                      Continuar con los datos
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : null}

                  {activeStepId === "data" ? (
                    <Button
                      type="button"
                      className="h-11 rounded-full bg-violet-600 px-6 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
                      onClick={continueFromNames}
                    >
                      Continuar para firmar
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : null}

                  {activeStepId === "direct-download" ? (
                    <Button
                      type="button"
                      className="h-11 rounded-full bg-violet-600 px-6 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
                      onClick={() => navigateToStep("direct-sign")}
                    >
                      Ya descargué la plantilla
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : null}

                  {activeStepId === "direct-sign" ? (
                    <Button
                      type="button"
                      className="h-11 rounded-full bg-violet-600 px-6 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
                      onClick={() => navigateToStep("direct-upload")}
                    >
                      Ya lo imprimí y firmé
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : null}

                  {activeStepId === "signature" && activeDrawRole ? (
                    <Button
                      type="button"
                      className="h-11 rounded-full bg-blue-600 px-6 font-semibold text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] hover:bg-blue-700"
                      disabled={!activeDrawHasInk}
                      onClick={saveActiveDrawnSignature}
                    >
                      <Check className="size-4" />
                      Guardar firma y continuar
                    </Button>
                  ) : null}

                  {activeStepId === "signature" && signaturesComplete ? (
                    <Button
                      type="button"
                      className="h-11 rounded-full bg-violet-600 px-6 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
                      disabled={!signaturesComplete}
                      onClick={() => navigateToStep("editor")}
                    >
                      Continuar al editor
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : null}

                  {activeStepId === "editor" ? (
                    <Button
                      type="button"
                      className="h-11 rounded-full bg-violet-600 px-6 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
                      disabled={preparing || !signaturesComplete}
                      aria-busy={preparing}
                      onClick={() => void prepareSignedConsent()}
                    >
                      {preparing ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Preparando documento…
                        </>
                      ) : (
                        <>
                          <FilePenLine className="size-4" />
                          Aplicar firmas y continuar
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  ) : null}

                  {activeStepId === "preview" && signedFile ? (
                    <>
                      <Button variant="outline" asChild>
                        <a href={signedFile.content} download={signedFile.name}>
                          <Download className="size-4" />
                          Descargar PDF firmado
                        </a>
                      </Button>
                      <Button
                        type="button"
                        className="h-auto min-h-14 w-full min-w-0 whitespace-normal rounded-xl bg-blue-600 px-4 py-3 text-center text-base font-semibold leading-snug text-white shadow-[0_18px_44px_rgba(37,99,235,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_22px_52px_rgba(37,99,235,0.38)] disabled:translate-y-0 disabled:bg-blue-300 disabled:shadow-none sm:w-auto sm:min-w-[18rem] sm:px-8 dark:disabled:bg-blue-900/60"
                        disabled={
                          saving ||
                          !legalAttestationAccepted ||
                          draftSaveStatus === "conflict"
                        }
                        onClick={() => void uploadConsent(signedFile, "guided")}
                      >
                        {saving ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="size-5" />
                        )}
                        Acepto la realización de este estudio
                      </Button>
                    </>
                  ) : null}

                  {activeStepId === "direct-upload" ? (
                    <Button
                      type="button"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={
                        !directFile ||
                        saving ||
                        draftSaveStatus === "conflict" ||
                        (isBackoffice && !destinationComplete)
                      }
                      onClick={() => void uploadConsent(directFile, "direct")}
                    >
                      {saving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      Subir consentimiento
                    </Button>
                  ) : null}
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>

      {completedConsentId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="consent-completion-title"
          className="fixed inset-0 z-[85] flex items-center justify-center px-4"
        >
          <div className="absolute inset-0 bg-background/36 backdrop-blur-[4px]" />
          <div className="pointer-events-auto animate-in fade-in-0 zoom-in-95 relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-blue-200/45 bg-[linear-gradient(155deg,rgba(125,211,252,0.36),rgba(12,74,110,0.98)_48%,rgba(37,99,235,0.96))] px-6 py-8 text-center shadow-[0_34px_130px_rgba(37,99,235,0.38)] duration-500 motion-reduce:animate-none">
            {CONSENT_COMPLETION_CONFETTI.map((particle, index) => (
              <span
                key={`${particle.left}-${particle.delay}-${index}`}
                aria-hidden="true"
                className="two-pq-confetti absolute h-3 w-3 rounded-[5px] motion-reduce:animate-none"
                style={{
                  left: particle.left,
                  top: particle.top,
                  background: particle.color,
                  animationDelay: particle.delay,
                  animationDuration: particle.duration,
                }}
              />
            ))}
            <div className="relative flex flex-col items-center">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-blue-100/18 text-blue-50 shadow-[0_0_0_14px_rgba(186,230,253,0.13)]">
                <span className="two-pq-success-ring absolute inset-0 rounded-full border border-blue-100/60 motion-reduce:animate-none" />
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <p className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-50/88">
                <Sparkles className="size-4" />
                Firma electrónica completada
              </p>
              <h2
                id="consent-completion-title"
                className="mt-2 font-heading text-3xl font-semibold text-white"
              >
                Consentimiento firmado y enviado
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-blue-50/84">
                El documento se cerró y quedó almacenado correctamente con el
                identificador{" "}
                <span className="font-mono font-semibold text-blue-50">
                  {completedConsentId}
                </span>
                .
              </p>
              <Button
                type="button"
                autoFocus
                onClick={continueAfterGuidedCompletion}
                className="mt-6 h-12 rounded-[1.1rem] border border-blue-100/20 bg-white px-7 text-sm font-semibold text-blue-950 shadow-[0_18px_48px_rgba(186,230,253,0.24)] hover:bg-blue-50"
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
