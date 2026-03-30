"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export interface GymMember {
  id: string;
  displayName: string;
  photoURL?: string;
  age?: string;
  gender?: string;
  goals: string[];
  memberSince: string;
  gymId: string;
}

export const columns: ColumnDef<GymMember>[] = [
  {
    accessorKey: "displayName",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.displayName}</span>
    ),
  },
  {
    accessorKey: "gender",
    header: "Gender",
    cell: ({ row }) =>
      row.original.gender ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "age",
    header: "Age",
    cell: ({ row }) =>
      row.original.age ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "memberSince",
    header: "Member Since",
    cell: ({ row }) =>
      new Date(row.original.memberSince).toLocaleDateString(),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/gym/members/${row.original.id}`}>View</Link>
      </Button>
    ),
  },
];
