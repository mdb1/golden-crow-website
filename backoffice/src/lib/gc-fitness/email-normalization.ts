/**
 * Canonical mirror-email normalizer shared by trainer provisioning + pending
 * assignment/habit actions. Must stay in parity with functions/auth side.
 */
export function normalizeMirrorEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return email;

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);

  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }
  if (domain === "gmail.com") {
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

