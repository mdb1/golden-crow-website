import { redirect } from "next/navigation";
import { KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { ReportingAccessTokenPanel } from "@/components/reporting-access-token-panel";
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
        description="Full-admin token issuing for public reporting integrations."
      />

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">
                Reporting access token
              </h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Full admins can issue an admin-specific bearer token for external
              reporting integrations. The token expires after 24 hours, is
              stored only as a hash, and is checked against a fixed per-minute
              quota before any public reporting endpoint runs.
            </p>
          </div>
          <Badge variant="secondary">24 hour bearer token</Badge>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/25 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Header
            </p>
            <code className="mt-2 block overflow-x-auto rounded-md bg-background px-2 py-1 text-xs text-foreground">
              Authorization: Bearer &lt;REPORTING_ACCESS_TOKEN&gt;
            </code>
          </div>
          <div className="rounded-lg border bg-muted/25 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Expiration
            </p>
            <p className="mt-2 text-sm text-foreground">
              Each token expires 24 hours after it is issued or refreshed.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/25 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Quota
            </p>
            <p className="mt-2 text-sm text-foreground">
              Default limit is 60 requests per minute per token.
            </p>
          </div>
        </div>

        <ReportingAccessTokenPanel />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">
              How a full admin obtains it
            </h2>
          </div>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
            <li>
              Click <code>Obtain token</code> on this page to reveal the
              admin-specific access token.
            </li>
            <li>Use it only as a bearer token in the Authorization header.</li>
            <li>
              Share it with the integration owner through a secure channel. The
              token value is shown only when it is created or refreshed.
            </li>
          </ol>
        </article>

        <article className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">
              How a full admin refreshes it
            </h2>
          </div>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
            <li>
              Click <code>Refresh token</code> here while the current token is
              visible, or call <code>POST /open-api/auth/token/refresh</code>.
            </li>
            <li>
              Send the current token as{" "}
              <code>Authorization: Bearer &lt;REPORTING_ACCESS_TOKEN&gt;</code>.
            </li>
            <li>
              The old token is revoked and a replacement token is returned with
              a fresh 24-hour expiration.
            </li>
            <li>
              Update the integration to use the replacement token for subsequent
              public API requests.
            </li>
          </ol>
        </article>
      </section>
    </div>
  );
}
