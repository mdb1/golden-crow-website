import { redirect } from "next/navigation";
import { KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { ReportingApiTokenReveal } from "@/components/reporting-api-token-reveal";
import { Badge } from "@/components/ui/badge";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { getReportingApiToken } from "@/lib/reporting-api-token";

export default async function ReportingApiKeysPage() {
  const { role, isBootstrap } = await getAdminContextServer();

  if (role !== "full_admin" && !isBootstrap) {
    redirect("/2pq-dashboard");
  }

  const reportingApiToken = getReportingApiToken();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ API"
        title="API Keys"
        description="Full-admin reference for the public reporting bearer token and the manual rotation flow."
      />

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">REPORTING_API_TOKEN</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              This is the only public reporting API token offered for now. It
              belongs to the GoldenCrow OpenAPI deployment, not the internal
              SDK. Full admins can reveal the current value here; rotation is
              still handled manually in deployment settings.
            </p>
          </div>
          <Badge variant="secondary">Bearer token</Badge>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/25 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Header
            </p>
            <code className="mt-2 block overflow-x-auto rounded-md bg-background px-2 py-1 text-xs text-foreground">
              Authorization: Bearer &lt;REPORTING_API_TOKEN&gt;
            </code>
          </div>
          <div className="rounded-lg border bg-muted/25 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Scope
            </p>
            <p className="mt-2 text-sm text-foreground">
              Public <code>/v1/reporting/*</code> endpoints.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/25 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Storage
            </p>
            <p className="mt-2 text-sm text-foreground">
              <code>goldencrow-openapi</code> deployment environment variable.
            </p>
          </div>
        </div>

        <ReportingApiTokenReveal token={reportingApiToken} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">How a full admin obtains it</h2>
          </div>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
            <li>
              Click <code>Obtain API Key</code> on this page to reveal the
              current token.
            </li>
            <li>
              Use it only as a bearer token in the Authorization header.
            </li>
            <li>
              Share it with the integration owner through a secure channel.
            </li>
          </ol>
        </article>

        <article className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">How a full admin refreshes it</h2>
          </div>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
            <li>
              Generate a new high-entropy token outside the backoffice.
            </li>
            <li>
              Replace <code>REPORTING_API_TOKEN</code> in the public OpenAPI
              deployment environment for <code>goldencrow-openapi</code>.
            </li>
            <li>
              Redeploy <code>goldencrow-openapi</code> so the new value is
              loaded by the public reporting API.
            </li>
            <li>
              Give the integration owner the new token and stop accepting the old
              one by keeping only the replacement value configured.
            </li>
          </ol>
        </article>
      </section>
    </div>
  );
}
