/**
 * @jest-environment jsdom
 */

// moderation-queue.test.tsx — the rows of /gc-fitness/admin/moderation
// (gc-fitness #1050). Every verb is a <form> whose HIDDEN FIELDS are the whole
// payload the Server Action reads, so what is pinned here is the payload: the
// target triple and the ids of the open reports the operator saw. Plus the
// `window.confirm` gate on the two verbs that change content.

import "@testing-library/jest-dom";

import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";

const mockHide = jest.fn();
const mockSuspend = jest.fn();
const mockDismiss = jest.fn();
jest.mock("@/lib/gc-fitness/moderation-actions", () => ({
  hideReportedContent: (...a: unknown[]) => mockHide(...a),
  suspendReportedAuthor: (...a: unknown[]) => mockSuspend(...a),
  dismissReports: (...a: unknown[]) => mockDismiss(...a),
  unhideReportedContent: jest.fn(),
  unsuspendSocialAccount: jest.fn(),
}));

import type { ModerationGroup } from "@/lib/gc-fitness/moderation-model";

import { ModerationQueue } from "../moderation/_components/ModerationQueue";

const NOW = "2026-09-18T12:00:00.000Z";

function group(overrides: Partial<ModerationGroup> = {}): ModerationGroup {
  return {
    key: "routine|tpl-1",
    targetType: "routine",
    targetId: "tpl-1",
    targetOwnerUid: "u-owner",
    reports: [
      { id: "r1", reporterUid: "u-a", targetType: "routine", targetId: "tpl-1", targetOwnerUid: "u-owner", reason: "spam", note: "vende cosas", status: "open", createdAtISO: "2026-09-18T11:00:00.000Z", resolvedAtISO: null, resolvedBy: null, resolution: null },
      { id: "r2", reporterUid: "u-b", targetType: "routine", targetId: "tpl-1", targetOwnerUid: "u-owner", reason: "harassment", note: null, status: "open", createdAtISO: "2026-09-17T06:00:00.000Z", resolvedAtISO: null, resolvedBy: null, resolution: null },
    ],
    oldestOpenISO: "2026-09-17T06:00:00.000Z",
    reasons: ["spam", "harassment"],
    preview: { title: "Push day · @lucia", body: "Pecho y tríceps", hidden: false, ownerSuspended: false, missing: false },
    ...overrides,
  };
}

function hiddenFields(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  form.querySelectorAll<HTMLInputElement>('input[type="hidden"]').forEach((i) => {
    out[i.name] = i.value;
  });
  return out;
}

describe("ModerationQueue", () => {
  it("renders one row per target with every report, the content in context, and a breached SLA", () => {
    render(<ModerationQueue groups={[group()]} status="open" nowISO={NOW} />);
    const row = screen.getByTestId("moderation-group-routine-tpl-1");
    expect(within(row).getByText("2 reportes")).toBeInTheDocument();
    expect(within(row).getByText("Push day · @lucia")).toBeInTheDocument();
    expect(within(row).getByText("Pecho y tríceps")).toBeInTheDocument();
    expect(within(row).getByText("Spam")).toBeInTheDocument();
    expect(within(row).getByText("Acoso")).toBeInTheDocument();
    expect(within(row).getByText("“vende cosas”")).toBeInTheDocument();
    expect(within(row).getByTestId("moderation-sla")).toHaveTextContent(/^SLA vencido/);
  });

  it("the three verbs carry the target triple and ONLY the open report ids", () => {
    const g = group();
    g.reports.push({ ...g.reports[0], id: "r-old", status: "dismissed" });
    render(<ModerationQueue groups={[g]} status="open" nowISO={NOW} />);
    const row = screen.getByTestId("moderation-group-routine-tpl-1");
    const forms = Array.from(row.querySelectorAll("form"));
    expect(forms).toHaveLength(3);
    for (const form of forms) {
      expect(hiddenFields(form)).toEqual({
        targetType: "routine",
        targetId: "tpl-1",
        targetOwnerUid: "u-owner",
        reportIds: "r1,r2",
      });
    }
  });

  it("a profile row offers Suspender and Descartar, never Ocultar", () => {
    render(
      <ModerationQueue
        groups={[group({ key: "profile|u-owner", targetType: "profile", targetId: "u-owner" })]}
        status="open"
        nowISO={NOW}
      />,
    );
    expect(screen.queryByRole("button", { name: "Ocultar contenido" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suspender autor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descartar" })).toBeInTheDocument();
  });

  it("cancelling the confirm blocks Ocultar and Suspender; Descartar does not ask", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    render(<ModerationQueue groups={[group()]} status="open" nowISO={NOW} />);
    const hideForm = screen.getByRole("button", { name: "Ocultar contenido" }).closest("form")!;
    const suspendForm = screen.getByRole("button", { name: "Suspender autor" }).closest("form")!;
    const dismissForm = screen.getByRole("button", { name: "Descartar" }).closest("form")!;

    // `fireEvent.submit` returns false whenever SOMETHING called preventDefault
    // — and React 19 does that itself for every `<form action={fn}>`, so the
    // return value cannot tell the gate from the framework. What can: whether
    // `window.confirm` was asked, and whether the action ran.
    fireEvent.submit(hideForm);
    fireEvent.submit(suspendForm);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(mockHide).not.toHaveBeenCalled();
    expect(mockSuspend).not.toHaveBeenCalled();
    fireEvent.submit(dismissForm);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });

  it("already-hidden content disables Ocultar and offers the reversal; a suspended owner likewise", () => {
    render(
      <ModerationQueue
        groups={[group({ preview: { title: "t", body: null, hidden: true, ownerSuspended: true, missing: false } })]}
        status="open"
        nowISO={NOW}
      />,
    );
    expect(screen.getByRole("button", { name: "Ocultar contenido" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Suspender autor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Volver a mostrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Levantar suspensión" })).toBeInTheDocument();
  });

  it("a resolved bandeja shows no verbs and the empty state names the bandeja", () => {
    render(<ModerationQueue groups={[]} status="dismissed" nowISO={NOW} />);
    expect(screen.getByTestId("moderation-empty")).toHaveTextContent("Nada en esta bandeja.");
  });
});
