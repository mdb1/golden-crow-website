/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { PublisherProfileCompletion } from "@/components/auth/publisher-profile-completion";
import { sdkFetch } from "@/lib/sdk-client";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

describe("PublisherProfileCompletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, "", "/publisher-portal/complete-profile");
  });

  it("completes the publisher profile automatically and opens the portal", async () => {
    (sdkFetch as jest.Mock).mockResolvedValue({ state: {} });

    render(<PublisherProfileCompletion />);

    expect(screen.getByRole("status").textContent).toContain(
      "Accediendo al portal de publicadores",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(sdkFetch).toHaveBeenCalledWith("/auth/profile-setup/publisher", {
      method: "PUT",
    });
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/publisher-portal/home"),
    );
  });

  it.each([
    "/publisher-portal/app/new",
    "/publisher-portal/app/accept-terms-and-conditions",
  ])(
    "continues to the email destination %s after first-time setup",
    async (callback) => {
      (sdkFetch as jest.Mock).mockResolvedValue({ state: {} });
      window.history.replaceState(
        {},
        "",
        `/publisher-portal/complete-profile?callbackUrl=${encodeURIComponent(callback)}`,
      );

      render(<PublisherProfileCompletion />);

      await waitFor(() => expect(replace).toHaveBeenCalledWith(callback));
    },
  );

  it.each([
    "https://example.com/outside",
    "//example.com/outside",
    "/2pq-dashboard",
    "/publisher-portal/%2e%2e/login",
    "/publisher-portal/complete-profile?callbackUrl=/publisher-portal/app/new",
  ])(
    "returns safely home for the invalid setup callback %s",
    async (callback) => {
      (sdkFetch as jest.Mock).mockResolvedValue({ state: {} });
      window.history.replaceState(
        {},
        "",
        `/publisher-portal/complete-profile?callbackUrl=${encodeURIComponent(callback)}`,
      );

      render(<PublisherProfileCompletion />);

      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith("/publisher-portal/home"),
      );
    },
  );
});
