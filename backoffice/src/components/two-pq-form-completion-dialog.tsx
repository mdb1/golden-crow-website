"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardList } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import { appText } from "@/lib/language";
import type { TwoPQFormType } from "@/lib/two-pq-forms";

const FORM_COMPLETION_CONFETTI = [
  { left: "9%", top: "18%", color: "#c4b5fd", delay: "0ms", duration: "1080ms" },
  { left: "18%", top: "10%", color: "#93c5fd", delay: "60ms", duration: "980ms" },
  { left: "30%", top: "15%", color: "#a5b4fc", delay: "110ms", duration: "1120ms" },
  { left: "43%", top: "8%", color: "#f0abfc", delay: "170ms", duration: "1020ms" },
  { left: "58%", top: "12%", color: "#67e8f9", delay: "220ms", duration: "1180ms" },
  { left: "70%", top: "14%", color: "#818cf8", delay: "280ms", duration: "1040ms" },
  { left: "82%", top: "9%", color: "#ddd6fe", delay: "330ms", duration: "1140ms" },
  { left: "90%", top: "20%", color: "#bfdbfe", delay: "390ms", duration: "990ms" },
] as const;

export function TwoPQFormCompletionDialog({
  createdId,
  createdType,
}: {
  createdId?: string;
  createdType?: TwoPQFormType;
}) {
  const router = useRouter();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [open, setOpen] = useState(Boolean(createdId));

  if (!createdId || !open) {
    return null;
  }

  function closeAndShowAllForms() {
    setOpen(false);
    router.replace("/2pq-dashboard/forms");
    router.refresh();
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-background/42 backdrop-blur-[4px]" />
      <div className="pointer-events-auto animate-in fade-in-0 zoom-in-95 relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-indigo-200/42 bg-[linear-gradient(155deg,rgba(199,210,254,0.42),rgba(49,46,129,0.98)_50%,rgba(79,70,229,0.94))] px-6 py-8 text-center shadow-[0_34px_130px_rgba(79,70,229,0.36)]">
        {FORM_COMPLETION_CONFETTI.map((particle, index) => (
          <span
            key={`${particle.left}-${particle.delay}-${index}`}
            className="two-pq-confetti absolute h-3 w-3 rounded-[5px]"
            style={{
              left: particle.left,
              top: particle.top,
              background: particle.color,
              animationDelay: particle.delay,
              animationDuration: particle.duration,
            }}
          />
        ))}
        <div className="relative flex flex-col items-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-indigo-100/18 text-indigo-50 shadow-[0_0_0_14px_rgba(199,210,254,0.13)]">
            <span className="two-pq-success-ring absolute inset-0 rounded-full border border-indigo-100/60" />
            <CheckCircle2 className="h-12 w-12" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-50/88">
            {t("Form completed")}
          </p>
          <h3 className="mt-2 font-heading text-3xl font-semibold text-white">
            {createdType === "sample"
              ? t("The biopsy form is ready and stored")
              : createdType === "withdrawal_request"
                ? t("The withdrawal request form is ready and stored")
              : t("The 2PQ form is stored and ready")}
          </h3>
          <p className="mt-2 max-w-lg text-sm text-indigo-50/84">
            {t("Form")} <span className="font-mono text-indigo-50">{createdId}</span>{" "}
            {t("is now in")} <code>2pq_forms</code>{" "}
            {t("with its author, scope, and linked records preserved.")}
          </p>
          <div className="mt-6 grid w-full max-w-lg gap-2 sm:grid-cols-2">
            <Button
              className="h-12 rounded-[1.1rem] border border-indigo-100/12 bg-white px-6 text-sm font-semibold text-indigo-950 shadow-[0_18px_48px_rgba(199,210,254,0.22)] hover:bg-indigo-50"
              asChild
            >
              <Link href={`/2pq-dashboard/forms/${encodeURIComponent(createdId)}`}>
                <ClipboardList className="h-4 w-4" />
                {t("Open completed form")}
              </Link>
            </Button>
            <Button
              type="button"
              onClick={closeAndShowAllForms}
              className="h-12 rounded-[1.1rem] border border-indigo-100/16 bg-indigo-300/18 px-6 text-sm font-semibold text-white shadow-[0_18px_48px_rgba(49,46,129,0.22)] hover:bg-indigo-200/22"
            >
              {t("See all forms")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
