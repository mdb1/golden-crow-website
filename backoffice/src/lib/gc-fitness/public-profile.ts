/**
 * Las lecturas de la landing pública de perfil `/f/u/[uid]` (#1184 / SV2-4, D-6).
 *
 * ## Por qué viven acá y no adentro de la página
 *
 * Para poder testearlas: lo que esta landing defiende es QUÉ colecciones lee, y eso
 * se fija mejor con un Firestore falso que mirando el HTML. No es un archivo
 * `"use server"` — son funciones comunes que sólo llama un Server Component.
 *
 * ## Lee `social_profiles` y `public_routines`, y NADA más
 *
 * El Admin SDK pasa por encima de las reglas, así que la protección no puede venir
 * de ahí: viene de la COLECCIÓN. `social_profiles/{uid}` es, por diseño (D-01 de
 * #1037), la proyección pública de la identidad; `/users/{uid}` tiene el mail, el
 * coach, la zona horaria y el plan. Leer `/users` desde una página sin login sería
 * publicar eso para cualquier uid que alguien adivine o reenvíe. Mismo criterio que
 * `/f/r/[routineId]`, que lee `public_routines` y no `workout_templates`.
 *
 * Y un perfil PRIVADO no sirve ni la bio ni los contadores ni las rutinas: sólo lo
 * que la app le muestra a un desconocido (nombre, @handle, foto).
 */
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

/** Tope de rutinas en la landing — la grilla del perfil en la app muestra más. */
export const PROFILE_ROUTINE_LIMIT = 6;

/**
 * Cuántas tarjetas se piden para llenar las 6. `hidden` (moderación, S10) no está en
 * el índice, así que se filtra después de leer: pedir justo 6 dejaría la grilla corta
 * cada vez que moderación escondió una. El doble alcanza para el caso real sin
 * convertir la página en un scan del autor.
 */
const ROUTINE_FETCH_LIMIT = PROFILE_ROUTINE_LIMIT * 2;

export interface PublicProfileRoutine {
  templateId: string;
  name: string;
  exerciseCount: number;
  estimatedMinutes: number | null;
}

export interface PublicProfile {
  uid: string;
  handle: string;
  displayName: string;
  /** Sólo si es una URL `https` servible; un path de Storage cae a iniciales. */
  photoUrl: string | null;
  isPrivate: boolean;
  /** `null` en un perfil privado — no se sirve ni se calcula. */
  bio: string | null;
  followerCount: number | null;
  publicRoutineCount: number | null;
}

function localized(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const map = value as Record<string, unknown>;
  const es = typeof map.es === "string" ? map.es : "";
  const en = typeof map.en === "string" ? map.en : "";
  return es || en;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/**
 * `photoURL` es, para cualquiera que subió su foto desde la app, un PATH de Storage
 * (`profile_photos/{uid}/avatar.jpg`), no una URL. Un `<img src>` con eso no falla:
 * lo resuelve relativo a esta página, el 404 pasa en silencio y se ve igual que "no
 * tiene foto". Las apps lo resuelven con el SDK y la sesión del que mira; acá no hay
 * sesión, y la regla de Storage de `profile_photos` pide `request.auth != null`, así
 * que el path no se puede servir sin inventar un proxy público. Se usa sólo una URL
 * `https` ya servible (p. ej. la foto de Google) y lo demás cae a iniciales.
 */
export function servablePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.startsWith("https://") ? trimmed : null;
}

/** Hasta dos iniciales del nombre, o la primera letra del handle. */
export function profileInitials(displayName: string, handle: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("");
  return (letters || Array.from(handle)[0] || "?").toUpperCase();
}

/**
 * El perfil, o `null` si no se sirve. Inexistente, suspendido y sin handle comparten
 * el `null` (y el 404): distinguirlos le diría a un desconocido si un uid existe, o
 * que alguien fue moderado. Un perfil sin handle todavía no terminó de crearse — la
 * app tampoco lo muestra.
 */
export async function readPublicProfile(uid: string): Promise<PublicProfile | null> {
  // Un id reservado (`/^__.*__$/`) hace THROW en `.doc()`, y adentro de un render eso
  // es un 500 en vez de un 404. Una barra partiría el path en otra colección.
  if (!uid || uid.includes("/") || /^__.*__$/.test(uid)) return null;

  const snapshot = await gcFitnessFirestore().collection("social_profiles").doc(uid).get();
  if (!snapshot.exists) return null;

  const data = snapshot.data() ?? {};
  if (data.suspended === true) return null;
  const handle = typeof data.handle === "string" ? data.handle.trim() : "";
  if (!handle) return null;

  const displayName =
    typeof data.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : handle;
  // Default de la app: privado. Cualquier valor que no sea exactamente "public" se
  // trata como privado — equivocarse para este lado sólo esconde una bio.
  const isPrivate = data.visibility !== "public";
  const bio = typeof data.bio === "string" && data.bio.trim() ? data.bio.trim() : null;

  return {
    uid: snapshot.id,
    handle,
    displayName,
    photoUrl: servablePhotoUrl(data.photoURL),
    isPrivate,
    bio: isPrivate ? null : bio,
    followerCount: isPrivate ? null : count(data.followerCount),
    publicRoutineCount: isPrivate ? null : count(data.publicRoutineCount),
  };
}

/**
 * Las rutinas públicas del autor, más nuevas primero, máx 6.
 *
 * La forma de la query es la del índice `(authorUid ASC, authorSuspended ASC,
 * publishedAt DESC)` de `firestore.indexes.json` (la pata por autor del feed, S5). El
 * emulador no valida índices: una forma que no calce con uno existente va verde en
 * local y tira FAILED_PRECONDITION en producción — acá eso sería un 500 en la landing.
 * `hidden != true` NO entra a la query (una desigualdad + orderBy pediría otro índice):
 * se filtra en memoria sobre `ROUTINE_FETCH_LIMIT` tarjetas.
 *
 * Sólo la llama la página con un perfil PÚBLICO y no suspendido. Una falla de lectura
 * devuelve `[]`: el perfil se sigue viendo, sin la grilla.
 */
export async function readProfileRoutines(uid: string): Promise<PublicProfileRoutine[]> {
  if (!uid) return [];
  try {
    const snapshot = await gcFitnessFirestore()
      .collection("public_routines")
      .where("authorUid", "==", uid)
      .where("authorSuspended", "==", false)
      .orderBy("publishedAt", "desc")
      .limit(ROUTINE_FETCH_LIMIT)
      .get();

    return snapshot.docs
      .filter((doc) => doc.get("hidden") !== true)
      .slice(0, PROFILE_ROUTINE_LIMIT)
      .map((doc) => {
        const minutes = doc.get("estimatedMinutes");
        return {
          templateId: doc.id,
          name: localized(doc.get("name")) || "Rutina",
          exerciseCount: count(doc.get("exerciseCount")),
          estimatedMinutes: typeof minutes === "number" && minutes > 0 ? minutes : null,
        };
      });
  } catch {
    return [];
  }
}
