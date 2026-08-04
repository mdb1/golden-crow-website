/**
 * @jest-environment jsdom
 */

// activity-feed-list.test.tsx
//
// The admin feed's rendering contract (issue #671): day grouping, the
// actor → verb → subject sentence, and the fact that EVERY event with a target
// is tappable — the ticket's "todo tiene que poder ser tappeable".

import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import React from "react";

import { ActivityFeedList } from "@/app/gc-fitness/admin/audit/_components/ActivityFeedList";
import type { ActivityFeedEvent } from "@/lib/gc-fitness/activity-feed-actions";

function event(over: Partial<ActivityFeedEvent> & { id: string }): ActivityFeedEvent {
  return {
    source: "audit_log",
    category: "workout",
    significance: "key",
    action: "create",
    occurredAtISO: "2026-07-31T20:37:00.000Z",
    title: "Terminó un workout",
    subject: "Full Body A",
    meta: [],
    actor: {
      uid: "solo1",
      name: "Solo User",
      email: "solo@x.com",
      role: "client",
      href: "/gc-fitness/admin/coach-less-users/solo1",
    },
    client: null,
    href: "/gc-fitness/admin/coaches/solo1/clients/solo1/workouts/log-1",
    isDeletion: false,
    kind: "workout_logs.create",
    clientUid: "solo1",
    correlation: null,
    ...over,
  };
}

describe("ActivityFeedList", () => {
  // ── #736: la hora y el DÍA salen en la zona del usuario, no en UTC ──────────
  //
  // Las 20:37Z del 31 de julio son las 17:37 del 31 en Buenos Aires: mismo día, hora
  // distinta. Las 01:30Z del 1 de agosto son las 22:30 del 31 — DÍA distinto, que es la
  // mitad del bug que un test de "sólo la hora" no habría visto.
  it("muestra la hora en la zona del usuario y no en UTC", () => {
    render(
      <ActivityFeedList
        events={[event({ id: "e1", occurredAtISO: "2026-07-31T20:37:00.000Z" })]}
        today="2026-07-31"
        timeZone="America/Argentina/Buenos_Aires"
      />,
    );

    expect(screen.getByText("17:37")).toBeInTheDocument();
    expect(screen.queryByText("20:37")).not.toBeInTheDocument();
  });

  it("agrupa por el día CIVIL del usuario, no por el día UTC", () => {
    render(
      <ActivityFeedList
        events={[event({ id: "e1", occurredAtISO: "2026-08-01T01:30:00.000Z" })]}
        today="2026-07-31"
        timeZone="America/Argentina/Buenos_Aires"
      />,
    );

    // 01:30Z del 1/8 = 22:30 del 31/7 en Buenos Aires ⇒ va bajo "Hoy · 2026-07-31".
    expect(screen.getByText(/Hoy · 2026-07-31/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-08-01/)).not.toBeInTheDocument();
  });

  it("sin timeZone se comporta como antes (UTC), que es el default de getTrainerTimezone", () => {
    render(
      <ActivityFeedList
        events={[event({ id: "e1", occurredAtISO: "2026-07-31T20:37:00.000Z" })]}
        today="2026-07-31"
      />,
    );

    expect(screen.getByText("20:37")).toBeInTheDocument();
  });

  it("renders the actor, the verb and a tappable subject", () => {
    render(<ActivityFeedList events={[event({ id: "e1" })]} today="2026-07-31" />);

    expect(screen.getByRole("link", { name: "Solo User" })).toHaveAttribute(
      "href",
      "/gc-fitness/admin/coach-less-users/solo1",
    );
    expect(screen.getByText("terminó un workout")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Full Body A" })).toHaveAttribute(
      "href",
      "/gc-fitness/admin/coaches/solo1/clients/solo1/workouts/log-1",
    );
    expect(screen.getByText("20:37")).toBeInTheDocument();
  });

  it("still offers a link when the event has no name to show", () => {
    render(
      <ActivityFeedList events={[event({ id: "e1", subject: null })]} today="2026-07-31" />,
    );
    expect(screen.getByRole("link", { name: "ver detalle" })).toBeInTheDocument();
  });

  it("groups by UTC day with Hoy / Ayer headers", () => {
    render(
      <ActivityFeedList
        events={[
          event({ id: "e1" }),
          event({ id: "e2", occurredAtISO: "2026-07-30T10:00:00.000Z" }),
          event({ id: "e3", occurredAtISO: "2026-07-28T10:00:00.000Z" }),
        ]}
        today="2026-07-31"
      />,
    );
    expect(screen.getByText(/Hoy · 2026-07-31/)).toBeInTheDocument();
    expect(screen.getByText(/Ayer · 2026-07-30/)).toBeInTheDocument();
    expect(screen.getByText("2026-07-28")).toBeInTheDocument();
  });

  it("shows the recurrence count and the folded-in routine update", () => {
    render(
      <ActivityFeedList
        events={[
          event({
            id: "e1",
            occurrenceCount: 4,
            notes: ["actualizó la rutina (4 ocurrencias)"],
            meta: ["1 h 2 min", "6.410 kg"],
          }),
        ]}
        today="2026-07-31"
      />,
    );
    expect(screen.getByText("×4")).toBeInTheDocument();
    expect(screen.getByText("actualizó la rutina (4 ocurrencias)")).toBeInTheDocument();
    expect(screen.getByText("1 h 2 min")).toBeInTheDocument();
  });

  it("links the client separately so the row never nests anchors", () => {
    const { container } = render(
      <ActivityFeedList
        events={[
          event({
            id: "e1",
            title: "Asignó un workout",
            client: {
              uid: "client1",
              name: "Client One",
              email: "c1@x.com",
              role: "client",
              href: "/gc-fitness/admin/coaches/coach1/clients/client1",
            },
          }),
        ]}
        today="2026-07-31"
      />,
    );
    expect(screen.getByRole("link", { name: "Client One" })).toBeInTheDocument();
    for (const anchor of Array.from(container.querySelectorAll("a"))) {
      expect(within(anchor).queryByRole("link")).toBeNull();
    }
  });

  it("renders an empty state instead of a blank card", () => {
    render(<ActivityFeedList events={[]} today="2026-07-31" emptyLabel="Nada por acá." />);
    expect(screen.getByText("Nada por acá.")).toBeInTheDocument();
  });
});
