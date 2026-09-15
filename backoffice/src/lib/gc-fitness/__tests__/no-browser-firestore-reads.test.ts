// no-browser-firestore-reads.test.ts
//
// AN INVARIANT, NOT A UNIT TEST. Nothing under the GC Fitness surface may read
// or write Firestore with the BROWSER SDK (`firebase/firestore`).
//
// WHY (#1104). The coach portal has TWO unrelated credentials:
//
//   • the `GcFitnessAuthToken` cookie, verified server-side by
//     `auth-helpers.ts` — this is what lets the coach onto the page at all;
//   • a Firebase-Auth session the browser SDK persists in IndexedDB — used by
//     nothing except a client-SDK Firestore call.
//
// Privacy browsers break the SECOND one and leave the first intact. Brave on
// mobile (and Safari ITP, and any private window) partitions or evicts that
// storage, so `auth.currentUser` is `null` while the coach is, by every
// visible sign, signed in: the portal renders, the nav works, the other lists
// load. Only the one surface using the browser SDK fails — with
// `permission-denied` against `allow read: if isSignedIn()`, which the UI can
// only render as "couldn't load".
//
// That is exactly how the exercise library broke, and it was invisible for
// months because it reproduces on nobody's desktop Chrome. Every other list in
// this backoffice had already moved to a Server Action; the library was the
// last one left, and it was the only one that failed.
//
// IF YOU EVER NEED A LIVE LISTENER: it can be done, but the page must still
// work when the browser Auth session is absent — which in practice means a
// Server Action for the initial load and the listener as an enhancement. Add
// the file to ALLOWED below with that reasoning, and say how you verified it
// in a privacy browser on a phone.

import { execFileSync } from "node:child_process";
import path from "node:path";

/** Files knowingly exempt, with the reason. Empty is the correct state. */
const ALLOWED: string[] = [];

const SRC = path.join(__dirname, "..", "..", "..");

/** Surfaces this invariant covers — the GC Fitness coach portal. */
const SCANNED = [
  path.join(SRC, "lib", "gc-fitness"),
  path.join(SRC, "components", "gc-fitness"),
  path.join(SRC, "app", "gc-fitness"),
];

function filesImportingBrowserFirestore(): string[] {
  const hits = new Set<string>();
  for (const dir of SCANNED) {
    let out = "";
    try {
      out = execFileSync(
        "grep",
        ["-rlE", "from ['\"]firebase/firestore['\"]", "--include=*.ts", "--include=*.tsx", dir],
        { encoding: "utf8" },
      );
    } catch {
      // grep exits 1 with no matches — the state we want.
      continue;
    }
    for (const line of out.split("\n")) {
      const file = line.trim();
      if (!file) continue;
      // Test files may mock the module; the rule is about shipped code.
      if (file.includes("__tests__")) continue;
      hits.add(path.relative(SRC, file));
    }
  }
  return [...hits].sort();
}

describe("#1104 — no browser-SDK Firestore access on the coach portal", () => {
  it("keeps every Firestore read behind a Server Action", () => {
    const offenders = filesImportingBrowserFirestore().filter(
      (f) => !ALLOWED.includes(f),
    );

    expect(offenders).toEqual([]);
  });
});
