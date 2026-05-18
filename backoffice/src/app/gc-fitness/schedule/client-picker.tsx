"use client";

// client-picker.tsx
//
// Renders the trainer's client roster as a list of links to
// /gc-fitness/schedule?clientId=<uid>. Server Component owns the roster
// fetch; this client component renders the interactive list.

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ClientRosterEntry } from "@/lib/gc-fitness/client-roster";

interface ClientPickerProps {
  clients: ClientRosterEntry[];
}

export function ClientPicker({ clients }: ClientPickerProps) {
  if (clients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No clients yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Once your clients sign in via the iOS app, they&rsquo;ll appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a client</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {clients.map((c) => (
            <li key={c.uid}>
              <Button
                variant="ghost"
                className="w-full justify-start"
                asChild
              >
                <Link href={`/gc-fitness/schedule?clientId=${c.uid}`}>
                  <span className="font-medium">{c.displayName}</span>
                  {c.email && c.email !== c.displayName ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.email}
                    </span>
                  ) : null}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
