/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverOrganizationWorkbench } from "@/components/discover/organization-workbench";
import { sdkFetch } from "@/lib/sdk-client";
import type { DiscoverOrganizationRecord } from "@/lib/discover";

const routerPush = jest.fn();
const routerRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const organization: DiscoverOrganizationRecord = {
  id: "org-1",
  name: "Publisher One",
  imageUrl: "https://example.org/publisher.png",
  status: "active",
  slug: "publisher-one",
  websiteUrl: "https://example.org",
  description: "Descripción pública",
  description_en: "Public description",
  countryCode: "US",
  organizationType:
    "org_patient_advocacy_organizations,org_genetics_research_institutes",
  color_hex: "#123ABC",
  verified: true,
  contactEmail: "hello@example.org",
  internalNotes: "Internal notes",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

function renderWorkbench() {
  render(
    <AppLanguageProvider initialLanguage="en">
      <DiscoverOrganizationWorkbench organization={organization} />
    </AppLanguageProvider>,
  );
}

describe("DiscoverOrganizationWorkbench accent color", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    jest.mocked(sdkFetch).mockResolvedValue({ organization });
  });

  it("keeps the hex input read-only until a valid manual color is applied", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    const colorInput = screen.getByLabelText("Accent color") as HTMLInputElement;
    expect(colorInput.value).toBe("#123ABC");
    expect(colorInput.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /set manually/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /set manually/i }));
    expect(colorInput.readOnly).toBe(false);
    expect(screen.getByRole("button", { name: /apply/i })).toBeTruthy();

    await user.clear(colorInput);
    await user.type(colorInput, "#12");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(
      screen.getByText("Organization color must be a 6-digit hex value."),
    ).toBeTruthy();
    expect(colorInput.value).toBe("#12");
    expect(colorInput.readOnly).toBe(false);

    await user.clear(colorInput);
    await user.type(colorInput, "abcdef");
    expect(
      screen.queryByText("Organization color must be a 6-digit hex value."),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(colorInput.value).toBe("#ABCDEF");
    expect(colorInput.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /set manually/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/organizations/org-1", {
        method: "PUT",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;
    expect(body.color_hex).toBe("#ABCDEF");
  });

  it("applies color picker changes without enabling text editing", () => {
    renderWorkbench();

    const picker = screen.getByLabelText("Accent color picker");
    const colorInput = screen.getByLabelText("Accent color") as HTMLInputElement;

    expect(picker.className).toContain("rounded-full");
    expect(picker.className).toContain("size-10");

    fireEvent.change(picker, { target: { value: "#445566" } });

    expect(colorInput.value).toBe("#445566");
    expect(colorInput.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /set manually/i })).toBeTruthy();
  });

  it("keeps organization actions at the bottom without the publisher sync button", () => {
    renderWorkbench();

    expect(
      screen.queryByRole("button", { name: "Sync publisher snapshot" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("saves multiple organization categories as comma-separated canonical keys", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: /2 categories selected/i }));
    expect(screen.queryByText("org_medical_societies")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Medical Societies" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/organizations/org-1", {
        method: "PUT",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;
    expect(body.organizationType).toBe(
      "org_patient_advocacy_organizations,org_genetics_research_institutes,org_medical_societies",
    );
  });

  it("saves multiple country coverage selections as comma-separated country codes", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: /choose countries/i }));
    await user.click(screen.getByRole("checkbox", { name: "Argentina (AR)" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/organizations/org-1", {
        method: "PUT",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;
    expect(body.countryCode).toBe("US,AR");
  });
});

describe("DiscoverOrganizationWorkbench localized description", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    jest.mocked(sdkFetch).mockResolvedValue({ organization });
  });

  it("edits Spanish and English descriptions separately", async () => {
    const user = userEvent.setup();
    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverOrganizationWorkbench
          organization={{ ...organization, description_en: "" }}
        />
      </AppLanguageProvider>,
    );

    const description = screen.getByLabelText(
      "Description",
    ) as HTMLTextAreaElement;
    expect(description.value).toBe("Descripción pública");
    expect(
      screen.getByText(
        "Add an English organization description to reach a broader audience.",
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "English" }));
    const englishDescription = screen.getByLabelText(
      "Description",
    ) as HTMLTextAreaElement;
    expect(englishDescription.value).toBe("");

    await user.type(englishDescription, "Public English description");
    expect(
      screen.queryByText(
        "Add an English organization description to reach a broader audience.",
      ),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Spanish" }));
    expect(
      (screen.getByLabelText("Description") as HTMLTextAreaElement).value,
    ).toBe("Descripción pública");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/organizations/org-1", {
        method: "PUT",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;
    expect(body.description).toBe("Descripción pública");
    expect(body.description_en).toBe("Public English description");
  });
});
