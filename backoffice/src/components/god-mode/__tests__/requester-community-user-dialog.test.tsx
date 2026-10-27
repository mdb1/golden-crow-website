/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { RequesterCommunityUserDialog } from "@/components/god-mode/requester-community-user-dialog";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

const communityUserDocument: ModerationDocumentRecord = {
  id: "community-user-1",
  path: "community_users/community-user-1",
  collection: "community_users",
  data: {
    username: "community_ada",
    email: "community.ada@example.org",
    is_activity_public: true,
    is_clinician: true,
    icon_name: "stethoscope",
    icon_color_hex: "#5A4FCF",
    owned_reports: ["report-1", "report-2"],
    stats: {
      total_likes: 17,
      posts_created: 4,
      total_replies: 9,
      aminoacids_collected: 23,
      lessons_learned: 6,
    },
    updatedAt: "2026-10-20T12:00:00.000Z",
  },
};

const publicProfileDocument: ModerationDocumentRecord = {
  id: "community-user-1",
  path: "public_profiles/community-user-1",
  collection: "public_profiles",
  data: {
    fullName: "Ada Community",
    username: "ada_public",
    email: "ada.public@example.org",
    gender: "female",
    condition: "Hereditary cancer risk",
    has_profile_image: true,
    iconName: "stethoscope",
    iconColorHex: "#5A4FCF",
    updatedAt: "2026-10-21T13:30:00.000Z",
  },
};

function notFound(path: string) {
  return new SdkRequestError({
    status: 404,
    method: "GET",
    path,
    message: "Document not found",
    details: "Document not found",
  });
}

function renderDialog(language: "en" | "es" = "en") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider initialLanguage={language} forcedLanguage={language}>
        <RequesterCommunityUserDialog userId="community-user-1" />
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("RequesterCommunityUserDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows Abrir only after verifying the community user and opens a read-only combined detail", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      if (path === "/moderation/community_users/community-user-1") {
        return { document: communityUserDocument };
      }
      if (path === "/moderation/public_profiles/community-user-1") {
        return { document: publicProfileDocument };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderDialog("es");

    const openButton = await screen.findByRole("button", { name: "Abrir" });
    expect(sdkFetchMock).toHaveBeenCalledWith(
      "/moderation/community_users/community-user-1",
    );
    expect(sdkFetchMock).not.toHaveBeenCalledWith(
      "/moderation/public_profiles/community-user-1",
    );

    fireEvent.click(openButton);

    const dialog = await screen.findByRole("dialog", {
      name: "Detalles del usuario de comunidad",
    });
    expect(await within(dialog).findByText("Ada Community")).toBeInTheDocument();
    expect(within(dialog).getByText("community_ada")).toBeInTheDocument();
    expect(
      within(dialog).getByText("community.ada@example.org"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("ada_public")).toBeInTheDocument();
    expect(within(dialog).getByText("Hereditary cancer risk")).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
  });

  it("does not expose the action when the community user no longer exists", async () => {
    sdkFetchMock.mockRejectedValue(
      notFound("/moderation/community_users/community-user-1"),
    );

    renderDialog("es");

    await waitFor(() => {
      expect(sdkFetchMock).toHaveBeenCalledWith(
        "/moderation/community_users/community-user-1",
      );
    });
    expect(screen.queryByRole("button", { name: "Abrir" })).not.toBeInTheDocument();
    expect(sdkFetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the community detail available when the public profile is absent", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      if (path === "/moderation/community_users/community-user-1") {
        return { document: communityUserDocument };
      }
      if (path === "/moderation/public_profiles/community-user-1") {
        throw notFound(path);
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Open" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Community user details",
    });
    expect(within(dialog).getByText("community_ada")).toBeInTheDocument();
    expect(
      await within(dialog).findByText(
        "No public profile is available for this community user.",
      ),
    ).toBeInTheDocument();
  });
});
