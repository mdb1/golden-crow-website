// session.ts — server-side read of the backoffice session (#470).
//
// Drop-in for next-auth's `getServerSession(authOptions)`: same return shape
// (`{ user: { name, email, image, project, accessSurface }, expires }` or
// null). Server Components can't set cookies, so this only READS — a legacy
// next-auth cookie is accepted here and re-issued by `proxy.ts` or
// `/api/auth/session`.

import "server-only";

import { cookies } from "next/headers";
import {
  cookieJar,
  readSessionFromCookies,
  type Session,
} from "@/lib/backoffice-session";

export type { Session } from "@/lib/backoffice-session";

export async function getServerSession(): Promise<Session | null> {
  const store = await cookies();
  const read = await readSessionFromCookies(cookieJar(store));
  return read?.session ?? null;
}
