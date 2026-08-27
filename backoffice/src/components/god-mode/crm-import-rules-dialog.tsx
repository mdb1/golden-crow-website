"use client";

import { FileCheck2, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDiscoverOrganizationCountryGroups } from "@/lib/discover-organization-fields";
import { appText, type AppLanguage } from "@/lib/language";
import {
  CRM_CATEGORY_OPTIONS,
  CRM_STATUS_OPTIONS,
  CRM_TEMPLATE_STATUS_OPTIONS,
} from "@/lib/partnership-crm";

type ImportRulesKind = "organizations" | "templates";

type RuleLine = {
  label: string;
  detail: string;
};

const ORGANIZATION_HEADERS = [
  "name",
  "category",
  "website",
  "country",
  "status",
  "contact_name",
  "email",
  "linkedin",
  "last_contact_at",
  "notes",
] as const;

const TEMPLATE_HEADERS = [
  "name",
  "category",
  "subject",
  "body",
  "status",
  "notes",
] as const;

function csvHeadersFor(kind: ImportRulesKind) {
  return kind === "organizations" ? ORGANIZATION_HEADERS : TEMPLATE_HEADERS;
}

function requiredHeadersFor(kind: ImportRulesKind) {
  return kind === "organizations"
    ? ["name"]
    : ["name", "subject", "body"];
}

function optionalHeadersFor(kind: ImportRulesKind) {
  const required = new Set(requiredHeadersFor(kind));
  return csvHeadersFor(kind).filter((header) => !required.has(header));
}

function ruleLinesFor(kind: ImportRulesKind): RuleLine[] {
  if (kind === "organizations") {
    return [
      {
        label: "name",
        detail:
          "Required, trimmed, maximum 180 characters. Blank names are invalid rows.",
      },
      {
        label: "category",
        detail:
          "Optional single value. Use one canonical org_* category key, or an exact Discover organization label. Unknown values become blank.",
      },
      {
        label: "country",
        detail:
          "Optional single value. Use one country from the CRM whitelist. GLOBAL is not accepted here.",
      },
      {
        label: "status",
        detail:
          "Optional. Defaults to new when blank. Spanish aliases are normalized by the CSV parser.",
      },
      {
        label: "contact_name",
        detail:
          "Optional. Store only the primary contact person's name, not the email or notes.",
      },
      {
        label: "email",
        detail:
          "Optional. Missing email does not block import, but the row cannot send CRM email until an email is added.",
      },
      {
        label: "last_contact_at",
        detail:
          "Optional. Use a full ISO datetime with timezone, or leave blank when there was no previous contact.",
      },
      {
        label: "notes",
        detail:
          "Optional plain operational notes, maximum 2000 characters. Do not paste long scraped pages or JSON blobs.",
      },
    ];
  }

  return [
    {
      label: "name",
      detail:
        "Required, trimmed, maximum 180 characters. This is the internal template name.",
    },
    {
      label: "subject",
      detail:
        "Required, trimmed, maximum 180 characters. Variables such as {{organization_name}} are allowed.",
    },
    {
      label: "body",
      detail:
        "Required, maximum 12000 characters. Use quoted multiline cells or literal \\n for line breaks.",
    },
    {
      label: "category",
      detail:
        "Optional single value. Use one canonical org_* category key, or an exact Discover organization label. Unknown values become blank.",
    },
    {
      label: "status",
      detail:
        "Optional. Defaults to active when blank. Active, inactive, and archived aliases are normalized.",
    },
    {
      label: "notes",
      detail:
        "Optional internal notes, maximum 2000 characters. Literal \\n is converted to a line break.",
    },
  ];
}

function countryOptions(language: AppLanguage) {
  return getDiscoverOrganizationCountryGroups(language).map((group) => ({
    ...group,
    options: group.options.filter((option) => option.code !== "GLOBAL"),
  }));
}

function OptionGrid({
  items,
}: {
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.value}
          className="min-w-0 rounded-lg border border-border/80 bg-background/70 px-3 py-2"
        >
          <code className="block truncate font-mono text-[0.72rem] text-foreground">
            {item.value}
          </code>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CrmImportRulesDialog({
  open,
  onOpenChange,
  language,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: AppLanguage;
  kind: ImportRulesKind;
}) {
  const t = (text: string) => appText(language, text);
  const headers = csvHeadersFor(kind);
  const requiredHeaders = requiredHeadersFor(kind);
  const optionalHeaders = optionalHeadersFor(kind);
  const lines = ruleLinesFor(kind);
  const statusOptions =
    kind === "organizations" ? CRM_STATUS_OPTIONS : CRM_TEMPLATE_STATUS_OPTIONS;
  const countries = kind === "organizations" ? countryOptions(language) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("Import rules")}</DialogTitle>
          <DialogDescription>
            {kind === "organizations"
              ? t("Rules for CRM organization CSV imports.")
              : t("Rules for CRM template CSV imports.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <section className="rounded-xl border border-border/80 bg-background/70 p-4">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              <h3 className="font-heading text-sm font-semibold">
                {t("CSV structure")}
              </h3>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
              <div className="rounded-lg bg-muted/35 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("Header row")}
                </p>
                <code className="mt-2 block whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                  {headers.join(",")}
                </code>
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground">
                <p>{t("First row must contain supported column headers.")}</p>
                <p>
                  {t(
                    "Use comma-separated CSV and quote cells that contain commas, quotes, or line breaks.",
                  )}
                </p>
                <p>{t("Escape quotes by doubling them.")}</p>
                <p>{t("Empty rows are ignored.")}</p>
              </div>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.55fr)_minmax(0,1fr)]">
            <section className="rounded-xl border border-border/80 bg-background/70 p-4">
              <h3 className="font-heading text-sm font-semibold">
                {t("Required columns")}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {requiredHeaders.map((header) => (
                  <Badge key={header} variant="success">
                    {header}
                  </Badge>
                ))}
              </div>
              <h3 className="mt-5 font-heading text-sm font-semibold">
                {t("Optional columns")}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {optionalHeaders.map((header) => (
                  <Badge key={header} variant="outline">
                    {header}
                  </Badge>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border/80 bg-background/70 p-4">
              <h3 className="font-heading text-sm font-semibold">
                {t("Field rules")}
              </h3>
              <div className="mt-3 divide-y divide-border/70 rounded-lg border border-border/70">
                {lines.map((line) => (
                  <div
                    key={line.label}
                    className="grid gap-1 px-3 py-2.5 sm:grid-cols-[140px_minmax(0,1fr)]"
                  >
                    <code className="font-mono text-xs text-foreground">
                      {line.label}
                    </code>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t(line.detail)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-border/80 bg-background/70 p-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              <h3 className="font-heading text-sm font-semibold">
                {t("Accepted statuses")}
              </h3>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <Badge key={option.value} variant="secondary">
                  <code className="font-mono">{option.value}</code>
                  <span className="ml-1 text-muted-foreground">
                    {t(option.label)}
                  </span>
                </Badge>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border/80 bg-background/70 p-4">
            <h3 className="font-heading text-sm font-semibold">
              {t("Accepted categories")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Use canonical org_* keys when possible.")}
            </p>
            <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border/80 bg-muted/20 p-3">
              <OptionGrid
                items={CRM_CATEGORY_OPTIONS.map((category) => ({
                  value: category.value,
                  label: t(category.label),
                }))}
              />
            </div>
          </section>

          {kind === "organizations" ? (
            <section className="rounded-xl border border-border/80 bg-background/70 p-4">
              <h3 className="font-heading text-sm font-semibold">
                {t("Accepted countries")}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "Use one normalized country code from the CRM country whitelist. GLOBAL is not accepted.",
                )}
              </p>
              <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border/80 bg-muted/20 p-3">
                <div className="grid gap-4">
                  {countries.map((group) => (
                    <div key={group.key} className="grid gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {t(group.label)}
                      </p>
                      <OptionGrid
                        items={group.options.map((country) => ({
                          value: country.code,
                          label: country.label,
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-blue-200/70 bg-blue-50/75 p-4 text-blue-950 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-100">
            <h3 className="font-heading text-sm font-semibold">
              {t("Import behavior")}
            </h3>
            <ul className="mt-3 grid gap-2 text-xs leading-5">
              {(kind === "organizations"
                ? [
                    "Always review preview results before final import.",
                    "Organization imports preview and commit in 100-row chunks with a browser checkpoint.",
                    "If the import fails in the middle, completed rows are kept and the checkpoint can resume from the last saved point.",
                    "Duplicates must be reviewed as skip, update existing, or import anyway before committing.",
                  ]
                : [
                    "Preview the parsed template rows before creating templates.",
                    "Template imports create valid rows one by one; invalid rows are skipped and completed rows are not reverted.",
                    "Literal \\n is converted to a line break in template body and notes.",
                    "Use active templates for the CRM send flow; archived templates are kept out of normal sending.",
                  ]
              ).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <span>{t(item)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
