/**
 * @jest-environment jsdom
 */

// #502 — the client profile's sticky section nav: plain anchors (deep links
// keep working), the clicked one becomes current and lands in the URL hash.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { ClientSectionNav } from "../ClientSectionNav";

const ITEMS = [
  { id: "resumen", label: "Summary" },
  { id: "nutricion", label: "Nutrition" },
  { id: "chat", label: "Chat" },
];

function renderWithSections() {
  return render(
    <>
      <ClientSectionNav items={ITEMS} ariaLabel="Client sections" />
      {ITEMS.map((item) => (
        <section key={item.id} id={item.id}>
          {item.label} body
        </section>
      ))}
    </>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/gc-fitness/clients/c1");
  Element.prototype.scrollIntoView = jest.fn();
});

describe("ClientSectionNav", () => {
  it("renders one anchor per section, pointing at its id", () => {
    renderWithSections();
    const nav = screen.getByRole("navigation", { name: "Client sections" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nutrition" })).toHaveAttribute("href", "#nutricion");
    expect(screen.getByRole("link", { name: "Summary" })).toHaveAttribute("aria-current", "location");
  });

  it("clicking scrolls to the section, marks it current and writes the hash", async () => {
    renderWithSections();
    await userEvent.setup().click(screen.getByRole("link", { name: "Chat" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(window.location.hash).toBe("#chat");
    expect(screen.getByRole("link", { name: "Chat" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Summary" })).not.toHaveAttribute("aria-current");
  });

  it("a deep link (#nutricion) starts on that section", () => {
    window.history.replaceState(null, "", "/gc-fitness/clients/c1#nutricion");
    renderWithSections();
    expect(screen.getByRole("link", { name: "Nutrition" })).toHaveAttribute("aria-current", "location");
  });
});
