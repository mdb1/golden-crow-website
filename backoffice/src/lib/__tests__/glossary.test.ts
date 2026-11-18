// glossary.test.ts — gc-fitness #1604.
//
// One word per concept across the iOS app, the Android app and this backoffice. The source is
// gc-fitness `docs/GLOSSARY.md`; the apps enforce it with `scripts/check-glossary.py`, and this
// is the twin for messages/{es,en}.json — same banned words, same account-session exception.
//
//   cliente (never «alumno») · coach (never «entrenador» / "trainer") · entrenamiento (never
//   «entreno», and never «sesión» for a workout) · serie (never «set» in Spanish)
//
// Before 2.3.0 a coach read «alumno» on Pagos and «cliente» everywhere else, and «sesión»,
// «entreno» and «entrenamiento» for the same assignment.

import fs from "node:fs";
import path from "node:path";

const MESSAGES = path.join(__dirname, "..", "..", "..", "messages");

type Rule = { pattern: RegExp; instead: string };

const BANNED: Record<"es" | "en", Rule[]> = {
  es: [
    { pattern: /\balumn[oa]s?\b/i, instead: "cliente" },
    { pattern: /\bentrenos?\b/i, instead: "entrenamiento" },
    { pattern: /\bentrenador(?:a|es|as)?\b/i, instead: "coach" },
    { pattern: /\bsesi[oó]n(?:es)?(?![\p{L}])/iu, instead: "entrenamiento" },
    { pattern: /(?<!drop )\bsets?\b/i, instead: "serie" },
    // golden-crow-website#535 — agendar, never «programar» (GLOSSARY.md, Entrenamiento).
    { pattern: /\bprogram(?:ad[oa]s?|ar|á)\b/i, instead: "agendado / agendar" },
    // «workout» is English; the Spanish copy says «entrenamiento».
    { pattern: /\bworkouts?\b/i, instead: "entrenamiento" },
  ],
  en: [
    { pattern: /\btrainers?\b/i, instead: "coach" },
    { pattern: /\bstudents?\b/i, instead: "client" },
    { pattern: /\bsessions?\b/i, instead: "workout" },
  ],
};

// The account session is the one legitimate «sesión» / "session". Blanked out first.
const ACCOUNT_SESSION: Record<"es" | "en", RegExp> = {
  es: new RegExp(
    [
      String.raw`(?:inici[\p{L}]*|cerr[\p{L}]*|inicio de|cierre de)\s+(?:sus\s+)?sesi[oó]n(?:es)?`,
      String.raw`tu\s+sesi[oó]n\s+(?:venció|actual)`,
      String.raw`sesi[oó]n(?:es)?\s+(?:de\s+invitado|iniciada|actual)`,
      String.raw`sus\s+sesiones`,
    ].join("|"),
    "giu",
  ),
  en: /\bguest\s+sessions?\b|\bsessions?\s+expired\b|\bstays in this session\b/gi,
};

// #535 — the admin screens' copy is being reworked in golden-crow-website#534;
// drop a prefix here once that lands.
const PENDING_ELSEWHERE = ["admin.", "corvoAdmin."];

// «plantilla» means a ROUTINE only in the routine screens; habit templates and
// quick-reply templates are other concepts. Checked separately, by namespace.
const ROUTINE_NAMESPACES = ["templates.", "schedule.", "dashboard.", "nav.", "dialogs.", "library."];

// ICU argument names (`{sets}`, `{sessions, plural, …}`) are identifiers, not copy.
const ICU_ARG = /\{\w+(?=[,}])/g;

function flatten(node: unknown, prefix = ""): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  if (node && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      flatten(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

describe("the backoffice speaks the gc-fitness glossary (#1604)", () => {
  for (const lang of ["es", "en"] as const) {
    it(`messages/${lang}.json uses no word the glossary rules out`, () => {
      const data = JSON.parse(fs.readFileSync(path.join(MESSAGES, `${lang}.json`), "utf8"));
      const hits = flatten(data).flatMap(([key, value]) => {
        if (PENDING_ELSEWHERE.some((ns) => key.startsWith(ns))) return [];
        const text = value.replace(ICU_ARG, " ").replace(ACCOUNT_SESSION[lang], " ");
        return BANNED[lang]
          .map(({ pattern, instead }) => {
            const m = text.match(pattern);
            return m ? `${key}: «${m[0]}» → ${instead} (${value.slice(0, 80)})` : null;
          })
          .filter((h): h is string => h !== null);
      });
      expect(hits).toEqual([]);
    });
  }

  it("the routine screens say «rutina», never «plantilla» (#535)", () => {
    const data = JSON.parse(fs.readFileSync(path.join(MESSAGES, "es.json"), "utf8"));
    const hits = flatten(data)
      .filter(([key]) => ROUTINE_NAMESPACES.some((ns) => key.startsWith(ns)))
      .filter(([, value]) => /\bplantillas?\b/i.test(value))
      .map(([key, value]) => `${key}: ${value.slice(0, 80)}`);
    expect(hits).toEqual([]);
  });

  it("still catches the words it exists for", () => {
    const check = (lang: "es" | "en", value: string) =>
      BANNED[lang].some(({ pattern }) =>
        pattern.test(value.replace(ICU_ARG, " ").replace(ACCOUNT_SESSION[lang], " ")),
      );
    expect(check("es", "Todos los alumnos")).toBe(true);
    expect(check("es", "Entreno libre")).toBe(true);
    expect(check("es", "Notas de la sesión")).toBe(true);
    expect(check("es", "Backoffice del entrenador")).toBe(true);
    expect(check("en", "Trainer Backoffice")).toBe(true);
    expect(check("en", "{count, plural, one {# session} other {# sessions}}")).toBe(true);
    // …and leaves the account session and placeholders alone.
    expect(check("es", "Cerrar sesión")).toBe(false);
    expect(check("es", "Sesión iniciada como {email}.")).toBe(false);
    expect(check("es", "Cuando tus clientes inicien sesión en la app")).toBe(false);
    expect(check("es", "{sets} series esta semana")).toBe(false);
    expect(check("es", "Drop set")).toBe(false);
    expect(check("es", "Programado para {date}")).toBe(true);
    expect(check("es", "Asignar workout")).toBe(true);
    expect(check("es", "Agendado para {date}")).toBe(false);
  });
});
