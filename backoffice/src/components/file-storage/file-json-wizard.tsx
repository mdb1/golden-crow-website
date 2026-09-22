"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  ListPlus,
  Loader2,
  Plus,
  Trash2,
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
  const selectedAlternativeIndex =
    choiceIndex ??
    inferredChoiceIndex(alternatives, rootSchema, value);

  return (
    <div className="grid gap-2">
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
          <SelectTrigger aria-label="Value type" className="w-full">
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
        <Input id={id} value={String(resolved.const)} disabled readOnly />
      ) : resolved.enum?.length ? (
        <Select
          value={JSON.stringify(value)}
          onValueChange={(nextValue) => onChange(JSON.parse(nextValue) as JsonValue)}
        >
          <SelectTrigger id={id} className="w-full">
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
        <label className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          {value === true ? "True" : "False"}
        </label>
      ) : type === "null" ? (
        <Input id={id} value="null" disabled />
      ) : type === "number" || type === "integer" ? (
        <Input
          id={id}
          type="number"
          step={type === "integer" ? 1 : "any"}
          min={resolved.minimum}
          max={resolved.maximum}
          value={typeof value === "number" ? value : ""}
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
          className="min-h-28"
        />
      ) : (
        <Input
          id={id}
          type={resolved.format === "date" ? "date" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={resolved.format === "date-time" ? "2026-09-22T12:30:00Z" : undefined}
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
}: {
  open: boolean;
  fileType: string;
  initialJson: string;
  onOpenChange: (open: boolean) => void;
  onSave: (json: string) => void;
}) {
  const schema = useMemo(() => fileWizardSchema(fileType), [fileType]);
  const [draft, setDraft] = useState<JsonValue>({});
  const [frames, setFrames] = useState<WizardFrame[]>([]);
  const [choiceSelections, setChoiceSelections] = useState<Record<string, number>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

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
    if (!schema) return;
    setSaving(true);
    setSaveError("");
    try {
      const fileContent = JSON.stringify(draft);
      const result = await sdkFetch<{
        valid: true;
        fileType: string;
        fileContent: string;
      }>("/file-storage/validate", {
        method: "POST",
        body: JSON.stringify({ fileType, fileContent }),
      });
      const pretty = JSON.stringify(JSON.parse(result.fileContent), null, 2);
      onSave(pretty);
      onOpenChange(false);
    } catch (error) {
      setSaveError(
        error instanceof SdkRequestError
          ? error.message
          : error instanceof Error
            ? error.message
            : "The JSON could not be validated.",
      );
    } finally {
      setSaving(false);
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

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden rounded-[2rem] p-0">
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-2 font-heading text-2xl">
            <WandSparkles className="h-5 w-5 text-violet-600" />
            File JSON wizard
          </DialogTitle>
          <DialogDescription>
            Build valid {fileType} content. The wizard only fills the JSON text field;
            it never creates or saves a file by itself.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
          {!schema || !frame || !resolvedFrameSchema ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              This stored file type is not supported by the JSON wizard.
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {frames.map((entry, index) => (
                  <div key={`${entry.label}-${index}`} className="flex items-center gap-2">
                    {index > 0 ? <ArrowRight className="h-3.5 w-3.5" /> : null}
                    <button
                      type="button"
                      className={cn(
                        "hover:text-foreground",
                        index === frames.length - 1 && "font-medium text-foreground",
                      )}
                      onClick={() => setFrames((current) => current.slice(0, index + 1))}
                    >
                      {entry.label}
                    </button>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4 dark:border-violet-400/20 dark:bg-violet-500/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{frame.label}</h3>
                    {resolvedFrameSchema.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {resolvedFrameSchema.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {frameType === "object" ? (
                      <span
                        aria-label={`${completedRequiredCount} of ${requiredKeys.length} required fields complete`}
                        className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-950/35 dark:text-emerald-100"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {completedRequiredCount}/{requiredKeys.length} required
                      </span>
                    ) : null}
                    <span className="rounded-full border border-violet-200 bg-white px-3 py-1 font-mono text-xs text-violet-800 dark:border-violet-400/25 dark:bg-violet-950/40 dark:text-violet-100">
                      {frameType}
                    </span>
                  </div>
                </div>
              </div>

              {frameType === "object" ? (
                <div className="grid gap-3">
                  {Object.entries(resolvedFrameSchema.properties ?? {})
                    .filter(
                      ([key]) => key !== "options" || showConditionalFormOptions,
                    )
                    .map(
                    ([key, childSchema]) => {
                      const childPath = [...frame.path, key];
                      const value = readAt(draft, childPath);
                      const required = requiredKeys.includes(key);
                      const childChoiceKey = pathKey(childPath);
                      const childChoiceIndex = choiceSelections[childChoiceKey];
                      const childAlternatives = schemaAlternatives(childSchema, schema);
                      const childResolved = selectedSchema(
                        childSchema,
                        schema,
                        value,
                        childChoiceIndex,
                      );
                      const type = schemaType(childResolved, schema, value);
                      const nested = type === "object" || type === "array";
                      const complete = isWizardValueComplete(value, childSchema, schema);
                      return (
                        <div
                          key={key}
                          className="grid gap-3 rounded-2xl border border-border/80 bg-card/70 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              {complete ? (
                                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                              ) : (
                                <Circle className={cn("mt-0.5 h-5 w-5 shrink-0", required ? "text-amber-500" : "text-muted-foreground")} />
                              )}
                              <div className="min-w-0">
                                <Label htmlFor={`wizard-${childPath.join("-")}`} className="font-medium">
                                  {childSchema.title || humanize(key)}
                                  {required ? " *" : ""}
                                </Label>
                                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                                  {key} · {type}
                                </p>
                                {childSchema.description ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
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
                                aria-label={`Remove ${humanize(key)}`}
                                onClick={() => setDraft((current) => removeAt(current, childPath))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>

                          {childAlternatives.length > 1 ? (
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
                                const nextSchema = childAlternatives[parsedIndex];
                                if (!nextSchema) return;
                                setChoiceSelections((current) => ({
                                  ...current,
                                  [childChoiceKey]: parsedIndex,
                                }));
                                update(childPath, initialValue(nextSchema, schema));
                              }}
                            >
                              <SelectTrigger aria-label={`${humanize(key)} value type`} className="w-full">
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
                          ) : null}

                          {value === undefined && !required ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="justify-self-start"
                              onClick={() => update(childPath, initialValue(childSchema, schema))}
                            >
                              <Plus className="h-4 w-4" />
                              Add {humanize(key)}
                            </Button>
                          ) : nested ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="justify-between"
                              onClick={() => navigate(childSchema.title || humanize(key), childPath, childSchema)}
                            >
                              <span className="truncate">
                                {type === "array"
                                  ? `${Array.isArray(value) ? value.length : 0} item(s)`
                                  : complete
                                    ? "Section complete"
                                    : "Open section"}
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
                    },
                  )}
                </div>
              ) : frameType === "array" ? (
                <ArrayEditor
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

        <DialogFooter className="border-t border-border bg-muted/35 px-6 py-4">
          {frames.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFrames((current) => current.slice(0, -1))}
              disabled={saving}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void saveWizard()} disabled={saving || !schema}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? "Validating..." : "Validate and use JSON"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArrayEditor({
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

  function replace(next: JsonValue[], resetChoices = false) {
    if (resetChoices) onChoicesReset(path);
    onUpdate(path, next);
  }

  return (
    <div className="grid gap-3">
      {value.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No items yet.
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
          <div key={index} className="grid gap-3 rounded-2xl border border-border/80 bg-card/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {complete ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-amber-500" />
                )}
                <span className="font-medium">Item {index + 1}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {nested ? humanize(type) : scalarSummary(item)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move item ${index + 1} up`}
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
                  aria-label={`Move item ${index + 1} down`}
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
                  aria-label={`Remove item ${index + 1}`}
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
                className="justify-between"
                onClick={() => onNavigate(`Item ${index + 1}`, itemPath, itemSchema)}
              >
                Edit item
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
        className="justify-self-start"
        disabled={value.length >= maxItems}
        onClick={() =>
          replace([...value, initialValue(itemSchema, rootSchema)], true)
        }
      >
        <ListPlus className="h-4 w-4" />
        Add item
      </Button>
    </div>
  );
}
