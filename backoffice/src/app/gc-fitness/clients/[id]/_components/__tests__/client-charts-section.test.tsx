/**
 * @jest-environment jsdom
 */

// client-charts-section.test.tsx — the charts switchboard on a client profile.
//
// The FIRST THREE LINES must stay as the `/** @jest-environment jsdom */`
// docblock — the backoffice jest config defaults to `testEnvironment: "node"`.
//
// THE LOAD-BEARING FACT: a hidden chart is not hidden with CSS, and not even
// dropped in the browser — page.tsx never RENDERS it, because the preference is
// a cookie the Server Component reads before it queries Firestore. That is why
// this component takes a `node` that is already `null`, and why flipping a
// checkbox has to write the cookie AND ask the server to re-render. A local
// `useState` would show the chart's frame with no data in it.

import "@testing-library/jest-dom";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { CLIENT_CHARTS_COOKIE } from "@/lib/gc-fitness/client-chart-preferences";

import {
  ClientChartsSection,
  type ClientChartSlot,
} from "../ClientChartsSection";

const LABELS = {
  title: "Gráficos",
  subtitle: "Todo el progreso del cliente en un solo lugar.",
  configure: "Configurar",
  configureTitle: "Qué gráficos mostrar",
  configureHelp: "Se guarda para todos tus clientes.",
  allHidden: "Apagaste todos los gráficos.",
};

function slots(hidden: string[] = []): ClientChartSlot[] {
  const defs: Array<[ClientChartSlot["id"], string]> = [
    ["bodyWeight", "Peso"],
    ["habits", "Hábitos"],
    ["dailySteps", "Pasos diarios"],
  ];
  return defs.map(([id, label]) => ({
    id,
    label,
    span: "half" as const,
    // Mirrors page.tsx: hidden means the server produced nothing at all.
    node: hidden.includes(id) ? null : <div data-testid={`chart-${id}`}>{label}</div>,
  }));
}

function renderSection(hidden: ClientChartSlot["id"][] = []) {
  const user = userEvent.setup();
  render(
    <ClientChartsSection slots={slots(hidden)} hidden={hidden} labels={LABELS} />,
  );
  return { user };
}

/** Read back what the component wrote to `document.cookie`. */
function storedHidden(): string[] | null {
  const match = document.cookie.match(
    new RegExp(`${CLIENT_CHARTS_COOKIE}=([^;]*)`),
  );
  if (!match) return null;
  return JSON.parse(decodeURIComponent(match[1]));
}

beforeEach(() => {
  jest.clearAllMocks();
  // jsdom keeps cookies across tests in a file; expire ours between them.
  document.cookie = `${CLIENT_CHARTS_COOKIE}=; path=/; max-age=0`;
});

describe("ClientChartsSection — what it renders", () => {
  it("shows every chart by default", () => {
    renderSection();

    expect(screen.getByTestId("chart-bodyWeight")).toBeInTheDocument();
    expect(screen.getByTestId("chart-habits")).toBeInTheDocument();
    expect(screen.getByTestId("chart-dailySteps")).toBeInTheDocument();
  });

  it("leaves out the ones the server did not render", () => {
    renderSection(["dailySteps"]);

    expect(screen.queryByTestId("chart-dailySteps")).not.toBeInTheDocument();
    expect(screen.getByTestId("chart-bodyWeight")).toBeInTheDocument();
  });

  it("explains the empty grid instead of showing a blank card", () => {
    renderSection(["bodyWeight", "habits", "dailySteps"]);

    expect(screen.getByText(LABELS.allHidden)).toBeInTheDocument();
  });
});

describe("ClientChartsSection — the configurator", () => {
  async function openConfigurator(hidden: ClientChartSlot["id"][] = []) {
    const { user } = renderSection(hidden);
    await user.click(screen.getByRole("button", { name: /Configurar/ }));
    const panel = await screen.findByText(LABELS.configureTitle);
    return { user, panel: panel.closest("[data-slot]") ?? document.body };
  }

  it("offers a HIDDEN chart back, unticked", async () => {
    // If the configurator only listed what is currently rendered, switching a
    // chart off would be a one-way door.
    await openConfigurator(["dailySteps"]);

    expect(screen.getByLabelText("Pasos diarios")).not.toBeChecked();
    expect(screen.getByLabelText("Peso")).toBeChecked();
  });

  it("persists the hidden set and asks the server to re-render", async () => {
    const { user } = await openConfigurator();

    await user.click(screen.getByLabelText("Hábitos"));

    await waitFor(() => expect(storedHidden()).toEqual(["habits"]));
    // The server owns what gets queried, so the toggle has to reach it. Without
    // the refresh the coach re-ticks a chart and gets an empty frame.
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("removes a chart from the hidden set when re-ticked", async () => {
    const { user } = await openConfigurator(["habits"]);

    await user.click(screen.getByLabelText("Hábitos"));

    await waitFor(() => expect(storedHidden()).toEqual([]));
  });

  it("accumulates instead of replacing", async () => {
    // The cookie is the whole hidden set, not the last thing toggled — a
    // last-write-wins bug here silently un-hides everything else.
    const { user } = await openConfigurator(["dailySteps"]);

    await user.click(screen.getByLabelText("Peso"));

    await waitFor(() =>
      expect(storedHidden()?.sort()).toEqual(["bodyWeight", "dailySteps"]),
    );
  });

  it("lists every chart, hidden or not", async () => {
    const { panel } = await openConfigurator(["habits"]);

    for (const label of ["Peso", "Hábitos", "Pasos diarios"]) {
      expect(within(panel as HTMLElement).getByText(label)).toBeInTheDocument();
    }
  });
});
