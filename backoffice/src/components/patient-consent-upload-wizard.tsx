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
import { Label } from "@/components/ui/label";
import {
  applySignatureToConsentPdf,
  bytesToPdfDataUrl,
  CONSENT_TEMPLATE_PREVIEW_URLS,
  CONSENT_TEMPLATE_URL,
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
  { title: "Firmar", icon: PenLine },
  { title: "Aplicar firma", icon: FilePenLine },
  { title: "Vista previa", icon: CheckCircle2 },
] as const;

const INITIAL_PLACEMENT: ConsentSignaturePlacement = {
  pageIndex: 1,
  x: 0.72,
  y: 0.445,
  width: 0.16,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
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
          aria-label="Área para dibujar la firma"
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
          Guardar firma
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
  signatureDataUrl,
  placement,
  editable = false,
  onPlacementChange,
}: {
  pageIndex: number;
  signatureDataUrl: string;
  placement: ConsentSignaturePlacement;
  editable?: boolean;
  onPlacementChange?: (placement: ConsentSignaturePlacement) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const isSignaturePage = placement.pageIndex === pageIndex;

  function startDragging(event: ReactPointerEvent<HTMLImageElement>) {
    if (!editable || !pageRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = pageRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: (event.clientX - bounds.left) / bounds.width - placement.x,
      y: (event.clientY - bounds.top) / bounds.height - placement.y,
    };
    draggingRef.current = true;
  }

  function moveSignature(event: ReactPointerEvent<HTMLImageElement>) {
    if (!editable || !draggingRef.current || !pageRef.current) return;
    event.preventDefault();
    const bounds = pageRef.current.getBoundingClientRect();
    const x =
      (event.clientX - bounds.left) / bounds.width - dragOffsetRef.current.x;
    const y =
      (event.clientY - bounds.top) / bounds.height - dragOffsetRef.current.y;
    onPlacementChange?.({
      ...placement,
      x: clamp(x, 0, 1 - placement.width),
      y: clamp(y, 0, 0.92),
    });
  }

  function stopDragging(event: ReactPointerEvent<HTMLImageElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
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
      {isSignaturePage ? (
        <img
          src={signatureDataUrl}
          alt="Firma aplicada"
          className={cn(
            "absolute h-auto select-none",
            editable &&
              "cursor-grab touch-none rounded border border-dashed border-primary/80 bg-primary/5 active:cursor-grabbing",
          )}
          draggable={false}
          style={{
            left: `${placement.x * 100}%`,
            top: `${placement.y * 100}%`,
            width: `${placement.width * 100}%`,
          }}
          onPointerDown={startDragging}
          onPointerMove={moveSignature}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        />
      ) : null}
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
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

export function PatientConsentUploadWizard() {
  const router = useRouter();
  const [mode, setMode] = useState<"guided" | "direct">("guided");
  const [activeStep, setActiveStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [placement, setPlacement] =
    useState<ConsentSignaturePlacement>(INITIAL_PLACEMENT);
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

  function updatePlacement(nextPlacement: ConsentSignaturePlacement) {
    setPlacement(nextPlacement);
    setSignedFile(null);
  }

  async function prepareSignedConsent() {
    if (!signatureDataUrl) return;
    setPreparing(true);
    setToast(null);
    try {
      const response = await fetch(CONSENT_TEMPLATE_URL);
      if (!response.ok) {
        throw new Error("No se pudo abrir la plantilla de consentimiento.");
      }
      const bytes = await applySignatureToConsentPdf(
        await response.arrayBuffer(),
        signatureDataUrl,
        placement,
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
      goToStep(3);
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
                  Continuar para firmar
                </Button>
              </div>
            ) : null}

            {activeStep === 1 ? (
              <div className="max-w-3xl space-y-5">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    Dibujar firma
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dibuje su firma dentro del recuadro y guárdela para poder
                    ubicarla en el documento.
                  </p>
                </div>
                <SignaturePad
                  value={signatureDataUrl}
                  onChange={(value) => {
                    setSignatureDataUrl(value);
                    setSignedFile(null);
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(0)}
                  >
                    <ArrowLeft className="size-4" />
                    Volver a descargar
                  </Button>
                  <Button
                    type="button"
                    disabled={!signatureDataUrl}
                    onClick={() => goToStep(2)}
                  >
                    Continuar al editor
                  </Button>
                </div>
              </div>
            ) : null}

            {activeStep === 2 && signatureDataUrl ? (
              <div className="space-y-5">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    Aplicar firma al PDF
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Arrastre la firma sobre la página o ajuste su posición y
                    tamaño con los controles.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CONSENT_TEMPLATE_PREVIEW_URLS.map((_, pageIndex) => (
                    <Button
                      key={pageIndex}
                      type="button"
                      variant={
                        placement.pageIndex === pageIndex
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        updatePlacement({ ...placement, pageIndex })
                      }
                    >
                      Página {pageIndex + 1}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <SignaturePagePreview
                    pageIndex={placement.pageIndex}
                    signatureDataUrl={signatureDataUrl}
                    placement={placement}
                    editable
                    onPlacementChange={updatePlacement}
                  />
                  <div className="space-y-5 rounded-xl border border-border/70 bg-background/60 p-4 xl:sticky xl:top-24 xl:self-start">
                    <div className="space-y-2">
                      <Label htmlFor="signature-horizontal-position">
                        Posición horizontal
                      </Label>
                      <input
                        id="signature-horizontal-position"
                        type="range"
                        min="0"
                        max={Math.round((1 - placement.width) * 100)}
                        value={Math.round(placement.x * 100)}
                        onChange={(event) =>
                          updatePlacement({
                            ...placement,
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
                        value={Math.round(placement.y * 100)}
                        onChange={(event) =>
                          updatePlacement({
                            ...placement,
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
                        value={Math.round(placement.width * 100)}
                        onChange={(event) =>
                          updatePlacement({
                            ...placement,
                            width: Number(event.target.value) / 100,
                            x: Math.min(
                              placement.x,
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
                    onClick={() => goToStep(1)}
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
                    Aplicar firma y continuar
                  </Button>
                </div>
              </div>
            ) : null}

            {activeStep === 3 && signatureDataUrl && signedFile ? (
              <div className="space-y-5">
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    Vista previa completa
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Revise las dos páginas y la ubicación de la firma antes de
                    subir el consentimiento.
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
                        signatureDataUrl={signatureDataUrl}
                        placement={placement}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(2)}
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
