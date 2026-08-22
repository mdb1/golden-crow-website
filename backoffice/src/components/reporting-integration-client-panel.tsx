"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  Check,
  Clock3,
  Copy,
  KeyRound,
  Plus,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ReportingIntegrationClientSummary = {
  client_id: string;
  name: string;
  scopes: string[];
  quota: {
    limit: number;
    window_seconds: number;
  };
  status: "active" | "revoked";
  created_at: string;
  created_by: {
    uid: string;
    email: string;
  };
  secret_prefix?: string;
  last_secret_rotated_at?: string;
  last_secret_rotated_by?: {
    uid: string;
    email: string;
  };
  revoked_at?: string;
  revoked_by?: {
    uid: string;
    email: string;
  };
  last_token_issued_at?: string;
  last_used_at?: string;
  usage_count: number;
  token_issue_count: number;
};

type ReportingIntegrationClientCreateResponse = {
  client_id: string;
  client_secret: string;
  name: string;
  scopes: string[];
  quota: {
    limit: number;
    window_seconds: number;
  };
  status: "active" | "revoked";
  created_at: string;
  created_by: {
    uid: string;
    email: string;
  };
};

type ReportingIntegrationClientSecretRotateResponse = {
  client: ReportingIntegrationClientSummary;
  client_secret: string;
};

type ReportingIntegrationClientRevokeResponse = {
  client: ReportingIntegrationClientSummary;
};

type ReportingIntegrationClientAccessEvent = {
  id: string;
  event_type:
    | "integration_client.created"
    | "integration_client.secret_rotated"
    | "integration_client.revoked";
  client_id: string;
  client_name: string;
  occurred_at: string;
  actor: {
    uid: string;
    email: string;
  };
  status?: "active" | "revoked";
  secret_prefix?: string;
  previous_secret_prefix?: string;
  quota?: {
    limit: number;
    window_seconds: number;
  };
  scopes?: string[];
};

type ClientListResponse = {
  clients: ReportingIntegrationClientSummary[];
  next_cursor?: string;
};

type EventListResponse = {
  events: ReportingIntegrationClientAccessEvent[];
  next_cursor?: string;
};

type RevealedSecret = {
  action: "created" | "rotated";
  client: ReportingIntegrationClientSummary;
  client_secret: string;
};

const PAGE_LIMIT = 20;

function formatDate(value: string | undefined) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function summaryFromCreateResponse(
  body: ReportingIntegrationClientCreateResponse,
): ReportingIntegrationClientSummary {
  return {
    client_id: body.client_id,
    name: body.name,
    scopes: body.scopes,
    quota: body.quota,
    status: body.status,
    created_at: body.created_at,
    created_by: body.created_by,
    secret_prefix: body.client_secret.slice(0, 18),
    usage_count: 0,
    token_issue_count: 0,
  };
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text };
  }
}

function mergeClients(
  current: ReportingIntegrationClientSummary[],
  incoming: ReportingIntegrationClientSummary[],
) {
  const byId = new Map(current.map((client) => [client.client_id, client]));
  for (const client of incoming) {
    byId.set(client.client_id, client);
  }

  return [...byId.values()].sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  );
}

function eventTitle(
  eventType: ReportingIntegrationClientAccessEvent["event_type"],
) {
  if (eventType === "integration_client.created") {
    return "Integration client created";
  }

  if (eventType === "integration_client.secret_rotated") {
    return "Client secret rotated";
  }

  return "Integration client revoked";
}

function eventBody(event: ReportingIntegrationClientAccessEvent) {
  if (event.event_type === "integration_client.created") {
    return `Created ${event.client_name} with secret prefix ${event.secret_prefix ?? "hidden"}.`;
  }

  if (event.event_type === "integration_client.secret_rotated") {
    return `Rotated ${event.client_name}; previous prefix ${event.previous_secret_prefix ?? "hidden"}, new prefix ${event.secret_prefix ?? "hidden"}.`;
  }

  return `Revoked ${event.client_name}. Token exchanges and business requests for this client now fail.`;
}

function isErrorBody(value: unknown): value is { error: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string",
  );
}

export function ReportingIntegrationClientPanel() {
  const [name, setName] = useState("2PQ reporting integration");
  const [clients, setClients] = useState<ReportingIntegrationClientSummary[]>(
    [],
  );
  const [events, setEvents] = useState<ReportingIntegrationClientAccessEvent[]>(
    [],
  );
  const [clientCursor, setClientCursor] = useState<string | null>(null);
  const [eventCursor, setEventCursor] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<RevealedSecret | null>(
    null,
  );
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<"id" | "secret" | null>(null);

  const activeClients = useMemo(
    () => clients.filter((client) => client.status === "active").length,
    [clients],
  );

  async function loadClients(
    options: { append?: boolean; cursor?: string } = {},
  ) {
    setIsLoadingClients(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (options.cursor) {
        params.set("cursor", options.cursor);
      }
      const response = await fetch(
        `/api/open-api/reporting/integration-clients?${params.toString()}`,
      );
      const body = await parseResponse(response);
      if (!response.ok) {
        throw new Error(
          isErrorBody(body)
            ? body.error
            : "Could not load integration clients.",
        );
      }

      const list = body as ClientListResponse;
      setClients((current) =>
        options.append
          ? mergeClients(current, list.clients)
          : mergeClients([], list.clients),
      );
      setClientCursor(list.next_cursor ?? null);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not load integration clients.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingClients(false);
    }
  }

  async function loadEvents(
    options: { append?: boolean; cursor?: string } = {},
  ) {
    setIsLoadingEvents(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (options.cursor) {
        params.set("cursor", options.cursor);
      }
      const response = await fetch(
        `/api/open-api/reporting/integration-clients/events?${params.toString()}`,
      );
      const body = await parseResponse(response);
      if (!response.ok) {
        throw new Error(
          isErrorBody(body) ? body.error : "Could not load API access events.",
        );
      }

      const list = body as EventListResponse;
      setEvents((current) => {
        const next = options.append
          ? [...current, ...list.events]
          : list.events;
        const byId = new Map(next.map((event) => [event.id, event]));
        return [...byId.values()].sort(
          (left, right) =>
            new Date(right.occurred_at).getTime() -
            new Date(left.occurred_at).getTime(),
        );
      });
      setEventCursor(list.next_cursor ?? null);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not load API access events.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingEvents(false);
    }
  }

  async function refreshAccessState() {
    await Promise.all([loadClients(), loadEvents()]);
  }

  useEffect(() => {
    void refreshAccessState();
  }, []);

  async function createClient() {
    setIsCreating(true);
    setError(null);
    setCopiedField(null);

    try {
      const response = await fetch(
        "/api/open-api/reporting/integration-clients",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        },
      );
      const body = await parseResponse(response);
      if (!response.ok) {
        throw new Error(
          isErrorBody(body)
            ? body.error
            : "Could not create integration client.",
        );
      }

      const created = body as ReportingIntegrationClientCreateResponse;
      const client = summaryFromCreateResponse(created);
      setClients((current) => mergeClients(current, [client]));
      setRevealedSecret({
        action: "created",
        client,
        client_secret: created.client_secret,
      });
      toast.success("Integration client created.");
      void loadEvents();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not create integration client.";
      setError(message);
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }

  async function rotateClientSecret(client: ReportingIntegrationClientSummary) {
    const actionKey = `rotate:${client.client_id}`;
    setPendingAction(actionKey);
    setError(null);
    setCopiedField(null);

    try {
      const response = await fetch(
        `/api/open-api/reporting/integration-clients/${encodeURIComponent(
          client.client_id,
        )}/secret/rotate`,
        {
          method: "POST",
        },
      );
      const body = await parseResponse(response);
      if (!response.ok) {
        throw new Error(
          isErrorBody(body) ? body.error : "Could not rotate client secret.",
        );
      }

      const rotated = body as ReportingIntegrationClientSecretRotateResponse;
      setClients((current) => mergeClients(current, [rotated.client]));
      setRevealedSecret({
        action: "rotated",
        client: rotated.client,
        client_secret: rotated.client_secret,
      });
      toast.success("Client secret rotated.");
      void loadEvents();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not rotate client secret.";
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function revokeClient(client: ReportingIntegrationClientSummary) {
    const actionKey = `revoke:${client.client_id}`;
    setPendingAction(actionKey);
    setError(null);

    try {
      const response = await fetch(
        `/api/open-api/reporting/integration-clients/${encodeURIComponent(
          client.client_id,
        )}/revoke`,
        {
          method: "POST",
        },
      );
      const body = await parseResponse(response);
      if (!response.ok) {
        throw new Error(
          isErrorBody(body)
            ? body.error
            : "Could not revoke integration client.",
        );
      }

      const revoked = body as ReportingIntegrationClientRevokeResponse;
      setClients((current) => mergeClients(current, [revoked.client]));
      toast.success("Integration client revoked.");
      void loadEvents();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not revoke integration client.";
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function copyValue(field: "id" | "secret", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1800);
      toast.success(
        field === "secret" ? "Client secret copied." : "Client ID copied.",
      );
    } catch {
      setCopiedField(null);
      toast.error("Could not copy to clipboard.");
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="rounded-lg border bg-muted/25 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <Label htmlFor="reporting-integration-name">Integration name</Label>
            <Input
              id="reporting-integration-name"
              className="mt-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isCreating}
            />
          </div>
          <Button
            type="button"
            onClick={createClient}
            disabled={isCreating || !name.trim()}
          >
            <Plus />
            {isCreating ? "Creating" : "Create client"}
          </Button>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        ) : null}

        {revealedSecret ? (
          <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-300/30 dark:bg-amber-400/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                  {revealedSecret.action === "created"
                    ? "Client secret created"
                    : "New client secret generated"}
                </p>
                <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
                  Copy this value now. The full secret is shown only once.
                </p>
              </div>
              <Badge variant="warning">One-time reveal</Badge>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="min-w-0 rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    client_id
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyValue("id", revealedSecret.client.client_id)
                    }
                  >
                    {copiedField === "id" ? <Check /> : <Copy />}
                    {copiedField === "id" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <code className="mt-2 block overflow-x-auto break-all rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground">
                  {revealedSecret.client.client_id}
                </code>
              </div>

              <div className="min-w-0 rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    client_secret
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyValue("secret", revealedSecret.client_secret)
                    }
                  >
                    {copiedField === "secret" ? <Check /> : <Copy />}
                    {copiedField === "secret" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <code className="mt-2 block overflow-x-auto break-all rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground">
                  {revealedSecret.client_secret}
                </code>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">
            Reset or revoke credentials
          </h2>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-muted/25 p-4">
            <h3 className="text-sm font-semibold">Lost secret</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Use <code>Reset secret</code> on the active client. The{" "}
              <code>client_id</code>, scopes, quota, and event history stay the
              same. The previous <code>client_secret</code> stops minting new
              access tokens. Already issued access tokens can keep working until
              their 24-hour expiration.
            </p>
          </div>

          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-4">
            <h3 className="text-sm font-semibold text-destructive">
              Suspected compromise
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Use <code>Revoke</code>. The client cannot mint new access tokens,
              and business API requests made with existing tokens for that
              client fail immediately. This cannot be undone; create a new
              client for the replacement integration.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Integration clients</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeClients} active of {clients.length} loaded clients.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshAccessState()}
            disabled={isLoadingClients || isLoadingEvents}
          >
            <RotateCcw />
            Refresh
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {isLoadingClients && !clients.length ? (
            <p className="rounded-lg border bg-muted/25 p-4 text-sm text-muted-foreground">
              Loading integration clients.
            </p>
          ) : null}

          {!isLoadingClients && !clients.length ? (
            <p className="rounded-lg border bg-muted/25 p-4 text-sm text-muted-foreground">
              No integration clients have been created yet.
            </p>
          ) : null}

          {clients.map((client) => {
            const isRevoked = client.status === "revoked";
            const rotateActionKey = `rotate:${client.client_id}`;
            const revokeActionKey = `revoke:${client.client_id}`;

            return (
              <article
                key={client.client_id}
                className="rounded-lg border bg-background p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{client.name}</h3>
                      <Badge variant={isRevoked ? "destructive" : "success"}>
                        {client.status}
                      </Badge>
                    </div>
                    <code className="mt-2 block overflow-x-auto break-all rounded-md bg-muted/60 px-2 py-1 text-xs text-foreground">
                      {client.client_id}
                    </code>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isRevoked || pendingAction !== null}
                        >
                          <RotateCcw />
                          Reset secret
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Reset secret for {client.name}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            A new one-time <code>client_secret</code> will be
                            generated for this same <code>client_id</code>. The
                            old secret will stop working for new token
                            exchanges. Existing access tokens can keep working
                            until their 24-hour expiration.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void rotateClientSecret(client)}
                            disabled={pendingAction === rotateActionKey}
                          >
                            {pendingAction === rotateActionKey
                              ? "Resetting"
                              : "Reset secret"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={isRevoked || pendingAction !== null}
                        >
                          <Ban />
                          Revoke
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Revoke {client.name}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This immediately blocks new token exchanges and all
                            business API requests made with existing access
                            tokens for this client. This action cannot be
                            undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => void revokeClient(client)}
                            disabled={pendingAction === revokeActionKey}
                          >
                            {pendingAction === revokeActionKey
                              ? "Revoking"
                              : "Revoke client"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md border bg-muted/25 p-3">
                    <dt className="text-xs font-medium uppercase text-muted-foreground">
                      Secret prefix
                    </dt>
                    <dd className="mt-1 font-mono text-xs text-foreground">
                      {client.secret_prefix ?? "hidden"}
                    </dd>
                  </div>
                  <div className="rounded-md border bg-muted/25 p-3">
                    <dt className="text-xs font-medium uppercase text-muted-foreground">
                      Quota
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">
                      {client.quota.limit} / {client.quota.window_seconds}s
                    </dd>
                  </div>
                  <div className="rounded-md border bg-muted/25 p-3">
                    <dt className="text-xs font-medium uppercase text-muted-foreground">
                      Tokens issued
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">
                      {client.token_issue_count}
                    </dd>
                  </div>
                  <div className="rounded-md border bg-muted/25 p-3">
                    <dt className="text-xs font-medium uppercase text-muted-foreground">
                      Requests accepted
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">
                      {client.usage_count}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 grid gap-2 text-xs text-muted-foreground lg:grid-cols-3">
                  <p>Created by {client.created_by.email}</p>
                  <p>Last token: {formatDate(client.last_token_issued_at)}</p>
                  <p>Last request: {formatDate(client.last_used_at)}</p>
                  {client.last_secret_rotated_at ? (
                    <p>
                      Rotated by {client.last_secret_rotated_by?.email} at{" "}
                      {formatDate(client.last_secret_rotated_at)}
                    </p>
                  ) : null}
                  {client.revoked_at ? (
                    <p className="text-destructive">
                      Revoked by {client.revoked_by?.email} at{" "}
                      {formatDate(client.revoked_at)}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {client.scopes.map((scope) => (
                    <Badge key={scope} variant="outline">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        {clientCursor ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() =>
              void loadClients({ append: true, cursor: clientCursor })
            }
            disabled={isLoadingClients}
          >
            Load more clients
          </Button>
        ) : null}
      </section>

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Event log</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Key-management events only. Full secrets are never stored or shown
              here.
            </p>
          </div>
          <Badge variant="outline">{events.length} loaded</Badge>
        </div>

        <div className="mt-4 space-y-3">
          {isLoadingEvents && !events.length ? (
            <p className="rounded-lg border bg-muted/25 p-4 text-sm text-muted-foreground">
              Loading API access events.
            </p>
          ) : null}

          {!isLoadingEvents && !events.length ? (
            <p className="rounded-lg border bg-muted/25 p-4 text-sm text-muted-foreground">
              No API access events have been recorded yet.
            </p>
          ) : null}

          {events.map((event) => (
            <article
              key={event.id}
              className="grid gap-3 rounded-lg border bg-background p-4 lg:grid-cols-[10rem_minmax(0,1fr)]"
            >
              <time className="text-xs text-muted-foreground">
                {formatDate(event.occurred_at)}
              </time>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">
                    {eventTitle(event.event_type)}
                  </p>
                  <Badge
                    variant={
                      event.event_type === "integration_client.revoked"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {event.actor.email}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {eventBody(event)}
                </p>
                <code className="mt-2 block overflow-x-auto break-all text-xs text-muted-foreground">
                  {event.client_id}
                </code>
              </div>
            </article>
          ))}
        </div>

        {eventCursor ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() =>
              void loadEvents({ append: true, cursor: eventCursor })
            }
            disabled={isLoadingEvents}
          >
            Load more events
          </Button>
        ) : null}
      </section>
    </div>
  );
}
