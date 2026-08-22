import { redirect } from "next/navigation";
import { KeyRound, Repeat2, ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { ReportingIntegrationClientPanel } from "@/components/reporting-integration-client-panel";
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
        description="Full-admin integration-client creation for public reporting integrations."
      />

      <section className="border-b pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">
                Reporting integration client
              </h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Full admins create an integration client for an external reporting
              backend, then generate its one-time <code>client_secret</code> in
              a separate action. The integration exchanges the{" "}
              <code>client_id</code> and <code>client_secret</code> for 24-hour
              access tokens.
            </p>
          </div>
          <Badge variant="secondary">Standard mode</Badge>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="border-l pl-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Header
            </p>
            <code className="mt-2 block overflow-x-auto text-xs text-foreground">
              Authorization: Bearer &lt;access_token&gt;
            </code>
          </div>
          <div className="border-l pl-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Token endpoint
            </p>
            <p className="mt-2 text-sm text-foreground">
              <code>POST /open-api/oauth/token</code>
            </p>
          </div>
          <div className="border-l pl-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Quota
            </p>
            <p className="mt-2 text-sm text-foreground">
              Default limit is 60 requests per minute per client.
            </p>
          </div>
        </div>
      </section>

      <ReportingIntegrationClientPanel />

      <section className="grid gap-6 lg:grid-cols-2">
        <article>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">
              How a full admin obtains it
            </h2>
          </div>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
            <li>
              Click <code>Create client</code> and enter the integration name in
              the confirmation dialog.
            </li>
            <li>
              Open the created client and click <code>Create secret</code>.
            </li>
            <li>
              Copy the visible <code>client_id</code> and one-time{" "}
              <code>client_secret</code>.
            </li>
            <li>
              Store the client secret in the integration backend, not in a
              browser or user device.
            </li>
          </ol>
        </article>

        <article>
          <div className="flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">
              How the integration uses it
            </h2>
          </div>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
            <li>
              Call <code>POST /open-api/oauth/token</code> with{" "}
              <code>grant_type</code>, <code>client_id</code>, and{" "}
              <code>client_secret</code>.
            </li>
            <li>
              Use the returned <code>access_token</code> as{" "}
              <code>Authorization: Bearer &lt;access_token&gt;</code>.
            </li>
            <li>
              Request a new access token with the same client credentials when
              the previous one expires.
            </li>
            <li>
              Business requests are quota-gated and audited by{" "}
              <code>client_id</code>.
            </li>
          </ol>
        </article>
      </section>
    </div>
  );
}
