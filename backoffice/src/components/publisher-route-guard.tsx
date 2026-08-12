"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AdminContextRecord } from "@/lib/admin-areas";

function canPublisherAccessPath(pathname: string) {
  if (pathname === "/my-account") {
    return true;
  }

  if (pathname === "/2pq-dashboard/consents") {
    return true;
  }

  if (pathname === "/discover/organizations/new") {
    return false;
  }

  return (
    pathname === "/discover/organizations" ||
    pathname.startsWith("/discover/organizations/") ||
    pathname === "/discover/feed-entries" ||
    pathname === "/discover/feed-entries/new" ||
    pathname.startsWith("/discover/feed-entries/")
  );
}

export function PublisherRouteGuard({
  adminContext,
  children,
}: {
  adminContext: AdminContextRecord;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const blocked =
    adminContext.role === "organization_publisher" &&
    !canPublisherAccessPath(pathname);

  useEffect(() => {
    if (blocked) {
      router.replace("/discover/feed-entries");
    }
  }, [blocked, router]);

  return blocked ? null : children;
}
