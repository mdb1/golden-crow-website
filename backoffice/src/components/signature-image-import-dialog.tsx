"use client";

import { ImagePlus, Loader2, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_SIGNATURE_IMAGE_OPTIONS,
  processSignatureImageDataUrl,
} from "@/lib/signature-image";

const MAX_SIGNATURE_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_SIGNATURE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("No se pudo leer la imagen seleccionada."));
      }
    };
    reader.onerror = () =>
      reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}

function processingErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("visible signature")) {
    return "No se detectó una firma visible. Ajuste el contraste o el umbral, o elija otra imagen.";
  }
  return "No se pudo procesar la imagen. Elija un archivo PNG, JPG o WebP válido.";
}

const transparencyPreviewStyle = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
  backgroundSize: "20px 20px",
} as const;

export function SignatureImageImportDialog({
  open,
  signerLabel,
  replacingSignature,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  signerLabel: string;
  replacingSignature: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (dataUrl: string) => void;
}) {
  const inputId = useId();
  const contrastId = useId();
  const thresholdId = useId();
  const fileRequestRef = useRef(0);
  const processRequestRef = useRef(0);
  const [fileName, setFileName] = useState("");
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [processedDataUrl, setProcessedDataUrl] = useState<string | null>(null);
  const [contrast, setContrast] = useState<number>(
    DEFAULT_SIGNATURE_IMAGE_OPTIONS.contrast,
  );
  const [threshold, setThreshold] = useState<number>(
    DEFAULT_SIGNATURE_IMAGE_OPTIONS.threshold,
  );
  const [reading, setReading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) return;
    fileRequestRef.current += 1;
    processRequestRef.current += 1;
    setFileName("");
    setSourceDataUrl(null);
    setProcessedDataUrl(null);
    setContrast(DEFAULT_SIGNATURE_IMAGE_OPTIONS.contrast);
    setThreshold(DEFAULT_SIGNATURE_IMAGE_OPTIONS.threshold);
    setReading(false);
    setProcessing(false);
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open || !sourceDataUrl) return;
    const requestId = processRequestRef.current + 1;
    processRequestRef.current = requestId;
    setProcessing(true);
    setProcessedDataUrl(null);
    setError("");

    const timeoutId = window.setTimeout(() => {
      void processSignatureImageDataUrl(sourceDataUrl, {
        contrast,
        threshold,
      })
        .then((result) => {
          if (processRequestRef.current !== requestId) return;
          setProcessedDataUrl(result.dataUrl);
        })
        .catch((nextError: unknown) => {
          if (processRequestRef.current !== requestId) return;
          setError(processingErrorMessage(nextError));
        })
        .finally(() => {
          if (processRequestRef.current === requestId) setProcessing(false);
        });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [contrast, open, sourceDataUrl, threshold]);

  async function selectFile(file: File | undefined) {
    const requestId = fileRequestRef.current + 1;
    fileRequestRef.current = requestId;
    processRequestRef.current += 1;
    setFileName("");
    setSourceDataUrl(null);
    setProcessedDataUrl(null);
    setReading(false);
    setProcessing(false);
    setError("");

    if (!file) return;
    if (!ACCEPTED_SIGNATURE_IMAGE_TYPES.has(file.type)) {
      setError("Seleccione una imagen PNG, JPG o WebP.");
      return;
    }
    if (file.size > MAX_SIGNATURE_IMAGE_BYTES) {
      setError("La imagen de la firma no puede superar los 5 MB.");
      return;
    }

    setFileName(file.name);
    setReading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (fileRequestRef.current !== requestId) return;
      setSourceDataUrl(dataUrl);
    } catch (nextError) {
      if (fileRequestRef.current !== requestId) return;
      setError(
        nextError instanceof Error
          ? nextError.message
          : "No se pudo leer la imagen seleccionada.",
      );
    } finally {
      if (fileRequestRef.current === requestId) setReading(false);
    }
  }

  function applySignature() {
    if (!processedDataUrl) return;
    onApply(processedDataUrl);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar firma {signerLabel}</DialogTitle>
          <DialogDescription>
            Elija una foto o imagen de la firma. Convertiremos la tinta a negro
            y el fondo blanco en transparencia real antes de usarla.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor={inputId}>Imagen de la firma</Label>
            <Input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-describedby={`${inputId}-help`}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void selectFile(file);
              }}
            />
            <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
              PNG, JPG o WebP, máximo 5 MB. Los márgenes vacíos se recortan
              automáticamente.
            </p>
            {fileName ? (
              <p className="text-xs font-medium text-foreground">
                Archivo: {fileName}
              </p>
            ) : null}
          </div>

          {sourceDataUrl ? (
            <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="size-4" />
                <h3 className="font-semibold">Ajustar imagen</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={contrastId}>Contraste</Label>
                    <output
                      htmlFor={contrastId}
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {contrast.toFixed(1)}×
                    </output>
                  </div>
                  <input
                    id={contrastId}
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={contrast}
                    className="w-full accent-primary"
                    onChange={(event) =>
                      setContrast(Number(event.currentTarget.value))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={thresholdId}>Umbral blanco y negro</Label>
                    <output
                      htmlFor={thresholdId}
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {threshold}
                    </output>
                  </div>
                  <input
                    id={thresholdId}
                    type="range"
                    min="40"
                    max="245"
                    step="1"
                    value={threshold}
                    className="w-full accent-primary"
                    onChange={(event) =>
                      setThreshold(Number(event.currentTarget.value))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Imagen original
                  </p>
                  <div className="flex aspect-[3/1] items-center justify-center overflow-hidden rounded-lg border bg-white p-3">
                    <img
                      src={sourceDataUrl}
                      alt="Imagen original de la firma"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Firma sin fondo
                  </p>
                  <div
                    className="relative flex aspect-[3/1] items-center justify-center overflow-hidden rounded-lg border p-3"
                    style={transparencyPreviewStyle}
                  >
                    {processing || reading ? (
                      <span className="inline-flex items-center gap-2 rounded-md bg-background/90 px-3 py-2 text-sm font-medium shadow-sm">
                        <Loader2 className="size-4 animate-spin" />
                        Procesando firma...
                      </span>
                    ) : processedDataUrl ? (
                      <img
                        src={processedDataUrl}
                        alt="Vista previa de la firma con fondo transparente"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El damero permite verificar que las zonas blancas quedaron
                    transparentes.
                  </p>
                </div>
              </div>
            </div>
          ) : reading ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Leyendo imagen...
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!processedDataUrl || reading || processing}
            onClick={applySignature}
          >
            {processing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {replacingSignature ? "Reemplazar firma" : "Usar esta firma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
