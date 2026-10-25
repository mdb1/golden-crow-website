"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleAlert,
  Hash,
  Layers3,
  Link2,
  ListPlus,
  Loader2,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  fileWizardSchema,
  resolveFileWizardSchema,
  type JsonSchema,
} from "@/lib/file-wizard-schema-catalog";
import { normalizeStoredFileContent } from "@/lib/file-storage";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };
type PathPart = string | number;

type WizardFrame = {
  label: string;
  path: PathPart[];
  schema: JsonSchema;
};

export const FILE_WIZARD_SUPPORTED_FORMAT_COUNT = 23;

function humanize(value: string) {
  return value
    .replace(/^pgo_/, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function valueType(value: JsonValue | undefined) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "number" && Number.isInteger(value)) return "integer";
  return typeof value;
}

function schemaType(schema: JsonSchema, root: JsonSchema, value?: JsonValue) {
  const resolved = resolveFileWizardSchema(schema, root);
  if (resolved.const !== undefined) return valueType(resolved.const as JsonValue);
  if (Array.isArray(resolved.type)) {
    const current = valueType(value);
    return resolved.type.includes(current) ? current : resolved.type[0];
  }
  if (resolved.type) return resolved.type;
  if (resolved.properties) return "object";
  if (resolved.items) return "array";
  const alternatives = resolved.oneOf ?? resolved.anyOf;
  if (alternatives?.length) {
    const current = valueType(value);
    const matched = alternatives.find(
      (candidate) => schemaType(candidate, root, value) === current,
    );
    return schemaType(matched ?? alternatives[0], root, value);
  }
  return "string";
}

function activeSchema(schema: JsonSchema, root: JsonSchema, value?: JsonValue) {
  const resolved = resolveFileWizardSchema(schema, root);
  const alternatives = resolved.oneOf ?? resolved.anyOf;
  if (!alternatives?.length) return resolved;
  const current = valueType(value);
  return (
    alternatives.find(
      (candidate) => schemaType(candidate, root, value) === current,
    ) ?? alternatives[0]
  );
}

function schemaAlternatives(schema: JsonSchema, root: JsonSchema) {
  const resolved = resolveFileWizardSchema(schema, root);
  return resolved.oneOf ?? resolved.anyOf ?? [];
}

function selectedSchema(
  schema: JsonSchema,
  root: JsonSchema,
  value: JsonValue | undefined,
  choiceIndex?: number,
) {
  const alternatives = schemaAlternatives(schema, root);
  if (
    alternatives.length > 0 &&
    choiceIndex !== undefined &&
    alternatives[choiceIndex]
  ) {
    return resolveFileWizardSchema(alternatives[choiceIndex], root);
  }
  if (alternatives.length > 0 && value !== undefined) {
    const structurallyValidIndex = alternatives.findIndex((candidate) =>
      isWizardValueComplete(value, candidate, root),
    );
    if (structurallyValidIndex >= 0) {
      return resolveFileWizardSchema(alternatives[structurallyValidIndex], root);
    }
  }
  return activeSchema(schema, root, value);
}

function inferredChoiceIndex(
  alternatives: JsonSchema[],
  root: JsonSchema,
  value: JsonValue | undefined,
) {
  if (value !== undefined) {
    const validIndex = alternatives.findIndex((candidate) =>
      isWizardValueComplete(value, candidate, root),
    );
    if (validIndex >= 0) return validIndex;
  }
  return Math.max(
    0,
    alternatives.findIndex(
      (candidate) => schemaType(candidate, root, value) === valueType(value),
    ),
  );
}

function choiceLabel(schema: JsonSchema, root: JsonSchema, index: number) {
  const resolved = resolveFileWizardSchema(schema, root);
  if (resolved.title) return resolved.title;
  if (resolved.const !== undefined) return `${String(resolved.const)} (constant)`;
  if (resolved.enum?.length) return resolved.enum.map(String).join(" / ");
  const type = schemaType(resolved, root);
  if (type === "array") {
    const itemType = schemaType(resolved.items ?? {}, root);
    return `${humanize(itemType)} list`;
  }
  return `${humanize(type)}${index > 0 ? ` ${index + 1}` : ""}`;
}

function dynamicRequiredKeys(schema: JsonSchema, value: JsonValue | undefined) {
  const required = new Set(schema.required ?? []);
  if (
    value &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    (value.type === "enum" || value.type === "multi_enum") &&
    schema.properties?.options
  ) {
    required.add("options");
  }
  return [...required];
}

function pathKey(path: PathPart[]) {
  return path.map(String).join(".");
}

function initialValue(
  schema: JsonSchema,
  root: JsonSchema,
  seenRefs: ReadonlySet<string> = new Set(),
): JsonValue {
  if (schema.$ref) {
    if (seenRefs.has(schema.$ref)) return {};
    return initialValue(
      resolveFileWizardSchema(schema, root),
      root,
      new Set([...seenRefs, schema.$ref]),
    );
  }
  const resolved = activeSchema(schema, root);
  if (resolved.const !== undefined) return resolved.const as JsonValue;
  if (resolved.default !== undefined) return resolved.default as JsonValue;
  if (resolved.enum?.length) return resolved.enum[0] as JsonValue;
  switch (schemaType(resolved, root)) {
    case "object":
      return Object.fromEntries(
        (resolved.required ?? []).map((key) => [
          key,
          initialValue(resolved.properties?.[key] ?? {}, root, seenRefs),
        ]),
      ) as JsonObject;
    case "array":
      return [];
    case "boolean":
      return false;
    case "integer":
    case "number":
      return typeof resolved.minimum === "number" ? resolved.minimum : 0;
    case "null":
      return null;
    default:
      return "";
  }
}

function readAt(root: JsonValue, path: PathPart[]): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const part of path) {
    if (typeof part === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[part];
    } else {
      if (!current || Array.isArray(current) || typeof current !== "object") {
        return undefined;
      }
      current = current[part];
    }
  }
  return current;
}

function writeAt(root: JsonValue, path: PathPart[], value: JsonValue): JsonValue {
  if (path.length === 0) return value;
  const [head, ...tail] = path;
  if (typeof head === "number") {
    const next = Array.isArray(root) ? [...root] : [];
    next[head] = writeAt(next[head] ?? null, tail, value);
    return next;
  }
  const next: JsonObject =
    root && !Array.isArray(root) && typeof root === "object" ? { ...root } : {};
  next[head] = writeAt(next[head] ?? null, tail, value);
  return next;
}

function removeAt(root: JsonValue, path: PathPart[]): JsonValue {
  if (path.length === 0) return {};
  const [head, ...tail] = path;
  if (typeof head === "number") {
    if (!Array.isArray(root)) return root;
    const next = [...root];
    if (tail.length === 0) next.splice(head, 1);
    else next[head] = removeAt(next[head], tail);
    return next;
  }
  if (!root || Array.isArray(root) || typeof root !== "object") return root;
  const next = { ...root };
  if (tail.length === 0) delete next[head];
  else next[head] = removeAt(next[head], tail);
  return next;
}

function stringIsValid(value: string, schema: JsonSchema) {
  if (typeof schema.minLength === "number" && value.length < schema.minLength) {
    return false;
  }
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
    return false;
  }
  if (schema.pattern) {
    try {
      if (!new RegExp(schema.pattern).test(value)) return false;
    } catch {
      // The SDK remains the authority for schema patterns unsupported by a browser.
    }
  }
  if (schema.format === "date") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const date = new Date(`${value}T00:00:00Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== Number(match[1]) ||
      date.getUTCMonth() + 1 !== Number(match[2]) ||
      date.getUTCDate() !== Number(match[3])
    ) {
      return false;
    }
  }
  if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
    return false;
  }
  if (schema.format === "uri") {
    try {
      new URL(value);
    } catch {
      return false;
    }
  }
  return true;
}

const PDF_DOWNLOAD_URL_ERROR =
  "Download URL must be a valid HTTPS URL ending in .pdf.";

function wizardSpecificValidationError(fileType: string, value: JsonValue) {
  if (fileType !== "pgo_pdf_report") return null;
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return PDF_DOWNLOAD_URL_ERROR;
  }
  const downloadUrl = value.download_url;
  if (
    typeof downloadUrl !== "string" ||
    downloadUrl.trim() !== downloadUrl
  ) {
    return PDF_DOWNLOAD_URL_ERROR;
  }
  try {
    const parsed = new URL(downloadUrl);
    return parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      parsed.pathname.toLowerCase().endsWith(".pdf")
      ? null
      : PDF_DOWNLOAD_URL_ERROR;
  } catch {
    return PDF_DOWNLOAD_URL_ERROR;
  }
}

export function isWizardValueComplete(
  value: JsonValue | undefined,
  schema: JsonSchema,
  root: JsonSchema,
  seenRefs: ReadonlySet<string> = new Set(),
): boolean {
  if (value === undefined) return false;
  if (schema.$ref) {
    if (seenRefs.has(schema.$ref)) return true;
    return isWizardValueComplete(
      value,
      resolveFileWizardSchema(schema, root),
      root,
      new Set([...seenRefs, schema.$ref]),
    );
  }
  const alternatives = schemaAlternatives(schema, root);
  if (alternatives.length) {
    return alternatives.some((candidate) =>
      isWizardValueComplete(value, candidate, root, seenRefs),
    );
  }
  const resolved = activeSchema(schema, root, value);
  if (resolved.enum && !resolved.enum.some((entry) => entry === value)) return false;
  switch (schemaType(resolved, root, value)) {
    case "object": {
      if (!value || Array.isArray(value) || typeof value !== "object") return false;
      if (
        resolved.properties?.type &&
        resolved.properties?.options &&
        value.options !== undefined &&
        value.type !== "enum" &&
        value.type !== "multi_enum"
      ) {
        return false;
      }
      return dynamicRequiredKeys(resolved, value).every((key) =>
        isWizardValueComplete(
          value[key],
          resolved.properties?.[key] ?? {},
          root,
          seenRefs,
        ),
      );
    }
    case "array":
      return (
        Array.isArray(value) &&
        value.length >= (resolved.minItems ?? 0) &&
        value.length <= (resolved.maxItems ?? Number.POSITIVE_INFINITY) &&
        value.every((item) =>
          isWizardValueComplete(item, resolved.items ?? {}, root, seenRefs),
        )
      );
    case "string":
      return typeof value === "string" && stringIsValid(value, resolved);
    case "integer":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= (resolved.minimum ?? Number.NEGATIVE_INFINITY) &&
        value <= (resolved.maximum ?? Number.POSITIVE_INFINITY)
      );
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= (resolved.minimum ?? Number.NEGATIVE_INFINITY) &&
        value <= (resolved.maximum ?? Number.POSITIVE_INFINITY)
      );
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

function scalarSummary(value: JsonValue | undefined) {
  if (value === undefined) return "Not set";
  if (value === null) return "Null";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") return value || "Empty text";
  return String(value);
}

function FieldTypeIcon({ type, format }: { type: string; format?: string }) {
  if (format === "date" || format === "date-time") {
    return <CalendarDays className="h-4 w-4" />;
  }
  if (format === "uri") return <Link2 className="h-4 w-4" />;
  if (type === "number" || type === "integer") {
    return <Hash className="h-4 w-4" />;
  }
  if (type === "boolean") return <ToggleLeft className="h-4 w-4" />;
  if (type === "array" || type === "object") {
    return <Layers3 className="h-4 w-4" />;
  }
  return <Type className="h-4 w-4" />;
}

function ScalarEditor({
  id,
  schema,
  rootSchema,
  value,
  onChange,
  choiceIndex,
  onChoiceIndexChange,
  showChoice = true,
}: {
  id: string;
  schema: JsonSchema;
  rootSchema: JsonSchema;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  choiceIndex?: number;
  onChoiceIndexChange?: (index: number) => void;
  showChoice?: boolean;
}) {
  const alternatives = schemaAlternatives(schema, rootSchema);
  const resolved = selectedSchema(schema, rootSchema, value, choiceIndex);
  const type = schemaType(resolved, rootSchema, value);
  const expectsPdfUrl =
    resolved.format === "uri" && resolved.pattern?.includes("[Pp][Dd][Ff]");
  const selectedAlternativeIndex =
    choiceIndex ??
    inferredChoiceIndex(alternatives, rootSchema, value);

  return (
    <div className="grid gap-3">
      {showChoice && alternatives.length > 1 ? (
        <Select
          value={String(selectedAlternativeIndex)}
          onValueChange={(nextIndex) => {
            const parsedIndex = Number(nextIndex);
            const nextSchema = alternatives[parsedIndex];
            if (nextSchema) {
              onChoiceIndexChange?.(parsedIndex);
              onChange(initialValue(nextSchema, rootSchema));
            }
          }}
        >
          <SelectTrigger
            aria-label="Value type"
            className="h-11 w-full rounded-xl bg-background px-3.5"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {alternatives.map((option, index) => (
              <SelectItem key={index} value={String(index)}>
                {choiceLabel(option, rootSchema, index)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {resolved.const !== undefined ? (
        <output
          id={id}
          className="flex min-h-11 items-center rounded-xl border border-border/80 bg-muted/45 px-3.5 text-sm font-medium text-foreground"
        >
          {String(resolved.const)}
        </output>
      ) : resolved.enum?.length ? (
        <Select
          value={JSON.stringify(value)}
          onValueChange={(nextValue) => onChange(JSON.parse(nextValue) as JsonValue)}
        >
          <SelectTrigger id={id} className="h-11 w-full rounded-xl bg-background px-3.5">
            <SelectValue placeholder="Choose a value" />
          </SelectTrigger>
          <SelectContent>
            {resolved.enum.map((option) => (
              <SelectItem key={JSON.stringify(option)} value={JSON.stringify(option)}>
                {String(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : type === "boolean" ? (
        <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-border/80 bg-background px-4 py-3 text-sm shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50/40 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/10">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          <span className="grid gap-0.5">
            <span className="font-medium text-foreground">
              {value === true ? "Yes" : "No"}
            </span>
            <span className="text-xs text-muted-foreground">
              Click to {value === true ? "turn this option off" : "turn this option on"}.
            </span>
          </span>
        </label>
      ) : type === "null" ? (
        <output
          id={id}
          className="flex min-h-11 items-center rounded-xl border border-border/80 bg-muted/45 px-3.5 text-sm text-muted-foreground"
        >
          No value is needed for this field.
        </output>
      ) : type === "number" || type === "integer" ? (
        <Input
          id={id}
          type="number"
          step={type === "integer" ? 1 : "any"}
          min={resolved.minimum}
          max={resolved.maximum}
          value={typeof value === "number" ? value : ""}
          className="h-11 rounded-xl bg-background px-3.5"
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
        />
      ) : resolved.maxLength && resolved.maxLength > 240 ? (
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-32 resize-y rounded-xl bg-background px-3.5 py-3 leading-6"
          placeholder="Add the information here"
        />
      ) : (
        <Input
          id={id}
          type={
            resolved.format === "date"
              ? "date"
              : resolved.format === "uri"
                ? "url"
                : "text"
          }
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 rounded-xl bg-background px-3.5"
          placeholder={
            resolved.format === "date-time"
              ? "Example: 2026-09-22T12:30:00Z"
              : resolved.format === "uri"
                ? expectsPdfUrl
                  ? "https://example.com/report.pdf"
                  : "https://example.com/file"
                : "Enter a value"
          }
        />
      )}
    </div>
  );
}

export function FileJsonWizard({
  open,
  fileType,
  initialJson,
  onOpenChange,
  onSave,
  presentation = "dialog",
  description,
  closeAfterSave = true,
  validateBeforeSave = true,
  onBusyChange,
  submittingLabel = "Validating...",
  title = "File JSON wizard",
  backLabel = "Back",
  cancelLabel = "Cancel",
  submitLabel = "Validate and use JSON",
}: {
  open: boolean;
  fileType: string;
  initialJson: string;
  onOpenChange: (open: boolean) => void;
  onSave: (json: string) => void | Promise<void>;
  presentation?: "dialog" | "embedded";
  description?: string;
  closeAfterSave?: boolean;
  validateBeforeSave?: boolean;
  onBusyChange?: (busy: boolean) => void;
  submittingLabel?: string;
  title?: string;
  backLabel?: string;
  cancelLabel?: string;
  submitLabel?: string;
}) {
  const schema = useMemo(() => fileWizardSchema(fileType), [fileType]);
  const [draft, setDraft] = useState<JsonValue>({});
  const [frames, setFrames] = useState<WizardFrame[]>([]);
  const [choiceSelections, setChoiceSelections] = useState<Record<string, number>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open || !schema) return;
    let nextDraft: JsonValue = initialValue(schema, schema);
    if (initialJson.trim()) {
      try {
        nextDraft = JSON.parse(
          normalizeStoredFileContent(initialJson),
        ) as JsonValue;
      } catch {
        // Keep a clean schema-shaped draft; the original textarea remains unchanged.
      }
    }
    setDraft(nextDraft);
    setFrames([
      {
        label: schema.title || humanize(fileType),
        path: [],
        schema,
      },
    ]);
    setChoiceSelections({});
    setSaveError("");
  }, [fileType, initialJson, open, schema]);

  const frame = frames.at(-1);
  const frameValue = frame ? readAt(draft, frame.path) : undefined;
  const resolvedFrameSchema = frame && schema
    ? selectedSchema(
        frame.schema,
        schema,
        frameValue,
        choiceSelections[pathKey(frame.path)],
      )
    : null;
  const frameType = resolvedFrameSchema && schema
    ? schemaType(resolvedFrameSchema, schema, frameValue)
    : null;
  const requiredKeys =
    frameType === "object" && resolvedFrameSchema
      ? dynamicRequiredKeys(resolvedFrameSchema, frameValue)
      : [];
  const completedRequiredCount =
    schema && frame
      ? requiredKeys.filter((key) =>
          isWizardValueComplete(
            readAt(draft, [...frame.path, key]),
            resolvedFrameSchema?.properties?.[key] ?? {},
            schema,
          ),
        ).length
      : 0;
  const requiredCompletionPercent = requiredKeys.length
    ? Math.round((completedRequiredCount / requiredKeys.length) * 100)
    : 100;
  const frameObject =
    frameValue && !Array.isArray(frameValue) && typeof frameValue === "object"
      ? frameValue
      : null;
  const hasConditionalFormOptions = Boolean(
    resolvedFrameSchema?.properties?.type &&
      resolvedFrameSchema?.properties?.options,
  );
  const showConditionalFormOptions =
    !hasConditionalFormOptions ||
    frameObject?.type === "enum" ||
    frameObject?.type === "multi_enum";

  async function saveWizard() {
    if (!schema || savingRef.current) return;
    const wizardError = wizardSpecificValidationError(fileType, draft);
    if (wizardError) {
      setSaveError(wizardError);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    onBusyChange?.(true);
    setSaveError("");
    try {
      let pretty = JSON.stringify(draft, null, 2);
      if (validateBeforeSave) {
        const fileContent = JSON.stringify(draft);
        const result = await sdkFetch<{
          valid: true;
          fileType: string;
          fileContent: string;
        }>("/file-storage/validate", {
          method: "POST",
          body: JSON.stringify({ fileType, fileContent }),
        });
        pretty = JSON.stringify(JSON.parse(result.fileContent), null, 2);
      }
      await onSave(pretty);
      if (closeAfterSave) {
        onOpenChange(false);
      }
    } catch (error) {
      setSaveError(
        error instanceof SdkRequestError
          ? error.message
          : error instanceof Error
            ? error.message
            : "The JSON could not be validated.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  function update(path: PathPart[], value: JsonValue) {
    setDraft((current) => writeAt(current, path, value));
    setSaveError("");
  }

  function navigate(label: string, path: PathPart[], childSchema: JsonSchema) {
    const current = readAt(draft, path);
    if (current === undefined && schema) update(path, initialValue(childSchema, schema));
    setFrames((currentFrames) => [
      ...currentFrames,
      { label, path, schema: childSchema },
    ]);
  }

  const wizardDescription =
    description ??
    `Build valid ${fileType} content. The wizard only fills the JSON text field; it never creates or saves a file by itself.`;
  const embedded = presentation === "embedded";

  const content = (
    <>
        {embedded ? (
          <div className="border-b border-violet-100 bg-[linear-gradient(135deg,rgba(245,243,255,0.88),rgba(236,254,255,0.68))] px-6 py-5 text-left dark:border-violet-400/16 dark:bg-[linear-gradient(135deg,rgba(46,16,101,0.24),rgba(8,47,73,0.22))] lg:px-8">
            <h3 className="flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-500/20">
                <WandSparkles className="h-5 w-5" />
              </span>
              {title}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {wizardDescription}
            </p>
          </div>
        ) : (
          <DialogHeader className="border-b border-border px-6 py-5 text-left">
            <DialogTitle className="flex items-center gap-2 font-heading text-2xl">
              <WandSparkles className="h-5 w-5 text-violet-600" />
              {title}
            </DialogTitle>
            <DialogDescription>{wizardDescription}</DialogDescription>
          </DialogHeader>
        )}

        <fieldset
          disabled={saving}
          aria-busy={saving}
          className="contents"
        >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5 lg:px-8">
          {!schema || !frame || !resolvedFrameSchema ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              This stored file type is not supported by the JSON wizard.
            </div>
          ) : (
            <div className="grid gap-5">
              <nav
                aria-label="Form sections"
                className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
              >
                {frames.map((entry, index) => (
                  <div key={`${entry.label}-${index}`} className="flex items-center gap-1.5">
                    {index > 0 ? <ArrowRight className="h-3.5 w-3.5" /> : null}
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-3 py-1.5 transition-colors hover:bg-muted hover:text-foreground",
                        index === frames.length - 1 &&
                          "bg-violet-100 font-medium text-violet-900 dark:bg-violet-500/20 dark:text-violet-100",
                      )}
                      onClick={() => setFrames((current) => current.slice(0, index + 1))}
                    >
                      {entry.label}
                    </button>
                  </div>
                ))}
              </nav>

              <div className="overflow-hidden rounded-3xl border border-violet-100 bg-[linear-gradient(135deg,rgba(245,243,255,0.82),rgba(255,255,255,0.96),rgba(236,254,255,0.5))] shadow-sm dark:border-violet-400/20 dark:bg-[linear-gradient(135deg,rgba(46,16,101,0.2),rgba(9,9,11,0.94),rgba(8,47,73,0.2))]">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-white text-violet-700 shadow-sm dark:border-violet-400/25 dark:bg-violet-950/45 dark:text-violet-200">
                      <FieldTypeIcon
                        type={frameType ?? "object"}
                        format={resolvedFrameSchema.format}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">
                        Current form section
                      </p>
                      <h3 className="mt-1 font-heading text-xl font-semibold text-foreground">
                        {frame.label}
                      </h3>
                      {resolvedFrameSchema.description ? (
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                          {resolvedFrameSchema.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {frameType === "object" ? (
                    <div className="w-full shrink-0 sm:w-52">
                      <span
                        aria-label={`${completedRequiredCount} of ${requiredKeys.length} required fields complete`}
                        className="flex items-center justify-between gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-100"
                      >
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Required fields
                        </span>
                        {completedRequiredCount}/{requiredKeys.length}
                      </span>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-violet-100 dark:bg-black/35 dark:ring-violet-400/20">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-emerald-500 transition-[width] duration-300"
                          style={{ width: `${requiredCompletionPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {frameType === "object" ? (
                <div className="overflow-hidden rounded-3xl border border-border/75 bg-card shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <div className="border-b border-border/70 bg-muted/25 px-5 py-4 lg:px-7">
                    <h4 className="font-semibold text-foreground">Complete the details</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Fill in the fields below. Required fields are clearly
                      marked, and optional details can be added when needed.
                    </p>
                  </div>
                  <div className="grid gap-x-8 gap-y-7 p-5 lg:grid-cols-2 lg:p-7">
                    {Object.entries(resolvedFrameSchema.properties ?? {})
                      .filter(
                        ([key]) =>
                          key !== "options" || showConditionalFormOptions,
                      )
                      .map(([key, childSchema]) => {
                      const childPath = [...frame.path, key];
                      const value = readAt(draft, childPath);
                      const required = requiredKeys.includes(key);
                      const childChoiceKey = pathKey(childPath);
                      const childChoiceIndex = choiceSelections[childChoiceKey];
                      const childAlternatives = schemaAlternatives(
                        childSchema,
                        schema,
                      );
                      const childResolved = selectedSchema(
                        childSchema,
                        schema,
                        value,
                        childChoiceIndex,
                      );
                      const type = schemaType(childResolved, schema, value);
                      const nested = type === "object" || type === "array";
                      const complete = isWizardValueComplete(
                        value,
                        childSchema,
                        schema,
                      );
                      const fullRow =
                        nested ||
                        (type === "string" &&
                          ((childResolved.maxLength ?? 0) > 120 ||
                            /(?:notes?|description|summary|content|body|text)$/i.test(key)));
                      return (
                        <div
                          key={key}
                          className={cn(
                            "grid content-start gap-3",
                            fullRow && "lg:col-span-2",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span
                                className={cn(
                                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
                                  complete
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200"
                                    : required
                                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200"
                                      : "border-border bg-muted/40 text-muted-foreground",
                                )}
                              >
                                {complete ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <FieldTypeIcon
                                    type={type}
                                    format={childResolved.format}
                                  />
                                )}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Label
                                    htmlFor={`wizard-${childPath.join("-")}`}
                                    className="text-sm font-semibold text-foreground"
                                  >
                                    {childSchema.title || humanize(key)}
                                    {required ? " *" : ""}
                                  </Label>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                      required
                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100"
                                        : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {required ? "Required" : "Optional"}
                                  </span>
                                </div>
                                {childSchema.description ? (
                                  <p className="mt-1.5 max-w-3xl text-xs leading-5 text-muted-foreground">
                                    {childSchema.description}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            {!required && value !== undefined ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Remove ${humanize(key)}`}
                                onClick={() =>
                                  setDraft((current) =>
                                    removeAt(current, childPath),
                                  )
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>

                          {childAlternatives.length > 1 ? (
                            <div className="grid gap-1.5">
                              <span className="text-xs font-medium text-muted-foreground">
                                Answer format
                              </span>
                              <Select
                                value={String(
                                  childChoiceIndex ??
                                    inferredChoiceIndex(
                                      childAlternatives,
                                      schema,
                                      value,
                                    ),
                                )}
                                onValueChange={(nextIndex) => {
                                  const parsedIndex = Number(nextIndex);
                                  const nextSchema =
                                    childAlternatives[parsedIndex];
                                  if (!nextSchema) return;
                                  setChoiceSelections((current) => ({
                                    ...current,
                                    [childChoiceKey]: parsedIndex,
                                  }));
                                  update(
                                    childPath,
                                    initialValue(nextSchema, schema),
                                  );
                                }}
                              >
                                <SelectTrigger
                                  aria-label={`${humanize(key)} value type`}
                                  className="h-11 w-full rounded-xl bg-background px-3.5"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {childAlternatives.map((alternative, index) => (
                                    <SelectItem key={index} value={String(index)}>
                                      {choiceLabel(alternative, schema, index)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}

                          {value === undefined && !required ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11 justify-self-start rounded-xl border-dashed px-4 text-muted-foreground hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/10 dark:hover:text-violet-100"
                              onClick={() =>
                                update(
                                  childPath,
                                  initialValue(childSchema, schema),
                                )
                              }
                            >
                              <Plus className="h-4 w-4" />
                              Add {humanize(key)}
                            </Button>
                          ) : nested ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-16 justify-between rounded-2xl border-violet-100 bg-violet-50/45 px-4 text-left shadow-none hover:border-violet-300 hover:bg-violet-50 dark:border-violet-400/20 dark:bg-violet-500/10 dark:hover:bg-violet-500/15"
                              aria-label={
                                type === "array"
                                  ? `${Array.isArray(value) ? value.length : 0} item(s)`
                                  : complete
                                    ? "Section complete"
                                    : "Complete this section"
                              }
                              onClick={() =>
                                navigate(
                                  childSchema.title || humanize(key),
                                  childPath,
                                  childSchema,
                                )
                              }
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-violet-700 shadow-sm dark:bg-violet-950/45 dark:text-violet-200">
                                  <Layers3 className="h-4 w-4" />
                                </span>
                                <span className="grid min-w-0 gap-0.5">
                                  <span className="truncate font-medium text-foreground">
                                    {type === "array"
                                      ? `${Array.isArray(value) ? value.length : 0} item(s)`
                                      : complete
                                        ? "Section complete"
                                        : "Complete this section"}
                                  </span>
                                  <span className="truncate text-xs font-normal text-muted-foreground">
                                    Open a guided form for these details
                                  </span>
                                </span>
                              </span>
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          ) : (
                            <ScalarEditor
                              id={`wizard-${childPath.join("-")}`}
                              schema={childSchema}
                              rootSchema={schema}
                              value={value ?? initialValue(childSchema, schema)}
                              choiceIndex={childChoiceIndex}
                              showChoice={false}
                              onChange={(nextValue) => {
                                if (key === "type" && typeof nextValue === "string") {
                                  const currentObject = readAt(draft, frame.path);
                                  if (
                                    currentObject &&
                                    !Array.isArray(currentObject) &&
                                    typeof currentObject === "object"
                                  ) {
                                    const nextObject: JsonObject = {
                                      ...currentObject,
                                      type: nextValue,
                                    };
                                    if (nextValue === "enum" || nextValue === "multi_enum") {
                                      nextObject.options ??= [];
                                    } else {
                                      delete nextObject.options;
                                    }
                                    update(frame.path, nextObject);
                                    return;
                                  }
                                }
                                update(childPath, nextValue);
                              }}
                            />
                          )}
                        </div>
                      );
                      })}
                  </div>
                </div>
              ) : frameType === "array" ? (
                <ArrayEditor
                  sectionLabel={frame.label}
                  path={frame.path}
                  schema={resolvedFrameSchema}
                  rootSchema={schema}
                  value={Array.isArray(frameValue) ? frameValue : []}
                  choiceSelections={choiceSelections}
                  onChoiceSelect={(choicePath, index) =>
                    setChoiceSelections((current) => ({
                      ...current,
                      [pathKey(choicePath)]: index,
                    }))
                  }
                  onChoicesReset={(choicePath) => {
                    const prefix = pathKey(choicePath);
                    setChoiceSelections((current) =>
                      prefix
                        ? Object.fromEntries(
                            Object.entries(current).filter(
                              ([key]) =>
                                key !== prefix && !key.startsWith(`${prefix}.`),
                            ),
                          )
                        : {},
                    );
                  }}
                  onUpdate={update}
                  onNavigate={navigate}
                />
              ) : (
                <ScalarEditor
                  id="wizard-root-value"
                  schema={resolvedFrameSchema}
                  rootSchema={schema}
                  value={frameValue}
                  onChange={(nextValue) => update(frame.path, nextValue)}
                />
              )}

              {saveError ? (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
        </fieldset>

        <DialogFooter
          className={cn(
            "border-t border-border bg-muted/35 px-6 py-4 lg:px-8",
            embedded &&
              "mx-0 mb-0 min-h-24 items-center gap-3 rounded-none bg-background/95 px-6 py-5 shadow-[0_-18px_50px_-32px_rgba(76,29,149,0.5)] lg:px-8",
          )}
        >
          {frames.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              className={cn(
                embedded && "h-12 rounded-full px-6 sm:mr-auto",
              )}
              onClick={() => setFrames((current) => current.slice(0, -1))}
              disabled={saving}
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className={cn(
              embedded &&
                "h-12 rounded-full border-violet-200 px-6 shadow-sm hover:border-violet-300 hover:bg-violet-50 dark:border-violet-400/25 dark:hover:bg-violet-500/10",
            )}
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className={cn(
              embedded &&
                "h-12 rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 px-7 text-white shadow-[0_14px_34px_-18px_rgba(109,40,217,0.9)] hover:from-violet-500 hover:to-cyan-500",
            )}
            onClick={() => void saveWizard()}
            disabled={saving || !schema}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? submittingLabel : submitLabel}
          </Button>
        </DialogFooter>
    </>
  );

  if (embedded) {
    return open ? (
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {content}
      </section>
    ) : null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}
    >
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden rounded-[2rem] p-0">
        {content}
      </DialogContent>
    </Dialog>
  );
}

function ArrayEditor({
  sectionLabel,
  path,
  schema,
  rootSchema,
  value,
  choiceSelections,
  onChoiceSelect,
  onChoicesReset,
  onUpdate,
  onNavigate,
}: {
  sectionLabel: string;
  path: PathPart[];
  schema: JsonSchema;
  rootSchema: JsonSchema;
  value: JsonValue[];
  choiceSelections: Record<string, number>;
  onChoiceSelect: (path: PathPart[], index: number) => void;
  onChoicesReset: (path: PathPart[]) => void;
  onUpdate: (path: PathPart[], value: JsonValue) => void;
  onNavigate: (label: string, path: PathPart[], schema: JsonSchema) => void;
}) {
  const itemSchema = schema.items ?? {};
  const maxItems = schema.maxItems ?? Number.POSITIVE_INFINITY;
  const itemNoun = /field/i.test(sectionLabel)
    ? "field"
    : /option/i.test(sectionLabel)
      ? "option"
      : "item";
  const itemNounTitle = humanize(itemNoun);

  function replace(next: JsonValue[], resetChoices = false) {
    if (resetChoices) onChoicesReset(path);
    onUpdate(path, next);
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border/75 bg-card shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-1 border-b border-border/70 bg-muted/25 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-7">
        <div>
          <h4 className="font-semibold text-foreground">{sectionLabel}</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Add each {itemNoun}, then open its guided form to complete the details.
          </p>
        </div>
        <span className="mt-2 self-start rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 sm:mt-0 dark:bg-violet-500/15 dark:text-violet-100">
          {value.length} {value.length === 1 ? itemNoun : `${itemNoun}s`}
        </span>
      </div>
      <div className="grid gap-4 p-5 lg:p-7">
        {value.length === 0 ? (
          <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-violet-200 bg-violet-50/30 px-4 py-10 text-center dark:border-violet-400/25 dark:bg-violet-500/5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm dark:bg-violet-950/45 dark:text-violet-200">
              <ListPlus className="h-5 w-5" />
            </span>
            <p className="font-medium text-foreground">
              No {itemNoun}s yet.
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Add the first {itemNoun} to start completing this part of the form.
            </p>
          </div>
        ) : null}
        {value.map((item, index) => {
        const itemPath = [...path, index];
        const itemChoiceIndex = choiceSelections[pathKey(itemPath)];
        const type = schemaType(
          selectedSchema(itemSchema, rootSchema, item, itemChoiceIndex),
          rootSchema,
          item,
        );
        const nested = type === "object" || type === "array";
        const complete = isWizardValueComplete(item, itemSchema, rootSchema);
        return (
          <div
            key={index}
            className="grid gap-4 rounded-2xl border border-border/80 bg-background p-4 shadow-sm transition-colors hover:border-violet-200 lg:p-5 dark:hover:border-violet-400/30"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
                    complete
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-100"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100",
                  )}
                >
                  {complete ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-medium text-foreground">
                    {itemNounTitle} {index + 1}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {complete
                      ? "Ready"
                      : nested
                        ? "Details still need attention"
                        : scalarSummary(item)}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${itemNoun} ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...value];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    replace(next, true);
                  }}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${itemNoun} ${index + 1} down`}
                  disabled={index === value.length - 1}
                  onClick={() => {
                    const next = [...value];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    replace(next, true);
                  }}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${itemNoun} ${index + 1}`}
                  onClick={() =>
                    replace(
                      value.filter((_, itemIndex) => itemIndex !== index),
                      true,
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {nested ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-12 justify-between rounded-xl border-violet-100 bg-violet-50/45 px-4 hover:border-violet-300 hover:bg-violet-50 dark:border-violet-400/20 dark:bg-violet-500/10 dark:hover:bg-violet-500/15"
                onClick={() =>
                  onNavigate(
                    `${itemNounTitle} ${index + 1}`,
                    itemPath,
                    itemSchema,
                  )
                }
              >
                <span className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-violet-700 dark:text-violet-200" />
                  Open {itemNoun} form
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <ScalarEditor
                id={`wizard-array-${itemPath.join("-")}`}
                schema={itemSchema}
                rootSchema={rootSchema}
                value={item}
                choiceIndex={itemChoiceIndex}
                onChoiceIndexChange={(nextIndex) =>
                  onChoiceSelect(itemPath, nextIndex)
                }
                onChange={(nextValue) => {
                  const next = [...value];
                  next[index] = nextValue;
                  replace(next);
                }}
              />
            )}
          </div>
        );
        })}
        <Button
          type="button"
          variant="outline"
          className="min-h-12 justify-center rounded-2xl border-dashed border-violet-200 bg-violet-50/25 text-violet-800 shadow-none hover:border-violet-400 hover:bg-violet-50 dark:border-violet-400/25 dark:bg-violet-500/5 dark:text-violet-100 dark:hover:bg-violet-500/10"
          disabled={value.length >= maxItems}
          onClick={() =>
            replace([...value, initialValue(itemSchema, rootSchema)], true)
          }
        >
          <ListPlus className="h-4 w-4" />
          Add {itemNoun}
        </Button>
      </div>
    </div>
  );
}
