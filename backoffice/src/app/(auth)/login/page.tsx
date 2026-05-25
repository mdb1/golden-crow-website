"use client";

export const dynamic = "force-dynamic";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { signIn } from "next-auth/react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BACKOFFICE_VERSION } from "@/lib/app-version";

type ProjectKey = "mydnamap" | "pocket-gyms";
type Phase = "auth" | "select" | "signup-email" | "signup-password";
type LoadingState =
  | "google"
  | "email"
  | "signup-email"
  | "signup-password"
  | "project"
  | null;

type NoticeTone = "error" | "info" | "success";

type AuthNotice = {
  tone: NoticeTone;
  title: string;
  message: string;
  details?: string[];
  log?: AuthLog;
};

type AuthLog = {
  timestamp: string;
  surface: "legacy-login";
  source: string;
  event: string;
  message: string;
  request?: {
    method: string;
    path: string;
  };
  response?: {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
  };
  error?: unknown;
  context?: Record<string, unknown>;
};

type SignupEligibility = {
  email: string;
  eligible: boolean;
  viaAllowlist: boolean;
  viaRoleAssignment: boolean;
  role?: "full_admin" | "institution_admin" | "institution_doctor" | "patient";
  accountExists: boolean;
  projectAccess: ProjectKey[];
};

const ROLE_LABELS: Record<NonNullable<SignupEligibility["role"]>, string> = {
  full_admin: "full admin",
  institution_admin: "institution admin",
  institution_doctor: "institution doctor",
  patient: "patient",
};

const LEGACY_PROJECT_KEYS = new Set<ProjectKey>(["mydnamap", "pocket-gyms"]);

function getLegacyProjectAccess(value: unknown): ProjectKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((project): project is ProjectKey =>
    LEGACY_PROJECT_KEYS.has(project as ProjectKey)
  );
}

function getErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isAuthNotice(error: unknown): error is AuthNotice {
  return (
    typeof error === "object" &&
    error !== null &&
    "tone" in error &&
    "title" in error &&
    "message" in error
  );
}

const SENSITIVE_AUTH_LOG_KEY = /authorization|cookie|credential|idtoken|password|secret|session|token/i;

function redactForAuthLog(value: unknown, depth = 0): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return "[undefined]";
  }

  if (value instanceof Error) {
    const errorData: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };
    const code = getErrorCode(value);
    if (code) errorData.code = code;
    if (value.stack) errorData.stack = value.stack;
    const properties = Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["code", "message", "name", "stack"].includes(key)
      )
    );
    if (Object.keys(properties).length > 0) {
      errorData.properties = redactForAuthLog(properties, depth + 1);
    }
    return errorData;
  }

  if (depth >= 6) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactForAuthLog(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SENSITIVE_AUTH_LOG_KEY.test(key)
          ? "[redacted]"
          : redactForAuthLog(nested, depth + 1),
      ])
    );
  }

  return String(value);
}

function getResponseHeadersForLog(response: Response) {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = SENSITIVE_AUTH_LOG_KEY.test(key) ? "[redacted]" : value;
  });
  return headers;
}

function authErrorLog({
  source,
  event,
  message,
  error,
  context,
}: {
  source: string;
  event: string;
  message: string;
  error: unknown;
  context?: Record<string, unknown>;
}): AuthLog {
  return {
    timestamp: new Date().toISOString(),
    surface: "legacy-login",
    source,
    event,
    message,
    error: redactForAuthLog(error),
    ...(context ? { context: redactForAuthLog(context) as Record<string, unknown> } : {}),
  };
}

function authResponseLog({
  source,
  event,
  message,
  method,
  path,
  response,
  body,
  context,
}: {
  source: string;
  event: string;
  message: string;
  method: string;
  path: string;
  response: Response;
  body: unknown;
  context?: Record<string, unknown>;
}): AuthLog {
  return {
    timestamp: new Date().toISOString(),
    surface: "legacy-login",
    source,
    event,
    message,
    request: { method, path },
    response: {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: getResponseHeadersForLog(response),
      body: redactForAuthLog(body),
    },
    ...(context ? { context: redactForAuthLog(context) as Record<string, unknown> } : {}),
  };
}

function authEventLog({
  source,
  event,
  message,
  context,
}: {
  source: string;
  event: string;
  message: string;
  context?: Record<string, unknown>;
}): AuthLog {
  return {
    timestamp: new Date().toISOString(),
    surface: "legacy-login",
    source,
    event,
    message,
    ...(context ? { context: redactForAuthLog(context) as Record<string, unknown> } : {}),
  };
}

function formatAuthLog(log: AuthLog) {
  return JSON.stringify(log, null, 2);
}

function serverMessage(data: Record<string, unknown>, fallback: string) {
  return typeof data.error === "string" && data.error.trim()
    ? data.error
    : fallback;
}

function googleNotice(error: unknown): AuthNotice {
  const code = getErrorCode(error);
  const log = authErrorLog({
    source: "firebase-web-sdk",
    event: "google-sign-in",
    message: "Google sign-in failed before the legacy SDK session could be created.",
    error,
  });

  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return {
      tone: "info",
      title: "Sign-in window closed",
      message:
        "No session was created. Open Google sign-in again when you are ready.",
      log,
    };
  }

  if (code === "auth/popup-blocked") {
    return {
      tone: "error",
      title: "Browser blocked the sign-in window",
      message:
        "Allow pop-ups for this site, then try Google sign-in again.",
      details: ["You can also use the email and password option below."],
      log,
    };
  }

  if (code === "auth/network-request-failed") {
    return {
      tone: "error",
      title: "Network connection interrupted",
      message:
        "The browser could not reach Firebase. Check your connection and try again.",
      log,
    };
  }

  return {
    tone: "error",
    title: "Google sign-in did not finish",
    message:
      "The browser authenticated with Google but the backoffice could not complete the session.",
    details: ["Try again, or use email sign-in if your account has a password."],
    log,
  };
}

function emailNotice(error: unknown): AuthNotice {
  const code = getErrorCode(error);
  const log = authErrorLog({
    source: "firebase-web-sdk",
    event: "email-sign-in",
    message: "Email sign-in failed before the legacy SDK session could be created.",
    error,
  });

  if (code === "auth/invalid-email") {
    return {
      tone: "error",
      title: "Email format needs a fix",
      message: "Enter the full email address, for example team@pocketgenes.app.",
      log,
    };
  }

  if (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password"
  ) {
    return {
      tone: "error",
      title: "Email and password did not match",
      message:
        "Use the email and password for an existing backoffice account.",
      details: [
        "If this is your first time here, use Create email account so access can be checked before a password is created.",
      ],
      log,
    };
  }

  if (code === "auth/too-many-requests") {
    return {
      tone: "error",
      title: "Too many attempts",
      message:
        "Firebase temporarily slowed this account down. Wait a few minutes before trying again.",
      log,
    };
  }

  if (code === "auth/network-request-failed") {
    return {
      tone: "error",
      title: "Network connection interrupted",
      message:
        "The browser could not reach Firebase. Check your connection and try again.",
      log,
    };
  }

  return {
    tone: "error",
    title: "Email sign-in failed",
    message:
      "The credentials could not be verified. Check the email, password, and account status.",
    log,
  };
}

function sdkLoginNotice(status: number, message?: string, log?: AuthLog): AuthNotice {
  if (status === 403) {
    return {
      tone: "error",
      title: "This account is not approved for backoffice access",
      message:
        "Authentication worked, but the SDK did not find an active allowlist entry or admin role assignment for this email.",
      details: [
        "Ask a full admin to add the email to the team allowlist or assign an active admin role.",
        "If access was granted moments ago, sign out of Google and try again.",
      ],
      log,
    };
  }

  if (status === 401) {
    return {
      tone: "error",
      title: "Session token was rejected",
      message:
        "Firebase could not validate the token returned by the browser. Start the sign-in flow again.",
      log,
    };
  }

  return {
    tone: "error",
    title: "Backoffice session could not be created",
    message:
      message ||
      "The authentication service responded, but it did not create a valid backoffice session.",
    details: ["Try again. If it repeats, capture the time and ask the team to inspect SDK logs."],
    log,
  };
}

function setupNotice(message: string, log?: AuthLog): AuthNotice {
  return {
    tone: "error",
    title: "Account setup could not continue",
    message,
    details: [
      "Your credentials may be valid, but the backoffice could not load the profile or project context needed after sign-in.",
    ],
    log,
  };
}

function AuthLogDialog({
  log,
  open,
  onOpenChange,
}: {
  log: AuthLog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const formattedLog = formatAuthLog(log);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/12 bg-slate-950 text-white shadow-[0_30px_90px_rgba(2,6,23,0.55)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Authentication error log</DialogTitle>
          <DialogDescription className="text-white/62">
            Full client-side diagnostic captured for this failed sign-in attempt.
            Token, cookie, session, and password-like fields are redacted.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-auto rounded-xl border border-white/12 bg-black/35 p-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-cyan-50/82">{formattedLog}</pre>
        </div>
        <DialogFooter className="border-white/10 bg-white/[0.04]">
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              className="border-white/18 bg-white/8 text-white hover:bg-white/14"
            >
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Notice({ notice, onDismiss }: { notice: AuthNotice; onDismiss: () => void }) {
  const [logsOpen, setLogsOpen] = useState(false);
  const toneClasses = {
    error:
      "border-red-300/45 bg-red-500/13 text-red-50 shadow-[0_18px_44px_rgba(120,20,38,0.25)]",
    info:
      "border-cyan-200/40 bg-cyan-400/13 text-cyan-50 shadow-[0_18px_44px_rgba(20,82,120,0.22)]",
    success:
      "border-emerald-200/40 bg-emerald-400/13 text-emerald-50 shadow-[0_18px_44px_rgba(18,105,75,0.22)]",
  } satisfies Record<NoticeTone, string>;

  return (
    <aside
      role="alert"
      aria-live="polite"
      className={`auth-login-notice rounded-2xl border px-4 py-3 text-sm backdrop-blur-xl ${toneClasses[notice.tone]}`}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold">{notice.title}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {notice.log ? (
                <button
                  type="button"
                  onClick={() => setLogsOpen(true)}
                  className="rounded-md px-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Show logs
                </button>
              ) : null}
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-md px-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
          <p className="mt-1 text-white/78">{notice.message}</p>
          {notice.details && notice.details.length > 0 ? (
            <ul className="mt-2 space-y-1 text-white/68">
              {notice.details.map((detail) => (
                <li key={detail} className="flex gap-2">
                  <span aria-hidden className="mt-[0.55rem] size-1 rounded-full bg-white/60" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {notice.log ? (
        <AuthLogDialog log={notice.log} open={logsOpen} onOpenChange={setLogsOpen} />
      ) : null}
    </aside>
  );
}

function FieldShell({
  id,
  icon,
  label,
  helper,
  children,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  helper: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="text-white/56">{icon}</span>
          {label}
        </Label>
      </div>
      {children}
      <p id={`${id}-helper`} className="text-xs leading-5 text-white/56">
        {helper}
      </p>
    </div>
  );
}

function VersionPill() {
  return (
    <span className="inline-flex w-fit rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase text-white/70">
      Backoffice v{BACKOFFICE_VERSION}
    </span>
  );
}

function LoadingIcon() {
  return <Loader2 className="size-4 animate-spin" />;
}

function ProjectOption({
  project,
  title,
  body,
  icon,
  disabled,
  onSelect,
}: {
  project: ProjectKey;
  title: string;
  body: string;
  icon: ReactNode;
  disabled: boolean;
  onSelect: (project: ProjectKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(project)}
      disabled={disabled}
      className="group flex min-h-28 w-full items-start gap-3 rounded-2xl border border-white/13 bg-white/[0.07] p-4 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:-translate-y-0.5 hover:border-white/28 hover:bg-white/[0.11] focus:outline-none focus:ring-3 focus:ring-cyan-200/35 disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/10 text-cyan-100">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-white/58">{body}</span>
      </span>
      <ChevronRight className="mt-1 size-4 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
    </button>
  );
}

export default function LoginPage() {
  const [loading, setLoading] = useState<LoadingState>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupEligibility, setSignupEligibility] =
    useState<SignupEligibility | null>(null);

  const [phase, setPhase] = useState<Phase>("auth");
  const [pendingAuth, setPendingAuth] = useState<{
    idToken: string;
    name: string;
    email: string;
    image: string;
    projectAccess: ProjectKey[];
    redirectTo: string;
  } | null>(null);

  async function readJson(response: Response) {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async function handleAuthSuccess(options: {
    idToken: string;
    name: string;
    email: string;
    image: string;
  }) {
    const loginRes = await fetch("/api/sdk/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken: options.idToken }),
    });

    if (!loginRes.ok) {
      const data = await readJson(loginRes);
      const message = serverMessage(data, "SDK login failed.");
      let signOutError: unknown = null;
      try {
        await firebaseSignOut(auth);
      } catch (err) {
        signOutError = err;
        console.error("Firebase sign-out after SDK login failure failed:", err);
      }
      setNotice(
        sdkLoginNotice(
          loginRes.status,
          message,
          authResponseLog({
            source: "legacy-sdk",
            event: "create-backoffice-session",
            message,
            method: "POST",
            path: "/api/sdk/auth/login",
            response: loginRes,
            body: data,
            ...(signOutError ? { context: { firebaseSignOutError: signOutError } } : {}),
          })
        )
      );
      return;
    }

    const [contextRes, profileSetupRes] = await Promise.all([
      fetch("/api/sdk/auth/context", {
        credentials: "include",
      }),
      fetch("/api/sdk/auth/profile-setup", {
        credentials: "include",
      }),
    ]);

    const [contextData, profileSetupData] = (await Promise.all([
      readJson(contextRes),
      readJson(profileSetupRes),
    ])) as [
      Record<string, unknown> & { context?: { projectAccess?: unknown } },
      Record<string, unknown> & { state?: { needsCompletion?: boolean } },
    ];

    if (!contextRes.ok) {
      const message = serverMessage(
        contextData,
        "The SDK session was created, but project access could not be loaded."
      );
      throw setupNotice(
        message,
        authResponseLog({
          source: "legacy-sdk",
          event: "load-project-context",
          message,
          method: "GET",
          path: "/api/sdk/auth/context",
          response: contextRes,
          body: contextData,
        })
      );
    }

    if (!profileSetupRes.ok) {
      const message = serverMessage(
        profileSetupData,
        "The SDK session was created, but profile setup status could not be loaded."
      );
      throw setupNotice(
        message,
        authResponseLog({
          source: "legacy-sdk",
          event: "load-profile-setup",
          message,
          method: "GET",
          path: "/api/sdk/auth/profile-setup",
          response: profileSetupRes,
          body: profileSetupData,
        })
      );
    }

    const projectAccess = getLegacyProjectAccess(
      contextData.context?.projectAccess
    );
    const redirectTo = profileSetupData.state?.needsCompletion
      ? "/complete-profile"
      : "/";

    if (redirectTo === "/complete-profile") {
      const fallbackProject = projectAccess.includes("mydnamap")
        ? "mydnamap"
        : (projectAccess[0] ?? "mydnamap");
      await finalizeLogin(options, fallbackProject, redirectTo);
      return;
    }

    if (projectAccess.length === 1) {
      await finalizeLogin(options, projectAccess[0], redirectTo);
    } else if (projectAccess.length > 1) {
      setPendingAuth({ ...options, projectAccess, redirectTo });
      setPhase("select");
    } else {
      await finalizeLogin(options, "mydnamap", redirectTo);
    }
  }

  async function finalizeLogin(
    options: { idToken: string; name: string; email: string; image: string },
    project: ProjectKey,
    redirectTo: string
  ) {
    const signInResult = await signIn("credentials", {
      idToken: options.idToken,
      name: options.name,
      email: options.email,
      image: options.image,
      project,
      redirect: false,
    });

    if (signInResult?.ok) {
      window.location.href = redirectTo;
      return;
    }

    const message =
      "Firebase accepted the account, but NextAuth did not persist the browser session.";
    setNotice({
      tone: "error",
      title: "Backoffice session handoff failed",
      message,
      details: ["Try again. If it repeats, clear this site's cookies and sign in again."],
      log: authEventLog({
        source: "next-auth",
        event: "credentials-session-handoff",
        message,
        context: { project, redirectTo, signInResult },
      }),
    });
  }

  async function handleGoogleSignIn() {
    setLoading("google");
    setNotice(null);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await handleAuthSuccess({
        idToken: await result.user.getIdToken(),
        name: result.user.displayName ?? "",
        email: result.user.email ?? "",
        image: result.user.photoURL ?? "",
      });
    } catch (err) {
      if (isAuthNotice(err)) {
        setNotice(err);
      } else {
        console.error("Login error:", err);
        setNotice(googleNotice(err));
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("email");
    setNotice(null);

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await handleAuthSuccess({
        idToken: await result.user.getIdToken(),
        name: result.user.displayName ?? "",
        email: result.user.email ?? email,
        image: result.user.photoURL ?? "",
      });
    } catch (err) {
      if (isAuthNotice(err)) {
        setNotice(err);
      } else {
        console.error("Email login error:", err);
        setNotice(emailNotice(err));
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleSignupEligibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("signup-email");
    setNotice(null);
    setSignupEligibility(null);

    try {
      const response = await fetch("/api/sdk/auth/email-signup/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signupEmail }),
      });
      const data = (await readJson(response)) as Partial<SignupEligibility> & {
        error?: string;
      };

      if (!response.ok) {
        const message = serverMessage(data, "Unable to validate this email right now.");
        throw {
          tone: "error",
          title: "Access check could not run",
          message,
          details: ["No account was created. Try again before choosing a password."],
          log: authResponseLog({
            source: "legacy-sdk",
            event: "check-email-signup-eligibility",
            message,
            method: "POST",
            path: "/api/sdk/auth/email-signup/eligibility",
            response,
            body: data,
          }),
        } satisfies AuthNotice;
      }

      if (!data.eligible || !data.email) {
        const message =
          "The new-user flow only creates accounts for emails already approved by the team.";
        setNotice({
          tone: "error",
          title: "This email is not approved yet",
          message,
          details: [
            "Ask a full admin to add the email to the allowlist or assign an active admin role first.",
            "After approval, return here and run this check again.",
          ],
          log: authEventLog({
            source: "legacy-sdk",
            event: "email-signup-eligibility-denied",
            message,
            context: { eligibility: data },
          }),
        });
        return;
      }

      if (data.accountExists) {
        setNotice({
          tone: "info",
          title: "An account already exists for this email",
          message:
            "Use the email sign-in form instead. This new-user flow only creates the first password for invited accounts.",
        });
        return;
      }

      setSignupEmail(data.email);
      setSignupEligibility(data as SignupEligibility);
      setSignupPassword("");
      setPhase("signup-password");
      setNotice({
        tone: "success",
        title: "Access approved",
        message:
          "This email can create a backoffice account. Choose a password to finish setup.",
      });
    } catch (err) {
      if (isAuthNotice(err)) {
        setNotice(err);
      } else {
        console.error("Signup eligibility error:", err);
        const message =
          err instanceof Error
            ? err.message
            : "Unable to validate this email right now.";
        setNotice({
          tone: "error",
          title: "Access check failed",
          message,
          log: authErrorLog({
            source: "legacy-sdk",
            event: "check-email-signup-eligibility",
            message,
            error: err,
          }),
        });
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleEmailAccountCreation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signupEligibility) {
      setPhase("signup-email");
      return;
    }

    setLoading("signup-password");
    setNotice(null);

    try {
      const createRes = await fetch("/api/sdk/auth/email-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signupEligibility.email,
          password: signupPassword,
        }),
      });
      const createData = await readJson(createRes);

      if (!createRes.ok) {
        const message = serverMessage(createData, "Unable to create the email account.");
        setNotice({
          tone: "error",
          title: "Account was not created",
          message,
          details: [
            "Confirm the email is still approved and use a password with at least 6 characters.",
          ],
          log: authResponseLog({
            source: "legacy-sdk",
            event: "create-email-account",
            message,
            method: "POST",
            path: "/api/sdk/auth/email-signup",
            response: createRes,
            body: createData,
          }),
        });
        return;
      }

      const result = await signInWithEmailAndPassword(
        auth,
        signupEligibility.email,
        signupPassword
      );
      await handleAuthSuccess({
        idToken: await result.user.getIdToken(),
        name: result.user.displayName ?? "",
        email: result.user.email ?? signupEligibility.email,
        image: result.user.photoURL ?? "",
      });
    } catch (err) {
      if (isAuthNotice(err)) {
        setNotice(err);
      } else {
        console.error("Email signup error:", err);
        const message =
          err instanceof Error
            ? err.message
            : "Unable to create the email account.";
        setNotice({
          tone: "error",
          title: "Account setup stopped",
          message,
          details: ["No dashboard access was changed. You can retry from the access check step."],
          log: authErrorLog({
            source: "legacy-sdk",
            event: "create-email-account",
            message,
            error: err,
          }),
        });
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleProjectSelect(project: ProjectKey) {
    if (!pendingAuth) return;
    setLoading("project");
    setNotice(null);
    try {
      await finalizeLogin(pendingAuth, project, pendingAuth.redirectTo);
    } catch (err) {
      console.error("Project select error:", err);
      const message =
        "The account is valid, but the selected project session could not be saved.";
      setNotice({
        tone: "error",
        title: "Project handoff failed",
        message,
        details: ["Try selecting the project again."],
        log: authErrorLog({
          source: "next-auth",
          event: "selected-project-session-handoff",
          message,
          error: err,
          context: { project, redirectTo: pendingAuth.redirectTo },
        }),
      });
    } finally {
      setLoading(null);
    }
  }

  function resetToAuth() {
    setPhase("auth");
    setNotice(null);
    setSignupEligibility(null);
    setSignupPassword("");
  }

  const signupAccessLabel = signupEligibility?.viaRoleAssignment
    ? signupEligibility.role
      ? `approved through the ${ROLE_LABELS[signupEligibility.role]} role assignment`
      : "approved through an active role assignment"
    : "approved through the team allowlist";

  const panelTitle =
    phase === "select"
      ? "Choose your workspace"
      : phase === "signup-email"
        ? "Create an email account"
        : phase === "signup-password"
          ? "Finish new-user setup"
          : "Welcome back";

  const panelDescription =
    phase === "select"
      ? "Your account can manage more than one legacy product. Pick where to continue."
      : phase === "signup-email"
        ? "This path is for invited new users who do not have an email password yet."
        : phase === "signup-password"
          ? "Access is approved. Set the first password for this account."
          : "Sign in to the Golden Crow legacy backoffice for PocketGenes and Pocket Gyms.";

  return (
    <main className="auth-liquid-canvas relative isolate min-h-[calc(100vh-5rem)] w-full overflow-hidden rounded-[2rem] border border-white/12 bg-slate-950 p-4 text-white shadow-[0_28px_90px_rgba(3,7,18,0.42)] sm:p-6 lg:min-h-[760px]">
      <div className="auth-liquid-flow" aria-hidden />
      <div className="auth-liquid-sheen" aria-hidden />

      <div className="relative z-10 grid min-h-[inherit] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(410px,470px)]">
        <section className="hidden min-h-[640px] flex-col justify-between rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl lg:flex">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-3 py-1 text-xs font-semibold text-white/75">
              <Sparkles className="size-3.5 text-amber-200" />
              Golden Crow operations
            </div>

            <div className="max-w-xl space-y-4">
              <h1 className="font-heading text-4xl font-semibold leading-tight tracking-normal text-white">
                A sharper front door for focused backoffice work.
              </h1>
              <p className="max-w-lg text-base leading-7 text-white/68">
                Authenticate once, route into the right legacy product, and keep
                account creation limited to people who are already approved.
              </p>
            </div>

            <div className="grid gap-3 xl:grid-cols-3">
              <div className="auth-login-glass rounded-2xl p-4">
                <ShieldCheck className="mb-3 size-5 text-cyan-100" />
                <p className="text-sm font-semibold">Access checked</p>
                <p className="mt-1 text-xs leading-5 text-white/56">
                  Firebase identity plus SDK allowlist or admin role.
                </p>
              </div>
              <div className="auth-login-glass rounded-2xl p-4">
                <Building2 className="mb-3 size-5 text-emerald-100" />
                <p className="text-sm font-semibold">Project aware</p>
                <p className="mt-1 text-xs leading-5 text-white/56">
                  PocketGenes and Pocket Gyms stay on the legacy session path.
                </p>
              </div>
              <div className="auth-login-glass rounded-2xl p-4">
                <BadgeCheck className="mb-3 size-5 text-amber-100" />
                <p className="text-sm font-semibold">Version visible</p>
                <p className="mt-1 text-xs leading-5 text-white/56">
                  Every pushed backoffice change exposes its version here.
                </p>
              </div>
            </div>
          </div>

          <div className="auth-login-glass rounded-3xl p-5">
            <p className="text-sm font-semibold text-white">New-user path</p>
            <p className="mt-2 text-sm leading-6 text-white/62">
              Create email account is not open registration. It first checks
              whether the email is already approved, then creates the password
              only for that invited user.
            </p>
          </div>
        </section>

        <section className="auth-login-panel relative mx-auto flex w-full max-w-[470px] flex-col gap-6 rounded-[1.6rem] p-5 sm:p-6 lg:my-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <p className="section-eyebrow text-white/58">Secure backoffice</p>
              <h2 className="font-heading text-3xl font-semibold tracking-normal text-white">
                {panelTitle}
              </h2>
              <p className="text-sm leading-6 text-white/60">{panelDescription}</p>
            </div>
            <VersionPill />
          </div>

          {notice ? (
            <Notice notice={notice} onDismiss={() => setNotice(null)} />
          ) : null}

          {phase === "select" && pendingAuth ? (
            <div className="space-y-4">
              <ProjectOption
                project="mydnamap"
                title="PocketGenes"
                body="Genomics reports, learning content, community moderation, and account records."
                icon={<ShieldCheck className="size-5" />}
                disabled={loading !== null}
                onSelect={handleProjectSelect}
              />
              <ProjectOption
                project="pocket-gyms"
                title="Pocket Gyms"
                body="Members, training plans, booking surfaces, clinical notes, and achievements."
                icon={<Building2 className="size-5" />}
                disabled={loading !== null}
                onSelect={handleProjectSelect}
              />
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-full justify-center text-white/75 hover:bg-white/10 hover:text-white"
                onClick={resetToAuth}
                disabled={loading !== null}
              >
                <ArrowLeft className="size-4" />
                Use a different account
              </Button>
            </div>
          ) : null}

          {phase === "auth" ? (
            <div className="space-y-5">
              <Button
                onClick={handleGoogleSignIn}
                disabled={loading !== null}
                className="h-11 w-full justify-center rounded-xl bg-white text-slate-950 hover:bg-white/88"
              >
                {loading === "google" ? <LoadingIcon /> : <LogIn className="size-4" />}
                {loading === "google" ? "Opening Google..." : "Continue with Google"}
              </Button>

              <div className="flex items-center gap-3 text-xs font-medium uppercase text-white/38">
                <span className="h-px flex-1 bg-white/12" />
                or use email
                <span className="h-px flex-1 bg-white/12" />
              </div>

              <form className="space-y-4" onSubmit={handleEmailSignIn}>
                <FieldShell
                  id="login-email"
                  label="Email"
                  helper="Use the email that has backoffice access."
                  icon={<Mail className="size-4" />}
                >
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="team@pocketgenes.app"
                    aria-describedby="login-email-helper"
                    required
                    className="h-11 rounded-xl border-white/18 bg-white/95 px-4 text-slate-950 placeholder:text-slate-500"
                  />
                </FieldShell>

                <FieldShell
                  id="login-password"
                  label="Password"
                  helper="For existing email accounts. New users should use the account creation flow below."
                  icon={<LockKeyhole className="size-4" />}
                >
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    aria-describedby="login-password-helper"
                    required
                    className="h-11 rounded-xl border-white/18 bg-white/95 px-4 text-slate-950 placeholder:text-slate-500"
                  />
                </FieldShell>

                <Button
                  type="submit"
                  disabled={loading !== null}
                  className="h-11 w-full justify-center rounded-xl"
                >
                  {loading === "email" ? <LoadingIcon /> : <KeyRound className="size-4" />}
                  {loading === "email" ? "Checking credentials..." : "Sign in with email"}
                </Button>
              </form>

              <div className="auth-login-glass rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/10 text-emerald-100">
                    <UserPlus className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">New invited user?</p>
                    <p className="mt-1 text-sm leading-6 text-white/60">
                      This creates the first email/password account only after
                      the backoffice confirms your email is already approved.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 h-10 w-full justify-center rounded-xl border-white/18 bg-white/8 text-white hover:bg-white/14"
                      disabled={loading !== null}
                      onClick={() => {
                        setSignupEmail(email);
                        setNotice(null);
                        setPhase("signup-email");
                      }}
                    >
                      <UserPlus className="size-4" />
                      Create email account
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {phase === "signup-email" ? (
            <div className="space-y-5">
              <div className="auth-login-glass rounded-2xl p-4 text-sm leading-6 text-white/62">
                This is a new-user setup flow, not open registration. We check
                the email against the backend allowlist and active role
                assignments before creating anything.
              </div>

              <form className="space-y-4" onSubmit={handleSignupEligibility}>
                <FieldShell
                  id="signup-email"
                  label="Invited email"
                  helper="Enter the exact email a full admin approved for backoffice access."
                  icon={<Mail className="size-4" />}
                >
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    value={signupEmail}
                    onChange={(event) => setSignupEmail(event.target.value)}
                    placeholder="admin@institution.com"
                    aria-describedby="signup-email-helper"
                    required
                    className="h-11 rounded-xl border-white/18 bg-white/95 px-4 text-slate-950 placeholder:text-slate-500"
                  />
                </FieldShell>

                <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetToAuth}
                    className="h-11 rounded-xl border-white/18 bg-white/8 text-white hover:bg-white/14"
                  >
                    <ArrowLeft className="size-4" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading !== null}
                    className="h-11 justify-center rounded-xl"
                  >
                    {loading === "signup-email" ? (
                      <LoadingIcon />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                    {loading === "signup-email" ? "Checking access..." : "Check access first"}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          {phase === "signup-password" && signupEligibility ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-200/30 bg-emerald-400/12 p-4 text-sm text-emerald-50">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Access approved</p>
                    <p className="mt-1 leading-6 text-emerald-50/72">
                      {signupEligibility.email} was {signupAccessLabel}. Set a
                      password and the account will be created immediately.
                    </p>
                  </div>
                </div>
              </div>

              <form className="space-y-4" onSubmit={handleEmailAccountCreation}>
                <FieldShell
                  id="signup-password"
                  label="New password"
                  helper="Use at least 6 characters. You will be signed in after the account is created."
                  icon={<KeyRound className="size-4" />}
                >
                  <Input
                    id="signup-password"
                    type="password"
                    autoComplete="new-password"
                    value={signupPassword}
                    onChange={(event) => setSignupPassword(event.target.value)}
                    placeholder="Choose a password"
                    minLength={6}
                    aria-describedby="signup-password-helper"
                    required
                    className="h-11 rounded-xl border-white/18 bg-white/95 px-4 text-slate-950 placeholder:text-slate-500"
                  />
                </FieldShell>

                <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPhase("signup-email");
                      setNotice(null);
                    }}
                    className="h-11 rounded-xl border-white/18 bg-white/8 text-white hover:bg-white/14"
                  >
                    <ArrowLeft className="size-4" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading !== null || signupPassword.trim().length < 6}
                    className="h-11 justify-center rounded-xl"
                  >
                    {loading === "signup-password" ? (
                      <LoadingIcon />
                    ) : (
                      <UserPlus className="size-4" />
                    )}
                    {loading === "signup-password" ? "Creating account..." : "Create account"}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
