// POST /api/gc-fitness/locale — language picker target.
//
// Body: { locale: 'auto' | 'en' | 'es' }
//   - 'auto'  → delete the NEXT_LOCALE cookie (revert to Accept-Language sniff)
//   - 'en'/'es' → set NEXT_LOCALE cookie (path=/, 1 year, SameSite=lax)
//
// Plan 13-03 (Phase 13 i18n). Cookie is intentionally NOT httpOnly so the
// client can introspect the current locale if a future polish needs to. The
// value is not security-sensitive (it gates only translation lookup, not auth).
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ONE_YEAR_SECONDS = 31_536_000;

export async function POST(req: Request) {
  let body: { locale?: unknown };
  try {
    body = (await req.json()) as { locale?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const locale = body.locale;
  const store = await cookies();

  if (locale === "auto") {
    store.delete("NEXT_LOCALE");
    return NextResponse.json({ ok: true, locale: "auto" });
  }

  if (locale === "en" || locale === "es") {
    store.set("NEXT_LOCALE", locale, {
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
      sameSite: "lax",
      httpOnly: false,
    });
    return NextResponse.json({ ok: true, locale });
  }

  return NextResponse.json({ error: "invalid locale" }, { status: 400 });
}
