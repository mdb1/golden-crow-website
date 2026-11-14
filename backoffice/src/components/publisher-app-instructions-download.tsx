import { Download, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function PublisherAppInstructionsDownload({
  className,
}: {
  className?: string;
}) {
  return (
    <a
      href="/Pocket_Genes_Guia_App_Personalizada.pdf"
      download="Pocket_Genes_Guia_App_Personalizada.pdf"
      className={cn(
        "publisher-app-instructions-download relative isolate flex min-h-24 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border px-4 py-5 sm:gap-4 sm:px-7",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="publisher-app-instructions-download__icon relative z-10 flex size-11 shrink-0 items-center justify-center rounded-2xl border border-amber-950/15 bg-white/35 sm:size-12"
      >
        <Download className="size-6" />
      </span>
      <span className="relative z-10 min-w-0 text-balance text-center font-heading text-xl font-semibold leading-snug sm:text-2xl">
        Descargar instrucciones
      </span>
      <Sparkles
        aria-hidden="true"
        className="publisher-app-instructions-download__sparkles relative z-10 hidden size-6 shrink-0 sm:block"
      />
      <span
        aria-hidden="true"
        className="publisher-app-instructions-download__glint publisher-app-instructions-download__glint--first"
      />
      <span
        aria-hidden="true"
        className="publisher-app-instructions-download__glint publisher-app-instructions-download__glint--second"
      />
    </a>
  );
}
