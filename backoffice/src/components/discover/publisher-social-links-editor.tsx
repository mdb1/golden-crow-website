"use client";

import Image from "next/image";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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

const SOCIAL_ASSET_BASE = "/discover/social-network-assets";

type SocialOption = {
  key: DiscoverPublisherSocialKey;
  label: string;
  placeholder: string;
  assetName: string;
};

const SOCIAL_OPTIONS: readonly SocialOption[] = [
  {
    key: "facebook",
    label: "Facebook profile",
    placeholder: "https://facebook.com/...",
    assetName: "facebook",
  },
  {
    key: "twitter",
    label: "X / Twitter profile",
    placeholder: "https://x.com/...",
    assetName: "x-twitter",
  },
  {
    key: "instagram",
    label: "Instagram profile",
    placeholder: "https://instagram.com/...",
    assetName: "instagram",
  },
  {
    key: "tiktok",
    label: "TikTok profile",
    placeholder: "https://tiktok.com/@...",
    assetName: "tiktok",
  },
  {
    key: "youtube",
    label: "YouTube channel",
    placeholder: "https://youtube.com/@...",
    assetName: "youtube",
  },
  {
    key: "linkedin",
    label: "LinkedIn profile",
    placeholder: "https://linkedin.com/in/...",
    assetName: "linkedin",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    placeholder: "https://wa.me/...",
    assetName: "whatsapp",
  },
  {
    key: "telegram",
    label: "Telegram",
    placeholder: "https://t.me/...",
    assetName: "telegram",
  },
  {
    key: "threads",
    label: "Threads profile",
    placeholder: "https://threads.net/@...",
    assetName: "threads",
  },
  {
    key: "pinterest",
    label: "Pinterest profile",
    placeholder: "https://pinterest.com/...",
    assetName: "pinterest",
  },
  {
    key: "snapchat",
    label: "Snapchat profile",
    placeholder: "https://snapchat.com/add/...",
    assetName: "snapchat",
  },
  {
    key: "reddit",
    label: "Reddit profile",
    placeholder: "https://reddit.com/u/...",
    assetName: "reddit",
  },
  {
    key: "discord",
    label: "Discord server",
    placeholder: "https://discord.gg/...",
    assetName: "discord",
  },
  {
    key: "twitch",
    label: "Twitch channel",
    placeholder: "https://twitch.tv/...",
    assetName: "twitch",
  },
  {
    key: "bluesky",
    label: "Bluesky profile",
    placeholder: "https://bsky.app/profile/...",
    assetName: "bluesky",
  },
  {
    key: "mastodon",
    label: "Mastodon profile",
    placeholder: "https://mastodon.social/@...",
    assetName: "mastodon",
  },
  {
    key: "email",
    label: "Contact email",
    placeholder: "contact@example.org",
    assetName: "email",
  },
  {
    key: "other",
    label: "Other link",
    placeholder: "https://...",
    assetName: "other-link",
  },
] as const;

function socialAssetSrc(assetName: string) {
  return `${SOCIAL_ASSET_BASE}/${assetName}.png`;
}

function SocialOptionIcon({ option }: { option: SocialOption }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-black/10">
      <Image
        src={socialAssetSrc(option.assetName)}
        alt=""
        width={36}
        height={36}
        aria-hidden="true"
        draggable={false}
        unoptimized
        className="size-9 rounded-full object-contain"
      />
    </span>
  );
}

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
            return (
              <div
                key={option.key}
                className="grid gap-2 rounded-md border border-border bg-background p-2 md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-center"
              >
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <SocialOptionIcon option={option} />
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
        <DialogContent className="p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>{t("Choose social network")}</DialogTitle>
            <DialogDescription>
              {t("Select a social network to add one optional link.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 px-5 py-4 sm:grid-cols-2">
            {availableOptions.map((option) => {
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => addSocial(option)}
                  className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-background px-3 py-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/60"
                >
                  <SocialOptionIcon option={option} />
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
