"use client";

// admin-action-form.tsx — #498.
//
// The admin console's Server Actions RETURN their failure (`ActionResult`,
// see src/lib/gc-fitness/action-result.ts, #1104) instead of throwing it: a
// thrown error reaches a production browser as "Minified React error #441".
// A plain `<form action={serverAction}>` would drop the returned value on the
// floor, so every admin form goes through this wrapper, which calls the action
// with the form's FormData (same argument shape as before — the action IDs do
// not move, #382) and shows `result.error` under the form.
//
// Success usually means the action redirected (the router navigates and the
// page re-renders with its `?op=…&ok=1` banner); actions that don't redirect
// return `{ ok: true }` and the revalidated page refreshes in place.
//
// `useFormStatus` keeps working for the children (AdminSubmitButton), because
// this is still a form action.

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import type { ActionResult } from "@/lib/gc-fitness/action-result";

export function AdminActionForm({
  action,
  className,
  children,
  confirmMessage,
}: {
  action: (formData: FormData) => Promise<ActionResult | void>;
  className?: string;
  children: ReactNode;
  /** When set, the browser asks for confirmation before calling the action. */
  confirmMessage?: string;
}) {
  const t = useTranslations("admin.common");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={className}
      action={async (formData) => {
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        setError(null);
        const result = await action(formData);
        if (result && result.ok === false) setError(result.error);
      }}
    >
      {children}
      {error ? (
        <p role="alert" className="mt-1 basis-full text-xs text-destructive">
          {t("actionFailed", { message: error })}
        </p>
      ) : null}
    </form>
  );
}
