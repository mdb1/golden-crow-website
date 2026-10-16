/**
 * @jest-environment jsdom
 */

// checklist-recurrence-fields.test.tsx — #451 regression net.
//
// The recurrence controls render REAL named inputs that the host reads with
// an uncontrolled FormData submit, so the assertions read the FormData the
// host would see — not the chips' pixels:
//   • only the ACTIVE recurrence's sub-fields are mounted (no stale weekday
//     array posted for a monthly reminder);
//   • switching to weekly/monthly with nothing chosen auto-selects TODAY;
//   • validity (≥1 day) is reported to the host.

import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { ChecklistRecurrenceFields } from "@/components/gc-fitness/ChecklistRecurrenceFields";

// Wednesday 2026-10-14, local time → ISO weekday 3, day-of-month 14.
const NOW = new Date(2026, 9, 14, 10, 0, 0);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask", "setTimeout", "setInterval"] });
  jest.setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

function renderFields(props: Partial<React.ComponentProps<typeof ChecklistRecurrenceFields>> = {}) {
  const onValidityChange = jest.fn();
  const utils = render(
    <form data-testid="host">
      <ChecklistRecurrenceFields idPrefix="t" onValidityChange={onValidityChange} {...props} />
    </form>,
  );
  const formData = () => new FormData(screen.getByTestId("host") as HTMLFormElement);
  const select = () => screen.getByLabelText("Recurrencia") as HTMLSelectElement;
  return { ...utils, formData, select, onValidityChange };
}

describe("ChecklistRecurrenceFields", () => {
  it("defaults to a one-off reminder with no sub-fields posted", () => {
    const { formData, onValidityChange } = renderFields();
    const data = formData();
    expect(data.get("recurrence")).toBe("none");
    expect(data.has("recurrenceEndsOn")).toBe(false);
    expect(data.getAll("recurrenceWeekdays")).toEqual([]);
    expect(data.getAll("recurrenceMonthDays")).toEqual([]);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it("daily posts the end date field (blank = forever) and no day arrays", () => {
    const { formData, select } = renderFields();
    fireEvent.change(select(), { target: { value: "daily" } });
    const data = formData();
    expect(data.get("recurrence")).toBe("daily");
    expect(data.get("recurrenceEndsOn")).toBe("");
    expect(data.getAll("recurrenceWeekdays")).toEqual([]);
  });

  it("switching to weekly auto-selects today's ISO weekday (Wed = 3)", () => {
    const { formData, select, onValidityChange } = renderFields();
    fireEvent.change(select(), { target: { value: "weekly" } });
    expect(formData().getAll("recurrenceWeekdays")).toEqual(["3"]);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it("Sunday maps to 7, not 0", () => {
    jest.setSystemTime(new Date(2026, 9, 18, 10, 0, 0)); // Sunday
    const { formData, select } = renderFields();
    fireEvent.change(select(), { target: { value: "weekly" } });
    expect(formData().getAll("recurrenceWeekdays")).toEqual(["7"]);
  });

  it("switching to monthly auto-selects today's day of month", () => {
    const { formData, select } = renderFields();
    fireEvent.change(select(), { target: { value: "monthly" } });
    expect(formData().getAll("recurrenceMonthDays")).toEqual(["14"]);
    expect(formData().getAll("recurrenceWeekdays")).toEqual([]);
  });

  it("toggling chips posts exactly the chosen days, and deselecting all is invalid", () => {
    const { formData, select, onValidityChange } = renderFields();
    fireEvent.change(select(), { target: { value: "weekly" } });
    fireEvent.click(screen.getByLabelText("Lun"));
    fireEvent.click(screen.getByLabelText("Dom"));
    expect(formData().getAll("recurrenceWeekdays").sort()).toEqual(["1", "3", "7"]);

    for (const label of ["Lun", "Mié", "Dom"]) fireEvent.click(screen.getByLabelText(label));
    expect(formData().getAll("recurrenceWeekdays")).toEqual([]);
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("Elegí al menos un día.")).toBeInTheDocument();
  });

  it("does not overwrite days the coach already had when re-entering weekly", () => {
    const { formData, select } = renderFields({
      defaults: { recurrence: "none", weekdays: [1, 5] },
    });
    fireEvent.change(select(), { target: { value: "weekly" } });
    expect(formData().getAll("recurrenceWeekdays").sort()).toEqual(["1", "5"]);
  });

  it("prefills from defaults, including the end date", () => {
    const { formData } = renderFields({
      defaults: { recurrence: "monthly", monthDays: [1, 15, 31], endsOn: "2026-12-31" },
    });
    const data = formData();
    expect(data.get("recurrence")).toBe("monthly");
    expect(data.getAll("recurrenceMonthDays")).toEqual(["1", "15", "31"]);
    expect(data.get("recurrenceEndsOn")).toBe("2026-12-31");
  });

  it("a monthly default with no days reports invalid until one is picked", () => {
    const { onValidityChange } = renderFields({ defaults: { recurrence: "monthly", monthDays: [] } });
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByLabelText("20"));
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it("switching weekly → monthly unmounts the weekday inputs (nothing stale posted)", () => {
    const { formData, select } = renderFields({ defaults: { recurrence: "weekly", weekdays: [2] } });
    fireEvent.change(select(), { target: { value: "monthly" } });
    const data = formData();
    expect(data.getAll("recurrenceWeekdays")).toEqual([]);
    expect(data.getAll("recurrenceMonthDays")).toEqual(["14"]);
    fireEvent.change(select(), { target: { value: "none" } });
    expect(formData().getAll("recurrenceMonthDays")).toEqual([]);
    expect(formData().has("recurrenceEndsOn")).toBe(false);
  });
});
