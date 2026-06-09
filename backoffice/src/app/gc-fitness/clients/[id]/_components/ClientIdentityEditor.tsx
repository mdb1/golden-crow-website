"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClientNickname } from "@/lib/gc-fitness/user-actions";

export function ClientIdentityEditor({
  clientId,
  birthDate,
  initialNickname,
  clientName,
}: {
  clientId: string;
  birthDate: string | null;
  initialNickname: string | null;
  clientName: string;
  }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("clients.detail.identity");
  const [pending, startTransition] = useTransition();
  const [nickname, setNickname] = useState(initialNickname ?? "");
  const [birthDateValue, setBirthDateValue] = useState(birthDate ?? "");

  function textOrFallback(key: string, fallback: string): string {
    const value = t(key as never);
    return value === key ? fallback : value;
  }

  useEffect(() => {
    setNickname(initialNickname ?? "");
    setBirthDateValue(birthDate ?? "");
  }, [birthDate, initialNickname]);

  function save() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    startTransition(async () => {
      try {
        await updateClientNickname({
          clientId,
          coachNickname: nickname.trim().length > 0 ? nickname.trim() : null,
        });
        toast.success(t("savedToast"));
        router.refresh();
      } catch (err) {
        console.error("[client-identity-editor] save failed", err);
        toast.error(err instanceof Error ? err.message : t("saveFailedToast"));
      }
    });
  }

  return (
    <section className="rounded-[1.25rem] border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", { client: clientName })}
        </p>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="coach-nickname">{t("nicknameLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {textOrFallback(
              "nicknameHelp",
              locale === "es"
                ? "Solo vos lo ves en el backoffice; no cambia el nombre del cliente en la app."
                : "Only you can see it in the backoffice; it does not change the client's app name.",
            )}
          </p>
          <Input
            id="coach-nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder={t("nicknamePlaceholder")}
          />
        </div>
        <div className="grid gap-2">
          <Label>{t("birthDateLabel")}</Label>
          <div className="rounded-full border bg-muted/30 px-4 py-3 text-sm text-foreground">
            {birthDateValue
              ? t("birthDateValue", { birthDate: birthDateValue })
              : t("birthDateMissing")}
          </div>
          <p className="text-xs text-muted-foreground">
            {textOrFallback(
              "birthDateReadOnly",
              locale === "es"
                ? "El cumpleaños se define desde la app y no se puede editar desde el backoffice."
                : "Birthday is set from the app and can't be edited from the backoffice.",
            )}
          </p>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </section>
  );
}
