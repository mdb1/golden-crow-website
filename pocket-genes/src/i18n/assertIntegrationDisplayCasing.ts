type TranslationTree = Record<string, unknown>;

const uppercaseDisplayPaths = [
  'pocketGenes.integrationCtaTitle',
  'hero.tagline',
  'hero.primaryCta',
  'panels.title1',
  'panels.title2',
  'appScreenshots.eyebrow',
  'appScreenshots.title1',
  'appScreenshots.title2',
  'appScreenshots.captions',
  'integrationRevamp.outcome.eyebrow',
  'integrationRevamp.outcome.title1',
  'integrationRevamp.outcome.title2',
  'integrationRevamp.outcome.beforeTitle',
  'integrationRevamp.outcome.afterTitle',
  'integrationRevamp.discovery.eyebrow',
  'integrationRevamp.discovery.title1',
  'integrationRevamp.discovery.title2',
  'integrationRevamp.journey.eyebrow',
  'integrationRevamp.journey.title1',
  'integrationRevamp.journey.title2',
  'integrationRevamp.trust.eyebrow',
  'integrationRevamp.trust.title1',
  'integrationRevamp.trust.title2',
  'moreToCome.title1',
  'moreToCome.title2',
  'introPlan.title1',
  'introPlan.title2',
  'plan.eyebrow',
  'plan.title',
  'secondSection.title1',
  'secondSection.title2',
  'thirdSection.title1',
  'thirdSection.title2',
  'introAboutUs.title1',
  'introAboutUs.title2',
  'timeline.title',
  'timeline.q1Period',
  'timeline.q2Period',
  'timeline.q3Period',
  'timeline.q4Period',
  'choosePlan.title1',
  'choosePlan.title2',
  'integrationProcess.title',
  'integrationProcess.freeSubtitle',
  'integrationProcess.freeItem1Title',
  'integrationProcess.freeItem2Title',
  'integrationProcess.freeItem3Title',
  'integrationProcess.plusSubtitle',
  'integrationProcess.plusItem1Title',
  'integrationProcess.plusItem2Title',
  'integrationProcess.plusItem3Title',
  'experience.title1',
  'experience.title2',
] as const;

const lowercasePattern = /[a-záéíóúñü]/;
const letterPattern = /[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/;

function valuesAtPath(tree: TranslationTree, path: string): string[] {
  const value = path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as TranslationTree)[segment];
  }, tree);

  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function isUppercaseDisplayValue(value: string) {
  return letterPattern.test(value) && !lowercasePattern.test(value);
}

export function assertIntegrationDisplayCasing(en: TranslationTree, es: TranslationTree) {
  const failures = uppercaseDisplayPaths.flatMap((path) => {
    const enValues = valuesAtPath(en, path);
    const esValues = valuesAtPath(es, path);

    return esValues.flatMap((esValue, index) => {
      const enValue = enValues[index];
      if (!enValue || !isUppercaseDisplayValue(esValue) || isUppercaseDisplayValue(enValue)) {
        return [];
      }

      return [`${path}: Spanish is uppercase "${esValue}" but English is "${enValue}"`];
    });
  });

  if (failures.length > 0) {
    throw new Error(`Pocket Genes integration display casing mismatch:\n${failures.join('\n')}`);
  }
}
