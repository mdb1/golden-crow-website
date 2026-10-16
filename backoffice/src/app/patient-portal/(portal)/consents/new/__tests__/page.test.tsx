/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import PatientPortalNewConsentPage from "@/app/patient-portal/(portal)/consents/new/page";
import { sdkFetchServer } from "@/lib/sdk-server";

const mockPatientConsentUploadWizard = jest.fn(
  (props: Record<string, unknown>) => (
    <div data-testid="consent-wizard" data-props={JSON.stringify(props)} />
  ),
);

jest.mock("@/components/patient-consent-upload-wizard", () => ({
  PatientConsentUploadWizard: (props: Record<string, unknown>) =>
    mockPatientConsentUploadWizard(props),
}));

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: jest.fn(),
}));

const account = {
  auth: { displayName: "Nombre Auth" },
  profile: { fullName: "Ada Paciente" },
  role: { patientName: "Ada Perfil" },
};

const draft = {
  id: "patient-uid",
  collectionKey: "2pq-informed-consent-drafts" as const,
  schemaVersion: 1 as const,
  surface: "patient-portal" as const,
  mode: "guided" as const,
  activeStepId: "data" as const,
  revision: 2,
  state: {},
  createdAt: "2026-10-16T11:00:00.000Z",
  updatedAt: "2026-10-16T12:00:00.000Z",
};

describe("patient portal new consent page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === "/auth/my-account") return { account };
      if (path === "/2pq/informed-consents/draft/status") {
        return { draft: null };
      }
      throw new Error(`Unexpected SDK path: ${path}`);
    });
  });

  it("uses only the lightweight draft revision during a fresh start", async () => {
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === "/auth/my-account") return { account };
      if (path === "/2pq/informed-consents/draft/status") {
        return {
          draft: {
            mode: "guided",
            activeStepId: "data",
            updatedAt: "2026-10-16T12:00:00.000Z",
            revision: 8,
          },
        };
      }
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    render(
      await PatientPortalNewConsentPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(sdkFetchServer).toHaveBeenCalledTimes(2);
    expect(sdkFetchServer).toHaveBeenCalledWith("/auth/my-account");
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/2pq/informed-consents/draft/status",
    );
    expect(sdkFetchServer).not.toHaveBeenCalledWith(
      "/2pq/informed-consents/draft",
    );
    expect(mockPatientConsentUploadWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPatientName: "Ada Perfil",
        initialDraft: null,
        initialDraftRevision: 8,
      }),
    );
  });

  it.each(["1", "true", "yes", ["YES"]])(
    "restores the full draft only for an explicit %p query",
    async (draftParam) => {
      jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
        if (path === "/auth/my-account") return { account };
        if (path === "/2pq/informed-consents/draft") return { draft };
        throw new Error(`Unexpected SDK path: ${path}`);
      });

      render(
        await PatientPortalNewConsentPage({
          searchParams: Promise.resolve({ draft: draftParam }),
        }),
      );

      expect(sdkFetchServer).toHaveBeenCalledWith(
        "/2pq/informed-consents/draft",
      );
      expect(mockPatientConsentUploadWizard).toHaveBeenCalledWith(
        expect.objectContaining({
          initialDraft: draft,
          initialDraftRevision: draft.revision,
        }),
      );
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );

  it("explains when the requested draft no longer exists and leaves fresh start available", async () => {
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === "/auth/my-account") return { account };
      if (path === "/2pq/informed-consents/draft") return { draft: null };
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    render(
      await PatientPortalNewConsentPage({
        searchParams: Promise.resolve({ draft: "1" }),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "El borrador que intentó retomar ya no existe.",
    );
    expect(screen.getByTestId("consent-wizard")).toBeInTheDocument();
    expect(mockPatientConsentUploadWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        initialDraft: null,
        initialDraftRevision: null,
      }),
    );
  });

  it("blocks restore when only the lightweight draft status can load", async () => {
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === "/auth/my-account") return { account };
      if (path === "/2pq/informed-consents/draft") {
        throw new Error("draft unavailable");
      }
      if (path === "/2pq/informed-consents/draft/status") {
        return {
          draft: {
            mode: "guided",
            activeStepId: "data",
            updatedAt: "2026-10-16T12:00:00.000Z",
            revision: 9,
          },
        };
      }
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    render(
      await PatientPortalNewConsentPage({
        searchParams: Promise.resolve({ draft: "1" }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pudimos verificar que el borrador sigue existiendo, pero no recuperar su contenido completo.",
    );
    expect(screen.queryByTestId("consent-wizard")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reintentar" })).toHaveAttribute(
      "href",
      "/patient-portal/consents/new?draft=1",
    );
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/2pq/informed-consents/draft/status",
    );
  });

  it("blocks an unsafe fresh start when both draft lookups fail", async () => {
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === "/auth/my-account") return { account };
      if (
        path === "/2pq/informed-consents/draft" ||
        path === "/2pq/informed-consents/draft/status"
      ) {
        throw new Error("draft unavailable");
      }
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    render(
      await PatientPortalNewConsentPage({
        searchParams: Promise.resolve({ draft: "1" }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tampoco pudimos verificar su última revisión.",
    );
    expect(screen.queryByTestId("consent-wizard")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reintentar" })).toHaveAttribute(
      "href",
      "/patient-portal/consents/new?draft=1",
    );
    expect(
      screen.getByRole("link", { name: "Volver a consentimientos" }),
    ).toHaveAttribute("href", "/patient-portal/consents");
  });
});
