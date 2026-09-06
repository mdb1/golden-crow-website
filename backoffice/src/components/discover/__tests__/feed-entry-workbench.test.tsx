/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverFeedEntryWorkbench } from "@/components/discover/feed-entry-workbench";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  DiscoverFeedItemRecord,
  DiscoverOrganizationRecord,
} from "@/lib/discover";
import { DISCOVER_FEED_TYPES } from "@/lib/discover";

const routerPush = jest.fn();
const routerRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh,
  }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

jest.mock("@/lib/discover-organization-fields", () => {
  const actual = jest.requireActual("@/lib/discover-organization-fields");

  return {
    ...actual,
    getDiscoverRegionCountryGroups: () => [
      {
        key: "recommended",
        label: "Recommended countries",
        options: [
          { regionCode: "ARG", label: "Argentina (ARG)" },
          { regionCode: "ESP", label: "Spain (ESP)" },
          { regionCode: "ENG", label: "England (ENG)" },
        ],
      },
    ],
  };
});

const organization: DiscoverOrganizationRecord = {
  id: "org-1",
  name: "Publisher One",
  imageUrl: null,
  status: "active",
  slug: "publisher-one",
  websiteUrl: "https://example.org",
  description: "Descripción pública",
  descriptionEn: "Public description",
  countryCode: "AR",
  organizationType:
    "org_patient_advocacy_organizations,org_genetics_research_institutes",
  colorHex: "#123ABC",
  verified: true,
  isGeneticReportProvider: false,
  geneticReportCategory: null,
  contactEmail: "hello@example.org",
  internalNotes: "",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

describe("DiscoverFeedEntryWorkbench region picker", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    jest.mocked(sdkFetch).mockResolvedValue({
      feedItem: {
        id: "feed-1",
      } as DiscoverFeedItemRecord,
    });
  });

  it("stores selected news regions as comma-separated three-letter codes", async () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    expect(screen.getByRole("heading", { name: "Preview" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Publisher"), {
      target: { value: "organization:org-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /choose countries/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Argentina (ARG)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Spain (ESP)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "England (ENG)" }));

    expect((screen.getByLabelText("Region") as HTMLInputElement).value).toBe(
      "ARG, ESP, ENG",
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect((screen.getByLabelText("Region") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("checkbox", { name: "Argentina (ARG)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Spain (ESP)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "England (ENG)" }));

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    const specificTypeSection = screen
      .getByText("Specific type fields")
      .closest("section");
    expect(specificTypeSection?.className).toContain("rounded-md");
    expect(specificTypeSection?.className).toContain("border-sky-200/70");

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.news).toEqual({
      category: "",
      region: "ARG, ESP, ENG",
    });
  });

  it("stores the note main button link and text as root fields", async () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText("Publisher"), {
      target: { value: "organization:org-1" },
    });
    fireEvent.change(screen.getByLabelText("Main button link"), {
      target: { value: "https://example.org/register" },
    });
    fireEvent.change(screen.getByLabelText("Main button text"), {
      target: { value: "Open organizer website" },
    });

    const bodyTitle = screen.getByText("Write the note");
    const mainButtonTitle = screen.getByText("Main note button customization");
    expect(
      bodyTitle.compareDocumentPosition(mainButtonTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Open organizer website"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.sourceUrl).toBe("https://example.org/register");
    expect(body.sourceButtonText).toBe("Open organizer website");
  });

  it("shows cover image URL guidance and an example link", () => {
    render(
      <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    expect(
      screen.getByText(
        /Usá una imagen pública HTTPS en PNG, JPG, JPEG o WebP\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Tamaño recomendado: 1024 x 500 px, hasta 1 MB/),
    ).toBeTruthy();

    const exampleLink = screen.getByRole("link", { name: "See example" });
    expect(exampleLink.getAttribute("href")).toBe(
      "https://goldencrowvs.com/pocket-genes/banner.png",
    );
  });

  it("offers every Discover feed type in the type picker", () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    const typePicker = screen.getByLabelText("Type") as HTMLSelectElement;
    expect([...typePicker.options].map((option) => option.value)).toEqual(
      DISCOVER_FEED_TYPES,
    );
  });

  it("stores a new clinical trial type with typed payload arrays", async () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText("Publisher"), {
      target: { value: "organization:org-1" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "clinical_trial" },
    });
    fireEvent.change(screen.getByLabelText("Trial identifier"), {
      target: { value: "NCT00000000" },
    });
    fireEvent.change(screen.getByLabelText("Conditions"), {
      target: { value: "Pompe disease\nGlycogen storage disease" },
    });
    fireEvent.change(screen.getByLabelText("Countries"), {
      target: { value: "US, AR" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.type).toBe("clinical_trial");
    expect(body.clinical_trial).toEqual({
      trialIdentifier: "NCT00000000",
      phase: "",
      recruitmentStatus: "",
      conditions: ["Pompe disease", "Glycogen storage disease"],
      countries: ["US", "AR"],
      sponsor: "",
    });
  });

  it("shows the public app link after a successful publish with no unsaved changes", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      feedItem: {
        id: "czSoZHYDbliMmxOrMLsx",
      } as DiscoverFeedItemRecord,
    });

    render(
      <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText("Publicador"), {
      target: { value: "organization:org-1" },
    });
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Nueva publicación" },
    });
    fireEvent.change(screen.getByLabelText("Subtítulo"), {
      target: { value: "Resumen de la publicación" },
    });
    fireEvent.change(
      document.querySelector("#discover-feed-body") as HTMLTextAreaElement,
      {
        target: { value: "Contenido completo de la publicación." },
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Publicar en Discover" }));

    expect(await screen.findByText("Publicado en Discover")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    const publicAppLink = await screen.findByRole("link", {
      name: "Ver publicación en la app",
    });
    expect(publicAppLink.getAttribute("href")).toBe(
      "https://goldencrowvs.com/pocket-genes/discover/feed_entries?id=czSoZHYDbliMmxOrMLsx",
    );
    expect(screen.getByText("Sin cambios sin guardar")).toBeTruthy();
  });

  it("dismisses publish validation errors with OK without leaving the page", async () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish to Discover" }));

    expect(await screen.findByText("Publish needs attention")).toBeTruthy();
    expect(
      screen.getByText(
        "Publishing stopped. Review the highlighted requirement and try again.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(screen.queryByText("Publish needs attention")).toBeNull();
    });
    expect(routerPush).not.toHaveBeenCalled();
  });
});
