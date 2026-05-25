import { notFound } from "next/navigation";
import { TwoPQFormDetail } from "@/components/two-pq-form-detail";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";
import { getTwoPQForm } from "@/lib/two-pq-server";

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

  return <TwoPQFormDetail form={form} />;
}
