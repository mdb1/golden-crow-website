"use client";

import { useFormStatus } from "react-dom";

export function AdminSubmitButton({
  idleLabel,
  pendingLabel,
  className,
  disabled = false,
  name,
  value,
}: {
  idleLabel: string;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
