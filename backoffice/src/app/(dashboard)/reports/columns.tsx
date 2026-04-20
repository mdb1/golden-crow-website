"use client";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ReportPill } from "@/components/reports/report-pill";
import {
  formatReportFormat,
  getReportSourceMeta,
} from "@/lib/moderation-utils";
import Link from "next/link";

// Type copied from goldencrow-sdk/src/types/sdk.types.ts to avoid SDK source coupling
export type SourceKey = "myDNAMap" | "ActyonGenomics" | "vcf" | "2pq";

export interface DnaReport {
  id: string;
  code: string;
  source: SourceKey;
  userId: string;
  downloadUrl: string | null;
  createdAt?: string;
  uploadedReportId?: string;
  providerFormat?: string | null;
  providerName?: string | null;
  trackingStatus?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
}

export const columns: ColumnDef<DnaReport>[] = [
  {
    accessorKey: "code",
    header: "Report Code",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.code}</span>
    ),
  },
  {
    accessorKey: "source",
    header: "Source",
    cell: ({ row }) => {
      const sourceMeta = getReportSourceMeta(row.original.source);
      const formatLabel = formatReportFormat(row.original.providerFormat);

      return (
        <div className="flex flex-wrap gap-2">
          <ReportPill label={sourceMeta.label} color={sourceMeta.color} />
          {formatLabel ? <ReportPill label={formatLabel} color="#4E8FBB" /> : null}
        </div>
      );
    },
  },
  {
    accessorKey: "userId",
    header: "User UID",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.userId.slice(0, 8)}…
      </span>
    ),
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
        <Link href={`/reports/${row.original.id}?userId=${row.original.userId}`}>
          View
        </Link>
      </Button>
    ),
  },
];
