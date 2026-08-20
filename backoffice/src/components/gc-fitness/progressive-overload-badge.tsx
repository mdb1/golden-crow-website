import { Badge } from "@/components/ui/badge";

/**
 * #576 — la marca de que un entrenamiento se registró en modo sobrecarga progresiva.
 *
 * Le importa al coach porque **cambia cómo se lee el log**: en modo sobrecarga la app le subió
 * la prescripción al atleta set a set, así que un log con más reps o más kilos que el plan es la
 * app haciendo su trabajo y no el cliente haciendo la suya. Sin esta insignia, el coach ve un
 * desvío sin causa.
 *
 * ⚠️ **La escalera es un SVG a mano y no un ícono de lucide.** lucide no tiene escalera, y
 * sustituirla por la que más se le parezca (`trending-up`, `chevrons-up`) haría que la misma
 * cosa se dibuje distinta en el backoffice que en iOS, Android, watchOS y Wear OS — que es
 * exactamente el vocabulario que el usuario ya aprendió. El trazo es el mismo que el de las
 * apps: tres escalones con la base cerrada, silueta rellena (como línea se lee como zigzag).
 *
 * ⚠️ **El color es el indigo de "entreno"** (`#6366F1` claro / `#818CF8` oscuro, el
 * `WorkoutIndigo` de las apps), NO `destructive`. El rojo es el color de borrar, y una mancha
 * roja que significa "progresaste" es ambigua incluso para quien la ve bien. Va en hex literal
 * y no como token de Tailwind porque el tema de este backoffice no define un indigo — y el
 * valor tiene que coincidir con el de las cinco superficies móviles.
 */
export function ProgressiveOverloadBadge({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-[#6366F1]/30 bg-[#6366F1]/10 px-1.5 py-0 text-[10px] font-normal text-[#6366F1] dark:border-[#818CF8]/30 dark:bg-[#818CF8]/10 dark:text-[#818CF8]"
      title={label}
    >
      <StairsGlyph />
      {label}
    </Badge>
  );
}

/** Escalera ascendente, gemela de SF `stairs` / `Icons.Filled.Stairs`. */
function StairsGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3 shrink-0"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 21 L3 15 L9 15 L9 9 L15 9 L15 3 L21 3 L21 21 Z" />
    </svg>
  );
}
