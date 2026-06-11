import "server-only";

import { cookies } from "next/headers";
import {
  LANGUAGE_COOKIE_NAME,
  resolveAppLanguage,
  type AppLanguage,
} from "@/lib/language";

export async function getServerAppLanguage(): Promise<AppLanguage> {
  const cookieStore = await cookies();
  return resolveAppLanguage(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value);
}
