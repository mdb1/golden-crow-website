/**
 * @jest-environment jsdom
 */

// no-clients-hint.test.tsx — golden-crow-website#535: an empty client picker
// offers the way out instead of a dead-end «No hay clientes.».

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { ChecklistClientPicker } from "../ChecklistClientPicker";
import { NoClientsHint } from "../no-clients-hint";

it("says why and links to Clientes", () => {
  render(<NoClientsHint message="No hay clientes." />);
  expect(screen.getByText("No hay clientes.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Add a client" })).toHaveAttribute("href", "/gc-fitness/clients");
});

it("the checklist's client picker uses it when the roster is empty", () => {
  render(<ChecklistClientPicker clients={[]} />);
  expect(screen.getByTestId("no-clients-hint")).toBeInTheDocument();
});
