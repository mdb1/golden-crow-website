// activity-feed-model-ext.ts — golden-crow-website#529.
//
// «Agrega en el audit de admin todas las cosas nuevas que fuimos metiendo: desafíos, cobros,
// planes, … tanto de coaches como de gente … en audit también cuando hablen con Corvo».
//
// The capture side (gc-fitness `functions/src/audit/auditSpecs.ts`) now watches ~30 more
// collections. This module is their half of the PURE classifier in `activity-feed-model.ts`:
// one raw `audit_log` record (or a collapsed burst of them) → one human sentence, with the
// same contract as the original branches (verb phrase, actor implicit, subject, meta, link,
// WHO did it).
//
// PRIVACY is enforced at capture, not here: chat / DM / Corvo text, notes and captions arrive
// as "[redacted: N chars]" markers. This module never prints a marker — a redacted value is
// read as "there was text", nothing more.
//
// Titles are Spanish, like the rest of the feed; `activity-feed-titles.ts` maps each one to an
// i18n key (en/es) and its test scans THIS file too, so a new title without a key fails there.

import type {
  AuditRecord,
  ClassifiedEvent,
  FeedCategory,
  FeedSignificance,
  FeedTarget,
} from "@/lib/gc-fitness/activity-feed-model";
import { bilingualText } from "@/lib/gc-fitness/coachless-user-model";

/** One collapsed burst: the head plus every record folded into it (newest first). */
export interface ExtGroup {
  count: number;
  members?: AuditRecord[];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/** A capture marker ("[redacted: 12 chars]" / "[omitted: 900 chars]") is not a value. */
export function isMarker(value: unknown): boolean {
  return typeof value === "string" && /^\[(redacted|omitted)(: \d+ chars)?\]$/.test(value);
}

function name(value: unknown): string | null {
  if (value === undefined || value === null || isMarker(value)) return null;
  const text = bilingualText(value, "").trim();
  return text.length > 0 ? text : null;
}

/** "135000" → "135.000"; "1234.5" → "1.234,5". es-AR separators without ICU (CI-stable). */
export function groupThousands(n: number): string {
  const negative = n < 0;
  const [int, dec] = Math.abs(Math.round(n * 100) / 100).toString().split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped}${dec ? `,${dec}` : ""}`;
}

const CURRENCY_SYMBOL: Record<string, string> = { ARS: "$", USD: "US$", EUR: "€", UYU: "$U", CLP: "CLP$", MXN: "MX$" };

/** 135000 + "ARS" → "$ 135.000". Null when there is no usable amount. */
export function moneyLabel(amount: unknown, currency: unknown): string | null {
  const n = num(amount);
  if (n === null) return null;
  const code = str(currency)?.toUpperCase() ?? null;
  const symbol = code ? (CURRENCY_SYMBOL[code] ?? code) : "$";
  return `${symbol} ${groupThousands(n)}`;
}

const PAYMENT_METHOD: Record<string, string> = {
  cash: "efectivo",
  transfer: "transferencia",
  mercadopago: "Mercado Pago",
  card: "tarjeta",
  other: "otro medio",
};

function coversLabel(covers: unknown): string | null {
  if (!covers || typeof covers !== "object") return null;
  const c = covers as Record<string, unknown>;
  const months = num(c.months);
  const classes = num(c.classes);
  switch (str(c.kind)) {
    case "months":
      return months ? (months === 1 ? "1 mes" : `${months} meses`) : "mensualidad";
    case "classes":
      return classes ? `${classes} clases` : "clases";
    case "routine":
      return "rutina";
    default:
      return null;
  }
}

/**
 * Corvo tool → topic the operator reads («usó: rutinas, progreso»). Unknown names fall to
 * their own id so a NEW tool still shows up (just less pretty) instead of vanishing.
 */
const CORVO_TOOL_TOPIC: Record<string, string> = {
  get_routines: "rutinas",
  propose_routine: "rutinas",
  generate_routine: "rutinas",
  propose_fork_routine: "rutinas",
  find_public_routines: "rutinas",
  search_exercises: "ejercicios",
  get_recent_workouts: "progreso",
  get_personal_records: "progreso",
  get_weekly_sets_by_muscle: "progreso",
  get_body_weight: "progreso",
  propose_body_weight: "progreso",
  analyze_progress_photos: "fotos",
  get_photo_checkin: "fotos",
  propose_photo_checkin: "fotos",
  get_habits: "hábitos",
  propose_habit: "hábitos",
  propose_habit_update: "hábitos",
  propose_habit_check: "hábitos",
  get_nutrition: "nutrición",
  propose_nutrition_plan: "nutrición",
  propose_meal_status: "nutrición",
  get_schedule: "agenda",
  propose_schedule_routine: "agenda",
  propose_move_workout: "agenda",
  propose_unschedule_routine: "agenda",
  propose_start_workout: "agenda",
  find_friends: "social",
  find_people: "social",
  propose_follow: "social",
  propose_challenge: "desafíos",
  propose_share: "compartir",
  propose_share_card: "compartir",
  get_share_options: "compartir",
  get_profile: "perfil",
};
/** Plumbing tools that say nothing about WHAT the user asked. */
const CORVO_SILENT_TOOLS = new Set(["attach_card"]);

export function corvoTopics(toolNames: string[]): string[] {
  const topics: string[] = [];
  for (const tool of toolNames) {
    if (CORVO_SILENT_TOOLS.has(tool)) continue;
    const topic = CORVO_TOOL_TOPIC[tool] ?? tool;
    if (!topics.includes(topic)) topics.push(topic);
  }
  return topics;
}

const PROPOSAL_TYPE: Record<string, string> = {
  routine: "rutina",
  routine_create: "rutina",
  fork_routine: "rutina",
  habit: "hábito",
  habit_create: "hábito",
  habit_update: "hábito",
  habit_check: "hábito",
  schedule: "agenda",
  schedule_routine: "agenda",
  move_workout: "agenda",
  unschedule_routine: "agenda",
  start_workout: "entrenamiento",
  nutrition_plan: "nutrición",
  meal_status: "nutrición",
  body_weight: "peso",
  photo_checkin: "fotos",
  follow: "seguir",
  challenge: "desafío",
  share: "compartir",
};

function proposalLabel(type: unknown): string | null {
  const t = str(type);
  if (!t) return null;
  return PROPOSAL_TYPE[t] ?? t;
}

/** Plural-aware count phrase: (1, "mensaje") → "1 mensaje"; (6, …) → "6 mensajes". */
function countOf(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

interface Base {
  record: AuditRecord;
  group: ExtGroup;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  subject: Record<string, unknown>;
  fields: string[];
  stamped: string | null;
}

function event(
  base: Base,
  e: {
    category: FeedCategory;
    title: string;
    significance?: FeedSignificance;
    action?: ClassifiedEvent["action"];
    subject?: string | null;
    subjectRef?: ClassifiedEvent["subjectRef"];
    meta?: Array<string | null | undefined | false>;
    target?: FeedTarget | null;
    actorUid?: string | null;
    counterpartUid?: string | null;
    isSelfService?: boolean;
    isDeletion?: boolean;
  },
): ClassifiedEvent {
  const op = base.record.op;
  return {
    category: e.category,
    significance: e.significance ?? "key",
    action: e.action ?? (op === "create" ? "create" : op === "delete" ? "delete" : "update"),
    title: e.title,
    subject: e.subject ?? null,
    subjectRef: e.subjectRef ?? null,
    meta: (e.meta ?? []).filter((m): m is string => typeof m === "string" && m.length > 0),
    target: e.target ?? null,
    actorUid: e.actorUid === undefined ? base.stamped : e.actorUid,
    counterpartUid: e.counterpartUid ?? null,
    isSelfService: e.isSelfService ?? false,
    isDeletion: e.isDeletion ?? op === "delete",
    correlation: null,
  };
}

function userTarget(uid: string | null): FeedTarget | null {
  return uid ? { kind: "user", uid } : null;
}

/** The other participant of a `<uidA>_<uidB>` thread / edge id. */
export function otherOf(pairId: string | null, me: string | null): string | null {
  if (!pairId) return null;
  const parts = pairId.split("_");
  if (parts.length !== 2) return null;
  if (me === parts[0]) return parts[1];
  if (me === parts[1]) return parts[0];
  return null;
}

function softDeleted(base: Base): boolean {
  return base.record.op === "update" && base.after.deleted === true && base.before.deleted !== true;
}

/** Sums one numeric summary field across a burst (falls back to the head alone). */
function sumOver(base: Base, read: (r: AuditRecord) => number): number {
  const members = base.group.members && base.group.members.length > 0 ? base.group.members : [base.record];
  return members.reduce((acc, r) => acc + read(r), 0);
}

function summaryOf(r: AuditRecord): Record<string, unknown> {
  return r.summary && typeof r.summary === "object" ? r.summary : {};
}

/**
 * The #529 collections. Returns null for a collection this module does not know, so the
 * caller keeps its `<op> <collection>` fallback for whatever ships next.
 */
export function classifyExtendedAuditRecord(
  record: AuditRecord,
  group: ExtGroup = { count: 1 },
): ClassifiedEvent | null {
  const before = record.before ?? {};
  const after = record.after ?? {};
  const base: Base = {
    record,
    group,
    before,
    after,
    subject: record.op === "delete" ? before : after,
    fields: record.changedFields,
    stamped: record.actorUid,
  };
  const { subject, fields, stamped } = base;
  const op = record.op;
  const client = record.clientId;
  const byTrainer = stamped ?? record.trainerId ?? record.coachId ?? null;
  const count = group.count;

  switch (record.collection) {
    // ── Coaching content ───────────────────────────────────────────────
    case "workout_templates": {
      const clientOwned = after.clientOwned === true || before.clientOwned === true;
      const label = name(subject.name);
      const ref = label ? null : ({ collection: "workout_templates", id: record.docId } as const);
      const target = clientOwned ? userTarget(record.trainerId) : null;
      const actor = byTrainer;
      if (op === "create") {
        return event(base, { category: "routine", title: "Creó una rutina", subject: label, subjectRef: ref, target, actorUid: actor, isSelfService: clientOwned, meta: [str(after.tag), clientOwned ? "rutina propia" : null] });
      }
      if (op === "delete" || softDeleted(base)) {
        return event(base, { category: "routine", title: "Eliminó una rutina", subject: label, subjectRef: op === "delete" ? null : ref, target, actorUid: actor, isSelfService: clientOwned, isDeletion: true });
      }
      if (fields.includes("visibility") && str(after.visibility) === "public") {
        return event(base, { category: "social", title: "Publicó una rutina", subject: label, subjectRef: ref, target, actorUid: actor, isSelfService: clientOwned });
      }
      const mechanical = fields.every((f) => ["updatedAt", "version", "lastUsedAt", "usageCount"].includes(f));
      return event(base, { category: "routine", significance: mechanical ? "low" : "key", title: "Editó una rutina", subject: label, subjectRef: ref, target, actorUid: actor, isSelfService: clientOwned, meta: [fields.filter((f) => f !== "updatedAt").join(", ")] });
    }

    case "habit_templates": {
      const label = name(subject.name);
      if (op === "create") return event(base, { category: "habit", title: "Creó una plantilla de hábito", subject: label, actorUid: byTrainer });
      if (op === "delete" || softDeleted(base)) return event(base, { category: "habit", title: "Eliminó una plantilla de hábito", subject: label, actorUid: byTrainer, isDeletion: true });
      return event(base, { category: "habit", title: "Editó una plantilla de hábito", subject: label, actorUid: byTrainer, meta: [fields.join(", ")] });
    }

    case "nutrition_templates": {
      const label = name(subject.name);
      const meals = Array.isArray(after.meals) ? (after.meals as unknown[]).length : null;
      const kcal = num(after.targets && (after.targets as Record<string, unknown>).kcal);
      if (op === "create") {
        return event(base, { category: "nutrition", title: "Armó un plan de nutrición", subject: label, actorUid: stamped ?? str(after.ownerId), meta: [kcal !== null ? `${kcal} kcal` : null, meals !== null ? countOf(meals, "comida", "comidas") : null] });
      }
      if (op === "delete" || softDeleted(base)) return event(base, { category: "nutrition", title: "Eliminó una plantilla de nutrición", subject: label, actorUid: stamped, isDeletion: true });
      return event(base, { category: "nutrition", title: "Editó una plantilla de nutrición", subject: label, actorUid: stamped, meta: [fields.filter((f) => f !== "updatedAt").join(", ")] });
    }

    case "nutrition_meals": {
      const label = name(subject.name);
      if (op === "create") return event(base, { category: "nutrition", title: "Creó una comida", subject: label, actorUid: stamped, meta: [str(after.moment)] });
      if (op === "delete" || softDeleted(base)) return event(base, { category: "nutrition", title: "Eliminó una comida", subject: label, actorUid: stamped, isDeletion: true });
      return event(base, { category: "nutrition", title: "Editó una comida", subject: label, actorUid: stamped, meta: [fields.filter((f) => f !== "updatedAt").join(", ")] });
    }

    case "client_goals": {
      const clientOwned = after.clientOwned === true || before.clientOwned === true || (!!client && client === record.coachId);
      const actor = stamped ?? (clientOwned ? client : record.coachId);
      const label = name(subject.title);
      const target = userTarget(client);
      const meta = [
        str(subject.kind) === "body_weight" ? "peso" : str(subject.kind) === "lift" ? (name(subject.exerciseName) ?? "levantamiento") : str(subject.kind) === "workouts_per_week" ? "entrenamientos por semana" : null,
        num(subject.targetValue) !== null ? `meta ${groupThousands(num(subject.targetValue)!)}` : null,
        str(subject.horizon) === "short" ? "corto plazo" : str(subject.horizon) === "medium" ? "mediano plazo" : str(subject.horizon) === "long" ? "largo plazo" : null,
      ];
      if (op === "create") return event(base, { category: "progress", title: clientOwned ? "Se puso un objetivo" : "Le puso un objetivo", subject: label, target, actorUid: actor, isSelfService: clientOwned, meta });
      if (op === "delete") return event(base, { category: "progress", title: "Eliminó un objetivo", subject: label, target, actorUid: actor, isSelfService: clientOwned });
      if (fields.includes("status") && ["achieved", "completed", "done"].includes(str(after.status) ?? "")) {
        return event(base, { category: "progress", title: "Cumplió un objetivo", subject: label, target, actorUid: client, isSelfService: clientOwned });
      }
      if (fields.includes("status") && ["abandoned", "archived", "cancelled"].includes(str(after.status) ?? "")) {
        return event(base, { category: "progress", title: "Abandonó un objetivo", subject: label, target, actorUid: actor, isSelfService: clientOwned });
      }
      return event(base, { category: "progress", title: "Editó un objetivo", subject: label, target, actorUid: actor, isSelfService: clientOwned, meta: [fields.filter((f) => f !== "updatedAt").join(", ")] });
    }

    case "client_notes": {
      const entries = num(summaryOf(record).entryCount);
      return event(base, {
        category: "coach",
        significance: op === "update" && fields.every((f) => f === "updatedAt") ? "low" : "key",
        title: op === "delete" ? "Borró las notas de un cliente" : "Actualizó las notas de un cliente",
        target: userTarget(client),
        actorUid: byTrainer,
        meta: [entries !== null ? countOf(entries, "entrada", "entradas") : null],
      });
    }

    case "client_exercise_notes": {
      const exercise = name(subject.exerciseName);
      return event(base, {
        category: "workout",
        title: op === "delete" ? "Borró una nota de ejercicio" : "Escribió una nota de ejercicio",
        subject: exercise,
        target: userTarget(client),
        actorUid: stamped ?? client,
        isSelfService: true,
      });
    }

    case "coach_checklist": {
      const label = name(subject.title);
      const target = userTarget(str(subject.clientId));
      if (op === "create") return event(base, { category: "coach", title: "Agregó una tarea a su checklist", subject: label, target, meta: [str(after.recurrence) && str(after.recurrence) !== "none" ? str(after.recurrence) : null, str(after.dueAt)?.slice(0, 10)] });
      if (op === "delete") return event(base, { category: "coach", title: "Borró una tarea de su checklist", subject: label, target });
      if (fields.includes("completed")) {
        return event(base, { category: "coach", title: after.completed === true ? "Completó una tarea de su checklist" : "Reabrió una tarea de su checklist", subject: label, target });
      }
      return event(base, { category: "coach", significance: fields.every((f) => f === "updatedAt") ? "low" : "key", title: "Editó una tarea de su checklist", subject: label, target, meta: [fields.filter((f) => f !== "updatedAt").join(", ")] });
    }

    case "coach_broadcasts": {
      const sent = num(after.sent) ?? (Array.isArray(after.clientIds) ? (after.clientIds as unknown[]).length : null);
      return event(base, { category: "chat", title: "Mandó un mensaje a todos sus clientes", subject: sent !== null ? countOf(sent, "cliente", "clientes") : null, actorUid: stamped ?? record.coachId });
    }

    // ── Billing ─────────────────────────────────────────────────────────
    case "coach_payment_plans": {
      const label = name(subject.name);
      const price = moneyLabel(subject.amount, subject.currency);
      if (op === "create") return event(base, { category: "billing", title: "Creó un plan de pago", subject: label, actorUid: stamped ?? record.coachId, meta: [price, str(after.kind)] });
      if (fields.includes("archived") && after.archived === true) return event(base, { category: "billing", title: "Archivó un plan de pago", subject: label, actorUid: stamped ?? record.coachId, isDeletion: true });
      const priceChange = fields.includes("amount") ? `${moneyLabel(before.amount, before.currency ?? after.currency) ?? "—"} → ${moneyLabel(after.amount, after.currency ?? before.currency) ?? "—"}` : null;
      return event(base, { category: "billing", title: "Editó un plan de pago", subject: label, actorUid: stamped ?? record.coachId, meta: [priceChange, priceChange ? null : fields.filter((f) => f !== "updatedAt").join(", ")] });
    }

    case "client_billing": {
      const planName = name((subject.plan as Record<string, unknown> | null)?.name);
      const target = userTarget(client);
      const actor = stamped ?? record.coachId;
      if (op === "create") {
        return event(base, { category: "billing", title: "Configuró el cobro de un cliente", subject: planName, target, actorUid: actor, meta: [moneyLabel(after.amount, null), str(after.nextDueCivil) ? `próximo vencimiento ${str(after.nextDueCivil)}` : null] });
      }
      // The payment row already says it; the billing doc's lastPayment* echo is its shadow.
      if (fields.every((f) => ["lastPaymentCivil", "lastPaymentAmount", "nextDueCivil", "classesRemaining", "updatedAt"].includes(f)) && fields.includes("lastPaymentCivil")) {
        return event(base, { category: "billing", significance: "low", title: "Actualizó el cobro de un cliente", subject: planName, target, actorUid: actor, meta: [str(after.nextDueCivil) ? `próximo vencimiento ${str(after.nextDueCivil)}` : null] });
      }
      if (fields.includes("planId") || fields.includes("plan")) {
        return event(base, { category: "billing", title: "Cambió el plan de pago de un cliente", subject: planName, target, actorUid: actor, meta: [moneyLabel(after.amount, null)] });
      }
      return event(base, { category: "billing", title: "Actualizó el cobro de un cliente", subject: planName, target, actorUid: actor, meta: [fields.includes("nextDueCivil") ? `próximo vencimiento ${str(after.nextDueCivil) ?? "—"}` : null, fields.includes("amount") ? moneyLabel(after.amount, null) : null] });
    }

    case "client_payments": {
      const target = userTarget(client);
      const actor = stamped ?? record.coachId;
      if (op === "create") {
        return event(base, {
          category: "billing",
          title: "Registró un pago",
          subject: moneyLabel(after.amount, after.currency),
          target,
          actorUid: actor,
          meta: [PAYMENT_METHOD[str(after.method) ?? ""] ?? str(after.method), name(after.planName), coversLabel(after.covers), str(after.paidCivil) ? `pagado ${str(after.paidCivil)}` : null],
        });
      }
      if (fields.includes("voidedAt") && after.voidedAt) {
        return event(base, { category: "billing", title: "Anuló un pago", target, actorUid: actor, isDeletion: true });
      }
      if (op === "delete") return event(base, { category: "billing", title: "Anuló un pago", subject: moneyLabel(before.amount, before.currency), target, actorUid: actor, isDeletion: true });
      return event(base, { category: "billing", title: "Editó un pago", target, actorUid: actor, meta: [fields.includes("method") ? (PAYMENT_METHOD[str(after.method) ?? ""] ?? str(after.method)) : null] });
    }

    // ── Body & progress ─────────────────────────────────────────────────
    case "progress_photos": {
      // Uploads are read straight from `progress_photos` by the feed (one row per set), so
      // the capture's create would say it twice — it stays hidden as low-signal. What only
      // the capture knows is the DELETE.
      if (op === "create") return event(base, { category: "photo", significance: "low", title: "Subió una foto de progreso", subject: str(after.angle), actorUid: stamped ?? client, target: client ? { kind: "userPhotos", uid: client } : null, isSelfService: true });
      if (op === "delete") return event(base, { category: "photo", title: "Eliminó una foto de progreso", subject: str(before.angle), actorUid: stamped ?? client, target: userTarget(client), isSelfService: true });
      return event(base, { category: "photo", significance: "low", title: "Editó una foto de progreso", actorUid: stamped ?? client, target: client ? { kind: "userPhotos", uid: client } : null, meta: [fields.join(", ")] });
    }

    case "body_weight_logs": {
      const kg = num(subject.valueKg);
      const fromHealth = str(subject.source) === "healthkit";
      const value = kg !== null ? `${groupThousands(kg)} kg` : null;
      if (op === "delete") return event(base, { category: "progress", title: "Eliminó un registro de peso", subject: value, actorUid: client, target: userTarget(client), isSelfService: true });
      return event(base, {
        category: "progress",
        significance: fromHealth ? "low" : "key",
        title: fromHealth ? "Importó su peso de Salud" : "Registró su peso",
        subject: count > 1 ? null : value,
        actorUid: client,
        target: userTarget(client),
        isSelfService: true,
        meta: [count > 1 ? countOf(count, "registro", "registros") : null, str(subject.recordedAt)?.slice(0, 10)],
      });
    }

    // ── Chat coach ↔ client (metadata only) ─────────────────────────────
    case "chat_messages": {
      const chatClient = client ?? str(record.params?.chatId);
      const sender = stamped;
      const fromClient = !!sender && sender === chatClient;
      if (op === "delete") return event(base, { category: "chat", title: "Borró un mensaje del chat", actorUid: sender, counterpartUid: fromClient ? null : chatClient, target: userTarget(chatClient) });
      const kinds = (group.members ?? [record]).map((r) => str(r.after?.kind) ?? "text");
      const photos = kinds.filter((k) => k === "image").length;
      const voices = kinds.filter((k) => k === "voice").length;
      return event(base, {
        category: "chat",
        title: fromClient ? "Le escribió a su coach" : "Le escribió a su cliente",
        actorUid: sender,
        // The client chip names the OTHER side; for a client→coach message the reader shows
        // the client's coach through the coach column.
        counterpartUid: fromClient ? null : chatClient,
        target: userTarget(chatClient),
        isSelfService: fromClient,
        meta: [countOf(count, "mensaje", "mensajes"), photos > 0 ? countOf(photos, "foto", "fotos") : null, voices > 0 ? countOf(voices, "audio", "audios") : null],
      });
    }

    case "dm_threads": {
      const participants = Array.isArray(subject.participants) ? (subject.participants as unknown[]).filter((p): p is string => typeof p === "string") : [];
      return event(base, {
        category: "chat",
        title: op === "delete" ? "Se borró una conversación privada" : "Abrió una conversación privada",
        actorUid: stamped ?? participants[0] ?? null,
        counterpartUid: participants[1] ?? null,
      });
    }

    case "dm_messages": {
      const other = otherOf(str(record.params?.threadId), stamped);
      if (op === "delete") return event(base, { category: "chat", title: "Borró un mensaje privado", counterpartUid: other });
      return event(base, { category: "chat", title: "Mandó mensajes privados", counterpartUid: other, isSelfService: true, meta: [countOf(count, "mensaje", "mensajes")] });
    }

    // ── Social ──────────────────────────────────────────────────────────
    case "social_profiles": {
      const me = stamped ?? record.docId;
      const handle = str(subject.handle);
      const label = handle ? `@${handle}` : name(subject.displayName);
      if (op === "create") return event(base, { category: "social", title: "Activó su perfil social", subject: label, actorUid: me, target: userTarget(me), isSelfService: true, meta: [str(after.visibility) === "private" ? "privado" : str(after.visibility) === "public" ? "público" : null] });
      if (op === "delete") return event(base, { category: "social", title: "Se borró su perfil social", subject: label, actorUid: me, target: userTarget(me) });
      if (fields.includes("visibility")) return event(base, { category: "social", title: str(after.visibility) === "private" ? "Hizo privado su perfil social" : "Hizo público su perfil social", actorUid: me, target: userTarget(me), isSelfService: true });
      if (fields.includes("handle")) return event(base, { category: "social", title: "Cambió su usuario social", subject: label, actorUid: me, target: userTarget(me), isSelfService: true, meta: [str(before.handle) ? `antes @${str(before.handle)}` : null] });
      if (fields.includes("suspended") || fields.includes("authorSuspended")) return event(base, { category: "social", title: "Moderación: cambió la suspensión de un perfil", actorUid: null, counterpartUid: me, target: userTarget(me) });
      return event(base, { category: "social", significance: fields.every((f) => ["displayName", "photoURL", "bio", "updatedAt"].includes(f)) ? "low" : "key", title: "Editó su perfil social", actorUid: me, target: userTarget(me), isSelfService: true, meta: [fields.filter((f) => f !== "updatedAt").join(", ")] });
    }

    case "social_follows": {
      const follower = stamped ?? str(subject.followerUid);
      const followee = str(subject.followeeUid);
      const handle = str(subject.followeeHandle);
      return event(base, {
        category: "social",
        title: op === "delete" ? "Dejó de seguir a alguien" : "Empezó a seguir a alguien",
        subject: count > 1 ? null : handle ? `@${handle}` : name(subject.followeeDisplayName),
        meta: [count > 1 ? countOf(count, "persona", "personas") : null],
        actorUid: follower,
        counterpartUid: count > 1 ? null : followee,
        isSelfService: true,
      });
    }

    case "social_follow_requests": {
      const requester = str(subject.requesterUid);
      const targetUid = str(subject.targetUid);
      if (op === "create") return event(base, { category: "social", title: "Pidió seguir a alguien", actorUid: requester, counterpartUid: targetUid, isSelfService: true });
      if (op === "update" && fields.includes("status")) {
        const s = str(after.status);
        return event(base, { category: "social", title: s === "accepted" ? "Aceptó una solicitud de seguimiento" : s === "declined" || s === "rejected" ? "Rechazó una solicitud de seguimiento" : "Actualizó una solicitud de seguimiento", actorUid: targetUid, counterpartUid: requester, isSelfService: true });
      }
      // Deleted on accept / decline / cancel alike — the edge or the status says which.
      return event(base, { category: "social", significance: "low", title: "Se cerró una solicitud de seguimiento", actorUid: null, counterpartUid: requester });
    }

    case "social_blocks": {
      return event(base, {
        category: "social",
        title: op === "delete" ? "Desbloqueó a alguien" : "Bloqueó a alguien",
        actorUid: stamped ?? str(subject.blockerUid),
        counterpartUid: str(subject.blockedUid),
        isSelfService: true,
      });
    }

    case "social_activity": {
      const author = stamped ?? str(subject.authorUid);
      if (op === "create") return event(base, { category: "social", title: "Compartió un entrenamiento", subject: name(subject.workoutName) ?? name(subject.templateName) ?? name(subject.name), actorUid: author, target: userTarget(author), isSelfService: true });
      if (op === "delete") return event(base, { category: "social", title: "Borró una actividad compartida", actorUid: author, target: userTarget(author), isSelfService: true });
      if (fields.includes("hidden")) return event(base, { category: "social", title: after.hidden === true ? "Moderación: se ocultó una actividad" : "Moderación: se volvió a mostrar una actividad", actorUid: null, counterpartUid: author });
      return event(base, { category: "social", significance: "low", title: "Se actualizó una actividad compartida", actorUid: null, counterpartUid: author, meta: [fields.join(", ")] });
    }

    case "activity_kudos": {
      return event(base, {
        category: "social",
        title: op === "delete" ? "Sacó un kudo" : "Le dio kudos a un entrenamiento",
        meta: [count > 1 ? countOf(count, "kudo", "kudos") : null],
        actorUid: stamped ?? str(subject.uid),
        counterpartUid: count > 1 ? null : str(subject.authorUid),
        isSelfService: true,
      });
    }

    case "public_routines": {
      const label = name(subject.name);
      const author = stamped ?? str(subject.authorUid);
      if (op === "create") return event(base, { category: "social", title: "Publicó una rutina", subject: label, actorUid: author, isSelfService: true });
      if (op === "delete") return event(base, { category: "social", title: "Despublicó una rutina", subject: label, actorUid: author, isSelfService: true });
      if (fields.includes("hidden")) return event(base, { category: "social", title: after.hidden === true ? "Moderación: se ocultó una rutina publicada" : "Moderación: se volvió a mostrar una rutina publicada", subject: label, actorUid: null, counterpartUid: author });
      return event(base, { category: "social", significance: "low", title: "Actualizó una rutina publicada", subject: label, actorUid: author, meta: [fields.join(", ")] });
    }

    case "routine_comments": {
      const author = stamped ?? str(subject.authorUid);
      if (op === "create") return event(base, { category: "social", title: str(after.replyToCommentId) ? "Respondió un comentario" : "Comentó una rutina", actorUid: author, isSelfService: true });
      if (op === "delete" || softDeleted(base)) return event(base, { category: "social", title: "Borró un comentario", actorUid: author, isSelfService: true });
      if (fields.includes("hidden")) return event(base, { category: "social", title: "Moderación: se ocultó un comentario", actorUid: null, counterpartUid: author });
      return event(base, { category: "social", significance: "low", title: "Se actualizó un comentario", actorUid: null, counterpartUid: author });
    }

    case "routine_likes": {
      return event(base, {
        category: "social",
        title: op === "delete" ? "Quitó un me gusta" : "Le dio me gusta a una rutina",
        meta: [count > 1 ? countOf(count, "rutina", "rutinas") : null],
        actorUid: stamped ?? str(subject.uid),
        isSelfService: true,
      });
    }

    case "social_challenges": {
      const label = name(subject.name);
      const ref = label ? null : ({ collection: "social_challenges", id: record.docId } as const);
      const summary = summaryOf(record);
      const changes = Array.isArray(summary.memberChanges)
        ? (summary.memberChanges as Array<Record<string, unknown>>).map((c) => ({ uid: str(c.uid), to: str(c.to) }))
        : [];
      if (op === "create") {
        const members = num(summary.memberCount);
        const target = num(after.target);
        return event(base, {
          category: "challenge",
          title: "Creó un desafío",
          subject: label,
          actorUid: stamped ?? str(after.creatorUid),
          isSelfService: true,
          meta: [str(after.kind), target !== null ? `meta ${groupThousands(target)}` : null, num(after.durationDays) !== null ? `${num(after.durationDays)} días` : null, members !== null && members > 1 ? `invitó a ${members - 1}` : null],
        });
      }
      if (op === "delete") return event(base, { category: "challenge", title: "Eliminó un desafío", subject: label, actorUid: stamped });
      if (changes.length === 1 && changes[0].uid) {
        const to = changes[0].to;
        const title =
          to === "joined" ? "Se unió a un desafío"
          : to === "declined" ? "Rechazó un desafío"
          : to === "left" ? "Salió de un desafío"
          : to === "invited" ? "Fue invitado a un desafío"
          : "Cambió su lugar en un desafío";
        return event(base, { category: "challenge", title, subject: label, subjectRef: ref, actorUid: changes[0].uid, isSelfService: true, meta: [num(summary.joinedCount) !== null ? countOf(num(summary.joinedCount)!, "participante", "participantes") : null] });
      }
      if (changes.length > 1) {
        return event(base, { category: "challenge", title: "Cambiaron los participantes de un desafío", subject: label, subjectRef: ref, actorUid: null, meta: [countOf(changes.length, "cambio", "cambios")] });
      }
      if (fields.includes("status") && str(after.status) !== "active") {
        return event(base, { category: "challenge", title: "Terminó un desafío", subject: label, subjectRef: ref, actorUid: null, meta: [str(after.status)] });
      }
      if (fields.includes("hidden")) return event(base, { category: "challenge", title: "Moderación: se ocultó un desafío", subject: label, subjectRef: ref, actorUid: null });
      return event(base, { category: "challenge", significance: "low", title: "Se actualizó un desafío", subject: label, subjectRef: ref, actorUid: null, meta: [fields.join(", ")] });
    }

    case "social_reports": {
      const reporter = stamped ?? str(subject.reporterUid);
      if (op === "create") return event(base, { category: "social", title: "Reportó contenido", actorUid: reporter, isSelfService: true, meta: [str(after.targetType), str(after.reason)] });
      return event(base, { category: "admin", significance: fields.includes("status") ? "key" : "low", title: "Moderación: actualizó un reporte", actorUid: str(after.resolvedBy) ?? null, counterpartUid: reporter, meta: [str(after.status), str(after.resolution)] });
    }

    // ── Corvo ───────────────────────────────────────────────────────────
    case "ai_coach": {
      const me = client ?? record.docId;
      const target = userTarget(me);
      if (op === "create") return event(base, { category: "corvo", title: "Activó Corvo", actorUid: me, target, isSelfService: true, meta: [num(after.consentVersion) !== null ? `términos v${num(after.consentVersion)}` : null] });
      if (op === "delete") return event(base, { category: "corvo", title: "Borró su conversación con Corvo", actorUid: stamped ?? me, target, isSelfService: true, isDeletion: true });
      if (fields.includes("photosConsentAt")) {
        const granted = !!after.photosConsentAt;
        return event(base, { category: "corvo", title: granted ? "Le dio permiso a Corvo para ver sus fotos" : "Le sacó a Corvo el permiso de ver sus fotos", actorUid: me, target, isSelfService: true });
      }
      return event(base, { category: "corvo", title: "Aceptó los nuevos términos de Corvo", actorUid: me, target, isSelfService: true, meta: [num(after.consentVersion) !== null ? `v${num(after.consentVersion)}` : null] });
    }

    case "ai_coach_turns": {
      // A burst = one conversation sitting. Aggregate every member's summary.
      const members = group.members && group.members.length > 0 ? group.members : [record];
      const tools = new Set<string>();
      let errors = 0;
      let quota = 0;
      let blocked = 0;
      // Oldest first: the topics read in the order the conversation went through them.
      for (const m of [...members].reverse()) {
        const s = summaryOf(m);
        for (const t of Array.isArray(s.toolNames) ? (s.toolNames as unknown[]) : []) {
          if (typeof t === "string") tools.add(t);
        }
        const outcome = str(s.outcome);
        if (outcome === "error" || outcome === "timeout") errors += 1;
        if (outcome === "quota") quota += 1;
        if (outcome === "not_eligible" || outcome === "prescreen_blocked") blocked += 1;
      }
      const proposals = sumOver(base, (r) => num(summaryOf(r).proposalsCreated) ?? 0);
      const topics = corvoTopics([...tools]);
      const onlyQuota = quota === members.length;
      return event(base, {
        category: "corvo",
        title: onlyQuota ? "Se quedó sin mensajes de Corvo" : "Habló con Corvo",
        actorUid: client ?? stamped,
        target: userTarget(client ?? stamped),
        isSelfService: true,
        action: "other",
        meta: [
          countOf(members.length, "mensaje", "mensajes"),
          topics.length > 0 ? `usó: ${topics.join(", ")}` : null,
          proposals > 0 ? countOf(proposals, "propuesta", "propuestas") : null,
          errors > 0 ? countOf(errors, "error", "errores") : null,
          quota > 0 && !onlyQuota ? `${quota} sin cupo` : null,
          blocked > 0 ? countOf(blocked, "bloqueado", "bloqueados") : null,
          str(summaryOf(record).surface) ? `desde ${str(summaryOf(record).surface)}` : null,
        ],
      });
    }

    case "ai_coach_proposals": {
      const me = client;
      const kind = proposalLabel(subject.type ?? subject.kind);
      if (op === "create") return event(base, { category: "corvo", significance: "low", title: "Corvo hizo una propuesta", subject: kind, actorUid: null, counterpartUid: me, target: userTarget(me) });
      const status = str(after.status);
      if (fields.includes("status") && status === "applied") return event(base, { category: "corvo", title: "Aceptó una propuesta de Corvo", subject: kind, actorUid: me, target: userTarget(me), isSelfService: true });
      if (fields.includes("status") && status === "dismissed") return event(base, { category: "corvo", title: "Descartó una propuesta de Corvo", subject: kind, actorUid: me, target: userTarget(me), isSelfService: true });
      if (fields.includes("status") && status === "failed") return event(base, { category: "corvo", title: "Falló una propuesta de Corvo", subject: kind, actorUid: me, target: userTarget(me), isSelfService: true });
      return event(base, { category: "corvo", significance: "low", title: "Venció una propuesta de Corvo", subject: kind, actorUid: null, counterpartUid: me, target: userTarget(me), meta: [status] });
    }

    case "ai_coach_reports": {
      const reason = str(after.reason ?? before.reason);
      const label =
        reason === "incorrect" ? "incorrecta"
        : reason === "inappropriate" ? "inapropiada"
        : reason === "off_topic" ? "fuera de tema"
        : reason === "other" ? "otro motivo"
        : reason;
      return event(base, { category: "corvo", title: "Reportó una respuesta de Corvo", subject: label, actorUid: client ?? stamped, target: userTarget(client), isSelfService: true });
    }

    // ── Accounts, invites, platform ─────────────────────────────────────
    case "user_mirror": {
      const email = record.docId.includes("@") ? record.docId : str(subject.email);
      const coach = stamped ?? record.coachId;
      if (op === "create") return event(base, { category: "account", title: "Invitó a un cliente", subject: email, actorUid: coach, meta: [name(subject.displayName)] });
      // Deleted both when the client signs up (promotion) and when the coach cancels.
      if (op === "delete") return event(base, { category: "account", significance: "low", title: "Se cerró una invitación", subject: email, actorUid: null, isDeletion: false });
      return event(base, { category: "account", significance: "low", title: "Actualizó una invitación", subject: email, actorUid: coach, meta: [fields.join(", ")] });
    }

    case "coach_allowlist": {
      return event(base, {
        category: "admin",
        title: op === "create" ? "Habilitó a un coach" : op === "delete" ? "Deshabilitó a un coach" : "Editó la lista de coaches",
        subject: record.docId,
        meta: op === "update" ? [fields.join(", ")] : [],
      });
    }

    case "app_config": {
      return event(base, {
        category: "admin",
        title: "Cambió la configuración de la app",
        subject: record.docId,
        isDeletion: op === "delete",
        meta: [fields.filter((f) => f !== "updatedAt").join(", ")],
      });
    }

    default:
      return null;
  }
}

/**
 * Which records collapse into one row when they arrive in a burst (newest-first input):
 * the SAME person doing the SAME small thing repeatedly — a chat sitting, a Corvo
 * conversation, a run of kudos. Null = never collapses. See `groupAuditBursts`.
 */
export function burstKeyFor(record: AuditRecord): string | null {
  const actor = record.actorUid ?? "";
  switch (record.collection) {
    case "ai_coach_turns":
      return `corvo|${record.clientId ?? actor}`;
    case "chat_messages":
      return record.op === "create" ? `chat|${record.clientId ?? record.params?.chatId ?? ""}|${actor}` : null;
    case "dm_messages":
      return record.op === "create" ? `dm|${record.params?.threadId ?? ""}|${actor}` : null;
    case "activity_kudos":
    case "routine_likes":
    case "social_follows":
      return `${record.collection}|${record.op}|${actor}`;
    case "body_weight_logs":
      // A Health import drops several samples at once; a manual entry is one.
      return record.op === "create" && record.after?.source === "healthkit" ? `bw|${record.clientId ?? ""}` : null;
    default:
      return null;
  }
}

/** Gap that ends a burst: a new message 40 minutes after the last one is a new sitting. */
export const BURST_GAP_MS = 30 * 60 * 1000;

/**
 * The same gap-collapse for rows that are NOT audit records (habit ticks read straight from
 * `habit_logs`): newest-first in, newest-first out, each group = [newest, …older].
 * «Cami marcó 3 hábitos» is three tick docs written minutes apart.
 */
export function collapseByGap<T>(
  items: T[],
  keyOf: (item: T) => string | null,
  timeOf: (item: T) => string | null,
  gapMs: number,
): T[][] {
  const out: T[][] = [];
  const open = new Map<string, { index: number; oldestMs: number }>();
  for (const item of items) {
    const key = keyOf(item);
    const at = Date.parse(timeOf(item) ?? "");
    if (!key || Number.isNaN(at)) {
      out.push([item]);
      continue;
    }
    const burst = open.get(key);
    if (burst && burst.oldestMs - at <= gapMs) {
      out[burst.index].push(item);
      burst.oldestMs = at;
      continue;
    }
    open.set(key, { index: out.length, oldestMs: at });
    out.push([item]);
  }
  return out;
}
