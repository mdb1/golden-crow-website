import { redirect } from "next/navigation";

export default async function UploadedReportUploadPage({
  params,
}: {
  params: Promise<{ uploadedReportId: string }>;
}) {
  const { uploadedReportId } = await params;
  redirect(`/reports/uploads/${uploadedReportId}`);
}
