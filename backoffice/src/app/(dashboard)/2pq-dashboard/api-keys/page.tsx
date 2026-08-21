import { redirect } from "next/navigation";
import { KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function ReportingApiKeysPage() {
  const { role, isBootstrap } = await getAdminContextServer();

  if (role !== "full_admin" && !isBootstrap) {
    redirect("/2pq-dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ API"
        title="API Keys"
        description="Full-admin reference for the current reporting bearer token and the manual rotation flow."
      />

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">REPORTING_API_TOKEN</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              This is the only reporting API token offered for now. The
              backoffice documents the key and its usage, but it does not reveal
              or rotate the secret value in the UI.
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
              All <code>/reporting/*</code> endpoints.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/25 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Storage
            </p>
            <p className="mt-2 text-sm text-foreground">
              Deployment environment variable, not Firestore.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">How a full admin obtains it</h2>
          </div>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
            <li>
              Open the production deployment secrets or environment settings for
              the SDK service.
            </li>
            <li>
              Read the current <code>REPORTING_API_TOKEN</code> value from that
              secure environment.
            </li>
            <li>
              Share it with the integration owner through a secure channel, then
              use it only as a bearer token in the Authorization header.
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
              Replace <code>REPORTING_API_TOKEN</code> in the SDK deployment
              environment.
            </li>
            <li>
              Redeploy the SDK so the new value is loaded by the reporting API.
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
