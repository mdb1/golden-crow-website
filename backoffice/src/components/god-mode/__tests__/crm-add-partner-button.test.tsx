/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { CrmAddPartnerButton } from "@/components/god-mode/crm-add-partner-button";
import { PARTNERS_QUERY_KEY } from "@/lib/connected-partners";

function show(props: Partial<React.ComponentProps<typeof CrmAddPartnerButton>> = {}) {
  const onAdd = props.onAdd ?? jest.fn().mockResolvedValue({ partner: { id: "partner-one" }, created: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><AppLanguageProvider forcedLanguage="es"><CrmAddPartnerButton email="ana@example.com" onAdd={onAdd} {...props} /></AppLanguageProvider></QueryClientProvider>);
  return { onAdd, invalidate };
}

it("creates only after a click, refreshes partner caches, and opens the created partner", async () => {
  const { onAdd, invalidate } = show();
  expect(onAdd).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Sumar como partner" }));
  expect(await screen.findByText("Partner creado.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Ver partner" })).toHaveAttribute("href", "/god-mode/partners/partner-one/edit");
  expect(onAdd).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: PARTNERS_QUERY_KEY }));
});

it("prevents repeated clicks while a request is pending", async () => {
  let finish!: (value: { partner: { id: string }; created: boolean }) => void;
  const onAdd = jest.fn(() => new Promise<{ partner: { id: string }; created: boolean }>((resolve) => { finish = resolve; }));
  show({ onAdd });
  const button = screen.getByRole("button", { name: "Sumar como partner" });
  fireEvent.click(button); fireEvent.click(button);
  expect(onAdd).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Sumando partner..." })).toBeDisabled();
  await act(async () => finish({ partner: { id: "partner-one" }, created: true }));
  expect(await screen.findByRole("link", { name: "Ver partner" })).toBeVisible();
});

it("opens the existing partner when the email is already registered", async () => {
  show({ onAdd: jest.fn().mockResolvedValue({ partner: { id: "existing" }, created: false }) });
  fireEvent.click(screen.getByRole("button", { name: "Sumar como partner" }));
  expect(await screen.findByText("Ya existe un partner con este email.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Ver partner" })).toHaveAttribute("href", "/god-mode/partners/existing/edit");
});

it("explains a missing email and respects disabled CRM actions", () => {
  const { onAdd } = show({ email: " " });
  expect(screen.getByRole("button", { name: "Sumar como partner" })).toBeDisabled();
  expect(screen.getByText("Agregá un email a este registro del CRM para crear un partner.")).toBeVisible();
  expect(onAdd).not.toHaveBeenCalled();
});

it("shows a useful error and lets an idempotent retry resolve the partner", async () => {
  const onAdd = jest.fn().mockRejectedValueOnce(new Error("Add a valid email to this CRM record before adding it as a partner."))
    .mockResolvedValueOnce({ partner: { id: "existing" }, created: false });
  show({ onAdd });
  fireEvent.click(screen.getByRole("button", { name: "Sumar como partner" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Agregá un email válido a este registro del CRM antes de sumarlo como partner.");
  await waitFor(() => expect(screen.getByRole("button", { name: "Sumar como partner" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Sumar como partner" }));
  expect(await screen.findByRole("link", { name: "Ver partner" })).toHaveAttribute("href", "/god-mode/partners/existing/edit");
  expect(onAdd).toHaveBeenCalledTimes(2);
});
