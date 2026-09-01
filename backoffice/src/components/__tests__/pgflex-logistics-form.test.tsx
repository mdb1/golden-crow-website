/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
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
      "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
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
    expect(screen.getAllByText("Origin").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Neighborhood / Locality")).toBeInTheDocument();
    expect(screen.getByLabelText("Province / District")).toBeInTheDocument();
    expect(screen.getByLabelText("Province / District")).toHaveTextContent(
      "Capital Federal",
    );
    expect(screen.getByLabelText("Country")).toHaveValue("Argentina");
    expect(screen.getByLabelText("Country")).toBeDisabled();
    expect(screen.getByLabelText("Additional trip notes")).toBeInTheDocument();
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
    await user.type(screen.getByLabelText("Address"), "Av. Corrientes 123");
    await user.type(screen.getByLabelText("Neighborhood / Locality"), "Almagro");
    await user.click(createButton);

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics", {
        method: "POST",
        body: JSON.stringify({
          identifier: "PGF-001",
          shipmentType: "2pq",
          origin:
            "Av. Corrientes 123, Almagro, Ciudad Autónoma de Buenos Aires, Argentina",
          destination:
            "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
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
    await user.type(screen.getByLabelText("Address"), "Av. Santa Fe 1000");
    await user.type(screen.getByLabelText("Neighborhood / Locality"), "Recoleta");
    await user.type(screen.getByLabelText("Destination"), "Laboratorio Sur");
    await user.click(screen.getByRole("button", { name: "Create dispatch" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics", {
        method: "POST",
        body: JSON.stringify({
          identifier: "PGF-OTHER",
          shipmentType: "other",
          origin:
            "Av. Santa Fe 1000, Recoleta, Ciudad Autónoma de Buenos Aires, Argentina",
          destination: "Laboratorio Sur",
        }),
      }),
    );
  });

  it("requires at least three characters in the editable origin fields before saving", async () => {
    const user = userEvent.setup();
    renderCreateForm();

    await user.type(screen.getByLabelText("Identifier"), "PGF-SHORT");
    await user.type(screen.getByLabelText("Address"), "Av");
    await user.type(screen.getByLabelText("Neighborhood / Locality"), "Al");
    await user.click(screen.getByRole("button", { name: "Create dispatch" }));

    expect(sdkFetch).not.toHaveBeenCalledWith(
      "/pgflex/logistics",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      await screen.findByText(
        "Address and neighborhood/locality must each have at least 3 characters.",
      ),
    ).toBeInTheDocument();
  });

  it("splits an existing edit origin into address blocks and saves without internal commas", async () => {
    const user = userEvent.setup();
    renderForm({
      item: pgflexItem({
        shipmentType: "other",
        origin:
          "Hidalgo 800, Villa Crespo, Ciudad Autónoma de Buenos Aires, Argentina",
        destination: "Laboratorio Sur",
        canDelete: true,
      }),
    });

    const addressInput = screen.getByLabelText("Address");
    const localityInput = screen.getByLabelText("Neighborhood / Locality");

    expect(addressInput).toHaveValue("Hidalgo 800");
    expect(localityInput).toHaveValue("Villa Crespo");
    expect(screen.getByLabelText("Province / District")).toHaveTextContent(
      "Capital Federal",
    );
    expect(screen.getByLabelText("Country")).toHaveValue("Argentina");
    expect(screen.getByLabelText("Destination")).toHaveValue("Laboratorio Sur");

    await user.clear(addressInput);
    await user.type(addressInput, "Hidalgo, 900");

    expect(addressInput).toHaveValue("Hidalgo 900");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics/dispatch-1", {
        method: "PUT",
        body: JSON.stringify({
          identifier: "ENV-001",
          shipmentType: "other",
          description: "Retiro de cajas 2PQ",
          dispatcherId: "driver-1",
          dispatcherFirebaseId: "driver-1",
          dispatcherEmail: "driver@example.com",
          origin:
            "Hidalgo 900, Villa Crespo, Ciudad Autónoma de Buenos Aires, Argentina",
          destination: "Laboratorio Sur",
          status: "awaiting_pick_up",
        }),
      }),
    );
  });

  it("adds optional linked codes and sends them as a comma-separated field", async () => {
    const promptSpy = jest.spyOn(window, "prompt");
    const alertSpy = jest
      .spyOn(window, "alert")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderCreateForm();

    await user.click(screen.getByRole("button", { name: "Add more" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Add three letter code",
    });
    await user.type(within(dialog).getByLabelText("Three-letter code"), "abc");
    await user.click(
      within(dialog).getByRole("button", { name: "Add three letter code" }),
    );

    expect(promptSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByText("ABC")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Identifier"), "PGF-002");
    await user.type(screen.getByLabelText("Address"), "Av. Santa Fe 1000");
    await user.type(screen.getByLabelText("Neighborhood / Locality"), "Recoleta");
    await user.click(screen.getByRole("button", { name: "Create dispatch" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics", {
        method: "POST",
        body: JSON.stringify({
          identifier: "PGF-002",
          shipmentType: "2pq",
          linked_codes: "ABC",
          origin:
            "Av. Santa Fe 1000, Recoleta, Ciudad Autónoma de Buenos Aires, Argentina",
          destination:
            "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
        }),
      }),
    );

    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it("rejects linked codes that are not exactly three letters", async () => {
    const promptSpy = jest.spyOn(window, "prompt");
    const alertSpy = jest
      .spyOn(window, "alert")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderCreateForm();

    await user.click(screen.getByRole("button", { name: "Add more" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Add three letter code",
    });
    await user.type(within(dialog).getByLabelText("Three-letter code"), "AB1");
    await user.click(
      within(dialog).getByRole("button", { name: "Add three letter code" }),
    );

    expect(promptSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Use exactly 3 letters, no numbers.",
    );
    expect(screen.queryByText("AB1")).not.toBeInTheDocument();

    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it("rejects duplicate linked codes inline without native alerts", async () => {
    const promptSpy = jest.spyOn(window, "prompt");
    const alertSpy = jest
      .spyOn(window, "alert")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderCreateForm();

    await user.click(screen.getByRole("button", { name: "Add more" }));
    let dialog = await screen.findByRole("dialog", {
      name: "Add three letter code",
    });
    await user.type(within(dialog).getByLabelText("Three-letter code"), "abc");
    await user.click(
      within(dialog).getByRole("button", { name: "Add three letter code" }),
    );

    await user.click(screen.getByRole("button", { name: "Add more" }));
    dialog = await screen.findByRole("dialog", {
      name: "Add three letter code",
    });
    await user.type(within(dialog).getByLabelText("Three-letter code"), "abc");
    await user.click(
      within(dialog).getByRole("button", { name: "Add three letter code" }),
    );

    expect(promptSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Code already added.",
    );
    expect(screen.getAllByText("ABC")).toHaveLength(1);

    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it("renders the full admin danger zone as a collapsed disclosure", async () => {
    const user = userEvent.setup();
    renderForm({ item: pgflexItem({ canDelete: true }) });

    const dangerZoneButton = screen.getByRole("button", {
      name: /Danger zone/,
    });
    expect(dangerZoneButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByText(
        "Irreversible actions that permanently delete this PGFlex dispatch.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Dispatch deletion")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete dispatch" }),
    ).not.toBeInTheDocument();

    await user.click(dangerZoneButton);

    expect(dangerZoneButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Dispatch deletion")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Delete this standalone PGFlex logistics item only when it was created by mistake or should no longer appear in PGFlex. This action cannot be undone.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete dispatch" }),
    ).toBeInTheDocument();
  });

  it("shows the operational pickup CTA for full admins and patches the dispatch status", async () => {
    const user = userEvent.setup();
    renderForm({ item: pgflexItem({ canDelete: true }) });

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByText("Route preview")).toBeInTheDocument();
    expect(screen.queryByTestId("pgflex-route-snapshot")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Mark as picked up" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark as picked up" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Are you sure?",
    });
    expect(
      within(dialog).getByText(
        "This action is irreversible. It will log the time and notify the client.",
      ),
    ).toBeInTheDocument();
    expect(sdkFetch).not.toHaveBeenCalledWith(
      "/pgflex/logistics/dispatch-1",
      expect.objectContaining({ method: "PATCH" }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Yes" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics/dispatch-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "in_transit" }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the operational delivery CTA for full admins and patches the dispatch status", async () => {
    const user = userEvent.setup();
    renderForm({
      item: pgflexItem({
        status: "in_transit",
        item_was_picked_date_at: "2026-08-31T12:00:00.000Z",
      }),
    });

    expect(
      screen.getByRole("button", { name: "Mark as delivered" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark as delivered" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Are you sure?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Yes" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics/dispatch-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "arrived" }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("renders transport dispatcher detail as read-only with only the pickup action", async () => {
    const user = userEvent.setup();
    renderForm({ item: pgflexItem() }, transportDispatcherContext);

    expect(screen.getByText("Clinica Norte")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Humboldt 2433 \(PB 10\), Palermo, Ciudad Autónoma de Buenos Aires, Argentina/,
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
    expect(screen.getByTestId("pgflex-route-snapshot")).toBeInTheDocument();
    expect(screen.queryByText("Route preview")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("pgflex-route-address-dock"),
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

    await user.click(screen.getByRole("button", { name: "Mark as picked up" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Are you sure?",
    });
    expect(
      within(dialog).getByText(
        "This action is irreversible. It will log the time and notify the client.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Yes" }));

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

    expect(screen.getByText("Mark as delivered")).toBeInTheDocument();
    expect(screen.getByText("Picked up at")).toBeInTheDocument();
    expect(screen.getByText("31-08-2026-12:00PM")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark as delivered" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Are you sure?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Yes" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/pgflex/logistics/dispatch-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "arrived" }),
      }),
    );
  });
});
