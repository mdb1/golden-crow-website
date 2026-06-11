"use client";

import Link from "next/link";
import { ArrowUpRight, Globe2, Mail, PhoneCall } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import { appText } from "@/lib/language";

const CONTACT_CHANNELS = [
  {
    label: "Website",
    value: "www.2pq.life",
    detail: "Program information and public-facing resources.",
    href: "https://www.2pq.life",
    actionLabel: "Open website",
    icon: Globe2,
  },
  {
    label: "Phone",
    value: "+54 9 11 6307 4446",
    detail: "Direct line for operational coordination.",
    href: "tel:+5491163074446",
    actionLabel: "Call",
    icon: PhoneCall,
  },
  {
    label: "Email",
    value: "2pq.info@gmail.com",
    detail: "Shared inbox for administrative follow-up.",
    href: "mailto:2pq.info@gmail.com",
    actionLabel: "Email",
    icon: Mail,
  },
] as const;

export function TwoPQContactSection() {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <section
      id="contact"
      className="glass-panel overflow-hidden border-sky-100 [background:linear-gradient(145deg,rgba(248,252,255,0.98),rgba(239,246,255,0.98)_48%,rgba(225,244,255,0.94))] px-5 py-5 shadow-[0_18px_56px_rgba(186,230,253,0.28)] dark:border-sky-300/20 dark:[background:linear-gradient(145deg,rgba(7,24,39,0.98),rgba(10,35,56,0.96)_48%,rgba(14,165,233,0.18))] dark:shadow-[0_24px_80px_-52px_rgba(14,165,233,0.82)]"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="max-w-2xl">
          <p className="section-eyebrow text-sky-900/60 dark:text-sky-100/72">
            {t("Contact")}
          </p>
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-sky-950 dark:text-sky-50">
            {t("2PQ contact information")}
          </h2>
          <p className="mt-3 text-sm leading-6 text-sky-900/72 dark:text-sky-50/72">
            {t("Keep these official 2PQ channels visible for form coordination, sample logistics, and operational follow-up.")}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              className="rounded-xl bg-sky-700 text-white shadow-[0_14px_28px_rgba(3,105,161,0.22)] hover:bg-sky-800"
              asChild
            >
              <Link href="mailto:2pq.info@gmail.com">
                <Mail className="size-4" />
                {t("Send email")}
              </Link>
            </Button>
            <Button
              variant="outline"
              className="rounded-xl border-sky-200 bg-white/72 text-sky-950 hover:bg-white dark:border-sky-300/20 dark:bg-sky-400/12 dark:text-sky-50"
              asChild
            >
              <Link href="https://www.2pq.life" target="_blank" rel="noreferrer">
                {t("Visit 2PQ")}
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          {CONTACT_CHANNELS.map((channel) => (
            <article
              key={channel.label}
              className="flex min-h-36 flex-col rounded-[1.4rem] border border-sky-100 bg-white/72 px-4 py-4 shadow-[0_14px_34px_rgba(186,230,253,0.34)] dark:border-sky-300/18 dark:bg-sky-950/24 dark:shadow-none"
            >
              <div className="flex size-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-800 dark:bg-sky-400/14 dark:text-sky-50">
                <channel.icon className="size-5" />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-sky-900/54 dark:text-sky-100/64">
                {t(channel.label)}
              </p>
              <p className="mt-1 break-words font-heading text-lg font-semibold text-sky-950 [overflow-wrap:anywhere] dark:text-sky-50">
                {channel.value}
              </p>
              <p className="mt-2 text-sm leading-6 text-sky-900/68 dark:text-sky-50/70">
                {t(channel.detail)}
              </p>
              <Link
                href={channel.href}
                target={channel.href.startsWith("http") ? "_blank" : undefined}
                rel={channel.href.startsWith("http") ? "noreferrer" : undefined}
                className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-sky-800 hover:text-sky-950 dark:text-sky-100 dark:hover:text-white"
              >
                {t(channel.actionLabel)}
                <ArrowUpRight className="size-3.5" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
