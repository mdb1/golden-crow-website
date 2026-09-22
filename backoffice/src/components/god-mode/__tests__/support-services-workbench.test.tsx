/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  SupportServicesBrowser,
  SupportServiceOfferWorkbench,
  SupportServiceTransactionWorkbench,
} from "@/components/god-mode/support-services-workbench";
import {
  POCKET_GENES_SERVICE_OPTIONS,
  normalizePocketGenesCatalogFormShape,
} from "@/lib/pocket-genes-service-catalog";
import { sdkFetch } from "@/lib/sdk-client";
import type {
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
  SdkRequestError: class SdkRequestError extends Error {},
}));

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

const hiddenOffer: SupportServiceOfferRecord = {
  id: "offer-hidden",
  schemaVersion: 1,
  serviceId: "pgs_frozen_lab_1",
  serviceVersion: 1,
  name: "Frozen lab service",
  serviceCategory: "",
  providerKind: "organization",
  providerId: "provider-frozen",
  providerName: "Frozen Lab",
  stages: ["test_planning"],
  status: "active",
  isHiddenFromSearch: true,
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

function renderWithQueryClient(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
        {children}
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("support services workbenches", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    sdkFetchMock.mockReset();
    window.localStorage.clear();
  });

  it("shows transaction list load failures instead of a false empty state", async () => {
    sdkFetchMock.mockRejectedValue(new Error("Stored transaction is invalid."));

    renderWithQueryClient(<SupportServicesBrowser kind="transactions" />);

    expect(await screen.findByText("Could not load records.")).toBeTruthy();
    expect(screen.getByText("Stored transaction is invalid.")).toBeTruthy();
    expect(screen.queryByText("No records found.")).toBeNull();
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
    }
  });

  it("normalizes a catalog service without a form shape as an absent optional form", () => {
    expect(normalizePocketGenesCatalogFormShape(undefined)).toBeUndefined();
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

  it("loads every provider sibling page within the SDK page-size cap", async () => {
    const secondSibling: SupportServiceOfferRecord = {
      ...hiddenOffer,
      id: "offer-sibling-2",
      serviceId: "pgs_frozen_lab_2",
    };

    sdkFetchMock.mockImplementation(async (path) => {
      const value = String(path);
      if (value === `/admin/support-services/offers/${hiddenOffer.id}`) {
        return { offer: hiddenOffer };
      }
      if (value.startsWith("/admin/support-services/offers?")) {
        const params = new URLSearchParams(value.split("?")[1]);
        expect(params.get("limit")).toBe("50");
        expect(params.get("query")).toBe(hiddenOffer.providerId);
        if (params.get("cursor") === "provider-page-2") {
          return { offers: [secondSibling], nextCursor: undefined };
        }
        return { offers: [], nextCursor: "provider-page-2" };
      }
      throw new Error(`Unexpected SDK path: ${value}`);
    });

    renderWithQueryClient(
      <SupportServiceOfferWorkbench mode="edit" offerId={hiddenOffer.id} />,
    );

    await screen.findByText("Hide from native service search");
    await waitFor(() => {
      expect(
        sdkFetchMock.mock.calls.some(([path]) =>
          String(path).includes("cursor=provider-page-2"),
        ),
      ).toBe(true);
    });
    expect(
      sdkFetchMock.mock.calls.some(([path]) =>
        String(path).includes("limit=100"),
      ),
    ).toBe(false);
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

    expect(
      (screen.getByLabelText("Object ID · form") as HTMLInputElement).value,
    ).toBe("obj_form_1");
    expect(
      (screen.getByLabelText("Object code · form") as HTMLInputElement).value,
    ).toBe("123456789");
    expect(
      (screen.getByLabelText("Uploaded object ID · form") as HTMLInputElement)
        .value,
    ).toBe("uploaded-form-1");
    expect(
      (screen.getByLabelText("File storage ID · form") as HTMLInputElement)
        .value,
    ).toBe("file-form-1");
    expect(
      (screen.getByLabelText("Object owner ID · form") as HTMLInputElement)
        .value,
    ).toBe("owner-form-1");
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
      (
        screen
          .getByLabelText("Object ID · form")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    ).toBe(true);
    expect(
      sdkFetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);

    expect(sdkFetchMock).toHaveBeenCalledWith(
      `/admin/support-services/offers/${deliveredTransaction.offerId}`,
    );
  });

  it("round-trips the frozen transaction contract without legacy keys", async () => {
    const editableTransaction: SupportServiceTransactionRecord = {
      ...deliveredTransaction,
      id: "pgr_editable_1",
      requestId: "pgr_editable_1",
      status: "running",
      requestRevision: 2,
      normalizedName: "pgr editable 1",
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
      expect(payload.inputs).toEqual(editableTransaction.inputs);
      expect(payload.outputObjects).toEqual(editableTransaction.outputObjects);
      expect(payload.outputReports).toEqual(editableTransaction.outputReports);
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
          fileName: "result.pgobject.json",
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
      screen.getByText(
        "Only finalized PGO content JSON supplied by HTTPS download URL is supported. File Storage references and in-progress objects are not accepted.",
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("File name"), {
      target: { value: "result.pgobject.json" },
    });
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
});
