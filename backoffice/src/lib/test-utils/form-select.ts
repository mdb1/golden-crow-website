// #505 — test helpers for `components/gc-fitness/form-select` (Radix under the
// hood). They replace `user.selectOptions(...)` / `fireEvent.change(select)` /
// `select.querySelector('option[value=…]')`, which only worked on the native
// `<select>`s the portal used to have.
import { screen, within } from "@testing-library/react";

/** `userEvent.setup()` or the `userEvent` default export — both fit. */
type User = {
  click(element: Element): Promise<void>;
  keyboard(text: string): Promise<void>;
};

/** Opens `trigger`'s listbox and returns it. */
export async function openFormSelect(user: User, trigger: HTMLElement): Promise<HTMLElement> {
  await user.click(trigger);
  return screen.findByRole("listbox");
}

/** The option carrying `value` in an OPEN listbox (FormSelect stamps `data-value`). */
export function formSelectOption(listbox: HTMLElement, value: string): HTMLElement {
  const opt = listbox.querySelector<HTMLElement>(`[role="option"][data-value="${CSS.escape(value)}"]`);
  if (!opt) throw new Error(`no option with value ${JSON.stringify(value)}`);
  return opt;
}

/** Every option value in an OPEN listbox, in order. */
export function formSelectValues(listbox: HTMLElement): string[] {
  return within(listbox)
    .getAllByRole("option")
    .map((o) => o.getAttribute("data-value") ?? "");
}

export function isFormSelectOptionDisabled(option: HTMLElement): boolean {
  return option.hasAttribute("data-disabled") || option.getAttribute("aria-disabled") === "true";
}

/** Opens `trigger` and picks the option whose value is `value`. */
export async function chooseFormSelectValue(user: User, trigger: HTMLElement, value: string) {
  const listbox = await openFormSelect(user, trigger);
  await user.click(formSelectOption(listbox, value));
}

/** Closes an open listbox without choosing (Escape). */
export async function closeFormSelect(user: User) {
  await user.keyboard("{Escape}");
}
