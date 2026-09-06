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
});
