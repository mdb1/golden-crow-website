"use client";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

// Type copied from goldencrow-sdk/src/types/sdk.types.ts to avoid direct SDK source import
export interface AdminUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
  lastSignInAt: string;
  photoURL: string | null;
  displayName: string;
  age?: number;
  sex?: "male" | "female" | "other" | "prefer_not_to_say";
  country?: string;
  conditions: string[];
  onboardingCompleted: boolean;
  patientID?: string;
  hiddenFields: string[];
  iconName: string;
  iconColorHex: string;
}

export const columns: ColumnDef<AdminUser>[] = [
  {
    accessorKey: "displayName",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.displayName || "—"}</span>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "disabled",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.disabled ? "destructive" : "secondary"}>
        {row.original.disabled ? "Disabled" : "Active"}
      </Badge>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Joined",
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
        <Link href={`/users/${row.original.uid}`}>View</Link>
      </Button>
    ),
  },
];
