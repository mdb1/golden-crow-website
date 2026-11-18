"use client";

// use-vocabulary-labels.ts — translated labels for the canonical exercise
// vocabulary (lowercase English ids: "chest", "barbell"). Shared by the exercise
// form and the list filters (#535: the filters showed the raw ids), so the two
// dynamic catalog lookups live in ONE place (see i18n-literal-keys.test.ts).

import { useTranslations } from "next-intl";

export function useVocabularyLabels() {
  const tVocab = useTranslations("exercises.vocabulary");
  return {
    muscle: (key: string) => tVocab(`muscle.${key}`),
    equipment: (key: string) => tVocab(`equipment.${key}`),
  };
}
