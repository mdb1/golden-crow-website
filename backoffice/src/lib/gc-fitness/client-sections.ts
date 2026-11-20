// client-sections.ts — #502: the client profile's sections, in nav order, and
// which chart slot lives in which section. Pure data so the test can pin that
// every chart has exactly one home (a chart in no section would silently vanish
// from the profile).

import type { ClientChartId } from "./client-chart-preferences";

/** Anchor ids — also the deep link: `/gc-fitness/clients/<id>#<section>`. */
export const CLIENT_SECTION_IDS = [
  "resumen",
  "entrenamiento",
  "habitos",
  "nutricion",
  "pagos",
  "progreso",
  "chat",
] as const;
export type ClientSectionId = (typeof CLIENT_SECTION_IDS)[number];

/** The sections that host charts, and their slots (rendered in the page's `chartSlots` order). */
export const CLIENT_SECTION_CHARTS = {
  entrenamiento: ["volume", "muscleGroups", "exerciseProgress", "personalRecords"],
  habitos: ["habits", "dailySteps"],
  progreso: ["bodyWeight"],
} as const satisfies Partial<Record<ClientSectionId, readonly ClientChartId[]>>;
