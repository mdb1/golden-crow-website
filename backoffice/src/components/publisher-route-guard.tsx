"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AdminContextRecord } from "@/lib/admin-areas";

function canPublisherAccessPath(
  role: AdminContextRecord["role"],
  pathname: string,
) {
  if (pathname === "/my-account") {
    return true;
  }

  if (pathname === "/discover/organizations/new") {
    return false;
  }

  if (pathname === "/discover/individuals/new") {
    return false;
  }

  const canAccessOrganizationPublisher =
    role === "organization_publisher" &&
    (pathname === "/discover/organizations" ||
      pathname.startsWith("/discover/organizations/"));
  const canAccessIndividualPublisher =
    role === "individual_publisher" &&
    (pathname === "/discover/individuals" ||
      pathname.startsWith("/discover/individuals/"));

  return (
    canAccessOrganizationPublisher ||
    canAccessIndividualPublisher ||
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
    (adminContext.role === "organization_publisher" ||
      adminContext.role === "individual_publisher") &&
    !canPublisherAccessPath(adminContext.role, pathname);

  useEffect(() => {
    if (blocked) {
      router.replace("/discover/feed-entries");
    }
  }, [blocked, router]);

  return blocked ? null : children;
}
