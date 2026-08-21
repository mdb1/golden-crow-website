"use client";

import { useState, type ReactElement } from "react";
import { AtSign, Globe, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  DiscoverPublisherSocialKey,
  DiscoverPublisherSocialLinks,
} from "@/lib/discover";

type SocialOption = {
  key: DiscoverPublisherSocialKey;
  label: string;
  placeholder: string;
  icon: (props: { className?: string }) => ReactElement;
};

function BrandIcon({
  label,
  path,
  className,
}: {
  label: string;
  path: string;
  className?: string;
}) {
  return (
    <svg
      aria-label={label}
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      role="img"
    >
      <path d={path} />
    </svg>
  );
}

const SOCIAL_OPTIONS: readonly SocialOption[] = [
  {
    key: "facebook",
    label: "Facebook profile",
    placeholder: "https://facebook.com/...",
    icon: (props) => (
      <BrandIcon
        label="Facebook"
        path="M22 12.06C22 6.49 17.52 2 12 2S2 6.49 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.53 1.49-3.92 3.78-3.92 1.1 0 2.24.2 2.24.2v2.48h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22C18.34 21.24 22 17.08 22 12.06z"
        {...props}
      />
    ),
  },
  {
    key: "twitter",
    label: "X / Twitter profile",
    placeholder: "https://x.com/...",
    icon: (props) => (
      <BrandIcon
        label="X / Twitter"
        path="M18.9 2.25h3.06l-6.68 7.64 7.86 11.86h-6.15l-4.82-7.22-5.52 7.22H3.58l7.15-8.18L3.19 2.25h6.31l4.36 6.47 5.04-6.47zm-1.07 17.41h1.69L8.58 4.23H6.76l11.07 15.43z"
        {...props}
      />
    ),
  },
  {
    key: "instagram",
    label: "Instagram profile",
    placeholder: "https://instagram.com/...",
    icon: (props) => (
      <BrandIcon
        label="Instagram"
        path="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM12 7.25A4.75 4.75 0 1 1 12 16.75 4.75 4.75 0 0 1 12 7.25zm0 2A2.75 2.75 0 1 0 12 14.75 2.75 2.75 0 0 0 12 9.25z"
        {...props}
      />
    ),
  },
  {
    key: "tiktok",
    label: "TikTok profile",
    placeholder: "https://tiktok.com/@...",
    icon: (props) => (
      <BrandIcon
        label="TikTok"
        path="M16.6 2c.36 2.38 1.69 3.8 4.04 3.95v3.02c-1.36.13-2.55-.31-3.95-1.15v5.66c0 7.2-7.85 9.45-11 4.29-2.02-3.32-.78-9.15 5.71-9.38v3.19c-.44.07-.91.18-1.34.33-1.29.44-2.02 1.27-1.82 2.74.38 2.82 5.58 3.65 5.15-1.86V2h3.21z"
        {...props}
      />
    ),
  },
  {
    key: "youtube",
    label: "YouTube channel",
    placeholder: "https://youtube.com/@...",
    icon: (props) => (
      <BrandIcon
        label="YouTube"
        path="M21.58 7.19a2.74 2.74 0 0 0-1.93-1.94C17.94 4.8 12 4.8 12 4.8s-5.94 0-7.65.45a2.74 2.74 0 0 0-1.93 1.94A28.55 28.55 0 0 0 2 12a28.55 28.55 0 0 0 .42 4.81 2.74 2.74 0 0 0 1.93 1.94c1.71.45 7.65.45 7.65.45s5.94 0 7.65-.45a2.74 2.74 0 0 0 1.93-1.94A28.55 28.55 0 0 0 22 12a28.55 28.55 0 0 0-.42-4.81zM10 15.2V8.8l5.2 3.2L10 15.2z"
        {...props}
      />
    ),
  },
  {
    key: "email",
    label: "Contact email",
    placeholder: "contact@example.org",
    icon: (props) => <AtSign aria-label="Email" {...props} />,
  },
  {
    key: "other",
    label: "Other link",
    placeholder: "https://...",
    icon: (props) => <Globe aria-label="Other link" {...props} />,
  },
] as const;

export function PublisherSocialLinksEditor({
  value,
  onChange,
  t,
}: {
  value: DiscoverPublisherSocialLinks;
  onChange: (value: DiscoverPublisherSocialLinks) => void;
  t: (text: string) => string;
}) {
  const social = value;
  const selectedKeys = new Set(Object.keys(social));
  const availableOptions = SOCIAL_OPTIONS.filter(
    (option) => !selectedKeys.has(option.key),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const rows = SOCIAL_OPTIONS.filter((option) => selectedKeys.has(option.key));

  function updateSocial(
    key: DiscoverPublisherSocialKey,
    nextValue: string,
  ) {
    onChange({ ...social, [key]: nextValue });
  }

  function removeSocial(key: DiscoverPublisherSocialKey) {
    const nextSocial = { ...social };
    delete nextSocial[key];
    onChange(nextSocial);
  }

  function addSocial(option: SocialOption) {
    onChange({ ...social, [option.key]: "" });
    setPickerOpen(false);
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-3 md:col-span-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t("Social networks")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Add one optional link for each social network.")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setPickerOpen(true)}
          disabled={!availableOptions.length}
          className="self-start lg:self-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          {availableOptions.length
            ? t("Add social link")
            : t("All social networks added")}
        </Button>
      </div>

      {rows.length ? (
        <div className="grid gap-2">
          {rows.map((option) => {
            const Icon = option.icon;
            return (
              <div
                key={option.key}
                className="grid gap-2 rounded-md border border-border bg-background p-2 md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-center"
              >
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate">{t(option.label)}</span>
                </div>
                <Input
                  value={social[option.key] ?? ""}
                  onChange={(event) =>
                    updateSocial(option.key, event.target.value)
                  }
                  placeholder={option.placeholder}
                  aria-label={t(option.label)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSocial(option.key)}
                  aria-label={`${t("Remove")} ${t(option.label)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          {t("No social links added")}
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>{t("Choose social network")}</DialogTitle>
            <DialogDescription>
              {t("Select a social network to add one optional link.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 px-5 py-4 sm:grid-cols-2">
            {availableOptions.map((option) => {
              const Icon = option.icon;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => addSocial(option)}
                  className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-background px-3 py-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {t(option.label)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.placeholder}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
