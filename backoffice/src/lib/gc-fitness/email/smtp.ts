// smtp.ts — issue #970. The ONLY place this codebase talks to a mail server.
//
// ── Why SMTP and not "a Firebase thing" ─────────────────────────────────────
// Firebase has no transactional-email API. The only mail Firebase sends on its
// own is Auth's own (verification / password reset / sign-in link): console
// templates, auth-flow semantics, and enabling one would add an auth provider
// we deliberately do not have. The `firestore-send-email` extension is not an
// exception either — it asks for SMTP credentials exactly like this file does.
// So SMTP it is, and the cheapest SMTP that adds no vendor is the Google
// account we already own, with an App Password.
//
// ── Why the config is generic ───────────────────────────────────────────────
// Nothing here knows it is Gmail. Host / port / user / password come from env,
// so moving to Resend, SES or a Workspace domain later is four environment
// variables and zero code — the decision stays reversible.
//
// ── Disabled is a first-class state, not an error ───────────────────────────
// With no credentials configured this returns `{ ok: false, reason: "disabled" }`
// and sends nothing. That is what keeps local dev, CI and Vercel previews from
// emailing real clients — a preview deploy that mailed a coach's roster would
// be a genuine incident. It also means shipping the code and configuring the
// mailbox are independent steps.
//
// Nothing in this file throws. A mail failure must never turn a completed
// client-add into an error for the coach (see client-invite.ts).

import "server-only";

export type SendMailResult =
  | { ok: true }
  /** No credentials configured — nothing was attempted. */
  | { ok: false; reason: "disabled" }
  /** The transport rejected it. `detail` is for logs, never for the browser. */
  | { ok: false; reason: "failed"; detail: string };

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Replies go to the coach, not into a mailbox nobody reads. */
  replyTo?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/**
 * Google DISPLAYS an App Password as four space-separated groups of four
 * ("abcd efgh ijkl mnop"), but the credential is the 16 characters. Pasted as
 * shown, the spaces travel as part of the password and Gmail answers
 * `535 Username and Password not accepted` — an error that reads like a wrong
 * password, so the natural next move is to regenerate it and paste it wrong
 * again.
 *
 * The pattern is deliberately narrow: ONLY the exact Google display shape is
 * de-spaced. A legitimate SMTP password that happens to contain a space is
 * left alone — silently mangling a correct credential would be a worse bug
 * than the one this fixes.
 */
export function normalizeSmtpPassword(raw: string): string {
  const trimmed = raw.trim();
  return /^[A-Za-z0-9]{4}(?: [A-Za-z0-9]{4}){3}$/.test(trimmed)
    ? trimmed.replace(/ /g, "")
    : trimmed;
}

function readConfig(): SmtpConfig | null {
  const host = process.env.GC_FITNESS_SMTP_HOST?.trim();
  const user = process.env.GC_FITNESS_SMTP_USER?.trim();
  const rawPassword = process.env.GC_FITNESS_SMTP_PASSWORD;
  const password = rawPassword ? normalizeSmtpPassword(rawPassword) : undefined;
  if (!host || !user || !password) return null;
  const port = Number.parseInt(process.env.GC_FITNESS_SMTP_PORT ?? "465", 10);
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 465,
    user,
    password,
    // Gmail rewrites From to the authenticated mailbox anyway, so a mismatched
    // GC_FITNESS_MAIL_FROM is silently ignored rather than being a failure.
    from: process.env.GC_FITNESS_MAIL_FROM?.trim() || `GC Fitness <${user}>`,
  };
}

/** Whether a send would be attempted. Used by the UI to explain a `skipped`. */
export function isEmailConfigured(): boolean {
  return readConfig() !== null;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const config = readConfig();
  if (!config) return { ok: false, reason: "disabled" };

  try {
    // Imported lazily so the disabled path costs nothing and the transport
    // never lands in a bundle that does not send mail.
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS. Deriving it from the
      // port rather than exposing a fifth env var removes a way to get a
      // silently plaintext connection.
      secure: config.port === 465,
      auth: { user: config.user, pass: config.password },
    });
    await transport.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
