import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PublisherPortalEmptyStateAction = {
  href: string;
  label: string;
  icon?: LucideIcon;
};

export function PublisherPortalEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: PublisherPortalEmptyStateAction;
  className?: string;
}) {
  const ActionIcon = action?.icon;

  return (
    <div
      data-testid="publisher-portal-empty-state"
      className={cn("px-4 py-12 text-center", className)}
    >
      <div
        data-testid="publisher-portal-empty-state-icon"
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-violet-700 shadow-inner dark:bg-violet-500/14 dark:text-violet-100"
      >
        <Icon aria-hidden="true" className="h-6 w-6" />
      </div>
      <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {action ? (
        <Button
          className="mt-5 h-11 rounded-xl bg-violet-600 px-4 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
          asChild
        >
          <Link href={action.href}>
            {ActionIcon ? (
              <ActionIcon aria-hidden="true" className="h-4 w-4" />
            ) : null}
            {action.label}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
