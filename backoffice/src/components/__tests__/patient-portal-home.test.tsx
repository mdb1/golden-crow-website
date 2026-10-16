/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import PatientPortalHomePage from "@/app/patient-portal/(portal)/home/page";
import type { InformedConsentPatientHomeStatus } from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: jest.fn(),
}));

const HOME_STATUS_PATH = "/2pq/informed-consents/home-status";

function mockHomeStatus(status: InformedConsentPatientHomeStatus) {
  jest.mocked(sdkFetchServer).mockResolvedValue(status);
}

describe("PatientPortalHomePage", () => {
  beforeEach(() => {
    jest.mocked(sdkFetchServer).mockReset();
  });

  it("offers the guided signing flow when there is no draft or signed consent", async () => {
    mockHomeStatus({ hasDraft: false, hasSignedConsent: false });

    render(await PatientPortalHomePage());

    expect(sdkFetchServer).toHaveBeenCalledTimes(1);
    expect(sdkFetchServer).toHaveBeenCalledWith(HOME_STATUS_PATH);
    expect(
      screen.getByRole("heading", {
        name: "Firmar consentimiento informado",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "Firmar consentimiento informado. Comenzar firma",
        })
        .getAttribute("href"),
    ).toBe("/patient-portal/consents/new");
    expect(
      screen
        .getByRole("link", { name: "Mi cuenta. Abrir mi cuenta" })
        .getAttribute("href"),
    ).toBe("/patient-portal/my-account");

    const consentLink = screen.getByRole("link", {
      name: "Firmar consentimiento informado. Comenzar firma",
    });
    const accountLink = screen.getByRole("link", {
      name: "Mi cuenta. Abrir mi cuenta",
    });
    expect(consentLink.className).toContain("border-violet-200/80");
    expect(accountLink.className).toContain("bg-card/90");
    expect(screen.getByText("Comenzar firma").className).toContain(
      "bg-violet-600",
    );
    expect(
      screen.getByRole("heading", {
        name: "Firmar consentimiento informado",
      }).className,
    ).toContain("sm:text-2xl");
  });

  it("opens the signed consent list when no draft remains", async () => {
    mockHomeStatus({ hasDraft: false, hasSignedConsent: true });

    render(await PatientPortalHomePage());

    expect(
      screen.getByRole("heading", {
        name: "Ver consentimientos informados ya firmados",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "Ver consentimientos informados ya firmados. Ver consentimientos",
        })
        .getAttribute("href"),
    ).toBe("/patient-portal/consents");
    expect(sdkFetchServer).toHaveBeenCalledTimes(1);
    expect(sdkFetchServer).toHaveBeenCalledWith(HOME_STATUS_PATH);
  });

  it("prioritizes resuming a draft even when an older consent was signed", async () => {
    mockHomeStatus({ hasDraft: true, hasSignedConsent: true });

    render(await PatientPortalHomePage());

    expect(
      screen.getByRole("heading", {
        name: "Continuar firma de consentimiento informado",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "Continuar firma de consentimiento informado. Continuar desde borrador",
        })
        .getAttribute("href"),
    ).toBe("/patient-portal/consents/new?draft=1");
    expect(
      screen.queryByRole("heading", {
        name: "Ver consentimientos informados ya firmados",
      }),
    ).toBeNull();
    expect(sdkFetchServer).toHaveBeenCalledTimes(1);
    expect(sdkFetchServer).toHaveBeenCalledWith(HOME_STATUS_PATH);
  });

  it("falls back to the consent hub without guessing status when lookup fails", async () => {
    jest
      .mocked(sdkFetchServer)
      .mockRejectedValue(new Error("home status unavailable"));

    render(await PatientPortalHomePage());

    expect(
      screen.getByRole("heading", {
        name: "Gestionar consentimientos informados",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "Gestionar consentimientos informados. Abrir consentimientos",
        })
        .getAttribute("href"),
    ).toBe("/patient-portal/consents");
    expect(
      screen.queryByRole("link", {
        name: "Firmar consentimiento informado. Comenzar firma",
      }),
    ).toBeNull();
    expect(sdkFetchServer).toHaveBeenCalledTimes(1);
    expect(sdkFetchServer).toHaveBeenCalledWith(HOME_STATUS_PATH);
  });
});
