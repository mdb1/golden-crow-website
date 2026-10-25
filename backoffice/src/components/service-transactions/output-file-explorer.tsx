"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Braces,
  Check,
  ChevronRight,
  CircleAlert,
  Clipboard,
  Database,
  ExternalLink,
  FileJson2,
  FileText,
  FolderTree,
  ListTree,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  fileWizardSchema,
  resolveFileWizardSchema,
  type JsonSchema,
} from "@/lib/file-wizard-schema-catalog";
import { appText } from "@/lib/language";
import { objectLabel } from "@/lib/pocket-genes-service-catalog";
import { sdkFetch } from "@/lib/sdk-client";
import type { SupportServiceTransactionOutputObjectDetail } from "@/lib/support-services";
import { cn } from "@/lib/utils";

type ExplorerView = "content" | "metadata" | "raw";
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };
type PathPart = string | number;
type ExplorerFrame = {
  label: string;
  path: PathPart[];
  schema: JsonSchema;
  value: JsonValue;
};

const ARRAY_PAGE_SIZE = 20;

function humanize(value: string) {
  return value
    .replace(/^pgo_/, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function jsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        jsonValue(entry),
      ]),
    );
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value ?? "");
}

function valueKind(value: JsonValue) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function schemaMatchesValue(schema: JsonSchema, root: JsonSchema, value: JsonValue) {
  const resolved = resolveFileWizardSchema(schema, root);
  if (resolved.const !== undefined && resolved.const !== value) return false;
  if (resolved.enum && !resolved.enum.includes(value)) return false;
  const types = Array.isArray(resolved.type)
    ? resolved.type
    : resolved.type
      ? [resolved.type]
      : [];
  if (types.length) {
    const kind = valueKind(value);
    const normalizedKind =
      kind === "number" && Number.isInteger(value) ? "integer" : kind;
    if (!types.includes(kind) && !types.includes(normalizedKind)) return false;
  }
  if (
    value &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    resolved.required?.some((key) => !(key in value))
  ) {
    return false;
  }
  if (value && !Array.isArray(value) && typeof value === "object") {
    for (const [key, propertySchema] of Object.entries(
      resolved.properties ?? {},
    )) {
      if (key in value && !schemaMatchesValue(propertySchema, root, value[key])) {
        return false;
      }
    }
  }
  return true;
}

function mergeDisplaySchema(base: JsonSchema, addition: JsonSchema) {
  return {
    ...base,
    ...addition,
    title: addition.title ?? base.title,
    description: addition.description ?? base.description,
    properties: {
      ...(base.properties ?? {}),
      ...(addition.properties ?? {}),
    },
    required: [
      ...new Set([...(base.required ?? []), ...(addition.required ?? [])]),
    ],
  } satisfies JsonSchema;
}

function schemaForValue(schema: JsonSchema, root: JsonSchema, value: JsonValue) {
  let resolved = resolveFileWizardSchema(schema, root);
  const alternatives = resolved.oneOf ?? resolved.anyOf;
  if (alternatives?.length) {
    resolved = resolveFileWizardSchema(
      alternatives.find((candidate) =>
        schemaMatchesValue(candidate, root, value),
      ) ?? alternatives[0],
      root,
    );
  }
  for (const entry of resolved.allOf ?? []) {
    const clause = resolveFileWizardSchema(entry, root);
    const condition = clause.if as JsonSchema | undefined;
    const selected = condition
      ? schemaMatchesValue(condition, root, value)
        ? (clause.then as JsonSchema | undefined)
        : (clause.else as JsonSchema | undefined)
      : clause;
    if (selected) {
      resolved = mergeDisplaySchema(
        resolved,
        resolveFileWizardSchema(selected, root),
      );
    }
  }
  return resolved;
}

function childSchema(
  frame: ExplorerFrame,
  root: JsonSchema,
  key: string | number,
  value: JsonValue,
) {
  const resolved = schemaForValue(frame.schema, root, frame.value);
  const candidate =
    typeof key === "number"
      ? (resolved.items ?? {})
      : (resolved.properties?.[key] ?? {});
  return schemaForValue(candidate, root, value);
}

function orderedObjectEntries(value: JsonObject, schema: JsonSchema) {
  const schemaKeys = Object.keys(schema.properties ?? {});
  const keys = [
    ...schemaKeys.filter((key) => key in value),
    ...Object.keys(value).filter((key) => !schemaKeys.includes(key)),
  ];
  return keys.map((key) => [key, value[key]] as const);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatDate(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function ScalarValue({
  label,
  description,
  value,
  required,
  format,
}: {
  label: string;
  description?: string;
  value: JsonValue;
  required: boolean;
  format?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const text =
    value === null
      ? t("No value")
      : typeof value === "boolean"
        ? t(value ? "Yes" : "No")
        : String(value);
  const isLong = text.length > 120 || text.includes("\n");
  const isUrl =
    typeof value === "string" &&
    (format === "uri" || /^https:\/\//i.test(value));

  return (
    <div className="grid gap-2 rounded-2xl border border-violet-100 bg-white/82 p-4 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
      <div className="flex flex-wrap items-center gap-2">
        <label className="font-medium text-foreground">{label}</label>
        {required ? (
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
            {t("Required")}
          </Badge>
        ) : null}
      </div>
      {description ? (
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      ) : null}
      {isLong ? (
        <Textarea value={text} readOnly rows={Math.min(8, text.split("\n").length + 2)} />
      ) : (
        <Input value={text} readOnly />
      )}
      {isUrl ? (
        <a
          href={String(value)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-violet-700 hover:underline dark:text-violet-200"
        >
          {t("Open URL")}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
}

function ContentExplorer({
  object,
}: {
  object: SupportServiceTransactionOutputObjectDetail;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const rootSchema = useMemo(
    () => fileWizardSchema(object.objectType) ?? {},
    [object.objectType],
  );
  const rootValue = useMemo(() => jsonValue(object.content), [object.content]);
  const [frames, setFrames] = useState<ExplorerFrame[]>([]);
  const [visibleItems, setVisibleItems] = useState(ARRAY_PAGE_SIZE);

  useEffect(() => {
    setFrames([
      {
        label: objectLabel(object.objectType),
        path: [],
        schema: rootSchema,
        value: rootValue,
      },
    ]);
  }, [object.objectType, rootSchema, rootValue]);

  const frame = frames.at(-1);
  useEffect(() => setVisibleItems(ARRAY_PAGE_SIZE), [frame?.path]);
  if (!frame) return null;
  const currentFrame = frame;
  const resolvedSchema = schemaForValue(frame.schema, rootSchema, frame.value);
  const required = new Set(resolvedSchema.required ?? []);

  function openChild(
    label: string,
    key: string | number,
    value: JsonValue,
  ) {
    setFrames((current) => [
      ...current,
      {
        label,
        path: [...currentFrame.path, key],
        schema: childSchema(currentFrame, rootSchema, key, value),
        value,
      },
    ]);
  }

  const objectEntries =
    frame.value && !Array.isArray(frame.value) && typeof frame.value === "object"
      ? orderedObjectEntries(frame.value, resolvedSchema)
      : [];
  const arrayItems = Array.isArray(frame.value) ? frame.value : [];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/58 p-3 dark:border-violet-400/16 dark:bg-violet-500/8">
        <nav aria-label={t("Output field path")} className="flex min-w-0 flex-wrap items-center gap-1.5">
          {frames.map((item, index) => (
            <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
              {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
              <button
                type="button"
                onClick={() => setFrames((current) => current.slice(0, index + 1))}
                className={cn(
                  "max-w-56 truncate rounded-lg px-2 py-1 text-sm transition",
                  index === frames.length - 1
                    ? "font-semibold text-foreground"
                    : "text-violet-700 hover:bg-white dark:text-violet-200 dark:hover:bg-slate-950/50",
                )}
              >
                {item.label}
              </button>
            </span>
          ))}
        </nav>
        {frames.length > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFrames((current) => current.slice(0, -1))}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("Back one level")}
          </Button>
        ) : null}
      </div>

      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {frame.label}
            </h2>
            {resolvedSchema.description ? (
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                {resolvedSchema.description}
              </p>
            ) : null}
          </div>
          <Badge variant="outline">
            {Array.isArray(frame.value)
              ? `${frame.value.length} ${t("items")}`
              : typeof frame.value === "object" && frame.value
                ? `${Object.keys(frame.value).length} ${t("fields")}`
                : t("Value")}
          </Badge>
        </div>
      </div>

      {objectEntries.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {objectEntries.map(([key, value]) => {
            const schema = childSchema(frame, rootSchema, key, value);
            const complex =
              Array.isArray(value) ||
              (value !== null && typeof value === "object");
            const label = schema.title || humanize(key);
            if (!complex) {
              return (
                <ScalarValue
                  key={key}
                  label={label}
                  description={schema.description}
                  value={value}
                  required={required.has(key)}
                  format={schema.format}
                />
              );
            }
            const count = Array.isArray(value)
              ? value.length
              : Object.keys(value).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => openChild(label, key, value)}
                className="group flex min-h-36 items-start gap-4 rounded-2xl border border-violet-100 bg-white/82 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg dark:border-violet-400/16 dark:bg-slate-950/42 dark:hover:border-violet-300/36"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/14 dark:text-violet-100">
                  {Array.isArray(value) ? (
                    <ListTree className="h-5 w-5" />
                  ) : (
                    <FolderTree className="h-5 w-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{label}</span>
                    {required.has(key) ? (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {t("Required")}
                      </Badge>
                    ) : null}
                  </span>
                  {schema.description ? (
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {schema.description}
                    </span>
                  ) : null}
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 dark:text-violet-200">
                    {t("Explore")} · {count} {Array.isArray(value) ? t("items") : t("fields")}
                    <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {arrayItems.length ? (
        <div className="grid gap-3">
          {arrayItems.slice(0, visibleItems).map((value, index) => {
            const schema = childSchema(frame, rootSchema, index, value);
            const label = schema.title || `${t("Item")} ${index + 1}`;
            const complex =
              Array.isArray(value) ||
              (value !== null && typeof value === "object");
            return complex ? (
              <button
                key={index}
                type="button"
                onClick={() => openChild(label, index, value)}
                className="group flex items-center gap-4 rounded-2xl border border-violet-100 bg-white/82 p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md dark:border-violet-400/16 dark:bg-slate-950/42"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 font-mono text-sm font-semibold text-violet-700 dark:bg-violet-500/14 dark:text-violet-100">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{label}</span>
                  <span className="text-xs text-muted-foreground">
                    {Array.isArray(value)
                      ? `${value.length} ${t("items")}`
                      : `${Object.keys(value).length} ${t("fields")}`}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </button>
            ) : (
              <ScalarValue
                key={index}
                label={label}
                description={schema.description}
                value={value}
                required={false}
                format={schema.format}
              />
            );
          })}
          {visibleItems < arrayItems.length ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setVisibleItems((current) => current + ARRAY_PAGE_SIZE)}
              className="justify-self-center rounded-full px-6"
            >
              {t("Load more")} ({Math.min(ARRAY_PAGE_SIZE, arrayItems.length - visibleItems)})
            </Button>
          ) : null}
        </div>
      ) : null}

      {!objectEntries.length && !arrayItems.length &&
      (typeof frame.value === "object" || Array.isArray(frame.value)) ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("This section has no values.")}
        </div>
      ) : null}
    </div>
  );
}

function MetadataView({
  object,
}: {
  object: SupportServiceTransactionOutputObjectDetail;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const fields = [
    [t("Output role"), object.role],
    [t("Object code"), object.objectCode],
    [t("Object type"), object.objectType],
    [t("Object identity"), object.objectId],
    [t("Revision"), String(object.objectRevision)],
    [t("Upload version"), String(object.uploadVersionCount)],
    [t("File source"), t(object.source === "file_storage" ? "Stored file" : "Remote URL")],
    [t("File size"), formatBytes(object.contentSizeBytes)],
    [t("File Storage ID"), object.fileStorageId ?? "—"],
    [t("Owner"), object.ownerName ?? "—"],
    [t("Created"), formatDate(object.createdAt)],
    [t("Updated"), formatDate(object.updatedAt)],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {fields.map(([label, value]) => (
        <div key={label} className="grid gap-2 rounded-2xl border border-violet-100 bg-white/82 p-4 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="break-all font-mono text-sm font-medium text-foreground">
            {value}
          </span>
        </div>
      ))}
      {object.sourceDownloadUrl ? (
        <a
          href={object.sourceDownloadUrl}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 text-violet-800 transition hover:border-violet-400 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-100"
        >
          <ExternalLink className="h-5 w-5" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-wide">
              {t("Source URL")}
            </span>
            <span className="block truncate text-sm">{object.sourceDownloadUrl}</span>
          </span>
        </a>
      ) : null}
    </div>
  );
}

export function ServiceTransactionOutputExplorer({
  transactionId,
  role,
  routeBase,
}: {
  transactionId: string;
  role: string;
  routeBase: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [view, setView] = useState<ExplorerView>("content");
  const [copied, setCopied] = useState(false);
  const query = useQuery({
    queryKey: ["support-service-transaction-output", transactionId, role],
    queryFn: () =>
      sdkFetch<{ object: SupportServiceTransactionOutputObjectDetail }>(
        `/admin/support-services/transactions/${encodeURIComponent(transactionId)}/output-objects/${encodeURIComponent(role)}`,
      ),
  });
  const object = query.data?.object;
  const transactionHref = `${routeBase}/${encodeURIComponent(transactionId)}`;
  const rawJson = useMemo(
    () => (object ? JSON.stringify(object.content, null, 2) : ""),
    [object],
  );

  if (query.isLoading) {
    return <Skeleton className="h-[44rem] w-full rounded-3xl" />;
  }
  if (query.error || !object) {
    return (
      <div className="grid gap-5 rounded-3xl border border-destructive/25 bg-destructive/5 p-6">
        <CircleAlert className="h-7 w-7 text-destructive" />
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            {t("Output file could not be loaded")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {query.error instanceof Error ? query.error.message : t("Action failed.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => query.refetch()}>
            {t("Retry")}
          </Button>
          <Button asChild variant="outline">
            <Link href={transactionHref}>
              <ArrowLeft className="h-4 w-4" />
              {t("Back to transaction")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const navigation: Array<{
    value: ExplorerView;
    label: string;
    icon: typeof FileJson2;
  }> = [
    { value: "content", label: t("Content explorer"), icon: FolderTree },
    { value: "metadata", label: t("Technical details"), icon: Database },
    { value: "raw", label: t("Raw JSON"), icon: Braces },
  ];

  return (
    <div className="grid gap-5">
      <section className="overflow-hidden rounded-3xl border border-violet-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,243,255,0.88)_58%,rgba(236,254,255,0.78))] shadow-[0_26px_80px_-58px_rgba(109,40,217,0.58)] dark:border-violet-400/16 dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(46,16,101,0.30))]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 px-5 py-4 dark:border-violet-400/14">
          <Button asChild variant="ghost" size="sm">
            <Link href={transactionHref}>
              <ArrowLeft className="h-4 w-4" />
              {t("Back to transaction")}
            </Link>
          </Button>
          <HeaderUnclutterButton />
        </div>
        <div className="grid gap-6 p-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:p-8">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-xl shadow-violet-500/20">
            <FileText className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-600 text-white">{t("Ready")}</Badge>
              <Badge variant="outline" className="font-mono">{object.role}</Badge>
              <Badge variant="outline" className="font-mono">{object.objectCode}</Badge>
            </div>
            <h1 className="mt-3 truncate font-heading text-3xl font-semibold text-foreground">
              {object.fileName || objectLabel(object.objectType)}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {objectLabel(object.objectType)} · <span className="font-mono">{object.objectType}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="grid min-h-[40rem] overflow-hidden rounded-3xl border border-violet-100 bg-background shadow-[0_24px_72px_-58px_rgba(15,23,42,0.48)] dark:border-violet-400/16 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border-b border-violet-100 bg-violet-50/55 p-4 dark:border-violet-400/14 dark:bg-violet-500/6 lg:border-b-0 lg:border-r lg:p-5">
          <div className="mb-4 hidden lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("File explorer")}
            </p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t("Read-only output file navigation.")}
            </p>
          </div>
          <nav aria-label={t("Output file sections")} className="flex gap-2 overflow-x-auto lg:grid lg:overflow-visible">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = view === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setView(item.value)}
                  className={cn(
                    "flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition lg:min-w-0",
                    active
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-500/18"
                      : "text-foreground hover:bg-white dark:hover:bg-slate-950/48",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-5 hidden rounded-2xl border border-violet-100 bg-white/72 p-4 text-xs leading-5 text-muted-foreground dark:border-violet-400/14 dark:bg-slate-950/32 lg:block">
            <span className="flex items-center gap-2 font-semibold text-foreground">
              <Check className="h-4 w-4 text-emerald-600" />
              {t("Read only")}
            </span>
            <p className="mt-2">
              {t("This explorer never changes the stored output file.")}
            </p>
          </div>
        </aside>

        <div className="min-w-0 overflow-x-hidden p-5 lg:p-8">
          {view === "content" ? <ContentExplorer object={object} /> : null}
          {view === "metadata" ? <MetadataView object={object} /> : null}
          {view === "raw" ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-xl font-semibold">{t("Raw JSON")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("Read-only finalized PGO content.")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(rawJson);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1800);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                  {copied ? t("Copied") : t("Copy JSON")}
                </Button>
              </div>
              <pre className="max-h-[58rem] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-5 text-xs leading-6 text-slate-100 shadow-inner dark:border-slate-700">
                {rawJson}
              </pre>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
