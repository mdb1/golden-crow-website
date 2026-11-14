// client-name-search.ts
//
// #485: the calendar's client chip picker gets a search box — with 45+
// clients the chip wall is unusable. Case- and accent-insensitive substring
// match on the coach-visible name (and the email, when present), so "jose"
// finds "José" and "PEREZ" finds "Pérez".

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function filterClientsByQuery<
  T extends { displayName: string; email?: string | null },
>(clients: readonly T[], query: string): T[] {
  const q = fold(query);
  if (!q) return [...clients];
  return clients.filter(
    (c) => fold(c.displayName).includes(q) || fold(c.email ?? "").includes(q),
  );
}
