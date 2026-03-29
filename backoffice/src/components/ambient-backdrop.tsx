import { cn } from "@/lib/utils";

export function AmbientBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at top left, var(--ambient-glow-top-left), transparent 32%), radial-gradient(circle at 80% 20%, var(--ambient-glow-top-right), transparent 28%), radial-gradient(circle at 50% 100%, var(--ambient-glow-bottom), transparent 34%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(var(--ambient-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--ambient-grid-line) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-40"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, var(--ambient-fade-top), var(--ambient-fade-mid), transparent)",
        }}
      />
    </div>
  );
}
