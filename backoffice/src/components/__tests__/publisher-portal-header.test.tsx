/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { signOut as signOutFirebase } from "firebase/auth";
import { signOut as signOutNextAuth } from "next-auth/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PublisherPortalHeader } from "@/components/publisher-portal-header";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getFirebaseAuth } from "@/lib/firebase";

const mockRouterReplace = jest.fn();
const mockRouterRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/publisher-portal/service-offers",
  useRouter: () => ({
    replace: mockRouterReplace,
    refresh: mockRouterRefresh,
  }),
}));

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

jest.mock("firebase/auth", () => ({
  signOut: jest.fn(),
}));

jest.mock("@/lib/firebase", () => ({
  getFirebaseAuth: jest.fn(),
}));

jest.mock("@/components/appearance-toggle", () => ({
  AppearanceToggle: () => null,
}));

describe("PublisherPortalHeader", () => {
  const fetchMock = jest.fn();
  const firebaseAuth = { currentUser: { uid: "publisher-1" } };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    jest
      .mocked(getFirebaseAuth)
      .mockReturnValue(
        firebaseAuth as unknown as ReturnType<typeof getFirebaseAuth>,
      );
  });

  it("clears Firebase and NextAuth even when SDK logout is unavailable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("SDK unavailable"));

    render(
      <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
        <SidebarProvider>
          <PublisherPortalHeader />
        </SidebarProvider>
      </AppLanguageProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => {
      expect(signOutFirebase).toHaveBeenCalledWith(firebaseAuth);
      expect(fetchMock).toHaveBeenCalledWith("/api/sdk/auth/logout", {
        method: "POST",
      });
      expect(signOutNextAuth).toHaveBeenCalledWith({
        callbackUrl: "/publisher-portal/login",
        redirect: false,
      });
      expect(mockRouterReplace).toHaveBeenCalledWith("/publisher-portal/login");
      expect(mockRouterRefresh).toHaveBeenCalled();
    });
    expect(jest.mocked(signOutFirebase).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(signOutNextAuth).mock.invocationCallOrder[0],
    );
    expect(jest.mocked(signOutNextAuth).mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );
  });
});
