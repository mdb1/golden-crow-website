"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelperBanner } from "@/components/helper-banner";
import { provisionClient } from "@/lib/gc-fitness/user-actions";

export function ProvisionClientForm() {
  const router = useRouter();
  const t = useTranslations("clients.provisionForm");
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="rounded-xl border-border/80 bg-card/95">
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        <CardDescription>{t("cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            setError(null);
            startTransition(async () => {
              try {
                const result = await provisionClient({
                  email,
                  displayName: displayName || undefined,
                });
                // CR-03: expected refusals arrive as a discriminated result
                // (NOT a thrown Error) because production Next.js masks
                // Server-Action error messages. The localized copy is
                // rendered CLIENT-side from the mode — no server-composed
                // string crosses the wire, which also keeps the enumeration
                // bound (T-32-ENUM: copy names only the typed email).
                if (!result.ok) {
                  setError(
                    result.mode === "conflict"
                      ? t("conflictError", { email })
                      : t("selfError"),
                  );
                  return;
                }
                setEmail("");
                setDisplayName("");
                setMessage(
                  result.mode === "already-linked"
                    ? t("alreadyLinked")
                    : result.mode === "attached-existing-user"
                      ? t("successAttached")
                      : t("successPreCreated"),
                );
                router.refresh();
              } catch {
                // Unexpected failure only — expected refusals never throw.
                // err.message is prod-masked by Next.js, so it carries no
                // user-renderable copy; show the localized fallback instead.
                setError(t("errorFallback"));
              }
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="client-email">{t("emailLabel")}</Label>
            <Input
              id="client-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="client@email.com"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="client-name">{t("nameLabel")}</Label>
            <Input
              id="client-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </div>
          <Button type="submit" disabled={isPending} className="h-10 self-end gap-2 px-4">
            <UserPlus className="size-4" />
            {isPending ? t("submitting") : t("submitCta")}
          </Button>
        </form>
        {message ? (
          <div className="mt-3">
            <HelperBanner title={t("successBannerTitle")} tone="green">
              {message}
            </HelperBanner>
          </div>
        ) : null}
        {error ? (
          <div className="mt-3">
            <HelperBanner title={t("errorBannerTitle")} tone="red">
              {error}
            </HelperBanner>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
