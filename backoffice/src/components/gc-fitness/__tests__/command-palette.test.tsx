/**
 * @jest-environment jsdom
 */

// command-palette.test.tsx — #496 (⌘K / Ctrl+K).
//
// Pins the four things a coach relies on: the shortcut opens it, the index is
// NOT fetched until it opens, typing filters across clients / chats / workouts
// / exercises, and choosing a row navigates and closes.

import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetIndex = jest.fn();
jest.mock("@/lib/gc-fitness/command-palette-actions", () => ({
  getCommandPaletteIndex: () => mockGetIndex(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: () => undefined,
  writable: true,
});

import {
  CommandPaletteProvider,
  CommandPaletteTrigger,
} from "@/components/gc-fitness/command-palette";

const INDEX = {
  clients: [
    { id: "c-ana", name: "Ana Pérez", email: "ana@example.com" },
    { id: "c-bruno", name: "Bruno Díaz", email: "bruno@example.com" },
  ],
  templates: [{ id: "t-legs", name: { en: "Leg day", es: "Día de piernas" } }],
  exercises: [
    { id: "e-squat", name: { en: "Bulgarian split squat", es: "Sentadilla búlgara" } },
  ],
};

function renderPalette() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommandPaletteProvider isAdmin={false}>
        <CommandPaletteTrigger />
      </CommandPaletteProvider>
    </QueryClientProvider>,
  );
}

function pressCtrlK() {
  act(() => {
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  });
}

beforeEach(() => {
  mockPush.mockReset();
  mockGetIndex.mockReset();
  mockGetIndex.mockResolvedValue({ ok: true, index: INDEX });
});

describe("CommandPalette (#496)", () => {
  it("does not fetch anything until it is opened", () => {
    renderPalette();
    expect(mockGetIndex).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Ctrl+K opens it with a labelled input; ⌘K toggles it closed", async () => {
    renderPalette();
    pressCtrlK();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Search the coach portal")).toBeInTheDocument();
    await waitFor(() => expect(mockGetIndex).toHaveBeenCalledTimes(1));

    act(() => {
      fireEvent.keyDown(window, { key: "K", metaKey: true });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("the visible trigger opens it too (touch / mouse users)", async () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: /open search/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("typing filters across kinds, accent-insensitively", async () => {
    renderPalette();
    pressCtrlK();
    const input = await screen.findByLabelText("Search the coach portal");
    await screen.findByText("Ana Pérez");

    fireEvent.change(input, { target: { value: "perez" } });
    expect(await screen.findByText("Chat with Ana Pérez")).toBeInTheDocument();
    expect(screen.queryByText("Bruno Díaz")).not.toBeInTheDocument();
    expect(screen.queryByText("Leg day")).not.toBeInTheDocument();

    // Matches the OTHER language's name too, and shows the locale's one.
    fireEvent.change(input, { target: { value: "bulgara" } });
    expect(await screen.findByText("Bulgarian split squat")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "zzz-nothing" } });
    expect(await screen.findByText("No results.")).toBeInTheDocument();
  });

  it("selecting a row navigates to it and closes the palette", async () => {
    renderPalette();
    pressCtrlK();
    const input = await screen.findByLabelText("Search the coach portal");
    await screen.findByText("Ana Pérez");

    fireEvent.change(input, { target: { value: "leg" } });
    fireEvent.click(await screen.findByText("Leg day"));
    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/templates/t-legs/view");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    pressCtrlK();
    const again = await screen.findByLabelText("Search the coach portal");
    fireEvent.change(again, { target: { value: "bruno" } });
    fireEvent.click(await screen.findByText("Chat with Bruno Díaz"));
    expect(mockPush).toHaveBeenLastCalledWith("/gc-fitness/chat?chatId=c-bruno");
  });

  it("still offers the pages when the index fails to load", async () => {
    mockGetIndex.mockResolvedValue({ ok: false, error: "Forbidden" });
    renderPalette();
    pressCtrlK();
    expect(
      await screen.findByText("Couldn't load your clients and library. Pages are still available."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Schedule"));
    expect(mockPush).toHaveBeenCalledWith("/gc-fitness/schedule");
  });
});
