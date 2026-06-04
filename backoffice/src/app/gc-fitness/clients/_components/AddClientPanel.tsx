"use client";

// AddClientPanel.tsx — roster header + collapsible "Add client" form
// (2026-06 redesign).
//
// Renders the PageHeader ("Clientes" + active/pending count subtitle) with a
// hero "+ Nuevo Cliente" gold pill in the actions slot. Toggling the pill
// reveals the existing ProvisionClientForm card beneath the header. The form's
// data wiring / server action is untouched — this wrapper only owns the
// open/closed UI state, which requires a client boundary (hence this file is
// `"use client"` while the page stays a Server Component).

import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { ProvisionClientForm } from "./ProvisionClientForm";

export function AddClientPanel({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const t = useTranslations("clients.provisionForm");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button
            className="gap-2 rounded-full"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? <X className="size-4" /> : <UserPlus className="size-4" />}
            {t("submitCta")}
          </Button>
        }
      />
      {open ? <ProvisionClientForm /> : null}
    </div>
  );
}
