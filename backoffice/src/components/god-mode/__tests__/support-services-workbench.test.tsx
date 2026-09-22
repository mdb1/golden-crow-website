/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  SupportServiceOfferWorkbench,
  SupportServiceTransactionWorkbench,
} from "@/components/god-mode/support-services-workbench";
import { POCKET_GENES_SERVICE_OPTIONS } from "@/lib/pocket-genes-service-catalog";
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

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const putCall = sdkFetchMock.mock.calls.find(
        ([path, init]) =>
          String(path).includes("/transactions/") && init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const payload = JSON.parse(String(putCall?.[1]?.body));

      expect(payload.status).toBe("delivered");
      expect(payload.requestedAtClient).toBe(
        deliveredTransaction.requestedAtClient,
      );
      expect(payload.inputs).toEqual(deliveredTransaction.inputs);
      expect(payload.outputObjects).toEqual(deliveredTransaction.outputObjects);
      expect(payload.outputReports).toEqual(deliveredTransaction.outputReports);
      expect(payload.issues).toEqual(deliveredTransaction.issues);
      expect(payload.offerSnapshot).toEqual(frozenOfferSnapshot);
      expect(payload.providerSnapshot).toEqual(
        deliveredTransaction.providerSnapshot,
      );
      expect(payload).not.toHaveProperty("outputs");
      expect(payload).not.toHaveProperty("requesterEmail");
      expect(payload).not.toHaveProperty("subjectId");
      expect(payload).not.toHaveProperty("notes");
    });

    expect(sdkFetchMock).toHaveBeenCalledWith(
      `/admin/support-services/offers/${deliveredTransaction.offerId}`,
    );
  });
});
