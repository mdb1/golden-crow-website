// ClientSettingsDialog.tsx — the "set it once per client" drawer.
//
// The nickname + birthday editor used to be a full-width card sitting between
// the header and the first thing a coach actually reads every day. It is edited
// roughly once in a client's lifetime, so it was paying for permanent screen
// real estate with a one-time job. Same for "Pedir peso": a request, not a
// reading.
//
// `weightRequestSlot` is a ReactNode because the request row is a Server
// Component owning its own server action — this dialog is a client component
// (it holds open/closed state), so the row has to arrive as an already-rendered
// child from page.tsx rather than be imported here.

"use client";

import { useState, type ReactNode } from "react";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { ClientIdentityFields } from "./ClientIdentityEditor";

export function ClientSettingsDialog({
  clientId,
  clientName,
  birthDate,
  initialNickname,
  weightRequestSlot,
}: {
  clientId: string;
  clientName: string;
  birthDate: string | null;
  initialNickname: string | null;
  weightRequestSlot: ReactNode;
}) {
  const t = useTranslations("clients.detail.settings");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full">
          <Settings className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("subtitle", { client: clientName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <ClientIdentityFields
            clientId={clientId}
            birthDate={birthDate}
            initialNickname={initialNickname}
          />
          {weightRequestSlot}
        </div>
      </DialogContent>
    </Dialog>
  );
}
