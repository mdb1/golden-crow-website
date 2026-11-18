// activity-feed-model-ext.test.ts — golden-crow-website#529.
//
// One human sentence per collection the capture watches since 2.3.0: the title, WHO did it,
// the subject and the facts under it. Plus the pure helpers (money, Corvo topics, bursts)
// and the privacy contract on the reader side: a redaction marker is never printed.

import { classifyAuditRecord, type AuditRecord } from "../activity-feed-model";
import {
  BURST_GAP_MS,
  burstKeyFor,
  classifyExtendedAuditRecord,
  collapseByGap,
  corvoTopics,
  groupThousands,
  moneyLabel,
  otherOf,
} from "../activity-feed-model-ext";
import { groupAuditBursts, groupRecurringAuditEntries } from "../audit-grouping";
import { feedTitleKey } from "../activity-feed-titles";

function rec(over: Partial<AuditRecord> & Pick<AuditRecord, "collection">): AuditRecord {
  return {
    id: `audit_log:${over.collection}-${over.docId ?? "d1"}-${over.occurredAtISO ?? ""}`,
    docId: "d1",
    op: "create",
    changedFields: [],
    changedFieldCount: 0,
    before: null,
    after: null,
    actorUid: null,
    trainerId: null,
    coachId: null,
    clientId: null,
    occurredAtISO: "2026-11-17T12:00:00.000Z",
    summary: null,
    params: null,
    ...over,
  };
}

describe("#529 helpers", () => {
  it("formats money with es-AR separators, without depending on the runtime ICU", () => {
    expect(groupThousands(135000)).toBe("135.000");
    expect(groupThousands(1234.5)).toBe("1.234,5");
    expect(moneyLabel(135000, "ARS")).toBe("$ 135.000");
    expect(moneyLabel(40, "USD")).toBe("US$ 40");
    expect(moneyLabel(10, "BRL")).toBe("BRL 10");
    expect(moneyLabel(undefined, "ARS")).toBeNull();
  });

  it("turns Corvo tool names into topics, dropping plumbing and keeping unknown tools visible", () => {
    expect(corvoTopics(["get_routines", "propose_routine", "get_recent_workouts", "attach_card"])).toEqual([
      "rutinas",
      "progreso",
    ]);
    expect(corvoTopics(["brand_new_tool"])).toEqual(["brand_new_tool"]);
  });

  it("finds the other side of a pair id", () => {
    expect(otherOf("a_b", "a")).toBe("b");
    expect(otherOf("a_b", "b")).toBe("a");
    expect(otherOf("a_b", "c")).toBeNull();
  });

  it("collapseByGap groups same-key items within the gap, newest first", () => {
    const at = (m: number) => new Date(Date.UTC(2026, 10, 17, 12, m)).toISOString();
    const items = [
      { k: "cami", t: at(50) },
      { k: "ana", t: at(45) },
      { k: "cami", t: at(40) },
      { k: "cami", t: at(0) }, // 40 min before the previous one → new burst at a 30-min gap
    ];
    const groups = collapseByGap(items, (i) => i.k, (i) => i.t, BURST_GAP_MS);
    expect(groups.map((g) => g.map((i) => i.t))).toEqual([[at(50), at(40)], [at(45)], [at(0)]]);
  });
});

describe("#529 one sentence per collection", () => {
  const cases: Array<{
    name: string;
    record: AuditRecord;
    title: string;
    actor?: string | null;
    subject?: string | null;
    meta?: string[];
    category?: string;
    counterpart?: string | null;
  }> = [
    {
      name: "payment",
      record: rec({
        collection: "client_payments",
        actorUid: "ana",
        coachId: "ana",
        clientId: "cami",
        after: { amount: 135000, currency: "ARS", method: "transfer", planName: "Mensual", covers: { kind: "months", months: 1 }, paidCivil: "2026-11-17", note: "[redacted: 22 chars]" },
      }),
      title: "Registró un pago",
      actor: "ana",
      subject: "$ 135.000",
      meta: ["transferencia", "Mensual", "1 mes", "pagado 2026-11-17"],
      category: "billing",
    },
    {
      name: "voided payment",
      record: rec({ collection: "client_payments", op: "update", actorUid: "ana", clientId: "cami", changedFields: ["voidedAt", "voidReason"], before: { voidedAt: null }, after: { voidedAt: "2026-11-17T12:00:00Z", voidReason: "[redacted: 9 chars]" } }),
      title: "Anuló un pago",
      actor: "ana",
    },
    {
      name: "payment plan",
      record: rec({ collection: "coach_payment_plans", actorUid: "ana", coachId: "ana", after: { name: "Mensual online", amount: 50000, currency: "ARS", kind: "monthly" } }),
      title: "Creó un plan de pago",
      subject: "Mensual online",
      meta: ["$ 50.000", "monthly"],
    },
    {
      name: "billing set up",
      record: rec({ collection: "client_billing", actorUid: "ana", clientId: "cami", after: { plan: { name: "Mensual", kind: "monthly" }, amount: 50000, nextDueCivil: "2026-12-01" } }),
      title: "Configuró el cobro de un cliente",
      subject: "Mensual",
    },
    {
      name: "nutrition template",
      record: rec({ collection: "nutrition_templates", actorUid: "juan", after: { name: "Definición", ownerId: "juan", targets: { kcal: 1800 }, meals: [{}, {}, {}] } }),
      title: "Armó un plan de nutrición",
      actor: "juan",
      subject: "Definición",
      meta: ["1800 kcal", "3 comidas"],
      category: "nutrition",
    },
    {
      name: "routine created by a client",
      record: rec({ collection: "workout_templates", trainerId: "cami", after: { name: { es: "Push", en: "Push" }, clientOwned: true, tag: "push" } }),
      title: "Creó una rutina",
      actor: "cami",
      subject: "Push",
    },
    {
      name: "goal achieved",
      record: rec({ collection: "client_goals", op: "update", clientId: "cami", coachId: "ana", changedFields: ["status", "updatedAt"], before: { status: "active" }, after: { status: "achieved" } }),
      title: "Cumplió un objetivo",
      actor: "cami",
      category: "progress",
    },
    {
      name: "coach checklist",
      record: rec({ collection: "coach_checklist", actorUid: "ana", coachId: "ana", after: { title: "Llamar a Cami", notes: "[redacted: 7 chars]", recurrence: "none", completed: false } }),
      title: "Agregó una tarea a su checklist",
      subject: "Llamar a Cami",
    },
    {
      name: "body weight",
      record: rec({ collection: "body_weight_logs", clientId: "cami", after: { valueKg: 71.4, source: "manual", recordedAt: "2026-11-17T08:00:00Z" } }),
      title: "Registró su peso",
      actor: "cami",
      subject: "71,4 kg",
    },
    {
      name: "chat client → coach",
      record: rec({ collection: "chat_messages", actorUid: "cami", clientId: "cami", params: { chatId: "cami" }, after: { senderId: "cami", kind: "text", text: "[redacted: 20 chars]" } }),
      title: "Le escribió a su coach",
      actor: "cami",
      meta: ["1 mensaje"],
      category: "chat",
      counterpart: null,
    },
    {
      name: "chat coach → client",
      record: rec({ collection: "chat_messages", actorUid: "ana", clientId: "cami", params: { chatId: "cami" }, after: { senderId: "ana", kind: "image" } }),
      title: "Le escribió a su cliente",
      actor: "ana",
      counterpart: "cami",
      meta: ["1 mensaje", "1 foto"],
    },
    {
      name: "follow",
      record: rec({ collection: "social_follows", actorUid: "cami", after: { followerUid: "cami", followeeUid: "juan", followeeHandle: "juanfit" } }),
      title: "Empezó a seguir a alguien",
      subject: "@juanfit",
      counterpart: "juan",
      category: "social",
    },
    {
      name: "challenge joined",
      record: rec({ collection: "social_challenges", op: "update", changedFields: ["members", "memberUids"], after: {}, summary: { memberChanges: [{ uid: "cami", from: "invited", to: "joined" }], joinedCount: 3, memberCount: 4 } }),
      title: "Se unió a un desafío",
      actor: "cami",
      meta: ["3 participantes"],
      category: "challenge",
    },
    {
      name: "challenge created",
      record: rec({ collection: "social_challenges", actorUid: "ana", after: { creatorUid: "ana", name: "Noviembre", kind: "workouts", target: 12, durationDays: 30 }, summary: { memberCount: 4, joinedCount: 1, memberChanges: [] } }),
      title: "Creó un desafío",
      subject: "Noviembre",
      meta: ["workouts", "meta 12", "30 días", "invitó a 3"],
    },
    {
      name: "Corvo thread consent",
      record: rec({ collection: "ai_coach", docId: "cami", actorUid: "cami", clientId: "cami", after: { consentVersion: 2, consentAt: "t" } }),
      title: "Activó Corvo",
      actor: "cami",
      category: "corvo",
    },
    {
      name: "Corvo proposal applied",
      record: rec({ collection: "ai_coach_proposals", op: "update", clientId: "cami", changedFields: ["status", "resolvedAt"], before: { status: "pending" }, after: { status: "applied" } }),
      title: "Aceptó una propuesta de Corvo",
      actor: "cami",
    },
    {
      name: "Corvo report",
      record: rec({ collection: "ai_coach_reports", actorUid: "cami", clientId: "cami", after: { reason: "incorrect", note: "[redacted: 10 chars]" } }),
      title: "Reportó una respuesta de Corvo",
      subject: "incorrecta",
    },
    {
      name: "invite",
      record: rec({ collection: "user_mirror", docId: "nueva@x.com", actorUid: "ana", coachId: "ana", after: { coachId: "ana", pre_created: true } }),
      title: "Invitó a un cliente",
      actor: "ana",
      subject: "nueva@x.com",
      category: "account",
    },
    {
      name: "app config",
      record: rec({ collection: "app_config", docId: "minVersion", op: "update", changedFields: ["ios", "updatedAt"], before: { ios: "2.2.0" }, after: { ios: "2.3.0" } }),
      title: "Cambió la configuración de la app",
      subject: "minVersion",
      meta: ["ios"],
      category: "admin",
    },
  ];

  it.each(cases)("$name", ({ record, title, actor, subject, meta, category, counterpart }) => {
    const e = classifyAuditRecord(record);
    expect(e.title).toBe(title);
    // Every sentence has an i18n key (en/es) — an unmapped one would render Spanish in en.
    expect(feedTitleKey(e.title)).not.toBeNull();
    if (actor !== undefined) expect(e.actorUid).toBe(actor);
    if (subject !== undefined) expect(e.subject).toBe(subject);
    if (meta !== undefined) expect(e.meta).toEqual(meta);
    if (category !== undefined) expect(e.category).toBe(category);
    if (counterpart !== undefined) expect(e.counterpartUid ?? null).toBe(counterpart);
    // Privacy: no capture marker ever reaches the screen.
    expect(JSON.stringify([e.subject, e.meta])).not.toMatch(/redacted|omitted/);
  });

  it("returns null for a collection it does not know (the caller keeps its fallback)", () => {
    expect(classifyExtendedAuditRecord(rec({ collection: "brand_new" }))).toBeNull();
    expect(classifyAuditRecord(rec({ collection: "brand_new" })).title).toBe("create brand_new");
  });
});

describe("#529 bursts", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 10, 17, 12, m)).toISOString();
  const turn = (m: number, tools: string[], outcome = "done", proposals = 0) =>
    rec({
      id: `audit_log:turn-${m}`,
      collection: "ai_coach_turns",
      docId: `m${m}`,
      actorUid: "cami",
      clientId: "cami",
      occurredAtISO: at(m),
      summary: { outcome, toolNames: tools, proposalsCreated: proposals },
    });

  it("one Corvo sitting = one row: «Cami habló con Corvo (6 mensajes · usó: rutinas, progreso)»", () => {
    const raw = [
      turn(50, ["get_routines"]),
      turn(45, []),
      turn(40, ["get_recent_workouts", "get_personal_records"], "done", 1),
      turn(35, []),
      turn(30, ["propose_routine"]),
      turn(25, [], "quota"),
      // 2 hours earlier: a different sitting.
      rec({ ...turn(0, ["get_habits"]), occurredAtISO: "2026-11-17T09:00:00.000Z", id: "audit_log:turn-old" }),
    ];
    const groups = groupAuditBursts(groupRecurringAuditEntries(raw), burstKeyFor, BURST_GAP_MS);
    expect(groups.map((g) => g.count)).toEqual([6, 1]);
    const e = classifyAuditRecord(groups[0].head, { count: 6, dates: [], members: groups[0].members });
    expect(e.title).toBe("Habló con Corvo");
    expect(e.actorUid).toBe("cami");
    expect(e.meta).toEqual(["6 mensajes", "usó: rutinas, progreso", "1 propuesta", "1 sin cupo"]);
  });

  it("a chat sitting collapses per sender; a different sender is its own row", () => {
    const msg = (m: number, sender: string) =>
      rec({ id: `audit_log:msg-${m}`, collection: "chat_messages", docId: `msg${m}`, actorUid: sender, clientId: "cami", params: { chatId: "cami" }, occurredAtISO: at(m), after: { senderId: sender, kind: "text" } });
    const groups = groupAuditBursts(groupRecurringAuditEntries([msg(10, "cami"), msg(9, "ana"), msg(8, "cami"), msg(7, "cami")]), burstKeyFor, BURST_GAP_MS);
    expect(groups.map((g) => [g.head.actorUid, g.count])).toEqual([["cami", 3], ["ana", 1]]);
  });

  it("never bursts a payment (each one is its own fact)", () => {
    expect(burstKeyFor(rec({ collection: "client_payments", actorUid: "ana" }))).toBeNull();
  });
});
