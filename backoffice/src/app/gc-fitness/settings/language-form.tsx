"use client";

// language-form.tsx
//
// 260523-kpt — Trainer locale toggle (Settings → Language).
//
// Submits via the `updatePreferredLocale` Server Action which:
//   1. Writes /users/{trainer.uid}.preferredLocale (Firestore self-write).
//   2. Sets the NEXT_LOCALE cookie in the same request.
//
// Followed by `router.refresh()` so the layout re-renders in the new
// locale on the next paint (the layout's getRequestConfig re-runs and
// loads the chosen catalog).
//
// MANDATORY new-file shape (locked decision in PLAN 260523-kpt):
//   - This is a NEW client component file (not inline in page.tsx) so
//     the test file (`__tests__/language-form.test.tsx`) can render it
//     in isolation with a jsdom docblock + mocked Server Action.
//   - The form uses shadcn RadioGroup primitive (already installed at
//     `components/ui/radio-group.tsx`).
//
// Threat coverage (PLAN 260523-kpt threat model):
//   - T-i18n-01 (Tampering): the Server Action's Zod gate rejects any
//     value outside {en, es}. The radio UI mechanically prevents
//     anything else but the server is the truth.
//   - T-i18n-04 (DoS via request.ts hydration): the cookie write inside
//     `updatePreferredLocale` short-circuits the locale resolution
//     chain at step 1 on every subsequent request — Firestore is read
//     ONLY when the cookie is missing AND the trainer is signed in.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { updatePreferredLocale } from "@/lib/gc-fitness/user-actions";

export interface LanguageFormProps {
  /** Current locale resolved server-side via `getLocale()`. */
  currentLocale: "en" | "es";
}

export function LanguageForm({ currentLocale }: LanguageFormProps) {
  const router = useRouter();
  const t = useTranslations("settings.language");
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<"en" | "es">(currentLocale);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await updatePreferredLocale({ locale: selected });
        toast.success(t("savedToast"));
        router.refresh();
      } catch (err) {
        console.error("[language-form] save failed", err);
        const message =
          err instanceof Error ? err.message : t("saveFailedToast");
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <RadioGroup
        value={selected}
        onValueChange={(value) => setSelected(value as "en" | "es")}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem id="lang-en" value="en" />
          <Label htmlFor="lang-en" className="cursor-pointer">
            {t("english")}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id="lang-es" value="es" />
          <Label htmlFor="lang-es" className="cursor-pointer">
            {t("spanish")}
          </Label>
        </div>
      </RadioGroup>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || selected === currentLocale}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
