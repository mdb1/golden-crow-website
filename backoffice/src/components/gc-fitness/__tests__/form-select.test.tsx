/**
 * @jest-environment jsdom
 */

// #505 — FormSelect replaced 24 native <select>s in the coach portal. What it
// must keep from them is what the HOST reads: the FormData a plain <form>
// posts (server actions, GET filter forms), the `""` option meaning "all" /
// "none", and the trigger's accessible name / test id.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { FormSelect } from "@/components/gc-fitness/form-select";
import { Label } from "@/components/ui/label";
import {
  chooseFormSelectValue,
  formSelectValues,
  openFormSelect,
} from "@/lib/test-utils/form-select";

const COACHES = [
  { value: "c1", label: "Ana" },
  { value: "c2", label: "Beto" },
];

function renderInForm(ui: React.ReactElement) {
  render(<form data-testid="host">{ui}</form>);
  return () => new FormData(screen.getByTestId("host") as HTMLFormElement);
}

describe("FormSelect", () => {
  it("posts the chosen value under `name`, uncontrolled from defaultValue", async () => {
    const user = userEvent.setup();
    const formData = renderInForm(
      <FormSelect name="coach" defaultValue="c1" aria-label="Coach" options={COACHES} />,
    );
    expect(formData().get("coach")).toBe("c1");

    await chooseFormSelectValue(user, screen.getByRole("combobox", { name: "Coach" }), "c2");

    expect(formData().get("coach")).toBe("c2");
    expect(screen.getByRole("combobox", { name: "Coach" })).toHaveTextContent("Beto");
  });

  it("an `\"\"` option posts `\"\"` — never the internal sentinel", async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    const formData = renderInForm(
      <FormSelect
        name="templateId"
        aria-label="Template"
        defaultValue="c1"
        onValueChange={onValueChange}
        options={[{ value: "", label: "Create new…" }, ...COACHES]}
      />,
    );

    await chooseFormSelectValue(user, screen.getByRole("combobox", { name: "Template" }), "");

    expect(onValueChange).toHaveBeenLastCalledWith("");
    expect(formData().getAll("templateId")).toEqual([""]);
    expect(screen.getByRole("combobox", { name: "Template" })).toHaveTextContent("Create new…");
  });

  it("shows the placeholder while nothing is chosen and posts nothing chosen", () => {
    const formData = renderInForm(
      <FormSelect name="coach" required defaultValue="" placeholder="Choose a coach" aria-label="Coach" options={COACHES} />,
    );
    expect(screen.getByRole("combobox", { name: "Coach" })).toHaveTextContent("Choose a coach");
    expect(formData().get("coach") ?? "").toBe("");
  });

  it("labels the trigger through <Label htmlFor> and carries the test id", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Label htmlFor="kind">Kind</Label>
        <FormSelect id="kind" data-testid="kind-select" value="a" options={[{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }]} />
      </>,
    );
    const trigger = screen.getByLabelText("Kind");
    expect(trigger).toBe(screen.getByTestId("kind-select"));
    expect(trigger).toHaveAttribute("data-value", "a");

    const listbox = await openFormSelect(user, trigger);
    expect(formSelectValues(listbox)).toEqual(["a", "b"]);
  });

  it("controlled: reports the pick and follows the parent's value", async () => {
    const user = userEvent.setup();
    function Host() {
      const [v, setV] = React.useState("");
      return (
        <>
          <FormSelect aria-label="Method" value={v} onValueChange={setV} options={[{ value: "", label: "All" }, ...COACHES]} />
          <output data-testid="out">{v || "(all)"}</output>
        </>
      );
    }
    render(<Host />);
    await chooseFormSelectValue(user, screen.getByRole("combobox", { name: "Method" }), "c2");
    expect(screen.getByTestId("out")).toHaveTextContent("c2");
    await chooseFormSelectValue(user, screen.getByRole("combobox", { name: "Method" }), "");
    expect(screen.getByTestId("out")).toHaveTextContent("(all)");
  });
});
