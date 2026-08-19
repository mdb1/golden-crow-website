/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompleteProfileFlow } from "@/components/auth/complete-profile-flow";
import { sdkFetch } from "@/lib/sdk-client";

const replace = jest.fn();
const router = { replace };

jest.mock("next/navigation", () => ({
  useRouter: () => router,
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
  SdkRequestError: class SdkRequestError extends Error {},
}));

function profileSetupState() {
  return {
    uid: "user-1",
    email: "doctor@example.com",
    displayName: "",
    onboardingCompleted: false,
    needsCompletion: true,
    docs: {
      profile: false,
      publicProfile: false,
      communityUser: false,
      reportOwner: false,
    },
    defaults: {
      fullName: "Dra. Jane Doe",
      username: "jane.doe",
      iconName: "person.crop.circle.fill",
      iconColorHex: "#5A4FCF",
      ownerProfession: "",
      ownerCompany: "",
      ownerContactNumber: "",
      ownerBio: "",
      gender: "",
      condition: "",
    },
  };
}

describe("CompleteProfileFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sdkFetch as jest.Mock).mockResolvedValue({ state: profileSetupState() });
  });

  it("defaults to Spanish and switches visible copy to English", async () => {
    const user = userEvent.setup();

    render(<CompleteProfileFlow />);

    expect(
      await screen.findByRole("heading", { name: "Completa tu perfil" }),
    ).toBeTruthy();
    expect(screen.getByText("Paso 1 de 2")).toBeTruthy();
    expect(screen.getByLabelText("Nombre completo")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "EN" }));

    expect(
      screen.getByRole("heading", { name: "Complete your profile" }),
    ).toBeTruthy();
    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
    expect(screen.getByLabelText("Full name")).toBeTruthy();
  });

  it("shows Skip until optional professional details are filled", async () => {
    const user = userEvent.setup();

    render(<CompleteProfileFlow />);

    await screen.findByRole("heading", { name: "Completa tu perfil" });
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(
      screen.getByRole("heading", { name: "Datos profesionales" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Omitir" })).toBeTruthy();
    expect(screen.getByText(/Estos datos profesionales son opcionales/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Profesión/), "Genetista");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Finalizar perfil" }),
      ).toBeTruthy(),
    );
  });
});
