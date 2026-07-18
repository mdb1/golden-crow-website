import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HelperBanner } from "@/components/helper-banner";
import { Button } from "@/components/ui/button";

export default function AccessDeniedPage() {
  return (
    <div className="glass-panel mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-7 text-left">
      <div className="flex flex-col gap-2">
        <p className="section-eyebrow">Pocket Genes</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          Access denied
        </h1>
        <p className="text-sm text-muted-foreground">
          This account authenticated successfully, but it does not have active
          backoffice access.
        </p>
      </div>
      <HelperBanner title="Why this happens" tone="amber">
        Creating a Firebase account is not enough. Backoffice access is granted
        through either the backend allowlist or an active admin role assignment
        such as full admin, institution admin, or institution doctor.
      </HelperBanner>
      <Button asChild variant="outline" className="w-full">
        <Link href="/login">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sign In
        </Link>
      </Button>
    </div>
  );
}
