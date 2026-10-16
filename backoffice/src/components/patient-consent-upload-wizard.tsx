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
  applySignaturesToConsentPdf,
  bytesToPdfDataUrl,
  CONSENT_SIGNER_NAME_PLACEMENTS,
  CONSENT_TEMPLATE_PREVIEW_URLS,
  CONSENT_TEMPLATE_URL,
  type ConsentSignerRole,
  type ConsentSignaturePlacement,
  SIGNED_CONSENT_FILE_NAME,
} from "@/lib/consent-pdf";
import type { InformedConsentRecord } from "@/lib/informed-consents";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const MAX_CONSENT_BYTES = 750_000;
const SIGNATURE_CANVAS_WIDTH = 720;
const SIGNATURE_CANVAS_HEIGHT = 240;

const STEPS = [
  { title: "Descargar", icon: Download },
  { title: "Datos", icon: UserRound },
  { title: "Firmar", icon: PenLine },
  { title: "Aplicar firma", icon: FilePenLine },
  { title: "Vista previa", icon: CheckCircle2 },
] as const;

const INITIAL_PATIENT_PLACEMENT: ConsentSignaturePlacement = {
  pageIndex: 1,
  x: 0.72,
  y: 0.445,
  width: 0.16,
};

const INITIAL_PARTNER_PLACEMENT: ConsentSignaturePlacement = {
  pageIndex: 1,
  x: 0.72,
  y: 0.64,
  width: 0.16,
};

type PreviewSignature = {
  role: ConsentSignerRole;
  label: string;
  name: string;
  dataUrl: string;
  placement: ConsentSignaturePlacement;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
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
        return (
          <div key={signature.role}>
            {namePlacement.pageIndex === pageIndex ? (
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
            {signature.placement.pageIndex === pageIndex ? (
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
  activeStep,
  furthestStep,
  onSelect,
}: {
  activeStep: number;
  furthestStep: number;
  onSelect: (step: number) => void;
}) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {STEPS.map((step, index) => {
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

export function PatientConsentUploadWizard({
  initialPatientName = "",
}: {
  initialPatientName?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"guided" | "direct">("guided");
  const [activeStep, setActiveStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [patientName, setPatientName] = useState(initialPatientName.trim());
  const [patientNameError, setPatientNameError] = useState("");
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

  function goToStep(step: number) {
    const nextStep = clamp(step, 0, STEPS.length - 1);
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
    invalidateAfter(3);
  }

  function validateNames() {
    const nextPatientName = patientName.trim();
    const nextPartnerName = partnerName.trim();
    const missingPatient = !nextPatientName;
    const missingPartner = hasPartner && !nextPartnerName;
    setPatientNameError(
      missingPatient ? "Ingrese el nombre y apellido del paciente." : "",
    );
    setPartnerNameError(
      missingPartner ? "Ingrese el nombre y apellido de la pareja." : "",
    );
    if (missingPatient || missingPartner) return false;
    setPatientName(nextPatientName);
    if (hasPartner) setPartnerName(nextPartnerName);
    return true;
  }

  function continueFromNames() {
    if (validateNames()) goToStep(2);
  }

  const previewSignatures: PreviewSignature[] = patientSignatureDataUrl
    ? [
        {
          role: "patient",
          label: "del paciente",
          name: patientName.trim(),
          dataUrl: patientSignatureDataUrl,
          placement: patientPlacement,
        },
        ...(hasPartner && partnerSignatureDataUrl
          ? [
              {
                role: "partner" as const,
                label: "de la pareja",
                name: partnerName.trim(),
                dataUrl: partnerSignatureDataUrl,
                placement: partnerPlacement,
              },
            ]
          : []),
      ]
    : [];

  const selectedPlacement =
    selectedRole === "patient" ? patientPlacement : partnerPlacement;

  const signaturesComplete =
    Boolean(patientSignatureDataUrl) &&
    (!hasPartner || Boolean(partnerSignatureDataUrl));

  function updateSelectedPlacement(
    nextPlacement: ConsentSignaturePlacement,
  ) {
    updatePlacement(selectedRole, nextPlacement);
  }

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
      goToStep(4);
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
      await sdkFetch<{ record: InformedConsentRecord }>(
        "/2pq/informed-consents",
        {
          method: "POST",
          body: JSON.stringify({ file }),
        },
      );
      router.push("/patient-portal/consents");
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

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/patient-portal/consents">
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
            <SingleFileUpload
              id="patient-portal-direct-consent-file"
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
              disabled={!directFile || saving}
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
              activeStep={activeStep}
              furthestStep={furthestStep}
              onSelect={goToStep}
            />

            {activeStep === 0 ? (
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
                <Button type="button" onClick={() => goToStep(1)}>
                  Continuar con los datos
                </Button>
              </div>
            ) : null}

            {activeStep === 1 ? (
              <div className="max-w-3xl space-y-5">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    Datos de quienes firman
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Confirme el nombre del paciente e indique si su pareja
                    también firmará el consentimiento.
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
                      invalidateAfter(1);
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
                        invalidateAfter(1);
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
                          invalidateAfter(1);
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
                    onClick={() => goToStep(0)}
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

            {activeStep === 2 ? (
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
                    </div>
                    <SignaturePad
                      signerLabel="del paciente"
                      value={patientSignatureDataUrl}
                      onChange={(value) => {
                        setPatientSignatureDataUrl(value);
                        invalidateAfter(2);
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
                      </div>
                      <SignaturePad
                        signerLabel="de la pareja"
                        value={partnerSignatureDataUrl}
                        onChange={(value) => {
                          setPartnerSignatureDataUrl(value);
                          invalidateAfter(2);
                        }}
                      />
                    </section>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(1)}
                  >
                    <ArrowLeft className="size-4" />
                    Volver a datos
                  </Button>
                  <Button
                    type="button"
                    disabled={!signaturesComplete}
                    onClick={() => goToStep(3)}
                  >
                    Continuar al editor
                  </Button>
                </div>
              </div>
            ) : null}

            {activeStep === 3 && signaturesComplete ? (
              <div className="space-y-5">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    Aplicar firmas al PDF
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Seleccione una firma, arrástrela sobre la página o ajuste
                    su posición y tamaño con los controles.
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
                <div className="flex flex-wrap gap-2">
                  {CONSENT_TEMPLATE_PREVIEW_URLS.map((_, pageIndex) => (
                    <Button
                      key={pageIndex}
                      type="button"
                      variant={
                        selectedPlacement.pageIndex === pageIndex
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        updateSelectedPlacement({
                          ...selectedPlacement,
                          pageIndex,
                        })
                      }
                    >
                      Página {pageIndex + 1}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <SignaturePagePreview
                    pageIndex={selectedPlacement.pageIndex}
                    signatures={previewSignatures}
                    selectedRole={selectedRole}
                    editable
                    onPlacementChange={updatePlacement}
                    onSelectRole={setSelectedRole}
                  />
                  <div className="space-y-5 rounded-xl border border-border/70 bg-background/60 p-4 xl:sticky xl:top-24 xl:self-start">
                    <p className="text-sm font-semibold">
                      Ajustando firma{" "}
                      {selectedRole === "patient"
                        ? "del paciente"
                        : "de la pareja"}
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="signature-horizontal-position">
                        Posición horizontal
                      </Label>
                      <input
                        id="signature-horizontal-position"
                        type="range"
                        min="0"
                        max={Math.round((1 - selectedPlacement.width) * 100)}
                        value={Math.round(selectedPlacement.x * 100)}
                        onChange={(event) =>
                          updateSelectedPlacement({
                            ...selectedPlacement,
                            x: Number(event.target.value) / 100,
                          })
                        }
                        className="w-full accent-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signature-vertical-position">
                        Posición vertical
                      </Label>
                      <input
                        id="signature-vertical-position"
                        type="range"
                        min="0"
                        max="92"
                        value={Math.round(selectedPlacement.y * 100)}
                        onChange={(event) =>
                          updateSelectedPlacement({
                            ...selectedPlacement,
                            y: Number(event.target.value) / 100,
                          })
                        }
                        className="w-full accent-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signature-size">Tamaño</Label>
                      <input
                        id="signature-size"
                        type="range"
                        min="8"
                        max="40"
                        value={Math.round(selectedPlacement.width * 100)}
                        onChange={(event) =>
                          updateSelectedPlacement({
                            ...selectedPlacement,
                            width: Number(event.target.value) / 100,
                            x: Math.min(
                              selectedPlacement.x,
                              1 - Number(event.target.value) / 100,
                            ),
                          })
                        }
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(2)}
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

            {activeStep === 4 && signaturesComplete && signedFile ? (
              <div className="space-y-5">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    Vista previa completa
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Revise las dos páginas, los nombres y la ubicación de las
                    firmas antes de subir el consentimiento.
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
                    onClick={() => goToStep(3)}
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
