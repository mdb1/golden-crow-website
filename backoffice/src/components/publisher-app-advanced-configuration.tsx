"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Boxes,
  Check,
  CircleCheck,
  ExternalLink,
  Globe2,
  Languages,
  LoaderCircle,
  Link2,
  Mail,
  Moon,
  Palette,
  Plus,
  Rocket,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import type {
  PublisherAppAdvancedConfiguration,
  PublisherAppColorCatalogOption,
  PublisherAppColors,
  PublisherAppLearnConfiguration,
  PublisherAppLearnLesson,
  PublisherAppLearnSubject,
  PublisherAppSemanticColors,
  PublisherAppTextCatalogOption,
} from "@/lib/publisher-app-config";
import {
  normalizePublisherAppColor,
  publisherAppSemanticColors,
} from "@/lib/publisher-app-config";
import { fetchPublisherAppCustomizationCatalog } from "@/lib/publisher-app-customization-catalog-client";

const ADVANCED_CONFIGURATION_FALLBACK_TONE = "#6D28D9";

function colorChannelToLinear(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function brandToneForeground(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance =
    0.2126 * colorChannelToLinear(red) +
    0.7152 * colorChannelToLinear(green) +
    0.0722 * colorChannelToLinear(blue);
  const dark = "#0F1728";
  const light = "#FFFFFF";
  const darkLuminance = 0.008;
  const darkContrast =
    (Math.max(luminance, darkLuminance) + 0.05) /
    (Math.min(luminance, darkLuminance) + 0.05);
  const lightContrast = 1.05 / (luminance + 0.05);
  return darkContrast >= lightContrast ? dark : light;
}

export function publisherAppBrandThemeStyle(color?: string): CSSProperties {
  const tone =
    normalizePublisherAppColor(color) ?? ADVANCED_CONFIGURATION_FALLBACK_TONE;
  return {
    "--primary": tone,
    "--primary-foreground": brandToneForeground(tone),
    "--ring": tone,
  } as CSSProperties;
}

const PublisherAppBrandThemeContext = createContext<CSSProperties | null>(null);

function PublisherAppBrandDialogContent({
  style,
  ...props
}: ComponentProps<typeof DialogContent>) {
  const brandTheme = useContext(PublisherAppBrandThemeContext);
  return (
    <DialogContent {...props} style={{ ...(brandTheme ?? {}), ...style }} />
  );
}

const SEMANTIC_COLOR_FIELDS: Array<{
  key: keyof PublisherAppSemanticColors;
  label: string;
  description: string;
}> = [
  { key: "primary", label: "Principal", description: "Color central de marca" },
  {
    key: "primaryStrong",
    label: "Principal fuerte",
    description: "Acciones y gradientes",
  },
  {
    key: "primaryDeep",
    label: "Principal profundo",
    description: "Contraste y profundidad",
  },
  {
    key: "primarySoft",
    label: "Principal suave",
    description: "Destacados delicados",
  },
  {
    key: "secondary",
    label: "Secundario",
    description: "Color complementario",
  },
  { key: "accent", label: "Acento", description: "Énfasis prominente" },
  {
    key: "accentTextLight",
    label: "Texto de acento claro",
    description: "Texto sobre superficies claras",
  },
  {
    key: "accentTextDark",
    label: "Texto de acento oscuro",
    description: "Texto en modo oscuro",
  },
  {
    key: "accentSurfaceLight",
    label: "Superficie de acento",
    description: "Fondos claros tintados",
  },
];

const TOPICS = [
  ["genetics_and_genomics", "Genética y genómica"],
  ["health_and_wellness", "Salud y bienestar"],
  ["personalized_medicine", "Medicina personalizada"],
  ["genetic_diseases", "Enfermedades genéticas"],
  ["variants_and_vcf", "Variantes y VCF"],
  ["bioinformatics", "Bioinformática"],
  ["diagnosis_and_interpretation", "Diagnóstico e interpretación"],
  ["research_and_technology", "Investigación y tecnología"],
  ["infrastructure_and_pipelines", "Infraestructura y pipelines"],
  ["pocket_genes_files_services", "Archivos y servicios Pocket Genes"],
] as const;

type CatalogKind = "colors" | "texts";

function useCustomizationCatalog<T>(kind: CatalogKind, enabled: boolean) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = async (cursor: string | null, append: boolean) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "20" });
    if (query.trim()) params.set("q", query.trim());
    if (group) params.set("group", group);
    if (cursor) params.set("cursor", cursor);
    try {
      const page = await fetchPublisherAppCustomizationCatalog<T>(kind, params);
      setItems((current) =>
        append ? [...current, ...page.items] : page.items,
      );
      setGroups(page.groups);
      setTotalCount(page.totalCount);
      setNextCursor(page.nextCursor);
    } catch (catalogError) {
      setError(
        catalogError instanceof Error
          ? catalogError.message
          : "No se pudo cargar el catálogo.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    const timeout = window.setTimeout(() => void fetchPage(null, false), 250);
    return () => window.clearTimeout(timeout);
    // fetchPage intentionally follows the current search controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, group, kind, query]);

  return {
    query,
    setQuery,
    group,
    setGroup,
    items,
    groups,
    totalCount,
    nextCursor,
    loading,
    error,
    loadMore: () => fetchPage(nextCursor, true),
  };
}

function CatalogSearchControls({
  query,
  onQueryChange,
  group,
  onGroupChange,
  groups,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  group: string;
  onGroupChange: (value: string) => void;
  groups: string[];
  totalCount: number;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-1 rounded-2xl border bg-background/95 p-3 shadow-sm backdrop-blur">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_18rem_auto] md:items-center">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar opciones disponibles"
            className="h-11 pl-10"
            value={query}
            placeholder="Buscar por clave, texto, uso o grupo…"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <Select
          value={group || "__all__"}
          onValueChange={(value) =>
            onGroupChange(value === "__all__" ? "" : value)
          }
        >
          <SelectTrigger className="h-11" aria-label="Filtrar por grupo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los grupos</SelectItem>
            {groups.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge
          variant="secondary"
          className="justify-center rounded-full px-3 py-1.5"
        >
          {totalCount.toLocaleString("es-AR")} opciones
        </Badge>
      </div>
    </div>
  );
}

function CatalogLoadingState() {
  return (
    <div className="flex min-h-36 items-center justify-center gap-3 text-sm text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin" /> Buscando en el catálogo…
    </div>
  );
}

function splitHexColor(value: string) {
  const normalized = value.toUpperCase();
  const color = /^#[0-9A-F]{6}/.test(normalized)
    ? normalized.slice(0, 7)
    : "#000000";
  const opacity = /^#[0-9A-F]{8}$/.test(normalized)
    ? Math.round((Number.parseInt(normalized.slice(7), 16) / 255) * 100)
    : 100;
  return { color, opacity };
}

function hexColorWithOpacity(color: string, opacity: number) {
  if (opacity >= 100) return color.toUpperCase();
  const alpha = Math.round((Math.max(0, opacity) / 100) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `${color.toUpperCase()}${alpha}`;
}

function ColorValueControl({
  label,
  value,
  onChange,
  allowOpacity = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowOpacity?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const initialColor = splitHexColor(value);
  const [draft, setDraft] = useState(initialColor.color);
  const [opacity, setOpacity] = useState(initialColor.opacity);
  const draftValue = allowOpacity
    ? hexColorWithOpacity(draft, opacity)
    : draft.toUpperCase();

  const openPicker = () => {
    const current = splitHexColor(value);
    setDraft(current.color);
    setOpacity(current.opacity);
    setOpen(true);
  };

  return (
    <>
      <div className="rounded-2xl border bg-muted/25 p-4">
        <p className="text-sm font-medium">{label}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className="size-11 rounded-full border-4 border-background shadow-sm ring-1 ring-border"
            style={{ backgroundColor: value }}
          />
          <code className="min-w-0 flex-1 text-sm font-semibold">{value}</code>
          <Button type="button" variant="outline" onClick={openPicker}>
            Cambiar color
          </Button>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <PublisherAppBrandDialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar color</DialogTitle>
            <DialogDescription>
              Elegí un nuevo valor para {label.toLowerCase()}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <label className="relative flex cursor-pointer flex-col items-center justify-center rounded-3xl border bg-muted/25 p-8 text-center transition hover:bg-muted/45">
              <span
                className="size-32 rounded-full border-8 border-background shadow-lg ring-1 ring-border"
                style={{ backgroundColor: draftValue }}
              />
              <span className="mt-5 font-semibold">Elegir otro color</span>
              <span className="mt-1 text-sm text-muted-foreground">
                Se abrirá el selector de color del sistema.
              </span>
              <input
                aria-label={`Elegir ${label.toLowerCase()}`}
                type="color"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={draft}
                onChange={(event) => setDraft(event.target.value.toUpperCase())}
              />
            </label>
            <div className="flex items-center justify-between rounded-2xl border px-4 py-3">
              <span className="text-sm text-muted-foreground">Hexadecimal</span>
              <code className="font-semibold">{draftValue}</code>
            </div>
            {allowOpacity ? (
              <div className="rounded-2xl border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Opacidad</span>
                  <span className="text-sm font-semibold">{opacity}%</span>
                </div>
                <input
                  aria-label={`Opacidad de ${label.toLowerCase()}`}
                  type="range"
                  min={0}
                  max={100}
                  value={opacity}
                  className="mt-3 w-full accent-primary"
                  onChange={(event) => setOpacity(Number(event.target.value))}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChange(draftValue);
                setOpen(false);
              }}
            >
              <Check className="size-4" /> Usar este color
            </Button>
          </DialogFooter>
        </PublisherAppBrandDialogContent>
      </Dialog>
    </>
  );
}

function ColorOverridesEditor({
  value,
  onChange,
}: {
  value: PublisherAppAdvancedConfiguration["colorOverrides"];
  onChange: (
    value: PublisherAppAdvancedConfiguration["colorOverrides"],
  ) => void;
}) {
  const [screen, setScreen] = useState<"loaded" | "browse" | "edit">("loaded");
  const [returnScreen, setReturnScreen] = useState<"loaded" | "browse">(
    "loaded",
  );
  const [selected, setSelected] =
    useState<PublisherAppColorCatalogOption | null>(null);
  const [editing, setEditing] = useState<{ light?: string; dark?: string }>({});
  const [colorPicker, setColorPicker] = useState<{
    mode: "light" | "dark";
    label: string;
  } | null>(null);
  const [pickerValue, setPickerValue] = useState("#000000");
  const [pickerOpacity, setPickerOpacity] = useState(100);
  const catalog = useCustomizationCatalog<PublisherAppColorCatalogOption>(
    "colors",
    screen === "browse",
  );

  const choose = (
    option: PublisherAppColorCatalogOption,
    origin: "loaded" | "browse",
  ) => {
    setSelected(option);
    setEditing(value[option.key] ?? { light: option.defaultLightColor });
    setReturnScreen(origin);
    setScreen("edit");
  };

  const editLoaded = async (key: string) => {
    const params = new URLSearchParams({ q: key, limit: "50" });
    const page =
      await fetchPublisherAppCustomizationCatalog<PublisherAppColorCatalogOption>(
        "colors",
        params,
      );
    const option = page.items.find((item) => item.key === key);
    if (option) choose(option, "loaded");
  };

  if (screen === "edit" && selected) {
    const modeCard = (
      mode: "light" | "dark",
      label: string,
      fallback: string,
    ) => {
      const currentColor = editing[mode];
      const enabled = Boolean(currentColor);
      const Icon = mode === "light" ? Sun : Moon;
      return (
        <div className="rounded-3xl border bg-background p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-muted">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {enabled ? "Color personalizado" : "Usando el color base"}
                </p>
              </div>
            </div>
            <Badge variant={enabled ? "default" : "secondary"}>
              {enabled ? "Personalizado" : "Base"}
            </Badge>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-muted/35 p-4">
            <span
              aria-hidden="true"
              className="size-12 shrink-0 rounded-full border-4 border-background shadow-sm ring-1 ring-border"
              style={{ backgroundColor: currentColor ?? fallback }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                Hexadecimal
              </p>
              <code className="mt-1 block text-sm font-semibold">
                {currentColor ?? fallback}
              </code>
            </div>
            {enabled ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const current = splitHexColor(currentColor ?? fallback);
                  setPickerValue(current.color);
                  setPickerOpacity(current.opacity);
                  setColorPicker({ mode, label });
                }}
              >
                Cambiar color
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setEditing((current) => ({ ...current, [mode]: fallback }))
                }
              >
                Personalizar
              </Button>
            )}
          </div>
          {enabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 text-muted-foreground"
              onClick={() =>
                setEditing((current) => {
                  const next = { ...current };
                  delete next[mode];
                  return next;
                })
              }
            >
              Usar color base
            </Button>
          ) : null}
        </div>
      );
    };
    const pickerColorValue = hexColorWithOpacity(pickerValue, pickerOpacity);
    return (
      <>
        <div className="space-y-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setScreen(returnScreen)}
          >
            <ArrowLeft className="size-4" /> Volver
          </Button>
          <div className="rounded-3xl border bg-muted/20 p-6">
            <Badge variant="outline">{selected.group}</Badge>
            <h4 className="mt-4 text-2xl font-semibold">{selected.title}</h4>
            <code className="mt-2 block text-xs text-muted-foreground">
              {selected.key}
            </code>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
              {selected.usageDescription}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {modeCard("light", "Modo claro", selected.defaultLightColor)}
            {modeCard("dark", "Modo oscuro", selected.defaultDarkColor)}
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <Button
              type="button"
              variant="destructive"
              disabled={!value[selected.key]}
              onClick={() => {
                const next = { ...value };
                delete next[selected.key];
                onChange(next);
                setScreen("loaded");
              }}
            >
              <Trash2 className="size-4" /> Quitar personalización
            </Button>
            <Button
              type="button"
              disabled={!editing.light && !editing.dark}
              onClick={() => {
                onChange({ ...value, [selected.key]: editing });
                setScreen("loaded");
              }}
            >
              <Check className="size-4" /> Guardar este color
            </Button>
          </div>
        </div>
        <Dialog
          open={Boolean(colorPicker)}
          onOpenChange={(open) => {
            if (!open) setColorPicker(null);
          }}
        >
          <PublisherAppBrandDialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cambiar color</DialogTitle>
              <DialogDescription>
                Elegí el color para {colorPicker?.label.toLowerCase()}. Esta
                ventana modifica únicamente ese valor.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <label className="relative flex cursor-pointer flex-col items-center justify-center rounded-3xl border bg-muted/25 p-8 text-center transition hover:bg-muted/45">
                <span
                  className="size-32 rounded-full border-8 border-background shadow-lg ring-1 ring-border"
                  style={{ backgroundColor: pickerColorValue }}
                />
                <span className="mt-5 font-semibold">Elegir otro color</span>
                <span className="mt-1 text-sm text-muted-foreground">
                  Se abrirá el selector de color del sistema.
                </span>
                <input
                  aria-label={`Elegir color para ${colorPicker?.label ?? "modo"}`}
                  type="color"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={pickerValue.slice(0, 7)}
                  onChange={(event) =>
                    setPickerValue(event.target.value.toUpperCase())
                  }
                />
              </label>
              <div className="flex items-center justify-between rounded-2xl border px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  Hexadecimal
                </span>
                <code className="font-semibold">{pickerColorValue}</code>
              </div>
              <div className="rounded-2xl border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Opacidad</span>
                  <span className="text-sm font-semibold">
                    {pickerOpacity}%
                  </span>
                </div>
                <input
                  aria-label={`Opacidad para ${colorPicker?.label ?? "modo"}`}
                  type="range"
                  min={0}
                  max={100}
                  value={pickerOpacity}
                  className="mt-3 w-full accent-primary"
                  onChange={(event) =>
                    setPickerOpacity(Number(event.target.value))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setColorPicker(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!colorPicker) return;
                  setEditing((current) => ({
                    ...current,
                    [colorPicker.mode]: pickerColorValue,
                  }));
                  setColorPicker(null);
                }}
              >
                <Check className="size-4" /> Usar este color
              </Button>
            </DialogFooter>
          </PublisherAppBrandDialogContent>
        </Dialog>
      </>
    );
  }

  if (screen === "browse") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setScreen("loaded")}
          >
            <ArrowLeft className="size-4" /> Colores personalizados
          </Button>
          <p className="text-sm text-muted-foreground">
            Elegí qué color de la interfaz querés personalizar.
          </p>
        </div>
        <CatalogSearchControls
          query={catalog.query}
          onQueryChange={catalog.setQuery}
          group={catalog.group}
          onGroupChange={catalog.setGroup}
          groups={catalog.groups}
          totalCount={catalog.totalCount}
        />
        {catalog.loading && catalog.items.length === 0 ? (
          <CatalogLoadingState />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {catalog.items.map((option) => {
              const loaded = Boolean(value[option.key]);
              return (
                <button
                  key={option.key}
                  type="button"
                  className="group rounded-2xl border bg-background p-4 text-left transition hover:border-primary/45 hover:shadow-md"
                  onClick={() => choose(option, "browse")}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex overflow-hidden rounded-xl border shadow-sm">
                      <span
                        className="size-8"
                        style={{ backgroundColor: option.defaultLightColor }}
                      />
                      <span
                        className="size-8"
                        style={{ backgroundColor: option.defaultDarkColor }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{option.title}</span>
                        {loaded ? (
                          <Badge variant="secondary">Agregado</Badge>
                        ) : null}
                      </span>
                      <code className="mt-1 block truncate text-[11px] text-muted-foreground">
                        {option.key}
                      </code>
                      <span className="mt-2 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                        {option.usageDescription}
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {catalog.error ? (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {catalog.error}
          </p>
        ) : null}
        {catalog.nextCursor ? (
          <div className="text-center">
            <Button
              type="button"
              variant="outline"
              disabled={catalog.loading}
              onClick={catalog.loadMore}
            >
              {catalog.loading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}{" "}
              Cargar más
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const entries = Object.entries(value);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold">Colores personalizados</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Colores que reemplazan la paleta general en componentes específicos.
          </p>
        </div>
        <Button type="button" onClick={() => setScreen("browse")}>
          <Plus className="size-4" /> Agregar color
        </Button>
      </div>
      {entries.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {entries.map(([key, modes]) => (
            <button
              key={key}
              type="button"
              onClick={() => void editLoaded(key)}
              className="rounded-2xl border bg-background p-4 text-left transition hover:border-primary/45 hover:shadow-md"
            >
              <code className="text-xs font-semibold text-muted-foreground">
                {key}
              </code>
              <div className="mt-4 flex gap-4">
                {(["light", "dark"] as const).map((mode) =>
                  modes[mode] ? (
                    <span
                      key={mode}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className="size-7 rounded-lg border shadow-sm"
                        style={{ backgroundColor: modes[mode] }}
                      />
                      {mode === "light" ? "Claro" : "Oscuro"}
                    </span>
                  ) : null,
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed p-10 text-center">
          <Palette className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 font-semibold">
            Todavía no hay colores específicos
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            La app usa la paleta general. Agregá un color sólo si un componente
            necesita un valor diferente.
          </p>
        </div>
      )}
    </div>
  );
}

function TextOverridesEditor({
  value,
  onChange,
}: {
  value: PublisherAppAdvancedConfiguration["textOverrides"];
  onChange: (value: PublisherAppAdvancedConfiguration["textOverrides"]) => void;
}) {
  const [screen, setScreen] = useState<"loaded" | "browse" | "edit">("loaded");
  const [returnScreen, setReturnScreen] = useState<"loaded" | "browse">(
    "loaded",
  );
  const [selected, setSelected] =
    useState<PublisherAppTextCatalogOption | null>(null);
  const [english, setEnglish] = useState("");
  const [spanish, setSpanish] = useState("");
  const catalog = useCustomizationCatalog<PublisherAppTextCatalogOption>(
    "texts",
    screen === "browse",
  );

  const choose = (
    option: PublisherAppTextCatalogOption,
    origin: "loaded" | "browse",
  ) => {
    const loaded = value.find((row) => row.key === option.key);
    setSelected(option);
    setEnglish(loaded?.en ?? option.defaultEnglishText);
    setSpanish(loaded?.es ?? option.defaultSpanishText);
    setReturnScreen(origin);
    setScreen("edit");
  };

  const editLoaded = async (key: string) => {
    const params = new URLSearchParams({ q: key, limit: "50" });
    const page =
      await fetchPublisherAppCustomizationCatalog<PublisherAppTextCatalogOption>(
        "texts",
        params,
      );
    const option = page.items.find((item) => item.key === key);
    if (option) choose(option, "loaded");
  };

  if (screen === "edit" && selected) {
    const existing = value.some((row) => row.key === selected.key);
    const unchanged =
      english === selected.defaultEnglishText &&
      spanish === selected.defaultSpanishText;
    return (
      <div className="space-y-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setScreen(returnScreen)}
        >
          <ArrowLeft className="size-4" /> Volver
        </Button>
        <div className="rounded-3xl border bg-muted/20 p-6">
          <div className="flex flex-wrap gap-2">
            {selected.groups.map((group) => (
              <Badge key={group} variant="outline">
                {group}
              </Badge>
            ))}
            {selected.platforms.map((platform) => (
              <Badge key={platform} variant="secondary">
                {platform}
              </Badge>
            ))}
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Identificador técnico · solo lectura
          </p>
          <code className="mt-2 block whitespace-pre-wrap text-sm font-semibold text-foreground">
            {selected.key}
          </code>
          {selected.formatArguments.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Marcadores obligatorios:
              </span>
              {selected.formatArguments.map((argument, index) => (
                <Badge key={`${argument}-${index}`} variant="outline">
                  <code>{argument}</code>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border p-5">
            <Label htmlFor="catalog-override-en" className="text-base">
              Texto en inglés
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Original: {selected.defaultEnglishText}
            </p>
            <Textarea
              id="catalog-override-en"
              className="mt-4 min-h-40"
              value={english}
              onChange={(event) => setEnglish(event.target.value)}
            />
          </div>
          <div className="rounded-3xl border p-5">
            <Label htmlFor="catalog-override-es" className="text-base">
              Texto en español
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Original: {selected.defaultSpanishText}
            </p>
            <Textarea
              id="catalog-override-es"
              className="mt-4 min-h-40"
              value={spanish}
              onChange={(event) => setSpanish(event.target.value)}
            />
          </div>
        </div>
        {unchanged ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            Cambiá al menos uno de los idiomas. Los textos iguales al original
            no se guardan como personalización.
          </p>
        ) : null}
        <div className="flex flex-wrap justify-between gap-3">
          <Button
            type="button"
            variant="destructive"
            disabled={!existing}
            onClick={() => {
              onChange(value.filter((row) => row.key !== selected.key));
              setScreen("loaded");
            }}
          >
            <Trash2 className="size-4" /> Quitar personalización
          </Button>
          <Button
            type="button"
            disabled={!english.trim() || !spanish.trim() || unchanged}
            onClick={() => {
              const row = { key: selected.key, en: english, es: spanish };
              onChange(
                existing
                  ? value.map((item) =>
                      item.key === selected.key ? row : item,
                    )
                  : [...value, row],
              );
              setScreen("loaded");
            }}
          >
            <Check className="size-4" /> Guardar este texto
          </Button>
        </div>
      </div>
    );
  }

  if (screen === "browse") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setScreen("loaded")}
          >
            <ArrowLeft className="size-4" /> Textos personalizados
          </Button>
          <p className="text-sm text-muted-foreground">
            Elegí el texto de la app que querés reemplazar.
          </p>
        </div>
        <CatalogSearchControls
          query={catalog.query}
          onQueryChange={catalog.setQuery}
          group={catalog.group}
          onGroupChange={catalog.setGroup}
          groups={catalog.groups}
          totalCount={catalog.totalCount}
        />
        {catalog.loading && catalog.items.length === 0 ? (
          <CatalogLoadingState />
        ) : (
          <div className="space-y-3">
            {catalog.items.map((option) => {
              const loaded = value.some((row) => row.key === option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  className="group w-full rounded-2xl border bg-background p-4 text-left transition hover:border-primary/45 hover:shadow-md"
                  onClick={() => choose(option, "browse")}
                >
                  <div className="flex items-start gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold text-foreground">
                      Aa
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <code className="text-xs font-semibold text-foreground">
                          {option.key}
                        </code>
                        {loaded ? (
                          <Badge variant="secondary">Agregado</Badge>
                        ) : null}
                      </span>
                      <span className="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground md:grid-cols-2">
                        <span>
                          <b>EN</b> · {option.defaultEnglishText}
                        </span>
                        <span>
                          <b>ES</b> · {option.defaultSpanishText}
                        </span>
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {catalog.error ? (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {catalog.error}
          </p>
        ) : null}
        {catalog.nextCursor ? (
          <div className="text-center">
            <Button
              type="button"
              variant="outline"
              disabled={catalog.loading}
              onClick={catalog.loadMore}
            >
              {catalog.loading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}{" "}
              Cargar más
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold">Textos personalizados</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Textos que reemplazan el contenido predeterminado de la app.
          </p>
        </div>
        <Button type="button" onClick={() => setScreen("browse")}>
          <Plus className="size-4" /> Agregar texto
        </Button>
      </div>
      {value.length ? (
        <div className="space-y-3">
          {value.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => void editLoaded(row.key)}
              className="group w-full rounded-2xl border bg-background p-4 text-left transition hover:border-primary/45 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold text-foreground">
                  Aa
                </span>
                <span className="min-w-0 flex-1">
                  <code className="text-xs font-semibold">{row.key}</code>
                  <span className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                    <span className="truncate">
                      <b>EN</b> · {row.en}
                    </span>
                    <span className="truncate">
                      <b>ES</b> · {row.es}
                    </span>
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed p-10 text-center">
          <Languages className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 font-semibold">
            La app usa todos los textos instalados
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Elegí “Agregar texto” para buscar el contenido que querés cambiar.
          </p>
        </div>
      )}
    </div>
  );
}

function starterLesson(index: number): PublisherAppLearnLesson {
  return {
    lessonIdentifier: `CUSTOM.lesson_${index}`,
    lessonTitle: `Nueva lección ${index}`,
    imageUrl: null,
    lessonColor: "#6D28D9",
    paragraphs: [
      {
        paragraphTitle: "Introducción",
        icon: "book",
        contentText: "Escribí aquí el contenido educativo de esta lección.",
      },
    ],
    usefulLinks: [],
    relatedLessons: [],
  };
}

function starterCurriculum(): Extract<
  PublisherAppLearnConfiguration,
  { mode: "replace" }
> {
  return {
    mode: "replace",
    curriculumId: "custom-curriculum",
    curriculumRevision: 1,
    defaultLanguage: "es",
    subjects: [
      {
        subjectIdentifier: "CUSTOM",
        subjectTitle: "Mi contenido",
        chapters: [
          {
            chapterTitle: "Primeros pasos",
            lessons: [starterLesson(1)],
          },
        ],
      },
    ],
    topics: {},
  };
}

type ReplaceLearnConfiguration = Extract<
  PublisherAppLearnConfiguration,
  { mode: "replace" }
>;

type LearnScreen =
  | { kind: "home" }
  | { kind: "subject"; subjectIndex: number }
  | { kind: "chapter"; subjectIndex: number; chapterIndex: number }
  | {
      kind: "lesson";
      subjectIndex: number;
      chapterIndex: number;
      lessonIndex: number;
    }
  | {
      kind: "paragraph";
      subjectIndex: number;
      chapterIndex: number;
      lessonIndex: number;
      paragraphIndex: number;
    }
  | { kind: "topics" }
  | { kind: "topic-catalog" }
  | { kind: "topic"; topicId: string };

const LESSON_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function moveArrayItem<T>(items: T[], index: number, offset: -1 | 1) {
  const targetIndex = index + offset;
  if (targetIndex < 0 || targetIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

function uniqueIdentifier(base: string, used: Set<string>) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function uniqueLabel(base: string, used: Set<string>) {
  if (!used.has(base)) return base;
  let suffix = 2;
  let candidate = `${base} ${suffix}`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${base} ${suffix}`;
  }
  return candidate;
}

function identifierStem(value: string) {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[^A-Za-z0-9]+/, "");
  return normalized || "CUSTOM";
}

function lessonIds(configuration: ReplaceLearnConfiguration) {
  return new Set(
    configuration.subjects.flatMap((subject) =>
      subject.chapters.flatMap((chapter) =>
        chapter.lessons.map((lesson) => lesson.lessonIdentifier),
      ),
    ),
  );
}

function chapterTitles(configuration: ReplaceLearnConfiguration) {
  return new Set(
    configuration.subjects.flatMap((subject) =>
      subject.chapters.map((chapter) => chapter.chapterTitle),
    ),
  );
}

function createLesson(
  configuration: ReplaceLearnConfiguration,
  subjectIdentifier: string,
  ordinal: number,
) {
  const next = starterLesson(ordinal);
  return {
    ...next,
    lessonIdentifier: uniqueIdentifier(
      `${identifierStem(subjectIdentifier)}.lesson_${ordinal}`,
      lessonIds(configuration),
    ),
  };
}

function stripLessonReferences(
  subjects: PublisherAppLearnSubject[],
  removedLessonIds: Set<string>,
) {
  if (removedLessonIds.size === 0) return subjects;
  return subjects.map((subject) => ({
    ...subject,
    chapters: subject.chapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson) => ({
        ...lesson,
        relatedLessons: lesson.relatedLessons.filter(
          (id) => !removedLessonIds.has(id),
        ),
      })),
    })),
  }));
}

function LearnBuilder({
  value,
  onChange,
  showMetadata = true,
}: {
  value: PublisherAppLearnConfiguration;
  onChange: (value: PublisherAppLearnConfiguration) => void;
  showMetadata?: boolean;
}) {
  const [screen, setScreen] = useState<LearnScreen>({ kind: "home" });
  const [subjectIdentifierDrafts, setSubjectIdentifierDrafts] = useState<
    Record<string, string>
  >({});
  const [lessonIdentifierDrafts, setLessonIdentifierDrafts] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (value.mode === "base") {
      setScreen({ kind: "home" });
      setSubjectIdentifierDrafts({});
      setLessonIdentifierDrafts({});
    }
  }, [value.mode]);

  if (value.mode === "base") {
    return (
      <div className="rounded-3xl border border-dashed bg-muted/15 p-8 text-center">
        <BookOpen className="mx-auto size-11 text-muted-foreground" />
        <p className="mt-4 text-lg font-semibold text-foreground">
          Currículo Pocket Genes
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          La app usa el currículo predeterminado. También podés crear temas,
          capítulos y lecciones propios.
        </p>
        <Button
          type="button"
          className="mt-5"
          onClick={() => {
            onChange(starterCurriculum());
            setScreen({ kind: "home" });
          }}
        >
          <BookOpen className="size-4" /> Crear currículo propio
        </Button>
      </div>
    );
  }

  const curriculum = value;

  const updateSubject = (
    subjectIndex: number,
    updater: (subject: PublisherAppLearnSubject) => PublisherAppLearnSubject,
  ) => {
    onChange({
      ...curriculum,
      subjects: curriculum.subjects.map((subject, index) =>
        index === subjectIndex ? updater(subject) : subject,
      ),
    });
  };

  const updateChapter = (
    subjectIndex: number,
    chapterIndex: number,
    updater: (
      chapter: PublisherAppLearnSubject["chapters"][number],
    ) => PublisherAppLearnSubject["chapters"][number],
  ) => {
    updateSubject(subjectIndex, (subject) => ({
      ...subject,
      chapters: subject.chapters.map((chapter, index) =>
        index === chapterIndex ? updater(chapter) : chapter,
      ),
    }));
  };

  const updateLesson = (
    subjectIndex: number,
    chapterIndex: number,
    lessonIndex: number,
    updater: (lesson: PublisherAppLearnLesson) => PublisherAppLearnLesson,
  ) => {
    updateChapter(subjectIndex, chapterIndex, (chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson, index) =>
        index === lessonIndex ? updater(lesson) : lesson,
      ),
    }));
  };

  const renameSubject = (subjectIndex: number, nextIdentifier: string) => {
    const previousIdentifier =
      curriculum.subjects[subjectIndex]?.subjectIdentifier;
    if (previousIdentifier === undefined) return;
    const topics = Object.fromEntries(
      Object.entries(curriculum.topics).map(([topicId, identifiers]) => [
        topicId,
        Array.from(
          new Set(
            identifiers.map((identifier) =>
              identifier === previousIdentifier ? nextIdentifier : identifier,
            ),
          ),
        ),
      ]),
    );
    onChange({
      ...curriculum,
      subjects: curriculum.subjects.map((subject, index) =>
        index === subjectIndex
          ? { ...subject, subjectIdentifier: nextIdentifier }
          : subject,
      ),
      topics,
    });
  };

  const renameLesson = (
    subjectIndex: number,
    chapterIndex: number,
    lessonIndex: number,
    nextIdentifier: string,
  ) => {
    const previousIdentifier =
      curriculum.subjects[subjectIndex]?.chapters[chapterIndex]?.lessons[
        lessonIndex
      ]?.lessonIdentifier;
    if (previousIdentifier === undefined) return;
    onChange({
      ...curriculum,
      subjects: curriculum.subjects.map((subject, currentSubjectIndex) => ({
        ...subject,
        chapters: subject.chapters.map((chapter, currentChapterIndex) => ({
          ...chapter,
          lessons: chapter.lessons.map((lesson, currentLessonIndex) => ({
            ...lesson,
            lessonIdentifier:
              currentSubjectIndex === subjectIndex &&
              currentChapterIndex === chapterIndex &&
              currentLessonIndex === lessonIndex
                ? nextIdentifier
                : lesson.lessonIdentifier,
            relatedLessons: Array.from(
              new Set(
                lesson.relatedLessons.map((identifier) =>
                  identifier === previousIdentifier
                    ? nextIdentifier
                    : identifier,
                ),
              ),
            ),
          })),
        })),
      })),
    });
  };

  const subjectIdentifierProblem = (
    subjectIndex: number,
    candidate: string,
  ) => {
    const normalized = candidate.trim();
    if (!normalized) return "El ID del tema no puede quedar vacío.";
    if (
      curriculum.subjects.some(
        (subject, index) =>
          index !== subjectIndex &&
          subject.subjectIdentifier.trim() === normalized,
      )
    ) {
      return "Ese ID ya pertenece a otro tema.";
    }
    return null;
  };

  const editSubjectIdentifier = (
    subjectIndex: number,
    nextIdentifier: string,
  ) => {
    const key = String(subjectIndex);
    if (subjectIdentifierProblem(subjectIndex, nextIdentifier)) {
      setSubjectIdentifierDrafts((current) => ({
        ...current,
        [key]: nextIdentifier,
      }));
      return;
    }
    setSubjectIdentifierDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    renameSubject(subjectIndex, nextIdentifier);
  };

  const lessonIdentifierProblem = (
    subjectIndex: number,
    chapterIndex: number,
    lessonIndex: number,
    candidate: string,
  ) => {
    if (!LESSON_IDENTIFIER_PATTERN.test(candidate)) {
      return "Usá letras o números al inicio y luego sólo letras, números, punto, guion o guion bajo.";
    }
    const duplicated = curriculum.subjects.some(
      (subject, currentSubjectIndex) =>
        subject.chapters.some((chapter, currentChapterIndex) =>
          chapter.lessons.some(
            (lesson, currentLessonIndex) =>
              !(
                currentSubjectIndex === subjectIndex &&
                currentChapterIndex === chapterIndex &&
                currentLessonIndex === lessonIndex
              ) && lesson.lessonIdentifier === candidate,
          ),
        ),
    );
    return duplicated ? "Ese ID ya pertenece a otra lección." : null;
  };

  const editLessonIdentifier = (
    subjectIndex: number,
    chapterIndex: number,
    lessonIndex: number,
    nextIdentifier: string,
  ) => {
    const key = `${subjectIndex}:${chapterIndex}:${lessonIndex}`;
    if (
      lessonIdentifierProblem(
        subjectIndex,
        chapterIndex,
        lessonIndex,
        nextIdentifier,
      )
    ) {
      setLessonIdentifierDrafts((current) => ({
        ...current,
        [key]: nextIdentifier,
      }));
      return;
    }
    setLessonIdentifierDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    renameLesson(subjectIndex, chapterIndex, lessonIndex, nextIdentifier);
  };

  const removeSubject = (subjectIndex: number) => {
    const subject = curriculum.subjects[subjectIndex];
    if (!subject || curriculum.subjects.length === 1) return;
    const removedIds = new Set(
      subject.chapters.flatMap((chapter) =>
        chapter.lessons.map((lesson) => lesson.lessonIdentifier),
      ),
    );
    const subjects = stripLessonReferences(
      curriculum.subjects.filter((_, index) => index !== subjectIndex),
      removedIds,
    );
    const topics = Object.fromEntries(
      Object.entries(curriculum.topics).map(([topicId, identifiers]) => [
        topicId,
        identifiers.filter(
          (identifier) => identifier !== subject.subjectIdentifier,
        ),
      ]),
    );
    onChange({ ...curriculum, subjects, topics });
    setScreen({ kind: "home" });
  };

  const removeChapter = (subjectIndex: number, chapterIndex: number) => {
    const subject = curriculum.subjects[subjectIndex];
    const chapter = subject?.chapters[chapterIndex];
    if (!subject || !chapter || subject.chapters.length === 1) return;
    const removedIds = new Set(
      chapter.lessons.map((lesson) => lesson.lessonIdentifier),
    );
    const subjects = stripLessonReferences(
      curriculum.subjects.map((item, index) =>
        index === subjectIndex
          ? {
              ...item,
              chapters: item.chapters.filter(
                (_, currentIndex) => currentIndex !== chapterIndex,
              ),
            }
          : item,
      ),
      removedIds,
    );
    onChange({ ...curriculum, subjects });
    setScreen({ kind: "subject", subjectIndex });
  };

  const removeLesson = (
    subjectIndex: number,
    chapterIndex: number,
    lessonIndex: number,
  ) => {
    const chapter = curriculum.subjects[subjectIndex]?.chapters[chapterIndex];
    const lesson = chapter?.lessons[lessonIndex];
    if (!chapter || !lesson || chapter.lessons.length === 1) return;
    const subjects = stripLessonReferences(
      curriculum.subjects.map((subject, currentSubjectIndex) => ({
        ...subject,
        chapters: subject.chapters.map((item, currentChapterIndex) =>
          currentSubjectIndex === subjectIndex &&
          currentChapterIndex === chapterIndex
            ? {
                ...item,
                lessons: item.lessons.filter(
                  (_, currentLessonIndex) => currentLessonIndex !== lessonIndex,
                ),
              }
            : item,
        ),
      })),
      new Set([lesson.lessonIdentifier]),
    );
    onChange({ ...curriculum, subjects });
    setScreen({ kind: "chapter", subjectIndex, chapterIndex });
  };

  const metadata = showMetadata ? (
    <div className="grid gap-4 rounded-3xl border bg-muted/15 p-5 md:grid-cols-3">
      <div>
        <Label htmlFor="advanced-curriculum-id">ID del currículo</Label>
        <Input
          id="advanced-curriculum-id"
          className="mt-2"
          value={curriculum.curriculumId}
          onChange={(event) =>
            onChange({ ...curriculum, curriculumId: event.target.value })
          }
        />
      </div>
      <div>
        <Label htmlFor="advanced-curriculum-revision">Revisión</Label>
        <Input
          id="advanced-curriculum-revision"
          className="mt-2"
          type="number"
          min={1}
          value={curriculum.curriculumRevision}
          onChange={(event) =>
            onChange({
              ...curriculum,
              curriculumRevision: Math.max(1, Number(event.target.value) || 1),
            })
          }
        />
      </div>
      <div>
        <Label htmlFor="advanced-curriculum-language">
          Idioma del contenido
        </Label>
        <Input
          id="advanced-curriculum-language"
          className="mt-2"
          value={curriculum.defaultLanguage}
          placeholder="es"
          onChange={(event) =>
            onChange({ ...curriculum, defaultLanguage: event.target.value })
          }
        />
      </div>
    </div>
  ) : null;

  const navigationHeader = (
    title: string,
    description: string,
    backLabel: string,
    onBack: () => void,
  ) => (
    <div className="space-y-5">
      <Button type="button" variant="ghost" className="-ml-3" onClick={onBack}>
        <ArrowLeft className="size-4" /> {backLabel}
      </Button>
      <div>
        <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );

  if (screen.kind === "home") {
    const totals = learnTotals(curriculum);
    const activeTopicCount = TOPICS.filter(([topicId]) =>
      Object.prototype.hasOwnProperty.call(curriculum.topics, topicId),
    ).length;
    return (
      <div className="space-y-7" data-testid="learn-curriculum-home">
        {metadata}
        <div className="rounded-3xl border bg-muted/15 p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge variant="secondary">Currículo completamente propio</Badge>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                Estructura del currículo
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Creá y organizá temas, capítulos, lecciones y párrafos para esta
                app.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                [totals.subjects, "temas"],
                [totals.chapters, "capítulos"],
                [totals.lessons, "lecciones"],
              ].map(([count, label]) => (
                <Badge key={label} variant="outline" className="px-3 py-1.5">
                  {count} {label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-lg font-semibold">Temas del currículo</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Cada tema contiene capítulos y cada capítulo contiene lecciones.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => {
                const subjectIndex = curriculum.subjects.length;
                const usedSubjectIds = new Set(
                  curriculum.subjects.map(
                    (subject) => subject.subjectIdentifier,
                  ),
                );
                const subjectIdentifier = uniqueIdentifier(
                  `SUBJECT_${subjectIndex + 1}`,
                  usedSubjectIds,
                );
                const lesson = createLesson(
                  curriculum,
                  subjectIdentifier,
                  lessonIds(curriculum).size + 1,
                );
                const chapterTitle = uniqueLabel(
                  `Capítulo ${subjectIndex + 1}`,
                  chapterTitles(curriculum),
                );
                onChange({
                  ...curriculum,
                  subjects: [
                    ...curriculum.subjects,
                    {
                      subjectIdentifier,
                      subjectTitle: `Nuevo tema ${subjectIndex + 1}`,
                      chapters: [
                        {
                          chapterTitle,
                          lessons: [lesson],
                        },
                      ],
                    },
                  ],
                });
                setScreen({ kind: "subject", subjectIndex });
              }}
            >
              <Plus className="size-4" /> Crear tema
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {curriculum.subjects.map((subject, subjectIndex) => {
              const chapterCount = subject.chapters.length;
              const lessonCount = subject.chapters.reduce(
                (count, chapter) => count + chapter.lessons.length,
                0,
              );
              return (
                <div
                  key={`${subject.subjectIdentifier}-${subjectIndex}`}
                  className="rounded-3xl border bg-background p-5 shadow-sm"
                >
                  <button
                    type="button"
                    className="group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Abrir tema ${subject.subjectTitle}`}
                    onClick={() => setScreen({ kind: "subject", subjectIndex })}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <BookOpen className="size-5" />
                      </span>
                      <ArrowRight className="size-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                    </div>
                    <h5 className="mt-5 text-lg font-semibold">
                      {subject.subjectTitle || "Tema sin nombre"}
                    </h5>
                    <code className="mt-1 block text-xs text-muted-foreground">
                      {subject.subjectIdentifier || "ID pendiente"}
                    </code>
                    <p className="mt-4 text-sm text-muted-foreground">
                      {chapterCount}{" "}
                      {chapterCount === 1 ? "capítulo" : "capítulos"}
                      {" · "}
                      {lessonCount}{" "}
                      {lessonCount === 1 ? "lección" : "lecciones"}
                    </p>
                  </button>
                  <div className="mt-4 flex justify-end gap-1 border-t pt-3">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Mover tema ${subject.subjectTitle} hacia arriba`}
                      disabled={subjectIndex === 0}
                      onClick={() =>
                        onChange({
                          ...curriculum,
                          subjects: moveArrayItem(
                            curriculum.subjects,
                            subjectIndex,
                            -1,
                          ),
                        })
                      }
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Mover tema ${subject.subjectTitle} hacia abajo`}
                      disabled={subjectIndex === curriculum.subjects.length - 1}
                      onClick={() =>
                        onChange({
                          ...curriculum,
                          subjects: moveArrayItem(
                            curriculum.subjects,
                            subjectIndex,
                            1,
                          ),
                        })
                      }
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border bg-background p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Boxes className="size-5" />
                </span>
                <div>
                  <h4 className="font-semibold">
                    Categorías de navegación (opcional)
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {activeTopicCount === 0
                      ? "Todavía no agregaste categorías."
                      : `${activeTopicCount} ${activeTopicCount === 1 ? "categoría activa" : "categorías activas"}`}
                  </p>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                Sirven para decidir dónde aparecen tus temas dentro de Learn. No
                limitan qué temas, capítulos o lecciones podés crear.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setScreen({ kind: "topics" })}
            >
              Administrar categorías <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>

        <Button
          type="button"
          variant="outline"
          onClick={() => onChange({ mode: "base" })}
        >
          <ArrowLeft className="size-4" /> Volver al currículo Pocket Genes
        </Button>
      </div>
    );
  }

  if (screen.kind === "subject") {
    const subject = curriculum.subjects[screen.subjectIndex];
    if (!subject) {
      return (
        <Button type="button" onClick={() => setScreen({ kind: "home" })}>
          <ArrowLeft className="size-4" /> Volver al currículo
        </Button>
      );
    }
    const subjectDraftKey = String(screen.subjectIndex);
    const hasSubjectIdentifierDraft = Object.prototype.hasOwnProperty.call(
      subjectIdentifierDrafts,
      subjectDraftKey,
    );
    const subjectIdentifierValue = hasSubjectIdentifierDraft
      ? subjectIdentifierDrafts[subjectDraftKey]
      : subject.subjectIdentifier;
    const subjectIdProblem = hasSubjectIdentifierDraft
      ? subjectIdentifierProblem(screen.subjectIndex, subjectIdentifierValue)
      : null;
    return (
      <div className="space-y-7" data-testid="learn-subject-detail">
        {navigationHeader(
          subject.subjectTitle || "Tema sin nombre",
          "Editá el nombre y el ID del tema, y administrá sus capítulos.",
          "Volver al currículo",
          () => setScreen({ kind: "home" }),
        )}
        <div className="grid gap-4 rounded-3xl border p-6 md:grid-cols-2">
          <div>
            <Label htmlFor="learn-subject-identifier">ID del tema</Label>
            <Input
              id="learn-subject-identifier"
              className="mt-2 font-mono"
              value={subjectIdentifierValue}
              aria-invalid={Boolean(subjectIdProblem)}
              aria-describedby={
                subjectIdProblem ? "learn-subject-identifier-error" : undefined
              }
              onChange={(event) =>
                editSubjectIdentifier(screen.subjectIndex, event.target.value)
              }
            />
            {subjectIdProblem ? (
              <p
                id="learn-subject-identifier-error"
                className="mt-2 text-xs font-medium text-destructive"
              >
                {subjectIdProblem}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Las categorías que ya usan este tema se actualizan
                automáticamente.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="learn-subject-title">Nombre del tema</Label>
            <Input
              id="learn-subject-title"
              className="mt-2"
              value={subject.subjectTitle}
              onChange={(event) =>
                updateSubject(screen.subjectIndex, (current) => ({
                  ...current,
                  subjectTitle: event.target.value,
                }))
              }
            />
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-lg font-semibold">Capítulos</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Ordená las grandes etapas de este tema.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => {
                const chapterIndex = subject.chapters.length;
                const nextLesson = createLesson(
                  curriculum,
                  subject.subjectIdentifier,
                  lessonIds(curriculum).size + 1,
                );
                const chapterTitle = uniqueLabel(
                  `Nuevo capítulo ${chapterIndex + 1}`,
                  chapterTitles(curriculum),
                );
                updateSubject(screen.subjectIndex, (current) => ({
                  ...current,
                  chapters: [
                    ...current.chapters,
                    {
                      chapterTitle,
                      lessons: [nextLesson],
                    },
                  ],
                }));
                setScreen({
                  kind: "chapter",
                  subjectIndex: screen.subjectIndex,
                  chapterIndex,
                });
              }}
            >
              <Plus className="size-4" /> Crear capítulo
            </Button>
          </div>
          <div className="space-y-3">
            {subject.chapters.map((chapter, chapterIndex) => (
              <div
                key={`${chapter.chapterTitle}-${chapterIndex}`}
                className="flex flex-col gap-3 rounded-2xl border bg-background p-4 sm:flex-row sm:items-center"
              >
                <button
                  type="button"
                  className="group min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Abrir capítulo ${chapter.chapterTitle}`}
                  onClick={() =>
                    setScreen({
                      kind: "chapter",
                      subjectIndex: screen.subjectIndex,
                      chapterIndex,
                    })
                  }
                >
                  <p className="font-semibold">
                    {chapter.chapterTitle || "Capítulo sin nombre"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {chapter.lessons.length}{" "}
                    {chapter.lessons.length === 1 ? "lección" : "lecciones"}
                  </p>
                </button>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Mover capítulo ${chapter.chapterTitle} hacia arriba`}
                    disabled={chapterIndex === 0}
                    onClick={() =>
                      updateSubject(screen.subjectIndex, (current) => ({
                        ...current,
                        chapters: moveArrayItem(
                          current.chapters,
                          chapterIndex,
                          -1,
                        ),
                      }))
                    }
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Mover capítulo ${chapter.chapterTitle} hacia abajo`}
                    disabled={chapterIndex === subject.chapters.length - 1}
                    onClick={() =>
                      updateSubject(screen.subjectIndex, (current) => ({
                        ...current,
                        chapters: moveArrayItem(
                          current.chapters,
                          chapterIndex,
                          1,
                        ),
                      }))
                    }
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar capítulo ${chapter.chapterTitle}`}
                    onClick={() =>
                      setScreen({
                        kind: "chapter",
                        subjectIndex: screen.subjectIndex,
                        chapterIndex,
                      })
                    }
                  >
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t pt-6">
          <Button
            type="button"
            variant="outline"
            disabled={curriculum.subjects.length === 1}
            onClick={() => removeSubject(screen.subjectIndex)}
          >
            <Trash2 className="size-4" /> Eliminar tema
          </Button>
        </div>
      </div>
    );
  }

  if (screen.kind === "chapter") {
    const subject = curriculum.subjects[screen.subjectIndex];
    const chapter = subject?.chapters[screen.chapterIndex];
    if (!subject || !chapter) {
      return (
        <Button type="button" onClick={() => setScreen({ kind: "home" })}>
          <ArrowLeft className="size-4" /> Volver al currículo
        </Button>
      );
    }
    return (
      <div className="space-y-7" data-testid="learn-chapter-detail">
        {navigationHeader(
          chapter.chapterTitle || "Capítulo sin nombre",
          `Tema: ${subject.subjectTitle}. Editá el capítulo y administrá sus lecciones.`,
          `Volver a ${subject.subjectTitle}`,
          () =>
            setScreen({ kind: "subject", subjectIndex: screen.subjectIndex }),
        )}
        <div className="rounded-3xl border p-6">
          <Label htmlFor="learn-chapter-title">Nombre del capítulo</Label>
          <Input
            id="learn-chapter-title"
            className="mt-2"
            value={chapter.chapterTitle}
            onChange={(event) =>
              updateChapter(
                screen.subjectIndex,
                screen.chapterIndex,
                (current) => ({
                  ...current,
                  chapterTitle: event.target.value,
                }),
              )
            }
          />
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-lg font-semibold">Lecciones</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Cada lección puede tener su propia imagen, color, contenido y
                relaciones.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => {
                const lessonIndex = chapter.lessons.length;
                const nextLesson = createLesson(
                  curriculum,
                  subject.subjectIdentifier,
                  lessonIds(curriculum).size + 1,
                );
                updateChapter(
                  screen.subjectIndex,
                  screen.chapterIndex,
                  (current) => ({
                    ...current,
                    lessons: [...current.lessons, nextLesson],
                  }),
                );
                setScreen({
                  kind: "lesson",
                  subjectIndex: screen.subjectIndex,
                  chapterIndex: screen.chapterIndex,
                  lessonIndex,
                });
              }}
            >
              <Plus className="size-4" /> Crear lección
            </Button>
          </div>
          <div className="space-y-3">
            {chapter.lessons.map((lesson, lessonIndex) => (
              <div
                key={`${lesson.lessonIdentifier}-${lessonIndex}`}
                className="flex flex-col gap-3 rounded-2xl border bg-background p-4 sm:flex-row sm:items-center"
              >
                <button
                  type="button"
                  className="group flex min-w-0 flex-1 items-center gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Abrir lección ${lesson.lessonTitle}`}
                  onClick={() =>
                    setScreen({
                      kind: "lesson",
                      subjectIndex: screen.subjectIndex,
                      chapterIndex: screen.chapterIndex,
                      lessonIndex,
                    })
                  }
                >
                  <span
                    className="size-11 shrink-0 rounded-2xl border shadow-sm"
                    style={{ backgroundColor: lesson.lessonColor }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {lesson.lessonTitle || "Lección sin nombre"}
                    </span>
                    <code className="mt-1 block truncate text-xs text-muted-foreground">
                      {lesson.lessonIdentifier || "ID pendiente"}
                    </code>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {lesson.paragraphs.length}{" "}
                      {lesson.paragraphs.length === 1 ? "párrafo" : "párrafos"}
                    </span>
                  </span>
                </button>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Mover lección ${lesson.lessonTitle} hacia arriba`}
                    disabled={lessonIndex === 0}
                    onClick={() =>
                      updateChapter(
                        screen.subjectIndex,
                        screen.chapterIndex,
                        (current) => ({
                          ...current,
                          lessons: moveArrayItem(
                            current.lessons,
                            lessonIndex,
                            -1,
                          ),
                        }),
                      )
                    }
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Mover lección ${lesson.lessonTitle} hacia abajo`}
                    disabled={lessonIndex === chapter.lessons.length - 1}
                    onClick={() =>
                      updateChapter(
                        screen.subjectIndex,
                        screen.chapterIndex,
                        (current) => ({
                          ...current,
                          lessons: moveArrayItem(
                            current.lessons,
                            lessonIndex,
                            1,
                          ),
                        }),
                      )
                    }
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar lección ${lesson.lessonTitle}`}
                    onClick={() =>
                      setScreen({
                        kind: "lesson",
                        subjectIndex: screen.subjectIndex,
                        chapterIndex: screen.chapterIndex,
                        lessonIndex,
                      })
                    }
                  >
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t pt-6">
          <Button
            type="button"
            variant="outline"
            disabled={subject.chapters.length === 1}
            onClick={() =>
              removeChapter(screen.subjectIndex, screen.chapterIndex)
            }
          >
            <Trash2 className="size-4" /> Eliminar capítulo
          </Button>
        </div>
      </div>
    );
  }

  if (screen.kind === "lesson") {
    const subject = curriculum.subjects[screen.subjectIndex];
    const chapter = subject?.chapters[screen.chapterIndex];
    const lesson = chapter?.lessons[screen.lessonIndex];
    if (!subject || !chapter || !lesson) {
      return (
        <Button type="button" onClick={() => setScreen({ kind: "home" })}>
          <ArrowLeft className="size-4" /> Volver al currículo
        </Button>
      );
    }
    const lessonDraftKey = `${screen.subjectIndex}:${screen.chapterIndex}:${screen.lessonIndex}`;
    const hasLessonIdentifierDraft = Object.prototype.hasOwnProperty.call(
      lessonIdentifierDrafts,
      lessonDraftKey,
    );
    const lessonIdentifierValue = hasLessonIdentifierDraft
      ? lessonIdentifierDrafts[lessonDraftKey]
      : lesson.lessonIdentifier;
    const lessonIdProblem = hasLessonIdentifierDraft
      ? lessonIdentifierProblem(
          screen.subjectIndex,
          screen.chapterIndex,
          screen.lessonIndex,
          lessonIdentifierValue,
        )
      : null;
    const otherLessons = curriculum.subjects.flatMap((candidateSubject) =>
      candidateSubject.chapters.flatMap((candidateChapter) =>
        candidateChapter.lessons
          .filter((candidate) => candidate !== lesson)
          .map((candidate) => ({
            ...candidate,
            subjectTitle: candidateSubject.subjectTitle,
          })),
      ),
    );
    return (
      <div className="space-y-8" data-testid="learn-lesson-detail">
        {navigationHeader(
          lesson.lessonTitle || "Lección sin nombre",
          `Estás dentro de ${chapter.chapterTitle}. Todo lo que sigue pertenece únicamente a esta lección.`,
          `Volver a ${chapter.chapterTitle}`,
          () =>
            setScreen({
              kind: "chapter",
              subjectIndex: screen.subjectIndex,
              chapterIndex: screen.chapterIndex,
            }),
        )}

        <section className="grid gap-5 rounded-3xl border p-6 md:grid-cols-2">
          <div>
            <Label htmlFor="learn-lesson-identifier">ID de la lección</Label>
            <Input
              id="learn-lesson-identifier"
              className="mt-2 font-mono"
              value={lessonIdentifierValue}
              aria-invalid={Boolean(lessonIdProblem)}
              aria-describedby={
                lessonIdProblem ? "learn-lesson-identifier-error" : undefined
              }
              onChange={(event) =>
                editLessonIdentifier(
                  screen.subjectIndex,
                  screen.chapterIndex,
                  screen.lessonIndex,
                  event.target.value,
                )
              }
            />
            {lessonIdProblem ? (
              <p
                id="learn-lesson-identifier-error"
                className="mt-2 text-xs font-medium text-destructive"
              >
                {lessonIdProblem}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Si cambia, las relaciones que apuntan aquí también cambian.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="learn-lesson-title">Nombre de la lección</Label>
            <Input
              id="learn-lesson-title"
              className="mt-2"
              value={lesson.lessonTitle}
              onChange={(event) =>
                updateLesson(
                  screen.subjectIndex,
                  screen.chapterIndex,
                  screen.lessonIndex,
                  (current) => ({
                    ...current,
                    lessonTitle: event.target.value,
                  }),
                )
              }
            />
          </div>
          <div>
            <Label htmlFor="learn-lesson-image">Imagen HTTPS (opcional)</Label>
            <Input
              id="learn-lesson-image"
              className="mt-2"
              type="url"
              placeholder="https://..."
              value={lesson.imageUrl ?? ""}
              onChange={(event) =>
                updateLesson(
                  screen.subjectIndex,
                  screen.chapterIndex,
                  screen.lessonIndex,
                  (current) => ({
                    ...current,
                    imageUrl: event.target.value || null,
                  }),
                )
              }
            />
          </div>
          <ColorValueControl
            label="Color de la lección"
            value={lesson.lessonColor}
            allowOpacity={false}
            onChange={(lessonColor) =>
              updateLesson(
                screen.subjectIndex,
                screen.chapterIndex,
                screen.lessonIndex,
                (current) => ({ ...current, lessonColor }),
              )
            }
          />
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-lg font-semibold">Contenido de la lección</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Agregá y editá los párrafos que componen esta lección.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => {
                const paragraphIndex = lesson.paragraphs.length;
                updateLesson(
                  screen.subjectIndex,
                  screen.chapterIndex,
                  screen.lessonIndex,
                  (current) => ({
                    ...current,
                    paragraphs: [
                      ...current.paragraphs,
                      {
                        paragraphTitle: `Nuevo apartado ${paragraphIndex + 1}`,
                        icon: "book",
                        contentText: "Nuevo contenido",
                      },
                    ],
                  }),
                );
                setScreen({ ...screen, kind: "paragraph", paragraphIndex });
              }}
            >
              <Plus className="size-4" /> Crear párrafo
            </Button>
          </div>
          <div className="space-y-3">
            {lesson.paragraphs.map((paragraph, paragraphIndex) => (
              <div
                key={paragraphIndex}
                className="flex flex-col gap-3 rounded-2xl border bg-background p-4 sm:flex-row sm:items-center"
              >
                <button
                  type="button"
                  className="group min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Abrir párrafo ${paragraph.paragraphTitle}`}
                  onClick={() =>
                    setScreen({ ...screen, kind: "paragraph", paragraphIndex })
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted font-mono text-xs">
                      {paragraph.icon || "Aa"}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {paragraph.paragraphTitle || "Párrafo sin nombre"}
                      </span>
                      <span className="mt-1 block truncate text-sm text-muted-foreground">
                        {paragraph.contentText || "Contenido pendiente"}
                      </span>
                    </span>
                  </div>
                </button>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Mover párrafo ${paragraph.paragraphTitle} hacia arriba`}
                    disabled={paragraphIndex === 0}
                    onClick={() =>
                      updateLesson(
                        screen.subjectIndex,
                        screen.chapterIndex,
                        screen.lessonIndex,
                        (current) => ({
                          ...current,
                          paragraphs: moveArrayItem(
                            current.paragraphs,
                            paragraphIndex,
                            -1,
                          ),
                        }),
                      )
                    }
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Mover párrafo ${paragraph.paragraphTitle} hacia abajo`}
                    disabled={paragraphIndex === lesson.paragraphs.length - 1}
                    onClick={() =>
                      updateLesson(
                        screen.subjectIndex,
                        screen.chapterIndex,
                        screen.lessonIndex,
                        (current) => ({
                          ...current,
                          paragraphs: moveArrayItem(
                            current.paragraphs,
                            paragraphIndex,
                            1,
                          ),
                        }),
                      )
                    }
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar párrafo ${paragraph.paragraphTitle}`}
                    onClick={() =>
                      setScreen({
                        ...screen,
                        kind: "paragraph",
                        paragraphIndex,
                      })
                    }
                  >
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border p-6">
          <div>
            <h4 className="font-semibold">Enlaces útiles</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Agregá recursos HTTPS de a uno; cada destino queda visible y
              revisable.
            </p>
          </div>
          {lesson.usefulLinks.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
              Esta lección todavía no tiene enlaces externos.
            </div>
          ) : (
            <div className="space-y-3">
              {lesson.usefulLinks.map((link, linkIndex) => (
                <div key={linkIndex} className="flex gap-2">
                  <Input
                    type="url"
                    aria-label={`Enlace útil ${linkIndex + 1}`}
                    value={link}
                    placeholder="https://..."
                    onChange={(event) =>
                      updateLesson(
                        screen.subjectIndex,
                        screen.chapterIndex,
                        screen.lessonIndex,
                        (current) => ({
                          ...current,
                          usefulLinks: current.usefulLinks.map(
                            (currentLink, currentIndex) =>
                              currentIndex === linkIndex
                                ? event.target.value
                                : currentLink,
                          ),
                        }),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label={`Quitar enlace ${linkIndex + 1}`}
                    onClick={() =>
                      updateLesson(
                        screen.subjectIndex,
                        screen.chapterIndex,
                        screen.lessonIndex,
                        (current) => ({
                          ...current,
                          usefulLinks: current.usefulLinks.filter(
                            (_, currentIndex) => currentIndex !== linkIndex,
                          ),
                        }),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() =>
              updateLesson(
                screen.subjectIndex,
                screen.chapterIndex,
                screen.lessonIndex,
                (current) => ({
                  ...current,
                  usefulLinks: [...current.usefulLinks, "https://"],
                }),
              )
            }
          >
            <Plus className="size-4" /> Agregar enlace
          </Button>
        </section>

        <section className="space-y-4 rounded-3xl border p-6">
          <div>
            <h4 className="font-semibold">Lecciones relacionadas</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Elegí visualmente qué otros contenidos sugerir al terminar esta
              lección. Sus IDs se mantienen sincronizados al renombrarlos.
            </p>
          </div>
          {otherLessons.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
              Creá otra lección para poder conectarlas.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {otherLessons.map((candidate) => {
                const checked = lesson.relatedLessons.includes(
                  candidate.lessonIdentifier,
                );
                return (
                  <label
                    key={candidate.lessonIdentifier}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${checked ? "border-primary/45 bg-primary/10" : "bg-background hover:border-primary/30"}`}
                  >
                    <Checkbox
                      aria-label={`Relacionar ${candidate.lessonTitle}`}
                      checked={checked}
                      onCheckedChange={(nextChecked) =>
                        updateLesson(
                          screen.subjectIndex,
                          screen.chapterIndex,
                          screen.lessonIndex,
                          (current) => ({
                            ...current,
                            relatedLessons: nextChecked
                              ? Array.from(
                                  new Set([
                                    ...current.relatedLessons,
                                    candidate.lessonIdentifier,
                                  ]),
                                )
                              : current.relatedLessons.filter(
                                  (identifier) =>
                                    identifier !== candidate.lessonIdentifier,
                                ),
                          }),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {candidate.lessonTitle}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {candidate.subjectTitle} · {candidate.lessonIdentifier}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <div className="border-t pt-6">
          <Button
            type="button"
            variant="outline"
            disabled={chapter.lessons.length === 1}
            onClick={() =>
              removeLesson(
                screen.subjectIndex,
                screen.chapterIndex,
                screen.lessonIndex,
              )
            }
          >
            <Trash2 className="size-4" /> Eliminar lección
          </Button>
        </div>
      </div>
    );
  }

  if (screen.kind === "paragraph") {
    const subject = curriculum.subjects[screen.subjectIndex];
    const chapter = subject?.chapters[screen.chapterIndex];
    const lesson = chapter?.lessons[screen.lessonIndex];
    const paragraph = lesson?.paragraphs[screen.paragraphIndex];
    if (!subject || !chapter || !lesson || !paragraph) {
      return (
        <Button type="button" onClick={() => setScreen({ kind: "home" })}>
          <ArrowLeft className="size-4" /> Volver al currículo
        </Button>
      );
    }
    const updateParagraph = (
      updater: (
        current: PublisherAppLearnLesson["paragraphs"][number],
      ) => PublisherAppLearnLesson["paragraphs"][number],
    ) =>
      updateLesson(
        screen.subjectIndex,
        screen.chapterIndex,
        screen.lessonIndex,
        (current) => ({
          ...current,
          paragraphs: current.paragraphs.map((item, index) =>
            index === screen.paragraphIndex ? updater(item) : item,
          ),
        }),
      );
    return (
      <div className="space-y-7" data-testid="learn-paragraph-detail">
        {navigationHeader(
          paragraph.paragraphTitle || "Párrafo sin nombre",
          `Este apartado forma parte de ${lesson.lessonTitle}. Trabajalo como una escena independiente dentro de la lección.`,
          `Volver a ${lesson.lessonTitle}`,
          () =>
            setScreen({
              kind: "lesson",
              subjectIndex: screen.subjectIndex,
              chapterIndex: screen.chapterIndex,
              lessonIndex: screen.lessonIndex,
            }),
        )}
        <div className="space-y-5 rounded-3xl border p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_0.55fr]">
            <div>
              <Label htmlFor="learn-paragraph-title">Título del párrafo</Label>
              <Input
                id="learn-paragraph-title"
                className="mt-2"
                value={paragraph.paragraphTitle}
                onChange={(event) =>
                  updateParagraph((current) => ({
                    ...current,
                    paragraphTitle: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="learn-paragraph-icon">Símbolo nativo</Label>
              <Input
                id="learn-paragraph-icon"
                className="mt-2"
                value={paragraph.icon}
                placeholder="book"
                onChange={(event) =>
                  updateParagraph((current) => ({
                    ...current,
                    icon: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="learn-paragraph-content">Contenido</Label>
            <Textarea
              id="learn-paragraph-content"
              className="mt-2 min-h-72 resize-y text-base leading-7"
              value={paragraph.contentText}
              onChange={(event) =>
                updateParagraph((current) => ({
                  ...current,
                  contentText: event.target.value,
                }))
              }
            />
          </div>
        </div>
        <div className="border-t pt-6">
          <Button
            type="button"
            variant="outline"
            disabled={lesson.paragraphs.length === 1}
            onClick={() => {
              updateLesson(
                screen.subjectIndex,
                screen.chapterIndex,
                screen.lessonIndex,
                (current) => ({
                  ...current,
                  paragraphs: current.paragraphs.filter(
                    (_, index) => index !== screen.paragraphIndex,
                  ),
                }),
              );
              setScreen({
                kind: "lesson",
                subjectIndex: screen.subjectIndex,
                chapterIndex: screen.chapterIndex,
                lessonIndex: screen.lessonIndex,
              });
            }}
          >
            <Trash2 className="size-4" /> Eliminar párrafo
          </Button>
        </div>
      </div>
    );
  }

  if (screen.kind === "topics") {
    const activeTopics = TOPICS.filter(([topicId]) =>
      Object.prototype.hasOwnProperty.call(curriculum.topics, topicId),
    );
    return (
      <div className="space-y-7" data-testid="learn-topics-home">
        {navigationHeader(
          "Categorías de navegación",
          "Son accesos nativos de Learn: organizan dónde aparecen tus temas, pero nunca definen cuáles podés crear.",
          "Volver al currículo",
          () => setScreen({ kind: "home" }),
        )}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="font-semibold">Categorías activas</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Sólo aparecen las que decidiste usar en esta app.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setScreen({ kind: "topic-catalog" })}
            disabled={activeTopics.length === TOPICS.length}
          >
            <Plus className="size-4" /> Agregar categoría
          </Button>
        </div>
        {activeTopics.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-10 text-center">
            <Boxes className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-4 font-semibold">
              Tu currículo no necesita categorías para funcionar
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Todos los temas siguen disponibles. Agregá una categoría sólo si
              querés ubicarlos en una entrada específica de Learn.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activeTopics.map(([topicId, label]) => {
              const assignments = curriculum.topics[topicId] ?? [];
              return (
                <button
                  key={topicId}
                  type="button"
                  className="group rounded-3xl border bg-background p-5 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setScreen({ kind: "topic", topicId })}
                  aria-label={`Configurar categoría ${label}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Boxes className="size-5" />
                    </span>
                    <ArrowRight className="size-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <h5 className="mt-5 font-semibold">{label}</h5>
                  <code className="mt-1 block text-xs text-muted-foreground">
                    {topicId}
                  </code>
                  <p className="mt-4 text-sm text-muted-foreground">
                    {assignments.length}{" "}
                    {assignments.length === 1
                      ? "tema asignado"
                      : "temas asignados"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (screen.kind === "topic-catalog") {
    const availableTopics = TOPICS.filter(
      ([topicId]) =>
        !Object.prototype.hasOwnProperty.call(curriculum.topics, topicId),
    );
    return (
      <div className="space-y-7" data-testid="learn-topic-catalog">
        {navigationHeader(
          "Elegí una categoría",
          "Agregá únicamente las entradas nativas que tengan sentido para este currículo. Después vas a elegir qué temas propios aparecen allí.",
          "Volver a categorías",
          () => setScreen({ kind: "topics" }),
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {availableTopics.map(([topicId, label]) => (
            <button
              key={topicId}
              type="button"
              className="group rounded-3xl border bg-background p-5 text-left transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Agregar categoría ${label}`}
              onClick={() => {
                onChange({
                  ...curriculum,
                  topics: { ...curriculum.topics, [topicId]: [] },
                });
                setScreen({ kind: "topic", topicId });
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Plus className="size-5" />
                </span>
                <ArrowRight className="size-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
              </div>
              <h4 className="mt-5 font-semibold">{label}</h4>
              <code className="mt-1 block text-xs text-muted-foreground">
                {topicId}
              </code>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const topicDefinition = TOPICS.find(
    ([topicId]) => topicId === screen.topicId,
  );
  if (!topicDefinition) {
    return (
      <Button type="button" onClick={() => setScreen({ kind: "topics" })}>
        <ArrowLeft className="size-4" /> Volver a categorías
      </Button>
    );
  }
  const [topicId, topicLabel] = topicDefinition;
  const assignedSubjects = curriculum.topics[topicId] ?? [];
  return (
    <div className="space-y-7" data-testid="learn-topic-detail">
      {navigationHeader(
        topicLabel,
        "Elegí tus temas por nombre. El editor conserva sus IDs internamente y los actualiza si más adelante los renombrás.",
        "Volver a categorías",
        () => setScreen({ kind: "topics" }),
      )}
      <div>
        <h4 className="font-semibold">Temas que aparecerán aquí</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Podés seleccionar cualquier tema creado dentro de este currículo.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {curriculum.subjects.map((subject) => {
          const checked = assignedSubjects.includes(subject.subjectIdentifier);
          return (
            <label
              key={subject.subjectIdentifier}
              className={`flex cursor-pointer items-start gap-4 rounded-3xl border p-5 transition ${checked ? "border-primary/45 bg-primary/10" : "bg-background hover:border-primary/30"}`}
            >
              <Checkbox
                aria-label={`Asignar tema ${subject.subjectTitle}`}
                checked={checked}
                onCheckedChange={(nextChecked) =>
                  onChange({
                    ...curriculum,
                    topics: {
                      ...curriculum.topics,
                      [topicId]: nextChecked
                        ? Array.from(
                            new Set([
                              ...assignedSubjects,
                              subject.subjectIdentifier,
                            ]),
                          )
                        : assignedSubjects.filter(
                            (identifier) =>
                              identifier !== subject.subjectIdentifier,
                          ),
                    },
                  })
                }
              />
              <span className="min-w-0">
                <span className="block font-semibold">
                  {subject.subjectTitle || "Tema sin nombre"}
                </span>
                <code className="mt-1 block truncate text-xs text-muted-foreground">
                  {subject.subjectIdentifier || "ID pendiente"}
                </code>
              </span>
            </label>
          );
        })}
      </div>
      <div className="border-t pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const topics = { ...curriculum.topics };
            delete topics[topicId];
            onChange({ ...curriculum, topics });
            setScreen({ kind: "topics" });
          }}
        >
          <Trash2 className="size-4" /> Quitar categoría
        </Button>
      </div>
    </div>
  );
}

const ADVANCED_SEGMENTS = [
  {
    id: "identity",
    title: "Nombre, funciones y colores",
    description:
      "Configurá el nombre visible, las funciones disponibles y los colores de la app.",
    icon: Palette,
  },
  {
    id: "scope",
    title: "Contenido y servicios vinculados",
    description:
      "Consultá qué organización aporta contenido de Discover y qué proveedor ofrece servicios. Solo lectura.",
    icon: Globe2,
  },
  {
    id: "wording",
    title: "Idiomas y textos",
    description:
      "Elegí los idiomas disponibles y reemplazá textos específicos de la app.",
    icon: Languages,
  },
  {
    id: "learn",
    title: "Contenido educativo",
    description:
      "Usá el currículo de Pocket Genes o creá temas, capítulos y lecciones propios.",
    icon: BookOpen,
  },
  {
    id: "links",
    title: "Enlaces y contacto",
    description:
      "Configurá los enlaces de Join Us, soporte, privacidad y términos.",
    icon: Link2,
  },
] as const;

type AdvancedSegmentId = (typeof ADVANCED_SEGMENTS)[number]["id"];

function cloneAdvancedConfiguration(
  configuration: PublisherAppAdvancedConfiguration,
) {
  if (typeof structuredClone === "function") {
    return structuredClone(configuration);
  }
  return JSON.parse(
    JSON.stringify(configuration),
  ) as PublisherAppAdvancedConfiguration;
}

const SEGMENT_SECTIONS: Record<
  AdvancedSegmentId,
  Array<{ title: string; story: string }>
> = {
  identity: [
    {
      title: "Nombre visible en la app",
      story: "Cambiá el nombre que se muestra dentro de la app.",
    },
    {
      title: "Funciones disponibles",
      story: "Activá o desactivá el catálogo y el contenido de Discover.",
    },
    {
      title: "Paleta y colores personalizados",
      story:
        "Consultá la paleta y configurá colores específicos para componentes.",
    },
  ],
  scope: [
    {
      title: "Organización y proveedor vinculados",
      story:
        "Consultá los IDs que definen el origen del contenido y los servicios.",
    },
    {
      title: "Contenido y servicios incluidos",
      story:
        "Consultá qué contenido de Discover y qué servicios recibirá la app.",
    },
    {
      title: "Cómo modificar estos datos",
      story:
        "Estos valores se editan desde la organización o el proveedor vinculados.",
    },
  ],
  wording: [
    {
      title: "Idiomas de la app",
      story: "Elegí qué idiomas soporta la app y cuál se usa por defecto.",
    },
    {
      title: "Textos personalizados",
      story: "Reemplazá textos específicos en español e inglés.",
    },
    {
      title: "Vista previa de textos",
      story: "Revisá los textos personalizados antes de guardar.",
    },
  ],
  learn: [
    {
      title: "Fuente del contenido educativo",
      story: "Elegí entre el currículo de Pocket Genes y un currículo propio.",
    },
    {
      title: "Datos del currículo",
      story: "Configurá el ID, la revisión y el idioma del currículo propio.",
    },
    {
      title: "Temas, capítulos y lecciones",
      story: "Creá y editá la estructura y el contenido del currículo.",
    },
  ],
  links: [
    {
      title: "Enlaces de Join Us",
      story: "Configurá el enlace de Join Us para cada idioma.",
    },
    {
      title: "Soporte y documentos legales",
      story:
        "Configurá el email de soporte y los enlaces de privacidad y términos.",
    },
    {
      title: "Verificar enlaces",
      story: "Revisá todos los enlaces antes de guardar.",
    },
  ],
};

function learnTotals(learn: PublisherAppLearnConfiguration) {
  if (learn.mode === "base") return { subjects: 0, chapters: 0, lessons: 0 };
  return learn.subjects.reduce(
    (totals, subject) => ({
      subjects: totals.subjects + 1,
      chapters: totals.chapters + subject.chapters.length,
      lessons:
        totals.lessons +
        subject.chapters.reduce(
          (sum, chapter) => sum + chapter.lessons.length,
          0,
        ),
    }),
    { subjects: 0, chapters: 0, lessons: 0 },
  );
}

export function PublisherAppAdvancedConfigurationEditor({
  configuration,
  baseColors,
  onChange,
}: {
  configuration: PublisherAppAdvancedConfiguration;
  baseColors: PublisherAppColors;
  onChange: (configuration: PublisherAppAdvancedConfiguration) => void;
}) {
  const [activeSegment, setActiveSegment] = useState<AdvancedSegmentId | null>(
    null,
  );
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(
    null,
  );
  const [draft, setDraft] = useState<PublisherAppAdvancedConfiguration | null>(
    null,
  );
  const working = draft ?? configuration;
  const effectiveSemanticColors = useMemo(
    () => working.semanticColors ?? publisherAppSemanticColors(baseColors),
    [baseColors, working.semanticColors],
  );
  const brandThemeStyle = useMemo(
    () => publisherAppBrandThemeStyle(effectiveSemanticColors.primary),
    [effectiveSemanticColors.primary],
  );
  const activeDefinition = ADVANCED_SEGMENTS.find(
    (segment) => segment.id === activeSegment,
  );
  const sections = activeSegment ? SEGMENT_SECTIONS[activeSegment] : [];
  const activeSection =
    activeSectionIndex === null ? null : sections[activeSectionIndex];
  const sectionIndex = activeSectionIndex ?? 0;

  const updateDraft = (patch: Partial<PublisherAppAdvancedConfiguration>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const openSegment = (segment: AdvancedSegmentId) => {
    setDraft(cloneAdvancedConfiguration(configuration));
    setActiveSectionIndex(null);
    setActiveSegment(segment);
  };

  const closeSegment = () => {
    setActiveSegment(null);
    setDraft(null);
    setActiveSectionIndex(null);
  };

  const applySegment = () => {
    if (draft) onChange(draft);
    closeSegment();
  };

  const segmentSummary = (segment: AdvancedSegmentId) => {
    if (segment === "identity")
      return `${configuration.displayName} · ${configuration.semanticColors ? "9 tonos propios" : "Paleta automática"}`;
    if (segment === "scope")
      return configuration.discoverScope.mode === "all"
        ? "Discover global · solo lectura"
        : `Discover · ${configuration.discoverScope.publisherOrganizationId}`;
    if (segment === "wording")
      return `${configuration.localization.availableLanguages.length} idiomas · ${configuration.textOverrides.length} textos propios`;
    if (segment === "learn") {
      const totals = learnTotals(configuration.learn);
      return configuration.learn.mode === "base"
        ? "Currículo Pocket Genes"
        : `${totals.subjects} temas · ${totals.lessons} lecciones`;
    }
    return configuration.links.supportEmail || "Destinos todavía sin completar";
  };

  const sectionSummary = (segment: AdvancedSegmentId, index: number) => {
    if (segment === "identity") {
      if (index === 0) return working.displayName;
      if (index === 1)
        return `${working.catalogEnabled ? "Catálogo activo" : "Catálogo inactivo"} · ${working.feedEnabled ? "Discover activo" : "Discover inactivo"}`;
      return `${Object.keys(working.colorOverrides).length} colores personalizados`;
    }
    if (segment === "scope") {
      if (index === 0) return "IDs vinculados · solo lectura";
      if (index === 1)
        return working.discoverScope.mode === "all"
          ? "Discover global · todos los proveedores"
          : `Discover · ${working.discoverScope.publisherOrganizationId}`;
      return "Configuración de solo lectura";
    }
    if (segment === "wording") {
      if (index === 0)
        return `${working.localization.availableLanguages.length} idiomas disponibles`;
      if (index === 1)
        return `${working.textOverrides.length} textos personalizados`;
      return "Vista previa bilingüe";
    }
    if (segment === "learn") {
      const totals = learnTotals(working.learn);
      if (index === 0)
        return working.learn.mode === "base"
          ? "Currículo Pocket Genes"
          : "Currículo propio";
      if (index === 1)
        return working.learn.mode === "base"
          ? "Sin metadatos propios"
          : `${working.learn.curriculumId} · revisión ${working.learn.curriculumRevision}`;
      return working.learn.mode === "base"
        ? "Contenido predeterminado"
        : `${totals.subjects} temas · ${totals.chapters} capítulos · ${totals.lessons} lecciones`;
    }
    if (index === 0) return "Enlaces en español e inglés";
    if (index === 1)
      return working.links.supportEmail || "Contacto todavía sin completar";
    return "Revisión de destinos";
  };

  const renderIdentitySection = () => {
    if (sectionIndex === 0)
      return (
        <div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="rounded-3xl border bg-background p-6 shadow-sm">
              <Label htmlFor="advanced-display-name" className="text-base">
                Nombre
              </Label>
              <Input
                id="advanced-display-name"
                className="mt-3 h-12 text-lg"
                value={working.displayName}
                onChange={(event) =>
                  updateDraft({ displayName: event.target.value })
                }
              />
              <p className="mt-3 text-sm text-muted-foreground">
                Este nombre aparece dentro de la app. No cambia el nombre de la
                app en App Store o Google Play.
              </p>
            </div>
            <div className="overflow-hidden rounded-3xl border bg-slate-950 p-5 text-white shadow-xl">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <span className="size-2 rounded-full bg-emerald-400" /> VISTA EN
                LA APP
              </div>
              <div className="mt-12 rounded-2xl bg-white/10 p-4 backdrop-blur">
                <p className="text-xs text-white/60">Nombre visible</p>
                <p className="mt-1 text-xl font-semibold">
                  {working.displayName || "Nombre de la app"}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    if (sectionIndex === 1)
      return (
        <div>
          <div className="grid gap-4 md:grid-cols-2">
            {(["catalogEnabled", "feedEnabled"] as const).map((key, index) => {
              const enabled = working[key];
              const title =
                key === "catalogEnabled"
                  ? "Catálogo y solicitudes"
                  : "Contenido Discover";
              return (
                <label
                  key={key}
                  className={`group cursor-pointer rounded-3xl border p-6 transition focus-within:outline-none focus-within:ring-2 focus-within:ring-ring ${enabled ? "border-primary/45 bg-primary/10" : "bg-background hover:border-primary/30"}`}
                >
                  <span className="flex items-start gap-4">
                    <span
                      className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {index === 0 ? (
                        <Boxes className="size-5" />
                      ) : (
                        <Globe2 className="size-5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-semibold">
                        {title}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                        {key === "catalogEnabled"
                          ? "Muestra el catálogo y permite iniciar solicitudes."
                          : "Muestra las publicaciones de Discover."}
                      </span>
                    </span>
                    <Checkbox
                      aria-label={`${title}: ${enabled ? "activada" : "desactivada"}`}
                      checked={enabled}
                      className="mt-1 size-6 shrink-0 rounded-md border-2"
                      onCheckedChange={(checked) =>
                        updateDraft({ [key]: checked === true })
                      }
                    />
                  </span>
                  <span className="mt-5 block text-sm font-semibold">
                    {enabled ? "Activada" : "Desactivada"}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      );
    return (
      <div className="space-y-7">
        <div className="rounded-3xl border bg-muted/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">Paleta de la app</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Colores derivados automáticamente de los tres colores
                principales.
              </p>
            </div>
            <Badge variant="outline" className="rounded-full">
              {working.semanticColors ? "Paleta guardada" : "Paleta automática"}
            </Badge>
          </div>
          <div className="mt-6 flex h-20 overflow-hidden rounded-2xl shadow-inner">
            {SEMANTIC_COLOR_FIELDS.map((field) => (
              <div
                key={field.key}
                className="flex-1 transition-all duration-300 hover:flex-[1.6]"
                style={{ backgroundColor: effectiveSemanticColors[field.key] }}
                title={`${field.label}: ${effectiveSemanticColors[field.key]}`}
              />
            ))}
          </div>
        </div>
        <ColorOverridesEditor
          value={working.colorOverrides}
          onChange={(colorOverrides) => updateDraft({ colorOverrides })}
        />
      </div>
    );
  };

  const renderScopeSection = () => {
    if (sectionIndex === 0)
      return (
        <div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                label: "Publicador",
                value:
                  working.discoverScope.mode === "organization"
                    ? working.discoverScope.publisherOrganizationId
                    : "Alcance global",
                icon: Globe2,
              },
              {
                label: "Proveedor",
                value:
                  working.serviceScope.mode === "provider"
                    ? working.serviceScope.providerId
                    : "Todos los proveedores",
                icon: Boxes,
              },
              {
                label: "Protección",
                value: "Vínculos administrados",
                icon: ShieldCheck,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border bg-background p-6"
              >
                <item.icon className="size-6 text-foreground" />
                <p className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-2 break-all font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      );
    if (sectionIndex === 1)
      return (
        <div>
          <div
            data-testid="publisher-app-scope-readonly"
            className="grid gap-5 md:grid-cols-2"
          >
            <div className="space-y-5 rounded-3xl border bg-muted/20 p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Globe2 className="size-5 text-foreground" />
                  <p className="font-semibold">Discover</p>
                </div>
                <Badge variant="secondary">
                  {working.discoverScope.mode === "all"
                    ? "Todo el contenido"
                    : "Una organización"}
                </Badge>
              </div>
              {working.discoverScope.mode === "organization" ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    ID de organización
                  </p>
                  <p className="mt-2 break-all font-mono text-sm">
                    {working.discoverScope.publisherOrganizationId}
                  </p>
                </div>
              ) : null}
              <p className="text-sm leading-6 text-muted-foreground">
                Este alcance se resuelve desde la identidad del publicador y no
                se puede editar aquí.
              </p>
            </div>
            <div className="space-y-5 rounded-3xl border bg-muted/20 p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Boxes className="size-5 text-foreground" />
                  <p className="font-semibold">Servicios</p>
                </div>
                <Badge variant="secondary">
                  {working.serviceScope.mode === "all"
                    ? "Todos los proveedores"
                    : "Un proveedor"}
                </Badge>
              </div>
              {working.serviceScope.mode === "provider" ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      Tipo
                    </dt>
                    <dd className="mt-2 font-medium">
                      {working.serviceScope.providerKind === "organization"
                        ? "Organización"
                        : "Profesional individual"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      ID del proveedor
                    </dt>
                    <dd className="mt-2 break-all font-mono text-sm">
                      {working.serviceScope.providerId}
                    </dd>
                  </div>
                </dl>
              ) : null}
              <p className="text-sm leading-6 text-muted-foreground">
                Este alcance se resuelve desde el proveedor vinculado y no se
                puede editar aquí.
              </p>
            </div>
          </div>
        </div>
      );
    return (
      <div className="flex min-h-80 items-center justify-center">
        <div className="max-w-xl text-center">
          <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
            <ShieldCheck className="size-9" />
          </span>
          <h3 className="mt-6 text-2xl font-semibold">Datos de solo lectura</h3>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            La organización y el proveedor vinculados determinan este alcance.
            Para cambiarlo, editá esos registros desde sus pantallas.
          </p>
          <Badge variant="outline" className="mt-5 rounded-full">
            Solo lectura
          </Badge>
        </div>
      </div>
    );
  };

  const renderWordingSection = () => {
    if (sectionIndex === 0)
      return (
        <div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border p-6">
              <Label className="text-base">Idioma predeterminado</Label>
              <Select
                value={working.localization.defaultLanguage}
                onValueChange={(defaultLanguage: "en" | "es") =>
                  updateDraft({
                    localization: {
                      ...working.localization,
                      defaultLanguage,
                      availableLanguages:
                        working.localization.availableLanguages.includes(
                          defaultLanguage,
                        )
                          ? working.localization.availableLanguages
                          : [
                              ...working.localization.availableLanguages,
                              defaultLanguage,
                            ],
                    },
                  })
                }
              >
                <SelectTrigger className="mt-3 h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-3xl border p-6">
              <Label className="text-base">Idiomas disponibles</Label>
              <div className="mt-4 grid gap-3">
                {(["es", "en"] as const).map((language) => {
                  const languageName =
                    language === "es" ? "Español" : "English";
                  const enabled =
                    working.localization.availableLanguages.includes(language);
                  return (
                    <label
                      key={language}
                      className={`flex cursor-pointer items-center justify-between gap-4 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-ring ${enabled ? "border-primary/45 bg-primary/10" : "hover:border-primary/30"}`}
                    >
                      <span>
                        <span className="block font-semibold">
                          {languageName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {language === working.localization.defaultLanguage
                            ? "Idioma predeterminado"
                            : "Idioma adicional"}
                        </span>
                      </span>
                      <Checkbox
                        aria-label={`Activar ${languageName}`}
                        checked={enabled}
                        className="size-6 shrink-0 rounded-md border-2"
                        disabled={
                          working.localization.availableLanguages.length ===
                            1 &&
                          working.localization.availableLanguages[0] ===
                            language
                        }
                        onCheckedChange={(checked) => {
                          const availableLanguages = checked
                            ? [
                                ...new Set([
                                  ...working.localization.availableLanguages,
                                  language,
                                ]),
                              ]
                            : working.localization.availableLanguages.filter(
                                (item) => item !== language,
                              );
                          updateDraft({
                            localization: {
                              ...working.localization,
                              availableLanguages,
                              defaultLanguage: availableLanguages.includes(
                                working.localization.defaultLanguage,
                              )
                                ? working.localization.defaultLanguage
                                : availableLanguages[0]!,
                            },
                          });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    if (sectionIndex === 1)
      return (
        <div>
          <TextOverridesEditor
            value={working.textOverrides}
            onChange={(textOverrides) => updateDraft({ textOverrides })}
          />
        </div>
      );
    const firstOverride = working.textOverrides[0];
    return (
      <div className="space-y-7">
        <div className="grid gap-5 md:grid-cols-2">
          {(["es", "en"] as const).map((language) => (
            <div key={language} className="rounded-3xl border bg-muted/20 p-6">
              <Badge variant="outline">
                {language === "es" ? "Español" : "English"}
              </Badge>
              <p className="mt-8 text-xs uppercase tracking-wider text-muted-foreground">
                {firstOverride?.key || "Texto de muestra"}
              </p>
              <p className="mt-3 text-xl font-semibold">
                {firstOverride
                  ? firstOverride[language]
                  : "Todavía no hay textos personalizados"}
              </p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
          <CircleCheck className="size-5 shrink-0" />{" "}
          {working.textOverrides.length} textos personalizados listos para
          guardar.
        </div>
      </div>
    );
  };

  const renderLearnSection = () => {
    if (sectionIndex === 0)
      return (
        <div>
          <div className="grid gap-5 md:grid-cols-2">
            <button
              type="button"
              aria-pressed={working.learn.mode === "base"}
              className={`rounded-3xl border p-6 text-left transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg ${working.learn.mode === "base" ? "border-primary/45 bg-primary/10" : "bg-background"}`}
              onClick={() => updateDraft({ learn: { mode: "base" } })}
            >
              <div className="flex items-start justify-between gap-4">
                <BookOpen className="size-8 text-primary" />
                {working.learn.mode === "base" ? (
                  <CircleCheck className="size-6 text-primary" />
                ) : (
                  <span className="size-6 rounded-full border-2 border-muted-foreground/40" />
                )}
              </div>
              <p className="mt-8 text-xl font-semibold">
                Currículo Pocket Genes
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Usa los temas, capítulos y lecciones predeterminados.
              </p>
              {working.learn.mode === "base" ? (
                <Badge className="mt-5">Seleccionado</Badge>
              ) : null}
            </button>
            <button
              type="button"
              aria-pressed={working.learn.mode === "replace"}
              className={`rounded-3xl border p-6 text-left transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg ${working.learn.mode === "replace" ? "border-primary/45 bg-primary/10" : "bg-background"}`}
              onClick={() =>
                updateDraft({
                  learn:
                    working.learn.mode === "replace"
                      ? working.learn
                      : starterCurriculum(),
                })
              }
            >
              <div className="flex items-start justify-between gap-4">
                <Rocket className="size-8 text-primary" />
                {working.learn.mode === "replace" ? (
                  <CircleCheck className="size-6 text-primary" />
                ) : (
                  <span className="size-6 rounded-full border-2 border-muted-foreground/40" />
                )}
              </div>
              <p className="mt-8 text-xl font-semibold">Currículo propio</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Reemplaza el contenido predeterminado con temas, capítulos y
                lecciones propios.
              </p>
              {working.learn.mode === "replace" ? (
                <Badge className="mt-5">Seleccionado</Badge>
              ) : null}
            </button>
          </div>
        </div>
      );
    if (sectionIndex === 1) {
      if (working.learn.mode === "base")
        return (
          <div className="flex min-h-80 items-center justify-center text-center">
            <div>
              <BookOpen className="mx-auto size-12 text-emerald-600" />
              <h3 className="mt-5 text-2xl font-semibold">
                Currículo Pocket Genes seleccionado
              </h3>
              <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
                El ID, la revisión y el idioma sólo se configuran para un
                currículo propio.
              </p>
            </div>
          </div>
        );
      return (
        <div>
          <div className="grid gap-4 rounded-3xl border p-6 md:grid-cols-3">
            <div>
              <Label htmlFor="advanced-curriculum-id">ID del currículo</Label>
              <Input
                id="advanced-curriculum-id"
                className="mt-2"
                value={working.learn.curriculumId}
                onChange={(event) =>
                  updateDraft({
                    learn: {
                      ...(working.learn as Extract<
                        PublisherAppLearnConfiguration,
                        { mode: "replace" }
                      >),
                      curriculumId: event.target.value,
                    },
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="advanced-curriculum-revision">Revisión</Label>
              <Input
                id="advanced-curriculum-revision"
                className="mt-2"
                type="number"
                min={1}
                value={working.learn.curriculumRevision}
                onChange={(event) =>
                  updateDraft({
                    learn: {
                      ...(working.learn as Extract<
                        PublisherAppLearnConfiguration,
                        { mode: "replace" }
                      >),
                      curriculumRevision: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    },
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="advanced-curriculum-language">
                Idioma del contenido
              </Label>
              <Input
                id="advanced-curriculum-language"
                className="mt-2"
                value={working.learn.defaultLanguage}
                onChange={(event) =>
                  updateDraft({
                    learn: {
                      ...(working.learn as Extract<
                        PublisherAppLearnConfiguration,
                        { mode: "replace" }
                      >),
                      defaultLanguage: event.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      );
    }
    if (working.learn.mode === "base")
      return (
        <div className="flex min-h-80 items-center justify-center">
          <div className="max-w-lg rounded-3xl border border-emerald-200 bg-emerald-50/65 p-8 text-center dark:border-emerald-400/20 dark:bg-emerald-500/8">
            <CircleCheck className="mx-auto size-11 text-emerald-600" />
            <h3 className="mt-5 text-xl font-semibold">
              Currículo Pocket Genes
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              La app usará todos los temas, capítulos y lecciones
              predeterminados.
            </p>
          </div>
        </div>
      );
    return (
      <LearnBuilder
        value={working.learn}
        showMetadata={false}
        onChange={(learn) => updateDraft({ learn })}
      />
    );
  };

  const renderLinksSection = () => {
    if (sectionIndex === 0)
      return (
        <div>
          <div className="grid gap-5 md:grid-cols-2">
            {(["en", "es"] as const).map((language) => (
              <div key={language} className="rounded-3xl border p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted font-bold text-foreground">
                    {language.toUpperCase()}
                  </span>
                  <div>
                    <p className="font-semibold">
                      Join Us · {language === "en" ? "English" : "Español"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Destino de la llamada a la acción
                    </p>
                  </div>
                </div>
                <Input
                  aria-label={`Join Us · ${language === "en" ? "English" : "Español"}`}
                  className="mt-6"
                  type="url"
                  value={working.links.joinUs[language]}
                  onChange={(event) =>
                    updateDraft({
                      links: {
                        ...working.links,
                        joinUs: {
                          ...working.links.joinUs,
                          [language]: event.target.value,
                        },
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      );
    if (sectionIndex === 1)
      return (
        <div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border p-6 md:col-span-2">
              <Label
                htmlFor="advanced-support-email"
                className="flex items-center gap-2 text-base"
              >
                <Mail className="size-4 text-foreground" /> Email de soporte
              </Label>
              <Input
                id="advanced-support-email"
                className="mt-3"
                type="email"
                value={working.links.supportEmail}
                onChange={(event) =>
                  updateDraft({
                    links: {
                      ...working.links,
                      supportEmail: event.target.value,
                    },
                  })
                }
              />
            </div>
            <div className="rounded-3xl border p-6">
              <Label htmlFor="advanced-privacy-url">
                Política de privacidad
              </Label>
              <Input
                id="advanced-privacy-url"
                className="mt-3"
                type="url"
                value={working.links.privacyUrl}
                onChange={(event) =>
                  updateDraft({
                    links: { ...working.links, privacyUrl: event.target.value },
                  })
                }
              />
            </div>
            <div className="rounded-3xl border p-6">
              <Label htmlFor="advanced-terms-url">Términos y condiciones</Label>
              <Input
                id="advanced-terms-url"
                className="mt-3"
                type="url"
                value={working.links.termsUrl}
                onChange={(event) =>
                  updateDraft({
                    links: { ...working.links, termsUrl: event.target.value },
                  })
                }
              />
            </div>
          </div>
        </div>
      );
    const destinations = [
      { label: "Join Us · English", value: working.links.joinUs.en },
      { label: "Join Us · Español", value: working.links.joinUs.es },
      { label: "Soporte", value: working.links.supportEmail },
      { label: "Privacidad", value: working.links.privacyUrl },
      { label: "Términos", value: working.links.termsUrl },
    ];
    return (
      <div className="space-y-7">
        <div className="grid gap-3">
          {destinations.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-4 rounded-2xl border bg-background p-4"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-full ${item.value ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-amber-100 text-amber-700"}`}
              >
                {item.value ? (
                  <Check className="size-4" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.value || "Destino pendiente"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSegmentHome = () => {
    if (!activeSegment || !activeDefinition) return null;
    return (
      <div
        data-testid="publisher-app-section-index"
        className="mx-auto max-w-5xl space-y-5"
      >
        <h3 className="text-xl font-semibold tracking-tight">
          Elegí qué configurar
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section, index) => (
            <button
              key={section.title}
              type="button"
              onClick={() => setActiveSectionIndex(index)}
              className="group flex min-h-36 flex-col rounded-3xl border bg-background p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-4">
                <h4 className="text-lg font-semibold">{section.title}</h4>
                <ArrowRight className="size-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {section.story}
              </p>
              <p className="mt-auto pt-5 text-xs font-medium text-foreground/75">
                {sectionSummary(activeSegment, index)}
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderCurrentSection = () => {
    if (!activeSegment) return null;
    if (activeSegment === "identity") return renderIdentitySection();
    if (activeSegment === "scope") return renderScopeSection();
    if (activeSegment === "wording") return renderWordingSection();
    if (activeSegment === "learn") return renderLearnSection();
    return renderLinksSection();
  };

  return (
    <PublisherAppBrandThemeContext.Provider value={brandThemeStyle}>
      <div
        data-testid="publisher-app-advanced-editor-theme"
        className="space-y-5"
        style={brandThemeStyle}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ADVANCED_SEGMENTS.map((segment) => {
            const Icon = segment.icon;
            return (
              <button
                key={segment.id}
                type="button"
                onClick={() => openSegment(segment.id)}
                className="group min-h-52 rounded-3xl border bg-background p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    {segment.id === "scope" ? (
                      <Badge variant="outline" className="rounded-full">
                        Solo lectura
                      </Badge>
                    ) : null}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-foreground">
                    {segment.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {segment.description}
                  </p>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <span className="line-clamp-2 text-xs font-medium text-foreground/75">
                      {segmentSummary(segment.id)}
                    </span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 group-hover:translate-x-1">
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <Dialog
          open={Boolean(activeSegment)}
          onOpenChange={(open) => {
            if (!open) closeSegment();
          }}
        >
          <PublisherAppBrandDialogContent
            data-testid="publisher-app-advanced-modal"
            className="h-[min(92vh,56rem)] w-[min(96vw,90rem)] gap-0 overflow-hidden p-0 sm:max-w-[90rem]"
            showCloseButton={false}
          >
            {activeDefinition ? (
              <>
                <DialogHeader className="relative border-b bg-background px-6 py-5 pr-16 sm:px-8">
                  <div className="flex items-start gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <activeDefinition.icon className="size-5" />
                    </span>
                    <div>
                      {activeSection ? (
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">
                          {activeDefinition.title}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <DialogTitle className="text-xl sm:text-2xl">
                          {activeSection?.title ?? activeDefinition.title}
                        </DialogTitle>
                        {activeSegment === "scope" ? (
                          <Badge variant="outline" className="rounded-full">
                            Solo lectura
                          </Badge>
                        ) : null}
                      </div>
                      <DialogDescription className="mt-1 max-w-3xl text-sm sm:text-base">
                        {activeSection?.story ?? activeDefinition.description}
                      </DialogDescription>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Cerrar configuración avanzada"
                    className="absolute right-4 top-4"
                    onClick={closeSegment}
                  >
                    ×
                  </Button>
                </DialogHeader>

                {activeSection ? (
                  <div className="border-b bg-muted/20 px-6 py-3 sm:px-8">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveSectionIndex(null)}
                    >
                      <ArrowLeft className="size-4" /> Volver a secciones
                    </Button>
                  </div>
                ) : null}

                <div
                  key={`${activeSegment}-${activeSectionIndex ?? "index"}`}
                  className="min-h-0 flex-1 overflow-y-auto px-6 py-7 animate-in fade-in duration-200 sm:px-8 sm:py-8"
                >
                  {activeSection ? renderCurrentSection() : renderSegmentHome()}
                </div>

                <DialogFooter className="m-0 shrink-0 rounded-none px-6 py-4 sm:px-8">
                  <Button type="button" variant="ghost" onClick={closeSegment}>
                    {activeSegment === "scope" ? "Cerrar" : "Cancelar"}
                  </Button>
                  {activeSegment === "scope" ? (
                    <Button type="button" onClick={closeSegment}>
                      <Check className="size-4" /> Listo
                    </Button>
                  ) : (
                    <Button type="button" onClick={applySegment}>
                      <Check className="size-4" /> Guardar configuración
                      avanzada
                    </Button>
                  )}
                </DialogFooter>
              </>
            ) : null}
          </PublisherAppBrandDialogContent>
        </Dialog>
      </div>
    </PublisherAppBrandThemeContext.Provider>
  );
}
