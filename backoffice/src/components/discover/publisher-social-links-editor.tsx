"use client";

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
import { cn } from "@/lib/utils";

const SOCIAL_ASSET_BASE = "/discover/social-network-assets";

export type SocialOption = {
  key: DiscoverPublisherSocialKey;
  label: string;
  placeholder: string;
  assetName: string;
};

export const SOCIAL_OPTIONS: readonly SocialOption[] = [
  {
    key: "facebook",
    label: "Facebook profile",
    placeholder: "https://facebook.com/...",
    assetName: "social_facebook",
  },
  {
    key: "twitter",
    label: "X / Twitter profile",
    placeholder: "https://x.com/...",
    assetName: "social_twitter",
  },
  {
    key: "instagram",
    label: "Instagram profile",
    placeholder: "https://instagram.com/...",
    assetName: "social_instagram",
  },
  {
    key: "tiktok",
    label: "TikTok profile",
    placeholder: "https://tiktok.com/@...",
    assetName: "social_tiktok",
  },
  {
    key: "youtube",
    label: "YouTube channel",
    placeholder: "https://youtube.com/@...",
    assetName: "social_youtube",
  },
  {
    key: "linkedin",
    label: "LinkedIn profile",
    placeholder: "https://linkedin.com/in/...",
    assetName: "social_linkedin",
  },
  {
    key: "github",
    label: "GitHub profile",
    placeholder: "https://github.com/...",
    assetName: "social_github",
  },
  {
    key: "gitlab",
    label: "GitLab profile",
    placeholder: "https://gitlab.com/...",
    assetName: "social_gitlab",
  },
  {
    key: "stack_overflow",
    label: "Stack Overflow profile",
    placeholder: "https://stackoverflow.com/users/...",
    assetName: "social_stack_overflow",
  },
  {
    key: "hugging_face",
    label: "Hugging Face profile",
    placeholder: "https://huggingface.co/...",
    assetName: "social_hugging_face",
  },
  {
    key: "kaggle",
    label: "Kaggle profile",
    placeholder: "https://kaggle.com/...",
    assetName: "social_kaggle",
  },
  {
    key: "researchgate",
    label: "ResearchGate profile",
    placeholder: "https://researchgate.net/profile/...",
    assetName: "social_researchgate",
  },
  {
    key: "orcid",
    label: "ORCID",
    placeholder: "https://orcid.org/...",
    assetName: "social_orcid",
  },
  {
    key: "google_scholar",
    label: "Google Scholar profile",
    placeholder: "https://scholar.google.com/...",
    assetName: "social_google_scholar",
  },
  {
    key: "pubmed",
    label: "PubMed profile",
    placeholder: "https://pubmed.ncbi.nlm.nih.gov/...",
    assetName: "social_pubmed",
  },
  {
    key: "scopus",
    label: "Scopus profile",
    placeholder: "https://scopus.com/...",
    assetName: "social_scopus",
  },
  {
    key: "web_of_science",
    label: "Web of Science profile",
    placeholder: "https://webofscience.com/...",
    assetName: "social_web_of_science",
  },
  {
    key: "biostars",
    label: "BioStars profile",
    placeholder: "https://biostars.org/u/...",
    assetName: "social_biostars",
  },
  {
    key: "protocols_io",
    label: "protocols.io profile",
    placeholder: "https://protocols.io/...",
    assetName: "social_protocols_io",
  },
  {
    key: "osf",
    label: "OSF profile",
    placeholder: "https://osf.io/...",
    assetName: "social_osf",
  },
  {
    key: "zenodo",
    label: "Zenodo profile",
    placeholder: "https://zenodo.org/...",
    assetName: "social_zenodo",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    placeholder: "https://wa.me/...",
    assetName: "social_whatsapp",
  },
  {
    key: "telegram",
    label: "Telegram",
    placeholder: "https://t.me/...",
    assetName: "social_telegram",
  },
  {
    key: "threads",
    label: "Threads profile",
    placeholder: "https://threads.net/@...",
    assetName: "social_threads",
  },
  {
    key: "pinterest",
    label: "Pinterest profile",
    placeholder: "https://pinterest.com/...",
    assetName: "social_pinterest",
  },
  {
    key: "snapchat",
    label: "Snapchat profile",
    placeholder: "https://snapchat.com/add/...",
    assetName: "social_snapchat",
  },
  {
    key: "reddit",
    label: "Reddit profile",
    placeholder: "https://reddit.com/u/...",
    assetName: "social_reddit",
  },
  {
    key: "discord",
    label: "Discord server",
    placeholder: "https://discord.gg/...",
    assetName: "social_discord",
  },
  {
    key: "twitch",
    label: "Twitch channel",
    placeholder: "https://twitch.tv/...",
    assetName: "social_twitch",
  },
  {
    key: "bluesky",
    label: "Bluesky profile",
    placeholder: "https://bsky.app/profile/...",
    assetName: "social_bluesky",
  },
  {
    key: "mastodon",
    label: "Mastodon profile",
    placeholder: "https://mastodon.social/@...",
    assetName: "social_mastodon",
  },
  {
    key: "email",
    label: "Contact email",
    placeholder: "contact@example.org or mailto:...",
    assetName: "social_email",
  },
  {
    key: "other",
    label: "Other link",
    placeholder: "https://...",
    assetName: "social_other",
  },
] as const;

export function socialAssetSrc(assetName: string) {
  return `${SOCIAL_ASSET_BASE}/${assetName}.png`;
}

export function SocialAssetIcon({
  option,
  className,
  imageClassName,
  size = 40,
}: {
  option: SocialOption;
  className?: string;
  imageClassName?: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm ring-1 ring-black/5",
        className,
      )}
      style={{
        height: size,
        maxHeight: size,
        maxWidth: size,
        minHeight: size,
        minWidth: size,
        width: size,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={socialAssetSrc(option.assetName)}
        alt=""
        width={size}
        height={size}
        aria-hidden="true"
        draggable={false}
        className={cn("block rounded-[inherit]", imageClassName)}
        style={{
          display: "block",
          height: "100%",
          objectFit: "contain",
          width: "100%",
        }}
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

  function updateSocial(key: DiscoverPublisherSocialKey, nextValue: string) {
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
        <div className="grid gap-3">
          {rows.map((option) => {
            return (
              <div
                key={option.key}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-3 shadow-sm"
              >
                <SocialAssetIcon option={option} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 truncate text-sm font-semibold text-foreground">
                    {t(option.label)}
                  </div>
                  <Input
                    value={social[option.key] ?? ""}
                    onChange={(event) =>
                      updateSocial(option.key, event.target.value)
                    }
                    placeholder={option.placeholder}
                    aria-label={t(option.label)}
                    className="h-10 min-w-0"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSocial(option.key)}
                  aria-label={`${t("Remove")} ${t(option.label)}`}
                  className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/60"
                >
                  <SocialAssetIcon option={option} size={42} />
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
