import { PageHero } from "@/components/page-hero";
import { TwoPQContactSection } from "@/components/two-pq-contact-section";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function TwoPQContactPage() {
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ"
        title={t("Contact")}
        description={t("Official channels for 2PQ operations, sample coordination, and administrative follow-up.")}
      />
      <TwoPQContactSection />
    </div>
  );
}
