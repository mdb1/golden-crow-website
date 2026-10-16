/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import TwoPQFormsPage from "@/app/(dashboard)/2pq-dashboard/forms/page";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { AdminContextRecord } from "@/lib/admin-areas";
import { getServerAppLanguage } from "@/lib/server-language";
import {
  getTwoPQFormDraft,
  getTwoPQFormsPage,
} from "@/lib/two-pq-server";

jest.mock("@/components/header-unclutter", () => ({
  HeaderUnclutterButton: () => null,
  HeaderUnclutterScope: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/components/two-pq-form-completion-dialog", () => ({
  TwoPQFormCompletionDialog: () => null,
}));

jest.mock("@/components/two-pq-forms-list", () => ({
  TwoPQFormsList: () => <div data-testid="forms-list" />,
}));

jest.mock("@/lib/admin-context-server", () => ({
  getAdminContextServer: jest.fn(),
}));

jest.mock("@/lib/server-language", () => ({
  getServerAppLanguage: jest.fn(),
}));

jest.mock("@/lib/two-pq-server", () => ({
  getTwoPQFormDraft: jest.fn(),
  getTwoPQFormsPage: jest.fn(),
}));

const adminContext: AdminContextRecord = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

describe("2PQ forms page actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAdminContextServer).mockResolvedValue(adminContext);
    jest.mocked(getServerAppLanguage).mockResolvedValue("es");
    jest.mocked(getTwoPQFormDraft).mockResolvedValue(null);
    jest.mocked(getTwoPQFormsPage).mockResolvedValue({
      forms: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("shows the ordered creation workflow above the stored forms", async () => {
    render(
      await TwoPQFormsPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Completá los formularios en este orden",
      }),
    ).toBeInTheDocument();

    const workflow = screen
      .getByRole("heading", { name: "Completá los formularios en este orden" })
      .closest("section");
    expect(workflow).not.toBeNull();
    expect(
      within(workflow as HTMLElement).getByRole("link", {
        name: "Completar formulario de solicitud de estudio",
      }),
    ).toHaveAttribute("href", "/2pq-dashboard/forms/study-request/new");
    expect(
      within(workflow as HTMLElement).getByRole("link", {
        name: "Completar formulario de muestras (biopsias)",
      }),
    ).toHaveAttribute("href", "/2pq-dashboard/forms/sample/new");
    expect(
      within(workflow as HTMLElement).getByRole("link", {
        name: "Completar formulario de solicitud de retiro",
      }),
    ).toHaveAttribute("href", "/2pq-dashboard/forms/withdrawal-request/new");
  });

  it("keeps unavailable actions visible and gray for laboratory staff", async () => {
    jest.mocked(getAdminContextServer).mockResolvedValue({
      ...adminContext,
      role: "institution_laboratory_staff",
      institutionId: "institution-1",
    });

    render(await TwoPQFormsPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("button", {
        name: "Completar formulario de solicitud de estudio",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", {
        name: "Completar formulario de muestras (biopsias)",
      }),
    ).toHaveAttribute("href", "/2pq-dashboard/forms/sample/new");
    expect(
      screen.getByRole("button", {
        name: "Completar formulario de solicitud de retiro",
      }),
    ).toBeDisabled();
  });
});
