import Link from "next/link";
import { HelperBanner } from "@/components/helper-banner";
import { Button } from "@/components/ui/button";

export default function AccessDeniedPage() {
  return (
    <div className="glass-panel flex w-full flex-col gap-6 px-6 py-7 text-left">
      <div className="flex flex-col gap-2">
        <p className="section-eyebrow">Pocket Genes</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          Access denied
        </h1>
        <p className="text-sm text-muted-foreground">
          This account authenticated successfully, but it is not on the Pocket
          Genes Admin allowlist.
        </p>
      </div>
      <HelperBanner title="Why this happens" tone="amber">
        Creating a Firebase account is not enough. Admin access is granted only
        to emails approved by the backend team allowlist.
      </HelperBanner>
      <Button asChild variant="outline" className="w-full">
        <Link href="/login">Back to Sign In</Link>
      </Button>
    </div>
  );
}
