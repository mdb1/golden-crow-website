import type { ClientRosterEntry } from "./client-roster";

export function coachVisibleClientName(
  client: Pick<
    ClientRosterEntry,
    "displayName" | "email" | "uid" | "coachNickname"
  >,
): string {
  const nickname = client.coachNickname?.trim();
  if (nickname) return nickname;
  const name = client.displayName.trim();
  if (name) return name;
  const email = client.email.trim();
  if (email) return email;
  return client.uid;
}
