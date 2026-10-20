"use client";

import type { User } from "firebase/auth";
import type { Session } from "next-auth";

export type SdkSessionSurface = "backoffice" | "publisher-portal";

export const EXPECTED_SESSION_UID_HEADER = "x-expected-session-uid";
const SESSION_RECOVERY_HEADER = "x-sdk-session-recovery";
export const EXPECTED_SESSION_EMAIL_HEADER = "x-expected-session-email";
export const EXPECTED_SESSION_PROJECT_HEADER = "x-expected-session-project";
export const EXPECTED_SESSION_SURFACE_HEADER = "x-expected-session-surface";

export type SdkSessionIdentity = {
  uid: string;
  email: string;
  project: string;
  surface: SdkSessionSurface;
};

export type SdkSessionRecoveryErrorCode =
  | "signed_out"
  | "identity_mismatch"
  | "page_session_mismatch"
  | "next_auth_rejected"
  | "sdk_rejected";

export class SdkSessionRecoveryError extends Error {
  code: SdkSessionRecoveryErrorCode;

  constructor(code: SdkSessionRecoveryErrorCode, message: string) {
    super(message);
    this.name = "SdkSessionRecoveryError";
    this.code = code;
  }
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function assertExpectedIdentity(user: User, expected: SdkSessionIdentity) {
  const uidMatches = user.uid === expected.uid;
  const emailMatches =
    normalizeEmail(user.email) === normalizeEmail(expected.email);

  if (!uidMatches || !emailMatches) {
    throw new SdkSessionRecoveryError(
      "identity_mismatch",
      "Sign in with the same account that opened this service offer.",
    );
  }
}

async function responseBody(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function pageSessionMatches(
  session: Session | null,
  expected: SdkSessionIdentity,
) {
  return Boolean(
    session?.user &&
      normalizeEmail(session.user.email) === normalizeEmail(expected.email) &&
      session.user.project === expected.project &&
      session.user.accessSurface === expected.surface,
  );
}

async function requireMatchingPageSession(expected: SdkSessionIdentity) {
  const { getSession } = await import("next-auth/react");
  const session = await getSession();
  if (!pageSessionMatches(session, expected)) {
    throw new SdkSessionRecoveryError(
      "page_session_mismatch",
      "The page session changed. Sign in with the original account to continue.",
    );
  }
}

async function createSdkSession(
  user: User,
  expected: SdkSessionIdentity,
  idToken?: string,
) {
  assertExpectedIdentity(user, expected);
  const verifiedIdToken = idToken ?? (await user.getIdToken(true));
  const response = await fetch("/api/sdk/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [SESSION_RECOVERY_HEADER]: "1",
      [EXPECTED_SESSION_UID_HEADER]: expected.uid,
      [EXPECTED_SESSION_EMAIL_HEADER]: expected.email,
      [EXPECTED_SESSION_PROJECT_HEADER]: expected.project,
      [EXPECTED_SESSION_SURFACE_HEADER]: expected.surface,
    },
    credentials: "include",
    body: JSON.stringify({ idToken: verifiedIdToken, surface: expected.surface }),
  });
  const body = await responseBody(response);

  if (!response.ok) {
    const message =
      typeof body.error === "string" && body.error.trim()
        ? body.error.trim()
        : "The session could not be renewed.";
    throw new SdkSessionRecoveryError("sdk_rejected", message);
  }

  const verifiedUid = typeof body.uid === "string" ? body.uid : "";
  const verifiedEmail = typeof body.email === "string" ? body.email : "";
  if (
    (verifiedUid && verifiedUid !== expected.uid) ||
    (verifiedEmail &&
      normalizeEmail(verifiedEmail) !== normalizeEmail(expected.email))
  ) {
    throw new SdkSessionRecoveryError(
      "identity_mismatch",
      "The renewed session belongs to a different account.",
    );
  }

  try {
    await requireMatchingPageSession(expected);
  } catch (error) {
    await fetch("/api/sdk/auth/logout", { method: "POST" }).catch(
      () => undefined,
    );
    throw error;
  }

  return verifiedIdToken;
}

async function completeInteractiveRecovery(
  user: User,
  expected: SdkSessionIdentity,
) {
  assertExpectedIdentity(user, expected);
  const idToken = await user.getIdToken(true);
  const { getSession, signIn, signOut } = await import("next-auth/react");
  const nextAuthResult = await signIn("credentials", {
    idToken,
    name: user.displayName ?? "",
    email: user.email ?? expected.email,
    image: user.photoURL ?? "",
    project: expected.project,
    accessSurface: expected.surface,
    redirect: false,
  });

  if (!nextAuthResult?.ok) {
    throw new SdkSessionRecoveryError(
      "next_auth_rejected",
      "The page session could not be renewed.",
    );
  }

  const pageSession = await getSession();
  if (!pageSessionMatches(pageSession, expected)) {
    await signOut({ redirect: false }).catch(() => undefined);
    throw new SdkSessionRecoveryError(
      "page_session_mismatch",
      "The renewed page session belongs to a different account.",
    );
  }

  try {
    await createSdkSession(user, expected, idToken);
  } catch (error) {
    await fetch("/api/sdk/auth/logout", { method: "POST" }).catch(
      () => undefined,
    );
    throw error;
  }
}

/** Renew the short-lived SDK cookie without navigating away from the page. */
export async function renewSdkSession(
  expected: SdkSessionIdentity,
): Promise<void> {
  await requireMatchingPageSession(expected);
  const { getFirebaseAuth } = await import("@/lib/firebase");
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new SdkSessionRecoveryError(
      "signed_out",
      "Sign in again to continue.",
    );
  }

  await createSdkSession(user, expected);
}

/** Reauthenticate with the account's password while leaving the page mounted. */
export async function signInSdkSessionWithPassword(
  expected: SdkSessionIdentity,
  password: string,
): Promise<void> {
  const [{ signInWithEmailAndPassword, signOut }, { getFirebaseAuth }] =
    await Promise.all([import("firebase/auth"), import("@/lib/firebase")]);
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(
    auth,
    expected.email,
    password,
  );
  try {
    await completeInteractiveRecovery(credential.user, expected);
  } catch (error) {
    if (
      error instanceof SdkSessionRecoveryError &&
      error.code === "identity_mismatch"
    ) {
      await signOut(auth).catch(() => undefined);
    }
    throw error;
  }
}

/** Reauthenticate with Google while leaving the page mounted. */
export async function signInSdkSessionWithGoogle(
  expected: SdkSessionIdentity,
): Promise<void> {
  const [
    {
      GoogleAuthProvider,
      reauthenticateWithPopup,
      signOut,
      signInWithPopup,
    },
    { getFirebaseAuth },
  ] = await Promise.all([import("firebase/auth"), import("@/lib/firebase")]);
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const currentUser = auth.currentUser;
  const reauthenticatesCurrentUser = Boolean(
    currentUser &&
      currentUser.uid === expected.uid &&
      normalizeEmail(currentUser.email) === normalizeEmail(expected.email),
  );
  const credential = reauthenticatesCurrentUser
    ? await reauthenticateWithPopup(currentUser!, provider)
    : await signInWithPopup(auth, provider);

  try {
    await completeInteractiveRecovery(credential.user, expected);
  } catch (error) {
    if (
      !reauthenticatesCurrentUser &&
      error instanceof SdkSessionRecoveryError &&
      error.code === "identity_mismatch"
    ) {
      await signOut(auth).catch(() => undefined);
    }
    throw error;
  }
}
