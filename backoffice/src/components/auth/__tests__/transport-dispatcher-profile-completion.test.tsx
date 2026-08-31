/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { TransportDispatcherProfileCompletion } from "@/components/auth/transport-dispatcher-profile-completion";
import { sdkFetch } from "@/lib/sdk-client";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

describe("TransportDispatcherProfileCompletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("completes the PGFlex dispatcher profile automatically and opens logistics", async () => {
    (sdkFetch as jest.Mock).mockResolvedValue({ state: {} });

    render(<TransportDispatcherProfileCompletion />);

    expect(screen.getByRole("status").textContent).toContain(
      "Accediendo a PGFlex",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(sdkFetch).toHaveBeenCalledWith("/auth/profile-setup/pgflex", {
      method: "PUT",
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/pgflex/logistics"));
  });
});
