"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  PGFLEX_ACCOUNT_ROUTE,
  PGFLEX_ENTRY_ROUTE,
  PGFLEX_HOME_ROUTE,
} from "@/lib/pgflex-routes";

function canAccessPGFlexPath(pathname: string) {
  return (
    pathname === "/pgflex" ||
    pathname === PGFLEX_HOME_ROUTE ||
    pathname === PGFLEX_ACCOUNT_ROUTE ||
    pathname === PGFLEX_ENTRY_ROUTE ||
    pathname.startsWith(`${PGFLEX_ENTRY_ROUTE}/`)
  );
}

export function PGFlexRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const blocked = !canAccessPGFlexPath(pathname);

  useEffect(() => {
    if (blocked) {
      router.replace(PGFLEX_ENTRY_ROUTE);
    }
  }, [blocked, router]);

  return blocked ? null : children;
}
