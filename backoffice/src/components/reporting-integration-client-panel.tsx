"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  has_client_secret: boolean;
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

type ReportingIntegrationClientCreateResponse = Omit<
  ReportingIntegrationClientSummary,
  | "last_secret_rotated_at"
  | "last_secret_rotated_by"
  | "revoked_at"
  | "revoked_by"
  | "last_token_issued_at"
  | "last_used_at"
  | "usage_count"
  | "token_issue_count"
>;

type ReportingIntegrationClientSecretResponse = {
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
    | "integration_client.secret_created"
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
  action: "created" | "renewed";
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

function createResponseToSummary(
  body: ReportingIntegrationClientCreateResponse,
): ReportingIntegrationClientSummary {
  return {
    ...body,
    usage_count: 0,
    token_issue_count: 0,
  };
}

function latestTimestamp(client: ReportingIntegrationClientSummary) {
  const values = [
    client.last_secret_rotated_at,
    client.last_token_issued_at,
    client.last_used_at,
    client.created_at,
  ]
    .map((value) => (value ? new Date(value).getTime() : 0))
    .filter((value) => Number.isFinite(value));

  return Math.max(...values, 0);
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
    (left, right) => latestTimestamp(right) - latestTimestamp(left),
  );
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

function isErrorBody(value: unknown): value is { error: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string",
  );
}

function eventTitle(
  eventType: ReportingIntegrationClientAccessEvent["event_type"],
) {
  if (eventType === "integration_client.created") {
    return "Integration client created";
  }

  if (eventType === "integration_client.secret_created") {
    return "Client secret created";
  }

  if (eventType === "integration_client.secret_rotated") {
    return "Client secret renewed";
  }

  return "Integration client revoked";
}

function eventBody(event: ReportingIntegrationClientAccessEvent) {
  if (event.event_type === "integration_client.created") {
    return `Created ${event.client_name}. No full client secret is stored in the event log.`;
  }

  if (event.event_type === "integration_client.secret_created") {
    return `Created the first secret for ${event.client_name}.`;
  }

  if (event.event_type === "integration_client.secret_rotated") {
    return `Renewed the secret for ${event.client_name}.`;
  }

  return `Revoked ${event.client_name}. Token exchanges and business API requests for this client now fail.`;
}

function ClientReadOnlyField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={
          mono
            ? "mt-1 break-all font-mono text-xs text-foreground"
            : "mt-1 break-words text-sm text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

function ClientStatusField({
  status,
  hasClientSecret,
}: {
  status: ReportingIntegrationClientSummary["status"];
  hasClientSecret: boolean;
}) {
  const isRevoked = status === "revoked";

  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        Client status
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant={isRevoked ? "destructive" : "success"}>{status}</Badge>
        <Badge variant={hasClientSecret ? "secondary" : "warning"}>
          {hasClientSecret ? "secret generated" : "secret required"}
        </Badge>
      </div>
    </div>
  );
}

function ClientIdField({
  clientId,
  isCopied = false,
  onCopy,
}: {
  clientId: string;
  isCopied?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        Client ID
      </p>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <code className="block min-w-0 overflow-x-auto break-all rounded-md bg-muted/60 px-2 py-1 text-xs text-foreground">
          {clientId}
        </code>
        {onCopy ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onCopy}
            aria-label="Copy client ID"
          >
            {isCopied ? <Check /> : <Copy />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ReportingIntegrationClientPanel() {
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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [draftClientName, setDraftClientName] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [hasLoadedEvents, setHasLoadedEvents] = useState(false);
  const [isPreviousClientsOpen, setIsPreviousClientsOpen] = useState(false);
  const [isEventLogOpen, setIsEventLogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<"id" | "secret" | null>(null);

  const activeClients = useMemo(
    () => clients.filter((client) => client.status === "active"),
    [clients],
  );
  const currentClient = activeClients[0] ?? null;
  const previousClients = useMemo(
    () =>
      clients.filter((client) => client.client_id !== currentClient?.client_id),
    [clients, currentClient],
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
      setHasLoadedEvents(true);
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
    const tasks = [loadClients()];
    if (isEventLogOpen) {
      tasks.push(loadEvents());
    }

    await Promise.all(tasks);
  }

  useEffect(() => {
    void loadClients();
  }, []);

  function toggleEventLog() {
    const nextOpen = !isEventLogOpen;
    setIsEventLogOpen(nextOpen);
    if (nextOpen && !hasLoadedEvents && !isLoadingEvents) {
      void loadEvents();
    }
  }

  async function createClient(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (currentClient) {
      setCreateDialogOpen(false);
      toast.error("Revoke the active client before creating a new one.");
      return;
    }

    const name = draftClientName.trim();
    if (!name) {
      toast.error("Integration name is required.");
      return;
    }

    setIsCreating(true);
    setError(null);

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

      const client = createResponseToSummary(
        body as ReportingIntegrationClientCreateResponse,
      );
      setClients((current) => mergeClients(current, [client]));
      setCreateDialogOpen(false);
      setDraftClientName("");
      toast.success(
        "Integration client created. Generate a secret to enable it.",
      );
      if (isEventLogOpen) {
        void loadEvents();
      }
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

  async function generateOrRenewSecret(
    client: ReportingIntegrationClientSummary,
  ) {
    const isFirstSecret = !client.has_client_secret;
    const actionKey = `secret:${client.client_id}`;
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
          isErrorBody(body) ? body.error : "Could not generate client secret.",
        );
      }

      const result = body as ReportingIntegrationClientSecretResponse;
      setClients((current) => mergeClients(current, [result.client]));
      setRevealedSecret({
        action: isFirstSecret ? "created" : "renewed",
        client: result.client,
        client_secret: result.client_secret,
      });
      toast.success(
        isFirstSecret ? "Client secret created." : "Client secret renewed.",
      );
      if (isEventLogOpen) {
        void loadEvents();
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not generate client secret.";
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
      if (revealedSecret?.client.client_id === client.client_id) {
        setRevealedSecret(null);
      }
      toast.success("Integration client revoked.");
      if (isEventLogOpen) {
        void loadEvents();
      }
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

  function SecretActionDialog({
    client,
    compact = false,
  }: {
    client: ReportingIntegrationClientSummary;
    compact?: boolean;
  }) {
    const isFirstSecret = !client.has_client_secret;
    const actionKey = `secret:${client.client_id}`;
    const label = isFirstSecret ? "Create secret" : "Renew secret";

    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant={isFirstSecret ? "default" : "outline"}
            size={compact ? "sm" : "default"}
            disabled={client.status === "revoked" || pendingAction !== null}
          >
            {isFirstSecret ? <Plus /> : <RefreshCw />}
            {label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isFirstSecret
                ? `Create secret for ${client.name}?`
                : `Renew secret for ${client.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isFirstSecret
                ? "This generates the one-time client_secret required for token exchange. Copy it when it appears; the full value will not be available later."
                : "This replaces the current client_secret. The old secret stops working for new token exchanges. Existing access tokens can keep working until their 24-hour expiration."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void generateOrRenewSecret(client)}
              disabled={pendingAction === actionKey}
            >
              {pendingAction === actionKey ? "Working" : label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  function RevokeDialog({
    client,
    compact = false,
  }: {
    client: ReportingIntegrationClientSummary;
    compact?: boolean;
  }) {
    const actionKey = `revoke:${client.client_id}`;

    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            size={compact ? "sm" : "default"}
            disabled={client.status === "revoked" || pendingAction !== null}
          >
            <Ban />
            Revoke
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this client?</AlertDialogTitle>
            <AlertDialogDescription>
              Continue only if this integration should permanently lose API
              access, for example because its secret may have been exposed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            Revoking <span className="font-medium">{client.name}</span> blocks
            new token exchanges and makes existing access tokens for this client
            fail immediately. This action cannot be undone.
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void revokeClient(client)}
              disabled={pendingAction === actionKey}
            >
              {pendingAction === actionKey ? "Revoking" : "Revoke client"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <div className="space-y-8">
      <section className="border-b pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Active client</h2>
            </div>
          </div>

          {!isLoadingClients && !currentClient ? (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button">
                  <Plus />
                  Create client
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={createClient}>
                  <DialogHeader>
                    <DialogTitle>Create integration client</DialogTitle>
                    <DialogDescription>
                      Name the external backend or partner that will use this
                      client. The secret is generated separately after creation.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mt-4">
                    <Label htmlFor="reporting-client-name">Client name</Label>
                    <Input
                      id="reporting-client-name"
                      className="mt-2"
                      value={draftClientName}
                      onChange={(event) =>
                        setDraftClientName(event.target.value)
                      }
                      disabled={isCreating}
                      autoFocus
                    />
                  </div>
                  <DialogFooter className="mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateDialogOpen(false)}
                      disabled={isCreating}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isCreating || !draftClientName.trim()}
                    >
                      {isCreating ? "Creating" : "Create client"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-4">
          {isLoadingClients && !clients.length ? (
            <p className="border-l pl-3 text-sm text-muted-foreground">
              Loading integration clients.
            </p>
          ) : currentClient ? (
            <div>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  <ClientReadOnlyField
                    label="Client name"
                    value={currentClient.name}
                  />
                  <ClientStatusField
                    status={currentClient.status}
                    hasClientSecret={currentClient.has_client_secret}
                  />
                  <ClientIdField
                    clientId={currentClient.client_id}
                    isCopied={copiedField === "id"}
                    onCopy={() => copyValue("id", currentClient.client_id)}
                  />
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <SecretActionDialog client={currentClient} />
                  <RevokeDialog client={currentClient} />
                </div>
              </div>

              <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ClientReadOnlyField
                  label="quota"
                  value={`${currentClient.quota.limit} requests / ${currentClient.quota.window_seconds}s`}
                />
                <ClientReadOnlyField
                  label="created by"
                  value={currentClient.created_by.email}
                />
                <ClientReadOnlyField
                  label="created"
                  value={formatDate(currentClient.created_at)}
                />
                <ClientReadOnlyField
                  label="last secret event"
                  value={formatDate(currentClient.last_secret_rotated_at)}
                />
                <ClientReadOnlyField
                  label="tokens issued"
                  value={String(currentClient.token_issue_count)}
                />
                <ClientReadOnlyField
                  label="requests accepted"
                  value={String(currentClient.usage_count)}
                />
              </dl>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Scopes
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {currentClient.scopes.map((scope) => (
                    <Badge key={scope} variant="outline">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="border-l pl-3">
              <p className="text-sm font-medium">No active client</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create an integration client first, then generate its secret in
                a separate step.
              </p>
            </div>
          )}
        </div>
      </section>

      {revealedSecret ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-5 shadow-sm dark:border-amber-300/30 dark:bg-amber-400/10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-amber-950 dark:text-amber-100">
                  {revealedSecret.action === "created"
                    ? "Client secret created"
                    : "Client secret renewed"}
                </h2>
                <Badge variant="warning">One-time reveal</Badge>
              </div>
              <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-100/80">
                Copy this secret now. It will not be accessible again from the
                backoffice after this message is dismissed or the page reloads.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRevealedSecret(null)}
            >
              Dismiss
            </Button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <ClientReadOnlyField
              label="client_id"
              value={revealedSecret.client.client_id}
              mono
            />
            <div className="min-w-0 rounded-md border bg-background p-3">
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
        </section>
      ) : null}

      <section className="border-b pb-6">
        <h2 className="text-base font-semibold">Secret recovery</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          If a partner loses the secret, use <code>Renew secret</code> on the
          active client. The <code>client_id</code>, scopes, quota, and event
          history stay the same. The previous <code>client_secret</code> stops
          minting new access tokens; already issued access tokens can keep
          working until their 24-hour expiration.
        </p>
      </section>

      <section className="border-b pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 items-start gap-2 text-left"
            onClick={() => setIsPreviousClientsOpen((open) => !open)}
            aria-expanded={isPreviousClientsOpen}
          >
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-base font-semibold">
                  Previous clients
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    isPreviousClientsOpen ? "rotate-180" : ""
                  }`}
                />
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {previousClients.length} loaded. Current active client is shown
                above.
              </span>
            </span>
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshAccessState()}
            disabled={isLoadingClients || (isEventLogOpen && isLoadingEvents)}
          >
            <RotateCcw />
            Refresh
          </Button>
        </div>

        {isPreviousClientsOpen ? (
          <>
            <div className="mt-4 space-y-3">
              {!isLoadingClients && !previousClients.length ? (
                <p className="border-l pl-3 text-sm text-muted-foreground">
                  No previous clients to show.
                </p>
              ) : null}

              {previousClients.map((client) => (
                <article
                  key={client.client_id}
                  className="border-t py-4 first:border-t-0"
                >
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      <ClientReadOnlyField
                        label="Client name"
                        value={client.name}
                      />
                      <ClientStatusField
                        status={client.status}
                        hasClientSecret={client.has_client_secret}
                      />
                      <ClientIdField clientId={client.client_id} />
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <SecretActionDialog client={client} compact />
                      <RevokeDialog client={client} compact />
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <ClientReadOnlyField
                      label="quota"
                      value={`${client.quota.limit} / ${client.quota.window_seconds}s`}
                    />
                    <ClientReadOnlyField
                      label="last token"
                      value={formatDate(client.last_token_issued_at)}
                    />
                    <ClientReadOnlyField
                      label="last request"
                      value={formatDate(client.last_used_at)}
                    />
                  </dl>

                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground lg:grid-cols-3">
                    <p>Created by {client.created_by.email}</p>
                    <p>Created at {formatDate(client.created_at)}</p>
                    {client.last_secret_rotated_at ? (
                      <p>
                        Secret event by {client.last_secret_rotated_by?.email}{" "}
                        at {formatDate(client.last_secret_rotated_at)}
                      </p>
                    ) : null}
                    {client.revoked_at ? (
                      <p className="text-destructive">
                        Revoked by {client.revoked_by?.email} at{" "}
                        {formatDate(client.revoked_at)}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
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
          </>
        ) : null}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 items-start gap-2 text-left"
            onClick={toggleEventLog}
            aria-expanded={isEventLogOpen}
          >
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-base font-semibold">Event log</span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    isEventLogOpen ? "rotate-180" : ""
                  }`}
                />
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                API access-management events. Expand to load the log.
              </span>
            </span>
          </button>
          <Badge variant="outline">
            {hasLoadedEvents ? `${events.length} loaded` : "Not loaded"}
          </Badge>
        </div>

        {isEventLogOpen ? (
          <>
            <div className="mt-4 space-y-3">
              {isLoadingEvents && !events.length ? (
                <p className="border-l pl-3 text-sm text-muted-foreground">
                  Loading API access events.
                </p>
              ) : null}

              {!isLoadingEvents && hasLoadedEvents && !events.length ? (
                <p className="border-l pl-3 text-sm text-muted-foreground">
                  No API access events have been recorded yet.
                </p>
              ) : null}

              {events.map((event) => (
                <article
                  key={event.id}
                  className="grid gap-3 border-t py-4 first:border-t-0 lg:grid-cols-[10rem_minmax(0,1fr)]"
                >
                  <time className="text-xs text-muted-foreground">
                    {formatDate(event.occurred_at)}
                  </time>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">
                        {eventTitle(event.event_type)}
                      </p>
                      <Badge variant="secondary">{event.actor.email}</Badge>
                      {event.event_type === "integration_client.revoked" ? (
                        <Badge variant="destructive">revoked</Badge>
                      ) : null}
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
          </>
        ) : null}
      </section>
    </div>
  );
}
