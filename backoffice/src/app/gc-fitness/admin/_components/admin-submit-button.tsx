"use client";

import { useFormStatus } from "react-dom";

export function AdminSubmitButton({
  idleLabel,
  pendingLabel,
  className,
  name,
  value,
}: {
  idleLabel: string;
  pendingLabel: string;
  className: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
