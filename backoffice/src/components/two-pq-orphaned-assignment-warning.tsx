import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  TwoPQAreaKey,
  TwoPQMissingAssignedEntity,
} from "@/lib/two-pq-areas";

const RECORD_LABELS = {
  en: {
    cases: "case",
    sampling: "sampling",
    sequencing: "batch",
  },
  es: {
    cases: "caso",
    sampling: "muestreo",
    sequencing: "lote",
  },
} as const;

const ENTITY_LABELS = {
  en: {
    institution: "Institution",
    doctor: "Doctor",
    patient: "Patient",
  },
  es: {
    institution: "Institución",
    doctor: "Médico",
    patient: "Paciente",
  },
} as const;

export function TwoPQOrphanedAssignmentWarning({
  areaKey,
  missingAssignedEntities,
  language,
}: {
  areaKey: TwoPQAreaKey;
  missingAssignedEntities: TwoPQMissingAssignedEntity[];
  language: "en" | "es";
}) {
  if (
    missingAssignedEntities.length === 0 ||
    (areaKey !== "cases" &&
      areaKey !== "sampling" &&
      areaKey !== "sequencing")
  ) {
    return null;
  }

  const recordLabel = RECORD_LABELS[language][areaKey];
  const title =
    language === "es"
      ? `Este ${recordLabel} tiene asignaciones huérfanas`
      : `This ${recordLabel} has orphaned assignments`;
  const description =
    language === "es"
      ? `El ${recordLabel} permanece disponible, pero una o más entidades asignadas ya no existen. Requiere atención y una reasignación deliberada.`
      : `The ${recordLabel} remains available, but one or more assigned entities no longer exist. It needs attention and deliberate reassignment.`;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-300/70 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6">{description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {missingAssignedEntities.map((entity) => (
              <Badge
                key={`${entity.kind}/${entity.id}`}
                variant="outline"
                className="border-amber-400/60 bg-white/70 text-amber-950 dark:bg-background/45 dark:text-amber-100"
              >
                {ENTITY_LABELS[language][entity.kind]}: {entity.id}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
