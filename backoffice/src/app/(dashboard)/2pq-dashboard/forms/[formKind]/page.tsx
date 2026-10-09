import { notFound } from "next/navigation";
import { TwoPQFormDetail } from "@/components/two-pq-form-detail";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";
import { getTwoPQCase, getTwoPQForm } from "@/lib/two-pq-server";

export default async function TwoPQFormDetailPage({
  params,
}: {
  params: Promise<{ formKind: string }>;
}) {
  const { formKind } = await params;

  let form: TwoPQFormRecord;
  try {
    form = await getTwoPQForm(formKind);
  } catch {
    notFound();
  }

  let linkedCase: TwoPQListItem | null = null;
  if (form["2pq_case"]) {
    try {
      linkedCase = await getTwoPQCase(form["2pq_case"]);
    } catch {
      linkedCase = null;
    }
  }

  return <TwoPQFormDetail form={form} linkedCase={linkedCase} />;
}
