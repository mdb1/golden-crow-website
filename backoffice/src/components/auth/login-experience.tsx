"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
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
  CheckCircle2,
  ChevronRight,
  XCircle,
  Dna,
  Dumbbell,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
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
import {
  LANGUAGE_COOKIE_NAME,
  LANGUAGE_STORAGE_KEY,
  resolveAppLanguage,
  type AppLanguage,
} from "@/lib/language";
import {
  normalizePatientPortalCallbackUrl,
  PATIENT_PORTAL_ENTRY_ROUTE,
} from "@/lib/patient-portal-routes";
import type { AdminRole } from "@/lib/admin-areas";

type ProjectKey = "mydnamap" | "pocket-gyms";
export type LoginSurface = "backoffice" | "patient-portal";
type Phase = "auth" | "select" | "signup-email" | "signup-password";
type LoadingState =
  | "google"
  | "email-check"
  | "email"
  | "password-reset"
  | "signup-email"
  | "signup-password"
  | "project"
  | null;

type NoticeTone = "error" | "info" | "success";
type PasswordResetCheck = {
  label: string;
  passed: boolean;
  detail: string;
};

type PasswordResetResult = {
  tone: "success" | "error";
  title: string;
  message: string;
  checks: PasswordResetCheck[];
} | null;

type AuthNotice = {
  tone: NoticeTone;
  title: string;
  message: string;
  details?: string[];
  action?: {
    href: string;
    label: string;
  };
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
  canAccessBackoffice: boolean;
  canAccessPatientPortal: boolean;
  requiredSurface?: LoginSurface;
  role?: AdminRole;
  accountExists: boolean;
  accountHasGoogle?: boolean;
  accountHasPassword?: boolean;
  signInProviders?: string[];
  projectAccess: ProjectKey[];
};

const ROLE_LABELS: Record<NonNullable<SignupEligibility["role"]>, string> = {
  full_admin: "full admin",
  organization_publisher: "organization publisher",
  institution_admin: "institution admin",
  institution_operator: "institution operator",
  institution_laboratory_staff: "institution laboratory staff",
  institution_doctor: "institution doctor",
  patient: "patient",
};

const LEGACY_PROJECT_KEYS = new Set<ProjectKey>(["mydnamap", "pocket-gyms"]);
const GOOGLE_SIGN_IN_METHOD = "google.com";
const PASSWORD_SIGN_IN_METHOD = "password";
const LOGIN_LANGUAGE_OPTIONS: AppLanguage[] = ["en", "es"];

const LOGIN_SPANISH_TEXT: Record<string, string> = {
  "full admin": "administrador total",
  "organization publisher": "publicador de organizacion",
  "institution admin": "administrador de institucion",
  "institution operator": "operador de institucion",
  "institution laboratory staff": "personal de laboratorio de institucion",
  "institution doctor": "medico de institucion",
  patient: "paciente",
  "Password reset email sent": "Email de recuperacion enviado",
  "Firebase Auth account exists": "La cuenta de Firebase Auth existe",
  "The legacy SDK found this exact email in Firebase Auth.":
    "El SDK legacy encontro este email exacto en Firebase Auth.",
  "Email/password provider exists": "El proveedor email/password existe",
  "This account is configured for password sign-in.":
    "Esta cuenta esta configurada para iniciar sesion con password.",
  "Firebase reset email sent": "Email de recuperacion enviado por Firebase",
  "Firebase accepted the password reset email request.":
    "Firebase acepto el envio del email de recuperacion.",
  "Firebase Auth account not found": "Cuenta de Firebase Auth no encontrada",
  "The legacy SDK did not find this email in Firebase Auth.":
    "El SDK legacy no encontro este email en Firebase Auth.",
  "Skipped because there is no matching Firebase Auth account.":
    "Omitido porque no existe una cuenta de Firebase Auth coincidente.",
  "Not attempted because there is no matching account.":
    "No se intento porque no existe una cuenta coincidente.",
  "Password sign-in is not enabled": "El inicio con password no esta habilitado",
  "Firebase Auth does not list the password provider for this account.":
    "Firebase Auth no lista el proveedor password para esta cuenta.",
  "Not attempted because password reset only applies to password accounts.":
    "No se intento porque la recuperacion aplica solo a cuentas con password.",
  "Firebase could not send the reset email":
    "Firebase no pudo enviar el email de recuperacion",
  "Firebase returned an error while sending the reset email.":
    "Firebase devolvio un error al enviar el email de recuperacion.",
  "Sign-in window closed": "Ventana de inicio cerrada",
  "No session was created. Open Google sign-in again when you are ready.":
    "No se creo ninguna sesion. Abri Google de nuevo cuando estes listo.",
  "Browser blocked the sign-in window":
    "El navegador bloqueo la ventana de inicio",
  "Allow pop-ups for this site, then try Google sign-in again.":
    "Permiti pop-ups para este sitio y volve a intentar con Google.",
  "You can also use the email and password option below.":
    "Tambien podes usar la opcion de email y password abajo.",
  "Network connection interrupted": "Conexion de red interrumpida",
  "The browser could not reach Firebase. Check your connection and try again.":
    "El navegador no pudo conectarse con Firebase. Revisa tu conexion e intenta de nuevo.",
  "Google sign-in did not finish": "El inicio con Google no termino",
  "The browser authenticated with Google but the backoffice could not complete the session.":
    "El navegador autentico con Google, pero el backoffice no pudo completar la sesion.",
  "Try again, or use email sign-in if your account has a password.":
    "Intenta de nuevo, o usa email si tu cuenta tiene password.",
  "A user was found with that email, but it has no password registered.":
    "Se encontro un usuario con ese email, pero no tiene password registrado.",
  "This account uses Google sign-in": "Esta cuenta usa inicio con Google",
  "Use Continue with Google to sign in with that user.":
    "Usa Continuar con Google para iniciar sesion con ese usuario.",
  "Password login will keep failing until a password provider is added to the Firebase account.":
    "El inicio con password seguira fallando hasta que se agregue ese proveedor a la cuenta de Firebase.",
  "Email format needs a fix": "El formato del email necesita correccion",
  "Enter the full email address, for example team@pocketgenes.app.":
    "Ingresa el email completo, por ejemplo team@pocketgenes.app.",
  "Email and password did not match": "El email y el password no coinciden",
  "Check the email and password for this backoffice account, then try again.":
    "Revisa el email y password de esta cuenta del backoffice y volve a intentar.",
  "If you do not remember the password, contact an administrator to reset access.":
    "Si no recordas el password, contacta a un administrador para restablecer el acceso.",
  "Too many attempts": "Demasiados intentos",
  "Firebase temporarily slowed this account down. Wait a few minutes before trying again.":
    "Firebase limito temporalmente esta cuenta. Espera unos minutos antes de intentar de nuevo.",
  "Email sign-in failed": "Fallo el inicio con email",
  "The credentials could not be verified. Check the email, password, and account status.":
    "No se pudieron verificar las credenciales. Revisa el email, el password y el estado de la cuenta.",
  "This account is not approved for backoffice access":
    "Esta cuenta no esta aprobada para acceder al backoffice",
  "Authentication worked, but the SDK did not find an active allowlist entry or admin role assignment for this email.":
    "La autenticacion funciono, pero el SDK no encontro una entrada activa en la allowlist ni una asignacion admin para este email.",
  "Ask a full admin to add the email to the team allowlist or assign an active admin role.":
    "Pedi a un full admin que agregue el email a la allowlist o asigne un rol admin activo.",
  "If access was granted moments ago, sign out of Google and try again.":
    "Si el acceso fue otorgado hace instantes, cerra sesion de Google e intenta de nuevo.",
  "Session token was rejected": "El token de sesion fue rechazado",
  "Firebase could not validate the token returned by the browser. Start the sign-in flow again.":
    "Firebase no pudo validar el token devuelto por el navegador. Inicia el flujo de nuevo.",
  "Backoffice session could not be created":
    "No se pudo crear la sesion del backoffice",
  "The authentication service responded, but it did not create a valid backoffice session.":
    "El servicio de autenticacion respondio, pero no creo una sesion valida del backoffice.",
  "Try again. If it repeats, capture the time and ask the team to inspect SDK logs.":
    "Intenta de nuevo. Si se repite, registra la hora y pedi al equipo que revise los logs del SDK.",
  "Account setup could not continue": "La configuracion de cuenta no pudo continuar",
  "Your credentials may be valid, but the backoffice could not load the profile or project context needed after sign-in.":
    "Tus credenciales pueden ser validas, pero el backoffice no pudo cargar el perfil o contexto de proyecto necesario.",
  "Authentication error log": "Log de error de autenticacion",
  "Full client-side diagnostic captured for this failed sign-in attempt. Token, cookie, session, and password-like fields are redacted.":
    "Diagnostico completo del cliente para este intento fallido. Tokens, cookies, sesiones y campos similares a passwords estan redactados.",
  Close: "Cerrar",
  "Open that email and follow the link to choose a new password, then return here to continue.":
    "Abri ese email y segui el enlace para elegir un nuevo password. Despues volve aca para continuar.",
  "Open that email and follow the link to choose a new password, then return here to sign in.":
    "Abri ese email y segui el enlace para elegir un nuevo password. Despues volve aca para iniciar sesion.",
  Done: "Listo",
  "Try another email": "Probar otro email",
  "Reset password?": "Recuperar password?",
  "Firebase will send a password reset link to":
    "Firebase enviara un enlace de recuperacion a",
  "Only continue if this is the exact email for the account that needs a new password.":
    "Continua solo si este es el email exacto de la cuenta que necesita un nuevo password.",
  "Confirm the email address is correct before sending. The current sign-in attempt will stay on this screen.":
    "Confirma que el email sea correcto antes de enviar. El intento de inicio actual permanecera en esta pantalla.",
  Cancel: "Cancelar",
  "Sending...": "Enviando...",
  "Send reset email": "Enviar email de recuperacion",
  "View log": "Ver log",
  Dismiss: "Cerrar",
  "Hide password": "Ocultar password",
  "Show password": "Mostrar password",
  "Login language": "Idioma del login",
  "Golden Crow operations": "Operaciones Golden Crow",
  "Run Golden Crow operations from one focused workspace.":
    "Gestiona operaciones desde un espacio de trabajo enfocado.",
  "Manage users, roles, reports, files, 2PQ forms, institutions, doctors, and patients with the right product context always in view.":
    "Gestiona usuarios, roles, reportes, archivos, formularios 2PQ, instituciones, medicos y pacientes con el contexto correcto siempre visible.",
  "New invited user?": "Usuario nuevo invitado?",
  "Create email account": "Crear cuenta con email",
  "Create email account is not open registration. It confirms approval first, then creates the first email/password account for that invited user.":
    "Crear cuenta con email no es registro abierto. Primero confirma la aprobacion y despues crea la primera cuenta email/password para ese usuario invitado.",
  "Secure backoffice": "Backoffice seguro",
  "Choose your workspace": "Elegir workspace",
  "Create an email account": "Crear una cuenta con email",
  "Finish new-user setup": "Finalizar configuracion de nuevo usuario",
  "Welcome back": "Bienvenido de nuevo",
  "Patient portal": "Portal de pacientes",
  "Your account can manage more than one legacy product. Pick where to continue.":
    "Tu cuenta puede gestionar mas de un producto legacy. Elegi donde continuar.",
  "This path is for invited new users who do not have an email password yet.":
    "Este camino es para usuarios invitados que todavia no tienen password de email.",
  "Access is approved. Set the first password for this account.":
    "El acceso esta aprobado. Establece el primer password de esta cuenta.",
  "Sign in to the Golden Crow legacy backoffice for PocketGenes and Pocket Gyms.":
    "Inicia sesion en el backoffice legacy de Golden Crow para PocketGenes y Pocket Gyms.",
  "Genomics reports, learning content, community moderation, and account records.":
    "Reportes genomicos, contenido de aprendizaje, moderacion comunitaria y registros de cuenta.",
  "Members, training plans, booking surfaces, clinical notes, and achievements.":
    "Miembros, planes de entrenamiento, reservas, notas clinicas y logros.",
  "Use a different account": "Usar otra cuenta",
  "Opening Google...": "Abriendo Google...",
  "Continue with Google": "Continuar con Google",
  "or use email": "o usa email",
  Email: "Email",
  "Email checked. Use Change email to choose a different account.":
    "Email verificado. Usa Cambiar email para elegir otra cuenta.",
  "Use the email that has backoffice access.":
    "Usa el email que tiene acceso al backoffice.",
  "Change email": "Cambiar email",
  Password: "Password",
  "Enter the password for this approved email account.":
    "Ingresa el password de esta cuenta aprobada.",
  "Forgot password?": "Olvidaste tu password?",
  "Your temporary password was sent to you by email.":
    "Tu contrasena temporal fue enviada por email.",
  "Your security key was sent to you by email.":
    "Tu clave de seguridad fue enviada por email.",
  "If you did not receive it, ask your doctor to send it again.":
    "Si no la recibiste, pedi a tu medico que vuelva a enviartela.",
  "Checking credentials...": "Verificando credenciales...",
  "Sign in with email": "Iniciar con email",
  "Security key": "Clave de seguridad",
  "Access portal": "Acceder al portal",
  "Checking email...": "Verificando email...",
  Continue: "Continuar",
  "This is a new-user setup flow, not open registration. We check the email against the backend allowlist and active role assignments before creating anything.":
    "Este es un flujo de configuracion para nuevo usuario, no registro abierto. Verificamos el email contra la allowlist y roles activos antes de crear algo.",
  "Invited email": "Email invitado",
  "Enter the exact email a full admin approved for backoffice access.":
    "Ingresa el email exacto que un full admin aprobo para acceder al backoffice.",
  Back: "Volver",
  "Checking access...": "Verificando acceso...",
  "Check access first": "Verificar acceso primero",
  "Access approved": "Acceso aprobado",
  "New password": "Nuevo password",
  "Use at least 6 characters. You will be signed in after the account is created.":
    "Usa al menos 6 caracteres. Iniciaras sesion despues de crear la cuenta.",
  "Choose a password": "Elegir password",
  "Creating account...": "Creando cuenta...",
  "Create account": "Crear cuenta",
  "Backoffice session handoff failed": "Fallo el traspaso de sesion",
  "Firebase accepted the account, but NextAuth did not persist the browser session.":
    "Firebase acepto la cuenta, pero NextAuth no persistio la sesion del navegador.",
  "Try again. If it repeats, clear this site's cookies and sign in again.":
    "Intenta de nuevo. Si se repite, borra las cookies de este sitio e inicia sesion otra vez.",
  "Email check could not run": "No se pudo verificar el email",
  "Try again before entering a password.": "Intenta de nuevo antes de ingresar un password.",
  "This account exists, but it is not approved for backoffice access.":
    "Esta cuenta existe, pero no esta aprobada para acceder al backoffice.",
  "No backoffice account or approved invitation was found for this email.":
    "No se encontro una cuenta de backoffice ni una invitacion aprobada para este email.",
  "This email is not approved yet": "Este email todavia no esta aprobado",
  "Ask a full admin to add the email to the allowlist or assign an active admin role first.":
    "Pedi a un full admin que agregue el email a la allowlist o asigne un rol admin activo primero.",
  "This invited email can create a backoffice account. Choose a password to finish setup.":
    "Este email invitado puede crear una cuenta de backoffice. Elegi un password para terminar.",
  "A user was found with that email, but password sign-in is not enabled.":
    "Se encontro un usuario con ese email, pero el inicio con password no esta habilitado.",
  "Ask an admin to confirm the account sign-in provider.":
    "Pedi a un admin que confirme el proveedor de inicio de sesion de la cuenta.",
  "Email check failed": "Fallo la verificacion de email",
  "The backoffice could not check this email right now.":
    "El backoffice no pudo verificar este email ahora.",
  "Enter the account email first": "Ingresa primero el email de la cuenta",
  "Add the email address that should receive the Firebase password reset link.":
    "Agrega el email que debe recibir el enlace de recuperacion de Firebase.",
  "The backoffice could not verify whether this email exists.":
    "El backoffice no pudo verificar si este email existe.",
  "Password reset check failed": "Fallo la verificacion de recuperacion",
  "Firebase could not send the password reset email. Confirm the email and try again.":
    "Firebase no pudo enviar el email de recuperacion. Confirma el email e intenta de nuevo.",
  "Password reset email was not sent": "No se envio el email de recuperacion",
  "Unable to validate this email right now.":
    "No se puede validar este email ahora.",
  "Access check could not run": "No se pudo verificar el acceso",
  "No account was created. Try again before choosing a password.":
    "No se creo ninguna cuenta. Intenta de nuevo antes de elegir un password.",
  "The new-user flow only creates accounts for emails already approved by the team.":
    "El flujo de nuevo usuario solo crea cuentas para emails ya aprobados por el equipo.",
  "After approval, return here and run this check again.":
    "Despues de la aprobacion, volve aca y ejecuta esta verificacion de nuevo.",
  "An account already exists for this email": "Ya existe una cuenta para este email",
  "Use the email sign-in form instead. This new-user flow only creates the first password for invited accounts.":
    "Usa el formulario de inicio con email. Este flujo solo crea el primer password para cuentas invitadas.",
  "This email can create a backoffice account. Choose a password to finish setup.":
    "Este email puede crear una cuenta de backoffice. Elegi un password para terminar.",
  "Access check failed": "Fallo la verificacion de acceso",
  "Unable to create the email account.": "No se pudo crear la cuenta con email.",
  "Account was not created": "La cuenta no fue creada",
  "Confirm the email is still approved and use a password with at least 6 characters.":
    "Confirma que el email siga aprobado y usa un password de al menos 6 caracteres.",
  "Account setup stopped": "La configuracion de cuenta se detuvo",
  "No dashboard access was changed. You can retry from the access check step.":
    "No se modifico ningun acceso al dashboard. Podes reintentar desde la verificacion.",
  "The account is valid, but the selected project session could not be saved.":
    "La cuenta es valida, pero no se pudo guardar la sesion del proyecto seleccionado.",
  "Project handoff failed": "Fallo el traspaso de proyecto",
  "Try selecting the project again.": "Intenta seleccionar el proyecto de nuevo.",
  "approved through an active role assignment":
    "aprobado mediante una asignacion de rol activa",
  "approved through the team allowlist":
    "aprobado mediante la allowlist del equipo",
};

const PATIENT_PORTAL_SPANISH_TEXT: Record<string, string> = {
  Password: "Contrasena",
  "Hide password": "Ocultar contrasena",
  "Show password": "Mostrar contrasena",
  "Forgot password?": "Olvidaste tu contrasena?",
};

function loginText(language: AppLanguage, text: string) {
  if (language === "en") return text;
  const directTranslation = LOGIN_SPANISH_TEXT[text];
  if (directTranslation) return directTranslation;

  let match = text.match(/^Firebase sent the reset email to (.+)\.$/);
  if (match) {
    return `Firebase envio el email de recuperacion a ${match[1]}.`;
  }
  match = text.match(/^No Firebase Auth account exists for (.+)\.$/);
  if (match) {
    return `No existe una cuenta de Firebase Auth para ${match[1]}.`;
  }
  match = text.match(/^(.+) exists, but it does not have an email\/password provider\.$/);
  if (match) {
    return `${match[1]} existe, pero no tiene proveedor email/password.`;
  }
  match = text.match(
    /^(.+) exists and has password sign-in, but Firebase rejected the reset email request\.$/
  );
  if (match) {
    return `${match[1]} existe y tiene inicio con password, pero Firebase rechazo el email de recuperacion.`;
  }

  return text;
}

function applyLoginLanguage(language: AppLanguage) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; path=/; max-age=31536000; samesite=lax`;
}

function readStoredLoginLanguage(initialLanguage: AppLanguage) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return initialLanguage;
  }
  try {
    return resolveAppLanguage(
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ??
        document.documentElement.dataset.language ??
        initialLanguage
    );
  } catch {
    return initialLanguage;
  }
}

function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

function patientPortalCallbackUrl() {
  if (typeof window === "undefined") return undefined;

  const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
  return normalizePatientPortalCallbackUrl(callbackUrl);
}

function passwordResetSuccessResult(email: string): PasswordResetResult {
  return {
    tone: "success",
    title: "Password reset email sent",
    message: `Firebase sent the reset email to ${email}.`,
    checks: [
      {
        label: "Firebase Auth account exists",
        passed: true,
        detail: "The legacy SDK found this exact email in Firebase Auth.",
      },
      {
        label: "Email/password provider exists",
        passed: true,
        detail: "This account is configured for password sign-in.",
      },
      {
        label: "Firebase reset email sent",
        passed: true,
        detail: "Firebase accepted the password reset email request.",
      },
    ],
  };
}

function passwordResetAccountMissingResult(email: string): PasswordResetResult {
  return {
    tone: "error",
    title: "Firebase Auth account not found",
    message: `No Firebase Auth account exists for ${email}.`,
    checks: [
      {
        label: "Firebase Auth account exists",
        passed: false,
        detail: "The legacy SDK did not find this email in Firebase Auth.",
      },
      {
        label: "Email/password provider exists",
        passed: false,
        detail: "Skipped because there is no matching Firebase Auth account.",
      },
      {
        label: "Firebase reset email sent",
        passed: false,
        detail: "Not attempted because there is no matching account.",
      },
    ],
  };
}

function passwordResetPasswordProviderMissingResult(email: string): PasswordResetResult {
  return {
    tone: "error",
    title: "Password sign-in is not enabled",
    message: `${email} exists, but it does not have an email/password provider.`,
    checks: [
      {
        label: "Firebase Auth account exists",
        passed: true,
        detail: "The legacy SDK found this exact email in Firebase Auth.",
      },
      {
        label: "Email/password provider exists",
        passed: false,
        detail: "Firebase Auth does not list the password provider for this account.",
      },
      {
        label: "Firebase reset email sent",
        passed: false,
        detail: "Not attempted because password reset only applies to password accounts.",
      },
    ],
  };
}

function passwordResetSendFailedResult(email: string): PasswordResetResult {
  return {
    tone: "error",
    title: "Firebase could not send the reset email",
    message: `${email} exists and has password sign-in, but Firebase rejected the reset email request.`,
    checks: [
      {
        label: "Firebase Auth account exists",
        passed: true,
        detail: "The legacy SDK found this exact email in Firebase Auth.",
      },
      {
        label: "Email/password provider exists",
        passed: true,
        detail: "This account is configured for password sign-in.",
      },
      {
        label: "Firebase reset email sent",
        passed: false,
        detail: "Firebase returned an error while sending the reset email.",
      },
    ],
  };
}

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

  const normalizedEmail = normalizeAuthEmail(attemptedEmail);
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

function emailNotice(
  error: unknown,
  context?: Record<string, unknown>
): AuthNotice {
  const code = getErrorCode(error);
  const log = authErrorLog({
    source: "firebase-web-sdk",
    event: "email-sign-in",
    message: "Email sign-in failed before the legacy SDK session could be created.",
    error,
    context,
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
        "Check the email and password for this backoffice account, then try again.",
      details: [
        "If you do not remember the password, contact an administrator to reset access.",
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

function sdkLoginNotice(
  status: number,
  message: string | undefined,
  log: AuthLog | undefined,
  surface: LoginSurface,
  responseData?: Record<string, unknown>,
): AuthNotice {
  if (status === 403) {
    const requiredSurface =
      responseData?.requiredSurface === "patient-portal" ||
      responseData?.requiredSurface === "backoffice"
        ? responseData.requiredSurface
        : undefined;
    if (responseData?.code === "WRONG_AUTH_SURFACE" && requiredSurface) {
      const needsPatientPortal = requiredSurface === "patient-portal";
      return {
        tone: "error",
        title: needsPatientPortal
          ? "Use the patient portal login"
          : "Use the backoffice login",
        message: needsPatientPortal
          ? "This account has patient portal access and cannot sign in through the backoffice login."
          : "This account has backoffice access and cannot sign in through the patient portal login.",
        action: {
          href: needsPatientPortal ? "/patient-portal/login" : "/login",
          label: needsPatientPortal
            ? "Open patient portal login"
            : "Open backoffice login",
        },
        log,
      };
    }

    const patientPortal = surface === "patient-portal";
    return {
      tone: "error",
      title: patientPortal
        ? "This account is not approved for patient portal access"
        : "This account is not approved for backoffice access",
      message: patientPortal
        ? "Authentication worked, but this patient has not been granted active patient portal access."
        : "Authentication worked, but the SDK did not find an active allowlist entry or admin role assignment for this email.",
      details: [
        patientPortal
          ? "Ask the care team to grant access from the patient detail screen."
          : "Ask a full admin to add the email to the team allowlist or assign an active admin role.",
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

type LoginTranslator = (text: string) => string;

function AuthLogDialog({
  log,
  open,
  onOpenChange,
  t,
}: {
  log: AuthLog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: LoginTranslator;
}) {
  const formattedLog = formatAuthLog(log);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/70 bg-white/92 text-slate-950 shadow-[0_30px_90px_rgba(47,28,70,0.28)] backdrop-blur-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Authentication error log")}</DialogTitle>
          <DialogDescription className="text-slate-600">
            {t(
              "Full client-side diagnostic captured for this failed sign-in attempt. Token, cookie, session, and password-like fields are redacted."
            )}
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
              {t("Close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordResetChecklist({
  checks,
  t,
}: {
  checks: PasswordResetCheck[];
  t: LoginTranslator;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-slate-900/10 bg-white/55 p-3">
      {checks.map((check) => (
        <div key={check.label} className="flex gap-3">
          {check.passed ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
          )}
          <div className="min-w-0">
            <p
              className={`text-sm font-semibold ${
                check.passed ? "text-emerald-800" : "text-red-800"
              }`}
            >
              {t(check.label)}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">{t(check.detail)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PasswordResetDialog({
  email,
  open,
  result,
  sending,
  onOpenChange,
  onConfirm,
  t,
}: {
  email: string;
  open: boolean;
  result: PasswordResetResult;
  sending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  t: LoginTranslator;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/70 bg-white/92 text-slate-950 shadow-[0_30px_90px_rgba(47,28,70,0.28)] backdrop-blur-2xl sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <div
                className={`mb-1 flex size-11 items-center justify-center rounded-full border ${
                  result.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {result.tone === "success" ? (
                  <CheckCircle2 className="size-5" />
                ) : (
                  <XCircle className="size-5" />
                )}
              </div>
              <DialogTitle>{t(result.title)}</DialogTitle>
              <DialogDescription className="text-slate-600">
                {t(result.message)}
              </DialogDescription>
            </DialogHeader>
            <PasswordResetChecklist checks={result.checks} t={t} />
            {result.tone === "success" ? (
              <p className="text-sm leading-6 text-slate-600">
                {t(
                  "Open that email and follow the link to choose a new password, then return here to sign in."
                )}
              </p>
            ) : null}
            <DialogFooter className="border-slate-900/10 bg-white/45">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant={result.tone === "success" ? "default" : "outline"}
                  className={`h-10 rounded-xl ${
                    result.tone === "success"
                      ? ""
                      : "border-slate-900/10 bg-white/70 text-slate-800 hover:bg-white hover:text-slate-950"
                  }`}
                  onClick={() => onOpenChange(false)}
                >
                  {t("Done")}
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("Reset password?")}</DialogTitle>
              <DialogDescription className="text-slate-600">
                {t("Firebase will send a password reset link to")}{" "}
                <span className="font-semibold text-slate-900">{email}</span>.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm leading-6 text-slate-600">
              {t(
                "Confirm the email address is correct before sending. The current sign-in attempt will stay on this screen."
              )}
            </p>
            <DialogFooter className="border-slate-900/10 bg-white/45">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={sending}
                  className="h-10 rounded-xl border-slate-900/10 bg-white/70 text-slate-800 hover:bg-white hover:text-slate-950"
                >
                  {t("Cancel")}
                </Button>
              </DialogClose>
              <Button
                type="button"
                disabled={sending}
                className="h-10 rounded-xl"
                onClick={onConfirm}
              >
                {sending ? <LoadingIcon /> : <Mail className="size-4" />}
                {sending ? t("Sending...") : t("Send reset email")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Notice({
  notice,
  onDismiss,
  t,
  compact = false,
}: {
  notice: AuthNotice;
  onDismiss: () => void;
  t: LoginTranslator;
  compact?: boolean;
}) {
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
            <p className="font-semibold">{t(notice.title)}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {notice.log && !compact ? (
                <button
                  type="button"
                  onClick={() => setLogsOpen(true)}
                  className="rounded-md px-1.5 text-xs font-medium text-slate-600 transition hover:bg-white/70 hover:text-slate-950"
                >
                  {t("View log")}
                </button>
              ) : null}
              {compact ? (
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label={t("Dismiss")}
                  title={t("Dismiss")}
                  className="flex size-7 items-center justify-center rounded-md text-slate-600 transition hover:bg-white/70 hover:text-slate-950"
                >
                  <XCircle className="size-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-md px-1.5 text-xs font-medium text-slate-600 transition hover:bg-white/70 hover:text-slate-950"
                >
                  {t("Dismiss")}
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-slate-700">{t(notice.message)}</p>
          {!compact && notice.details && notice.details.length > 0 ? (
            <ul className="mt-2 space-y-1 text-slate-600">
              {notice.details.map((detail) => (
                <li key={detail} className="flex gap-2">
                  <span aria-hidden className="mt-[0.55rem] size-1 rounded-full bg-current/70" />
                  <span>{t(detail)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {notice.action ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 border-slate-900/10 bg-white/70 text-slate-900 hover:bg-white"
              asChild
            >
              <Link href={notice.action.href}>{t(notice.action.label)}</Link>
            </Button>
          ) : null}
        </div>
      </div>
      {notice.log && !compact ? (
        <AuthLogDialog
          log={notice.log}
          open={logsOpen}
          onOpenChange={setLogsOpen}
          t={t}
        />
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
  helper?: string;
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
      {helper ? (
        <p id={`${id}-helper`} className="text-xs leading-5 text-slate-600">
          {helper}
        </p>
      ) : null}
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
  showLabel,
  hideLabel,
}: {
  id: string;
  autoComplete: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  describedBy?: string;
  minLength?: number;
  visible: boolean;
  onToggleVisibility: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  const label = visible ? hideLabel : showLabel;

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

function VersionPill({ surface }: { surface: LoginSurface }) {
  if (surface === "patient-portal") {
    return <span className="text-xs text-slate-400">v{BACKOFFICE_VERSION}</span>;
  }

  return (
    <span className="inline-flex w-fit rounded-full border border-slate-900/10 bg-white/55 px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
      Backoffice v{BACKOFFICE_VERSION}
    </span>
  );
}

function LoadingIcon() {
  return <Loader2 className="size-4 animate-spin" />;
}

function LoginLanguageControl({
  language,
  onChange,
  t,
}: {
  language: AppLanguage;
  onChange: (language: AppLanguage) => void;
  t: LoginTranslator;
}) {
  return (
    <div
      role="group"
      aria-label={t("Login language")}
      className="inline-flex rounded-full border border-slate-900/10 bg-white/55 p-0.5 shadow-inner shadow-white/30"
    >
      {LOGIN_LANGUAGE_OPTIONS.map((option) => {
        const active = option === language;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`h-7 min-w-9 rounded-full px-2 text-xs font-semibold transition ${
              active
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
            }`}
          >
            {option.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
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

export function LoginExperience({
  surface,
  initialEmail,
}: {
  surface: LoginSurface;
  initialEmail?: string;
}) {
  const isPatientPortal = surface === "patient-portal";
  const normalizedInitialEmail = isPatientPortal
    ? normalizeAuthEmail(initialEmail ?? "")
    : "";
  const [loginLanguage, setLoginLanguage] = useState<AppLanguage>(
    isPatientPortal ? "es" : "en"
  );
  const [loading, setLoading] = useState<LoadingState>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [email, setEmail] = useState(normalizedInitialEmail);
  const [password, setPassword] = useState("");
  const [emailPasswordReady, setEmailPasswordReady] = useState(
    Boolean(normalizedInitialEmail)
  );
  const [showPassword, setShowPassword] = useState(false);
  const [passwordResetEmail, setPasswordResetEmail] = useState("");
  const [passwordResetDialogOpen, setPasswordResetDialogOpen] = useState(false);
  const [passwordResetResult, setPasswordResetResult] =
    useState<PasswordResetResult>(null);
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

  useEffect(() => {
    if (isPatientPortal) {
      setLoginLanguage("es");
      document.documentElement.lang = "es";
      document.documentElement.dataset.language = "es";
      return;
    }

    const storedLanguage = readStoredLoginLanguage("en");
    setLoginLanguage(storedLanguage);
    applyLoginLanguage(storedLanguage);
  }, [isPatientPortal]);

  function handleLoginLanguageChange(nextLanguage: AppLanguage) {
    setLoginLanguage(nextLanguage);
    applyLoginLanguage(nextLanguage);
  }

  const t = (text: string) =>
    isPatientPortal && loginLanguage === "es"
      ? (PATIENT_PORTAL_SPANISH_TEXT[text] ?? loginText(loginLanguage, text))
      : loginText(loginLanguage, text);

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
      body: JSON.stringify({ idToken: options.idToken, surface }),
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
          }),
          surface,
          data,
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
      ? isPatientPortal
        ? "/patient-portal/complete-profile"
        : "/complete-profile"
      : isPatientPortal
        ? (patientPortalCallbackUrl() ?? PATIENT_PORTAL_ENTRY_ROUTE)
        : "/2pq-dashboard";

    if (redirectTo.endsWith("/complete-profile")) {
      const fallbackProject = projectAccess.includes("mydnamap")
        ? "mydnamap"
        : (projectAccess[0] ?? "mydnamap");
      await finalizeLogin(options, fallbackProject, redirectTo);
      return;
    }

    if (isPatientPortal) {
      const patientProject = projectAccess.includes("mydnamap")
        ? "mydnamap"
        : (projectAccess[0] ?? "mydnamap");
      await finalizeLogin(options, patientProject, redirectTo);
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
      accessSurface: surface,
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

  async function handleEmailContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const loginEmail = normalizeAuthEmail(email);
    if (!loginEmail) return;

    setLoading("email-check");
    setNotice(null);
    setEmail(loginEmail);
    setPassword("");
    setShowPassword(false);
    setEmailPasswordReady(false);
    setSignupEligibility(null);

    try {
      const response = await fetch("/api/sdk/auth/email-signup/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, surface }),
      });
      const data = (await readJson(response)) as Partial<SignupEligibility> & {
        error?: string;
      };
      const checkedEmail = data.email || loginEmail;

      if (!response.ok) {
        const message = serverMessage(
          data,
          "The backoffice could not check this email right now."
        );
        setNotice({
          tone: "error",
          title: "Email check could not run",
          message,
          details: ["Try again before entering a password."],
          log: authResponseLog({
            source: "legacy-sdk",
            event: "email-continue-check",
            message,
            method: "POST",
            path: "/api/sdk/auth/email-signup/eligibility",
            response,
            body: data,
            context: { email: loginEmail },
          }),
        });
        return;
      }

      if (!data.eligible) {
        if (data.requiredSurface && data.requiredSurface !== surface) {
          const needsPatientPortal = data.requiredSurface === "patient-portal";
          const message = needsPatientPortal
            ? "This account has patient portal access and must use the patient portal login."
            : "This account has backoffice access and must use the backoffice login.";
          setNotice({
            tone: "error",
            title: needsPatientPortal
              ? "Use the patient portal login"
              : "Use the backoffice login",
            message,
            action: {
              href: needsPatientPortal ? "/patient-portal/login" : "/login",
              label: needsPatientPortal
                ? "Open patient portal login"
                : "Open backoffice login",
            },
          });
          return;
        }

        const message = data.accountExists
          ? "This account exists, but it is not approved for backoffice access."
          : "No backoffice account or approved invitation was found for this email.";
        setNotice({
          tone: "error",
          title: data.accountExists
            ? "This account is not approved for backoffice access"
            : "This email is not approved yet",
          message,
          details: [
            "Ask a full admin to add the email to the allowlist or assign an active admin role first.",
          ],
          log: authEventLog({
            source: "legacy-sdk",
            event: "email-continue-access-denied",
            message,
            context: { email: checkedEmail, eligibility: data },
          }),
        });
        return;
      }

      if (!data.accountExists) {
        setSignupEmail(checkedEmail);
        setSignupEligibility({
          ...data,
          email: checkedEmail,
          accountExists: false,
        } as SignupEligibility);
        setSignupPassword("");
        setShowSignupPassword(false);
        setPhase("signup-password");
        if (!isPatientPortal) {
          setNotice({
            tone: "success",
            title: "Access approved",
            message:
              "This invited email can create a backoffice account. Choose a password to finish setup.",
          });
        }
        return;
      }

      if (data.accountHasPassword) {
        setEmail(checkedEmail);
        setEmailPasswordReady(true);
        setPassword("");
        setShowPassword(false);
        return;
      }

      const signInProviders = Array.isArray(data.signInProviders)
        ? data.signInProviders.filter(
            (provider): provider is string => typeof provider === "string"
          )
        : [];
      const hasGoogle =
        data.accountHasGoogle === true ||
        signInProviders.includes(GOOGLE_SIGN_IN_METHOD);
      const message = hasGoogle
        ? "A user was found with that email, but it has no password registered."
        : "A user was found with that email, but password sign-in is not enabled.";

      setNotice({
        tone: "error",
        title: hasGoogle
          ? "This account uses Google sign-in"
          : "Password sign-in is not enabled",
        message,
        details: hasGoogle
          ? [
              "Use Continue with Google to sign in with that user.",
              "Password login will keep failing until a password provider is added to the Firebase account.",
            ]
          : ["Ask an admin to confirm the account sign-in provider."],
        log: authEventLog({
          source: "legacy-sdk",
          event: "email-continue-password-provider-missing",
          message,
          context: { email: checkedEmail, signInProviders, eligibility: data },
        }),
      });
    } catch (err) {
      if (isAuthNotice(err)) {
        setNotice(err);
      } else {
        console.error("Email continue error:", err);
        const message =
          err instanceof Error
            ? err.message
            : "The backoffice could not check this email right now.";
        setNotice({
          tone: "error",
          title: "Email check failed",
          message,
          log: authErrorLog({
            source: "legacy-sdk",
            event: "email-continue-check",
            message,
            error: err,
            context: { email: loginEmail },
          }),
        });
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const loginEmail = normalizeAuthEmail(email);
    setLoading("email");
    setNotice(null);
    setEmail(loginEmail);

    try {
      const result = await signInWithEmailAndPassword(auth, loginEmail, password);
      await handleAuthSuccess({
        idToken: await result.user.getIdToken(),
        name: result.user.displayName ?? "",
        email: result.user.email ?? loginEmail,
        image: result.user.photoURL ?? "",
      });
    } catch (err) {
      if (isAuthNotice(err)) {
        setNotice(err);
      } else {
        console.error("Email login error:", err);
        const logContext = {
          email: loginEmail,
          emailWasNormalized: email !== loginEmail,
          firebaseProjectId: auth.app.options.projectId,
          firebaseAuthDomain: auth.app.options.authDomain,
        };
        setNotice(
          (await googleOnlyPasswordNotice(err, loginEmail)) ??
            emailNotice(err, logContext)
        );
      }
    } finally {
      setLoading(null);
    }
  }

  function handleChangeEmail() {
    setEmailPasswordReady(false);
    setPassword("");
    setShowPassword(false);
    setNotice(null);
  }

  function handlePasswordResetRequest() {
    const resetEmail = normalizeAuthEmail(email);
    if (!resetEmail) {
      setNotice({
        tone: "info",
        title: "Enter the account email first",
        message:
          "Add the email address that should receive the Firebase password reset link.",
      });
      return;
    }

    setEmail(resetEmail);
    setPasswordResetEmail(resetEmail);
    setPasswordResetResult(null);
    setNotice(null);
    setPasswordResetDialogOpen(true);
  }

  function handlePasswordResetDialogOpenChange(open: boolean) {
    if (loading === "password-reset") return;
    setPasswordResetDialogOpen(open);
    if (!open) {
      setPasswordResetResult(null);
    }
  }

  async function handleSendPasswordResetEmail() {
    const resetEmail = normalizeAuthEmail(passwordResetEmail);
    if (!resetEmail) return;

    setLoading("password-reset");
    setNotice(null);

    try {
      const response = await fetch("/api/sdk/auth/email-signup/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, surface }),
      });
      const data = (await readJson(response)) as Partial<SignupEligibility>;

      if (!response.ok) {
        const message = serverMessage(
          data,
          "The backoffice could not verify whether this email exists."
        );
        setPasswordResetDialogOpen(false);
        setNotice({
          tone: "error",
          title: "Password reset check failed",
          message,
          log: authResponseLog({
            source: "legacy-sdk",
            event: "password-reset-email-lookup",
            message,
            method: "POST",
            path: "/api/sdk/auth/email-signup/eligibility",
            response,
            body: data,
            context: { email: resetEmail },
          }),
        });
        return;
      }

      if (data.accountExists !== true) {
        setPasswordResetResult(passwordResetAccountMissingResult(resetEmail));
        return;
      }

      if (data.accountHasPassword !== true) {
        setPasswordResetResult(
          passwordResetPasswordProviderMissingResult(resetEmail)
        );
        return;
      }

      try {
        await sendPasswordResetEmail(auth, resetEmail);
        setPasswordResetResult(passwordResetSuccessResult(resetEmail));
      } catch (sendError) {
        console.error("Password reset email send error:", sendError);
        setPasswordResetResult(passwordResetSendFailedResult(resetEmail));
      }
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
        body: JSON.stringify({ email: signupEmail, surface }),
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
        if (data.requiredSurface && data.requiredSurface !== surface) {
          const needsPatientPortal = data.requiredSurface === "patient-portal";
          setNotice({
            tone: "error",
            title: needsPatientPortal
              ? "Use the patient portal login"
              : "Use the backoffice login",
            message: needsPatientPortal
              ? "This account has patient portal access and must use the patient portal login."
              : "This account has backoffice access and must use the backoffice login.",
            action: {
              href: needsPatientPortal ? "/patient-portal/login" : "/login",
              label: needsPatientPortal
                ? "Open patient portal login"
                : "Open backoffice login",
            },
          });
          return;
        }

        const message =
          isPatientPortal
            ? "The new-user flow only creates accounts for patients whose portal access was already approved."
            : "The new-user flow only creates accounts for emails already approved by the team.";
        setNotice({
          tone: "error",
          title: "This email is not approved yet",
          message,
          details: [
            isPatientPortal
              ? "Ask the care team to grant patient portal access from the patient detail screen first."
              : "Ask a full admin to add the email to the allowlist or assign an active admin role first.",
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
      if (!isPatientPortal) {
        setNotice({
          tone: "success",
          title: "Access approved",
          message:
            "This email can create a backoffice account. Choose a password to finish setup.",
        });
      }
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
          surface,
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
    setEmailPasswordReady(false);
    setPassword("");
    setShowPassword(false);
    setSignupEligibility(null);
    setSignupPassword("");
    setShowSignupPassword(false);
  }

  function beginEmailSignup() {
    setEmailPasswordReady(false);
    setPassword("");
    setShowPassword(false);
    setSignupEmail(email);
    setNotice(null);
    setShowSignupPassword(false);
    setPhase("signup-email");
  }

  const canContinueWithEmail = normalizeAuthEmail(email).length > 0;

  const signupAccessLabel = signupEligibility?.viaRoleAssignment
    ? signupEligibility.role
      ? loginLanguage === "es"
        ? `aprobado mediante la asignacion de rol ${t(ROLE_LABELS[signupEligibility.role])}`
        : `approved through the ${ROLE_LABELS[signupEligibility.role]} role assignment`
      : t("approved through an active role assignment")
    : t("approved through the team allowlist");

  const signupAccessSentence =
    signupEligibility && loginLanguage === "es"
      ? `${signupEligibility.email} fue ${signupAccessLabel}. Define un password y la cuenta se creara de inmediato.`
      : signupEligibility
        ? `${signupEligibility.email} was ${signupAccessLabel}. Set a password and the account will be created immediately.`
        : "";

  const panelTitle = isPatientPortal
    ? phase === "auth" || phase === "select"
      ? t("Patient portal")
      : t("Create account")
    : phase === "select"
      ? t("Choose your workspace")
      : phase === "signup-email"
        ? t("Create an email account")
        : phase === "signup-password"
          ? t("Finish new-user setup")
          : t("Welcome back");

  const panelDescription =
    phase === "select"
      ? t("Your account can manage more than one legacy product. Pick where to continue.")
      : phase === "signup-email"
        ? t("This path is for invited new users who do not have an email password yet.")
        : phase === "signup-password"
          ? t("Access is approved. Set the first password for this account.")
          : t("Sign in to the Golden Crow legacy backoffice for PocketGenes and Pocket Gyms.");
  const patientPortalSecurityKeyStep =
    isPatientPortal && phase === "auth" && emailPasswordReady;

  return (
    <main
      className={
        isPatientPortal
          ? "fixed inset-0 min-h-screen w-full overflow-x-hidden overflow-y-auto bg-white text-slate-950"
          : "auth-liquid-canvas fixed inset-0 isolate min-h-screen w-full overflow-x-hidden overflow-y-auto text-slate-950"
      }
    >
      {!isPatientPortal ? <div className="auth-liquid-flow" aria-hidden /> : null}
      {!isPatientPortal ? <div className="auth-liquid-sheen" aria-hidden /> : null}

      <div
        className={
          isPatientPortal
            ? "relative flex min-h-screen w-full items-center justify-center px-5 py-10"
            : "auth-login-scroll-shell relative z-10 flex w-full items-center justify-center px-4 sm:px-6 lg:px-8"
        }
      >
        <section
          className={
            patientPortalSecurityKeyStep
              ? "relative mx-auto w-full max-w-md"
              : isPatientPortal
                ? "relative mx-auto w-full max-w-sm"
                : "auth-login-stage relative mx-auto grid w-full max-w-[1240px] gap-5 rounded-[2rem] p-4 sm:p-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.78fr)] lg:p-6"
          }
        >
          {!isPatientPortal ? (
          <aside className="auth-brand-panel flex min-h-[520px] flex-col gap-6 rounded-[1.65rem] p-5 sm:p-7 lg:min-h-[610px] lg:p-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/60 bg-white/40 px-4 py-2 text-sm font-semibold text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)]">
              <CheckCircle2 className="size-4 text-amber-500" />
              {t("Golden Crow operations")}
            </div>

            <div className="max-w-[680px] space-y-5">
              <h1 className="font-heading text-4xl font-semibold leading-[1.08] text-slate-950">
                {t("Run Golden Crow operations from one focused workspace.")}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-700">
                {t(
                  "Manage users, roles, reports, files, 2PQ forms, institutions, doctors, and patients with the right product context always in view."
                )}
              </p>
            </div>

            <div className="auth-path-card rounded-2xl p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xl font-semibold text-slate-950">
                  {t("New invited user?")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full justify-center rounded-xl border-slate-900/10 bg-white/60 text-slate-800 hover:bg-white/85 hover:text-slate-950 sm:w-auto"
                  disabled={loading !== null}
                  onClick={beginEmailSignup}
                >
                  <UserPlus className="size-4" />
                  {t("Create email account")}
                </Button>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-5 text-slate-700">
                {t(
                  "Create email account is not open registration. It confirms approval first, then creates the first email/password account for that invited user."
                )}
              </p>
            </div>
          </aside>
          ) : null}

          <section
            className={
              isPatientPortal
                ? "relative flex w-full flex-col gap-6"
                : "auth-login-panel relative flex w-full flex-col gap-6 rounded-[1.6rem] p-5 sm:p-6 lg:p-7"
            }
          >
          <div className="flex items-start justify-between gap-4">
            <div className={isPatientPortal ? "min-w-0" : "min-w-0 space-y-2"}>
              {isPatientPortal ? (
                <h1 className="font-heading text-3xl font-semibold tracking-normal text-slate-950">
                  {panelTitle}
                </h1>
              ) : (
                <>
                  <p className="section-eyebrow text-slate-500">{t("Secure backoffice")}</p>
                  <h2 className="font-heading text-3xl font-semibold tracking-normal text-slate-950">
                    {panelTitle}
                  </h2>
                  <p className="text-sm leading-6 text-slate-600">{panelDescription}</p>
                </>
              )}
            </div>
            {!isPatientPortal ? (
              <div className="flex shrink-0 flex-col items-end gap-2">
                <VersionPill surface={surface} />
                <LoginLanguageControl
                  language={loginLanguage}
                  onChange={handleLoginLanguageChange}
                  t={t}
                />
              </div>
            ) : null}
          </div>

          {notice ? (
            <Notice
              notice={notice}
              onDismiss={() => setNotice(null)}
              t={t}
              compact={isPatientPortal}
            />
          ) : null}

          {phase === "select" && pendingAuth ? (
            <div className="space-y-4">
              <ProjectOption
                project="mydnamap"
                title="PocketGenes"
                body={t("Genomics reports, learning content, community moderation, and account records.")}
                icon={<Dna className="size-5 text-rose-600" />}
                disabled={loading !== null}
                onSelect={handleProjectSelect}
              />
              <ProjectOption
                project="pocket-gyms"
                title="Pocket Gyms"
                body={t("Members, training plans, booking surfaces, clinical notes, and achievements.")}
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
                {t("Use a different account")}
              </Button>
            </div>
          ) : null}

          {phase === "auth" ? (
            <div
              className={
                patientPortalSecurityKeyStep
                  ? "mx-auto w-full max-w-md space-y-6 text-center"
                  : "space-y-5"
              }
            >
                {!patientPortalSecurityKeyStep ? (
                  <>
                    <Button
                      onClick={handleGoogleSignIn}
                      disabled={loading !== null}
                      className="h-11 w-full justify-center rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                    >
                      {loading === "google" ? (
                        <LoadingIcon />
                      ) : (
                        <LogIn className="size-4" />
                      )}
                      {loading === "google"
                        ? t("Opening Google...")
                        : t("Continue with Google")}
                    </Button>

                    <div className="flex items-center gap-3 text-xs font-medium uppercase text-slate-400">
                      <span className="h-px flex-1 bg-slate-900/10" />
                      {t("or use email")}
                      <span className="h-px flex-1 bg-slate-900/10" />
                    </div>
                  </>
                ) : null}

                <form
                  className={patientPortalSecurityKeyStep ? "space-y-6" : "space-y-4"}
                  onSubmit={emailPasswordReady ? handleEmailSignIn : handleEmailContinue}
                >
                  {patientPortalSecurityKeyStep ? (
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-6 shadow-sm">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {t("Email")}
                        </p>
                        <p className="break-all text-lg font-semibold text-slate-950">
                          {email}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={loading !== null}
                          onClick={handleChangeEmail}
                          className="mx-auto h-8 rounded-lg px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                        >
                          {t("Change email")}
                        </Button>
                      </div>

                      <div className="mt-6 space-y-3">
                        <Label
                          htmlFor="login-password"
                          className="block text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
                        >
                          {t("Security key")}
                        </Label>
                        <Input
                          id="login-password"
                          type="text"
                          autoComplete="one-time-code"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder={t("Security key")}
                          aria-describedby="patient-security-key-notice"
                          required
                          className="h-16 rounded-2xl border-slate-300 bg-white px-4 text-center text-2xl font-bold tracking-[0.08em] text-slate-950 shadow-inner shadow-white placeholder:text-base placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate-400"
                        />
                      </div>

                      <div
                        id="patient-security-key-notice"
                        role="note"
                        className="mt-4 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-left text-xs leading-5 text-blue-950"
                      >
                        <Mail className="mt-0.5 size-4 shrink-0 text-blue-600" />
                        <p>
                          <span className="font-semibold">
                            {t("Your security key was sent to you by email.")}
                          </span>{" "}
                          {t(
                            "If you did not receive it, ask your doctor to send it again."
                          )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <FieldShell
                        id="login-email"
                        label={t("Email")}
                        helper={
                          isPatientPortal
                            ? undefined
                            : emailPasswordReady
                              ? t(
                                  "Email checked. Use Change email to choose a different account."
                                )
                              : t("Use the email that has backoffice access.")
                        }
                        icon={<Mail className="size-4" />}
                      >
                        <Input
                          id="login-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => {
                            setEmail(event.target.value);
                            setEmailPasswordReady(false);
                            setPassword("");
                            setShowPassword(false);
                            setNotice(null);
                          }}
                          placeholder={
                            isPatientPortal
                              ? "name@example.com"
                              : "team@pocketgenes.app"
                          }
                          aria-describedby={
                            isPatientPortal ? undefined : "login-email-helper"
                          }
                          readOnly={emailPasswordReady}
                          required
                          className="h-11 rounded-xl border-slate-900/10 bg-white/78 px-4 text-slate-950 shadow-inner shadow-white/30 placeholder:text-slate-400"
                        />
                      </FieldShell>

                      {emailPasswordReady ? (
                        <div className="-mt-2 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={loading !== null}
                            onClick={handleChangeEmail}
                            className="h-7 rounded-lg px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                          >
                            {t("Change email")}
                          </Button>
                        </div>
                      ) : null}

                      {emailPasswordReady ? (
                        <>
                          <FieldShell
                            id="login-password"
                            label={t("Password")}
                            helper={
                              isPatientPortal
                                ? undefined
                                : t(
                                    "Enter the password for this approved email account."
                                  )
                            }
                            icon={<LockKeyhole className="size-4" />}
                          >
                            <PasswordInput
                              id="login-password"
                              autoComplete="current-password"
                              value={password}
                              onChange={(event) => setPassword(event.target.value)}
                              placeholder={t("Password")}
                              describedBy={
                                isPatientPortal
                                  ? "patient-temporary-password-notice"
                                  : "login-password-helper"
                              }
                              visible={showPassword}
                              onToggleVisibility={() =>
                                setShowPassword((current) => !current)
                              }
                              showLabel={t("Show password")}
                              hideLabel={t("Hide password")}
                            />
                          </FieldShell>
                          {isPatientPortal ? (
                            <div
                              id="patient-temporary-password-notice"
                              role="note"
                              className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-950"
                            >
                              <Mail className="mt-0.5 size-4 shrink-0 text-blue-600" />
                              <p>
                                <span className="font-semibold">
                                  {t("Your security key was sent to you by email.")}
                                </span>{" "}
                                {t(
                                  "If you did not receive it, ask your doctor to send it again."
                                )}
                              </p>
                            </div>
                          ) : null}
                        </>
                      ) : null}

                      {emailPasswordReady ? (
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
                            {t("Forgot password?")}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}

                  {emailPasswordReady ? (
                    <Button
                      type="submit"
                      disabled={loading !== null || password.length === 0}
                      className={
                        patientPortalSecurityKeyStep
                          ? "h-12 w-full justify-center rounded-2xl bg-slate-950 text-base font-semibold text-white hover:bg-slate-800"
                          : "h-11 w-full justify-center rounded-xl"
                      }
                    >
                      {loading === "email" ? (
                        <LoadingIcon />
                      ) : (
                        <KeyRound className="size-4" />
                      )}
                      {loading === "email"
                        ? t("Checking credentials...")
                        : patientPortalSecurityKeyStep
                          ? t("Access portal")
                          : t("Sign in with email")}
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={loading !== null || !canContinueWithEmail}
                      className="h-11 w-full justify-center rounded-xl"
                    >
                      {loading === "email-check" ? (
                        <LoadingIcon />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                      {loading === "email-check" ? t("Checking email...") : t("Continue")}
                    </Button>
                  )}
                </form>
            </div>
          ) : null}

          {phase === "signup-email" ? (
            <div className="space-y-5">
              {!isPatientPortal ? (
                <div className="auth-login-glass rounded-2xl p-4 text-sm leading-6 text-slate-700">
                  {t(
                    "This is a new-user setup flow, not open registration. We check the email against the backend allowlist and active role assignments before creating anything."
                  )}
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={handleSignupEligibility}>
                <FieldShell
                  id="signup-email"
                  label={t("Invited email")}
                  helper={
                    isPatientPortal
                      ? undefined
                      : t("Enter the exact email a full admin approved for backoffice access.")
                  }
                  icon={<Mail className="size-4" />}
                >
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    value={signupEmail}
                    onChange={(event) => setSignupEmail(event.target.value)}
                    placeholder={isPatientPortal ? "name@example.com" : "admin@institution.com"}
                    aria-describedby={isPatientPortal ? undefined : "signup-email-helper"}
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
                    {t("Back")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading !== null}
                    className="h-11 justify-center rounded-xl"
                  >
                    {loading === "signup-email" ? <LoadingIcon /> : <ChevronRight className="size-4" />}
                    {loading === "signup-email"
                      ? t("Checking access...")
                      : isPatientPortal
                        ? t("Continue")
                        : t("Check access first")}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          {phase === "signup-password" && signupEligibility ? (
            <div className="space-y-5">
              {!isPatientPortal ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/82 p-4 text-sm text-emerald-950 shadow-[0_18px_44px_rgba(18,105,75,0.12)]">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                    <div>
                      <p className="font-semibold">{t("Access approved")}</p>
                      <p className="mt-1 leading-6 text-emerald-800">
                        {signupAccessSentence}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={handleEmailAccountCreation}>
                <FieldShell
                  id="signup-password"
                  label={t("New password")}
                  helper={
                    isPatientPortal
                      ? undefined
                      : t("Use at least 6 characters. You will be signed in after the account is created.")
                  }
                  icon={<KeyRound className="size-4" />}
                >
                  <PasswordInput
                    id="signup-password"
                    autoComplete="new-password"
                    value={signupPassword}
                    onChange={(event) => setSignupPassword(event.target.value)}
                    placeholder={t("Choose a password")}
                    minLength={6}
                    describedBy={isPatientPortal ? undefined : "signup-password-helper"}
                    visible={showSignupPassword}
                    onToggleVisibility={() =>
                      setShowSignupPassword((current) => !current)
                    }
                    showLabel={t("Show password")}
                    hideLabel={t("Hide password")}
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
                    {t("Back")}
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
                    {loading === "signup-password" ? t("Creating account...") : t("Create account")}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}
          {isPatientPortal ? (
            <div className="pt-2 text-center">
              <VersionPill surface={surface} />
            </div>
          ) : null}
          </section>
        </section>
      </div>
      <PasswordResetDialog
        email={passwordResetEmail}
        open={passwordResetDialogOpen}
        result={passwordResetResult}
        sending={loading === "password-reset"}
        onOpenChange={handlePasswordResetDialogOpenChange}
        onConfirm={handleSendPasswordResetEmail}
        t={t}
      />
    </main>
  );
}
