import { sdkFetch } from "./sdk-client";
import type {
  AdminUserRecord,
  AdminUserVerificationSummary,
  CollectionKey,
} from "./moderation-types";

const IDENTITY_COLLECTION_KEYS = new Set<CollectionKey>([
  "public_profiles",
  "community_users",
  "report_owners",
]);

export function isIdentityCollectionKey(collectionKey: CollectionKey) {
  return IDENTITY_COLLECTION_KEYS.has(collectionKey);
}

export function toVerificationSummary(
  user: Pick<AdminUserRecord, "uid" | "email" | "emailVerified" | "disabled">
): AdminUserVerificationSummary {
  return {
    uid: user.uid,
    exists: true,
    email: user.email,
    emailVerified: user.emailVerified,
    disabled: user.disabled,
  };
}

export async function fetchUserVerificationSummaries(
  ids: string[]
): Promise<AdminUserVerificationSummary[]> {
  const sanitizedIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];

  if (sanitizedIds.length === 0) {
    return [];
  }

  const chunks: string[][] = [];

  for (let index = 0; index < sanitizedIds.length; index += 100) {
    chunks.push(sanitizedIds.slice(index, index + 100));
  }

  const responses = await Promise.all(
    chunks.map((idsChunk) =>
      sdkFetch<{ summaries: AdminUserVerificationSummary[] }>(
        "/users/verification-summaries",
        {
          method: "POST",
          body: JSON.stringify({
            ids: idsChunk,
          }),
        }
      )
    )
  );

  return responses.flatMap((response) => response.summaries);
}
