"use client";

import { useFormStatus } from "react-dom";

export function AdminSubmitButton({
  idleLabel,
  pendingLabel,
  className,
  disabled = false,
  name,
  value,
  title,
}: {
  idleLabel: string;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
  name?: string;
  value?: string;
  /** Native tooltip — for actions whose label can't carry the full consequence. */
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      title={title}
      disabled={pending || disabled}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
