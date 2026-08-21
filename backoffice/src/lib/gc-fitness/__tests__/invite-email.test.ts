// __tests__/invite-email.test.ts — issue #970.
//
// The copy builder is pure, so the things that are invisible in an inbox until
// they are wrong get asserted here instead: the address is always in the body,
// the link is never a store URL, and a coach display name cannot inject markup
// into a message we send under our own domain.

import {
  buildClientInviteEmail,
  escapeHtml,
  GC_FITNESS_DOWNLOAD_URL,
} from "../email/invite-email";

const BASE = {
  clientEmail: "cliente@example.com",
  clientName: "Ana",
  coachName: "Fede",
} as const;

describe("buildClientInviteEmail", () => {
  /**
   * The load-bearing instruction. Linking happens server-side in
   * `onBeforeUserCreated`, matching the NORMALIZED address against
   * `/user_mirror/{email}`. Sign in with a different Google account and the
   * account is created coach-less — the coach sees nothing, the client sees
   * nothing, and neither can tell why. So the address is stated, verbatim.
   */
  it.each(["es", "en"] as const)(
    "names the exact address in the body (%s)",
    (locale) => {
      const built = buildClientInviteEmail({ ...BASE, kind: "download", locale });
      expect(built.text).toContain(BASE.clientEmail);
      expect(built.html).toContain(BASE.clientEmail);
    },
  );

  /**
   * #782: on iOS EVERY `apps.apple.com` URL answers `301 → itms-appss://`,
   * which embedded web views refuse to hand to the OS — the tap does nothing at
   * all. `/gc-fitness/start` is the turnstile that has the fallback.
   */
  it.each(["download", "linked"] as const)(
    "links the download turnstile and never a store URL (%s)",
    (kind) => {
      const built = buildClientInviteEmail({ ...BASE, kind, locale: "es" });
      expect(built.text).toContain(GC_FITNESS_DOWNLOAD_URL);
      expect(built.html).toContain(GC_FITNESS_DOWNLOAD_URL);
      expect(built.html).not.toContain("apps.apple.com");
      expect(built.html).not.toContain("play.google.com");
    },
  );

  it("puts the coach's name in the subject", () => {
    const es = buildClientInviteEmail({ ...BASE, kind: "download", locale: "es" });
    const en = buildClientInviteEmail({ ...BASE, kind: "download", locale: "en" });
    expect(es.subject).toContain("Fede");
    expect(en.subject).toContain("Fede");
    expect(es.subject).not.toBe(en.subject);
  });

  /**
   * The two kinds are not the same email with a different greeting. Someone who
   * already has the app does not need to be told to download it, and telling
   * them anyway is the kind of noise that trains people to ignore us.
   */
  it("the linked variant does not read as a download pitch", () => {
    const linked = buildClientInviteEmail({ ...BASE, kind: "linked", locale: "es" });
    const download = buildClientInviteEmail({ ...BASE, kind: "download", locale: "es" });
    expect(linked.subject).not.toBe(download.subject);
    expect(linked.text).toContain("Abrir GC Fitness");
    expect(download.text).toContain("Descargar la app");
  });

  /** A coach who left the name blank still gets a greeting, not "Hola ,". */
  it("falls back to the address local-part when there is no name", () => {
    const built = buildClientInviteEmail({
      clientEmail: "ana.perez@example.com",
      clientName: "   ",
      coachName: "Fede",
      kind: "download",
      locale: "es",
    });
    expect(built.text).toContain("Hola ana.perez");
  });

  /**
   * Display names are coach-supplied free text and land in HTML we send from
   * our own domain. Unescaped, a name containing a tag injects markup.
   */
  it("escapes names into the HTML", () => {
    const built = buildClientInviteEmail({
      clientEmail: "x@example.com",
      clientName: '<img src=x onerror="alert(1)">',
      coachName: "Fede & Co <b>",
      kind: "download",
      locale: "es",
    });
    // The whole payload survives as INERT TEXT — no tag, and the attribute
    // quotes that would end the `style="…"` it sits inside are escaped too.
    expect(built.html).not.toContain("<img");
    expect(built.html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(built.html).toContain("Fede &amp; Co &lt;b&gt;");
  });

  it("is deterministic — same input, same bytes", () => {
    const a = buildClientInviteEmail({ ...BASE, kind: "download", locale: "es" });
    const b = buildClientInviteEmail({ ...BASE, kind: "download", locale: "es" });
    expect(a).toEqual(b);
  });
});

describe("escapeHtml", () => {
  it("covers the five characters that can break out of HTML context", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes the ampersand FIRST so escapes are not double-escaped", () => {
    // `&lt;` in the input must survive as a literal, not become `&amp;amp;lt;`.
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});
