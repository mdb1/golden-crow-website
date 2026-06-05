"use client";

export const dynamic = "force-dynamic";

import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  Dna,
  Dumbbell,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck,
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
  | "password-reset"
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
  accountHasGoogle?: boolean;
  accountHasPassword?: boolean;
  signInProviders?: string[];
  projectAccess: ProjectKey[];
};

const ROLE_LABELS: Record<NonNullable<SignupEligibility["role"]>, string> = {
  full_admin: "full admin",
  institution_admin: "institution admin",
  institution_doctor: "institution doctor",
  patient: "patient",
};

const LEGACY_PROJECT_KEYS = new Set<ProjectKey>(["mydnamap", "pocket-gyms"]);
const GOOGLE_SIGN_IN_METHOD = "google.com";
const PASSWORD_SIGN_IN_METHOD = "password";

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

function isCredentialMismatch(error: unknown): boolean {
  const code = getErrorCode(error);
  return (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password"
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

async function readJson(response: Response) {
  const responseForTextFallback = response.clone();
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    try {
      const rawBody = await responseForTextFallback.text();
      return rawBody.trim() ? { rawBody } : {};
    } catch {
      return {};
    }
  }
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

async function googleOnlyPasswordNotice(
  error: unknown,
  attemptedEmail: string
): Promise<AuthNotice | null> {
  if (!isCredentialMismatch(error)) return null;

  const normalizedEmail = attemptedEmail.trim();
  if (!normalizedEmail) return null;

  try {
    const response = await fetch("/api/sdk/auth/email-signup/eligibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });
    const data = (await readJson(response)) as Partial<SignupEligibility>;
    const signInMethods = Array.isArray(data.signInProviders)
      ? data.signInProviders.filter(
          (provider): provider is string => typeof provider === "string"
        )
      : [];

    if (
      response.ok &&
      data.accountExists === true &&
      data.accountHasGoogle === true &&
      data.accountHasPassword === false
    ) {
      const message =
        "A user was found with that email, but it has no password registered.";

      return {
        tone: "error",
        title: "This account uses Google sign-in",
        message,
        details: [
          "Use Continue with Google to sign in with that user.",
          "Password login will keep failing until a password provider is added to the Firebase account.",
        ],
        log: authErrorLog({
          source: "legacy-sdk",
          event: "email-sign-in-google-only-account",
          message,
          error,
          context: { email: normalizedEmail, signInMethods },
        }),
      };
    }
  } catch (lookupError) {
    console.warn("SDK sign-in method lookup failed:", lookupError);
  }

  try {
    const signInMethods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
    const hasGoogle = signInMethods.includes(GOOGLE_SIGN_IN_METHOD);
    const hasPassword = signInMethods.includes(PASSWORD_SIGN_IN_METHOD);

    if (!hasGoogle || hasPassword) return null;

    const message =
      "A user was found with that email, but it has no password registered.";

    return {
      tone: "error",
      title: "This account uses Google sign-in",
      message,
      details: [
        "Use Continue with Google to sign in with that user.",
        "Password login will keep failing until a password provider is added to the Firebase account.",
      ],
      log: authErrorLog({
        source: "firebase-web-sdk",
        event: "email-sign-in-google-only-account",
        message,
        error,
        context: { email: normalizedEmail, signInMethods },
      }),
    };
  } catch (lookupError) {
    console.warn("Firebase sign-in method lookup failed:", lookupError);
    return null;
  }
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

function buildLegacyGoogleProvider(emailHint: string) {
  const normalizedEmailHint = emailHint.trim();
  const hasEmailHint = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmailHint);
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  provider.setCustomParameters({
    prompt: "select_account",
    ...(hasEmailHint ? { login_hint: normalizedEmailHint } : {}),
  });
  return provider;
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
      <DialogContent className="border-white/70 bg-white/92 text-slate-950 shadow-[0_30px_90px_rgba(47,28,70,0.28)] backdrop-blur-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Authentication error log</DialogTitle>
          <DialogDescription className="text-slate-600">
            Full client-side diagnostic captured for this failed sign-in attempt.
            Token, cookie, session, and password-like fields are redacted.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-900/10 bg-slate-950 p-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-cyan-50/82">{formattedLog}</pre>
        </div>
        <DialogFooter className="border-slate-900/10 bg-white/45">
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              className="border-slate-900/10 bg-white/70 text-slate-800 hover:bg-white hover:text-slate-950"
            >
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordResetDialog({
  email,
  open,
  sent,
  sending,
  onOpenChange,
  onConfirm,
}: {
  email: string;
  open: boolean;
  sent: boolean;
  sending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/70 bg-white/92 text-slate-950 shadow-[0_30px_90px_rgba(47,28,70,0.28)] backdrop-blur-2xl sm:max-w-md">
        {sent ? (
          <>
            <DialogHeader>
              <div className="mb-1 flex size-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="size-5" />
              </div>
              <DialogTitle>Password reset email sent</DialogTitle>
              <DialogDescription className="text-slate-600">
                Congratulations. Firebase sent the reset email to{" "}
                <span className="font-semibold text-slate-900">{email}</span>.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm leading-6 text-slate-600">
              Open that email and follow the link to choose a new password, then
              return here to sign in.
            </p>
            <DialogFooter className="border-slate-900/10 bg-white/45">
              <DialogClose asChild>
                <Button
                  type="button"
                  className="h-10 rounded-xl"
                  onClick={() => onOpenChange(false)}
                >
                  Done
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reset password?</DialogTitle>
              <DialogDescription className="text-slate-600">
                Firebase will send a password reset link to{" "}
                <span className="font-semibold text-slate-900">{email}</span>.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm leading-6 text-slate-600">
              Confirm the email address is correct before sending. The current
              sign-in attempt will stay on this screen.
            </p>
            <DialogFooter className="border-slate-900/10 bg-white/45">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={sending}
                  className="h-10 rounded-xl border-slate-900/10 bg-white/70 text-slate-800 hover:bg-white hover:text-slate-950"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                disabled={sending}
                className="h-10 rounded-xl"
                onClick={onConfirm}
              >
                {sending ? <LoadingIcon /> : <Mail className="size-4" />}
                {sending ? "Sending..." : "Send reset email"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Notice({ notice, onDismiss }: { notice: AuthNotice; onDismiss: () => void }) {
  const [logsOpen, setLogsOpen] = useState(false);
  const toneClasses = {
    error:
      "border-red-200 bg-red-50/82 text-red-950 shadow-[0_18px_44px_rgba(120,20,38,0.14)]",
    info:
      "border-cyan-200 bg-cyan-50/82 text-cyan-950 shadow-[0_18px_44px_rgba(20,82,120,0.12)]",
    success:
      "border-emerald-200 bg-emerald-50/82 text-emerald-950 shadow-[0_18px_44px_rgba(18,105,75,0.12)]",
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
                  className="rounded-md px-1.5 text-xs font-medium text-slate-600 transition hover:bg-white/70 hover:text-slate-950"
                >
                  Show logs
                </button>
              ) : null}
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-md px-1.5 text-xs font-medium text-slate-600 transition hover:bg-white/70 hover:text-slate-950"
              >
                Dismiss
              </button>
            </div>
          </div>
          <p className="mt-1 text-slate-700">{notice.message}</p>
          {notice.details && notice.details.length > 0 ? (
            <ul className="mt-2 space-y-1 text-slate-600">
              {notice.details.map((detail) => (
                <li key={detail} className="flex gap-2">
                  <span aria-hidden className="mt-[0.55rem] size-1 rounded-full bg-current/70" />
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
        <Label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="text-slate-500">{icon}</span>
          {label}
        </Label>
      </div>
      {children}
      <p id={`${id}-helper`} className="text-xs leading-5 text-slate-600">
        {helper}
      </p>
    </div>
  );
}

function PasswordInput({
  id,
  autoComplete,
  value,
  onChange,
  placeholder,
  describedBy,
  minLength,
  visible,
  onToggleVisibility,
}: {
  id: string;
  autoComplete: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  describedBy: string;
  minLength?: number;
  visible: boolean;
  onToggleVisibility: () => void;
}) {
  const label = visible ? "Hide password" : "Show password";

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minLength={minLength}
        aria-describedby={describedBy}
        required
        className="h-11 rounded-xl border-slate-900/10 bg-white/78 px-4 pr-12 text-slate-950 shadow-inner shadow-white/30 placeholder:text-slate-400"
      />
      <button
        type="button"
        onClick={onToggleVisibility}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 focus:outline-none focus:ring-3 focus:ring-cyan-300/45"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function VersionPill() {
  return (
    <span className="inline-flex w-fit rounded-full border border-slate-900/10 bg-white/55 px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
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
      className="group flex min-h-28 w-full items-start gap-3 rounded-2xl border border-slate-900/10 bg-white/48 p-4 text-left text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition hover:-translate-y-0.5 hover:border-slate-900/15 hover:bg-white/70 focus:outline-none focus:ring-3 focus:ring-cyan-300/45 disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-900/10 bg-white/65">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-slate-600">{body}</span>
      </span>
      <ChevronRight className="mt-1 size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
    </button>
  );
}

export default function LoginPage() {
  const [loading, setLoading] = useState<LoadingState>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordResetEmail, setPasswordResetEmail] = useState("");
  const [passwordResetDialogOpen, setPasswordResetDialogOpen] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
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
      await firebaseSignOut(auth).catch((err) => {
        console.warn("Firebase sign-out before Google account selection failed:", err);
      });
      const provider = buildLegacyGoogleProvider(email);
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
        setNotice((await googleOnlyPasswordNotice(err, email)) ?? emailNotice(err));
      }
    } finally {
      setLoading(null);
    }
  }

  function handlePasswordResetRequest() {
    const resetEmail = email.trim();
    if (!resetEmail) {
      setNotice({
        tone: "info",
        title: "Enter the account email first",
        message:
          "Add the email address that should receive the Firebase password reset link.",
      });
      return;
    }

    setPasswordResetEmail(resetEmail);
    setPasswordResetSent(false);
    setNotice(null);
    setPasswordResetDialogOpen(true);
  }

  function handlePasswordResetDialogOpenChange(open: boolean) {
    if (loading === "password-reset") return;
    setPasswordResetDialogOpen(open);
    if (!open) {
      setPasswordResetSent(false);
    }
  }

  async function handleSendPasswordResetEmail() {
    const resetEmail = passwordResetEmail.trim();
    if (!resetEmail) return;

    setLoading("password-reset");
    setNotice(null);

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setPasswordResetSent(true);
    } catch (err) {
      console.error("Password reset email error:", err);
      const message =
        "Firebase could not send the password reset email. Confirm the email and try again.";
      setPasswordResetDialogOpen(false);
      setNotice({
        tone: "error",
        title: "Password reset email was not sent",
        message,
        log: authErrorLog({
          source: "firebase-web-sdk",
          event: "password-reset-email",
          message,
          error: err,
          context: { email: resetEmail },
        }),
      });
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
      setShowSignupPassword(false);
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
    setShowSignupPassword(false);
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
    <main className="auth-liquid-canvas fixed inset-0 isolate min-h-screen w-full overflow-x-hidden overflow-y-auto text-slate-950">
      <div className="auth-liquid-flow" aria-hidden />
      <div className="auth-liquid-sheen" aria-hidden />

      <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <section className="auth-login-stage relative mx-auto grid w-full max-w-[1240px] gap-5 rounded-[2rem] p-4 sm:p-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.78fr)] lg:p-6">
          <aside className="auth-brand-panel flex min-h-[520px] flex-col gap-6 rounded-[1.65rem] p-5 sm:p-7 lg:min-h-[610px] lg:p-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/60 bg-white/40 px-4 py-2 text-sm font-semibold text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)]">
              <CheckCircle2 className="size-4 text-amber-500" />
              Golden Crow operations
            </div>

            <div className="max-w-[680px] space-y-5">
              <h1 className="font-heading text-4xl font-semibold leading-[1.08] text-slate-950">
                Run Golden Crow operations from one focused workspace.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-700">
                Manage users, roles, reports, files, 2PQ forms, institutions,
                doctors, and patients with the right product context always in view.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="auth-feature-card rounded-2xl p-4">
                <ShieldCheck className="size-5 text-cyan-700" />
                <p className="mt-4 text-sm font-semibold text-slate-950">
                  Scoped control
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Full admins see the whole operation, while institution teams stay
                  inside their assigned doctors, patients, and forms.
                </p>
              </div>
              <div className="auth-feature-card rounded-2xl p-4">
                <Building2 className="size-5 text-emerald-700" />
                <p className="mt-4 text-sm font-semibold text-slate-950">
                  Product aware
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Switch between PocketGenes, Pocket Gyms, and 2PQ workflows
                  without losing the operational context of each product.
                </p>
              </div>
              <div className="auth-feature-card rounded-2xl p-4">
                <KeyRound className="size-5 text-amber-600" />
                <p className="mt-4 text-sm font-semibold text-slate-950">
                  Traceable changes
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Each release keeps the backoffice version visible, so support
                  and operators can identify the exact build in use.
                </p>
              </div>
            </div>

            <div className="auth-path-card mt-auto rounded-2xl p-5">
              <p className="text-sm font-semibold text-slate-950">New-user path</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                Create email account is not open registration. It first checks
                whether the email is already approved, then creates the password
                only for that invited user.
              </p>
            </div>
          </aside>

          <section className="auth-login-panel relative flex w-full flex-col gap-6 rounded-[1.6rem] p-5 sm:p-6 lg:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <p className="section-eyebrow text-slate-500">Secure backoffice</p>
              <h2 className="font-heading text-3xl font-semibold tracking-normal text-slate-950">
                {panelTitle}
              </h2>
              <p className="text-sm leading-6 text-slate-600">{panelDescription}</p>
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
                icon={<Dna className="size-5 text-rose-600" />}
                disabled={loading !== null}
                onSelect={handleProjectSelect}
              />
              <ProjectOption
                project="pocket-gyms"
                title="Pocket Gyms"
                body="Members, training plans, booking surfaces, clinical notes, and achievements."
                icon={<Dumbbell className="size-5 text-indigo-600" />}
                disabled={loading !== null}
                onSelect={handleProjectSelect}
              />
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-full justify-center text-slate-600 hover:bg-white/60 hover:text-slate-950"
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
                className="h-11 w-full justify-center rounded-xl bg-slate-950 text-white hover:bg-slate-800"
              >
                {loading === "google" ? <LoadingIcon /> : <LogIn className="size-4" />}
                {loading === "google" ? "Opening Google..." : "Continue with Google"}
              </Button>

              <div className="flex items-center gap-3 text-xs font-medium uppercase text-slate-400">
                <span className="h-px flex-1 bg-slate-900/10" />
                or use email
                <span className="h-px flex-1 bg-slate-900/10" />
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
                    className="h-11 rounded-xl border-slate-900/10 bg-white/78 px-4 text-slate-950 shadow-inner shadow-white/30 placeholder:text-slate-400"
                  />
                </FieldShell>

                <FieldShell
                  id="login-password"
                  label="Password"
                  helper="For existing email accounts. New users should use the account creation flow below."
                  icon={<LockKeyhole className="size-4" />}
                >
                  <PasswordInput
                    id="login-password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    describedBy="login-password-helper"
                    visible={showPassword}
                    onToggleVisibility={() => setShowPassword((current) => !current)}
                  />
                </FieldShell>

                <div className="-mt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={loading !== null}
                    onClick={handlePasswordResetRequest}
                    className="h-8 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-white/60 hover:text-slate-950"
                  >
                    {loading === "password-reset" ? (
                      <LoadingIcon />
                    ) : (
                      <Mail className="size-3.5" />
                    )}
                    Forgot password?
                  </Button>
                </div>

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
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-900/10 bg-white/65 text-emerald-700">
                    <UserPlus className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-950">New invited user?</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      This creates the first email/password account only after
                      the backoffice confirms your email is already approved.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 h-10 w-full justify-center rounded-xl border-slate-900/10 bg-white/60 text-slate-800 hover:bg-white/85 hover:text-slate-950"
                      disabled={loading !== null}
                      onClick={() => {
                        setSignupEmail(email);
                        setNotice(null);
                        setShowSignupPassword(false);
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
              <div className="auth-login-glass rounded-2xl p-4 text-sm leading-6 text-slate-700">
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
                    className="h-11 rounded-xl border-slate-900/10 bg-white/78 px-4 text-slate-950 shadow-inner shadow-white/30 placeholder:text-slate-400"
                  />
                </FieldShell>

                <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetToAuth}
                    className="h-11 rounded-xl border-slate-900/10 bg-white/60 text-slate-800 hover:bg-white/85 hover:text-slate-950"
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
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/82 p-4 text-sm text-emerald-950 shadow-[0_18px_44px_rgba(18,105,75,0.12)]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Access approved</p>
                    <p className="mt-1 leading-6 text-emerald-800">
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
                  <PasswordInput
                    id="signup-password"
                    autoComplete="new-password"
                    value={signupPassword}
                    onChange={(event) => setSignupPassword(event.target.value)}
                    placeholder="Choose a password"
                    minLength={6}
                    describedBy="signup-password-helper"
                    visible={showSignupPassword}
                    onToggleVisibility={() =>
                      setShowSignupPassword((current) => !current)
                    }
                  />
                </FieldShell>

                <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPhase("signup-email");
                      setNotice(null);
                      setShowSignupPassword(false);
                    }}
                    className="h-11 rounded-xl border-slate-900/10 bg-white/60 text-slate-800 hover:bg-white/85 hover:text-slate-950"
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
        </section>
      </div>
      <PasswordResetDialog
        email={passwordResetEmail}
        open={passwordResetDialogOpen}
        sent={passwordResetSent}
        sending={loading === "password-reset"}
        onOpenChange={handlePasswordResetDialogOpenChange}
        onConfirm={handleSendPasswordResetEmail}
      />
    </main>
  );
}
