/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    getDiscoverOrganizationCountryGroups: () => [
      {
        key: "recommended",
        label: "Recommended countries",
        options: [{ code: "AR", label: "Argentina (AR)" }],
      },
    ],
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
  isGrcHighlighted: false,
  contactEmail: "hello@example.org",
  internalNotes: "",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

function makeFeedItem(
  overrides: Partial<DiscoverFeedItemRecord> = {},
): DiscoverFeedItemRecord {
  return {
    id: "feed-item",
    publisherOrganizationId: "org-1",
    publisherIndividualId: null,
    publisherSnapshot: { name: "Publisher One", imageUrl: null },
    type: "news",
    publishedAt: null,
    showInDiscoverFeed: false,
    language: "en",
    title: "Feed entry",
    subtitle: "Entry summary",
    body: "Entry body",
    htmlBody: null,
    imageUrl: null,
    sourceUrl: null,
    sourceButtonText: null,
    status: "draft",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    news: { category: "", region: "" },
    ...overrides,
  } satisfies DiscoverFeedItemRecord;
}

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
    expect(specificTypeSection?.className).toContain("rounded-2xl");
    expect(specificTypeSection?.className).toContain("border-violet-100/80");

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
    expect(body.showInDiscoverFeed).toBe(false);
  });

  it("saves the shared Discover feed visibility checkbox at the root", async () => {
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
    fireEvent.click(
      screen.getByRole("checkbox", { name: /show in discover feed/i }),
    );
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

    expect(body.showInDiscoverFeed).toBe(true);
  });

  it("keeps draft navigation inside the publisher portal route base", async () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
          routeBase="/publisher-portal/discover/feed-entries"
        />
      </AppLanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText("Publisher"), {
      target: { value: "organization:org-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith(
        "/publisher-portal/discover/feed-entries/feed-1",
      );
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

  it("saves pasted raw HTML as htmlBody and sends a null plain body", async () => {
    const rawHtml = [
      "<p>",
      "  Un espacio para profesionales de la salud que buscan fortalecer su practica",
      "  clinica incorporando <strong>IA clinicamente validada</strong>.",
      "</p>",
      "",
      "<h2>Novedades que se presentaran</h2>",
      "",
      "<ul>",
      "  <li>Carga de varios sintomas en un mismo idioma con IA via HPO/SNOMED CT.</li>",
      "  <li>Priorizacion de patologias.</li>",
      "  <li>Generacion de panel de genes.</li>",
      "  <li>Reportes descargables.</li>",
      "</ul>",
    ].join("\n");

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
    fireEvent.click(screen.getByRole("button", { name: "HTML raw" }));
    fireEvent.change(screen.getByLabelText("HTML raw"), {
      target: { value: rawHtml },
    });

    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.htmlBody).toBe(rawHtml);
    expect(body.body).toBeNull();
  });

  it("keeps raw HTML intact when moving between raw and rich text views", () => {
    const rawHtml = [
      "<h2>Novedades que se presentaran</h2>",
      "<ul>",
      "  <li>Carga de varios sintomas.</li>",
      "  <li>Priorizacion de patologias.</li>",
      "</ul>",
      "<hr>",
      "<blockquote>Diagnostico claro.</blockquote>",
    ].join("\n");

    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "HTML raw" }));
    fireEvent.change(screen.getByLabelText("HTML raw"), {
      target: { value: rawHtml },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rich text" }));

    expect(screen.getByLabelText("Block style")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ordered list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Task list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Divider" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Align center" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add table" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear formatting" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "HTML raw" }));

    expect((screen.getByLabelText("HTML raw") as HTMLTextAreaElement).value).toBe(
      rawHtml,
    );
  });

  it("does not clear htmlBody when switching to simple text", async () => {
    const rawHtml = "<p><strong>HTML independiente</strong></p><hr><ul><li>Uno</li></ul>";
    const simpleBody = "Fallback simple independiente";
    const { container } = render(
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
    fireEvent.click(screen.getByRole("button", { name: "HTML raw" }));
    fireEvent.change(screen.getByLabelText("HTML raw"), {
      target: { value: rawHtml },
    });
    fireEvent.click(screen.getByRole("button", { name: "Simple text" }));
    fireEvent.change(container.querySelector("#discover-feed-body")!, {
      target: { value: simpleBody },
    });
    fireEvent.click(screen.getByRole("button", { name: "HTML raw" }));

    expect((screen.getByLabelText("HTML raw") as HTMLTextAreaElement).value).toBe(
      rawHtml,
    );

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

    expect(body.htmlBody).toBe(rawHtml);
    expect(body.body).toBeNull();
  });

  it("saves rich text HTML with a null plain body", async () => {
    const htmlBody = "<p><strong>Rich body</strong></p><ul><li>One</li></ul>";
    const feedItem = {
      id: "feed-rich-body",
      publisherOrganizationId: "org-1",
      publisherIndividualId: null,
      publisherSnapshot: { name: "Publisher One", imageUrl: null },
      type: "news",
      publishedAt: null,
      showInDiscoverFeed: false,
      language: "en",
      title: "Rich entry",
      subtitle: "Formatted entry",
      body: "Old plain fallback",
      htmlBody,
      imageUrl: null,
      sourceUrl: null,
      sourceButtonText: null,
      status: "draft",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      news: { category: "", region: "" },
    } satisfies DiscoverFeedItemRecord;

    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="edit"
          feedItem={feedItem}
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    expect(screen.getByRole("button", { name: "Rich text" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/discover/feed-items/feed-rich-body",
        {
          method: "PUT",
          body: expect.any(String),
        },
      );
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.htmlBody).toBe(htmlBody);
    expect(body.body).toBeNull();
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
        /Usá una URL de imagen o subí un archivo PNG, JPG o WebP\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Tamaño recomendado: 1024 x 500 px, calidad alta/),
    ).toBeTruthy();
    expect(screen.getByLabelText("URL de imagen")).toBeTruthy();
    expect(screen.getByLabelText("Subir imagen")).toBeTruthy();

    const exampleLink = screen.getByRole("link", { name: "See example" });
    expect(exampleLink.getAttribute("href")).toBe(
      "https://goldencrowvs.com/pocket-genes/banner.png",
    );
  });

  it("preserves an uploaded cover image as the shared feed item image source", async () => {
    const feedItem = {
      id: "feed-upload",
      publisherOrganizationId: "org-1",
      publisherIndividualId: null,
      publisherSnapshot: { name: "Publisher One", imageUrl: null },
      type: "news",
      publishedAt: null,
      showInDiscoverFeed: false,
      language: "en",
      title: "Uploaded cover",
      subtitle: "Entry summary",
      body: "Entry body",
      htmlBody: null,
      imageUrl: null,
      imageUploadDataUrl: "data:image/png;base64,cover-image",
      imageUploadName: "cover.png",
      imageUploadMimeType: "image/png",
      sourceUrl: null,
      sourceButtonText: null,
      status: "draft",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      news: { category: "", region: "" },
    } satisfies DiscoverFeedItemRecord;

    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="edit"
          feedItem={feedItem}
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    expect(screen.getByText("Using uploaded image")).toBeTruthy();
    expect(screen.queryByLabelText("Image URL")).toBeNull();
    expect(screen.getByText("cover.png · image/png")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items/feed-upload", {
        method: "PUT",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.imageUrl).toBeNull();
    expect(body.imageUploadDataUrl).toBe("data:image/png;base64,cover-image");
    expect(body.imageUploadName).toBe("cover.png");
    expect(body.imageUploadMimeType).toBe("image/png");
  });

  it("defaults the entry language to Spanish when the page language is Spanish and the item has no language", async () => {
    const feedItem = {
      id: "feed-no-language",
      publisherOrganizationId: "org-1",
      publisherIndividualId: null,
      publisherSnapshot: { name: "Publisher One", imageUrl: null },
      type: "news",
      publishedAt: null,
      showInDiscoverFeed: false,
      title: "Sin idioma",
      subtitle: "Resumen",
      body: "Cuerpo",
      htmlBody: null,
      imageUrl: null,
      sourceUrl: null,
      sourceButtonText: null,
      status: "draft",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      news: { category: "", region: "" },
    } satisfies DiscoverFeedItemRecord;

    render(
      <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
        <DiscoverFeedEntryWorkbench
          mode="edit"
          feedItem={feedItem}
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    expect((screen.getByLabelText("Idioma") as HTMLSelectElement).value).toBe(
      "es",
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/discover/feed-items/feed-no-language",
        {
          method: "PUT",
          body: expect.any(String),
        },
      );
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.language).toBe("es");
  });

  it("keeps published out of manual status until first publish and publishes from edit action", async () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="edit"
          feedItem={makeFeedItem({ id: "feed-draft" })}
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    expect(screen.getByText("Publication state")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(
      screen.getByText(
        "Drafts stay private while you keep polishing the content. They do not appear in Discover.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("First published: Not published yet")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Change status" }));
    const draftDialog = screen.getByRole("alertdialog");
    expect(
      within(draftDialog).queryByRole("radio", { name: /Published/ }),
    ).toBeNull();
    expect(within(draftDialog).getByRole("radio", { name: /Draft/ })).toBeTruthy();
    fireEvent.click(within(draftDialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Publish to Discover" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items/feed-draft", {
        method: "PUT",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.status).toBe("published");
    expect(typeof body.publishedAt).toBe("string");
    expect(Number.isNaN(Date.parse(body.publishedAt as string))).toBe(false);
  });

  it("saves manual status changes without updating the first published date", async () => {
    const firstPublishedAt = "2026-08-05T10:00:00.000Z";

    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="edit"
          feedItem={makeFeedItem({
            id: "feed-published",
            status: "published",
            publishedAt: firstPublishedAt,
          })}
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    expect(screen.getByText("Live")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change status" }));
    const statusDialog = screen.getByRole("alertdialog");
    expect(
      within(statusDialog).getByRole("radio", { name: /Published/ }),
    ).toBeTruthy();

    fireEvent.click(within(statusDialog).getByRole("radio", { name: /Archived/ }));
    fireEvent.click(within(statusDialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/discover/feed-items/feed-published",
        {
          method: "PUT",
          body: expect.any(String),
        },
      );
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.status).toBe("archived");
    expect(body.publishedAt).toBe(firstPublishedAt);
  });

  it("republishes previously published entries without changing publishedAt", async () => {
    const firstPublishedAt = "2026-08-05T10:00:00.000Z";

    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="edit"
          feedItem={makeFeedItem({
            id: "feed-archived",
            status: "archived",
            publishedAt: firstPublishedAt,
          })}
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish to Discover" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items/feed-archived", {
        method: "PUT",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.status).toBe("published");
    expect(body.publishedAt).toBe(firstPublishedAt);
  });

  it("loads legacy upcoming_event payloads and saves them as upcomingEvent", async () => {
    const feedItem = {
      id: "feed-legacy-event",
      publisherOrganizationId: "org-1",
      publisherIndividualId: null,
      publisherSnapshot: { name: "Publisher One", imageUrl: null },
      type: "upcoming_event",
      publishedAt: "2026-09-01T00:00:00.000Z",
      language: "en",
      title: "Legacy event",
      subtitle: "Event summary",
      body: "Event body",
      htmlBody: null,
      imageUrl: null,
      sourceUrl: "https://example.org/event",
      sourceButtonText: "Register now",
      status: "published",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      upcomingEvent: {
        date: null,
        location: "",
        maxAttendance: null,
      },
      upcoming_event: {
        date: "2026-10-12T00:00:00.000Z",
        location: "Online",
        maxAttendance: 100,
      },
    } as unknown as DiscoverFeedItemRecord;

    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="edit"
          feedItem={feedItem}
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    expect((screen.getByLabelText("Event date *") as HTMLInputElement).value).toBe(
      "2026-10-12",
    );
    fireEvent.change(screen.getByLabelText("Location *"), {
      target: { value: "Online event" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/discover/feed-items/feed-legacy-event",
        {
          method: "PUT",
          body: expect.any(String),
        },
      );
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.type).toBe("upcoming_event");
    expect(body.upcomingEvent).toMatchObject({
      date: "2026-10-12T00:00:00.000Z",
      location: "Online event",
      maxAttendance: 100,
    });
    expect(body.upcoming_event).toBeUndefined();
  });

  it("loads legacy non-event payload nodes and saves them with camelCase keys", async () => {
    const feedItem = {
      id: "feed-legacy-trial",
      publisherOrganizationId: "org-1",
      publisherIndividualId: null,
      publisherSnapshot: { name: "Publisher One", imageUrl: null },
      type: "clinical_trial",
      publishedAt: null,
      language: "en",
      title: "Legacy trial",
      subtitle: "Trial summary",
      body: "Trial body",
      htmlBody: null,
      imageUrl: null,
      sourceUrl: "https://example.org/trial",
      sourceButtonText: "Review trial",
      status: "draft",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      clinicalTrial: {
        trialIdentifier: "",
        phase: "",
        recruitmentStatus: "",
        conditions: [],
        countries: [],
        sponsor: "",
      },
      clinical_trial: {
        trialIdentifier: "NCT00000000",
        phase: "Phase 2",
        recruitmentStatus: "Recruiting",
        conditions: ["Pompe disease"],
        countries: ["AR"],
        sponsor: "Legacy sponsor",
      },
    } as unknown as DiscoverFeedItemRecord;

    render(
      <AppLanguageProvider initialLanguage="en">
        <DiscoverFeedEntryWorkbench
          mode="edit"
          feedItem={feedItem}
          initialOrganizations={[organization]}
          initialOrganizationsNextCursor={null}
        />
      </AppLanguageProvider>,
    );

    expect((screen.getByLabelText("Trial identifier") as HTMLInputElement).value).toBe(
      "NCT00000000",
    );
    fireEvent.change(screen.getByLabelText("Sponsor"), {
      target: { value: "Updated sponsor" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/discover/feed-items/feed-legacy-trial",
        {
          method: "PUT",
          body: expect.any(String),
        },
      );
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;

    expect(body.type).toBe("clinical_trial");
    expect(body.clinicalTrial).toMatchObject({
      trialIdentifier: "NCT00000000",
      phase: "Phase 2",
      recruitmentStatus: "Recruiting",
      conditions: ["Pompe disease"],
      countries: ["AR"],
      sponsor: "Updated sponsor",
    });
    expect(body.clinical_trial).toBeUndefined();
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
    expect(body.clinicalTrial).toEqual({
      trialIdentifier: "NCT00000000",
      phase: "",
      recruitmentStatus: "",
      conditions: ["Pompe disease", "Glycogen storage disease"],
      countries: ["US", "AR"],
      sponsor: "",
    });
  });

  it("stores extended event-only fields from the rich event editor", async () => {
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
      target: { value: "upcoming_event" },
    });
    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "es" },
    });
    fireEvent.change(screen.getByLabelText("Main button link"), {
      target: { value: "https://example.org/main-event" },
    });

    expect(screen.getByText("Schedule display")).toBeTruthy();
    expect(
      screen.getByText(
        "The event date is required and sets the starting day for multi-day events.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Required block")).toBeNull();
    expect(screen.queryByText("Optional block")).toBeNull();
    expect(
      screen.getByText(
        "These are the essential fields for creating the event and setting its basic configuration.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("*: required field")).toBeTruthy();
    expect(screen.getByText("Advanced event configuration")).toBeTruthy();
    expect(screen.getByText("Optional")).toBeTruthy();
    expect(
      screen.queryByText("Advanced event configuration (optional)"),
    ).toBeNull();

    const eventDateInput = screen.getByLabelText("Event date *");
    expect(eventDateInput.getAttribute("type")).toBe("date");
    fireEvent.change(eventDateInput, {
      target: { value: "2026-10-12" },
    });
    fireEvent.change(screen.getByLabelText("Location *"), {
      target: { value: "Online" },
    });
    const maxAttendanceInput = screen.getByLabelText(
      "Max attendance",
    ) as HTMLInputElement;
    expect(maxAttendanceInput.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("No limit"));
    expect(maxAttendanceInput.disabled).toBe(false);
    fireEvent.change(maxAttendanceInput, {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByText("Schedule display"));
    fireEvent.change(screen.getByLabelText("Time display"), {
      target: { value: "timed" },
    });
    expect(screen.getByLabelText("Timezone")).toBeTruthy();
    const dailyStartHourSelect = screen.getByLabelText(
      "Daily start time",
    ) as HTMLSelectElement;
    const dailyStartMinuteSelect = screen.getByLabelText(
      "Daily start time minutes",
    ) as HTMLSelectElement;
    const dailyEndHourSelect = screen.getByLabelText(
      "Daily end time",
    ) as HTMLSelectElement;
    const dailyEndMinuteSelect = screen.getByLabelText(
      "Daily end time minutes",
    ) as HTMLSelectElement;
    expect(dailyStartHourSelect.tagName).toBe("SELECT");
    expect(dailyStartMinuteSelect.tagName).toBe("SELECT");
    expect(screen.queryByText("HH:mm")).toBeNull();
    fireEvent.change(dailyStartHourSelect, {
      target: { value: "09" },
    });
    fireEvent.change(dailyStartMinuteSelect, {
      target: { value: "30" },
    });
    fireEvent.change(dailyEndHourSelect, {
      target: { value: "17" },
    });
    fireEvent.change(dailyEndMinuteSelect, {
      target: { value: "45" },
    });
    expect(screen.getByText("Selected time: 09:30")).toBeTruthy();
    expect(screen.getByText("Selected time: 17:45")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Configure regional times" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Time display"), {
      target: { value: "regionalTimes" },
    });
    expect(screen.queryByLabelText("Timezone")).toBeNull();
    expect(screen.queryByLabelText("Daily start time")).toBeNull();
    expect(screen.queryByLabelText("Daily end time")).toBeNull();
    const multiDayLengthInput = screen.getByLabelText(
      "Multi-day length",
    ) as HTMLInputElement;
    expect(multiDayLengthInput.value).toBe("1");
    fireEvent.change(multiDayLengthInput, {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByText("Classification"));
    fireEvent.change(screen.getByLabelText("Event kind"), {
      target: { value: "conference" },
    });
    fireEvent.change(screen.getByLabelText("Attendance mode"), {
      target: { value: "online" },
    });
    const eventStatusSelect = screen.getByLabelText(
      "Event status",
    ) as HTMLSelectElement;
    expect(
      within(eventStatusSelect).getByRole("option", { name: "Normal" }),
    ).toBeTruthy();
    expect(
      within(eventStatusSelect).getByRole("option", {
        name: "Registration open - spots available",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Event status"), {
      target: { value: "available_slots" },
    });
    fireEvent.click(screen.getByText("Organizer and disclosure"));
    fireEvent.change(screen.getByLabelText("Publisher relationship"), {
      target: { value: "organizer" },
    });
    fireEvent.change(screen.getByLabelText("Organizer name"), {
      target: { value: "Golden Crow" },
    });
    fireEvent.change(screen.getByLabelText("Organizer notes"), {
      target: { value: "Organized by the publisher team." },
    });

    fireEvent.click(screen.getByText("Audience, cost, accessibility"));
    expect(screen.queryByText("Languages")).toBeNull();
    fireEvent.click(screen.getByLabelText("Patients"));
    fireEvent.change(screen.getByLabelText("Cost type"), {
      target: { value: "free" },
    });
    expect(screen.queryByLabelText("Currency")).toBeNull();
    expect(screen.queryByLabelText("Price")).toBeNull();
    fireEvent.change(screen.getByLabelText("Cost type"), {
      target: { value: "donation" },
    });
    expect(screen.queryByLabelText("Currency")).toBeNull();
    expect(screen.queryByLabelText("Price")).toBeNull();
    fireEvent.change(screen.getByLabelText("Cost type"), {
      target: { value: "paid" },
    });
    expect(screen.getByLabelText("Currency").tagName).toBe("SELECT");
    expect(screen.getByLabelText("Price")).toBeTruthy();
    expect(screen.queryByLabelText("Price in minor units")).toBeNull();
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "ARS" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "4000" },
    });
    fireEvent.change(screen.getByLabelText("Cost type"), {
      target: { value: "free" },
    });
    expect(screen.queryByLabelText("Currency")).toBeNull();
    expect(screen.queryByLabelText("Price")).toBeNull();
    fireEvent.click(screen.getByLabelText("Captions"));

    fireEvent.click(
      screen.getByRole("button", { name: "Configure regional times" }),
    );
    let dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add region" }));
    expect(
      within(dialog).getByRole("heading", { name: "New region" }),
    ).toBeTruthy();
    expect(within(dialog).getByLabelText("Country").tagName).toBe("SELECT");
    fireEvent.change(within(dialog).getByLabelText("Country"), {
      target: { value: "AR" },
    });
    const regionalStartHourSelect = within(dialog).getByLabelText(
      "Start time",
    ) as HTMLSelectElement;
    const regionalStartMinuteSelect = within(dialog).getByLabelText(
      "Start time minutes",
    ) as HTMLSelectElement;
    const regionalEndHourSelect = within(dialog).getByLabelText(
      "End time",
    ) as HTMLSelectElement;
    const regionalEndMinuteSelect = within(dialog).getByLabelText(
      "End time minutes",
    ) as HTMLSelectElement;
    expect(regionalStartHourSelect.tagName).toBe("SELECT");
    expect(regionalStartMinuteSelect.tagName).toBe("SELECT");
    expect(within(dialog).queryByText("HH:mm")).toBeNull();
    fireEvent.change(regionalStartHourSelect, {
      target: { value: "09" },
    });
    fireEvent.change(regionalStartMinuteSelect, {
      target: { value: "30" },
    });
    fireEvent.change(regionalEndHourSelect, {
      target: { value: "11" },
    });
    fireEvent.change(regionalEndMinuteSelect, {
      target: { value: "00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Timezone"), {
      target: { value: "America/Argentina/Buenos_Aires" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save region" }));
    expect(within(dialog).getAllByText("AR").length).toBeGreaterThan(0);
    expect(
      within(dialog).getByRole("button", { name: /Edit region: AR/i }),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(screen.getByText("Argentina (AR)")).toBeTruthy();
    expect(screen.getAllByText("09:30").length).toBeGreaterThan(0);
    expect(screen.queryByText(/regional rows configured/i)).toBeNull();
    const mainEventLinkNotice = screen.getByText("Main event link");
    const mainEventLinkDetails = mainEventLinkNotice.closest("details");
    expect(mainEventLinkDetails?.open).toBe(false);

    fireEvent.click(screen.getByText("Event actions"));
    expect(mainEventLinkDetails?.open).toBe(true);
    expect(
      screen.getByText(
        "The main button can stay as the primary event link. Optional actions can add more specific next steps.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Configure actions" }));
    dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add action" }));
    expect(
      within(dialog).getByRole("heading", { name: "New action" }),
    ).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Button URL"), {
      target: { value: "https://example.org/register" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save action" }));
    expect(within(dialog).getAllByText("Register").length).toBeGreaterThan(0);
    expect(
      within(dialog).getByRole("button", { name: /Edit action: Register/i }),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
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
    ) as Record<string, Record<string, unknown> | string>;
    const payload = body.upcomingEvent as Record<string, unknown>;

    expect(body.type).toBe("upcoming_event");
    expect(payload).toMatchObject({
      location: "Online",
      maxAttendance: 250,
      timeKind: "regionalTimes",
      multiDayLength: 2,
      regionalStartTimes: { AR: "09:30" },
      regionalEndTimes: { AR: "11:00" },
      regionalTimezones: { AR: "America/Argentina/Buenos_Aires" },
      eventKind: "conference",
      attendanceMode: "online",
      eventStatus: "available_slots",
      publisherRelationshipToEvent: "organizer",
      organizerName: "Golden Crow",
      publisherDisclosure: "Organized by the publisher team.",
      audience: ["patients"],
      costType: "free",
      languages: ["es"],
      accessibilityFeatures: ["captions"],
      actionButtons: [
        {
          type: "register",
          title: "Register",
          url: "https://example.org/register",
        },
      ],
    });
    expect(payload).not.toHaveProperty("currency");
    expect(payload).not.toHaveProperty("priceMinorUnits");
    expect(payload).not.toHaveProperty("timezone");
    expect(payload).not.toHaveProperty("dailyStartTime");
    expect(payload).not.toHaveProperty("dailyEndTime");
    expect(payload.date).toBe("2026-10-12T00:00:00.000Z");
  }, 15000);

  it("hides organizer fields and saves them as null when publisher relationship is not specified", async () => {
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
      target: { value: "upcoming_event" },
    });
    fireEvent.change(screen.getByLabelText("Event date *"), {
      target: { value: "2026-10-12" },
    });
    fireEvent.change(screen.getByLabelText("Location *"), {
      target: { value: "Online" },
    });

    fireEvent.click(screen.getByText("Organizer and disclosure"));
    const publisherRelationshipSelect = screen.getByLabelText(
      "Publisher relationship",
    );

    expect(screen.queryByLabelText("Organizer name")).toBeNull();
    expect(screen.queryByLabelText("Organizer notes")).toBeNull();

    fireEvent.change(publisherRelationshipSelect, {
      target: { value: "organizer" },
    });
    fireEvent.change(screen.getByLabelText("Organizer name"), {
      target: { value: "Golden Crow" },
    });
    fireEvent.change(screen.getByLabelText("Organizer notes"), {
      target: { value: "Organized by the publisher team." },
    });

    fireEvent.change(publisherRelationshipSelect, {
      target: { value: "" },
    });

    expect(screen.queryByLabelText("Organizer name")).toBeNull();
    expect(screen.queryByLabelText("Organizer notes")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, Record<string, unknown> | string>;
    const payload = body.upcomingEvent as Record<string, unknown>;

    expect(payload.publisherRelationshipToEvent).toBeUndefined();
    expect(payload.organizerName).toBeNull();
    expect(payload.publisherDisclosure).toBeNull();
  });

  it("saves null max attendance and previews it as no limit", async () => {
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
      target: { value: "upcoming_event" },
    });
    fireEvent.change(screen.getByLabelText("Event date *"), {
      target: { value: "2026-10-12" },
    });
    fireEvent.change(screen.getByLabelText("Location *"), {
      target: { value: "Online" },
    });

    const maxAttendanceInput = screen.getByLabelText(
      "Max attendance",
    ) as HTMLInputElement;
    expect(maxAttendanceInput.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("No limit"));
    expect(maxAttendanceInput.disabled).toBe(false);
    fireEvent.change(maxAttendanceInput, {
      target: { value: "75" },
    });
    expect(maxAttendanceInput.value).toBe("75");

    fireEvent.click(screen.getByLabelText("No limit"));
    expect(maxAttendanceInput.value).toBe("");
    expect(maxAttendanceInput.disabled).toBe(true);
    expect(screen.getAllByText("No limit").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, Record<string, unknown> | string>;
    const payload = body.upcomingEvent as Record<string, unknown>;

    expect(payload.maxAttendance).toBeNull();
  });

  it("requires complete valid fields before saving a regional event time row", async () => {
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
      target: { value: "upcoming_event" },
    });
    fireEvent.click(screen.getByText("Schedule display"));
    fireEvent.change(screen.getByLabelText("Time display"), {
      target: { value: "regionalTimes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Configure regional times" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add region" }));

    const saveRegionButton = within(dialog).getByRole("button", {
      name: "Save region",
    }) as HTMLButtonElement;
    expect(saveRegionButton.disabled).toBe(true);
    expect(within(dialog).getByText("Country is required.")).toBeTruthy();
    expect(within(dialog).getByText("Start time is required.")).toBeTruthy();
    expect(within(dialog).getByText("End time is required.")).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Country"), {
      target: { value: "AR" },
    });
    fireEvent.change(within(dialog).getByLabelText("Start time"), {
      target: { value: "09" },
    });
    fireEvent.change(within(dialog).getByLabelText("Start time minutes"), {
      target: { value: "30" },
    });
    expect(saveRegionButton.disabled).toBe(true);
    expect(within(dialog).getByText("End time is required.")).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("End time"), {
      target: { value: "11" },
    });
    expect(saveRegionButton.disabled).toBe(true);
    expect(within(dialog).getByText("Choose a valid time.")).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("End time minutes"), {
      target: { value: "00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Timezone"), {
      target: { value: "" },
    });
    expect(saveRegionButton.disabled).toBe(true);
    expect(within(dialog).getByText("Timezone is required.")).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Timezone"), {
      target: { value: "America/Argentina/Buenos_Aires" },
    });
    expect(saveRegionButton.disabled).toBe(false);

    fireEvent.click(saveRegionButton);
    expect(within(dialog).getByRole("button", { name: /Edit region: AR/i })).toBeTruthy();
  });

  it("saves daily event times as normalized 24-hour values", async () => {
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
      target: { value: "upcoming_event" },
    });
    fireEvent.change(screen.getByLabelText("Event date *"), {
      target: { value: "2026-10-12" },
    });
    fireEvent.change(screen.getByLabelText("Location *"), {
      target: { value: "Online" },
    });
    fireEvent.click(screen.getByText("Schedule display"));
    fireEvent.change(screen.getByLabelText("Time display"), {
      target: { value: "timed" },
    });

    const dailyStartHourSelect = screen.getByLabelText(
      "Daily start time",
    ) as HTMLSelectElement;
    const dailyStartMinuteSelect = screen.getByLabelText(
      "Daily start time minutes",
    ) as HTMLSelectElement;
    const dailyEndHourSelect = screen.getByLabelText(
      "Daily end time",
    ) as HTMLSelectElement;
    const dailyEndMinuteSelect = screen.getByLabelText(
      "Daily end time minutes",
    ) as HTMLSelectElement;

    fireEvent.change(dailyStartHourSelect, {
      target: { value: "09" },
    });
    fireEvent.change(dailyStartMinuteSelect, {
      target: { value: "30" },
    });
    fireEvent.change(dailyEndHourSelect, {
      target: { value: "17" },
    });
    fireEvent.change(dailyEndMinuteSelect, {
      target: { value: "45" },
    });

    expect(screen.getByText("Selected time: 09:30")).toBeTruthy();
    expect(screen.getByText("Selected time: 17:45")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, Record<string, unknown> | string>;
    const payload = body.upcomingEvent as Record<string, unknown>;

    expect(payload.dailyStartTime).toBe("09:30");
    expect(payload.dailyEndTime).toBe("17:45");
  });

  it("defaults event multi-day length to one when schedule duration is shown", async () => {
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
      target: { value: "upcoming_event" },
    });
    fireEvent.click(screen.getByText("Schedule display"));
    fireEvent.change(screen.getByLabelText("Time display"), {
      target: { value: "timed" },
    });

    expect((screen.getByLabelText("Multi-day length") as HTMLInputElement).value).toBe(
      "1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, Record<string, unknown> | string>;

    expect(body.upcomingEvent).toMatchObject({
      timeKind: "timed",
      multiDayLength: 1,
    });
  });

  it("publishes an upcoming event when the visible date field is filled", async () => {
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
      target: { value: "upcoming_event" },
    });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Published event" },
    });
    fireEvent.change(screen.getByLabelText("Subtitle"), {
      target: { value: "A complete event summary." },
    });
    fireEvent.change(
      document.querySelector("#discover-feed-body") as HTMLTextAreaElement,
      {
        target: { value: "Complete event body." },
      },
    );
    fireEvent.change(screen.getByLabelText("Event date *"), {
      target: { value: "2026-10-12" },
    });
    fireEvent.change(screen.getByLabelText("Location *"), {
      target: { value: "Online" },
    });
    fireEvent.click(screen.getByText("Schedule display"));
    fireEvent.change(screen.getByLabelText("Time display"), {
      target: { value: "regionalTimes" },
    });
    fireEvent.change(screen.getByLabelText("Multi-day length"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Time display"), {
      target: { value: "dateOnly" },
    });
    expect(screen.queryByLabelText("Multi-day length")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Publish to Discover" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/feed-items", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, Record<string, unknown> | string>;

    expect(body.type).toBe("upcoming_event");
    expect(body.upcomingEvent).toMatchObject({
      date: "2026-10-12T00:00:00.000Z",
      timeKind: "dateOnly",
    });
    expect(body.upcomingEvent).not.toHaveProperty("multiDayLength");
    expect(body.upcoming_event).toBeUndefined();
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
