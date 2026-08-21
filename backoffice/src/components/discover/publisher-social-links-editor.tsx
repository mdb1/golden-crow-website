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
import { cn } from "@/lib/utils";

type SocialOption = {
  key: DiscoverPublisherSocialKey;
  label: string;
  placeholder: string;
  icon: (props: { className?: string }) => ReactElement;
  iconFrameClassName: string;
  iconClassName?: string;
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

function SocialOptionIcon({ option }: { option: SocialOption }) {
  const Icon = option.icon;

  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-black/10",
        option.iconFrameClassName,
      )}
    >
      <Icon className={cn("h-5 w-5", option.iconClassName)} />
    </span>
  );
}

const SOCIAL_OPTIONS: readonly SocialOption[] = [
  {
    key: "facebook",
    label: "Facebook profile",
    placeholder: "https://facebook.com/...",
    iconFrameClassName: "bg-[#1877F2] text-white",
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
    iconFrameClassName: "bg-[#111111] text-white",
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
    iconFrameClassName:
      "bg-[radial-gradient(circle_at_30%_105%,#FEDA75_0%,#FA7E1E_25%,#D62976_55%,#962FBF_78%,#4F5BD5_100%)] text-white",
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
    iconFrameClassName: "bg-[#111111] text-white",
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
    iconFrameClassName: "bg-[#FF0000] text-white",
    icon: (props) => (
      <BrandIcon
        label="YouTube"
        path="M21.58 7.19a2.74 2.74 0 0 0-1.93-1.94C17.94 4.8 12 4.8 12 4.8s-5.94 0-7.65.45a2.74 2.74 0 0 0-1.93 1.94A28.55 28.55 0 0 0 2 12a28.55 28.55 0 0 0 .42 4.81 2.74 2.74 0 0 0 1.93 1.94c1.71.45 7.65.45 7.65.45s5.94 0 7.65-.45a2.74 2.74 0 0 0 1.93-1.94A28.55 28.55 0 0 0 22 12a28.55 28.55 0 0 0-.42-4.81zM10 15.2V8.8l5.2 3.2L10 15.2z"
        {...props}
      />
    ),
  },
  {
    key: "linkedin",
    label: "LinkedIn profile",
    placeholder: "https://linkedin.com/in/...",
    iconFrameClassName: "bg-[#0A66C2] text-white",
    icon: (props) => (
      <BrandIcon
        label="LinkedIn"
        path="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.11 20.45H3.56V9h3.55v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45C23.2 24 24 23.23 24 22.27V1.73C24 .77 23.2 0 22.23 0z"
        {...props}
      />
    ),
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    placeholder: "https://wa.me/...",
    iconFrameClassName: "bg-[#25D366] text-white",
    icon: (props) => (
      <BrandIcon
        label="WhatsApp"
        path="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01s-.52.07-.79.37c-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zM20.46 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.31-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.49-8.42z"
        {...props}
      />
    ),
  },
  {
    key: "telegram",
    label: "Telegram",
    placeholder: "https://t.me/...",
    iconFrameClassName: "bg-[#26A5E4] text-white",
    icon: (props) => (
      <BrandIcon
        label="Telegram"
        path="M12 0A12 12 0 1 0 12 24 12 12 0 0 0 12 0zm4.91 7.22c.14 0 .33.02.46.14.11.09.15.22.17.33.02.09.04.31.02.47-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.82 1.23-.7.06-1.23-.46-1.9-.9-1.06-.69-1.65-1.12-2.68-1.8-1.19-.78-.42-1.21.26-1.91.18-.18 3.25-2.98 3.31-3.23.01-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.11.02-1.79 1.14-5.06 3.34-.48.33-.91.49-1.3.48-.43-.01-1.25-.24-1.87-.44-.75-.25-1.35-.37-1.3-.79.03-.22.33-.44.89-.66 3.5-1.52 5.83-2.53 7-3.01 3.33-1.39 4.02-1.63 4.49-1.64z"
        {...props}
      />
    ),
  },
  {
    key: "threads",
    label: "Threads profile",
    placeholder: "https://threads.net/@...",
    iconFrameClassName: "bg-[#111111] text-white",
    icon: (props) => (
      <BrandIcon
        label="Threads"
        path="M12.19 24h-.01c-3.58-.02-6.33-1.2-8.18-3.51-1.65-2.05-2.5-4.9-2.53-8.48v-.02c.03-3.58.88-6.43 2.53-8.48C5.85 1.2 8.6.02 12.18 0h.01c2.75.02 5.04.73 6.83 2.1 1.74 1.33 2.96 3.31 3.64 5.87l-2.31.62c-1.02-3.79-3.68-5.78-8.17-5.81-2.84.02-5 .91-6.41 2.65-1.31 1.61-1.99 3.82-2.02 6.57.03 2.76.71 4.97 2.02 6.58 1.41 1.74 3.57 2.63 6.41 2.65 2.54-.02 4.54-.62 5.93-1.79 1.58-1.33 2.11-3.11 1.59-5.31-.31.22-.66.42-1.03.59-.95.42-2.06.63-3.3.64-.01.1-.03.21-.05.31-.34 1.84-1.31 3.1-2.8 3.64-1.14.41-2.4.4-3.56-.02-1.34-.49-2.28-1.43-2.57-2.59-.31-1.24.04-2.48.95-3.39.92-.92 2.27-1.44 3.79-1.47.77-.01 1.51.02 2.21.11-.06-.59-.25-1.04-.55-1.35-.4-.41-1.02-.62-1.83-.62-1.39 0-2.21.57-2.49 1.74l-2.29-.57c.54-2.23 2.28-3.46 4.78-3.46h.02c3.08.02 4.91 1.89 5.13 5.19.87.08 1.65.07 2.34-.04-.06-.13-.12-.26-.19-.39-.66-1.25-1.85-1.99-3.55-2.2l.28-2.37c2.5.31 4.32 1.49 5.4 3.51.3.55.53 1.16.7 1.81.39-.31.75-.68 1.09-1.1l1.87 1.49c-.59.74-1.24 1.34-1.94 1.8.41 3-.41 5.47-2.39 7.14-1.83 1.54-4.36 2.34-7.52 2.36zm.62-9.01c-.38-.04-.77-.06-1.18-.05-1.55.03-2.31.86-2.13 1.56.16.62.9 1.12 1.78 1.19.87.07 1.89-.16 2.38-1.87.07-.26.12-.53.15-.83z"
        {...props}
      />
    ),
  },
  {
    key: "pinterest",
    label: "Pinterest profile",
    placeholder: "https://pinterest.com/...",
    iconFrameClassName: "bg-[#E60023] text-white",
    icon: (props) => (
      <BrandIcon
        label="Pinterest"
        path="M12.02 0C5.4 0 .03 5.37.03 11.99c0 5.08 3.16 9.42 7.62 11.16-.11-.95-.2-2.4.04-3.44.22-.94 1.41-5.97 1.41-5.97s-.36-.72-.36-1.78c0-1.67.97-2.91 2.17-2.91 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-.99 4-.28 1.19.6 2.17 1.78 2.17 2.13 0 3.77-2.25 3.77-5.5 0-2.87-2.06-4.88-5.01-4.88-3.41 0-5.42 2.56-5.42 5.21 0 1.03.4 2.14.89 2.74.1.12.11.22.08.35l-.33 1.36c-.05.22-.17.27-.4.16-1.5-.7-2.44-2.89-2.44-4.65 0-3.79 2.75-7.26 7.93-7.26 4.16 0 7.4 2.97 7.4 6.93 0 4.14-2.61 7.46-6.23 7.46-1.22 0-2.36-.63-2.75-1.38l-.75 2.85c-.27 1.04-1 2.35-1.49 3.15A12.01 12.01 0 0 0 12.02 24c6.62 0 11.99-5.37 11.99-11.99C24.01 5.37 18.64 0 12.02 0z"
        {...props}
      />
    ),
  },
  {
    key: "snapchat",
    label: "Snapchat profile",
    placeholder: "https://snapchat.com/add/...",
    iconFrameClassName: "bg-[#FFFC00] text-black",
    icon: (props) => (
      <BrandIcon
        label="Snapchat"
        path="M12 2C9.24 2 7.2 4.32 7.2 7.22v2.24c0 .72-.42 1.39-1.09 1.68l-1.33.58c-.55.24-.72.94-.33 1.4.57.66 1.33 1.13 2.18 1.35-.18.56-.52 1.09-1.04 1.52-.43.35-.25 1.04.3 1.13.86.14 1.7.04 2.46-.27.54.96 1.44 1.72 2.55 2.11.35.12.74.12 1.09 0 1.11-.39 2.01-1.15 2.55-2.11.76.31 1.6.41 2.46.27.55-.09.73-.78.3-1.13-.52-.43-.86-.96-1.04-1.52.85-.22 1.61-.69 2.18-1.35.39-.46.22-1.16-.33-1.4l-1.33-.58c-.67-.29-1.09-.96-1.09-1.68V7.22C16.8 4.32 14.76 2 12 2z"
        {...props}
      />
    ),
  },
  {
    key: "reddit",
    label: "Reddit profile",
    placeholder: "https://reddit.com/u/...",
    iconFrameClassName: "bg-[#FF4500] text-white",
    icon: (props) => (
      <BrandIcon
        label="Reddit"
        path="M12 0a12 12 0 1 0 0 24A12 12 0 0 0 12 0zm5.01 4.74a1.25 1.25 0 0 1 1.25 1.25 1.25 1.25 0 0 1-2.5.06l-2.6-.55-.8 3.75c1.82.07 3.48.63 4.67 1.49.31-.31.73-.49 1.21-.49.97 0 1.75.79 1.75 1.75 0 .72-.43 1.33-1.01 1.61.02.15.03.29.03.45 0 2.66-3.08 4.81-6.89 4.81s-6.89-2.15-6.89-4.81c0-.15.01-.3.03-.45A1.75 1.75 0 0 1 4.27 12c0-.97.79-1.75 1.75-1.75.48 0 .9.18 1.21.49 1.21-.87 2.88-1.43 4.73-1.49l.94-4.39a.46.46 0 0 1 .54-.35l3.1.66a1.25 1.25 0 0 1 .47-.42zM9.25 12.75a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm5.5 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm-5.47 4.01a.33.33 0 0 0-.23.56c.72.72 1.96.75 2.95.75.99 0 2.23-.03 2.95-.75a.33.33 0 0 0-.46-.46c-.43.43-1.3.56-2.49.56-1.19 0-2.06-.13-2.49-.56a.33.33 0 0 0-.23-.1z"
        {...props}
      />
    ),
  },
  {
    key: "discord",
    label: "Discord server",
    placeholder: "https://discord.gg/...",
    iconFrameClassName: "bg-[#5865F2] text-white",
    icon: (props) => (
      <BrandIcon
        label="Discord"
        path="M20.32 4.37a19.79 19.79 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.86-.61 1.25a18.27 18.27 0 0 0-5.49 0c-.16-.39-.4-.87-.62-1.25a.08.08 0 0 0-.08-.04A19.74 19.74 0 0 0 3.68 4.37a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06c0 .02.01.04.03.06a19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99.02-.04 0-.09-.04-.11-.65-.25-1.27-.55-1.87-.89a.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1-.01.13 12.3 12.3 0 0 1-1.87.89.08.08 0 0 0-.04.11c.36.7.77 1.36 1.23 1.99.02.03.05.04.08.03a19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.98 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z"
        {...props}
      />
    ),
  },
  {
    key: "twitch",
    label: "Twitch channel",
    placeholder: "https://twitch.tv/...",
    iconFrameClassName: "bg-[#9146FF] text-white",
    icon: (props) => (
      <BrandIcon
        label="Twitch"
        path="M11.57 4.71h1.72v5.14h-1.72V4.71zm4.72 0H18v5.14h-1.71V4.71zM6 0 1.71 4.29v15.43h5.15V24l4.28-4.28h3.43L22.29 12V0H6zm14.57 11.14-3.43 3.43h-3.43l-3 3v-3H6.86V1.71h13.71v9.43z"
        {...props}
      />
    ),
  },
  {
    key: "bluesky",
    label: "Bluesky profile",
    placeholder: "https://bsky.app/profile/...",
    iconFrameClassName: "bg-[#1185FE] text-white",
    icon: (props) => (
      <BrandIcon
        label="Bluesky"
        path="M6.3 3.2C8.6 5 10.9 8.6 12 10.5c1.1-1.9 3.4-5.5 5.7-7.3 1.65-1.27 4.3-2.25 4.3.88 0 .62-.36 5.2-.57 5.94-.74 2.63-3.44 3.3-5.84 2.9 4.2.72 5.27 3.1 2.96 5.48-4.38 4.5-6.3-1.13-6.79-2.57-.09-.27-.13-.4-.16-.4s-.07.13-.16.4c-.49 1.44-2.41 7.07-6.79 2.57-2.31-2.38-1.24-4.76 2.96-5.48-2.4.4-5.1-.27-5.84-2.9C1.56 9.28 1.2 4.7 1.2 4.08c0-3.13 2.65-2.15 5.1-.88z"
        {...props}
      />
    ),
  },
  {
    key: "mastodon",
    label: "Mastodon profile",
    placeholder: "https://mastodon.social/@...",
    iconFrameClassName: "bg-[#6364FF] text-white",
    icon: (props) => (
      <BrandIcon
        label="Mastodon"
        path="M23.19 7.88c0-5.21-3.41-6.73-3.41-6.73C18.06.36 15.11.03 12.04 0h-.07C8.9.03 5.95.36 4.23 1.15c0 0-3.41 1.52-3.41 6.73 0 1.19-.02 2.62.01 4.13.12 5.09.93 10.11 5.64 11.36 2.17.57 4.03.7 5.54.61 2.72-.15 4.25-.97 4.25-.97l-.09-1.98s-1.94.61-4.13.54c-2.16-.07-4.45-.23-4.8-2.89a5.39 5.39 0 0 1-.05-.75s2.12.52 4.81.64c1.65.08 3.19-.1 4.76-.28 3.01-.36 5.63-2.21 5.95-3.9.52-2.67.48-6.51.48-6.51zm-4.02 6.71h-2.5V8.47c0-1.29-.54-1.94-1.63-1.94-1.2 0-1.8.78-1.8 2.31v3.35h-2.48V8.84c0-1.54-.6-2.31-1.8-2.31-1.09 0-1.63.65-1.63 1.94v6.12h-2.5v-6.3c0-1.29.33-2.31.99-3.07.68-.76 1.57-1.15 2.67-1.15 1.28 0 2.24.49 2.88 1.47l.62 1.04.62-1.04c.64-.98 1.6-1.47 2.88-1.47 1.1 0 1.99.39 2.67 1.15.66.76.99 1.78.99 3.07v6.3z"
        {...props}
      />
    ),
  },
  {
    key: "email",
    label: "Contact email",
    placeholder: "contact@example.org",
    iconFrameClassName: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950",
    icon: (props) => <AtSign aria-label="Email" {...props} />,
  },
  {
    key: "other",
    label: "Other link",
    placeholder: "https://...",
    iconFrameClassName: "bg-teal-600 text-white",
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
