/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  SupportServicesBrowser,
  SupportServiceOfferWorkbench,
  SupportServiceTransactionWorkbench,
  WizardMoreInformationReview,
} from "@/components/god-mode/support-services-workbench";
import {
  POCKET_GENES_SERVICE_OPTIONS,
  normalizePocketGenesCatalogFormShape,
  normalizePocketGenesCatalogMoreInformation,
} from "@/lib/pocket-genes-service-catalog";
import {
  SUPPORT_SERVICE_CATEGORIES,
  supportServiceCategoryDescription,
} from "@/lib/support-service-categories";
import { appText } from "@/lib/language";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import type {
  SupportServiceLinkedReportRecord,
  SupportServiceOfferRecord,
  SupportServiceTransactionRecord,
} from "@/lib/support-services";

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
  SdkRequestError: class SdkRequestError extends Error {
    details: string;

    constructor(input?: string | { message?: string; details?: string }) {
      super(typeof input === "object" ? input.message : input);
      this.details = typeof input === "object" ? (input.details ?? "") : "";
    }
  },
}));

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

const hiddenOffer: SupportServiceOfferRecord = {
  id: "offer-hidden",
  schemaVersion: 1,
  serviceId: "pgs_frozen_lab_1",
  serviceVersion: 1,
  name: "Frozen lab service",
  serviceCategory: "sot_genomic_report_generation",
  providerKind: "organization",
  providerId: "provider-frozen",
  providerName: "Frozen Lab",
  stages: ["test_planning"],
  status: "active",
  isHiddenFromSearch: true,
  isHighlightedOffer: false,
  isProfessionalOffer: true,
  description: "Requester-facing description.",
  shortContract: "form:Form -> report:PDF report",
  providerWork: "Provider-side work.",
  inputSlots: [],
  outputSlots: [
    {
      role: "report",
      objectType: "pgo_pdf_report",
      mutationMode: "new_object",
    },
  ],
  acceptedConditions: [],
  scopeRules: [],
  commercialTerms: {
    pricingModel: "calculated_after_submission",
    price: { summary: "Calculated after submission" },
    turnaround: "1d",
  },
  normalizedName: "frozen lab service",
};

const completeMoreInformation = {
  frequentQuestions: [
    {
      question: "How should I prepare?",
      answer: "Follow the instructions sent by the provider.",
    },
  ],
  keyInsights: [
    {
      title: "Actionable results",
      description: "The service focuses on findings that can guide care.",
    },
  ],
  scientificFacts: [
    {
      title: "Validated workflow",
      description: "The analysis follows a documented scientific workflow.",
    },
  ],
  usefulLinks: [
    { title: "Preparation guide", url: "https://example.org/preparation" },
  ],
  sampleLink: {
    title: "Example report",
    description: "Review an example of the delivered result.",
    buttonTitle: "View example",
    url: "https://example.org/sample-report",
  },
  bulletSegments: [
    {
      title: "Clear delivery",
      description: "Results are organized for practical review.",
      imageUrl: "https://example.org/images/delivery.png",
    },
  ],
  technicalInformationFacts: [
    {
      title: "Pipeline",
      description: "Quality-controlled processing and interpretation.",
      subitems: ["Quality control", "Expert review"],
    },
  ],
  biologicalSampleRequirements: [
    {
      title: "Blood sample",
      description: "A whole-blood sample is accepted.",
      instructions: "Use the collection kit supplied by the provider.",
    },
  ],
  websiteUrl: "https://example.org/services/report",
};

const frozenOfferSnapshot = {
  offerId: "offer-frozen",
  schemaVersion: 1,
  serviceId: "pgs_frozen_lab_1",
  serviceVersion: 1,
  name: "Accepted frozen service",
  providerId: "provider-frozen",
  providerKind: "organization" as const,
  providerName: "Frozen Lab",
  shortContract: "form:Form -> result:PDF report",
  formShape: {
    id: "pgfs_frozen_lab_1",
    version: 2,
    allowUnknownFields: false,
    fields: [
      {
        key: "contact_email",
        label: "Contact email",
        type: "email" as const,
        required: true,
        helpInfoText: "Use the requester contact address.",
      },
      {
        key: "sample_times",
        label: "Sample times",
        type: "integer_list" as const,
        required: false,
      },
    ],
  },
  inputSlots: [
    {
      role: "form",
      objectType: "pgo_form",
      acceptedTypes: ["pgo_form"],
      required: true,
      cardinality: { min: 1, max: 1 },
    },
  ],
  outputSlots: [
    {
      role: "result",
      objectType: "pgo_pdf_report",
      mutationMode: "new_object" as const,
    },
  ],
};

const deliveredTransaction: SupportServiceTransactionRecord = {
  id: "pgr_frozen_1",
  name: "Frozen service transaction",
  schemaVersion: 1,
  requestId: "pgr_frozen_1",
  offerId: "offer-frozen",
  serviceId: "pgs_frozen_lab_1",
  serviceVersion: 1,
  providerId: "provider-frozen",
  providerKind: "organization",
  requestedByUserId: "user-requester",
  requestedByUserEmail: "requester@example.org",
  requestedAt: "2026-09-20T12:00:00.000Z",
  requestedAtClient: "2026-09-20T11:59:59.000Z",
  status: "delivered",
  requestRevision: 3,
  idempotencyKey: "ios-pgr_frozen_1",
  inputs: [
    {
      role: "form",
      objectRef: { objectId: "obj_form_1", revision: 2 },
      objectType: "pgo_form",
      objectSnapshot: {
        objectId: "obj_form_1",
        objectType: "pgo_form",
        revision: 2,
        immutablePayload: { answer: "preserve me" },
      },
      objectCode: "123456789",
      uploadedObjectId: "uploaded-form-1",
      fileStorageId: "file-form-1",
      objectOwnerId: "owner-form-1",
    },
  ],
  outputObjects: [
    {
      role: "result",
      objectType: "pgo_pdf_report",
      objectCode: "987654321",
    },
  ],
  outputReports: [{ reportCode: "ABC123" }],
  issues: [{ code: "provider_note", detail: "Keep this issue." }],
  missingRequiredInputRoles: [],
  offerSnapshot: frozenOfferSnapshot,
  providerSnapshot: {
    id: "provider-frozen",
    kind: "organization",
    name: "Frozen Lab",
    imageUrl: "https://example.org/frozen.png",
  },
  contractSource: "pocket_genes_services_wiki_v1",
  attachmentsPending: false,
  normalizedName: "pgr frozen 1",
  createdAt: "2026-09-20T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
};

const runningTransaction: SupportServiceTransactionRecord = {
  ...deliveredTransaction,
  id: "pgr_running_1",
  requestId: "pgr_running_1",
  status: "running",
  requestRevision: 2,
  outputObjects: [],
  outputReports: [],
  issues: [],
  normalizedName: "pgr running 1",
};

const currentLiveOffer: SupportServiceOfferRecord = {
  ...hiddenOffer,
  id: "offer-frozen",
  serviceVersion: 2,
  name: "Current changed service",
  shortContract: "live_input:DNA -> live_result:VCF",
  inputSlots: [
    {
      role: "live_input",
      objectType: "pgo_dna_sample",
      acceptedTypes: ["pgo_dna_sample"],
      required: true,
      cardinality: { min: 1, max: 1 },
    },
  ],
  outputSlots: [
    {
      role: "live_result",
      objectType: "pgo_unannotated_vcf",
      mutationMode: "new_object",
    },
  ],
};

function renderWithQueryClient(
  children: React.ReactNode,
  language: "en" | "es" = "en",
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider initialLanguage={language} forcedLanguage={language}>
        {children}
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

async function acknowledgeExistingOfferContract(
  language: "en" | "es" = "en",
) {
  const title =
    language === "es"
      ? "Los contratos de las transacciones existentes siguen vigentes"
      : "Existing transaction contracts remain binding";
  const checkboxName =
    language === "es"
      ? /Reconozco que cada transacción existente debe completarse/
      : /I acknowledge that every existing transaction must be completed/;
  const confirmName =
    language === "es" ? "Reconocer y guardar" : "Acknowledge and save";
  const dialog = await screen.findByRole("alertdialog", { name: title });
  const confirm = within(dialog).getByRole("button", { name: confirmName });

  expect(
    sdkFetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
  ).toBe(false);
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(
    within(dialog).getByRole("checkbox", { name: checkboxName }),
  );
  expect((confirm as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(confirm);
}

describe("support services workbenches", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    sdkFetchMock.mockReset();
    window.localStorage.clear();
  });

  it("translates both output object source choices with their product labels", () => {
    expect(appText("es", "Continue with download URL")).toBe(
      "Continuar con url de descarga",
    );
    expect(appText("es", "Continue with file ID")).toBe(
      "Continuar con file id",
    );
    expect(appText("es", "Continue with new file")).toBe(
      "Continuar con nuevo file",
    );
  });

  it("shows every more-information field in the wizard contract preview", () => {
    const uploadedImageDataUrl = "data:image/png;base64,cHJldmlldw==";
    renderWithQueryClient(
      <WizardMoreInformationReview
        information={{
          ...completeMoreInformation,
          bulletSegments: [
            ...completeMoreInformation.bulletSegments,
            {
              title: "Uploaded illustration",
              description: "An uploaded image is included in the preview.",
              imageUploadDataUrl: uploadedImageDataUrl,
            },
          ],
        }}
      />,
    );

    const review = screen.getByTestId(
      "service-offer-wizard-more-information-review",
    );
    for (const text of [
      "How should I prepare?",
      "Follow the instructions sent by the provider.",
      "Actionable results",
      "The service focuses on findings that can guide care.",
      "Validated workflow",
      "The analysis follows a documented scientific workflow.",
      "Preparation guide",
      "https://example.org/preparation",
      "Example report",
      "Review an example of the delivered result.",
      "View example",
      "https://example.org/sample-report",
      "Clear delivery",
      "Results are organized for practical review.",
      "Uploaded illustration",
      "An uploaded image is included in the preview.",
      "Pipeline",
      "Quality-controlled processing and interpretation.",
      "Quality control",
      "Expert review",
      "Blood sample",
      "A whole-blood sample is accepted.",
      "Use the collection kit supplied by the provider.",
      "https://example.org/services/report",
    ]) {
      expect(within(review).getByText(text)).toBeTruthy();
    }

    expect(
      within(review)
        .getByRole("img", { name: "Clear delivery" })
        .getAttribute("src"),
    ).toBe("https://example.org/images/delivery.png");
    expect(
      within(review)
        .getByRole("img", { name: "Uploaded illustration" })
        .getAttribute("src"),
    ).toBe(uploadedImageDataUrl);
  });

  it("uses service limitations terminology and keeps Wet lab in Spanish", () => {
    expect(appText("es", "Service limitations")).toBe(
      "Limitaciones del servicio",
    );
    expect(appText("es", "One service limitation per line")).toBe(
      "Una limitación del servicio por línea",
    );
    expect(
      appText(
        "es",
        "Describe the processing scope and the quality requirements for client-provided information. If data, documents, or samples are incomplete or do not meet the required standards, the procedure's feasibility and the quality, accuracy, or scope of its results may be affected. This section is optional; add one limitation per line when applicable.",
      ),
    ).toBe(
      "Describí el alcance del procesamiento y los requisitos de calidad que debe cumplir la información provista por el cliente. Si los datos, la documentación o las muestras están incompletos o no alcanzan los estándares requeridos, la viabilidad del procedimiento y la calidad, precisión o alcance de sus resultados pueden verse condicionados. Esta sección es opcional; agregá una limitación por línea cuando corresponda.",
    );
    expect(appText("es", "Wet lab")).toBe("Wet lab");
  });

  it("shows transaction list load failures instead of a false empty state", async () => {
    sdkFetchMock.mockRejectedValue(
      new SdkRequestError({
        status: 500,
        method: "GET",
        path: "/admin/support-services/transactions?limit=20",
        message: "Internal Server Error",
        details:
          "Request: GET /admin/support-services/transactions?limit=20\n\nStatus: 500 Internal Server Error\n\nResponse JSON:\n{\"error\":\"Stored transaction is invalid.\"}",
      }),
    );

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="transactions"
        routeBase="/publisher-portal/service-transactions"
        canCreate={false}
        canDelete={false}
        publisherPresentation
      />,
    );

    expect(await screen.findByText("Could not load records.")).toBeTruthy();
    expect(screen.getByText("Internal Server Error")).toBeTruthy();
    expect(screen.queryByText("No records found.")).toBeNull();
    expect(
      screen.queryByTestId("publisher-portal-empty-state"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show log" }));

    expect(await screen.findByText("Request log")).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes(
          "Request: GET /admin/support-services/transactions?limit=20",
        ),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes("Status: 500 Internal Server Error"),
      ),
    ).toBeTruthy();
  });

  it("shows remediation warnings without blocking the transaction detail", async () => {
    const transactionWithWarnings: SupportServiceTransactionRecord = {
      ...runningTransaction,
      complianceWarnings: [
        "outputObjects: Output object snapshot 1 must be an object.",
      ],
    };
    sdkFetchMock.mockImplementation(async (path) => {
      if (
        String(path).endsWith(
          `/transactions/${transactionWithWarnings.requestId}`,
        )
      ) {
        return { transaction: transactionWithWarnings };
      }
      if (
        String(path).endsWith(
          `/offers/${transactionWithWarnings.offerId}`,
        )
      ) {
        return { offer: currentLiveOffer };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={transactionWithWarnings.requestId}
      />,
    );

    expect(await screen.findByText("Transaction requires remediation")).toBeTruthy();
    expect(
      screen.getByText(
        "This root transaction remains visible in Support Services even when historical data is not fully compliant. Correct editable data where possible. Frozen snapshots stay read-only and do not block unrelated saves.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "outputObjects: Output object snapshot 1 must be an object.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Accepted frozen service")).toBeTruthy();
  });

  it("marks noncompliant transactions in the god-mode list", async () => {
    sdkFetchMock.mockResolvedValue({
      transactions: [
        {
          ...runningTransaction,
          complianceWarnings: ["offerSnapshot is missing or malformed."],
        },
      ],
      nextCursor: undefined,
    });

    renderWithQueryClient(<SupportServicesBrowser kind="transactions" />);

    expect(await screen.findByText("1 compliance warnings")).toBeTruthy();
    expect(screen.getByText(runningTransaction.requestId)).toBeTruthy();
    expect(screen.queryByText("No records found.")).toBeNull();
  });

  it("marks noncompliant offers in the god-mode list", async () => {
    sdkFetchMock.mockResolvedValue({
      offers: [
        {
          ...hiddenOffer,
          complianceWarnings: ["updatedAt is missing or invalid."],
        },
      ],
      nextCursor: undefined,
    });

    renderWithQueryClient(<SupportServicesBrowser kind="offers" />);

    expect(await screen.findByText("1 compliance warnings")).toBeTruthy();
    expect(screen.getByText(hiddenOffer.name)).toBeTruthy();
    expect(screen.queryByText("No records found.")).toBeNull();
  });

  it("uses publisher routes and removes transaction creation and deletion actions", async () => {
    sdkFetchMock.mockResolvedValue({
      transactions: [runningTransaction],
      nextCursor: undefined,
    });

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="transactions"
        routeBase="/publisher-portal/service-transactions"
        canCreate={false}
        canDelete={false}
        publisherPresentation
        displayTitle="Service Requests"
        recordColumnLabel="Service Request"
      />,
    );

    expect(await screen.findByText(runningTransaction.requestId)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Service Requests" })).toBeTruthy();
    expect(screen.getByTestId("publisher-support-service-list")).toBeTruthy();
    expect(screen.queryByText("Alta de transaccion")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
      `/publisher-portal/service-transactions/${runningTransaction.requestId}`,
    );
  });

  it("loads publisher service requests with the service filter from the offer link", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      const url = new URL(String(path), "https://backoffice.example");
      expect(url.pathname).toBe("/admin/support-services/transactions");
      expect(url.searchParams.get("serviceId")).toBe(hiddenOffer.serviceId);
      return {
        transactions: [runningTransaction],
        nextCursor: undefined,
      };
    });

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="transactions"
        routeBase="/publisher-portal/service-transactions"
        canCreate={false}
        canDelete={false}
        publisherPresentation
        initialServiceIdFilter={hiddenOffer.serviceId}
      />,
    );

    expect(await screen.findByText(runningTransaction.requestId)).toBeTruthy();
    expect(
      (
        screen.getByPlaceholderText(
          "Filter by service ID",
        ) as HTMLInputElement
      ).value,
    ).toBe(hiddenOffer.serviceId);
    expect(sdkFetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a catalog-style empty state for publisher service requests", async () => {
    sdkFetchMock.mockResolvedValue({
      transactions: [],
      nextCursor: undefined,
    });

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="transactions"
        routeBase="/publisher-portal/service-transactions"
        canCreate={false}
        canDelete={false}
        publisherPresentation
        publisherEmptyActionHref="/publisher-portal/service-offers"
        displayTitle="Service Requests"
        recordColumnLabel="Service Request"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "No service requests yet" }),
    ).toBeTruthy();
    const emptyState = screen.getByTestId("publisher-portal-empty-state");
    expect(
      screen.getByText(
        "New requests will appear here when someone chooses one of your published services.",
      ),
    ).toBeTruthy();
    expect(
      within(emptyState)
        .getByRole("link", { name: "Review service offers" })
        .getAttribute("href"),
    ).toBe("/publisher-portal/service-offers");
    expect(screen.queryByText("No records found.")).toBeNull();
    expect(screen.queryByText("0 loaded")).toBeNull();
    expect(screen.queryByText("Alta de transaccion")).toBeNull();
  });

  it("shows one catalog-style creation action for an empty publisher offer list", async () => {
    sdkFetchMock.mockResolvedValue({
      offers: [],
      nextCursor: undefined,
    });

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="offers"
        routeBase="/publisher-portal/service-offers"
        canCreate
        canDelete={false}
        publisherPresentation
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "No service offers yet" }),
    ).toBeTruthy();
    const emptyState = screen.getByTestId("publisher-portal-empty-state");
    expect(
      screen.getByText(
        "Create your first service offer so people can discover and request what you provide.",
      ),
    ).toBeTruthy();
    expect(
      within(emptyState)
        .getByRole("link", { name: "Create your first service offer" })
        .getAttribute("href"),
    ).toBe("/publisher-portal/service-offers/new");
    expect(
      screen.getAllByRole("link", { name: "Create your first service offer" }),
    ).toHaveLength(1);
    expect(screen.queryByText("Alta de service offer")).toBeNull();
    expect(screen.queryByText("No records found.")).toBeNull();
    expect(screen.queryByText("0 loaded")).toBeNull();
  });

  it("does not expose offer creation from a read-only publisher empty state", async () => {
    sdkFetchMock.mockResolvedValue({
      offers: [],
      nextCursor: undefined,
    });

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="offers"
        routeBase="/publisher-portal/service-offers"
        canCreate={false}
        canDelete={false}
        publisherPresentation
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "No service offers yet" }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("publisher-portal-empty-state")).queryByRole(
        "link",
      ),
    ).toBeNull();
    expect(screen.queryByText("Alta de service offer")).toBeNull();
  });

  it("uses filter-specific publisher offer copy without an empty-state action", async () => {
    sdkFetchMock.mockResolvedValue({
      offers: [],
      nextCursor: undefined,
    });

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="offers"
        routeBase="/publisher-portal/service-offers"
        publisherPresentation
      />,
    );

    expect(await screen.findByText("No service offers yet")).toBeTruthy();
    fireEvent.change(
      screen.getByPlaceholderText("Search by ID, provider, request, or name"),
      { target: { value: "not present" } },
    );

    expect(
      await screen.findByText("No service offers match your filters"),
    ).toBeTruthy();
    const emptyState = screen.getByTestId("publisher-portal-empty-state");
    expect(
      screen.getByText("Try changing or clearing your search and filters."),
    ).toBeTruthy();
    expect(within(emptyState).queryByRole("link")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Alta de service offer" })
        .getAttribute("href"),
    ).toBe("/publisher-portal/service-offers/new");
  });

  it("keeps the compact empty row in god mode", async () => {
    sdkFetchMock.mockResolvedValue({
      offers: [],
      nextCursor: undefined,
    });

    renderWithQueryClient(<SupportServicesBrowser kind="offers" />);

    expect(await screen.findByText("No records found.")).toBeTruthy();
    expect(
      screen.queryByTestId("publisher-portal-empty-state"),
    ).toBeNull();
  });

  it("shows publisher offers as useful open-only rows without the contract column", async () => {
    sdkFetchMock.mockResolvedValue({
      offers: [hiddenOffer],
      nextCursor: undefined,
    });

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="offers"
        routeBase="/publisher-portal/service-offers"
        canDelete
        publisherPresentation
      />,
    );

    expect(await screen.findByText(hiddenOffer.name)).toBeTruthy();
    expect(screen.getByText(hiddenOffer.description)).toBeTruthy();
    expect(screen.getByText("Genomic report generation")).toBeTruthy();
    expect(screen.queryByText("Contract")).toBeNull();
    expect(screen.queryByText(hiddenOffer.shortContract)).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
      `/publisher-portal/service-offers/${hiddenOffer.id}`,
    );
  });

  it("uses the service banner URL directly for its publisher thumbnail", async () => {
    const offerWithBannerUrl: SupportServiceOfferRecord = {
      ...hiddenOffer,
      id: "offer-with-banner-url",
      promotionalBannerImageUrl:
        "https://images.example.org/service-specific-banner.webp",
      promotionalBannerImageUploadDataUrl:
        "data:image/png;base64,U0hPVUxEX05PVF9XSU4=",
    };
    sdkFetchMock.mockResolvedValue({
      offers: [offerWithBannerUrl],
      nextCursor: undefined,
    });

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="offers"
        routeBase="/publisher-portal/service-offers"
        publisherPresentation
      />,
    );

    const banner = await screen.findByTestId(
      `service-offer-banner-image-${offerWithBannerUrl.id}`,
    );
    expect(banner.getAttribute("src")).toBe(
      offerWithBannerUrl.promotionalBannerImageUrl,
    );
    expect(
      sdkFetchMock.mock.calls.some(
        ([path]) =>
          String(path) ===
          `/admin/support-services/offers/${offerWithBannerUrl.id}`,
      ),
    ).toBe(false);
  });

  it("loads each upload-only service banner from its own authorized offer detail", async () => {
    const firstOffer: SupportServiceOfferRecord = {
      ...hiddenOffer,
      id: "offer-upload-one",
      name: "First uploaded banner service",
    };
    const secondOffer: SupportServiceOfferRecord = {
      ...hiddenOffer,
      id: "offer-upload-two",
      name: "Second uploaded banner service",
    };
    const firstBanner = "data:image/png;base64,RklSU1Q=";
    const secondBanner = "data:image/webp;base64,U0VDT05E";
    sdkFetchMock.mockImplementation(async (path) => {
      const value = String(path);
      if (value.startsWith("/admin/support-services/offers?")) {
        return {
          offers: [firstOffer, secondOffer],
          nextCursor: undefined,
        };
      }
      if (value === `/admin/support-services/offers/${firstOffer.id}`) {
        return {
          offer: {
            ...firstOffer,
            promotionalBannerImageUploadDataUrl: firstBanner,
          },
        };
      }
      if (value === `/admin/support-services/offers/${secondOffer.id}`) {
        return {
          offer: {
            ...secondOffer,
            promotionalBannerImageUploadDataUrl: secondBanner,
          },
        };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="offers"
        routeBase="/publisher-portal/service-offers"
        publisherPresentation
      />,
    );

    const firstImage = await screen.findByTestId(
      `service-offer-banner-image-${firstOffer.id}`,
    );
    const secondImage = await screen.findByTestId(
      `service-offer-banner-image-${secondOffer.id}`,
    );
    expect(firstImage.getAttribute("src")).toBe(firstBanner);
    expect(secondImage.getAttribute("src")).toBe(secondBanner);

    fireEvent.error(firstImage);

    expect(
      screen.getByTestId(`service-offer-banner-fallback-${firstOffer.id}`),
    ).toBeTruthy();
    expect(
      screen.getByTestId(`service-offer-banner-image-${secondOffer.id}`),
    ).toBeTruthy();
  });

  it("keeps the icon fallback when the service has no banner", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      const value = String(path);
      if (value.startsWith("/admin/support-services/offers?")) {
        return { offers: [hiddenOffer], nextCursor: undefined };
      }
      if (value === `/admin/support-services/offers/${hiddenOffer.id}`) {
        return { offer: hiddenOffer };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(
      <SupportServicesBrowser
        kind="offers"
        routeBase="/publisher-portal/service-offers"
        publisherPresentation
      />,
    );

    await waitFor(() => {
      expect(
        sdkFetchMock.mock.calls.some(
          ([path]) =>
            String(path) ===
            `/admin/support-services/offers/${hiddenOffer.id}`,
        ),
      ).toBe(true);
    });
    expect(
      screen.getByTestId(`service-offer-banner-fallback-${hiddenOffer.id}`),
    ).toBeTruthy();
    expect(
      screen.queryByTestId(`service-offer-banner-image-${hiddenOffer.id}`),
    ).toBeNull();
  });

  it("preselects and locks the organization provider for publisher offer creation", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      const serviceId = new URL(
        String(path),
        "https://backoffice.example",
      ).searchParams.get("serviceId");
      if (String(path).includes("service-id-availability")) {
        return { serviceId, available: true };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="create"
        routeBase="/publisher-portal/service-offers"
        fixedProvider={{
          kind: "organization",
          id: "publisher-org-1",
          name: "Publisher Org",
        }}
        canDelete={false}
      />,
    );

    expect(await screen.findByText("Publisher Org · publisher-org-1")).toBeTruthy();
    expect(screen.getByText("Organization")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Choose provider/i })).toBeNull();
    expect(screen.getAllByText("Read only").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByTestId("publisher-service-offer-editor-header"),
    ).toBeNull();
  });

  it("visually separates the publisher offer editor header from its identity section", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      if (
        String(path) ===
        `/admin/support-services/offers/${hiddenOffer.id}`
      ) {
        return { offer: hiddenOffer };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="edit"
        offerId={hiddenOffer.id}
        routeBase="/publisher-portal/service-offers"
        fixedProvider={{
          kind: "organization",
          id: "publisher-org-1",
          name: "Publisher Org",
        }}
        canDelete={false}
        publisherEditorPresentation
      />,
      "es",
    );

    const editorHeader = await screen.findByTestId(
      "publisher-service-offer-editor-header",
    );
    const editorTitle = within(editorHeader).getByRole("heading", {
      level: 2,
      name: "Editor de oferta",
    });
    const editorSubtitle = within(editorHeader).getByText(
      "Configuración comercial, operativa y de publicación",
    );
    const editorIcon = within(editorHeader).getByTestId(
      "publisher-service-offer-editor-header-icon",
    );
    expect(editorHeader.classList.contains("border-violet-200/80")).toBe(true);
    expect(editorHeader.classList.contains("text-violet-950")).toBe(true);
    expect(editorHeader.classList.contains("bg-slate-950")).toBe(false);
    expect(editorTitle.classList.contains("font-sans")).toBe(true);
    expect(editorTitle.classList.contains("font-bold")).toBe(true);
    expect(editorTitle.classList.contains("text-violet-950")).toBe(true);
    expect(editorSubtitle.classList.contains("font-mono")).toBe(true);
    expect(editorSubtitle.classList.contains("text-violet-700")).toBe(true);
    expect(editorIcon.classList.contains("bg-white/82")).toBe(true);
    expect(editorIcon.classList.contains("text-violet-700")).toBe(true);
    expect(
      editorIcon.querySelector("svg")?.classList.contains("lucide-pencil"),
    ).toBe(true);
    expect(
      within(editorHeader)
        .getByRole("button", { name: "Guardar cambios" })
        .classList.contains("bg-violet-600"),
    ).toBe(true);

    const identitySection = screen.getByTestId(
      "publisher-service-offer-identity-section",
    );
    const identityTitle = within(identitySection).getByRole("heading", {
      level: 3,
      name: "Datos principales del servicio",
    });
    expect(identityTitle.classList.contains("font-heading")).toBe(true);
    expect(identityTitle.classList.contains("text-sky-950")).toBe(true);
    expect(
      within(identitySection)
        .getByTestId("publisher-service-offer-identity-icon")
        .querySelector("svg")
        ?.classList.contains("lucide-fingerprint-pattern"),
    ).toBe(true);

    expect(screen.queryByText("Editar oferta de servicio")).toBeNull();
    expect(screen.queryByText("Contrato de servicio Pocket Genes")).toBeNull();
    expect(screen.queryByText("Identidad de la oferta")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Número de solicitudes activas" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Ver solicitudes activas" })
        .getAttribute("href"),
    ).toBe(
      `/publisher-portal/service-transactions?serviceId=${encodeURIComponent(hiddenOffer.serviceId)}`,
    );
  });

  it("preselects an individual provider and serializes its kind in the create payload", async () => {
    let createPayload: Record<string, unknown> | undefined;
    sdkFetchMock.mockImplementation(async (path, init) => {
      const value = String(path);
      if (value.includes("service-id-availability")) {
        const serviceId = new URL(
          value,
          "https://backoffice.example",
        ).searchParams.get("serviceId");
        return { serviceId, available: true };
      }
      if (
        value === "/admin/support-services/offers" &&
        init?.method === "POST"
      ) {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        createPayload = payload;
        return {
          offer: {
            ...hiddenOffer,
            ...payload,
            id: "offer-individual",
            acceptedConditions: payload.acceptedConditions ?? [],
            scopeRules: payload.scopeRules ?? [],
          },
        };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="create"
        routeBase="/publisher-portal/service-offers"
        fixedProvider={{
          kind: "individual",
          id: "publisher-individual-1",
          name: "Dr. Publisher",
        }}
        canDelete={false}
      />,
    );

    expect(
      await screen.findByText("Dr. Publisher · publisher-individual-1"),
    ).toBeTruthy();
    expect(screen.getByText("Professional individual")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Choose provider/i })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Prefill with mocked template" }),
    );
    const templateDialog = await screen.findByRole("dialog", {
      name: "Prefill with mocked template",
    });
    fireEvent.click(
      within(templateDialog).getAllByRole("button", {
        name: "Use template",
      })[0],
    );

    expect(await screen.findByText("Service ID is available.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(createPayload).toBeDefined());
    expect(createPayload).toEqual(
      expect.objectContaining({
        providerKind: "individual",
        providerId: "publisher-individual-1",
        providerName: "Dr. Publisher",
      }),
    );
    expect(createPayload).not.toHaveProperty("provider_kind");
    expect(createPayload).not.toHaveProperty("provider_id");
  });

  it("guides publisher offer creation through focused wizard steps", async () => {
    let createPayload: Record<string, unknown> | undefined;
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (
        String(path) === "/admin/support-services/offers" &&
        init?.method === "POST"
      ) {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        createPayload = payload;
        return {
          offer: {
            ...hiddenOffer,
            ...payload,
            id: "wizard-offer",
            acceptedConditions: payload.acceptedConditions ?? [],
            scopeRules: payload.scopeRules ?? [],
          },
        };
      }
      const serviceId = new URL(
        String(path),
        "https://backoffice.example",
      ).searchParams.get("serviceId");
      if (String(path).includes("service-id-availability")) {
        return { serviceId, available: true };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="create"
        presentation="wizard"
        routeBase="/publisher-portal/service-offers"
        fixedProvider={{
          kind: "organization",
          id: "publisher-org-1",
          name: "Publisher Org",
        }}
        canDelete={false}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Offer identity" }),
    ).toBeTruthy();
    expect(screen.getByText("Step 1 of 10")).toBeTruthy();
    expect(screen.queryByText("Inputs and outputs")).toBeNull();
    expect(screen.queryByText("Publisher Org · publisher-org-1")).toBeNull();
    expect(screen.queryByText("Provider kind")).toBeNull();
    expect(screen.queryByText("Service ID")).toBeNull();
    expect(screen.queryByText("Service version")).toBeNull();
    expect(screen.queryByText("Prefill with mocked template")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Offer name is required.")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Clinical report service" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Choose service category" }),
    );
    const categoryDialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(categoryDialog).getByRole("radio", {
        name: /Genomic report generation/,
      }),
    );
    fireEvent.click(
      within(categoryDialog).getByRole("button", { name: "Apply category" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Offer visibility" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "End-to-end services for patients or physicians who want to request a study.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Genomic services for bioinformaticians or audiences with advanced subject-matter knowledge.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Places this offer in the highlighted services segment of the native experience.",
      ),
    ).toBeNull();
    expect(screen.queryByText("Native discovery")).toBeNull();
    expect(
      document.getElementById("service-offer-wizard-hidden-from-search"),
    ).toBeNull();
    expect(
      document
        .getElementById("service-offer-wizard-highlighted")
        ?.getAttribute("data-state"),
    ).toBe("checked");
    expect(
      document
        .getElementById("service-offer-wizard-professional")
        ?.getAttribute("data-state"),
    ).toBe("unchecked");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Promotional image" }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("service-offer-promotional-banner-section"),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("service-offer-promotional-banner-section")
        .closest("section"),
    ).toBeNull();
    expect(screen.queryByText("Publisher Org · publisher-org-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Service presentation" }),
    ).toBeTruthy();
    const presentationFields = screen.getAllByRole("textbox");
    fireEvent.change(presentationFields[0], {
      target: { value: "A clear requester-facing service description." },
    });
    fireEvent.change(presentationFields[1], {
      target: { value: "The provider completes the requested analysis." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "More information" }),
    ).toBeTruthy();
    const moreInformationEditor = screen.getByTestId(
      "service-offer-more-information-editor",
    );
    expect(
      within(moreInformationEditor).getByText("Frequent questions"),
    ).toBeTruthy();
    expect(within(moreInformationEditor).getByText("Key insights")).toBeTruthy();
    expect(
      within(moreInformationEditor).getByText("Scientific facts"),
    ).toBeTruthy();
    expect(within(moreInformationEditor).getByText("Useful links")).toBeTruthy();
    expect(within(moreInformationEditor).getByText("Sample link")).toBeTruthy();
    expect(
      within(moreInformationEditor).getByText("Illustrated segments"),
    ).toBeTruthy();
    expect(
      within(moreInformationEditor).getByText("Technical information"),
    ).toBeTruthy();
    expect(
      within(moreInformationEditor).getByText(
        "Biological sample requirements",
      ),
    ).toBeTruthy();
    expect(
      within(moreInformationEditor).getByText("Service website"),
    ).toBeTruthy();

    fireEvent.click(
      within(moreInformationEditor).getByRole("button", {
        name: "Add frequent question",
      }),
    );
    const frequentQuestionDialog = await screen.findByRole("dialog", {
      name: "Add frequent question",
    });
    fireEvent.change(
      within(frequentQuestionDialog).getByLabelText("Question"),
      { target: { value: "How should I prepare?" } },
    );
    fireEvent.change(within(frequentQuestionDialog).getByLabelText("Answer"), {
      target: { value: "Follow the instructions sent by the provider." },
    });
    fireEvent.click(
      within(frequentQuestionDialog).getByRole("button", {
        name: "Add item",
      }),
    );
    expect(
      within(moreInformationEditor).getByTestId(
        "more-information-frequentQuestions-item",
      ).textContent,
    ).toContain("How should I prepare?");
    expect(
      within(moreInformationEditor).getByTestId(
        "more-information-frequentQuestions-add",
      ),
    ).toBeTruthy();

    fireEvent.click(
      within(moreInformationEditor).getByRole("button", {
        name: "Add frequent question",
      }),
    );
    const secondFrequentQuestionDialog = await screen.findByRole("dialog", {
      name: "Add frequent question",
    });
    fireEvent.change(
      within(secondFrequentQuestionDialog).getByLabelText("Question"),
      { target: { value: "When will the results be ready?" } },
    );
    fireEvent.change(
      within(secondFrequentQuestionDialog).getByLabelText("Answer"),
      { target: { value: "The provider will confirm the delivery date." } },
    );
    fireEvent.click(
      within(secondFrequentQuestionDialog).getByRole("button", {
        name: "Add item",
      }),
    );
    expect(
      within(moreInformationEditor).getAllByTestId(
        "more-information-frequentQuestions-item",
      ),
    ).toHaveLength(2);
    expect(
      within(moreInformationEditor).getByTestId(
        "more-information-frequentQuestions-add",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Request form" }),
    ).toBeTruthy();
    const formDisclosure = screen.getByTestId(
      "service-offer-wizard-form-disclosure",
    );
    expect(formDisclosure.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("checkbox", { name: "Support form input" }),
    ).toBeNull();
    expect(screen.queryByText("Form shape ID")).toBeNull();

    fireEvent.click(formDisclosure);
    expect(formDisclosure.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByText("Form shape ID")).toBeNull();
    expect(screen.queryByText("Form shape version")).toBeNull();
    expect(screen.getByRole("button", { name: "Add field" })).toBeTruthy();
    const requestFormTable = screen.getByRole("table");
    expect(
      within(requestFormTable).getByRole("columnheader", { name: "Key" }),
    ).toBeTruthy();
    expect(
      within(requestFormTable).getByRole("columnheader", { name: "Label" }),
    ).toBeTruthy();
    expect(
      within(requestFormTable).getByRole("columnheader", { name: "Type" }),
    ).toBeTruthy();
    expect(
      within(requestFormTable).getByRole("columnheader", { name: "Actions" }),
    ).toBeTruthy();
    expect(
      within(requestFormTable).queryByRole("columnheader", {
        name: "Required",
      }),
    ).toBeNull();
    expect(
      within(requestFormTable).queryByRole("columnheader", {
        name: "Help info",
      }),
    ).toBeNull();
    expect(
      within(requestFormTable).queryByRole("columnheader", {
        name: "Options",
      }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Commercial terms" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("service-offer-slot-layout")).toBeNull();
    expect(screen.queryByText("Inputs and outputs")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Request form" }),
    ).toBeTruthy();
    const resetFormDisclosure = screen.getByTestId(
      "service-offer-wizard-form-disclosure",
    );
    expect(resetFormDisclosure.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(resetFormDisclosure);
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    const fieldDialog = await screen.findByRole("dialog", {
      name: "Add form field",
    });
    fireEvent.change(within(fieldDialog).getByLabelText("Key"), {
      target: { value: "request_reason" },
    });
    fireEvent.change(within(fieldDialog).getByLabelText("Label"), {
      target: { value: "Request reason" },
    });
    fireEvent.click(
      within(fieldDialog).getByRole("button", { name: "Save field" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Commercial terms" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("service-offer-slot-layout")).toBeNull();
    expect(
      screen
        .getByTestId("service-offer-terms-layout")
        .classList.contains("lg:grid-cols-3"),
    ).toBe(false);
    expect(appText("es", "Price summary")).toBe("Explicación del precio");

    const pricingCard = screen.getByTestId("service-offer-pricing-card");
    const turnaroundCard = screen.getByTestId(
      "service-offer-turnaround-card",
    );
    expect(
      within(pricingCard).getByText("Pricing and explanation"),
    ).toBeTruthy();
    expect(within(turnaroundCard).getByText("Delivery time")).toBeTruthy();
    expect(
      within(turnaroundCard).getByRole("combobox", { name: "Turnaround" })
        .textContent,
    ).toContain("Not specified");
    expect(
      within(turnaroundCard).queryByTestId(
        "service-offer-turnaround-fields",
      ),
    ).toBeNull();

    fireEvent.click(
      within(turnaroundCard).getByRole("combobox", { name: "Turnaround" }),
    );
    fireEvent.click(
      await screen.findByRole("option", {
        name: "Show approximate delivery time",
      }),
    );

    const turnaroundFields = within(turnaroundCard).getByTestId(
      "service-offer-turnaround-fields",
    );
    expect(
      within(turnaroundFields)
        .getByTestId("service-offer-turnaround-amount")
        .hasAttribute("required"),
    ).toBe(true);
    expect(
      within(turnaroundFields)
        .getByRole("combobox", { name: "Unit" })
        .getAttribute("aria-required"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("Enter an approximate delivery time."),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "Commercial terms" }),
    ).toBeTruthy();

    fireEvent.change(
      within(turnaroundFields).getByTestId(
        "service-offer-turnaround-amount",
      ),
      { target: { value: "2" } },
    );
    fireEvent.click(
      within(turnaroundFields).getByRole("combobox", { name: "Unit" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Weeks" }));

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Conditions and limitations",
      }),
    ).toBeTruthy();
    const conditionsLayout = screen.getByTestId(
      "service-offer-wizard-conditions-layout",
    );
    expect(within(conditionsLayout).getAllByRole("heading", { level: 3 })).toHaveLength(
      2,
    );
    expect(
      within(conditionsLayout).getByRole("heading", {
        level: 3,
        name: "Acceptance conditions",
      }),
    ).toBeTruthy();
    expect(
      within(conditionsLayout).getByText(
        "Define what must already be true before the provider can accept the request. This section is optional; add one condition per line only when needed.",
      ),
    ).toBeTruthy();
    expect(
      within(conditionsLayout).getByRole("heading", {
        level: 3,
        name: "Service limitations",
      }),
    ).toBeTruthy();
    expect(
      within(conditionsLayout).getByText(
        "Describe the processing scope and the quality requirements for client-provided information. If data, documents, or samples are incomplete or do not meet the required standards, the procedure's feasibility and the quality, accuracy, or scope of its results may be affected. This section is optional; add one limitation per line when applicable.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Acceptance conditions describe what must already be true before the provider can accept the request. Service limitations explain what the service does not cover, where the provider's responsibility ends, or which delivery constraints apply. This whole block is optional; add one condition or limitation per line only when the service needs them.",
      ),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Service pipeline" }),
    ).toBeTruthy();
    expect(screen.queryByText("Calculated short contract")).toBeNull();
    expect(screen.getByText("Stage pipeline")).toBeTruthy();
    expect(screen.getByText("Best-effort prediction")).toBeTruthy();
    const pipelineLayout = screen.getByTestId(
      "service-offer-stage-pipeline-layout",
    );
    expect(pipelineLayout.getAttribute("data-orientation")).toBe("vertical");
    expect(
      screen.getAllByTestId("service-offer-stage-pipeline-connector"),
    ).toHaveLength(2);
    expect(
      screen.getAllByTestId("service-offer-stage-pipeline-arrow-down"),
    ).toHaveLength(2);
    expect(
      screen.queryByTestId("service-offer-stage-pipeline-arrow-right"),
    ).toBeNull();
    expect(
      appText("es", "Suggested based on input and output types"),
    ).toBe("Sugerido en base a los tipos de entrada y salida");

    const testPlanningStage = screen.getByRole("checkbox", {
      name: "Test planning",
    });
    const wetLabStage = screen.getByRole("checkbox", { name: "Wet lab" });
    const bioinformaticsStage = screen.getByRole("checkbox", {
      name: "Bioinformatics",
    });
    expect(testPlanningStage.getAttribute("data-state")).toBe("checked");
    for (const checkbox of [
      testPlanningStage,
      wetLabStage,
      bioinformaticsStage,
    ]) {
      expect((checkbox as HTMLButtonElement).disabled).toBe(false);
      expect(checkbox.classList.contains("size-8")).toBe(true);
    }
    const testPlanningCard = screen.getByTestId(
      "service-offer-stage-card-test_planning",
    );
    expect(
      within(testPlanningCard).getByTestId("service-offer-stage-header")
        .firstElementChild,
    ).toBe(testPlanningStage);

    fireEvent.click(testPlanningStage);
    expect(testPlanningStage.getAttribute("data-state")).toBe("unchecked");
    expect(wetLabStage.getAttribute("data-state")).toBe("unchecked");
    expect(bioinformaticsStage.getAttribute("data-state")).toBe("unchecked");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("alert").textContent,
    ).toContain("Select at least one stage before continuing.");
    expect(
      screen.getByRole("heading", { level: 1, name: "Service pipeline" }),
    ).toBeTruthy();

    fireEvent.click(bioinformaticsStage);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(wetLabStage);
    fireEvent.click(bioinformaticsStage);
    expect(wetLabStage.getAttribute("data-state")).toBe("checked");
    expect(bioinformaticsStage.getAttribute("data-state")).toBe("unchecked");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Review and publish" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Review and publish" }),
    ).toBeNull();

    const review = screen.getByTestId("service-offer-wizard-review");
    expect(review.getAttribute("role")).toBe("region");
    expect(review.getAttribute("tabindex")).toBe("0");
    expect(review.classList.contains("overflow-y-auto")).toBe(true);
    expect(review.classList.contains("font-serif")).toBe(true);
    expect(review.className).toContain("max-w-[54rem]");
    expect(within(review).queryByRole("textbox")).toBeNull();
    expect(within(review).queryByText("Hidden from search")).toBeNull();
    expect(within(review).queryByText("Native discovery")).toBeNull();
    expect(
      within(review).getByText("Service offer contract summary"),
    ).toBeTruthy();
    expect(
      within(review).getByText("Document for review before publication"),
    ).toBeTruthy();
    expect(within(review).getByText("Publisher Org")).toBeTruthy();
    expect(
      within(review).getByRole("heading", {
        level: 3,
        name: "1. Provider identity",
      }),
    ).toBeTruthy();
    expect(
      within(review).getByText("A clear requester-facing service description."),
    ).toBeTruthy();
    expect(
      within(review).getByText("The provider completes the requested analysis."),
    ).toBeTruthy();
    expect(within(review).getByText("Request reason")).toBeTruthy();
    expect(within(review).getByText("How should I prepare?")).toBeTruthy();
    expect(within(review).getAllByText("Form").length).toBeGreaterThan(0);
    expect(within(review).getByText("pdf_report")).toBeTruthy();
    expect(within(review).getByText("PDF report")).toBeTruthy();
    expect(
      within(review).getByRole("heading", {
        level: 3,
        name: "5. Commercial terms",
      }),
    ).toBeTruthy();
    expect(
      within(review).getByRole("heading", {
        level: 3,
        name: "7. Stage pipeline",
      }),
    ).toBeTruthy();
    expect(
      within(review).getByTestId("service-offer-wizard-preparation-status"),
    ).toBeTruthy();

    const actionFooter = screen.getByTestId(
      "service-offer-wizard-action-footer",
    );
    expect(actionFooter.classList.contains("fixed")).toBe(true);
    expect(actionFooter.classList.contains("bottom-0")).toBe(true);
    expect(review.contains(actionFooter)).toBe(false);
    expect(
      within(actionFooter).getByRole("button", { name: "Back" }),
    ).toBeTruthy();
    expect(
      within(actionFooter).getByRole("button", { name: "Save draft" }),
    ).toBeTruthy();
    expect(
      within(actionFooter).getByRole("button", {
        name: "Publish service offer",
      }),
    ).toBeTruthy();
    expect(appText("es", "Service offer contract summary")).toBe(
      "Resumen contractual de la oferta de servicio",
    );

    fireEvent.click(
      within(actionFooter).getByRole("button", { name: "Save draft" }),
    );
    await waitFor(() => expect(createPayload).toBeDefined());
    expect(createPayload?.inputSlots).toEqual([
      {
        role: "form",
        objectType: "pgo_form",
        acceptedTypes: ["pgo_form"],
        required: true,
        cardinality: { min: 1, max: 1 },
      },
    ]);
    expect(createPayload?.outputSlots).toEqual([
      {
        role: "pdf_report",
        objectType: "pgo_pdf_report",
        mutationMode: "new_object",
      },
    ]);
  });

  it("shows lock affordances and no delete action on publisher transaction detail", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      if (String(path).endsWith(`/transactions/${runningTransaction.requestId}`)) {
        return { transaction: runningTransaction };
      }
      if (String(path).endsWith(`/offers/${runningTransaction.offerId}`)) {
        return { offer: currentLiveOffer };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={runningTransaction.requestId}
        routeBase="/publisher-portal/service-transactions"
        canDelete={false}
        showLockedFields
      />,
    );

    expect(await screen.findByText("Accepted frozen service")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getAllByText("Read only").length).toBeGreaterThan(5);
    expect(
      screen
        .getByRole("link", { name: /Back to Service Transactions/i })
        .getAttribute("href"),
    ).toBe("/publisher-portal/service-transactions");
  });

  it("shows offer remediation warnings without blocking the edit form", async () => {
    const offerWithWarnings: SupportServiceOfferRecord = {
      ...hiddenOffer,
      complianceWarnings: [
        "updatedAt is missing or invalid; this record is listed by document ID.",
      ],
    };
    sdkFetchMock.mockImplementation(async (path) => {
      if (String(path).includes("?limit=")) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: offerWithWarnings };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={offerWithWarnings.id} />,
    );

    expect(await screen.findByText("Offer requires remediation")).toBeTruthy();
    expect(
      screen.getByText(
        "updatedAt is missing or invalid; this record is listed by document ID.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Offer identity")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Editar service offer" }),
    ).toBeTruthy();
    expect(screen.getByText("Pocket Genes service contract")).toBeTruthy();
    expect(
      screen.queryByTestId("publisher-service-offer-editor-header"),
    ).toBeNull();
  });

  it("imports an exact request-form CSV, shows its rules, and enables the canonical form slot", async () => {
    let savedPayload: Record<string, unknown> | undefined;
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body)) as Record<
          string,
          unknown
        >;
        savedPayload = payload;
        return {
          offer: {
            ...hiddenOffer,
            ...payload,
            serviceVersion: hiddenOffer.serviceVersion + 1,
            formShape: {
              ...(payload.formShape as Record<string, unknown>),
              version: 1,
            },
          },
        };
      }
      if (String(path).includes("?limit=")) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: hiddenOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
      "es",
    );

    const importButton = await screen.findByRole("button", {
      name: "Importar desde CSV",
    });
    expect(importButton).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Reglas de importación" }),
    );
    const rules = await screen.findByRole("dialog", {
      name: "Reglas de importación",
    });
    expect(
      within(rules).getByText(
        "key,label,type,required,helpInfoText,options",
      ),
    ).toBeTruthy();
    expect(
      within(rules)
        .getByRole("link", { name: "Descargar CSV 2PQ" })
        .getAttribute("href"),
    ).toBe("/templates/formulario-solicitud-estudio-2pq.csv");
    fireEvent.click(within(rules).getByRole("button", { name: "Cerrar" }));

    const csv = [
      "key,label,type,required,helpInfoText,options",
      "patient_full_name,Nombre del paciente,text,true,,",
      'patient_status,Estado del paciente,enum,true,,"[{""value"":""active"",""label"":""Activo""},{""value"":""inactive"",""label"":""Inactivo""}]"',
    ].join("\n");
    const file = new File([csv], "formulario.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", {
      value: jest.fn().mockResolvedValue(csv),
    });
    fireEvent.change(screen.getByTestId("service-form-csv-input"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      const alert = screen.queryByRole("alert");
      if (alert) {
        throw new Error(`CSV import alert: ${alert.textContent}`);
      }
      expect(
        screen.queryByTestId("service-form-csv-import-status"),
      ).toBeTruthy();
    });
    expect(
      screen.getByTestId("service-form-csv-import-status").textContent,
    ).toContain("CSV cargado: 2 campos");
    expect(screen.getByText("patient_full_name")).toBeTruthy();
    expect(screen.getByText("patient_status")).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Guardar cambios" })[0],
    );
    await acknowledgeExistingOfferContract("es");
    await waitFor(() => expect(savedPayload).toBeDefined());
    expect(savedPayload?.formShape).toEqual(
      expect.objectContaining({
        allowUnknownFields: false,
        fields: [
          expect.objectContaining({
            key: "patient_full_name",
            type: "text",
            required: true,
          }),
          expect.objectContaining({
            key: "patient_status",
            type: "enum",
            required: true,
            options: [
              { value: "active", label: "Activo" },
              { value: "inactive", label: "Inactivo" },
            ],
          }),
        ],
      }),
    );
    expect(savedPayload?.inputSlots).toEqual(
      expect.arrayContaining([
        {
          role: "form",
          objectType: "pgo_form",
          acceptedTypes: ["pgo_form"],
          required: true,
          cardinality: { min: 1, max: 1 },
        },
      ]),
    );
  });

  it("uses a wide, bilingual single-select registry modal and persists only its key", async () => {
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return { offer: { ...hiddenOffer, ...payload } };
      }
      if (String(path).includes("?limit=")) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: hiddenOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
      "es",
    );

    const categoryButton = await screen.findByRole("button", {
      name: "Cambiar categoría de servicio",
    });
    const selectedCategory = SUPPORT_SERVICE_CATEGORIES.find(
      (category) => category.key === hiddenOffer.serviceCategory,
    )!;
    const selectedDescription = supportServiceCategoryDescription(
      selectedCategory,
      "es",
    );
    expect(within(categoryButton).queryByText(selectedDescription)).toBeNull();
    fireEvent.click(categoryButton);

    const modal = await screen.findByRole("dialog");
    expect(modal.className).toContain("80rem");
    expect(within(modal).getByText(selectedDescription)).toBeTruthy();
    expect(within(modal).getAllByRole("radio")).toHaveLength(
      SUPPORT_SERVICE_CATEGORIES.length,
    );
    const categorySearch = within(modal).getByRole("textbox", {
      name: "Buscar categorías de servicio",
    });
    fireEvent.change(categorySearch, {
      target: { value: "sot_human_advice_health_professional_development" },
    });
    expect(within(modal).getAllByRole("radio")).toHaveLength(1);
    expect(
      within(modal).getAllByText("Desarrollo profesional en salud"),
    ).toHaveLength(2);
    fireEvent.change(categorySearch, { target: { value: "" } });
    expect(within(modal).getByText("Preparación clínica")).toBeTruthy();
    expect(
      within(modal).getByText(
        "Revisión profesional independiente, explicación o segunda opinión sobre un informe genómico ya finalizado.",
      ),
    ).toBeTruthy();
    const selectedCategoryCell = within(modal).getByRole("radio", {
      name: new RegExp(selectedCategory.nameSpanish),
    });
    expect(
      within(selectedCategoryCell).queryByText(selectedCategory.key),
    ).toBeNull();
    expect(
      within(selectedCategoryCell).queryByText(selectedCategory.systemImage),
    ).toBeNull();

    fireEvent.click(
      within(modal).getByRole("radio", {
        name: /Revisión de informe genómico/,
      }),
    );
    fireEvent.click(
      within(modal).getByRole("button", { name: "Aplicar categoría" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Guardar cambios" })[0],
    );
    await acknowledgeExistingOfferContract("es");

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.serviceCategory).toBe("sot_genomic_report_review");
      expect(payload.serviceCategory).not.toBe("Revisión de informe genómico");
      expect(payload.acknowledgesExistingTransactionContracts).toBe(true);
      expect(payload).not.toHaveProperty("changeLogHistoryByVersion");
      expect(payload).not.toHaveProperty("changeLogFormShapeByVersion");
    });
  });

  it("also guards status saves with the frozen-contract acknowledgement", async () => {
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return {
          offer: {
            ...hiddenOffer,
            ...payload,
            serviceVersion: hiddenOffer.serviceVersion + 1,
          },
        };
      }
      if (String(path).includes("?limit=")) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: hiddenOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Change status" }),
    );
    const statusDialog = await screen.findByRole("alertdialog", {
      name: "Change service offer status",
    });
    fireEvent.click(
      within(statusDialog).getByRole("radio", { name: /Inactive/ }),
    );
    fireEvent.click(within(statusDialog).getByRole("button", { name: "Save" }));
    await acknowledgeExistingOfferContract();

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.status).toBe("inactive");
      expect(payload.acknowledgesExistingTransactionContracts).toBe(true);
    });
  });

  it("uses the full wide layout for the organization provider picker", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      if (String(path).startsWith("/discover/organizations?")) {
        return { organizations: [], nextCursor: undefined };
      }
      return { offers: [], nextCursor: undefined };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="create" />,
      "es",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Elegí proveedor",
      }),
    );

    const modal = await screen.findByRole("dialog");
    expect(modal.className).toContain("92rem");
    expect(modal.classList.contains("sm:max-w-none")).toBe(true);
    expect(
      within(modal).getByText("Elegí organización proveedora"),
    ).toBeTruthy();
    expect(
      within(modal).getByText(
        "Seleccioná un registro de publicador de Discover para esta oferta de servicio.",
      ),
    ).toBeTruthy();
  });

  it("renders invalid historical categories as Uncategorized and blocks save until one is selected", async () => {
    const historicalOffer: SupportServiceOfferRecord = {
      ...hiddenOffer,
      id: "offer-historical-category",
      serviceCategory: "Reports",
    };
    sdkFetchMock.mockImplementation(async (path) => {
      if (String(path).includes("?limit=")) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: historicalOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="edit"
        offerId={historicalOffer.id}
      />,
    );

    expect(await screen.findByText("Uncategorized")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    expect(await screen.findByText("Choose one service category.")).toBeTruthy();
    expect(
      sdkFetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  });

  it("exports the persisted service offer record as raw JSON", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    sdkFetchMock.mockImplementation(async (path) => {
      const value = String(path);
      if (value === `/admin/support-services/offers/${hiddenOffer.id}`) {
        return { offer: hiddenOffer };
      }
      if (value.startsWith("/admin/support-services/offers?")) {
        return { offers: [], nextCursor: undefined };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Export raw file" }),
    );

    expect(await screen.findByText("Service offer raw JSON")).toBeTruthy();
    expect(screen.getByText("service-offer-offer-hidden.json")).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes('"id": "offer-hidden"')),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('"id": "offer-hidden"'),
      );
    });
    expect(await screen.findByText("JSON copied.")).toBeTruthy();
  });

  it("reports secondary cleanup warnings after the root transaction is deleted", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    sdkFetchMock.mockImplementation(async (_path, init) => {
      if (init?.method === "DELETE") {
        return {
          deleted: true,
          cleanupWarnings: ["Requester reference cleanup failed."],
        };
      }
      return {
        transactions: [runningTransaction],
        nextCursor: undefined,
      };
    });

    renderWithQueryClient(<SupportServicesBrowser kind="transactions" />);

    await screen.findByText(runningTransaction.requestId);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText(
        /Service transaction deleted\. Secondary cleanup warnings: Requester reference cleanup failed\./,
      ),
    ).toBeTruthy();
  });

  it("keeps the catalog pricing model and summary instead of coercing it to fixed", () => {
    expect(POCKET_GENES_SERVICE_OPTIONS.length).toBeGreaterThan(0);
    for (const offer of POCKET_GENES_SERVICE_OPTIONS) {
      expect(offer.commercialTerms.pricingModel).toBe(
        "calculated_after_submission",
      );
      expect(offer.commercialTerms.price?.summary).toBe(
        "Calculated after submission",
      );
      expect(offer.isHighlightedOffer).toBe(false);
      expect(offer.isProfessionalOffer).toBe(true);
      expect(offer.promotionalBannerImageUrl).toBeNull();
      expect(offer.promotionalBannerImageUploadDataUrl).toBeNull();
    }
  });

  it("normalizes a catalog service without a form shape as an absent optional form", () => {
    expect(normalizePocketGenesCatalogFormShape(undefined)).toBeUndefined();
  });

  it("strictly validates canonical catalog more-information keys and URLs", () => {
    expect(
      normalizePocketGenesCatalogMoreInformation({
        usefulLinks: [
          { title: "Preparation guide", url: "https://example.org/guide" },
        ],
        technicalInformationFacts: [
          { title: "Pipeline", description: "Validated.", subitems: [] },
        ],
        bulletSegments: [
          {
            title: "Uploaded illustration",
            description: "Embedded catalog image.",
            imageUploadDataUrl: "data:image/png;base64,AAAA",
          },
        ],
      }),
    ).toEqual({
      usefulLinks: [
        { title: "Preparation guide", url: "https://example.org/guide" },
      ],
      technicalInformationFacts: [
        { title: "Pipeline", description: "Validated.", subitems: [] },
      ],
      bulletSegments: [
        {
          title: "Uploaded illustration",
          description: "Embedded catalog image.",
          imageUploadDataUrl: "data:image/png;base64,AAAA",
        },
      ],
    });
    expect(() =>
      normalizePocketGenesCatalogMoreInformation({ frequent_questions: [] }),
    ).toThrow("unsupported keys");
    expect(() =>
      normalizePocketGenesCatalogMoreInformation({
        websiteUrl: "https://bad..example.org",
      }),
    ).toThrow("valid lowercase HTTPS URL");
    expect(() =>
      normalizePocketGenesCatalogMoreInformation({
        bulletSegments: [
          {
            title: "Two sources",
            description: "Invalid.",
            imageUrl: "https://example.org/image.png",
            imageUploadDataUrl: "data:image/png;base64,AAAA",
          },
        ],
      }),
    ).toThrow("exactly one");
  });

  it("starts a new offer with no input or output slots", () => {
    renderWithQueryClient(<SupportServiceOfferWorkbench mode="create" />);

    expect(
      screen
        .getByTestId("service-category-discovery-row")
        .classList.contains("md:grid-cols-2"),
    ).toBe(true);
    expect(
      screen
        .getByTestId("service-category-discovery-row")
        .classList.contains("lg:col-span-2"),
    ).toBe(true);
    expect(
      screen
        .getByTestId("service-offer-audience-row")
        .classList.contains("md:grid-cols-2"),
    ).toBe(true);
    expect(
      screen
        .getByTestId("service-offer-audience-row")
        .classList.contains("lg:col-span-2"),
    ).toBe(true);
    expect(screen.getByText("No input slots defined.")).toBeTruthy();
    expect(screen.getByText("No output slots defined.")).toBeTruthy();
    expect(screen.getByText("Native discovery")).toBeTruthy();
    expect(
      document.getElementById("service-offer-hidden-from-search"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Places this offer in the highlighted services segment of the native experience.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "End-to-end services for patients or physicians who want to request a study.",
      ),
    ).toBeNull();
    expect(
      screen
        .getByTestId("service-offer-slot-layout")
        .classList.contains("xl:grid-cols-2"),
    ).toBe(true);
    expect(
      screen
        .getByTestId("service-offer-terms-layout")
        .classList.contains("xl:grid-cols-2"),
    ).toBe(true);
    expect(
      screen.getByText(
        "Acceptance conditions describe what must already be true before the provider can accept the request. Service limitations explain what the service does not cover, where the provider's responsibility ends, or which delivery constraints apply. This whole block is optional; add one condition or limitation per line only when the service needs them.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Calculated short contract")).toBeTruthy();
    expect(
      screen
        .getByTestId("service-offer-stage-pipeline-layout")
        .getAttribute("data-orientation"),
    ).toBe("horizontal");
    expect(
      screen.getAllByTestId("service-offer-stage-pipeline-arrow-right"),
    ).toHaveLength(2);
    expect(screen.getByText("Not requested")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Support form input" }));
    expect(screen.getByText("Form shape ID")).toBeTruthy();
    expect(screen.getByText("Form shape version")).toBeTruthy();
    expect(
      document
        .getElementById("service-offer-highlighted")
        ?.getAttribute("data-state"),
    ).toBe("unchecked");
    expect(
      document
        .getElementById("service-offer-professional")
        ?.getAttribute("data-state"),
    ).toBe("checked");
  });

  it("saves an offer with no form, input slots, or output slots", async () => {
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return { offer: { ...hiddenOffer, ...payload } };
      }
      if (
        String(path).includes("provider-siblings") ||
        String(path).includes("?limit=")
      ) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: hiddenOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
    );

    const outputRole = (await screen.findAllByText("report")).find(
      (element) => element.tagName === "TD",
    );
    expect(outputRole).toBeTruthy();
    const outputRow = outputRole!.closest("tr");
    expect(outputRow).toBeTruthy();
    fireEvent.click(within(outputRow!).getByRole("button", { name: "Delete" }));
    expect(screen.getByText("No output slots defined.")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await acknowledgeExistingOfferContract();

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.inputSlots).toEqual([]);
      expect(payload.outputSlots).toEqual([]);
      expect(payload).not.toHaveProperty("formShape");
      expect(payload.shortContract).toBe("none -> none");
    });
  });

  it("saves an enabled form shape with zero fields and no universal requester answers", async () => {
    const emptyFormOffer: SupportServiceOfferRecord = {
      ...hiddenOffer,
      formShape: {
        id: "pgfs_frozen_lab_1",
        version: 1,
        allowUnknownFields: false,
        fields: [],
      },
      inputSlots: [
        {
          role: "form",
          objectType: "pgo_form",
          acceptedTypes: ["pgo_form"],
          required: true,
          cardinality: { min: 1, max: 1 },
        },
      ],
    };

    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return { offer: { ...emptyFormOffer, ...payload } };
      }
      if (
        String(path).includes("provider-siblings") ||
        String(path).includes("?limit=")
      ) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: emptyFormOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={emptyFormOffer.id} />,
    );

    expect(await screen.findByText("0 fields")).toBeTruthy();
    const hiddenCheckbox = document.getElementById(
      "service-offer-hidden-from-search",
    );
    fireEvent.click(hiddenCheckbox!);
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await acknowledgeExistingOfferContract();

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.formShape.fields).toEqual([]);
      expect(JSON.stringify(payload)).not.toContain("requested_at");
      expect(JSON.stringify(payload)).not.toContain("requested_by");
    });
  });

  it.each([
    {
      name: "an invalid field key",
      fields: [
        {
          key: "Invalid-key",
          label: "Invalid key",
          type: "text" as const,
          required: false,
        },
      ],
      message: "Form field keys must start with a lowercase letter",
    },
    {
      name: "duplicate field keys",
      fields: [
        {
          key: "presentation",
          label: "Presentation",
          type: "text" as const,
          required: false,
        },
        {
          key: "presentation",
          label: "Presentation again",
          type: "text" as const,
          required: false,
        },
      ],
      message: "Duplicate form field key: presentation.",
    },
    {
      name: "duplicate enum values",
      fields: [
        {
          key: "presentation",
          label: "Presentation",
          type: "enum" as const,
          required: false,
          options: [
            { value: "clinical", label: "Clinical" },
            { value: "clinical", label: "Clinical duplicate" },
          ],
        },
      ],
      message: "Form field presentation has duplicate option value clinical.",
    },
    {
      name: "more than one hundred enum options",
      fields: [
        {
          key: "presentation",
          label: "Presentation",
          type: "enum" as const,
          required: false,
          options: Array.from({ length: 101 }, (_, index) => ({
            value: `option_${index}`,
            label: `Option ${index}`,
          })),
        },
      ],
      message: "Form field presentation cannot declare more than 100 options.",
    },
    {
      name: "an enum value outside the native identifier contract",
      fields: [
        {
          key: "presentation",
          label: "Presentation",
          type: "enum" as const,
          required: false,
          options: [{ value: "not allowed", label: "Not allowed" }],
        },
      ],
      message:
        "Form field presentation option values may use only letters, numbers, dots, underscores, colons, or hyphens and contain at most 128 characters.",
    },
    {
      name: "an enum label longer than the native limit",
      fields: [
        {
          key: "presentation",
          label: "Presentation",
          type: "enum" as const,
          required: false,
          options: [{ value: "clinical", label: "x".repeat(121) }],
        },
      ],
      message:
        "Form field presentation option labels cannot exceed 120 characters.",
    },
    {
      name: "oversized help info",
      fields: [
        {
          key: "presentation",
          label: "Presentation",
          type: "text" as const,
          required: false,
          helpInfoText: "x".repeat(501),
        },
      ],
      message: "Form field presentation help info cannot exceed 500 characters.",
    },
  ])("blocks $name before sending the offer", async ({ fields, message }) => {
    const invalidFormOffer: SupportServiceOfferRecord = {
      ...hiddenOffer,
      formShape: {
        id: "pgfs_frozen_lab_1",
        version: 1,
        allowUnknownFields: false,
        fields,
      },
      inputSlots: [
        {
          role: "form",
          objectType: "pgo_form",
          acceptedTypes: ["pgo_form"],
          required: true,
          cardinality: { min: 1, max: 1 },
        },
      ],
    };

    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        throw new Error("Invalid offer reached the SDK.");
      }
      if (
        String(path).includes("provider-siblings") ||
        String(path).includes("?limit=")
      ) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: invalidFormOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="edit"
        offerId={invalidFormOffer.id}
      />,
    );

    await screen.findByText("Request form");
    const hiddenCheckbox = document.getElementById(
      "service-offer-hidden-from-search",
    );
    fireEvent.click(hiddenCheckbox!);
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    expect(await screen.findByText(new RegExp(message))).toBeTruthy();
    expect(
      sdkFetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  });

  it("round-trips the hidden-from-search offer flag with the camelCase DTO key", async () => {
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return {
          offer: {
            ...hiddenOffer,
            isHiddenFromSearch: payload.isHiddenFromSearch,
          },
        };
      }
      if (String(path).includes("provider-siblings")) {
        return { offers: [], nextCursor: undefined };
      }
      if (String(path).includes("?limit=")) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: hiddenOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
    );

    await screen.findByText("Hide from native service search");
    const hiddenCheckbox = document.getElementById(
      "service-offer-hidden-from-search",
    );
    expect(hiddenCheckbox).toBeTruthy();
    expect(hiddenCheckbox!.getAttribute("data-state")).toBe("checked");
    expect(
      Array.from(document.querySelectorAll('[data-slot="select-trigger"]')).map(
        (element) => element.textContent,
      ),
    ).toContain("Calculated after submission");
    expect(
      (
        screen.getByPlaceholderText(
          "Calculated after submission",
        ) as HTMLInputElement
      ).value,
    ).toBe("Calculated after submission");

    fireEvent.click(hiddenCheckbox!);
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await acknowledgeExistingOfferContract();

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.isHiddenFromSearch).toBe(false);
      expect(payload.commercialTerms).toEqual(hiddenOffer.commercialTerms);
      expect(payload).not.toHaveProperty("is_hidden_from_search");
    });
  });

  it("canonicalizes a loaded legacy turnaround before any commercial-term edit", async () => {
    const offerWithLegacyTurnaround: SupportServiceOfferRecord = {
      ...hiddenOffer,
      commercialTerms: {
        ...hiddenOffer.commercialTerms,
        turnaround: "Entrega estimada: 2 semanas",
      },
    };
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return { offer: { ...offerWithLegacyTurnaround, ...payload } };
      }
      if (
        String(path).includes("provider-siblings") ||
        String(path).includes("?limit=")
      ) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: offerWithLegacyTurnaround };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="edit"
        offerId={offerWithLegacyTurnaround.id}
      />,
    );

    await screen.findByDisplayValue(offerWithLegacyTurnaround.name);
    await waitFor(() => {
      expect(
        (
          screen.getByTestId(
            "service-offer-turnaround-amount",
          ) as HTMLInputElement
        ).value,
      ).toBe("2");
      expect(
        Array.from(
          document.querySelectorAll('[data-slot="select-trigger"]'),
        ).map((element) => element.textContent),
      ).toContain("Weeks");
    });

    fireEvent.click(
      document.getElementById("service-offer-hidden-from-search")!,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await acknowledgeExistingOfferContract();

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.commercialTerms.turnaround).toBe("2w");
    });
  });

  it("clears an existing turnaround when delivery time is set to not specified", async () => {
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return { offer: { ...hiddenOffer, ...payload } };
      }
      if (
        String(path).includes("provider-siblings") ||
        String(path).includes("?limit=")
      ) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: hiddenOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
    );

    await screen.findByDisplayValue(hiddenOffer.name);
    const turnaroundCard = await screen.findByTestId(
      "service-offer-turnaround-card",
    );
    expect(
      (
        within(turnaroundCard).getByTestId(
          "service-offer-turnaround-amount",
        ) as HTMLInputElement
      ).value,
    ).toBe("1");

    fireEvent.click(
      within(turnaroundCard).getByRole("combobox", { name: "Turnaround" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Not specified" }),
    );

    expect(
      within(turnaroundCard).queryByTestId(
        "service-offer-turnaround-fields",
      ),
    ).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await acknowledgeExistingOfferContract();

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.commercialTerms).not.toHaveProperty("turnaround");
      expect(payload).not.toHaveProperty("showsEstimatedTurnaround");
    });
  });

  it("saves offer discovery flags and a promotional banner URL with exact camelCase keys", async () => {
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return { offer: { ...hiddenOffer, ...payload } };
      }
      if (
        String(path).includes("provider-siblings") ||
        String(path).includes("?limit=")
      ) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: hiddenOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
    );

    await screen.findByText("Show as a highlighted offer");
    const highlightedCheckbox = document.getElementById(
      "service-offer-highlighted",
    );
    const professionalCheckbox = document.getElementById(
      "service-offer-professional",
    );
    expect(highlightedCheckbox?.getAttribute("data-state")).toBe("unchecked");
    expect(professionalCheckbox?.getAttribute("data-state")).toBe("checked");
    expect(
      highlightedCheckbox!.compareDocumentPosition(professionalCheckbox!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    fireEvent.click(highlightedCheckbox!);
    expect(highlightedCheckbox?.getAttribute("data-state")).toBe("checked");
    expect(professionalCheckbox?.getAttribute("data-state")).toBe("unchecked");

    fireEvent.click(professionalCheckbox!);
    expect(highlightedCheckbox?.getAttribute("data-state")).toBe("unchecked");
    expect(professionalCheckbox?.getAttribute("data-state")).toBe("checked");

    fireEvent.click(highlightedCheckbox!);
    expect(highlightedCheckbox?.getAttribute("data-state")).toBe("checked");
    expect(professionalCheckbox?.getAttribute("data-state")).toBe("unchecked");

    fireEvent.click(highlightedCheckbox!);
    expect(highlightedCheckbox?.getAttribute("data-state")).toBe("unchecked");
    expect(professionalCheckbox?.getAttribute("data-state")).toBe("unchecked");

    fireEvent.click(highlightedCheckbox!);
    expect(highlightedCheckbox?.getAttribute("data-state")).toBe("checked");
    expect(professionalCheckbox?.getAttribute("data-state")).toBe("unchecked");

    const bannerUrlInput = screen.getByLabelText("Banner image URL");
    const bannerUrlGroup = bannerUrlInput.closest('[data-slot="input-group"]');
    expect(bannerUrlGroup?.classList.contains("h-10")).toBe(true);
    expect(
      screen
        .getByTestId("service-offer-banner-url-prefix")
        .getAttribute("data-align"),
    ).toBe("inline-start");
    expect(bannerUrlInput.previousElementSibling).toBe(
      screen.getByTestId("service-offer-banner-url-prefix"),
    );

    fireEvent.change(bannerUrlInput, {
      target: { value: "https://example.org/service-banner.png" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await acknowledgeExistingOfferContract();

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.isHighlightedOffer).toBe(true);
      expect(payload.isProfessionalOffer).toBe(false);
      expect(payload.promotionalBannerImageUrl).toBe(
        "https://example.org/service-banner.png",
      );
      expect(payload.promotionalBannerImageUploadDataUrl).toBeNull();
      expect(payload).not.toHaveProperty("is_highlighted_offer");
      expect(payload).not.toHaveProperty("is_professional_offer");
      expect(payload).not.toHaveProperty("promotional_banner_image_url");
      expect(payload).not.toHaveProperty(
        "promotional_banner_image_upload_data_url",
      );
    });
  });

  it("edits rich more-information cards and saves only canonical camelCase keys", async () => {
    const offerWithMoreInformation: SupportServiceOfferRecord = {
      ...hiddenOffer,
      moreInformation: completeMoreInformation,
    };
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return { offer: { ...offerWithMoreInformation, ...payload } };
      }
      if (
        String(path).includes("provider-siblings") ||
        String(path).includes("?limit=")
      ) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: offerWithMoreInformation };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="edit"
        offerId={offerWithMoreInformation.id}
      />,
    );

    const editor = await screen.findByTestId(
      "service-offer-more-information-editor",
    );
    const openMoreInformationSection = (title: string) => {
      const trigger = within(editor).getByText(title).closest("button");
      expect(trigger).toBeTruthy();
      if (trigger?.getAttribute("aria-expanded") !== "true") {
        fireEvent.click(trigger!);
      }
    };
    for (const [sectionTitle, addTestId] of [
      ["Frequent questions", "more-information-frequentQuestions-add"],
      ["Key insights", "more-information-keyInsights-add"],
      ["Scientific facts", "more-information-scientificFacts-add"],
      ["Useful links", "more-information-usefulLinks-add"],
      ["Illustrated segments", "more-information-bulletSegments-add"],
      [
        "Technical information",
        "more-information-technicalInformationFacts-add",
      ],
      [
        "Biological sample requirements",
        "more-information-biologicalSampleRequirements-add",
      ],
    ]) {
      openMoreInformationSection(sectionTitle);
      expect(within(editor).getByTestId(addTestId)).toBeTruthy();
    }
    expect(
      within(editor).getByTestId("more-information-frequentQuestions-item")
        .textContent,
    ).toContain("How should I prepare?");
    openMoreInformationSection("Sample link");
    expect(
      within(editor).getByTestId("more-information-sampleLink-item")
        .textContent,
    ).toContain("View example");
    openMoreInformationSection("Technical information");
    expect(
      within(editor).getByTestId(
        "more-information-technicalInformationFacts-item",
      ).textContent,
    ).toContain("Quality control");
    openMoreInformationSection("Biological sample requirements");
    expect(
      within(editor).getByTestId(
        "more-information-biologicalSampleRequirements-item",
      ).textContent,
    ).toContain("Use the collection kit supplied by the provider.");

    openMoreInformationSection("Illustrated segments");
    fireEvent.click(
      within(editor).getByRole("button", {
        name: "Add illustrated segment",
      }),
    );
    const illustratedSegmentDialog = await screen.findByRole("dialog", {
      name: "Add illustrated segment",
    });
    fireEvent.change(
      within(illustratedSegmentDialog).getByLabelText("Title"),
      { target: { value: "Uploaded workflow" } },
    );
    fireEvent.change(
      within(illustratedSegmentDialog).getByLabelText("Description"),
      { target: { value: "An illustration uploaded from this device." } },
    );
    fireEvent.change(
      within(illustratedSegmentDialog).getByLabelText("Upload image file"),
      {
        target: {
          files: [
            new File(["illustrated-segment"], "workflow.png", {
              type: "image/png",
            }),
          ],
        },
      },
    );
    expect(await screen.findByText("Uploaded image ready.")).toBeTruthy();
    expect(
      within(illustratedSegmentDialog).queryByLabelText("Image URL"),
    ).toBeNull();
    fireEvent.click(
      within(illustratedSegmentDialog).getByRole("button", {
        name: "Add item",
      }),
    );
    expect(
      within(editor).getAllByTestId(
        "more-information-bulletSegments-item",
      ),
    ).toHaveLength(2);

    openMoreInformationSection("Useful links");
    fireEvent.click(
      within(editor).getByRole("button", { name: "Add useful link" }),
    );
    const usefulLinkDialog = await screen.findByRole("dialog", {
      name: "Add useful link",
    });
    fireEvent.change(within(usefulLinkDialog).getByLabelText("Title"), {
      target: { value: "Provider resources" },
    });
    fireEvent.change(within(usefulLinkDialog).getByLabelText("URL"), {
      target: { value: "https://example.org/provider-resources" },
    });
    fireEvent.click(
      within(usefulLinkDialog).getByRole("button", { name: "Add item" }),
    );
    openMoreInformationSection("Service website");
    fireEvent.change(within(editor).getByLabelText("Website URL"), {
      target: { value: "https://example.org/services/updated-report" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await acknowledgeExistingOfferContract();

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.moreInformation).toEqual({
        ...completeMoreInformation,
        bulletSegments: [
          ...completeMoreInformation.bulletSegments,
          {
            title: "Uploaded workflow",
            description: "An illustration uploaded from this device.",
            imageUploadDataUrl: expect.stringMatching(
              /^data:image\/png;base64,/,
            ),
          },
        ],
        usefulLinks: [
          ...completeMoreInformation.usefulLinks,
          {
            title: "Provider resources",
            url: "https://example.org/provider-resources",
          },
        ],
        websiteUrl: "https://example.org/services/updated-report",
      });
      expect(payload).not.toHaveProperty("more_information");
    });
  });

  it("uploads a promotional banner file and gives its data precedence over an empty URL", async () => {
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return { offer: { ...hiddenOffer, ...payload } };
      }
      if (
        String(path).includes("provider-siblings") ||
        String(path).includes("?limit=")
      ) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: hiddenOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
    );

    const bannerSection = await screen.findByTestId(
      "service-offer-promotional-banner-section",
    );
    fireEvent.change(within(bannerSection).getByLabelText("Upload banner file"), {
      target: {
        files: [
          new File(["tiny-service-banner"], "service-banner.png", {
            type: "image/png",
          }),
        ],
      },
    });

    expect(await screen.findByText("Uploaded image ready.")).toBeTruthy();
    expect(
      within(bannerSection).queryByLabelText("Banner image URL"),
    ).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await acknowledgeExistingOfferContract();

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.promotionalBannerImageUrl).toBeNull();
      expect(payload.promotionalBannerImageUploadDataUrl).toMatch(
        /^data:image\/png;base64,/,
      );
      expect(payload).not.toHaveProperty("promotionalBannerImageUploadName");
      expect(payload).not.toHaveProperty(
        "promotionalBannerImageUploadMimeType",
      );
    });
  });

  it("ignores promotional banner drops while an offer save is in progress", async () => {
    let resolveSave: (value: { offer: SupportServiceOfferRecord }) => void =
      () => undefined;
    const pendingSave = new Promise<{ offer: SupportServiceOfferRecord }>(
      (resolve) => {
        resolveSave = resolve;
      },
    );
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        return pendingSave;
      }
      if (
        String(path).includes("provider-siblings") ||
        String(path).includes("?limit=")
      ) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: hiddenOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
    );

    const bannerSection = await screen.findByTestId(
      "service-offer-promotional-banner-section",
    );
    const dropzone = within(bannerSection).getByTestId(
      "service-offer-promotional-banner-dropzone",
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await acknowledgeExistingOfferContract();
    await screen.findAllByText("Saving...");

    const droppedFile = new File(["ignored-banner"], "ignored.png", {
      type: "image/png",
    });
    fireEvent.dragEnter(dropzone, {
      dataTransfer: { files: [droppedFile] },
    });
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [droppedFile] },
    });

    expect(
      (
        within(bannerSection).getByLabelText(
          "Upload banner file",
        ) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByText("Uploaded image ready.")).toBeNull();
    expect(
      (within(bannerSection).getByLabelText("Banner image URL") as HTMLInputElement)
        .value,
    ).toBe("");

    await act(async () => {
      resolveSave({ offer: hiddenOffer });
      await pendingSave;
    });
    expect(await screen.findByText("Service offer saved.")).toBeTruthy();
  });

  it("clears both promotional banner sources when an uploaded banner is removed", async () => {
    const offerWithUploadedBanner: SupportServiceOfferRecord = {
      ...hiddenOffer,
      promotionalBannerImageUrl: null,
      promotionalBannerImageUploadDataUrl:
        "data:image/png;base64,c2VydmljZS1iYW5uZXI=",
    };
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        return { offer: { ...offerWithUploadedBanner, ...payload } };
      }
      if (
        String(path).includes("provider-siblings") ||
        String(path).includes("?limit=")
      ) {
        return { offers: [], nextCursor: undefined };
      }
      return { offer: offerWithUploadedBanner };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="edit"
        offerId={offerWithUploadedBanner.id}
      />,
    );

    const bannerSection = await screen.findByTestId(
      "service-offer-promotional-banner-section",
    );
    fireEvent.click(
      within(bannerSection).getByRole("button", {
        name: "Remove uploaded banner image",
      }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await acknowledgeExistingOfferContract();

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.promotionalBannerImageUrl).toBeNull();
      expect(payload.promotionalBannerImageUploadDataUrl).toBeNull();
    });
  });

  it("generates, checks, rejects, and regenerates a five-digit service ID", async () => {
    jest
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.01234)
      .mockReturnValue(0.98765);
    let resolveFirstAvailability:
      | ((value: {
          serviceId: string;
          available: boolean;
          conflictingOfferId?: string;
        }) => void)
      | undefined;
    const firstAvailability = new Promise<{
      serviceId: string;
      available: boolean;
      conflictingOfferId?: string;
    }>((resolve) => {
      resolveFirstAvailability = resolve;
    });

    sdkFetchMock.mockImplementation(async (path) => {
      const value = String(path);
      if (value.startsWith("/discover/organizations?")) {
        return {
          organizations: [
            {
              id: "feed-org-diagnostics",
              name: "Pocket Genes Diagnostics",
              status: "active",
              organizationType: "laboratory",
            },
          ],
          nextCursor: undefined,
        };
      }
      if (
        value.startsWith(
          "/admin/support-services/offers/service-id-availability?",
        )
      ) {
        const params = new URLSearchParams(value.split("?")[1]);
        const serviceId = params.get("serviceId") ?? "";
        if (serviceId === "pgs_pocket_genes_diagnostics_11110") {
          return firstAvailability;
        }
        return { serviceId, available: true };
      }
      return { offers: [], nextCursor: undefined };
    });

    renderWithQueryClient(<SupportServiceOfferWorkbench mode="create" />);

    fireEvent.click(screen.getByRole("button", { name: "Choose provider" }));
    const providerName = await screen.findByText("Pocket Genes Diagnostics");
    fireEvent.click(
      within(providerName.closest("tr")!).getByRole("button", {
        name: "Select",
      }),
    );

    expect(
      await screen.findByText("Generating and checking service ID..."),
    ).toBeTruthy();
    expect(
      screen.getByText("pgs_pocket_genes_diagnostics_11110"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Save draft" })
        .hasAttribute("disabled"),
    ).toBe(true);

    await act(async () => {
      resolveFirstAvailability?.({
        serviceId: "pgs_pocket_genes_diagnostics_11110",
        available: false,
        conflictingOfferId: "offer-existing",
      });
      await firstAvailability;
    });

    expect(await screen.findByText("Service ID already exists.")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Regenerate service ID" }),
    );

    expect(
      await screen.findByText("pgs_pocket_genes_diagnostics_98888"),
    ).toBeTruthy();
    expect(await screen.findByText("Service ID is available.")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Save draft" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen.getByTestId("service-identity-row").classList.contains(
        "md:grid-cols-2",
      ),
    ).toBe(true);
  });

  it("locks an existing service ID and animates each persisted version bump", async () => {
    let persistedVersion = hiddenOffer.serviceVersion;
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        persistedVersion += 1;
        const payload = JSON.parse(String(init.body));
        return {
          offer: {
            ...hiddenOffer,
            ...payload,
            serviceId: hiddenOffer.serviceId,
            serviceVersion: persistedVersion,
          },
        };
      }
      return { offer: hiddenOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
    );

    expect(
      await screen.findByText("Service ID is fixed for this existing offer."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Regenerate service ID" }),
    ).toBeNull();
    expect(
      sdkFetchMock.mock.calls.some(([path]) =>
        String(path).includes("service-id-availability"),
      ),
    ).toBe(false);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Save changes" })[0],
    );
    await acknowledgeExistingOfferContract();

    expect(await screen.findByTestId("service-version-bump")).toBeTruthy();
    expect(
      screen.getByTestId("service-version-generated-value").textContent,
    ).toContain("v2");
    expect(
      screen.getByTestId("service-version-generated-value").textContent,
    ).toContain("+1");
  });

  it("shows generated request-form identity labels and animates a persisted form version bump", async () => {
    const offerWithForm: SupportServiceOfferRecord = {
      ...hiddenOffer,
      formShape: {
        id: "pgfs_frozen_lab_1",
        version: 2,
        allowUnknownFields: false,
        fields: [],
      },
      inputSlots: [
        {
          role: "form",
          objectType: "pgo_form",
          acceptedTypes: ["pgo_form"],
          required: true,
          cardinality: { min: 1, max: 1 },
        },
      ],
      changeLogFormShapeByVersion: {},
    };
    sdkFetchMock.mockImplementation(async (_path, init) => {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        expect(payload.formShape.version).toBe(2);
        expect(payload).not.toHaveProperty("changeLogFormShapeByVersion");
        return {
          offer: {
            ...offerWithForm,
            ...payload,
            serviceVersion: offerWithForm.serviceVersion + 1,
            formShape: {
              ...payload.formShape,
              version: 3,
            },
            changeLogFormShapeByVersion: {
              v2_to_v3: {
                en: "Request form changes from v2 to v3.",
                es: "Cambios del formulario de solicitud de v2 a v3.",
              },
            },
          },
        };
      }
      return { offer: offerWithForm };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={offerWithForm.id} />,
    );

    const formId = await screen.findByTestId("form-shape-id-generated-value");
    expect(formId.textContent).toContain("pgfs_frozen_lab_1");
    expect(formId.textContent).toContain(
      "Request form ID is fixed for this existing offer.",
    );
    expect(within(formId).queryByRole("textbox")).toBeNull();

    const formVersion = screen.getByTestId(
      "form-shape-version-generated-value",
    );
    expect(formVersion.textContent).toContain("v2");
    expect(within(formVersion).queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    const fieldDialog = await screen.findByRole("dialog", {
      name: "Add form field",
    });
    fireEvent.change(within(fieldDialog).getByLabelText("Key"), {
      target: { value: "delivery_email" },
    });
    fireEvent.change(within(fieldDialog).getByLabelText("Label"), {
      target: { value: "Delivery email" },
    });
    fireEvent.click(
      within(fieldDialog).getByRole("button", { name: "Save field" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Save changes" })[0],
    );
    await acknowledgeExistingOfferContract();

    expect(await screen.findByTestId("form-shape-version-bump")).toBeTruthy();
    expect(
      screen.getByTestId("form-shape-version-generated-value").textContent,
    ).toContain("v3");
  });

  it("shows the localized offer change log as a chronological read-only history", async () => {
    const offerWithHistory: SupportServiceOfferRecord = {
      ...hiddenOffer,
      serviceVersion: 3,
      changeLogHistoryByVersion: {
        v1_to_v2: {
          en: [
            "Service offer changes from v1 to v2:",
            "· Service version increased from 1 to 2.",
            '· Description changed from "Initial report" to "Reviewed report".',
          ].join("\n"),
          es: [
            "Cambios de la oferta de servicio de v1 a v2:",
            "· La versión del servicio aumentó de 1 a 2.",
            '· Descripción cambió de "Informe inicial" a "Informe revisado".',
          ].join("\n"),
        },
        v2_to_v3: {
          en: [
            "Service offer changes from v2 to v3:",
            "· Service version increased from 2 to 3.",
            "· Turnaround changed from 2d to 1d.",
          ].join("\n"),
          es: [
            "Cambios de la oferta de servicio de v2 a v3:",
            "· La versión del servicio aumentó de 2 a 3.",
            "· Tiempo de entrega cambió de 2d a 1d.",
          ].join("\n"),
        },
      },
    };
    sdkFetchMock.mockImplementation(async (path) => {
      if (String(path).endsWith("/transaction-stats")) {
        return {
          offerId: offerWithHistory.id,
          currentServiceVersion: 3,
          totalTransactions: 0,
          activeTransactions: 0,
          terminalTransactions: 0,
          currentVersionActiveTransactions: 0,
          outdatedActiveTransactions: 0,
          versions: [],
        };
      }
      return { offer: offerWithHistory };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="edit"
        offerId={offerWithHistory.id}
      />,
      "es",
    );

    const historySection = await screen.findByTestId(
      "service-offer-version-history",
    );
    const trigger = within(historySection).getByRole("button", {
      name: /Historial de versiones/,
    });
    expect(within(trigger).getByText("2 cambios de versión")).toBeTruthy();
    expect(within(trigger).getByText("Solo lectura")).toBeTruthy();
    expect(
      within(historySection).queryByRole("article", {
        name: "Transición de versión v1 a v2",
      }),
    ).toBeNull();

    fireEvent.click(trigger);

    const historyDialog = await screen.findByRole("dialog", {
      name: "Historial de versiones",
    });
    expect(historyDialog.className).toContain("90rem");
    expect(historyDialog.className).toContain("max-h-[92vh]");
    expect(historyDialog.className).toContain("overflow-hidden");
    const scrollViewport = within(historyDialog).getByTestId(
      "service-offer-version-history-scroll",
    );
    expect(scrollViewport.className).toContain("overflow-y-auto");
    expect(scrollViewport.className).toContain("min-h-0");

    const transitions = within(historyDialog).getAllByRole("article");
    expect(
      transitions.map((transition) => transition.getAttribute("aria-label")),
    ).toEqual([
      "Transición de versión v1 a v2",
      "Transición de versión v2 a v3",
    ]);
    expect(within(transitions[0]!).getByText("v1_to_v2")).toBeTruthy();
    expect(
      within(transitions[0]!).getByText(
        'Descripción cambió de "Informe inicial" a "Informe revisado".',
      ),
    ).toBeTruthy();
    expect(within(transitions[1]!).getByText("Versión actual")).toBeTruthy();
    expect(
      within(transitions[1]!).getByText(
        "Tiempo de entrega cambió de 2d a 1d.",
      ),
    ).toBeTruthy();
    transitions.forEach((transition) => {
      expect(
        transition.querySelector("input, textarea, select, button"),
      ).toBeNull();
    });
    expect(
      within(historyDialog).queryByText("Turnaround changed from 2d to 1d."),
    ).toBeNull();
    fireEvent.click(
      within(historyDialog).getByRole("button", { name: "Cerrar" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Historial de versiones" }),
      ).toBeNull();
    });
  });

  it("shows finished counts and three ordered transaction charts on offer detail", async () => {
    const versionedOffer: SupportServiceOfferRecord = {
      ...hiddenOffer,
      serviceVersion: 3,
    };
    sdkFetchMock.mockImplementation(async (path) => {
      if (String(path).endsWith("/transaction-stats")) {
        return {
          offerId: versionedOffer.id,
          currentServiceVersion: 3,
          totalTransactions: 12,
          activeTransactions: 7,
          terminalTransactions: 5,
          currentVersionActiveTransactions: 2,
          outdatedActiveTransactions: 5,
          versions: [
            {
              serviceVersion: 1,
              totalTransactions: 5,
              activeTransactions: 3,
              terminalTransactions: 2,
            },
            {
              serviceVersion: 2,
              totalTransactions: 4,
              activeTransactions: 2,
              terminalTransactions: 2,
            },
            {
              serviceVersion: 3,
              totalTransactions: 3,
              activeTransactions: 2,
              terminalTransactions: 1,
            },
          ],
        };
      }
      return { offer: versionedOffer };
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench
        mode="edit"
        offerId={versionedOffer.id}
      />,
      "es",
    );

    const statsTrigger = await screen.findByRole("button", {
      name: "Número de solicitudes activas",
    });
    const statsSection = screen.getByTestId(
      "service-offer-transaction-stats",
    );
    const statusSection = screen
      .getByRole("heading", { name: "Estado de la oferta de servicio" })
      .closest("section");
    expect(statusSection).not.toBeNull();
    expect(
      statsSection.compareDocumentPosition(statusSection!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      sdkFetchMock.mock.calls.filter(([path]) =>
        String(path).endsWith("/transaction-stats"),
      ),
    ).toHaveLength(0);
    expect(
      screen.queryByTestId("service-offer-active-transactions"),
    ).toBeNull();

    fireEvent.click(statsTrigger);

    const statsDialog = await screen.findByRole("dialog", {
      name: "Número de solicitudes activas",
    });
    expect(statsDialog.className).toContain("90rem");
    expect(statsDialog.className).toContain("max-h-[92vh]");
    expect(statsDialog.className).toContain("overflow-hidden");
    const statsScrollViewport = within(statsDialog).getByTestId(
      "service-offer-transaction-stats-scroll",
    );
    expect(statsScrollViewport.className).toContain("overflow-y-auto");
    expect(statsScrollViewport.className).toContain("min-h-0");

    await waitFor(() => {
      expect(
        sdkFetchMock.mock.calls.filter(([path]) =>
          String(path).endsWith("/transaction-stats"),
        ),
      ).toHaveLength(1);
    });
    expect(
      (await screen.findByTestId("service-offer-active-transactions"))
        .textContent,
    ).toBe("7");
    expect(
      screen.getByTestId("service-offer-finished-transactions").textContent,
    ).toBe("5");
    expect(screen.queryByText("Total vinculadas")).toBeNull();
    expect(
      screen.getByTestId("service-offer-current-version-transactions")
        .textContent,
    ).toBe("2");
    expect(
      screen.getByTestId("service-offer-outdated-transactions").textContent,
    ).toBe("5");
    expect(
      screen.getByRole("img", {
        name: /Transacciones totales por estado: Transacciones activas 7, Transacciones finalizadas 5/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /Transacciones activas según la vigencia de la versión: Activas en la versión actual 2, Activas en versiones anteriores 5/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /v3 2, v2 2, v1 3/,
      }),
    ).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    const versionLegendItems = within(
      screen.getByTestId("service-offer-active-by-version-chart-legend"),
    ).getAllByTestId("service-offer-active-by-version-chart-legend-item");
    expect(
      versionLegendItems.map((item) =>
        within(item).getByText(/^v\d+$/).textContent,
      ),
    ).toEqual(["v3", "v2", "v1"]);
    expect(versionLegendItems[0]?.getAttribute("data-color")).toBe(
      "#059669",
    );
    expect(screen.getByText("Contrato actual")).toBeTruthy();

    fireEvent.click(
      within(statsDialog).getByRole("button", { name: "Cerrar" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Número de solicitudes activas",
        }),
      ).toBeNull();
    });
    fireEvent.click(statsTrigger);
    await screen.findByRole("dialog", {
      name: "Número de solicitudes activas",
    });
    await waitFor(() => {
      expect(
        sdkFetchMock.mock.calls.filter(([path]) =>
          String(path).endsWith("/transaction-stats"),
        ),
      ).toHaveLength(1);
    });
  });

  it("loads additional active offers for assisted creation without excluding hidden offers", async () => {
    const firstOffer: SupportServiceOfferRecord = {
      ...hiddenOffer,
      id: "offer-visible",
      name: "Visible active service",
      serviceId: "pgs_visible_lab_1",
      isHiddenFromSearch: false,
    };

    sdkFetchMock.mockImplementation(async (path) => {
      const value = String(path);
      if (!value.startsWith("/admin/support-services/offers?")) {
        throw new Error(`Unexpected SDK path: ${value}`);
      }
      const params = new URLSearchParams(value.split("?")[1]);
      expect(params.get("limit")).toBe("20");
      expect(params.get("status")).toBe("active");
      expect(params.has("isHiddenFromSearch")).toBe(false);
      if (params.get("cursor") === "active-page-2") {
        return { offers: [hiddenOffer], nextCursor: undefined };
      }
      return { offers: [firstOffer], nextCursor: "active-page-2" };
    });

    renderWithQueryClient(<SupportServiceTransactionWorkbench mode="create" />);

    expect(await screen.findByText("Visible active service")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(
        sdkFetchMock.mock.calls.some(([path]) =>
          String(path).includes("cursor=active-page-2"),
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("combobox"));
    expect(
      await screen.findAllByText(
        `${hiddenOffer.name} (${hiddenOffer.serviceId}, ${hiddenOffer.providerName})`,
      ),
    ).not.toHaveLength(0);
  });

  it("picks one community user and locks the requester email to that account", async () => {
    let postedPayload: Record<string, unknown> | undefined;
    sdkFetchMock.mockImplementation(async (path, init) => {
      const value = String(path);
      if (value.startsWith("/admin/support-services/offers?")) {
        return { offers: [hiddenOffer], nextCursor: undefined };
      }
      if (value === "/users") {
        return {
          users: [
            {
              uid: "auth-only-user",
              email: "auth-only@example.org",
              displayName: "Auth only",
              emailVerified: true,
              disabled: false,
              createdAt: "",
              lastSignInAt: "",
              photoURL: null,
              conditions: [],
              onboardingCompleted: true,
              hiddenFields: [],
              iconName: "person.crop.circle.fill",
              iconColorHex: "#5A4FCF",
              linkedRecords: {
                profile: true,
                publicProfile: false,
                communityUser: false,
                reportOwner: false,
                userProgress: false,
              },
            },
            {
              uid: "community-user-1",
              email: "requester@example.org",
              displayName: "Ada Requester",
              emailVerified: true,
              disabled: false,
              createdAt: "",
              lastSignInAt: "",
              photoURL: null,
              conditions: [],
              onboardingCompleted: true,
              hiddenFields: [],
              iconName: "person.crop.circle.fill",
              iconColorHex: "#5A4FCF",
              linkedRecords: {
                profile: true,
                publicProfile: true,
                communityUser: true,
                reportOwner: false,
                userProgress: false,
              },
            },
          ],
        };
      }
      if (
        value === "/admin/support-services/transactions" &&
        init?.method === "POST"
      ) {
        postedPayload = JSON.parse(String(init.body));
        return {
          transaction: {
            requestId: String(postedPayload?.requestId),
          },
        };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(<SupportServiceTransactionWorkbench mode="create" />);

    await screen.findByText(hiddenOffer.name);
    expect(screen.queryByText("Auth only")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pick a user" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Choose requester",
    });
    expect(dialog.className).toContain("86rem");
    expect(within(dialog).queryByText("Auth only")).toBeNull();
    const communityUserRow = await within(dialog).findByRole("radio", {
      name: /Ada Requester/,
    });
    fireEvent.click(communityUserRow);
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply user" }));

    expect(await screen.findByText("community-user-1")).toBeTruthy();
    const emailInput = screen.getByPlaceholderText(
      "Enter an email when no user is linked",
    ) as HTMLInputElement;
    expect(emailInput.value).toBe("requester@example.org");
    expect(emailInput.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(postedPayload).toEqual(
        expect.objectContaining({
          requestedByUserId: "community-user-1",
          requestedByUserEmail: "requester@example.org",
        }),
      );
    });
  });

  it("creates an email-only requester payload when no community user is linked", async () => {
    let postedPayload: Record<string, unknown> | undefined;
    sdkFetchMock.mockImplementation(async (path, init) => {
      const value = String(path);
      if (value.startsWith("/admin/support-services/offers?")) {
        return { offers: [hiddenOffer], nextCursor: undefined };
      }
      if (
        value === "/admin/support-services/transactions" &&
        init?.method === "POST"
      ) {
        postedPayload = JSON.parse(String(init.body));
        return {
          transaction: {
            requestId: String(postedPayload?.requestId),
          },
        };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(<SupportServiceTransactionWorkbench mode="create" />);

    await screen.findByText(hiddenOffer.name);
    const emailInput = screen.getByPlaceholderText(
      "Enter an email when no user is linked",
    ) as HTMLInputElement;
    expect(emailInput.disabled).toBe(false);
    fireEvent.change(emailInput, {
      target: { value: "Future.User@Example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(postedPayload).toEqual(
        expect.objectContaining({
          requestedByUserEmail: "future.user@example.org",
        }),
      );
    });
    expect(postedPayload).not.toHaveProperty("requestedByUserId");
  });

  it("exports the persisted service transaction record as raw JSON", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      if (
        String(path).endsWith(`/transactions/${deliveredTransaction.requestId}`)
      ) {
        return { transaction: deliveredTransaction };
      }
      if (String(path).endsWith(`/offers/${deliveredTransaction.offerId}`)) {
        return { offer: currentLiveOffer };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={deliveredTransaction.requestId}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Export raw file" }),
    );

    expect(await screen.findByText("Service transaction raw JSON")).toBeTruthy();
    expect(
      screen.getByText("service-transaction-pgr_frozen_1.json"),
    ).toBeTruthy();
    expect(
      screen.getByText((content) =>
        content.includes('"requestId": "pgr_frozen_1"'),
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeTruthy();
  });

  it("manages optional linked reports in a rich grid without changing a terminal transaction status", async () => {
    const existingReport: SupportServiceLinkedReportRecord = {
      reportCode: "ABC123",
      available: true,
      uploadedReportId: "uploaded-report-1",
      fileName: "Clinical report.pdf",
      providerFormat: "pdf",
      providerName: "Pocket Genes Lab",
      trackingStatus: "document_ready",
      downloadUrl: "https://example.org/reports/ABC123.pdf",
      uploadVersionCount: 3,
      ownerName: "Patient Example",
    };
    const candidateReport: SupportServiceLinkedReportRecord = {
      reportCode: "XYZ789",
      available: true,
      uploadedReportId: "uploaded-report-2",
      fileName: "Genome report.pdf",
      providerFormat: "pdf",
      providerName: "Genome Lab",
      trackingStatus: "document_ready",
      linkedFileId: "report-file-2",
      uploadVersionCount: 2,
      ownerEmail: "patient@example.org",
    };
    let storedTransaction = deliveredTransaction;
    let linkedReports: SupportServiceLinkedReportRecord[] = [existingReport];

    sdkFetchMock.mockImplementation(async (path, init) => {
      const value = String(path);
      if (
        value.endsWith(`/transactions/${deliveredTransaction.requestId}`) &&
        !init?.method
      ) {
        return { transaction: storedTransaction };
      }
      if (value.endsWith(`/offers/${deliveredTransaction.offerId}`)) {
        return { offer: currentLiveOffer };
      }
      if (value.endsWith("/output-reports") && !init?.method) {
        return { reports: linkedReports };
      }
      if (value.includes("/output-reports/candidates?") && !init?.method) {
        return { reports: [candidateReport] };
      }
      if (value.endsWith("/output-reports") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ reportCode: "XYZ789" });
        storedTransaction = {
          ...storedTransaction,
          requestRevision: storedTransaction.requestRevision + 1,
          outputReports: [
            ...storedTransaction.outputReports,
            { reportCode: "XYZ789" },
          ],
        };
        linkedReports = [...linkedReports, candidateReport];
        return { transaction: storedTransaction, report: candidateReport };
      }
      if (
        value.endsWith("/output-reports/ABC123") &&
        init?.method === "DELETE"
      ) {
        storedTransaction = {
          ...storedTransaction,
          requestRevision: storedTransaction.requestRevision + 1,
          outputReports: storedTransaction.outputReports.filter(
            (report) => report.reportCode !== "ABC123",
          ),
        };
        linkedReports = linkedReports.filter(
          (report) => report.reportCode !== "ABC123",
        );
        return { transaction: storedTransaction, reportCode: "ABC123" };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={deliveredTransaction.requestId}
      />,
    );

    const existingCard = await screen.findByRole("article", {
      name: "Linked report · ABC123",
    });
    expect(within(existingCard).getByText("Clinical report.pdf")).toBeTruthy();
    expect(within(existingCard).getAllByText("PDF")).toHaveLength(2);
    expect(within(existingCard).getByText("Pocket Genes Lab")).toBeTruthy();
    expect(within(existingCard).getByText("Patient Example")).toBeTruthy();
    expect(screen.queryByLabelText("Optional report codes")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Link report" }));
    expect(
      await screen.findByRole("dialog", { name: "Choose an existing report" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search reports by code" }), {
      target: { value: "xyz789" },
    });
    const candidate = await screen.findByRole("button", { name: /XYZ789/ });
    fireEvent.click(candidate);
    fireEvent.click(
      screen.getByRole("button", { name: "Link selected report" }),
    );

    const addedCard = await screen.findByRole("article", {
      name: "Linked report · XYZ789",
    });
    expect(addedCard.className).toContain("animate-in");
    expect(within(addedCard).getByText("Genome report.pdf")).toBeTruthy();
    expect(storedTransaction.status).toBe("delivered");

    fireEvent.click(within(existingCard).getByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("article", { name: "Linked report · ABC123" }),
      ).toBeNull();
    });
    expect(confirmSpy).toHaveBeenCalledWith(
      "Remove this report from the transaction?",
    );
    expect(storedTransaction.status).toBe("delivered");
  });

  it("edits against the frozen contract, preserves rich inputs, and cannot reopen a terminal transaction", async () => {
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        return { transaction: deliveredTransaction };
      }
      if (
        String(path).endsWith(`/transactions/${deliveredTransaction.requestId}`)
      ) {
        return { transaction: deliveredTransaction };
      }
      if (String(path).endsWith(`/offers/${deliveredTransaction.offerId}`)) {
        return { offer: currentLiveOffer };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={deliveredTransaction.requestId}
      />,
    );

    expect(await screen.findByText("Accepted frozen service")).toBeTruthy();
    expect(
      await screen.findByText(
        "Current changed service · live_input:DNA -> live_result:VCF",
      ),
    ).toBeTruthy();
    expect(screen.getByText("form")).toBeTruthy();
    expect(screen.queryByText("live_input")).toBeNull();
    expect(
      screen.getByText("Terminal transactions cannot be reopened."),
    ).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Ready object linked · result",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    const inputBinding = screen.getByRole("article", {
      name: "Input object bindings · form",
    });
    expect(inputBinding.querySelector("input, textarea, select")).toBeNull();
    [
      ["Object ID", "obj_form_1"],
      ["Revision", "2"],
      ["Object code", "123456789"],
      ["Uploaded object ID", "uploaded-form-1"],
      ["File storage ID", "file-form-1"],
      ["Object owner ID", "owner-form-1"],
    ].forEach(([label, value]) => {
      expect(within(inputBinding).getByText(label)).toBeTruthy();
      expect(within(inputBinding).getByText(value)).toBeTruthy();
    });
    expect(screen.queryByLabelText("Object ID · form")).toBeNull();
    expect(screen.queryByLabelText("Revision · form")).toBeNull();
    expect(screen.queryByLabelText("Object code · form")).toBeNull();
    expect(screen.queryByLabelText("Uploaded object ID · form")).toBeNull();
    expect(screen.queryByLabelText("File storage ID · form")).toBeNull();
    expect(screen.queryByLabelText("Object owner ID · form")).toBeNull();
    expect(screen.queryByLabelText("Object snapshot · form")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "View object snapshot" }),
    );
    expect(await screen.findByText("Object snapshot preview")).toBeTruthy();
    expect(screen.getByText(/preserve me/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);

    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      sdkFetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);

    expect(sdkFetchMock).toHaveBeenCalledWith(
      `/admin/support-services/offers/${deliveredTransaction.offerId}`,
    );
  });

  it("renders every running transaction input as one read-only information card", async () => {
    const transactionWithMultipleInputs: SupportServiceTransactionRecord = {
      ...runningTransaction,
      id: "pgr_running_read_only_inputs",
      requestId: "pgr_running_read_only_inputs",
      inputs: [
        ...deliveredTransaction.inputs,
        {
          role: "sample",
          objectRef: { objectId: "obj_sample_1", revision: 4 },
          objectType: "pgo_dna_sample",
          objectSnapshot: {
            objectId: "obj_sample_1",
            objectType: "pgo_dna_sample",
            revision: 4,
          },
        },
      ],
      offerSnapshot: {
        ...frozenOfferSnapshot,
        inputSlots: [
          ...frozenOfferSnapshot.inputSlots,
          {
            role: "sample",
            objectType: "pgo_dna_sample",
            acceptedTypes: ["pgo_dna_sample"],
            required: false,
            cardinality: { min: 0, max: 1 },
          },
        ],
      },
    };

    sdkFetchMock.mockImplementation(async (path) => {
      if (
        String(path).endsWith(
          `/transactions/${transactionWithMultipleInputs.requestId}`,
        )
      ) {
        return { transaction: transactionWithMultipleInputs };
      }
      if (
        String(path).endsWith(
          `/offers/${transactionWithMultipleInputs.offerId}`,
        )
      ) {
        return { offer: currentLiveOffer };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={transactionWithMultipleInputs.requestId}
      />,
    );

    const formBinding = await screen.findByRole("article", {
      name: "Input object bindings · form",
    });
    const sampleBinding = screen.getByRole("article", {
      name: "Input object bindings · sample",
    });

    for (const binding of [formBinding, sampleBinding]) {
      expect(binding.querySelector("input, textarea, select")).toBeNull();
      [
        "Object ID",
        "Revision",
        "Object code",
        "Uploaded object ID",
        "File storage ID",
        "Object owner ID",
      ].forEach((label) => {
        expect(within(binding).getByText(label)).toBeTruthy();
      });
    }

    expect(within(sampleBinding).getByText("obj_sample_1")).toBeTruthy();
    expect(within(sampleBinding).getByText("4")).toBeTruthy();
    expect(within(sampleBinding).getAllByText("—")).toHaveLength(4);
  });

  it("saves editable transaction fields without resubmitting frozen input evidence", async () => {
    const editableTransaction: SupportServiceTransactionRecord = {
      ...deliveredTransaction,
      id: "pgr_editable_1",
      requestId: "pgr_editable_1",
      status: "running",
      requestRevision: 2,
      normalizedName: "pgr editable 1",
      inputs: deliveredTransaction.inputs.map((input) => ({
        ...input,
        objectSnapshot: {
          ...input.objectSnapshot,
          data: {
            form_shape: { fields: [] },
            fields: [],
          },
        },
      })),
    };

    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        return { transaction: editableTransaction };
      }
      if (String(path).endsWith(`/transactions/${editableTransaction.requestId}`)) {
        return { transaction: editableTransaction };
      }
      if (String(path).endsWith(`/offers/${editableTransaction.offerId}`)) {
        return { offer: currentLiveOffer };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={editableTransaction.requestId}
      />,
    );

    await screen.findByText("Accepted frozen service");
    await screen.findAllByText("Running");
    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => {
      expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([path, init]) =>
          String(path).includes("/transactions/") && init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));

      expect(payload.status).toBe("running");
      expect(payload.requestedAtClient).toBe(
        editableTransaction.requestedAtClient,
      );
      expect(payload).not.toHaveProperty("inputs");
      expect(payload.outputObjects).toEqual(editableTransaction.outputObjects);
      expect(payload).not.toHaveProperty("outputReports");
      expect(payload.issues).toEqual(editableTransaction.issues);
      expect(payload.offerSnapshot).toEqual(frozenOfferSnapshot);
      expect(payload.providerSnapshot).toEqual(
        editableTransaction.providerSnapshot,
      );
      expect(payload).not.toHaveProperty("outputs");
      expect(payload).not.toHaveProperty("requesterEmail");
      expect(payload).not.toHaveProperty("subjectId");
      expect(payload).not.toHaveProperty("notes");
    });
  });

  it("creates each frozen output object through the upload flow and delivers only through the dedicated action", async () => {
    const uploadedTransaction: SupportServiceTransactionRecord = {
      ...runningTransaction,
      requestRevision: 3,
      outputObjects: [
        {
          role: "result",
          objectType: "pgo_pdf_report",
          objectCode: "246813579",
        },
      ],
    };
    const finalTransaction: SupportServiceTransactionRecord = {
      ...uploadedTransaction,
      requestRevision: 4,
      status: "delivered",
    };
    let storedTransaction = runningTransaction;
    let resolveUpload: (() => void) | undefined;

    sdkFetchMock.mockImplementation(async (path, init) => {
      const value = String(path);
      if (
        value.endsWith(`/transactions/${runningTransaction.requestId}`) &&
        !init?.method
      ) {
        return { transaction: storedTransaction };
      }
      if (value.endsWith(`/offers/${runningTransaction.offerId}`)) {
        return { offer: currentLiveOffer };
      }
      if (value.endsWith("/output-objects") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        expect(payload).toEqual({
          role: "result",
          downloadUrl: "https://example.org/result.pgobject.json",
        });
        expect(payload).not.toHaveProperty("objectType");
        await new Promise<void>((resolve) => {
          resolveUpload = resolve;
        });
        storedTransaction = uploadedTransaction;
        return {
          transaction: uploadedTransaction,
          object: {
            id: "uploaded-result-1",
            role: "result",
            objectCode: "246813579",
            objectType: "pgo_pdf_report",
            fileName: "result.pgobject.json",
            downloadUrl: "https://example.org/result.pgobject.json",
            status: "ready",
          },
        };
      }
      if (value.endsWith("/deliver") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({});
        storedTransaction = finalTransaction;
        return { transaction: finalTransaction };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={runningTransaction.requestId}
      />,
    );

    const uploadSlot = await screen.findByRole("button", {
      name: "Upload output object · result",
    });
    expect(screen.queryByText("live_result")).toBeNull();
    const issuesInput = screen.getByPlaceholderText("Issues JSON array");
    fireEvent.change(issuesInput, {
      target: { value: '[{"code":"unsaved"}]' },
    });
    expect((uploadSlot as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(
        "Save other transaction changes before uploading output objects.",
      ),
    ).toBeTruthy();
    fireEvent.change(issuesInput, { target: { value: "[]" } });
    await waitFor(() => {
      expect((uploadSlot as HTMLButtonElement).disabled).toBe(false);
    });

    const statusPicker = screen.getByRole("combobox", {
      name: "Transaction status options",
    });
    fireEvent.click(statusPicker);
    expect(screen.queryByRole("option", { name: "Delivered" })).toBeNull();
    fireEvent.keyDown(statusPicker, { key: "Escape" });

    const deliverButton = screen.getByRole("button", {
      name: "Mark as delivered",
    }) as HTMLButtonElement;
    const transactionFooter = deliverButton.closest(".sticky");
    expect(transactionFooter).toBeTruthy();
    expect(
      transactionFooter?.contains(
        screen.getByRole("button", { name: "Save" }),
      ),
    ).toBe(true);
    expect(deliverButton.disabled).toBe(true);

    fireEvent.click(uploadSlot);
    expect(
      screen.getByRole("button", { name: "Continue with download URL" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continue with file ID" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Download URL")).toBeNull();
    expect(screen.queryByLabelText("File ID")).toBeNull();
    expect(screen.queryByLabelText("File name")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with download URL" }),
    );
    expect(screen.getByLabelText("Download URL")).toBeTruthy();
    expect(screen.queryByLabelText("File ID")).toBeNull();
    expect(screen.queryByLabelText("File name")).toBeNull();
    fireEvent.change(screen.getByLabelText("Download URL"), {
      target: { value: "https://example.org/discarded.pgobject.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with download URL" }),
    );
    expect(
      (screen.getByLabelText("Download URL") as HTMLInputElement).value,
    ).toBe("");
    fireEvent.change(screen.getByLabelText("Download URL"), {
      target: { value: "https://example.org/result.pgobject.json" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create and link object" }),
    );

    const creatingButton = await screen.findByRole("button", {
      name: "Creating object...",
    });
    expect((creatingButton as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    await act(async () => {
      resolveUpload?.();
    });

    expect(await screen.findByText("246813579")).toBeTruthy();
    expect(screen.getByText("Request revision").parentElement?.textContent).toContain(
      "3",
    );
    await waitFor(() => {
      expect(deliverButton.disabled).toBe(false);
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Ready object linked · result",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(deliverButton);

    await waitFor(() => {
      expect(
        sdkFetchMock.mock.calls.some(
          ([path, init]) =>
            String(path).endsWith("/deliver") && init?.method === "POST",
        ),
      ).toBe(true);
    });
    expect(
      await screen.findByText("Service transaction marked as delivered."),
    ).toBeTruthy();

    const issuesHeading = screen.getByRole("heading", { name: "Issues" });
    const statusHeading = screen.getByRole("heading", {
      name: "Transaction status",
    });
    expect(
      issuesHeading.compareDocumentPosition(statusHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("creates and links an output object from only a File Storage file ID", async () => {
    const uploadedTransaction: SupportServiceTransactionRecord = {
      ...runningTransaction,
      requestRevision: 3,
      outputObjects: [
        {
          role: "result",
          objectType: "pgo_pdf_report",
          objectCode: "135792468",
        },
      ],
    };
    let storedTransaction = runningTransaction;

    sdkFetchMock.mockImplementation(async (path, init) => {
      const value = String(path);
      if (
        value.endsWith(`/transactions/${runningTransaction.requestId}`) &&
        !init?.method
      ) {
        return { transaction: storedTransaction };
      }
      if (value.endsWith(`/offers/${runningTransaction.offerId}`)) {
        return { offer: currentLiveOffer };
      }
      if (value.endsWith("/output-objects") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        expect(payload).toEqual({
          role: "result",
          fileStorageId: "stored-file-123",
        });
        expect(payload).not.toHaveProperty("fileName");
        expect(payload).not.toHaveProperty("downloadUrl");
        storedTransaction = uploadedTransaction;
        return {
          transaction: uploadedTransaction,
          object: {
            id: "uploaded-result-from-file-1",
            role: "result",
            objectCode: "135792468",
            objectType: "pgo_pdf_report",
            fileName: "stored-result.pgobject.json",
            fileStorageId: "stored-file-123",
            status: "ready",
          },
        };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={runningTransaction.requestId}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Upload output object · result",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with file ID" }),
    );

    expect(screen.getByLabelText("File ID")).toBeTruthy();
    expect(screen.queryByLabelText("Download URL")).toBeNull();
    expect(screen.queryByLabelText("File name")).toBeNull();
    fireEvent.change(screen.getByLabelText("File ID"), {
      target: { value: "stored-file-123" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create and link object" }),
    );

    expect(await screen.findByText("135792468")).toBeTruthy();
  });

  it("creates a new validated stored file before linking it and reuses it after a partial failure", async () => {
    const uploadedTransaction: SupportServiceTransactionRecord = {
      ...runningTransaction,
      requestRevision: 3,
      outputObjects: [
        {
          role: "result",
          objectType: "pgo_pdf_report",
          objectCode: "112233445",
        },
      ],
    };
    const operationOrder: string[] = [];
    let outputAttempts = 0;
    let storedTransaction = runningTransaction;

    sdkFetchMock.mockImplementation(async (path, init) => {
      const value = String(path);
      if (
        value.endsWith(`/transactions/${runningTransaction.requestId}`) &&
        !init?.method
      ) {
        return { transaction: storedTransaction };
      }
      if (value.endsWith(`/offers/${runningTransaction.offerId}`)) {
        return { offer: currentLiveOffer };
      }
      if (value === "/file-storage" && init?.method === "POST") {
        operationOrder.push("create-file");
        const payload = JSON.parse(String(init.body));
        expect(payload).toEqual({
          data: {
            file_name: "Final result",
            file_type: "pgo_pdf_report",
            file_content:
              '{"title":"Final result","download_url":"https://example.org/final.pdf"}',
          },
        });
        return {
          document: {
            id: "stored-file-new-1",
            path: "file_storage/stored-file-new-1",
            collection: "file_storage",
            data: payload.data,
          },
        };
      }
      if (value.endsWith("/output-objects") && init?.method === "POST") {
        operationOrder.push("link-object");
        const payload = JSON.parse(String(init.body));
        expect(payload).toEqual({
          role: "result",
          fileStorageId: "stored-file-new-1",
        });
        outputAttempts += 1;
        if (outputAttempts === 1) throw new Error("simulated link failure");
        storedTransaction = uploadedTransaction;
        return {
          transaction: uploadedTransaction,
          object: {
            id: "uploaded-result-new-file-1",
            role: "result",
            objectCode: "112233445",
            objectType: "pgo_pdf_report",
            fileName: "Final result",
            fileStorageId: "stored-file-new-1",
            status: "ready",
          },
        };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={runningTransaction.requestId}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Upload output object · result",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Continue with new file" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with new file" }),
    );

    expect(screen.getByLabelText("File JSON")).toBeTruthy();
    expect(screen.queryByLabelText("File ID")).toBeNull();
    expect(screen.queryByLabelText("Download URL")).toBeNull();
    fireEvent.change(screen.getByLabelText("File JSON"), {
      target: {
        value:
          '{"title":"Final result","download_url":"https://example.org/final.pdf"}',
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create and link object" }),
    );

    expect(
      await screen.findAllByText(/File stored-file-new-1 was created/),
    ).not.toHaveLength(0);
    expect(screen.getByText("stored-file-new-1")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Create and link object" }),
    );
    expect(await screen.findByText("112233445")).toBeTruthy();
    expect(operationOrder).toEqual([
      "create-file",
      "link-object",
      "link-object",
    ]);
    expect(
      sdkFetchMock.mock.calls.filter(
        ([path, init]) => String(path) === "/file-storage" && init?.method === "POST",
      ),
    ).toHaveLength(1);
  });

  it("does not attempt to create an output object when new file creation fails", async () => {
    sdkFetchMock.mockImplementation(async (path, init) => {
      const value = String(path);
      if (
        value.endsWith(`/transactions/${runningTransaction.requestId}`) &&
        !init?.method
      ) {
        return { transaction: runningTransaction };
      }
      if (value.endsWith(`/offers/${runningTransaction.offerId}`)) {
        return { offer: currentLiveOffer };
      }
      if (value === "/file-storage" && init?.method === "POST") {
        throw new Error("simulated file creation failure");
      }
      if (value.endsWith("/output-objects")) {
        throw new Error("output object endpoint must not be called");
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={runningTransaction.requestId}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Upload output object · result",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with new file" }),
    );
    fireEvent.change(screen.getByLabelText("File JSON"), {
      target: {
        value:
          '{"title":"Final result","download_url":"https://example.org/final.pdf"}',
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create and link object" }),
    );

    expect(
      await screen.findAllByText("simulated file creation failure"),
    ).not.toHaveLength(0);
    expect(
      sdkFetchMock.mock.calls.some(([path]) =>
        String(path).endsWith("/output-objects"),
      ),
    ).toBe(false);
  });

  it("shows true empty file sections and permits delivery when the frozen contract has no slots", async () => {
    const emptyOffer: SupportServiceOfferRecord = {
      ...hiddenOffer,
      shortContract: "none -> none",
      inputSlots: [],
      outputSlots: [],
    };
    const emptyTransaction: SupportServiceTransactionRecord = {
      ...runningTransaction,
      inputs: [],
      outputObjects: [],
      missingRequiredInputRoles: [],
      attachmentsPending: false,
      offerSnapshot: {
        ...frozenOfferSnapshot,
        shortContract: "none -> none",
        formShape: undefined,
        inputSlots: [],
        outputSlots: [],
      },
    };
    const deliveredEmptyTransaction: SupportServiceTransactionRecord = {
      ...emptyTransaction,
      status: "delivered",
      requestRevision: emptyTransaction.requestRevision + 1,
    };

    sdkFetchMock.mockImplementation(async (path, init) => {
      const value = String(path);
      if (
        value.endsWith(`/transactions/${emptyTransaction.requestId}`) &&
        !init?.method
      ) {
        return { transaction: emptyTransaction };
      }
      if (value.endsWith(`/offers/${emptyTransaction.offerId}`)) {
        return { offer: emptyOffer };
      }
      if (value.endsWith("/deliver") && init?.method === "POST") {
        return { transaction: deliveredEmptyTransaction };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(
      <SupportServiceTransactionWorkbench
        mode="edit"
        transactionId={emptyTransaction.requestId}
      />,
    );

    expect(
      await screen.findByText("No input files are required for this service."),
    ).toBeTruthy();
    expect(
      screen.getByText("No output files are required for this service."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This service does not require output files. Mark it as delivered when the work is complete.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Upload output object/ }),
    ).toBeNull();

    const deliverButton = screen.getByRole("button", {
      name: "Mark as delivered",
    }) as HTMLButtonElement;
    expect(deliverButton.disabled).toBe(false);
    fireEvent.click(deliverButton);

    await waitFor(() => {
      expect(
        sdkFetchMock.mock.calls.some(
          ([path, init]) =>
            String(path).endsWith("/deliver") && init?.method === "POST",
        ),
      ).toBe(true);
    });
  });
});
