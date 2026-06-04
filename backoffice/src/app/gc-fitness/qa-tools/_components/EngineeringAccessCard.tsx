"use client";

// EngineeringAccessCard — Plan 20-08.
//
// Engineering-only admin affordance on /gc-fitness/qa-tools. Lets an
// existing engineering trainer grant/revoke the `engineering` claim by
// email. The Server Actions enforce the gate; this component is just the
// form + list. router.refresh() after each mutation re-hydrates the SSR
// list.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  grantEngineering,
  revokeEngineering,
  type EngineeringUserRow,
} from "@/lib/gc-fitness/engineering-actions";

export function EngineeringAccessCard({
  initialUsers,
  currentUid,
}: {
  initialUsers: EngineeringUserRow[];
  currentUid: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  function onGrant() {
    const trimmed = email.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const result = await grantEngineering({ email: trimmed });
        toast.success(`Engineering granted to ${result.email}.`);
        setEmail("");
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Grant failed.";
        toast.error(message);
      }
    });
  }

  function onRevoke(uid: string, label: string) {
    if (uid === currentUid) {
      toast.error("Refusing to revoke your own engineering claim.");
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Revoke engineering access from ${label}?`,
      );
      if (!confirmed) return;
    }
    startTransition(async () => {
      try {
        await revokeEngineering({ uid });
        toast.success(`Engineering revoked from ${label}.`);
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Revoke failed.";
        toast.error(message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Engineering access</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Engineering trainers see the QA Tools panel + future log-proxy
          surfaces. Self-revoke is blocked.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">Trainer email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="trainer@example.com"
              className="h-10 min-w-64 rounded-xl border bg-background px-3 text-sm"
              disabled={pending}
            />
          </label>
          <Button
            type="button"
            variant="default"
            className="rounded-full"
            onClick={onGrant}
            disabled={pending || email.trim().length === 0}
          >
            Grant
          </Button>
        </div>

        <ul className="flex flex-col gap-2">
          {initialUsers.length === 0 ? (
            <li className="text-sm text-muted-foreground">
              No engineering trainers yet (besides whoever bootstrapped you
              via Admin SDK).
            </li>
          ) : (
            initialUsers.map((user) => {
              const label = user.email ?? user.displayName ?? user.uid;
              const isSelf = user.uid === currentUid;
              return (
                <li
                  key={user.uid}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-sm"
                >
                  <Badge variant="secondary" className="font-mono text-xs">
                    {user.uid.slice(0, 10)}…
                  </Badge>
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm">
                      {user.email ?? "(no email on doc)"}
                    </span>
                    {user.displayName ? (
                      <span className="text-xs text-muted-foreground">
                        {user.displayName}
                      </span>
                    ) : null}
                  </div>
                  {isSelf ? (
                    <Badge variant="outline" className="text-xs">
                      you
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(user.uid, label)}
                      disabled={pending}
                      className="text-destructive hover:text-destructive"
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
