// invite-email.ts — issue #970.
//
// PURE copy builder for the two client emails. No I/O, no "use server", no
// Admin SDK: it takes names + a locale and returns `{ subject, text, html }`.
//
// It is pure for the reason CLAUDE.md spells out: a `"use server"` file may
// only export ASYNC functions (jest does not enforce the directive, so a
// synchronous export passes the whole suite and blows up in `next build` with
// "Server Actions must be async functions" — and `main` auto-deploys). Every
// synchronous helper the actions need lives here instead.
//
// ── The one instruction that carries the whole feature ──────────────────────
// The person MUST sign in with the SAME address the coach typed. The link
// between them is made server-side by `onBeforeUserCreated`, matching the
// NORMALIZED email against `/user_mirror/{email}`. Sign in with a different
// Google account and the account is created coach-less: the coach sees nothing,
// the client sees nothing, and neither of them can tell why. So the address is
// stated in the body, verbatim, in both copies.
//
// ── Why the link is not an App Store URL ────────────────────────────────────
// `https://goldencrowvs.com/gc-fitness/start` is a turnstile that sniffs the OS
// and hands off to the right store. #782 measured that on iOS EVERY
// `apps.apple.com` URL answers `301 → itms-appss://`, which embedded web views
// (the Meta family, and plenty of mail clients) refuse to hand to the OS — the
// tap does nothing at all. `/start` has the "open in Safari" fallback; a raw
// store URL has none.

/** The public download turnstile — see the file header. */
export const GC_FITNESS_DOWNLOAD_URL = "https://goldencrowvs.com/gc-fitness/start";

export type InviteEmailLocale = "es" | "en";

/**
 * Which of the two emails this is.
 *
 * `download` — the person has no account yet (the `precreated-mirror` branch of
 *   `provisionClient`). This is the invitation: its whole job is the app.
 * `linked`   — the person already had an account and was just attached to this
 *   coach (`attached-existing-user`). They already have the app, so telling
 *   them to download it would be noise; the news is the coach.
 */
export type InviteEmailKind = "download" | "linked";

export interface InviteEmailInput {
  kind: InviteEmailKind;
  /** The address the coach typed — repeated in the body on purpose. */
  clientEmail: string;
  /** Falls back to the address when the coach left the name blank. */
  clientName?: string | null;
  coachName: string;
  locale: InviteEmailLocale;
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

const BRAND = "#D9A441";

/**
 * Escapes the five characters that can break out of HTML text/attribute
 * context. Display names are coach-supplied free text: without this, a name
 * containing `<` silently mangles the email, and one containing a tag would
 * inject markup into a message we send under our own domain.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Copy {
  subject: string;
  preheader: string;
  heading: string;
  intro: string;
  /** The sign-in-with-this-address instruction. `{email}` is substituted. */
  emailNote: string;
  cta: string;
  outro: string;
  signoff: string;
}

function copyFor({ kind, locale, coachName, clientName }: {
  kind: InviteEmailKind;
  locale: InviteEmailLocale;
  coachName: string;
  clientName: string;
}): Copy {
  if (locale === "es") {
    return kind === "download"
      ? {
          subject: `${coachName} te invitó a entrenar en GC Fitness`,
          preheader: "Descargá la app y empezá con tu plan.",
          heading: `Hola ${clientName}`,
          intro:
            `${coachName} te sumó como cliente en GC Fitness. Ahí vas a tener tus ` +
            "entrenamientos, tus hábitos, tu plan de nutrición y el chat con tu coach, " +
            "todo en un solo lugar.",
          emailNote:
            "Importante: entrá con este mismo mail — {email} — así tu cuenta queda " +
            "vinculada a tu coach automáticamente.",
          cta: "Descargar la app",
          outro:
            "Si el botón no abre nada, copiá y pegá este link en tu navegador:",
          signoff: "Nos vemos adentro.",
        }
      : {
          subject: `${coachName} ahora es tu coach en GC Fitness`,
          preheader: "Ya podés ver tu plan en la app.",
          heading: `Hola ${clientName}`,
          intro:
            `${coachName} te sumó como cliente en GC Fitness. Abrí la app y vas a ver ` +
            "tus entrenamientos, tus hábitos y el chat con tu coach.",
          emailNote: "Tu cuenta es la de {email}.",
          cta: "Abrir GC Fitness",
          outro: "¿Borraste la app? La bajás de nuevo desde acá:",
          signoff: "A entrenar.",
        };
  }

  return kind === "download"
    ? {
        subject: `${coachName} invited you to train on GC Fitness`,
        preheader: "Download the app and start your plan.",
        heading: `Hi ${clientName}`,
        intro:
          `${coachName} added you as a client on GC Fitness. That is where your ` +
          "workouts, habits, nutrition plan and coach chat all live.",
        emailNote:
          "Important: sign in with this same address — {email} — so your account is " +
          "linked to your coach automatically.",
        cta: "Download the app",
        outro: "If the button does not open, copy this link into your browser:",
        signoff: "See you inside.",
      }
    : {
        subject: `${coachName} is now your coach on GC Fitness`,
        preheader: "Your plan is waiting in the app.",
        heading: `Hi ${clientName}`,
        intro:
          `${coachName} added you as a client on GC Fitness. Open the app to see your ` +
          "workouts, habits and coach chat.",
        emailNote: "Your account is {email}.",
        cta: "Open GC Fitness",
        outro: "Deleted the app? Get it again here:",
        signoff: "Go train.",
      };
}

/**
 * Build the email. Deterministic — same input, same bytes — so it can be
 * asserted in a unit test rather than eyeballed in an inbox.
 */
export function buildClientInviteEmail(input: InviteEmailInput): BuiltEmail {
  const clientName =
    input.clientName?.trim() || input.clientEmail.split("@")[0] || input.clientEmail;
  const coachName = input.coachName.trim() || "Tu coach";
  const copy = copyFor({
    kind: input.kind,
    locale: input.locale,
    coachName,
    clientName,
  });
  const emailNote = copy.emailNote.replace("{email}", input.clientEmail);

  const text = [
    copy.heading + ",",
    "",
    copy.intro,
    "",
    emailNote,
    "",
    `${copy.cta}: ${GC_FITNESS_DOWNLOAD_URL}`,
    "",
    copy.signoff,
    "GC Fitness",
  ].join("\n");

  const e = escapeHtml;
  const html = `<!-- ${e(copy.preheader)} -->
<div style="margin:0;padding:24px 12px;background:#F5F5F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(copy.preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="height:6px;background:${BRAND};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding:32px 28px 8px 28px;">
        <p style="margin:0 0 4px 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8A8A85;">GC Fitness</p>
        <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#1C1C19;font-weight:600;">${e(copy.heading)}</h1>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#3F3F3A;">${e(copy.intro)}</p>
        <p style="margin:0 0 24px 0;padding:12px 14px;background:#FBF6EA;border-radius:10px;font-size:14px;line-height:1.55;color:#5A4A22;">${e(emailNote)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 24px 28px;">
        <a href="${GC_FITNESS_DOWNLOAD_URL}" style="display:inline-block;padding:13px 26px;background:${BRAND};color:#1C1C19;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;">${e(copy.cta)}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 28px 28px;">
        <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#8A8A85;">${e(copy.outro)}</p>
        <p style="margin:0 0 20px 0;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${GC_FITNESS_DOWNLOAD_URL}" style="color:#8A6D22;">${GC_FITNESS_DOWNLOAD_URL}</a></p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#3F3F3A;">${e(copy.signoff)}</p>
      </td>
    </tr>
  </table>
</div>`;

  return { subject: copy.subject, text, html };
}
