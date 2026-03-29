"use client";
import { useQuery } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { columns, AdminUser } from "@/app/(dashboard)/users/columns";

export function UserTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: () =>
      sdkFetch<{ users: AdminUser[]; nextPageToken?: string }>("/users"),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load users. Make sure the SDK is running.
      </p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data?.users ?? []}
      filterKey="global"
      filterPlaceholder="Search by name or email..."
    />
  );
}
