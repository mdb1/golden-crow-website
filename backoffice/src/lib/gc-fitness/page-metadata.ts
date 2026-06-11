// page-metadata.ts — per-section browser-tab titles (issue #170).
//
// Every gc-fitness page exports `generateMetadata = () => sectionMetadata(navKey)`
// with the SAME `nav.*` translation key its sidebar entry uses, so the tab
// reads "GC Fitness - <section>" in the trainer's language. The "GC Fitness - "
// prefix comes from the title template in `src/app/gc-fitness/layout.tsx`;
// pages only supply the section name.

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function sectionMetadata(navKey: string): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t(navKey) };
}
