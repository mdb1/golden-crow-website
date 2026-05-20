"use client";

// QuickReplyDropdown.tsx — chat input sibling that surfaces the trainer's
// saved chatQuickReplies templates as a one-tap-insert menu.
//
// Closes CHAT-11 (the consumer half of the P08-05 + P08-12 quick-reply
// pipeline). Author surface is the P08-12 Settings form
// (`/gc-fitness/settings`); the trainer manages the list there and it
// shows up here.
//
// ── Data flow ─────────────────────────────────────────────────────────
// React Query → `getCurrentTrainerProfile` Server Action (P08-12 Task 1)
// → `chatQuickReplies: string[]`. Cached for 60s; queryKey
// `["gc-fitness", "trainer-profile"]` so a future
// `queryClient.invalidateQueries` from the Settings form (V2 carry-forward,
// see must_haves.truths in PLAN 08-12) can refresh without page reload.
//
// V1 fallback (also documented in PLAN.md): after a save in Settings the
// form does `router.refresh()`, but THAT only refreshes Server Components
// — this dropdown lives inside the chat client component tree and won't
// see new templates until the 60s staleTime expires OR the trainer
// navigates between routes. The trainer can force a refresh by clicking
// "Manage quick replies" → coming back. Documented trade-off; React Query
// invalidation from Settings is a V2 enhancement.
//
// ── Tap-to-insert (NOT auto-send) ─────────────────────────────────────
// `onSelect(reply)` ships the raw template text up to MessageInput.
// MessageInput appends it to the textarea (does NOT submit) so the
// trainer can edit before sending. This matches Strong/Hevy-style UX:
// quick-reply is a starting point, not a send shortcut.
//
// ── Empty state ───────────────────────────────────────────────────────
// If the trainer has no templates, show an empty-state link to Settings
// instead of an empty menu (the trigger button is still tappable so the
// affordance is discoverable).
//
// ── XSS posture (T-08-12-03) ──────────────────────────────────────────
// Reply text is rendered into React's escaped text content (`{reply}`),
// NEVER `dangerouslySetInnerHTML`. The same posture holds in the textarea
// (controlled value is plain text). React's default escaping is sufficient.

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

import { getCurrentTrainerProfile } from "@/lib/gc-fitness/user-actions";

export interface QuickReplyDropdownProps {
  /** Invoked with the selected template's raw text. Caller appends to input. */
  onSelect: (text: string) => void;
  /** Optional — disable the trigger while the parent input is submitting. */
  disabled?: boolean;
}

export function QuickReplyDropdown({
  onSelect,
  disabled,
}: QuickReplyDropdownProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["gc-fitness", "trainer-profile"],
    queryFn: () => getCurrentTrainerProfile(),
    staleTime: 60_000,
  });

  const replies = data?.chatQuickReplies ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Insert quick reply"
          disabled={disabled}
        >
          <MessageSquareText className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        className="max-h-72 w-80 overflow-y-auto"
      >
        <DropdownMenuLabel>Quick replies</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading && (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            Loading…
          </div>
        )}
        {!isLoading && replies.length === 0 && (
          <div className="flex flex-col gap-2 px-2 py-3 text-sm">
            <p className="text-muted-foreground">
              No quick replies yet.
            </p>
            <Link
              href="/gc-fitness/settings"
              className="text-primary underline underline-offset-4"
            >
              Manage quick replies →
            </Link>
          </div>
        )}
        {replies.map((reply, idx) => (
          // React's default escaping makes `{reply}` safe (T-08-12-03);
          // no dangerouslySetInnerHTML anywhere on this path.
          <DropdownMenuItem
            key={idx}
            onSelect={() => onSelect(reply)}
            className="cursor-pointer"
          >
            <span className="line-clamp-2 whitespace-pre-wrap text-sm">
              {reply}
            </span>
          </DropdownMenuItem>
        ))}
        {!isLoading && replies.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="/gc-fitness/settings"
                className="text-xs text-muted-foreground"
              >
                Manage quick replies →
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
