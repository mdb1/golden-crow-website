"use client";
import { useQuery } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { columns, CommunityPost } from "@/app/(dashboard)/community/columns";

export function PostTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["community-posts"],
    queryFn: () =>
      sdkFetch<{ posts: CommunityPost[] }>("/community/posts"),
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
        Failed to load posts. Make sure the SDK is running.
      </p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data?.posts ?? []}
      filterKey="global"
      filterPlaceholder="Search posts..."
    />
  );
}
