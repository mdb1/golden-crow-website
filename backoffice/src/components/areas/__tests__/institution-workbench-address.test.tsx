/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { InstitutionWorkbench } from "@/components/areas/institution-workbench";
import type { AdminContextRecord } from "@/lib/admin-areas";
import { sdkFetch } from "@/lib/sdk-client";

const push = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

jest.mock("@/components/header-unclutter", () => ({
  HeaderUnclutterButton: () => null,
}));

const context: AdminContextRecord = {
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

function renderCreateWorkbench() {
  return render(
    <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
      <AdminContextProvider value={context}>
        <InstitutionWorkbench mode="create" />
      </AdminContextProvider>
    </AppLanguageProvider>,
  );
}

describe("InstitutionWorkbench PGFlex address", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the constrained PGFlex address fields and persists their canonical keys", async () => {
    const user = userEvent.setup();
    (sdkFetch as jest.Mock).mockResolvedValue({
      institution: { id: "INST-00001" },
    });

    renderCreateWorkbench();

    expect(screen.getByText("Institution address")).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toHaveAttribute("minlength", "3");
    expect(screen.getByLabelText("Neighborhood / Locality")).toHaveAttribute(
      "minlength",
      "3",
    );
    expect(screen.getByLabelText("Province / District")).toHaveTextContent(
      "Capital Federal",
    );
    expect(screen.getByLabelText("Country")).toHaveValue("Argentina");
    expect(screen.getByLabelText("Country")).toBeDisabled();

    await user.type(screen.getByLabelText("Institution name"), "Clinic North");
    await user.click(
      screen.getByRole("button", { name: "Create institution" }),
    );

    expect(
      await screen.findAllByText(
        "Address and neighborhood/locality must each have at least 3 characters.",
      ),
    ).not.toHaveLength(0);
    expect(sdkFetch).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Address"), "Av. Corrientes, 123");
    await user.type(
      screen.getByLabelText("Neighborhood / Locality"),
      "Almagro",
    );
    await user.click(
      screen.getByRole("button", { name: "Create institution" }),
    );

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/areas/institutions", {
        method: "POST",
        body: JSON.stringify({
          code: "",
          name: "Clinic North",
          legalName: "",
          contactEmail: "",
          contactPhone: "",
          address: "Av. Corrientes 123",
          city: "Almagro",
          state: "Capital Federal",
          country: "Argentina",
          notes: "",
        }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/areas/institutions/INST-00001");
  });
});
