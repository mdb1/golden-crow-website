/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PGFlexLogisticsForm } from "@/components/pgflex-logistics-form";
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

const fullAdminContext: AdminContextRecord = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

const transportDispatcherContext: AdminContextRecord = {
  email: "driver@example.com",
  uid: "driver-1",
  role: "transport_dispatcher",
  isBootstrap: false,
  canAccessBackoffice: false,
  canAccessPatientPortal: false,
  canAccessPGFlex: true,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

function renderForm(
  props: ComponentProps<typeof PGFlexLogisticsForm>,
  context: AdminContextRecord = fullAdminContext,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider forcedLanguage="en">
        <AdminContextProvider value={context}>
          <PGFlexLogisticsForm {...props} />
        </AdminContextProvider>
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

function renderCreateForm() {
  return renderForm({ mode: "create" });
}

function pgflexItem(
  overrides: Partial<
    NonNullable<ComponentProps<typeof PGFlexLogisticsForm>["item"]>
  > = {},
) {
  return {
    id: "dispatch-1",
    identifier: "ENV-001",
    shipmentType: "2pq" as const,
    description: "Retiro de cajas 2PQ",
    linked_codes: "ABC,DEF",
    dispatcherId: "driver-1",
    dispatcherFirebaseId: "driver-1",
    dispatcherEmail: "driver@example.com",
    origin: "Clinica Norte",
    destination:
      "Humboldt 2433  (10 'C'), Ciudad Autónoma de Buenos Aires, Argentina",
    timeRequested: "2026-08-31T10:00:00.000Z",
    status: "awaiting_pick_up" as const,
    createdAt: "2026-08-31T10:00:00.000Z",
    updatedAt: "2026-08-31T10:00:00.000Z",
    canUpdate: true,
    canDelete: false,
    ...overrides,
  };
}

describe("PGFlexLogisticsForm", () => {
  const originalGoogleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const originalPGFlexGoogleMapsApiKey =
    process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
  const googleMapsScriptId = "pgflex-google-maps-js-api";

  function resetGoogleMapsLoader() {
    delete (window as Window & { __pgflexGoogleMapsPromise?: Promise<void> })
      .__pgflexGoogleMapsPromise;
    document.getElementById(googleMapsScriptId)?.remove();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    delete process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
    resetGoogleMapsLoader();
    (sdkFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/roles/transport-dispatchers/options") {
        return Promise.resolve({ dispatchers: [] });
      }

      if (path === "/pgflex/logistics") {
        return Promise.resolve({ item: { id: "dispatch-1" } });
      }

      if (path === "/pgflex/logistics/dispatch-1") {
        return Promise.resolve({ item: pgflexItem() });
      }

      return Promise.reject(new Error(`Unexpected SDK path: ${path}`));
    });
  });

  afterEach(() => {
    resetGoogleMapsLoader();
  });

  afterAll(() => {
    if (originalGoogleMapsApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalGoogleMapsApiKey;
    }

    if (originalPGFlexGoogleMapsApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY =
        originalPGFlexGoogleMapsApiKey;
    }
  });

  it("keeps generated create-only PGFlex fields and email copy out of the new dispatch form", async () => {
    const user = userEvent.setup();
    renderCreateForm();

    expect(screen.getByLabelText("Shipment type")).toBeInTheDocument();
    expect(screen.getByText("Linked codes")).toBeInTheDocument();
    expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
    const createButton = screen.getByRole("button", {
      name: "Create dispatch",
    });
    expect(
      screen.getAllByRole("button", { name: "Create dispatch" }),
    ).toHaveLength(1);
    expect(createButton).toHaveClass("h-16", "w-full");
    expect(createButton).toHaveClass("lg:min-w-[20rem]", "lg:w-auto");
    expect(screen.queryByLabelText("Time requested")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "A notification email will be sent to this transport dispatcher when the dispatch is saved.",
      ),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Identifier"), "PGF-001");
    await user.type(screen.getByLabelText("Origin"), "Av. Corrientes 123");
    await user.click(createButton);

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics", {
        method: "POST",
        body: JSON.stringify({
          identifier: "PGF-001",
          shipmentType: "2pq",
          origin: "Av. Corrientes 123",
          destination:
            "Humboldt 2433  (10 'C'), Ciudad Autónoma de Buenos Aires, Argentina",
        }),
      }),
    );
    expect(push).not.toHaveBeenCalled();
    expect(
      await screen.findByText("The PGFlex dispatch is ready"),
    ).toBeInTheDocument();
    expect(screen.getByText("dispatch-1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open dispatch" })).toHaveAttribute(
      "href",
      "/pgflex/logistics/dispatch-1",
    );
    expect(
      screen.getByRole("link", { name: "See all dispatches" }),
    ).toHaveAttribute("href", "/pgflex/logistics");
  });

  it("hides linked codes and requires an editable destination for other dispatches", async () => {
    const user = userEvent.setup();
    renderCreateForm();

    await user.click(screen.getByLabelText("Shipment type"));
    await user.click(screen.getByRole("option", { name: "Other" }));

    expect(screen.queryByText("Linked codes")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Destination")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Identifier"), "PGF-OTHER");
    await user.type(screen.getByLabelText("Origin"), "Av. Santa Fe 1000");
    await user.type(screen.getByLabelText("Destination"), "Laboratorio Sur");
    await user.click(screen.getByRole("button", { name: "Create dispatch" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics", {
        method: "POST",
        body: JSON.stringify({
          identifier: "PGF-OTHER",
          shipmentType: "other",
          origin: "Av. Santa Fe 1000",
          destination: "Laboratorio Sur",
        }),
      }),
    );
  });

  it("adds optional linked codes and sends them as a comma-separated field", async () => {
    const promptSpy = jest.spyOn(window, "prompt").mockReturnValue("abc");
    const alertSpy = jest
      .spyOn(window, "alert")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderCreateForm();

    await user.click(screen.getByRole("button", { name: "Add more" }));

    expect(promptSpy).toHaveBeenCalledWith("Enter a 3-letter code");
    expect(screen.getByText("ABC")).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Identifier"), "PGF-002");
    await user.type(screen.getByLabelText("Origin"), "Av. Santa Fe 1000");
    await user.click(screen.getByRole("button", { name: "Create dispatch" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics", {
        method: "POST",
        body: JSON.stringify({
          identifier: "PGF-002",
          shipmentType: "2pq",
          linked_codes: "ABC",
          origin: "Av. Santa Fe 1000",
          destination:
            "Humboldt 2433  (10 'C'), Ciudad Autónoma de Buenos Aires, Argentina",
        }),
      }),
    );

    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it("rejects linked codes that are not exactly three letters", async () => {
    const promptSpy = jest.spyOn(window, "prompt").mockReturnValue("AB1");
    const alertSpy = jest
      .spyOn(window, "alert")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderCreateForm();

    await user.click(screen.getByRole("button", { name: "Add more" }));

    expect(alertSpy).toHaveBeenCalledWith("Use exactly 3 letters, no numbers.");
    expect(screen.queryByText("AB1")).not.toBeInTheDocument();

    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it("renders transport dispatcher detail as read-only with only the pickup action", async () => {
    const user = userEvent.setup();
    renderForm({ item: pgflexItem() }, transportDispatcherContext);

    expect(screen.getByText("Clinica Norte")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Humboldt 2433\s+\(10 'C'\), Ciudad Autónoma de Buenos Aires, Argentina/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("ABC, DEF")).toBeInTheDocument();
    expect(screen.getByText("31-08-2026-10:00AM")).toBeInTheDocument();
    expect(
      screen.queryByText(["Read-only", "dispatch", "detail"].join(" ")),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "ENV-001" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("ENV-001")).toHaveClass(
      "text-[0.65rem]",
      "text-muted-foreground/70",
    );
    expect(screen.getAllByText("Awaiting pick up")).toHaveLength(1);
    expect(
      screen.queryByText("2026-08-31T10:00:00.000Z"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete dispatch" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Pedido Retirado" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics/dispatch-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "in_transit" }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("renders a delivery action for transport dispatches in transit", async () => {
    const user = userEvent.setup();
    renderForm(
      {
        item: pgflexItem({
          status: "in_transit",
          item_was_picked_date_at: "2026-08-31T12:00:00.000Z",
        }),
      },
      transportDispatcherContext,
    );

    expect(screen.getByText("Pedido Entregado")).toBeInTheDocument();
    expect(screen.getByText("Picked up at")).toBeInTheDocument();
    expect(screen.getByText("31-08-2026-12:00PM")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pedido Entregado" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics/dispatch-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "arrived" }),
      }),
    );
  });
});
