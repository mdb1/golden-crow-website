"use client";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

// Type copied from goldencrow-sdk/src/types/sdk.types.ts to avoid direct SDK source import
export interface CommunityPost {
  id: string;
  title: string;
  body: string;
  community: string;
  tags: string[];
  authorId: string;
  authorEmail: string;
  authorAvatarURL?: string;
  authorIconName?: string;
  authorIconColorHex?: string;
  createdAt: string;
  updatedAt?: string;
  commentCount: number;
  upvotes: number;
  downvotes: number;
  score: number;
}

export const columns: ColumnDef<CommunityPost>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <span className="font-medium line-clamp-1">{row.original.title}</span>
    ),
  },
  {
    accessorKey: "community",
    header: "Community",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.community}</Badge>
    ),
  },
  {
    accessorKey: "authorEmail",
    header: "Author",
  },
  {
    accessorKey: "score",
    header: "Score",
    cell: ({ row }) => {
      const { upvotes, downvotes, score } = row.original;
      return (
        <span className="text-sm text-muted-foreground">
          {upvotes}/{downvotes}{" "}
          <span className="font-medium text-foreground">({score > 0 ? `+${score}` : score})</span>
        </span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Date",
    cell: ({ row }) => {
      const date = row.original.createdAt;
      return date ? new Date(date).toLocaleDateString() : "—";
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/community/${row.original.id}`}>View</Link>
      </Button>
    ),
  },
];
