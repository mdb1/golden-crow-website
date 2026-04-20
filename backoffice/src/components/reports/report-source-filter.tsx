"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SourceFilter = "all" | "myDNAMap" | "ActyonGenomics" | "vcf" | "2pq";

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All Sources" },
  { value: "myDNAMap", label: "PocketGenes" },
  { value: "ActyonGenomics", label: "ActyonGenomics" },
  { value: "vcf", label: "VCF" },
  { value: "2pq", label: "2PQ" },
];

interface ReportSourceFilterProps {
  value: SourceFilter;
  onSourceChange: (source: SourceFilter) => void;
}

export function ReportSourceFilter({ value, onSourceChange }: ReportSourceFilterProps) {
  return (
    <Select value={value} onValueChange={(v) => onSourceChange(v as SourceFilter)}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Filter by source" />
      </SelectTrigger>
      <SelectContent>
        {SOURCE_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
