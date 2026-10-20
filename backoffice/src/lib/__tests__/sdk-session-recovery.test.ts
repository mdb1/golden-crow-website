/** @jest-environment jsdom */

import {
  renewSdkSession,
  signInSdkSessionWithGoogle,
  signInSdkSessionWithPassword,
  type SdkSessionIdentity,
} from "@/lib/sdk-session-recovery";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  getSession,
  signIn as signInNextAuth,
  signOut as signOutNextAuth,
} from "next-auth/react";

jest.mock("@/lib/firebase", () => ({
  getFirebaseAuth: jest.fn(),
}));

jest.mock("firebase/auth", () => ({
  GoogleAuthProvider: jest.fn(() => ({
    setCustomParameters: jest.fn(),
  })),
  reauthenticateWithPopup: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("next-auth/react", () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

const getFirebaseAuthMock = getFirebaseAuth as jest.MockedFunction<
  typeof getFirebaseAuth
>;
const signInWithEmailAndPasswordMock =
  signInWithEmailAndPassword as jest.MockedFunction<
    typeof signInWithEmailAndPassword
  >;
const signInWithPopupMock = signInWithPopup as jest.MockedFunction<
  typeof signInWithPopup
>;
const firebaseSignOutMock = signOut as jest.MockedFunction<typeof signOut>;
const getSessionMock = getSession as jest.MockedFunction<typeof getSession>;
const nextAuthSignInMock = signInNextAuth as jest.MockedFunction<
  typeof signInNextAuth
>;
const nextAuthSignOutMock = signOutNextAuth as jest.MockedFunction<
  typeof signOutNextAuth
>;
const fetchMock = jest.fn();

const identity: SdkSessionIdentity = {
  uid: "publisher-user-1",
  email: "Publisher@Example.com",
  project: "mydnamap",
  surface: "publisher-portal",
};

function matchingPageSession() {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    user: {
      email: identity.email.toLowerCase(),
      project: identity.project,
      accessSurface: identity.surface,
    },
  };
}

function firebaseUser(overrides: Record<string, unknown> = {}) {
  return {
    uid: identity.uid,
    email: identity.email.toLowerCase(),
    displayName: "Publisher User",
    photoURL: "https://example.com/photo.png",
    getIdToken: jest.fn().mockResolvedValue("fresh-id-token"),
    ...overrides,
  };
}

function firebaseAuth(currentUser: ReturnType<typeof firebaseUser> | null) {
  return {
    authStateReady: jest.fn().mockResolvedValue(undefined),
    currentUser,
  };
}

function successfulSdkResponse() {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({
      uid: identity.uid,
      email: identity.email.toLowerCase(),
    }),
  };
}

describe("SDK session recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    getSessionMock.mockReset();
    nextAuthSignInMock.mockReset();
    nextAuthSignOutMock.mockReset();
    getSessionMock.mockResolvedValue(matchingPageSession());
    nextAuthSignInMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      url: null,
    });
    nextAuthSignOutMock.mockResolvedValue({ url: "" });
    Object.defineProperty(global, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
  });

  it("renews the SDK cookie from the hydrated matching Firebase user", async () => {
    const user = firebaseUser();
    getFirebaseAuthMock.mockReturnValue(
      firebaseAuth(user) as unknown as ReturnType<typeof getFirebaseAuth>,
    );
    fetchMock.mockResolvedValue(successfulSdkResponse());

    await renewSdkSession(identity);

    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sdk/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          idToken: "fresh-id-token",
          surface: "publisher-portal",
        }),
      }),
    );
    const recoveryHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(recoveryHeaders.get("x-sdk-session-recovery")).toBe("1");
    expect(recoveryHeaders.get("x-expected-session-uid")).toBe(identity.uid);
    expect(recoveryHeaders.get("x-expected-session-email")).toBe(
      identity.email,
    );
    expect(recoveryHeaders.get("x-expected-session-project")).toBe(
      identity.project,
    );
    expect(recoveryHeaders.get("x-expected-session-surface")).toBe(
      identity.surface,
    );
  });

  it("rejects a different Firebase identity before minting a session", async () => {
    const user = firebaseUser({ uid: "different-user" });
    getFirebaseAuthMock.mockReturnValue(
      firebaseAuth(user) as unknown as ReturnType<typeof getFirebaseAuth>,
    );

    await expect(renewSdkSession(identity)).rejects.toEqual(
      expect.objectContaining({
        code: "identity_mismatch",
      }),
    );
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not silently mint an SDK session after the page session ended", async () => {
    const user = firebaseUser();
    getSessionMock.mockResolvedValueOnce(null);
    getFirebaseAuthMock.mockReturnValue(
      firebaseAuth(user) as unknown as ReturnType<typeof getFirebaseAuth>,
    );

    await expect(renewSdkSession(identity)).rejects.toEqual(
      expect.objectContaining({
        code: "page_session_mismatch",
      }),
    );

    expect(getFirebaseAuthMock).not.toHaveBeenCalled();
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not silently mint an SDK session for a stale tab after an account switch", async () => {
    const user = firebaseUser();
    getSessionMock.mockResolvedValueOnce({
      expires: "2099-01-01T00:00:00.000Z",
      user: {
        email: "different@example.com",
        project: identity.project,
        accessSurface: identity.surface,
      },
    });
    getFirebaseAuthMock.mockReturnValue(
      firebaseAuth(user) as unknown as ReturnType<typeof getFirebaseAuth>,
    );

    await expect(renewSdkSession(identity)).rejects.toEqual(
      expect.objectContaining({
        code: "page_session_mismatch",
      }),
    );

    expect(getFirebaseAuthMock).not.toHaveBeenCalled();
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the renewed SDK cookie if the page signs out during renewal", async () => {
    const user = firebaseUser();
    getFirebaseAuthMock.mockReturnValue(
      firebaseAuth(user) as unknown as ReturnType<typeof getFirebaseAuth>,
    );
    getSessionMock
      .mockResolvedValueOnce(matchingPageSession())
      .mockResolvedValueOnce(null);
    fetchMock.mockResolvedValue(successfulSdkResponse());

    await expect(renewSdkSession(identity)).rejects.toEqual(
      expect.objectContaining({
        code: "page_session_mismatch",
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/sdk/auth/logout",
      { method: "POST" },
    );
  });

  it("reauthenticates by password without navigation and refreshes the SDK session", async () => {
    const user = firebaseUser();
    const auth = firebaseAuth(null);
    getFirebaseAuthMock.mockReturnValue(
      auth as unknown as ReturnType<typeof getFirebaseAuth>,
    );
    signInWithEmailAndPasswordMock.mockResolvedValue({
      user,
    } as unknown as Awaited<ReturnType<typeof signInWithEmailAndPassword>>);
    fetchMock.mockResolvedValue(successfulSdkResponse());

    await signInSdkSessionWithPassword(identity, "secret-password");

    expect(signInWithEmailAndPasswordMock).toHaveBeenCalledWith(
      auth,
      identity.email,
      "secret-password",
    );
    expect(nextAuthSignInMock).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({
        idToken: "fresh-id-token",
        email: identity.email.toLowerCase(),
        project: identity.project,
        accessSurface: identity.surface,
        redirect: false,
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("signs out if password authentication resolves to a different identity", async () => {
    const auth = firebaseAuth(null);
    const differentUser = firebaseUser({
      uid: "different-user",
      email: "different@example.com",
    });
    getFirebaseAuthMock.mockReturnValue(
      auth as unknown as ReturnType<typeof getFirebaseAuth>,
    );
    signInWithEmailAndPasswordMock.mockResolvedValue({
      user: differentUser,
    } as unknown as Awaited<ReturnType<typeof signInWithEmailAndPassword>>);
    firebaseSignOutMock.mockResolvedValue();

    await expect(
      signInSdkSessionWithPassword(identity, "secret-password"),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "identity_mismatch",
      }),
    );

    expect(firebaseSignOutMock).toHaveBeenCalledWith(auth);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs out a different Google account before reporting the mismatch", async () => {
    const auth = firebaseAuth(null);
    const differentUser = firebaseUser({
      uid: "different-user",
      email: "different@example.com",
    });
    getFirebaseAuthMock.mockReturnValue(
      auth as unknown as ReturnType<typeof getFirebaseAuth>,
    );
    signInWithPopupMock.mockResolvedValue({
      user: differentUser,
    } as unknown as Awaited<ReturnType<typeof signInWithPopup>>);
    firebaseSignOutMock.mockResolvedValue();

    await expect(signInSdkSessionWithGoogle(identity)).rejects.toEqual(
      expect.objectContaining({
        code: "identity_mismatch",
      }),
    );

    expect(firebaseSignOutMock).toHaveBeenCalledWith(auth);
    expect(differentUser.getIdToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
