"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ReportingIntegrationClientResponse = {
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
  created_by?: {
    uid: string;
    email: string;
  };
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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

export function ReportingIntegrationClientPanel() {
  const [name, setName] = useState("2PQ reporting integration");
  const [client, setClient] =
    useState<ReportingIntegrationClientResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<"id" | "secret" | null>(null);

  async function createClient() {
    setIsLoading(true);
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
          typeof body.error === "string"
            ? body.error
            : "Could not create integration client.",
        );
      }

      setClient(body as ReportingIntegrationClientResponse);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not create integration client.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyValue(field: "id" | "secret", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch {
      setCopiedField(null);
    }
  }

  return (
    <div className="mt-5 rounded-lg border bg-muted/25 p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <Label htmlFor="reporting-integration-name">Integration name</Label>
          <Input
            id="reporting-integration-name"
            className="mt-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isLoading}
          />
        </div>
        <Button
          type="button"
          onClick={createClient}
          disabled={isLoading || !name.trim()}
        >
          <Plus />
          {isLoading ? "Creating" : "Create client"}
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {client ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Status: {client.status}</Badge>
            <Badge variant="outline">
              {client.quota.limit} requests / {client.quota.window_seconds}s
            </Badge>
            <Badge variant="outline">{client.scopes.join(" ")}</Badge>
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
                  onClick={() => copyValue("id", client.client_id)}
                >
                  {copiedField === "id" ? <Check /> : <Copy />}
                  {copiedField === "id" ? "Copied" : "Copy"}
                </Button>
              </div>
              <code className="mt-2 block overflow-x-auto break-all rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground">
                {client.client_id}
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
                  onClick={() => copyValue("secret", client.client_secret)}
                >
                  {copiedField === "secret" ? <Check /> : <Copy />}
                  {copiedField === "secret" ? "Copied" : "Copy"}
                </Button>
              </div>
              <code className="mt-2 block overflow-x-auto break-all rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground">
                {client.client_secret}
              </code>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Name
              </p>
              <p className="mt-2 break-words text-sm text-foreground">
                {client.name}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Token endpoint
              </p>
              <p className="mt-2 text-sm text-foreground">
                <code>POST /open-api/oauth/token</code>
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Access token TTL
              </p>
              <p className="mt-2 text-sm text-foreground">24 hours</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Created by
              </p>
              <p className="mt-2 break-words text-sm text-foreground">
                {client.created_by?.email ?? "Current admin"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(client.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border bg-background p-3 text-sm text-muted-foreground">
            <KeyRound className="h-4 w-4 shrink-0" />
            <p>
              Store the client secret now. It is not recoverable from the
              backoffice after this result is closed.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
