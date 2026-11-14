"use client";

// command-palette.tsx — #496: ⌘K / Ctrl+K jumps anywhere in the coach portal.
//
// Mounted once by `GCFitnessShell` (so it exists on every coach page and never
// on login / forbidden / wiki, where the shell is hidden). Two parts:
//   - `CommandPaletteProvider` owns the open state, the global shortcut and the
//     dialog;
//   - `CommandPaletteTrigger` is a visible button for mouse / touch users (the
//     shortcut alone is undiscoverable and unusable on a phone).
//
// Data: static pages (always, no fetch) + an index of clients / chats /
// workouts / exercises fetched LAZILY through `getCommandPaletteIndex` the
// first time the palette opens, then kept for 5 min by React Query. Filtering
// is ours (`shouldFilter={false}`): cmdk's built-in filter would render every
// one of ~2k rows; we render at most PALETTE_GROUP_LIMIT per group.

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Dumbbell,
  FileText,
  MessagesSquare,
  Search,
  User,
  type LucideIcon,
} from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCommandPaletteIndex } from "@/lib/gc-fitness/command-palette-actions";
import {
  localizedPaletteName,
  matchesQuery,
  paletteHref,
  PALETTE_GROUP_LIMIT,
  type CommandPaletteIndex,
} from "@/lib/gc-fitness/command-palette-index";

type PaletteContextValue = { open: boolean; setOpen: (open: boolean) => void };
const PaletteContext = React.createContext<PaletteContextValue | null>(null);

export const COMMAND_PALETTE_QUERY_KEY = ["gc-fitness", "command-palette-index"] as const;

type Entry = { key: string; label: string; detail?: string; href: string; icon: LucideIcon };

function usePageEntries(isAdmin: boolean): Entry[] {
  const tNav = useTranslations("nav");
  return React.useMemo(() => {
    // Literal keys on purpose: the i18n test checks them (a `tNav(key)` loop
    // would be "dynamic" and unchecked).
    const pages: Array<[string, string]> = [
      ["/gc-fitness/dashboard", tNav("dashboard")],
      ["/gc-fitness/schedule", tNav("schedule")],
      ["/gc-fitness/checklist", tNav("checklist")],
      ["/gc-fitness/notifications", tNav("notifications")],
      ["/gc-fitness/clients", tNav("clients")],
      ["/gc-fitness/chat", tNav("chat")],
      ["/gc-fitness/challenges", tNav("challenges")],
      ["/gc-fitness/payments", tNav("payments")],
      ["/gc-fitness/library", tNav("library")],
      ["/gc-fitness/templates", tNav("workouts")],
      ["/gc-fitness/exercises", tNav("exercises")],
      ["/gc-fitness/habits", tNav("habits")],
      ["/gc-fitness/settings", tNav("settings")],
    ];
    if (isAdmin) pages.push(["/gc-fitness/admin", tNav("adminPanel")]);
    return pages.map(([href, label]) => ({ key: `page:${href}`, label, href, icon: FileText }));
  }, [tNav, isAdmin]);
}

export function CommandPaletteProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      setOpen((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog open={open} onOpenChange={setOpen} isAdmin={isAdmin} />
    </PaletteContext.Provider>
  );
}

function CommandPaletteDialog({
  open,
  onOpenChange,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}) {
  const t = useTranslations("commandPalette");
  const locale = useLocale();
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const pages = usePageEntries(isAdmin);

  const indexQuery = useQuery({
    queryKey: COMMAND_PALETTE_QUERY_KEY,
    queryFn: async (): Promise<CommandPaletteIndex> => {
      const result = await getCommandPaletteIndex();
      if (!result.ok) throw new Error(result.error);
      return result.index;
    },
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  });

  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const groups = React.useMemo(() => {
    const index = indexQuery.data;
    const limit = (entries: Entry[]) => entries.slice(0, PALETTE_GROUP_LIMIT);
    const query = search.trim();
    const pageHits = pages.filter((p) => matchesQuery(query, p.label));
    if (!index) return { pages: pageHits, clients: [], chats: [], templates: [], exercises: [] };

    const clientHits = index.clients.filter((c) => matchesQuery(query, c.name, c.email));
    const clients: Entry[] = clientHits.map((c) => ({
      key: `client:${c.id}`,
      label: c.name,
      detail: c.email,
      href: paletteHref.client(c.id),
      icon: User,
    }));
    const chats: Entry[] = clientHits.map((c) => ({
      key: `chat:${c.id}`,
      label: t("chatWith", { name: c.name }),
      href: paletteHref.chat(c.id),
      icon: MessagesSquare,
    }));
    const named = (
      rows: CommandPaletteIndex["templates"],
      prefix: string,
      href: (id: string) => string,
      icon: LucideIcon,
    ): Entry[] =>
      rows
        .filter((r) => matchesQuery(query, r.name.en, r.name.es))
        .map((r) => ({
          key: `${prefix}:${r.id}`,
          label: localizedPaletteName(r.name, locale) || r.id,
          href: href(r.id),
          icon,
        }));
    return {
      pages: pageHits,
      // Nothing typed yet: pages plus a few clients, so the list is useful
      // without becoming a 2k-row wall.
      clients: limit(clients),
      chats: query ? limit(chats) : [],
      templates: query ? limit(named(index.templates, "template", paletteHref.template, FileText)) : [],
      exercises: query ? limit(named(index.exercises, "exercise", paletteHref.exercise, Dumbbell)) : [],
    };
  }, [indexQuery.data, pages, search, locale, t]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const renderGroup = (heading: string, entries: Entry[]) =>
    entries.length === 0 ? null : (
      <CommandGroup heading={heading}>
        {entries.map((entry) => (
          <CommandItem key={entry.key} value={entry.key} onSelect={() => go(entry.href)}>
            <entry.icon className="size-4" aria-hidden />
            <span className="truncate">{entry.label}</span>
            {entry.detail ? (
              <span className="ml-auto truncate text-xs text-muted-foreground">{entry.detail}</span>
            ) : null}
          </CommandItem>
        ))}
      </CommandGroup>
    );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
    >
      <Command shouldFilter={false} label={t("title")}>
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder={t("placeholder")}
          aria-label={t("inputLabel")}
        />
        <CommandList>
          {indexQuery.isLoading ? null : <CommandEmpty>{t("empty")}</CommandEmpty>}
          {renderGroup(t("groupPages"), groups.pages)}
          {renderGroup(t("groupClients"), groups.clients)}
          {renderGroup(t("groupChats"), groups.chats)}
          {renderGroup(t("groupTemplates"), groups.templates)}
          {renderGroup(t("groupExercises"), groups.exercises)}
        </CommandList>
        {indexQuery.isLoading ? (
          <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
            {t("loading")}
          </p>
        ) : indexQuery.isError ? (
          <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
            {t("loadError")}
          </p>
        ) : null}
      </Command>
    </CommandDialog>
  );
}

/** Visible entry point for mouse / touch; shows the shortcut on desktop. */
export function CommandPaletteTrigger({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("commandPalette");
  const context = React.useContext(PaletteContext);
  const [shortcut, setShortcut] = React.useState("Ctrl K");
  React.useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) setShortcut("⌘K");
  }, []);
  if (!context) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "sm"}
      aria-label={t("triggerLabel")}
      aria-keyshortcuts="Control+K Meta+K"
      onClick={() => context.setOpen(true)}
      className={cn(
        compact ? "" : "w-full justify-start gap-2 text-muted-foreground",
        className,
      )}
    >
      <Search className="size-4" aria-hidden />
      {compact ? null : (
        <>
          <span>{t("trigger")}</span>
          <CommandShortcut>{shortcut}</CommandShortcut>
        </>
      )}
    </Button>
  );
}
