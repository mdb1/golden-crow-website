"use client";

import { useState } from "react";
import { Copy, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReportingApiTokenRevealProps = {
  token: string;
};

export function ReportingApiTokenReveal({
  token,
}: ReportingApiTokenRevealProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border bg-muted/25 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={isRevealed ? "outline" : "default"}
          size="sm"
          onClick={() => setIsRevealed((current) => !current)}
        >
          {isRevealed ? <EyeOff /> : <KeyRound />}
          {isRevealed ? "Hide API Key" : "Obtain API Key"}
        </Button>
        {isRevealed ? (
          <Button type="button" variant="outline" size="sm" onClick={copyToken}>
            <Copy />
            {copied ? "Copied" : "Copy"}
          </Button>
        ) : null}
      </div>

      {isRevealed ? (
        <code className="mt-3 block overflow-x-auto break-all rounded-md bg-background px-3 py-2 text-xs text-foreground">
          {token}
        </code>
      ) : null}
    </div>
  );
}
