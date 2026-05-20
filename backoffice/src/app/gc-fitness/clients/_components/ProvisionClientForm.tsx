"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelperBanner } from "@/components/helper-banner";
import { provisionClient } from "@/lib/gc-fitness/user-actions";

export function ProvisionClientForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Add client</CardTitle>
        <CardDescription>
          Attach an existing app user or pre-create access for a new email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            setError(null);
            startTransition(async () => {
              try {
                const result = await provisionClient({
                  email,
                  displayName: displayName || undefined,
                });
                setEmail("");
                setDisplayName("");
                setMessage(
                  result.mode === "attached-existing-user"
                    ? "Client attached to your roster."
                    : "Client pre-created. They will attach on first sign-in.",
                );
                router.refresh();
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not add client.",
                );
              }
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="client-name">Name</Label>
            <Input
              id="client-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <Button type="submit" disabled={isPending} className="self-end gap-2">
            <UserPlus className="size-4" />
            {isPending ? "Adding..." : "Add client"}
          </Button>
        </form>
        {message ? (
          <div className="mt-3">
            <HelperBanner title="Client ready" tone="green">
              {message}
            </HelperBanner>
          </div>
        ) : null}
        {error ? (
          <div className="mt-3">
            <HelperBanner title="Add client failed" tone="red">
              {error}
            </HelperBanner>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
