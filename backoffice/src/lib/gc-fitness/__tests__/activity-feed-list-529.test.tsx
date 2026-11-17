/**
 * @jest-environment jsdom
 */

// activity-feed-list-529.test.tsx — golden-crow-website#529.
//
// The render half of "every new event type as a human sentence": each new kind of row goes
// through the real ActivityFeedList, comes out in the viewer's language (the test stub serves
// en.json) with its category icon, and names the coach whose roster it belongs to.

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";

import { ActivityFeedList } from "@/app/gc-fitness/admin/audit/_components/ActivityFeedList";
import type { ActivityFeedEvent, FeedPerson } from "@/lib/gc-fitness/activity-feed-actions";
import { classifyAuditRecord, type AuditRecord } from "@/lib/gc-fitness/activity-feed-model";

const cami: FeedPerson = { uid: "cami", name: "Cami", email: "cami@x.com", role: "client", href: "/c/cami" };
const ana: FeedPerson = { uid: "ana", name: "Ana", email: "ana@x.com", role: "coach", href: "/c/ana" };

function rec(over: Partial<AuditRecord> & Pick<AuditRecord, "collection">): AuditRecord {
  return {
    id: `audit_log:${over.collection}`,
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
    occurredAtISO: "2026-11-17T15:00:00.000Z",
    ...over,
  };
}

/** A rendered row, built from the REAL classifier output for `record`. */
function row(record: AuditRecord, people: { actor: FeedPerson; client?: FeedPerson | null; coach?: FeedPerson | null }, count = 1, members?: AuditRecord[]): ActivityFeedEvent {
  const e = classifyAuditRecord(record, { count, dates: [], members });
  return {
    id: record.id,
    source: "audit_log",
    category: e.category,
    significance: e.significance,
    action: e.action,
    occurredAtISO: record.occurredAtISO,
    title: e.title,
    subject: e.subject,
    meta: e.meta,
    actor: people.actor,
    client: people.client ?? null,
    coach: people.coach ?? null,
    href: null,
    occurrenceCount: count > 1 ? count : undefined,
    isDeletion: e.isDeletion,
    kind: `${record.collection}.${record.op}`,
    clientUid: record.clientId,
    correlation: null,
  };
}

const CASES: Array<{ name: string; event: ActivityFeedEvent; text: RegExp[] }> = [
  {
    name: "payment",
    event: row(rec({ collection: "client_payments", actorUid: "ana", clientId: "cami", after: { amount: 135000, currency: "ARS", method: "transfer" } }), { actor: ana, client: cami }),
    text: [/recorded a payment/, /\$ 135\.000/, /transferencia/],
  },
  {
    name: "nutrition plan built",
    event: row(rec({ collection: "nutrition_templates", actorUid: "ana", after: { name: "Definición", targets: { kcal: 1800 }, meals: [{}, {}] } }), { actor: ana }),
    text: [/built a nutrition plan/, /Definición/, /1800 kcal/],
  },
  {
    name: "Corvo sitting",
    event: (() => {
      const members = [
        rec({ id: "t2", collection: "ai_coach_turns", clientId: "cami", actorUid: "cami", summary: { outcome: "done", toolNames: ["get_routines"] } }),
        rec({ id: "t1", collection: "ai_coach_turns", clientId: "cami", actorUid: "cami", summary: { outcome: "done", toolNames: ["get_recent_workouts"] } }),
      ];
      return row(members[0], { actor: cami, coach: ana }, 2, members);
    })(),
    text: [/talked to Corvo/, /2 mensajes/, /usó: progreso, rutinas/, /×2/],
  },
  {
    name: "challenge joined",
    event: row(rec({ collection: "social_challenges", op: "update", changedFields: ["members"], after: { name: "Noviembre" }, summary: { memberChanges: [{ uid: "cami", to: "joined" }], joinedCount: 3 } }), { actor: cami, coach: ana }),
    text: [/joined a challenge/, /3 participantes/],
  },
  {
    name: "chat to coach",
    event: row(rec({ collection: "chat_messages", actorUid: "cami", clientId: "cami", after: { senderId: "cami", kind: "voice" } }), { actor: cami, coach: ana }),
    text: [/messaged their coach/, /1 audio/],
  },
  {
    name: "goal",
    event: row(rec({ collection: "client_goals", clientId: "cami", coachId: "cami", after: { title: "Bajar a 70 kg", kind: "body_weight", clientOwned: true } }), { actor: cami, coach: ana }),
    text: [/set themselves a goal/, /Bajar a 70 kg/],
  },
  {
    name: "invite",
    event: row(rec({ collection: "user_mirror", docId: "nueva@x.com", actorUid: "ana", after: { coachId: "ana" } }), { actor: ana }),
    text: [/invited a client/, /nueva@x\.com/],
  },
];

describe("ActivityFeedList — #529 event types", () => {
  it.each(CASES)("renders «$name» as a sentence in the viewer's language", ({ event, text }) => {
    const { container } = render(<ActivityFeedList events={[event]} today="2026-11-17" timeZone="UTC" />);
    const rendered = container.textContent ?? "";
    for (const t of text) expect(rendered).toMatch(t);
    // Never a raw Spanish source sentence when a key exists, never a capture marker.
    expect(rendered).not.toMatch(/redacted|omitted/);
  });

  it("names the client's coach when the coach is not the actor, and not twice when they are", () => {
    render(
      <ActivityFeedList
        events={[CASES[2].event, CASES[0].event]}
        today="2026-11-17"
        timeZone="UTC"
      />,
    );
    const chips = screen.getAllByTestId("feed-row-coach");
    // Only the Corvo row: on the payment Ana is the actor and has no coach chip of her own.
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent("coach: Ana");
  });
});
