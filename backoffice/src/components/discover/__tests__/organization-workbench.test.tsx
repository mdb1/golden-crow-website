/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  DiscoverIndividualWorkbench,
  DiscoverOrganizationWorkbench,
} from "@/components/discover/organization-workbench";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  DiscoverIndividualRecord,
  DiscoverOrganizationRecord,
} from "@/lib/discover";

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
  social: {
    facebook: "https://facebook.com/publisher-one",
  },
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

const individual: DiscoverIndividualRecord = {
  id: "individual-1",
  name: "Individual One",
  imageUrl: "https://example.org/individual.png",
  status: "active",
  slug: "individual-one",
  websiteUrl: "https://example.org/individual",
  description: "Descripción individual",
  description_en: "Individual description",
  countryCode: "AR",
  individualType: "pro_clinical_geneticists,pro_physicians",
  color_hex: "#123ABC",
  verified: true,
  contactEmail: "individual@example.org",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

function renderWorkbench(initialLanguage: "en" | "es" = "en") {
  render(
    <AppLanguageProvider
      initialLanguage={initialLanguage}
      forcedLanguage={initialLanguage}
    >
      <DiscoverOrganizationWorkbench organization={organization} />
    </AppLanguageProvider>,
  );
}

function renderIndividualWorkbench(initialLanguage: "en" | "es" = "en") {
  render(
    <AppLanguageProvider
      initialLanguage={initialLanguage}
      forcedLanguage={initialLanguage}
    >
      <DiscoverIndividualWorkbench individual={individual} />
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

  it("does not render the internal notes block", () => {
    renderWorkbench("es");

    expect(screen.queryByLabelText("Notas internas")).toBeNull();
    expect(screen.queryByLabelText("Internal notes")).toBeNull();
  });

  it("saves multiple organization categories as comma-separated canonical keys", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: /2 categories selected/i }));
    expect(screen.queryByText("org_medical_societies")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Medical Society" }));
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

  it("keeps the category picker on a full-width form row", () => {
    renderWorkbench();

    const categoryButton = screen.getByRole("button", {
      name: /2 categories selected/i,
    });

    expect(categoryButton.parentElement?.className).toContain("md:col-span-2");
  });

  it("keeps the country coverage picker on a full-width form row", () => {
    renderWorkbench();

    expect(screen.getByText("Country coverage").parentElement?.className).toContain(
      "md:col-span-2",
    );
  });

  it("shows publisher categories translated in Spanish", async () => {
    const user = userEvent.setup();
    renderWorkbench("es");

    expect(
      screen.getAllByText("Organización de apoyo a pacientes").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Instituto de investigación genética").length,
    ).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: /2 opciones seleccionadas/i }),
    );

    expect(screen.getByText("Sociedad médica")).toBeTruthy();
    expect(screen.getByText("Proveedor de farmacogenómica")).toBeTruthy();
    expect(screen.queryByText("Medical Societies")).toBeNull();
    expect(screen.queryByText("Proveedores de farmacogenómica")).toBeNull();
  });

  it("shows individual publisher categories as singular person labels", async () => {
    const user = userEvent.setup();
    renderIndividualWorkbench("es");

    await user.click(
      screen.getByRole("button", { name: /2 opciones seleccionadas/i }),
    );

    expect(screen.getAllByText("Genetista clínico").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Médico").length).toBeGreaterThan(0);
    expect(screen.queryByText("Genetistas clínicos")).toBeNull();
    expect(screen.queryByText("Médicos")).toBeNull();
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

  it("requires an image URL before saving", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.clear(screen.getByLabelText("Image URL"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("Image URL is required.")).toBeTruthy();
    expect(sdkFetch).not.toHaveBeenCalled();
  });

  it("adds social network links as a nested social object", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    expect(screen.getByDisplayValue("https://facebook.com/publisher-one")).toBeTruthy();
    expect(screen.queryByLabelText("Social network")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add social link" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /LinkedIn profile/i }));
    await user.type(
      screen.getByRole("textbox", { name: "LinkedIn profile" }),
      "https://linkedin.com/in/publisher-one",
    );
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
    expect(body.social).toEqual({
      facebook: "https://facebook.com/publisher-one",
      linkedin: "https://linkedin.com/in/publisher-one",
    });
  });

  it("offers all supported social platforms in the picker", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    expect(screen.getByDisplayValue("https://facebook.com/publisher-one")).toBeTruthy();
    expect(
      document.querySelector(
        'img[src="/discover/social-network-assets/facebook.png"]',
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add social link" }));

    [
      "X / Twitter profile",
      "Instagram profile",
      "TikTok profile",
      "YouTube channel",
      "LinkedIn profile",
      "WhatsApp",
      "Telegram",
      "Threads profile",
      "Pinterest profile",
      "Snapchat profile",
      "Reddit profile",
      "Discord server",
      "Twitch channel",
      "Bluesky profile",
      "Mastodon profile",
      "Contact email",
      "Other link",
    ].forEach((label) => {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeTruthy();
    });

    [
      "x-twitter",
      "instagram",
      "tiktok",
      "youtube",
      "linkedin",
      "whatsapp",
      "telegram",
      "threads",
      "pinterest",
      "snapchat",
      "reddit",
      "discord",
      "twitch",
      "bluesky",
      "mastodon",
      "email",
      "other-link",
    ].forEach((assetName) => {
      expect(
        document.querySelector(
          `img[src="/discover/social-network-assets/${assetName}.png"]`,
        ),
      ).toBeTruthy();
    });
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
