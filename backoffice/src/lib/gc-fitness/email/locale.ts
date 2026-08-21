// locale.ts — issue #970. Which language the client's email is written in.
//
// It is the COACH's language, and it cannot be the client's.
//
// On the invitation branch the person does not exist yet: there is no
// `/users/{uid}`, no `preferences`, no `preferredLocale`, no timezone — the
// only thing we hold is the address the coach typed. The coach's own resolved
// locale (cookie → `/users/{coach}.preferredLocale` → Accept-Language →
// `defaultLocale`, see `src/i18n/request.ts`) is the best available signal:
// they know who they are inviting.
//
// The same helper is used on the already-a-user branch for consistency, even
// though that client HAS a `preferredLocale`: two clients of the same coach
// receiving the same email in different languages would be stranger than one
// rule, and the resend button would flip the language depending on who pressed
// it.

import "server-only";
import { getLocale } from "next-intl/server";

import { defaultLocale } from "@/i18n/routing";

import type { InviteEmailLocale } from "./invite-email";

export async function inviteEmailLocale(): Promise<InviteEmailLocale> {
  try {
    const locale = await getLocale();
    return locale === "en" ? "en" : "es";
  } catch {
    // `getLocale()` needs the next-intl request scope. A caller outside it
    // (a future cron, a script) still gets a valid email rather than a throw
    // that would take down an otherwise-successful client add. `defaultLocale`
    // is the app's own answer to "no signal", so it is the one used here too.
    return defaultLocale;
  }
}
