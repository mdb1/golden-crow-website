/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverOrganizationWorkbench } from "@/components/discover/organization-workbench";
import { sdkFetch } from "@/lib/sdk-client";
import type { DiscoverOrganizationRecord } from "@/lib/discover";

const routerPush = jest.fn();
const routerRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const organization: DiscoverOrganizationRecord = {
  id: "org-1",
  name: "Publisher One",
  imageUrl: "https://example.org/publisher.png",
  status: "active",
  slug: "publisher-one",
  websiteUrl: "https://example.org",
  description: "Organization description",
  countryCode: "US",
  organizationType: "patient_advocacy_group",
  color_hex: "#123ABC",
  verified: true,
  contactEmail: "hello@example.org",
  internalNotes: "Internal notes",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

function renderWorkbench() {
  render(
    <AppLanguageProvider initialLanguage="en">
      <DiscoverOrganizationWorkbench organization={organization} />
    </AppLanguageProvider>,
  );
}

describe("DiscoverOrganizationWorkbench accent color", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    jest.mocked(sdkFetch).mockResolvedValue({ organization });
  });

  it("keeps the hex input read-only until a valid manual color is applied", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    const colorInput = screen.getByLabelText("Accent color") as HTMLInputElement;
    expect(colorInput.value).toBe("#123ABC");
    expect(colorInput.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /set manually/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /set manually/i }));
    expect(colorInput.readOnly).toBe(false);
    expect(screen.getByRole("button", { name: /apply/i })).toBeTruthy();

    await user.clear(colorInput);
    await user.type(colorInput, "#12");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(
      screen.getByText("Organization color must be a 6-digit hex value."),
    ).toBeTruthy();
    expect(colorInput.value).toBe("#12");
    expect(colorInput.readOnly).toBe(false);

    await user.clear(colorInput);
    await user.type(colorInput, "abcdef");
    expect(
      screen.queryByText("Organization color must be a 6-digit hex value."),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(colorInput.value).toBe("#ABCDEF");
    expect(colorInput.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /set manually/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith("/discover/organizations/org-1", {
        method: "PUT",
        body: expect.any(String),
      });
    });

    const body = JSON.parse(
      jest.mocked(sdkFetch).mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;
    expect(body.color_hex).toBe("#ABCDEF");
  });

  it("applies color picker changes without enabling text editing", () => {
    renderWorkbench();

    const picker = screen.getByLabelText("Accent color picker");
    const colorInput = screen.getByLabelText("Accent color") as HTMLInputElement;

    fireEvent.change(picker, { target: { value: "#445566" } });

    expect(colorInput.value).toBe("#445566");
    expect(colorInput.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /set manually/i })).toBeTruthy();
  });
});
