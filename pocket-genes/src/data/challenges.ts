import type { Translations } from '../i18n/en';

export type ChallengeId = 1 | 2 | 3 | 4 | 5 | 6;

export interface ChallengeContent {
  id: ChallengeId;
  title: string;
  body: string;
}

const challengeIds: readonly ChallengeId[] = [1, 2, 3, 4, 5, 6] as const;

export function getChallenges(t: Translations): ChallengeContent[] {
  const idx = t.index as Record<string, string>;
  return challengeIds.map((id) => ({
    id,
    title: idx[`challenge${id}Title`],
    body: idx[`challenge${id}Body`],
  }));
}
