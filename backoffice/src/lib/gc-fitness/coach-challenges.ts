// coach-challenges.ts — gc-fitness #1475 (S6 · «Desafíos que crea el coach»), la parte PURA.
//
// El coach crea, desde el backoffice, un desafío para TODOS sus clientes. Se escribe en
// `social_challenges/{auto id}` con el Admin SDK (no pasa por el callable
// `createSocialChallenge`, que es el camino de amigos), así que la validación que hace el
// servidor para los desafíos de amigos (`functions/src/social/socialChallenges.ts`) se
// replica acá con las reglas de S6. Contrato del doc: `1475-spec.md` → «Wire — doc de un
// desafío del coach».
//
// Este archivo NO es "use server" (exporta funciones síncronas: ver #785 en el README) y no
// toca Firestore: lo usan `coach-challenge-actions.ts` y los tests.
//
// TWIN: `rankCoachChallengeStandings` es un port 1:1 de `rankChallengeStandings`
// (functions) — mismo vector compartido
// (`gc-fitness/.planning/features/social-v2/fixtures/challenge_standings_vector.json`, copiado
// en `__tests__/fixtures/`). Si cambia allá, cambia acá.

import { civilDateAddDays, civilDateFormat, civilDateToday, civilDaysBetween } from "./civil-date";
import { zonedWallClockInstant } from "./zoned-instant";

export const COACH_CHALLENGE_KINDS = ["workouts", "volume"] as const;
export type CoachChallengeKind = (typeof COACH_CHALLENGE_KINDS)[number];

export const COACH_CHALLENGE_CADENCES = ["total", "weekly"] as const;
export type CoachChallengeCadence = (typeof COACH_CHALLENGE_CADENCES)[number];

export const COACH_CHALLENGE_NAME_MAX = 40;
export const COACH_CHALLENGE_DURATION_MIN = 1;
export const COACH_CHALLENGE_DURATION_MAX = 90;
/** El inicio puede estar hasta 60 días adelante (en días civiles del coach). */
export const COACH_CHALLENGE_START_LOOKAHEAD_DAYS = 60;
export const COACH_CHALLENGE_MAX_MEMBERS = 200;

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export const TARGET_RULES: Record<CoachChallengeKind, { min: number; max: number; integer: boolean }> = {
  workouts: { min: 1, max: 100, integer: true },
  volume: { min: 100, max: 5_000_000, integer: false },
};

/** El campo que falló — la UI lo traduce. */
export type CoachChallengeField =
  | "name"
  | "kind"
  | "cadence"
  | "target"
  | "startDate"
  | "endDate"
  | "timezone"
  | "members";

/**
 * Por qué falló, para dar un mensaje útil (la UI tiene una copia por cada uno).
 * - `startPast` / `startTooFar`: inicio antes de hoy / más de 60 días adelante.
 * - `endBeforeStart` / `tooLong`: duración < 1 o > 90 días.
 * - `notWeeks`: semanal sin múltiplo de 7 días.
 * - `noMembers` / `tooManyMembers`: 0 clientes utilizables / más de 200.
 */
export type CoachChallengeError =
  | { field: "name"; reason: "invalid" }
  | { field: "kind"; reason: "invalid" }
  | { field: "cadence"; reason: "invalid" }
  | { field: "target"; reason: "invalid" }
  | { field: "startDate"; reason: "invalid" | "startPast" | "startTooFar" }
  | { field: "endDate"; reason: "invalid" | "endBeforeStart" | "tooLong" | "notWeeks" }
  | { field: "timezone"; reason: "invalid" }
  | { field: "members"; reason: "noMembers" | "tooManyMembers" };

export interface CoachChallengeFormInput {
  name: unknown;
  kind: unknown;
  cadence: unknown;
  target: unknown;
  /** Día civil `YYYY-MM-DD` (inclusive) en la zona del coach. */
  startDate: unknown;
  /** Día civil `YYYY-MM-DD` (inclusive) en la zona del coach. */
  endDate: unknown;
}

export interface ValidCoachChallenge {
  name: string;
  kind: CoachChallengeKind;
  cadence: CoachChallengeCadence;
  target: number;
  startDate: string;
  endDate: string;
  startsAtMs: number;
  endsAtMs: number;
  durationDays: number;
  timezone: string;
  memberUids: string[];
}

export type CoachChallengeValidation =
  | { ok: true; value: ValidCoachChallenge }
  | { ok: false; error: CoachChallengeError };

// ── piezas ────────────────────────────────────────────────────────────────────

/** Saltos de línea que el nombre no admite (U+2028/2029 por código: un literal rompe el parseo). */
const LINE_BREAKS = new Set(["\r", "\n", String.fromCharCode(0x2028), String.fromCharCode(0x2029)]);

/** `trim`, 1–40 code points (un emoji simple es 1), sin saltos de línea. Igual que el servidor. */
export function normalizeCoachChallengeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (Array.from(name).some((ch) => LINE_BREAKS.has(ch))) return null;
  const length = Array.from(name).length;
  if (length < 1 || length > COACH_CHALLENGE_NAME_MAX) return null;
  return name;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Entrenos: entero 1–100. Volumen: kg redondeados a centésimas ANTES de mirar el rango. */
export function normalizeCoachChallengeTarget(kind: CoachChallengeKind, raw: unknown): number | null {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim().replace(",", ".")) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rule = TARGET_RULES[kind];
  if (rule.integer && !Number.isInteger(value)) return null;
  const normalized = rule.integer ? value : round2(value);
  return normalized >= rule.min && normalized <= rule.max ? normalized : null;
}

/** Firestore reserva `__…__` y un uid con `_` / `/` no arma ids del grafo social. Igual que `usableUid` del servidor. */
export function usableUid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const uid = raw.trim();
  if (!uid || uid.includes("/") || uid.includes("_") || /^__.*__$/.test(uid)) return null;
  return uid;
}

/** Los uids de los clientes del coach, limpios: sin repetidos, sin el coach y sin ids que el servidor no acepta. */
export function coachChallengeMemberUids(rawUids: readonly unknown[], coachUid: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawUids) {
    const uid = usableUid(raw);
    if (uid === null || uid === coachUid || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

export function isValidTimezone(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}

function isCivilDate(raw: unknown): raw is string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  // `civilDateAddDays(x, 0)` normaliza: si cambió, el día no existe (2026-02-30).
  return civilDateAddDays(raw, 0) === raw;
}

/**
 * El primer instante del día civil `day` en `timezone` («00:00 local»). En las zonas donde
 * la medianoche NO existe un día de cambio de horario (America/Santiago adelanta 00:00 → 01:00)
 * es la 01:00: el comienzo real del día, como `Calendar.startOfDay` en las apps.
 */
export function startOfZonedDayMs(day: string, timezone: string): number | null {
  const guess = zonedWallClockInstant(day, "00:00", timezone);
  if (!guess) return null;
  const STEP = 15 * 60 * 1000;
  let ms = guess.getTime();
  // Si la conversión cayó en el día anterior (medianoche inexistente), avanzar hasta entrar.
  for (let i = 0; i < 12 && civilDateFormat(new Date(ms), timezone) < day; i += 1) ms += STEP;
  // Si cayó adentro pero no al principio, retroceder mientras siga siendo el mismo día.
  for (let i = 0; i < 12 && civilDateFormat(new Date(ms - STEP), timezone) === day; i += 1) ms -= STEP;
  return civilDateFormat(new Date(ms), timezone) === day ? ms : null;
}

/** Cuántas semanas tiene un desafío semanal (igual que `challengeWeekCount` del servidor). */
export function coachChallengeWeekCount(startsAtMs: number, endsAtMs: number): number {
  return Math.max(1, Math.round((endsAtMs - startsAtMs) / WEEK_MS));
}

// ── validación ────────────────────────────────────────────────────────────────

/**
 * Valida el formulario del coach. Nombra el PRIMER campo que falla.
 *
 * Fechas: días civiles inclusive en la zona del coach ⇒ `startsAt` = 00:00 local del inicio,
 * `endsAt` = 00:00 local del día SIGUIENTE al fin. Duración = días civiles (1–90; semanal ⇒
 * múltiplo de 7). El inicio no puede ser antes de hoy ni más de 60 días adelante.
 */
export function validateCoachChallengeInput(
  input: CoachChallengeFormInput,
  ctx: { coachUid: string; clientUids: readonly unknown[]; timezone: string; nowMs: number },
): CoachChallengeValidation {
  const name = normalizeCoachChallengeName(input.name);
  if (name === null) return { ok: false, error: { field: "name", reason: "invalid" } };

  const kind = input.kind;
  if (kind !== "workouts" && kind !== "volume") return { ok: false, error: { field: "kind", reason: "invalid" } };

  const cadence = input.cadence;
  if (cadence !== "total" && cadence !== "weekly") {
    return { ok: false, error: { field: "cadence", reason: "invalid" } };
  }

  const target = normalizeCoachChallengeTarget(kind, input.target);
  if (target === null) return { ok: false, error: { field: "target", reason: "invalid" } };

  if (!isValidTimezone(ctx.timezone)) return { ok: false, error: { field: "timezone", reason: "invalid" } };
  const timezone = ctx.timezone;

  if (!isCivilDate(input.startDate)) return { ok: false, error: { field: "startDate", reason: "invalid" } };
  const startDate = input.startDate;
  const today = civilDateToday(timezone, new Date(ctx.nowMs));
  const startOffset = civilDaysBetween(today, startDate);
  if (startOffset === null) return { ok: false, error: { field: "startDate", reason: "invalid" } };
  if (startOffset < 0) return { ok: false, error: { field: "startDate", reason: "startPast" } };
  if (startOffset > COACH_CHALLENGE_START_LOOKAHEAD_DAYS) {
    return { ok: false, error: { field: "startDate", reason: "startTooFar" } };
  }

  if (!isCivilDate(input.endDate)) return { ok: false, error: { field: "endDate", reason: "invalid" } };
  const endDate = input.endDate;
  const span = civilDaysBetween(startDate, endDate);
  if (span === null) return { ok: false, error: { field: "endDate", reason: "invalid" } };
  const durationDays = span + 1;
  if (durationDays < COACH_CHALLENGE_DURATION_MIN) {
    return { ok: false, error: { field: "endDate", reason: "endBeforeStart" } };
  }
  if (durationDays > COACH_CHALLENGE_DURATION_MAX) return { ok: false, error: { field: "endDate", reason: "tooLong" } };
  if (cadence === "weekly" && durationDays % 7 !== 0) {
    return { ok: false, error: { field: "endDate", reason: "notWeeks" } };
  }

  const dayAfterEnd = civilDateAddDays(endDate, 1);
  const startsAtMs = startOfZonedDayMs(startDate, timezone);
  const endsAtMs = dayAfterEnd === null ? null : startOfZonedDayMs(dayAfterEnd, timezone);
  if (startsAtMs === null) return { ok: false, error: { field: "startDate", reason: "invalid" } };
  if (endsAtMs === null || endsAtMs <= startsAtMs) return { ok: false, error: { field: "endDate", reason: "invalid" } };

  const memberUids = coachChallengeMemberUids(ctx.clientUids, ctx.coachUid);
  if (memberUids.length === 0) return { ok: false, error: { field: "members", reason: "noMembers" } };
  if (memberUids.length > COACH_CHALLENGE_MAX_MEMBERS) {
    return { ok: false, error: { field: "members", reason: "tooManyMembers" } };
  }

  return {
    ok: true,
    value: {
      name,
      kind,
      cadence,
      target,
      startDate,
      endDate,
      startsAtMs,
      endsAtMs,
      durationDays,
      timezone,
      memberUids,
    },
  };
}

// ── el doc ────────────────────────────────────────────────────────────────────

/**
 * El doc EXACTO de `social_challenges/{id}` (origen coach). Los miembros entran invitados SIN
 * identidad (`handle: ""`, `displayName: ""`, `photoURL: null`): nadie ve a nadie hasta que
 * acepta, y al aceptar el servidor completa la identidad. `weeks` sólo en los semanales.
 *
 * Los timestamps los inyecta quien escribe (Admin SDK `Timestamp.fromMillis` /
 * `FieldValue.serverTimestamp()`), así este módulo no depende de firebase-admin. Nunca hay
 * un `undefined` en la salida (el Admin SDK del backoffice lo rechaza).
 */
export function buildCoachChallengeDoc<TStamp, TServerStamp>(
  value: ValidCoachChallenge,
  coachUid: string,
  stamps: { timestamp: (ms: number) => TStamp; serverTimestamp: () => TServerStamp },
): Record<string, unknown> {
  const weekCount = value.cadence === "weekly" ? coachChallengeWeekCount(value.startsAtMs, value.endsAtMs) : null;
  const members: Record<string, Record<string, unknown>> = {};
  for (const uid of value.memberUids) {
    members[uid] = {
      status: "invited",
      progress: 0,
      ...(weekCount !== null ? { weeks: new Array<number>(weekCount).fill(0) } : {}),
      completedAt: null,
      joinedAt: null,
      invitedBy: coachUid,
      handle: "",
      displayName: "",
      photoURL: null,
    };
  }
  return {
    origin: "coach",
    creatorUid: coachUid,
    name: value.name,
    kind: value.kind,
    cadence: value.cadence,
    target: value.target,
    durationDays: value.durationDays,
    startsAt: stamps.timestamp(value.startsAtMs),
    endsAt: stamps.timestamp(value.endsAtMs),
    timezone: value.timezone,
    status: "active",
    memberUids: [...value.memberUids],
    members,
    hidden: false,
    startPushPending: true,
    createdAt: stamps.serverTimestamp(),
    updatedAt: stamps.serverTimestamp(),
  };
}

// ── tabla de posiciones (twin de `rankChallengeStandings`) ──────────────────────

export interface StandingsMemberInput {
  status: unknown;
  progress: unknown;
  completedAt: number | null;
  joinedAt: number | null;
  weeks?: unknown;
}

export interface StandingRow {
  uid: string;
  /** Posición «1, 2, 2, 4». */
  rank: number;
  progress: number;
  /** La suma de `weeks` (0 en los totales). */
  weeksTotal: number;
  completedAt: number | null;
}

function finiteOrZero(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

export function weeksTotalOf(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  return round2(raw.reduce((sum: number, value: unknown) => sum + finiteOrZero(value), 0));
}

function compareNullableAsc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * Sólo `joined`; orden `progress DESC`, `weeksTotal DESC`, `completedAt ASC` (sin fecha al
 * final), `joinedAt ASC` (sin fecha al final), `uid`. Comparten posición sólo si empatan en
 * `progress`, `weeksTotal` Y `completedAt`: `joinedAt` y `uid` desempatan el ORDEN, no la posición.
 */
export function rankCoachChallengeStandings(members: Record<string, StandingsMemberInput>): StandingRow[] {
  const rows = Object.entries(members)
    .filter(([uid, member]) => uid.length > 0 && member?.status === "joined")
    .map(([uid, member]) => ({
      uid,
      progress: finiteOrZero(member.progress),
      weeksTotal: weeksTotalOf(member.weeks),
      completedAt: member.completedAt,
      joinedAt: member.joinedAt,
    }));
  rows.sort((a, b) => {
    if (a.progress !== b.progress) return b.progress - a.progress;
    if (a.weeksTotal !== b.weeksTotal) return b.weeksTotal - a.weeksTotal;
    const byCompleted = compareNullableAsc(a.completedAt, b.completedAt);
    if (byCompleted !== 0) return byCompleted;
    const byJoined = compareNullableAsc(a.joinedAt, b.joinedAt);
    if (byJoined !== 0) return byJoined;
    return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
  });
  const out: StandingRow[] = [];
  rows.forEach((row, index) => {
    const previous = out[index - 1];
    const tied =
      previous !== undefined &&
      previous.progress === row.progress &&
      previous.weeksTotal === row.weeksTotal &&
      previous.completedAt === row.completedAt;
    out.push({
      uid: row.uid,
      rank: tied ? previous.rank : index + 1,
      progress: row.progress,
      weeksTotal: row.weeksTotal,
      completedAt: row.completedAt,
    });
  });
  return out;
}

/** Un `Timestamp` / `Date` / epoch ms del wire a epoch ms, o `null`. */
export function toMillis(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.getTime();
  if (typeof raw === "object" && typeof (raw as { toMillis?: unknown }).toMillis === "function") {
    return (raw as { toMillis: () => number }).toMillis();
  }
  return null;
}

// ── resumen para la página ────────────────────────────────────────────────────

export interface CoachChallengeStanding {
  uid: string;
  rank: number;
  name: string;
  progress: number;
  weeksTotal: number;
  completedAt: string | null;
}

export interface CoachChallengeSummary {
  id: string;
  name: string;
  kind: CoachChallengeKind;
  cadence: CoachChallengeCadence;
  target: number;
  startsAt: string;
  endsAt: string;
  /** Días civiles inclusive en la zona del desafío (para mostrar). */
  startDate: string;
  endDate: string;
  timezone: string;
  durationDays: number;
  weekCount: number | null;
  /** `ended` también cuando `endsAt <= ahora` aunque el job todavía no lo haya cerrado. */
  status: "active" | "ended";
  hidden: boolean;
  invitedCount: number;
  joinedCount: number;
  /** Invitados que todavía no respondieron (status `invited`). */
  pendingCount: number;
  standings: CoachChallengeStanding[];
}

/**
 * Del doc crudo al resumen que pinta la página (serializable: fechas en ISO). Devuelve
 * `null` para un doc que no se puede mostrar (sin fechas, `kind` raro).
 */
export function summarizeCoachChallenge(
  id: string,
  data: Record<string, unknown>,
  nowMs: number,
  rosterNames: ReadonlyMap<string, string> = new Map(),
): CoachChallengeSummary | null {
  const startsAtMs = toMillis(data.startsAt);
  const endsAtMs = toMillis(data.endsAt);
  if (startsAtMs === null || endsAtMs === null) return null;
  const kind = data.kind;
  if (kind !== "workouts" && kind !== "volume") return null;
  const cadence: CoachChallengeCadence = data.cadence === "weekly" ? "weekly" : "total";
  const timezone = isValidTimezone(data.timezone) ? data.timezone : "UTC";

  const rawMembers =
    data.members && typeof data.members === "object" ? (data.members as Record<string, unknown>) : {};
  const input: Record<string, StandingsMemberInput> = {};
  const memberRecords: Record<string, Record<string, unknown>> = {};
  for (const [uid, raw] of Object.entries(rawMembers)) {
    if (!raw || typeof raw !== "object") continue;
    const member = raw as Record<string, unknown>;
    memberRecords[uid] = member;
    input[uid] = {
      status: member.status,
      progress: member.progress,
      completedAt: toMillis(member.completedAt),
      joinedAt: toMillis(member.joinedAt),
      weeks: member.weeks,
    };
  }
  const memberUids = Array.isArray(data.memberUids)
    ? data.memberUids.filter((uid): uid is string => typeof uid === "string")
    : Object.keys(input);
  const statuses = Object.values(input).map((m) => m.status);

  const standings = rankCoachChallengeStandings(input).map((row) => {
    const member = memberRecords[row.uid] ?? {};
    const displayName = typeof member.displayName === "string" ? member.displayName.trim() : "";
    const handle = typeof member.handle === "string" ? member.handle.trim() : "";
    return {
      uid: row.uid,
      rank: row.rank,
      name: displayName || rosterNames.get(row.uid) || (handle ? `@${handle}` : "Cliente"),
      progress: row.progress,
      weeksTotal: row.weeksTotal,
      completedAt: row.completedAt === null ? null : new Date(row.completedAt).toISOString(),
    };
  });

  const ended = data.status === "ended" || endsAtMs <= nowMs;
  const lastDay = civilDateFormat(new Date(endsAtMs - 1), timezone);
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    kind,
    cadence,
    target: finiteOrZero(data.target),
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    startDate: civilDateFormat(new Date(startsAtMs), timezone),
    endDate: lastDay,
    timezone,
    durationDays: typeof data.durationDays === "number" ? data.durationDays : Math.round((endsAtMs - startsAtMs) / DAY_MS),
    weekCount: cadence === "weekly" ? coachChallengeWeekCount(startsAtMs, endsAtMs) : null,
    status: ended ? "ended" : "active",
    hidden: data.hidden === true,
    invitedCount: memberUids.length,
    joinedCount: statuses.filter((s) => s === "joined").length,
    pendingCount: statuses.filter((s) => s === "invited").length,
    standings,
  };
}

/** Activos primero, cada grupo por `endsAt` DESC (en memoria: la query es sólo de igualdad). */
export function sortCoachChallenges(list: CoachChallengeSummary[]): CoachChallengeSummary[] {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    if (a.endsAt !== b.endsAt) return a.endsAt < b.endsAt ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
