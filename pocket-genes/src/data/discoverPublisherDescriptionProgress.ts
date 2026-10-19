export const DESCRIPTION_MIN_LENGTH = 30;

export type DescriptionProgressState = 'needs-more' | 'close' | 'almost-there' | 'ready';

export type DescriptionProgress = {
  remaining: number;
  progress: number;
  state: DescriptionProgressState;
};

export function getDescriptionProgress(characterCount: number): DescriptionProgress {
  const normalizedCount = Math.max(0, Math.trunc(characterCount));
  const remaining = Math.max(0, DESCRIPTION_MIN_LENGTH - normalizedCount);

  let state: DescriptionProgressState = 'needs-more';
  if (remaining === 0) {
    state = 'ready';
  } else if (remaining <= 5) {
    state = 'almost-there';
  } else if (remaining <= 10) {
    state = 'close';
  }

  return {
    remaining,
    progress: Math.min(1, normalizedCount / DESCRIPTION_MIN_LENGTH),
    state,
  };
}
