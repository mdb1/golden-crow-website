/**
 * @jest-environment jsdom
 */

// bodyweight-factor-field.test.tsx — #451 regression net (#1307 field).
//
// The «% of body weight counted in volume» input. What matters is the VALUE it
// hands to `onChange` (which the editors persist), not what it paints:
//   • while typing, every parseable value is forwarded CLAMPED to 0–100;
//   • blank is not forwarded mid-typing (so "7" → "" → "70" doesn't snap back),
//     and on blur blank means "follow the suggestion" → onChange(null);
//   • on blur an explicit value settles onto the 5% grid the wire stores.

import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";

import { BodyweightFactorField } from "@/components/gc-fitness/bodyweight-factor-field";

/** A controlled parent that records every value the field emits. */
function Harness({
  initial = null,
  suggested = 65,
  calls,
  disabled,
}: {
  initial?: number | null;
  suggested?: number;
  calls: Array<number | null>;
  disabled?: boolean;
}) {
  const [percent, setPercent] = useState<number | null>(initial);
  return (
    <>
      <BodyweightFactorField
        percent={percent}
        suggestedPercent={suggested}
        disabled={disabled}
        onChange={(next) => {
          calls.push(next);
          setPercent(next);
        }}
      />
      <output data-testid="persisted">{percent === null ? "null" : String(percent)}</output>
    </>
  );
}

function setup(props: Partial<React.ComponentProps<typeof Harness>> = {}) {
  const calls: Array<number | null> = [];
  render(<Harness calls={calls} {...props} />);
  const input = screen.getByLabelText("% of body weight counted in volume") as HTMLInputElement;
  return { calls, input, persisted: () => screen.getByTestId("persisted").textContent };
}

describe("BodyweightFactorField", () => {
  it("shows the suggestion while the coach has not typed, and emits nothing", () => {
    const { input, calls } = setup({ suggested: 65 });
    expect(input.value).toBe("65");
    expect(screen.getByText(/Suggested for the primary muscle: 65%/)).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("shows an explicit percent over the suggestion", () => {
    const { input } = setup({ initial: 40, suggested: 65 });
    expect(input.value).toBe("40");
  });

  it("forwards a typed value, then snaps it to the 5% grid on blur", async () => {
    const user = userEvent.setup();
    const { input, calls, persisted } = setup();
    await user.clear(input);
    await user.type(input, "72");
    expect(calls).toEqual([7, 72]); // "" is NOT forwarded mid-typing
    await user.tab();
    expect(calls.at(-1)).toBe(70);
    expect(persisted()).toBe("70");
    expect(input.value).toBe("70");
  });

  it.each([
    ["73", 75],
    ["72.5", 75], // Math.round(14.5) = 15
    ["2", 0],
    ["3", 5],
    ["100", 100],
    ["0", 0],
  ])("typed %p settles on %p", (raw, expected) => {
    const { input, persisted } = setup();
    fireEvent.change(input, { target: { value: raw } });
    fireEvent.blur(input);
    expect(persisted()).toBe(String(expected));
  });

  it.each([
    ["150", 100],
    ["1e5", 100],
    ["-5", 0],
    ["-0.5", 0],
  ])("clamps %p to %p as soon as it is typed", (raw, expected) => {
    const { input, calls } = setup();
    fireEvent.change(input, { target: { value: raw } });
    expect(calls).toEqual([expected]);
  });

  it("keeps showing the raw draft while typing even when the forwarded value was clamped", () => {
    const { input, calls } = setup();
    fireEvent.change(input, { target: { value: "150" } });
    expect(calls).toEqual([100]);
    expect(input.value).toBe("150");
    fireEvent.blur(input);
    expect(input.value).toBe("100");
  });

  it("blank on blur means 'follow the suggestion' → onChange(null)", async () => {
    const user = userEvent.setup();
    const { input, calls, persisted } = setup({ initial: 40, suggested: 65 });
    await user.clear(input);
    expect(calls).toEqual([]);
    await user.tab();
    expect(calls).toEqual([null]);
    expect(persisted()).toBe("null");
    expect(input.value).toBe("65");
  });

  it("non-numeric text (sanitized to empty) is blank", () => {
    const { input, calls } = setup({ initial: 40 });
    // jsdom sanitizes non-numeric text in a number input to "" — same as a browser.
    fireEvent.change(input, { target: { value: "abc" } });
    expect(calls).toEqual([]);
    fireEvent.blur(input);
    expect(calls).toEqual([null]);
  });

  it("blur without typing re-snaps an off-grid stored percent", () => {
    const { input, calls } = setup({ initial: 33 });
    fireEvent.blur(input);
    expect(calls).toEqual([35]);
  });

  it("blur without typing and no explicit percent emits nothing", () => {
    const { input, calls } = setup({ initial: null });
    fireEvent.blur(input);
    expect(calls).toEqual([]);
  });

  it("'Use suggested' appears only when the explicit value differs, and resets to null", async () => {
    const user = userEvent.setup();
    const { calls, persisted, input } = setup({ initial: 40, suggested: 65 });
    await user.click(screen.getByRole("button", { name: "Use suggested (65%)" }));
    expect(calls).toEqual([null]);
    expect(persisted()).toBe("null");
    expect(input.value).toBe("65");
    expect(screen.queryByRole("button", { name: /Use suggested/ })).not.toBeInTheDocument();
  });

  it("hides 'Use suggested' when the explicit value equals the suggestion", () => {
    setup({ initial: 65, suggested: 65 });
    expect(screen.queryByRole("button", { name: /Use suggested/ })).not.toBeInTheDocument();
  });

  it("disabled: the input is disabled and there is no reset button", () => {
    const { input } = setup({ initial: 40, suggested: 65, disabled: true });
    expect(input).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Use suggested/ })).not.toBeInTheDocument();
  });

  it("toggles the explainer", async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole("button", { name: "What is this?" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/a push-up loads ~65%/)).toBeInTheDocument();
  });
});
