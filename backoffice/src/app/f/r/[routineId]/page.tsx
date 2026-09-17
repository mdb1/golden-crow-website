/**
 * `https://fit.goldencrowvs.com/f/r/{routineId}` — la landing del link compartido
 * (#1037 / S6, gc-fitness#1046; pantalla S15 de SCREENS.md).
 *
 * ## Qué hace esta página, y qué NO hace
 *
 * Con la app instalada, nadie la ve: iOS y Android se quedan el link antes de que el
 * navegador cargue nada. Existe para los otros tres casos, que son la mayoría de las
 * veces que un link viaja por WhatsApp:
 *
 *   - la preview del chat (las OG tags de abajo son el 90% del valor de esta página);
 *   - alguien sin la app, que tiene que poder ver qué le mandaron ANTES de bajarla;
 *   - un navegador de escritorio.
 *
 * ## Es pública, y por eso lee `public_routines` y NADA más
 *
 * El Admin SDK pasa por encima de las reglas, así que la protección no puede venir de
 * ahí: viene de la COLECCIÓN. Una tarjeta en `public_routines` existe únicamente
 * porque su autor puso la rutina en público — el trigger la crea al publicar y la
 * borra al despublicar. Leer `workout_templates` directamente desde acá publicaría la
 * biblioteca entera de todos los coaches, que es exactamente la fuga S-00 que S2
 * cerró.
 *
 * La prescripción SÍ sale de `workout_templates`, pero sólo después de confirmar que
 * la tarjeta existe: la tarjeta es el permiso.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { routineShareUrl } from "@/lib/gc-fitness/social-share-link";

import { SharedRoutineActions } from "./shared-routine-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ routineId: string }>;
}

interface RoutineCard {
  templateId: string;
  name: string;
  description: string | null;
  authorLabel: string;
  exerciseCount: number;
  estimatedMinutes: number | null;
}

interface ExerciseLine {
  name: string;
  detail: string;
}

function localized(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const map = value as Record<string, unknown>;
  const es = typeof map.es === "string" ? map.es : "";
  const en = typeof map.en === "string" ? map.en : "";
  return es || en;
}

async function readCard(routineId: string): Promise<RoutineCard | null> {
  if (!routineId) return null;
  const snapshot = await gcFitnessFirestore()
    .collection("public_routines")
    .doc(routineId)
    .get();
  if (!snapshot.exists) return null;

  const data = snapshot.data() ?? {};
  // Un autor suspendido sale del feed y también de acá: si no, un link viejo sería la
  // puerta de atrás a contenido moderado.
  if (data.authorSuspended === true) return null;

  const handle = typeof data.authorHandle === "string" ? data.authorHandle : "";
  const displayName =
    typeof data.authorDisplayName === "string" ? data.authorDisplayName : "";
  const minutes = typeof data.estimatedMinutes === "number" ? data.estimatedMinutes : null;

  return {
    templateId: snapshot.id,
    name: localized(data.name),
    description: localized(data.description) || null,
    authorLabel: handle ? `@${handle}` : displayName,
    exerciseCount: typeof data.exerciseCount === "number" ? data.exerciseCount : 0,
    // El productor convierte 0 a null justo para que una tarjeta no muestre "0 min"
    // como si fuera una medición; acá se respeta lo mismo.
    estimatedMinutes: minutes && minutes > 0 ? minutes : null,
  };
}

/**
 * Las filas de ejercicios, resueltas contra la librería.
 *
 * Un ejercicio ilegible conserva su fila con un nombre genérico: una rutina de 8 que
 * muestra 7 miente sobre lo que la persona va a recibir. Mismo criterio que las dos
 * apps.
 */
async function readExercises(routineId: string): Promise<ExerciseLine[]> {
  const db = gcFitnessFirestore();
  const template = await db.collection("workout_templates").doc(routineId).get();
  if (!template.exists) return [];

  const raw = template.get("exercises");
  if (!Array.isArray(raw)) return [];

  const ids = Array.from(
    new Set(
      raw
        .map((item) => (item as Record<string, unknown>)?.exerciseId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        // Un id reservado (`/^__.*__$/`) hace THROW en `.doc()`, y adentro de un
        // render eso es un 500 en vez de una fila menos.
        .filter((id) => !/^__.*__$/.test(id)),
    ),
  );

  const names = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const doc = await db.collection("exercises").doc(id).get();
        const name = localized(doc.get("name")) || (doc.get("name") as string) || "";
        if (name) names.set(id, name);
      } catch {
        // Un ejercicio que no se puede leer no rompe la página.
      }
    }),
  );

  return raw.map((item) => {
    const entry = (item ?? {}) as Record<string, unknown>;
    const id = typeof entry.exerciseId === "string" ? entry.exerciseId : "";
    const sets = typeof entry.sets === "number" ? entry.sets : 0;
    const reps = typeof entry.reps === "number" ? entry.reps : 0;
    const duration =
      typeof entry.durationSeconds === "number" ? entry.durationSeconds : null;
    return {
      name: names.get(id) || "Ejercicio",
      detail: duration && duration > 0 ? `${sets} × ${duration} s` : `${sets} × ${reps}`,
    };
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { routineId } = await params;
  const card = await readCard(routineId);
  if (!card) {
    return { title: "GC Fitness" };
  }

  const title = `${card.name} · GC Fitness`;
  const parts = [`${card.exerciseCount} ejercicios`];
  if (card.estimatedMinutes) parts.push(`~${card.estimatedMinutes} min`);
  const description =
    card.description ?? `Rutina de ${card.authorLabel} — ${parts.join(" · ")}`;

  // Éstas son la razón principal de que la página exista: sin OG tags, el link llega
  // a WhatsApp como una URL cruda y nadie lo toca.
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: routineShareUrl(card.templateId) ?? undefined,
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function SharedRoutinePage({ params }: PageProps) {
  const { routineId } = await params;
  const card = await readCard(routineId);
  // Despublicada, borrada o inexistente comparten el 404, igual que las apps
  // comparten un solo mensaje: distinguirlas le diría a un desconocido si un id
  // existe.
  if (!card) notFound();

  const exercises = await readExercises(card.templateId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-neutral-500">
          {card.authorLabel} compartió una rutina
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{card.name}</h1>
        {card.description ? (
          <p className="text-sm text-neutral-600">{card.description}</p>
        ) : null}
        <p className="text-sm text-neutral-500">
          {card.exerciseCount} ejercicios
          {card.estimatedMinutes ? ` · ~${card.estimatedMinutes} min` : ""}
        </p>
      </header>

      <SharedRoutineActions templateId={card.templateId} />

      <section className="flex flex-col gap-2">
        {exercises.map((exercise, index) => (
          <div
            key={`${exercise.name}-${index}`}
            className="flex items-baseline justify-between gap-4 rounded-xl border border-neutral-200 px-4 py-3"
          >
            <span className="text-sm">
              <span className="mr-2 text-neutral-400">{index + 1}</span>
              {exercise.name}
            </span>
            <span className="text-sm text-neutral-500">{exercise.detail}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
