/** @jest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PublisherAccessKeyDialog } from "../publisher-access-key-dialog";
import { sdkFetch } from "@/lib/sdk-client";
jest.mock("@/lib/sdk-client", () => ({ sdkFetch: jest.fn() }));
const endpoint = "/discover/publisher-credentials/organization/org-one";
function renderDialog() {
  return render(
    <AppLanguageProvider forcedLanguage="es">
      <PublisherAccessKeyDialog
        publisherId="org-one"
        publisherKind="organization"
      />
    </AppLanguageProvider>,
  );
}
beforeEach(() => {
  jest.resetAllMocks();
});

it("loads metadata on opening and retrieves a saved key only when Reveal is pressed", async () => {
  const user = userEvent.setup();
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({ available: true, contactEmail: "ana@example.com" })
    .mockResolvedValueOnce({ email: "ana@example.com", accessKey: "ABCDEFGH" });
  renderDialog();
  expect(sdkFetch).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Clave de acceso al portal" }),
  );
  const input = await screen.findByLabelText("Clave de acceso");
  expect(input).toHaveValue("********");
  expect(sdkFetch).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Revelar" }));
  await waitFor(() => expect(input).toHaveValue("ABCDEFGH"));
  expect(sdkFetch).toHaveBeenLastCalledWith(`${endpoint}/reveal`, {
    method: "POST",
  });
  await user.click(screen.getByRole("button", { name: "Ocultar" }));
  expect(input).toHaveValue("********");
  await user.click(screen.getByRole("button", { name: /^Cerrar$/ }));
  expect(screen.queryByLabelText("Clave de acceso")).toBeNull();
});

it("stores the manually entered existing key when null and clears it after saving", async () => {
  const user = userEvent.setup();
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({
      available: false,
      contactEmail: "ana@example.com",
    })
    .mockResolvedValueOnce({ available: true });
  renderDialog();
  await user.click(
    screen.getByRole("button", { name: "Clave de acceso al portal" }),
  );
  const input = await screen.findByLabelText("Clave de acceso");
  expect(
    screen.getByRole("button", { name: "Guardar clave de acceso" }),
  ).toBeDisabled();
  expect(screen.getByText(/Guardarla aquí no modifica/)).toBeVisible();
  await user.type(input, "Current+Key&42");
  await user.click(
    screen.getByRole("button", { name: "Guardar clave de acceso" }),
  );
  await waitFor(() =>
    expect(screen.getByText("Clave de acceso guardada.")).toBeVisible(),
  );
  expect(sdkFetch).toHaveBeenLastCalledWith(endpoint, {
    method: "PUT",
    body: JSON.stringify({ accessKey: "Current+Key&42" }),
  });
  expect(input).toHaveValue("********");
  expect(
    screen.queryByRole("button", { name: "Guardar clave de acceso" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Copiar" })).toBeDisabled();
});

it("keeps errors visible and does not pretend a failed key save succeeded", async () => {
  const user = userEvent.setup();
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({
      available: false,
      contactEmail: "ana@example.com",
    })
    .mockRejectedValueOnce(new Error("Save failed"));
  renderDialog();
  await user.click(
    screen.getByRole("button", { name: "Clave de acceso al portal" }),
  );
  await user.type(await screen.findByLabelText("Clave de acceso"), "ABCDEFGH");
  await user.click(
    screen.getByRole("button", { name: "Guardar clave de acceso" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed"),
  );
  expect(screen.queryByText("Clave de acceso guardada.")).toBeNull();
  expect(screen.getByLabelText("Clave de acceso")).toHaveValue("ABCDEFGH");
});
