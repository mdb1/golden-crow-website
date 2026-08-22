"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ReportingAccessTokenResponse = {
  token: string;
  tokenType: "Bearer";
  expiresAt: string;
  expiresInSeconds: number;
  quota: {
    limit: number;
    windowSeconds: number;
  };
  issuedTo?: {
    uid: string;
    email: string;
  };
};

function formatExpiry(value: string) {
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

export function ReportingAccessTokenPanel() {
  const [tokenResponse, setTokenResponse] =
    useState<ReportingAccessTokenResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function issueToken() {
    setIsLoading(true);
    setError(null);
    setCopied(false);

    try {
      const response = await fetch("/api/open-api/reporting/tokens", {
        method: "POST",
      });
      const body = await parseResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Could not obtain access token.",
        );
      }

      setTokenResponse(body as ReportingAccessTokenResponse);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not obtain access token.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshToken() {
    if (!tokenResponse?.token) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setCopied(false);

    try {
      const response = await fetch("/open-api/auth/token/refresh", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResponse.token}`,
        },
      });
      const body = await parseResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Could not refresh access token.",
        );
      }

      setTokenResponse(body as ReportingAccessTokenResponse);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not refresh access token.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyToken() {
    if (!tokenResponse?.token) {
      return;
    }

    try {
      await navigator.clipboard.writeText(tokenResponse.token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border bg-muted/25 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={issueToken}
          disabled={isLoading}
        >
          <KeyRound />
          {isLoading && !tokenResponse ? "Obtaining" : "Obtain token"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={refreshToken}
          disabled={isLoading || !tokenResponse}
        >
          <RefreshCw />
          Refresh token
        </Button>
        {tokenResponse ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyToken}
            disabled={isLoading}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy token"}
          </Button>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {tokenResponse ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Expires in 24 hours</Badge>
            <Badge variant="outline">
              {tokenResponse.quota.limit} requests /{" "}
              {tokenResponse.quota.windowSeconds}s
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Expires
              </p>
              <p className="mt-2 text-sm text-foreground">
                {formatExpiry(tokenResponse.expiresAt)}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Token type
              </p>
              <p className="mt-2 text-sm text-foreground">
                {tokenResponse.tokenType}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Issued to
              </p>
              <p className="mt-2 truncate text-sm text-foreground">
                {tokenResponse.issuedTo?.email ?? "Current admin"}
              </p>
            </div>
          </div>
          <code className="block overflow-x-auto break-all rounded-md bg-background px-3 py-2 text-xs text-foreground">
            {tokenResponse.token}
          </code>
        </div>
      ) : null}
    </div>
  );
}
