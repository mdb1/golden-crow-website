import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AreaAccessMatrix } from "@/components/area-access-matrix";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import type { AdminRole } from "@/lib/admin-areas";
import type { RoleAccessSpec } from "@/lib/two-pq-dashboard";

export function AreaAccessScreen({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  matrixTitle,
  matrixDescription,
  entries,
  highlightRole,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  matrixTitle: string;
  matrixDescription: string;
  entries: RoleAccessSpec[];
  highlightRole: AdminRole;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          </Button>
        }
      />
      <HelperBanner title="This screen isolates access from the live browser." tone="blue">
        Review the current CRUD boundary here first, then return to the main area when you want
        to open or edit a specific record.
      </HelperBanner>
      <AreaAccessMatrix
        title={matrixTitle}
        description={matrixDescription}
        entries={entries}
        highlightRole={highlightRole}
        compact
      />
    </div>
  );
}
