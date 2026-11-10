/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { PatientProfileCompletion } from "@/components/auth/patient-profile-completion";
import { sdkFetch } from "@/lib/sdk-client";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

describe("PatientProfileCompletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("completes the patient profile automatically and opens the portal", async () => {
    (sdkFetch as jest.Mock).mockResolvedValue({ state: {} });

    render(<PatientProfileCompletion />);

    expect(screen.getByRole("status").textContent).toContain(
      "Accediendo al portal de pacientes",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(sdkFetch).toHaveBeenCalledWith("/auth/profile-setup/patient", {
      method: "PUT",
    });
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/patient-portal/consents"),
    );
  });

  it("opens the invited study request after completing the patient profile", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({ state: {} });
    const destination = "/patient-portal/consents/new?studyRequestFormId=FORM-101";

    render(<PatientProfileCompletion destination={destination} />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
  });
});
