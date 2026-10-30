"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  GraduationCap,
  ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Newspaper,
  Package,
  Palette,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
  UsersRound,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DEFAULT_PUBLISHER_APP_COLOR,
  normalizePublisherAppColor,
  publisherAppDefaultColors,
  publisherAppStatusLabel,
  type PublisherAppColors,
  type PublisherAppConfig,
  type PublisherAppConfigInput,
  type PublisherAppConfigResponse,
  type PublisherAppPlatformOption,
} from "@/lib/publisher-app-config";
import {
  PUBLISHER_PORTAL_APP_EDIT_ROUTE,
  PUBLISHER_PORTAL_HOME_ROUTE,
} from "@/lib/publisher-portal-routes";
import { processSupportServiceImageUpload } from "@/lib/support-service-image-upload";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

type PublisherAppConfigWorkbenchProps = {
  mode: "create" | "edit";
  initialConfig?: PublisherAppConfig;
  publisherName: string;
  publisherTint?: string;
  publisherImageUrl?: string;
  publisherEmail: string;
  publisherUsername: string;
};

type WizardStep = "platform" | "features" | "colors" | "icon";
type ColorKey = keyof PublisherAppColors;

const WIZARD_STEPS: Array<{
  id: WizardStep;
  title: string;
  shortTitle: string;
  description: string;
  icon: typeof Smartphone;
}> = [
  {
    id: "platform",
    title: "Elegí dónde publicar",
    shortTitle: "Plataformas",
    description: "iOS o iOS + Android",
    icon: Smartphone,
  },
  {
    id: "features",
    title: "Elegí las funciones",
    shortTitle: "Funciones",
    description: "Armá la experiencia",
    icon: Sparkles,
  },
  {
    id: "colors",
    title: "Creá una paleta inolvidable",
    shortTitle: "Colores",
    description: "Tres colores de marca",
    icon: Palette,
  },
  {
    id: "icon",
    title: "Elegí el icono de tu app",
    shortTitle: "Icono",
    description: "Tu identidad en el store",
    icon: ImageIcon,
  },
];

const COLOR_FIELDS: Array<{
  key: ColorKey;
  label: string;
  description: string;
}> = [
  {
    key: "primary",
    label: "Color principal",
    description: "Botones, navegación y elementos protagonistas.",
  },
  {
    key: "secondary",
    label: "Color secundario",
    description: "Fondos suaves, tarjetas y detalles de apoyo.",
  },
  {
    key: "tertiary",
    label: "Color terciario",
    description: "Acentos, novedades y llamados especiales.",
  },
];

const PALETTE_PRESETS: Array<{ name: string; colors: PublisherAppColors }> = [
  {
    name: "Violeta eléctrico",
    colors: { primary: "#6D28D9", secondary: "#A78BFA", tertiary: "#F59E0B" },
  },
  {
    name: "Océano brillante",
    colors: { primary: "#0369A1", secondary: "#22D3EE", tertiary: "#14B8A6" },
  },
  {
    name: "Verde vital",
    colors: { primary: "#15803D", secondary: "#4ADE80", tertiary: "#A3E635" },
  },
  {
    name: "Coral cálido",
    colors: { primary: "#EA580C", secondary: "#FB7185", tertiary: "#FACC15" },
  },
];

function initialState(
  config: PublisherAppConfig | undefined,
  publisherTint?: string,
  publisherImageUrl?: string,
): PublisherAppConfigInput {
  if (config) {
    return {
      platformOption: config.platformOption,
      connectEnabled: config.connectEnabled,
      profileEnabled: config.profileEnabled,
      learnCustomizationEnabled: config.learnCustomizationEnabled,
      colors: { ...config.colors },
      iconSource: config.iconSource,
      iconImageUrl: config.iconImageUrl,
      iconImageUploadDataUrl: config.iconImageUploadDataUrl,
    };
  }
  return {
    platformOption: "ios_android",
    connectEnabled: true,
    profileEnabled: true,
    learnCustomizationEnabled: true,
    colors: publisherAppDefaultColors(publisherTint),
    iconSource: "publisher",
    iconImageUrl: publisherImageUrl?.trim() || null,
    iconImageUploadDataUrl: null,
  };
}

function normalizedPayload(state: PublisherAppConfigInput) {
  return {
    ...state,
    iconImageUrl: state.iconImageUrl?.trim() || null,
    iconImageUploadDataUrl: state.iconImageUploadDataUrl?.trim() || null,
    colors: {
      primary:
        normalizePublisherAppColor(state.colors.primary) ??
        state.colors.primary,
      secondary:
        normalizePublisherAppColor(state.colors.secondary) ??
        state.colors.secondary,
      tertiary:
        normalizePublisherAppColor(state.colors.tertiary) ??
        state.colors.tertiary,
    },
  } satisfies PublisherAppConfigInput;
}

function FeatureCard({
  id,
  checked,
  onCheckedChange,
  icon,
  title,
  description,
  locked = false,
}: {
  id: string;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  icon: ReactNode;
  title: string;
  description: string;
  locked?: boolean;
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        "group flex items-start gap-4 rounded-[22px] border p-4 shadow-sm transition sm:p-5",
        locked
          ? "cursor-default border-violet-300 bg-[linear-gradient(135deg,#6d28d9,#7c3aed_58%,#8b5cf6)] text-white shadow-[0_18px_42px_-26px_rgba(109,40,217,0.95)]"
          : checked
            ? "cursor-pointer border-violet-300 bg-violet-50/90 shadow-[0_18px_40px_-32px_rgba(109,40,217,0.7)] dark:border-violet-400/35 dark:bg-violet-500/10"
            : "cursor-pointer border-border/80 bg-card/70 hover:-translate-y-0.5 hover:border-violet-300 hover:bg-card",
      )}
    >
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-2xl border transition",
          locked
            ? "border-white/30 bg-white/18 text-white"
            : checked
              ? "border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-200"
              : "border-border bg-background text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-base font-semibold",
            locked ? "text-white" : "text-foreground",
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "mt-1 block text-sm font-normal leading-5",
            locked ? "text-white/78" : "text-muted-foreground",
          )}
        >
          {description}
        </span>
      </span>
      <span className="mt-1 flex items-center gap-2">
        {locked ? <LockKeyhole className="size-4 text-white/75" /> : null}
        <Checkbox
          id={id}
          checked={checked}
          disabled={locked}
          onCheckedChange={(next) => onCheckedChange?.(Boolean(next))}
          aria-label={title}
          className={
            locked
              ? "border-white bg-white text-violet-700 disabled:opacity-100"
              : ""
          }
        />
      </span>
    </Label>
  );
}

function AppIcon({
  source,
  publisherName,
  colors,
  className,
}: {
  source?: string | null;
  publisherName: string;
  colors: PublisherAppColors;
  className?: string;
}) {
  const initials = publisherName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[24%] border border-white/55 text-xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_14px_30px_-16px_rgba(15,23,42,0.9)]",
        className,
      )}
      style={{
        background: `linear-gradient(145deg, ${colors.secondary}, ${colors.primary} 56%, ${colors.tertiary})`,
      }}
    >
      {source ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt="" className="size-full object-cover" />
      ) : (
        <span>{initials || <Sparkles className="size-5" />}</span>
      )}
      <span className="pointer-events-none absolute inset-x-1 top-1 h-1/3 rounded-full bg-white/25 blur-sm" />
    </span>
  );
}

function PublisherAppLivePreview({
  publisherName,
  state,
  colors,
  iconSource,
}: {
  publisherName: string;
  state: PublisherAppConfigInput;
  colors: PublisherAppColors;
  iconSource?: string | null;
}) {
  const previewStyle = {
    "--preview-primary": colors.primary,
    "--preview-secondary": colors.secondary,
    "--preview-tertiary": colors.tertiary,
  } as CSSProperties;
  const features = [
    { icon: Package, label: "Catálogo", color: colors.primary },
    { icon: Newspaper, label: "Novedades", color: colors.tertiary },
    state.connectEnabled
      ? { icon: UsersRound, label: "Connect", color: colors.primary }
      : null,
    state.profileEnabled
      ? { icon: UserRound, label: "Mi perfil", color: colors.secondary }
      : null,
    state.learnCustomizationEnabled
      ? { icon: GraduationCap, label: "Learn", color: colors.tertiary }
      : null,
  ].filter(Boolean) as Array<{
    icon: typeof UsersRound;
    label: string;
    color: string;
  }>;
  return (
    <aside
      aria-label="Vista previa de la app"
      style={previewStyle}
      className="relative isolate overflow-hidden rounded-[32px] border border-white/55 bg-[radial-gradient(circle_at_78%_8%,var(--preview-secondary),transparent_38%),linear-gradient(145deg,var(--preview-primary),var(--preview-tertiary))] p-5 shadow-[0_34px_74px_-38px_rgba(15,23,42,0.88)]"
    >
      <span className="pointer-events-none absolute -right-14 -top-16 size-48 rounded-full border-[28px] border-white/15" />
      <span className="pointer-events-none absolute -bottom-20 -left-12 size-52 rounded-full bg-white/12 blur-2xl" />
      <div className="relative mb-4 flex items-center justify-between text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">
            Vista previa en vivo
          </p>
          <p className="mt-1 max-w-52 truncate font-heading text-lg font-bold">
            {publisherName}
          </p>
        </div>
        <Sparkles className="size-5 fill-white/30" />
      </div>
      <div className="relative mx-auto w-full max-w-[270px] rounded-[38px] bg-slate-950 p-[6px] shadow-[0_30px_58px_-24px_rgba(2,6,23,0.95)]">
        <div className="relative aspect-[9/17.7] overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,#ffffff,#faf8ff)] px-4 pb-4 pt-5 text-slate-950">
          <span className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-slate-950" />
          <div className="mt-4 flex items-center gap-2">
            <AppIcon
              source={iconSource}
              publisherName={publisherName}
              colors={colors}
              className="size-9 text-xs"
            />
            <span className="min-w-0 flex-1 truncate text-xs font-black">
              {publisherName}
            </span>
          </div>
          <div
            className="relative mt-4 overflow-hidden rounded-2xl p-4 text-white shadow-xl"
            style={{
              background: `linear-gradient(135deg, ${colors.primary}, ${colors.tertiary})`,
            }}
          >
            <span className="absolute -right-4 -top-5 size-20 rounded-full border-[14px] border-white/15" />
            <p className="relative text-[8px] font-bold uppercase tracking-[0.14em] text-white/75">
              Tu comunidad
            </p>
            <p className="relative mt-1 text-lg font-black leading-[0.95]">
              Todo en
              <br />
              un solo lugar
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {features.slice(0, 4).map(({ icon: Icon, label, color }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-[0_10px_22px_-16px_rgba(15,23,42,0.65)]"
              >
                <span
                  className="flex size-7 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: color }}
                >
                  <Icon className="size-3.5" />
                </span>
                <p className="mt-2 text-[8px] font-extrabold">{label}</p>
                <span className="mt-1 block h-1 w-10 rounded-full bg-slate-200" />
              </div>
            ))}
          </div>
          <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 shadow-lg backdrop-blur">
            {[colors.primary, colors.secondary, colors.tertiary].map(
              (color, index) => (
                <span
                  key={`${color}-${index}`}
                  className="size-3 rounded-full ring-2 ring-white shadow"
                  style={{ backgroundColor: color }}
                />
              ),
            )}
          </div>
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap justify-center gap-2">
        <span className="rounded-full border border-white/35 bg-white/18 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
          iOS
        </span>
        {state.platformOption === "ios_android" ? (
          <span className="rounded-full border border-white/35 bg-white/18 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
            Android
          </span>
        ) : null}
      </div>
    </aside>
  );
}

function SuccessCelebration({ publisherName }: { publisherName: string }) {
  const particles = Array.from({ length: 18 }, (_, index) => ({
    angle: (360 / 18) * index,
    distance: 90 + (index % 4) * 24,
    delay: (index % 6) * 55,
  }));
  return (
    <div className="relative isolate overflow-hidden rounded-[32px] border border-emerald-200 bg-[radial-gradient(circle_at_50%_18%,rgba(74,222,128,0.32),transparent_30%),linear-gradient(145deg,#ecfdf5,#f0fdf4_48%,#ffffff)] px-6 py-14 text-center shadow-[0_30px_80px_-48px_rgba(5,150,105,0.7)] sm:px-12 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[38%]"
      >
        {particles.map((particle, index) => (
          <span
            key={index}
            className="app-success-particle absolute left-0 top-0 size-3 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.9)]"
            style={
              {
                "--burst-angle": `${particle.angle}deg`,
                "--burst-distance": `${particle.distance}px`,
                animationDelay: `${particle.delay}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="relative mx-auto flex size-24 items-center justify-center rounded-[30px] border border-white/80 bg-[linear-gradient(145deg,#22c55e,#10b981)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_24px_48px_-22px_rgba(5,150,105,0.85)]">
        <CheckCircle2 className="size-12" strokeWidth={2.4} />
        <Sparkles className="absolute -right-5 -top-4 size-8 fill-lime-300 text-lime-300 drop-shadow" />
      </div>
      <p className="relative mt-7 text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-700">
        Solicitud recibida
      </p>
      <h2 className="relative mt-2 font-heading text-3xl font-bold tracking-tight text-emerald-950 sm:text-4xl">
        ¡La app de {publisherName} ya está en marcha!
      </h2>
      <p className="relative mx-auto mt-4 max-w-2xl text-base leading-7 text-emerald-900/75">
        Recibimos la configuración y nuestro equipo la va a revisar dentro de
        las próximas 24 a 48 horas. Te contactaremos si necesitamos algún
        detalle adicional.
      </p>
      <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button
          asChild
          className="h-12 rounded-xl bg-emerald-600 px-6 text-white shadow-[0_14px_28px_-16px_rgba(5,150,105,0.9)] hover:bg-emerald-700"
        >
          <Link href={PUBLISHER_PORTAL_APP_EDIT_ROUTE}>
            Ver y editar mi app <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-12 rounded-xl border-emerald-200 bg-white/80 px-6 text-emerald-900"
        >
          <Link href={PUBLISHER_PORTAL_HOME_ROUTE}>
            <ArrowLeft className="size-4" /> Volver al inicio
          </Link>
        </Button>
      </div>
      <style>{`@keyframes app-success-burst { 0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--burst-angle)) translateX(0) scale(.4); } 24% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--burst-angle)) translateX(var(--burst-distance)) scale(1.15); } } .app-success-particle { animation: app-success-burst 1.5s cubic-bezier(.17,.67,.26,1.02) infinite; }`}</style>
    </div>
  );
}

export function PublisherAppConfigWorkbench({
  mode,
  initialConfig,
  publisherName,
  publisherTint,
  publisherImageUrl,
  publisherEmail,
  publisherUsername,
}: PublisherAppConfigWorkbenchProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState(() =>
    initialState(initialConfig, publisherTint, publisherImageUrl),
  );
  const [persistedState, setPersistedState] = useState(() =>
    initialState(initialConfig, publisherTint, publisherImageUrl),
  );
  const [persistedConfig, setPersistedConfig] = useState(initialConfig);
  const [pending, setPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [iconUploadPending, setIconUploadPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const activeStep = WIZARD_STEPS[stepIndex] ?? WIZARD_STEPS[0];
  const statusLabel = publisherAppStatusLabel(
    persistedConfig?.status ?? "pending_revision",
  );
  const canDelete = persistedConfig?.status === "pending_revision";
  const payload = useMemo(() => normalizedPayload(state), [state]);
  const changed =
    JSON.stringify(payload) !==
    JSON.stringify(normalizedPayload(persistedState));
  const colorErrors = useMemo(
    () =>
      COLOR_FIELDS.reduce<Partial<Record<ColorKey, string>>>(
        (errors, field) => {
          if (!normalizePublisherAppColor(state.colors[field.key]))
            errors[field.key] = "Ingresá un color hexadecimal de 6 dígitos.";
          return errors;
        },
        {},
      ),
    [state.colors],
  );
  const hasColorErrors = Object.keys(colorErrors).length > 0;
  const customIconMissing =
    state.iconSource === "custom" &&
    !state.iconImageUrl?.trim() &&
    !state.iconImageUploadDataUrl?.trim();
  const customIconUrlInvalid = useMemo(() => {
    const value = state.iconImageUrl?.trim();
    if (state.iconSource !== "custom" || !value) return false;
    try {
      return new URL(value).protocol !== "https:";
    } catch {
      return true;
    }
  }, [state.iconImageUrl, state.iconSource]);
  const previewColors = {
    primary:
      normalizePublisherAppColor(state.colors.primary) ??
      DEFAULT_PUBLISHER_APP_COLOR,
    secondary:
      normalizePublisherAppColor(state.colors.secondary) ??
      DEFAULT_PUBLISHER_APP_COLOR,
    tertiary:
      normalizePublisherAppColor(state.colors.tertiary) ??
      DEFAULT_PUBLISHER_APP_COLOR,
  };
  const resolvedIconSource =
    state.iconSource === "publisher"
      ? (publisherImageUrl ??
        state.iconImageUrl ??
        state.iconImageUploadDataUrl)
      : (state.iconImageUploadDataUrl ?? state.iconImageUrl);

  function updateState(patch: Partial<PublisherAppConfigInput>) {
    setState((current) => ({ ...current, ...patch }));
  }
  function updateColor(key: ColorKey, value: string) {
    setState((current) => ({
      ...current,
      colors: { ...current.colors, [key]: value },
    }));
  }
  function chooseIconSource(iconSource: "publisher" | "custom") {
    updateState(
      iconSource === "publisher"
        ? {
            iconSource,
            iconImageUrl: publisherImageUrl?.trim() || null,
            iconImageUploadDataUrl: null,
          }
        : { iconSource, iconImageUrl: null, iconImageUploadDataUrl: null },
    );
  }
  async function handleIconUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIconUploadPending(true);
    setToast(null);
    try {
      const processed = await processSupportServiceImageUpload(file);
      updateState({
        iconSource: "custom",
        iconImageUrl: null,
        iconImageUploadDataUrl: processed.dataUrl,
      });
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        title: "No pudimos preparar el icono",
        message:
          "Usá una imagen PNG, JPG o WebP de hasta 600 KB, preferentemente cuadrada.",
      });
    } finally {
      setIconUploadPending(false);
    }
  }

  function downloadConfig() {
    if (!persistedConfig) return;
    try {
      const blob = new Blob([JSON.stringify(persistedConfig, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const baseName =
        publisherName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "publisher";
      anchor.href = objectUrl;
      anchor.download = `${baseName}-app-config.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        title: "No pudimos descargar la configuración",
        message: "Volvé a intentarlo desde este navegador.",
      });
    }
  }

  async function deleteApp() {
    if (!canDelete || deletePending) return;
    setDeletePending(true);
    setToast(null);
    try {
      const response = await sdkFetch<{ deleted: boolean; configId: string }>(
        "/publisher-app/config",
        { method: "DELETE" },
      );
      if (!response.deleted) {
        throw new Error("El servidor no confirmó la eliminación.");
      }
      router.replace(PUBLISHER_PORTAL_HOME_ROUTE);
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        title: "No pudimos eliminar la app",
        message:
          error instanceof Error
            ? error.message
            : "Revisá el estado de la app y volvé a intentarlo.",
        details: error instanceof SdkRequestError ? error.details : undefined,
      });
    } finally {
      setDeletePending(false);
    }
  }

  async function save() {
    if (
      hasColorErrors ||
      customIconMissing ||
      customIconUrlInvalid ||
      pending ||
      iconUploadPending ||
      (mode === "edit" && !changed)
    )
      return;
    setPending(true);
    setToast(null);
    try {
      const response = await sdkFetch<PublisherAppConfigResponse>(
        "/publisher-app/config",
        {
          method: mode === "create" ? "POST" : "PUT",
          body: JSON.stringify(payload),
        },
      );
      const saved = response.config;
      if (!saved)
        throw new Error(
          "La configuración guardada no fue devuelta por el servidor.",
        );
      const nextState = initialState(saved, publisherTint, publisherImageUrl);
      setState(nextState);
      setPersistedState(nextState);
      setPersistedConfig(saved);
      if (mode === "create") {
        setCompleted(true);
        return;
      }
      setToast({
        id: Date.now(),
        tone: "success",
        title: "Cambios guardados",
        message:
          "La configuración de tu app está actualizada y continúa pendiente de revisión.",
      });
      router.refresh();
    } catch (error) {
      if (
        mode === "create" &&
        error instanceof SdkRequestError &&
        error.status === 409
      ) {
        router.replace(PUBLISHER_PORTAL_APP_EDIT_ROUTE);
        router.refresh();
        return;
      }
      setToast({
        id: Date.now(),
        tone: "error",
        title: "No pudimos guardar la configuración",
        message:
          error instanceof Error
            ? error.message
            : "Revisá los datos y volvé a intentarlo.",
        details: error instanceof SdkRequestError ? error.details : undefined,
      });
    } finally {
      setPending(false);
    }
  }

  if (completed)
    return (
      <section className="pb-24">
        <SuccessCelebration publisherName={publisherName} />
      </section>
    );

  return (
    <section className="pb-24" data-testid="publisher-app-config-workbench">
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language="es"
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-2xl font-semibold text-foreground">
              {mode === "create" ? "Configurá tu app" : "Editá tu app"}
            </h2>
            {mode === "edit" ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                {statusLabel}
              </span>
            ) : null}
            <HeaderUnclutterButton />
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {publisherName}
            {publisherUsername ? ` · @${publisherUsername}` : ""}
            {publisherEmail ? ` · ${publisherEmail}` : ""}
          </p>
        </div>
        <Button variant="outline" asChild className="h-10 rounded-xl">
          <Link href={PUBLISHER_PORTAL_HOME_ROUTE}>
            <ArrowLeft className="size-4" />
            Volver al inicio
          </Link>
        </Button>
      </div>

      <ol
        aria-label="Progreso de configuración"
        className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        {WIZARD_STEPS.map((step, index) => {
          const active = index === stepIndex;
          const complete = index < stepIndex;
          const Icon = step.icon;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => setStepIndex(index)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex min-h-24 w-full items-center gap-3 rounded-[22px] border px-4 py-4 text-left transition duration-200",
                  active
                    ? "border-violet-500 bg-[linear-gradient(135deg,#5b21b6,#6d28d9_58%,#7c3aed)] text-white shadow-[0_20px_44px_-26px_rgba(109,40,217,0.95)]"
                    : complete
                      ? "border-violet-200 bg-violet-50 text-violet-950 hover:-translate-y-0.5 hover:border-violet-300 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-50"
                      : "border-violet-200/80 bg-[linear-gradient(145deg,#faf5ff,#f5f3ff)] text-violet-950 hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_18px_38px_-28px_rgba(109,40,217,0.75)] dark:border-violet-400/20 dark:bg-[linear-gradient(145deg,rgba(76,29,149,.2),rgba(91,33,182,.12))] dark:text-violet-50",
                )}
              >
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl border",
                    active
                      ? "border-white/25 bg-white/15"
                      : "border-violet-200 bg-white text-violet-700 dark:bg-violet-950/50",
                  )}
                >
                  {complete && !active ? (
                    <Check className="size-5" />
                  ) : (
                    <Icon className="size-5" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold uppercase tracking-[0.12em] opacity-70">
                    Paso {index + 1}
                  </span>
                  <span className="mt-0.5 block font-semibold">
                    {step.shortTitle}
                  </span>
                  <span className="mt-0.5 block truncate text-xs opacity-70">
                    {step.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="overflow-hidden rounded-[28px] border border-border/80 bg-card shadow-[0_26px_68px_-48px_rgba(15,23,42,0.68)]">
          <div className="border-b border-violet-100 bg-[linear-gradient(135deg,rgba(109,40,217,0.08),rgba(139,92,246,0.03))] px-5 py-5 sm:px-7">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              Paso {stepIndex + 1} de {WIZARD_STEPS.length}
            </p>
            <h3 className="mt-1 font-heading text-2xl font-semibold text-foreground sm:text-3xl">
              {activeStep.title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Podés tocar cualquier paso de arriba para avanzar o volver cuando
              quieras.
            </p>
          </div>

          <div className="min-h-[440px] p-5 sm:p-7">
            {activeStep.id === "platform" ? (
              <RadioGroup
                aria-label="Plataformas de la app"
                value={state.platformOption}
                onValueChange={(value) =>
                  updateState({
                    platformOption: value as PublisherAppPlatformOption,
                  })
                }
                className="grid gap-4 md:grid-cols-2"
              >
                {[
                  {
                    value: "ios" as const,
                    title: "Solo iOS",
                    description:
                      "Una experiencia enfocada en iPhone y el ecosistema Apple.",
                    badges: ["iPhone"],
                  },
                  {
                    value: "ios_android" as const,
                    title: "iOS + Android",
                    description:
                      "Tu identidad y funciones disponibles en las dos plataformas.",
                    badges: ["iPhone", "Android"],
                  },
                ].map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`publisher-app-platform-${option.value}`}
                    className={cn(
                      "relative flex min-h-60 cursor-pointer flex-col overflow-hidden rounded-[24px] border p-5 transition hover:-translate-y-0.5",
                      state.platformOption === option.value
                        ? "border-violet-400 bg-[linear-gradient(145deg,#6d28d9,#7c3aed_62%,#8b5cf6)] text-white shadow-[0_24px_50px_-30px_rgba(109,40,217,0.95)]"
                        : "border-border/80 bg-background/60 hover:border-violet-300 hover:bg-violet-50/45",
                    )}
                  >
                    <span className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full border-[26px] border-white/10" />
                    <div className="relative flex items-start justify-between gap-3">
                      <span
                        className={cn(
                          "flex size-14 items-center justify-center rounded-2xl border",
                          state.platformOption === option.value
                            ? "border-white/25 bg-white/15"
                            : "border-violet-200 bg-violet-100 text-violet-700",
                        )}
                      >
                        <Smartphone className="size-7" />
                      </span>
                      <RadioGroupItem
                        id={`publisher-app-platform-${option.value}`}
                        value={option.value}
                        className={
                          state.platformOption === option.value
                            ? "border-white text-white"
                            : ""
                        }
                      />
                    </div>
                    <span className="relative mt-6 block text-xl font-semibold">
                      {option.title}
                    </span>
                    <span
                      className={cn(
                        "relative mt-2 block text-sm font-normal leading-6",
                        state.platformOption === option.value
                          ? "text-white/78"
                          : "text-muted-foreground",
                      )}
                    >
                      {option.description}
                    </span>
                    <span className="relative mt-auto flex flex-wrap gap-2 pt-5">
                      {option.badges.map((badge) => (
                        <span
                          key={badge}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[11px] font-semibold",
                            state.platformOption === option.value
                              ? "border-white/30 bg-white/15"
                              : "border-violet-200 bg-white text-violet-800",
                          )}
                        >
                          {badge}
                        </span>
                      ))}
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            ) : null}

            {activeStep.id === "features" ? (
              <div className="space-y-5">
                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-violet-700">
                    Incluidas en todas las apps
                  </p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <FeatureCard
                      id="publisher-app-catalog"
                      checked
                      locked
                      icon={<Package className="size-5" />}
                      title="Catálogo de productos y servicios"
                      description="Tus ofertas siempre disponibles, ordenadas y listas para descubrir."
                    />
                    <FeatureCard
                      id="publisher-app-feed"
                      checked
                      locked
                      icon={<Newspaper className="size-5" />}
                      title="Feed de novedades"
                      description="Notas, eventos y publicaciones para mantener activa tu comunidad."
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    Personalizá tu experiencia
                  </p>
                  <div className="grid gap-3">
                    <FeatureCard
                      id="publisher-app-connect"
                      checked={state.connectEnabled}
                      onCheckedChange={(connectEnabled) =>
                        updateState({ connectEnabled })
                      }
                      icon={<UsersRound className="size-5" />}
                      title="Connect"
                      description="Comunidad, vínculos y espacios de conexión dentro de la app."
                    />
                    <FeatureCard
                      id="publisher-app-profile"
                      checked={state.profileEnabled}
                      onCheckedChange={(profileEnabled) =>
                        updateState({ profileEnabled })
                      }
                      icon={<UserRound className="size-5" />}
                      title="Perfil"
                      description="Cada persona puede gestionar sus datos y preferencias."
                    />
                    <FeatureCard
                      id="publisher-app-learn"
                      checked={state.learnCustomizationEnabled}
                      onCheckedChange={(learnCustomizationEnabled) =>
                        updateState({ learnCustomizationEnabled })
                      }
                      icon={<GraduationCap className="size-5" />}
                      title="Personalizar Learn"
                      description="Adaptá la sección educativa a tu marca, contenidos y comunidad."
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeStep.id === "colors" ? (
              <div className="space-y-6">
                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-violet-700">
                    Paletas para empezar
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PALETTE_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() =>
                          updateState({ colors: { ...preset.colors } })
                        }
                        className="group flex items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-sm"
                      >
                        <span className="flex -space-x-2">
                          {Object.values(preset.colors).map((color) => (
                            <span
                              key={color}
                              className="size-9 rounded-full border-2 border-white shadow"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {preset.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4">
                  {COLOR_FIELDS.map((field) => {
                    const normalized = normalizePublisherAppColor(
                      state.colors[field.key],
                    );
                    return (
                      <div
                        key={field.key}
                        className="grid gap-4 overflow-hidden rounded-[22px] border border-border/80 bg-background/60 p-4 sm:grid-cols-[82px_minmax(0,1fr)_190px] sm:items-center"
                      >
                        <label
                          className="relative flex size-[72px] cursor-pointer overflow-hidden rounded-[22px] border-4 border-white shadow-[0_12px_25px_-15px_rgba(15,23,42,0.8)]"
                          title={`Abrir selector de ${field.label.toLowerCase()}`}
                          style={{
                            backgroundColor:
                              normalized ?? DEFAULT_PUBLISHER_APP_COLOR,
                          }}
                        >
                          <input
                            type="color"
                            aria-label={`Elegir ${field.label.toLowerCase()}`}
                            value={normalized ?? DEFAULT_PUBLISHER_APP_COLOR}
                            onChange={(event) =>
                              updateColor(
                                field.key,
                                event.target.value.toUpperCase(),
                              )
                            }
                            className="absolute -inset-3 size-24 cursor-pointer opacity-0"
                          />
                          <Palette className="pointer-events-none m-auto size-6 text-white drop-shadow" />
                        </label>
                        <div>
                          <Label
                            htmlFor={`publisher-app-color-${field.key}`}
                            className="text-sm font-semibold text-foreground"
                          >
                            {field.label}
                          </Label>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {field.description}
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-violet-700">
                            Tocá la muestra para abrir el selector completo.
                          </p>
                        </div>
                        <div>
                          <Input
                            id={`publisher-app-color-${field.key}`}
                            value={state.colors[field.key]}
                            onChange={(event) =>
                              updateColor(field.key, event.target.value)
                            }
                            onBlur={() => {
                              if (normalized)
                                updateColor(field.key, normalized);
                            }}
                            maxLength={7}
                            spellCheck={false}
                            aria-invalid={Boolean(colorErrors[field.key])}
                            className="h-11 font-mono uppercase"
                          />
                          {colorErrors[field.key] ? (
                            <p className="mt-1 text-xs text-destructive">
                              {colorErrors[field.key]}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {activeStep.id === "icon" ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => chooseIconSource("publisher")}
                    className={cn(
                      "flex min-h-48 flex-col items-center rounded-[24px] border p-5 text-center transition hover:-translate-y-0.5",
                      state.iconSource === "publisher"
                        ? "border-violet-400 bg-violet-50 shadow-[0_20px_42px_-32px_rgba(109,40,217,0.85)]"
                        : "border-border bg-background hover:border-violet-300",
                    )}
                  >
                    <AppIcon
                      source={publisherImageUrl}
                      publisherName={publisherName}
                      colors={previewColors}
                      className="size-20"
                    />
                    <span className="mt-4 font-semibold text-foreground">
                      Usar mi identidad actual
                    </span>
                    <span className="mt-1 text-xs leading-5 text-muted-foreground">
                      Es la opción recomendada y ya está seleccionada por
                      defecto.
                    </span>
                    {state.iconSource === "publisher" ? (
                      <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-bold text-white">
                        <Check className="size-3" /> Seleccionado
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseIconSource("custom")}
                    className={cn(
                      "flex min-h-48 flex-col items-center rounded-[24px] border p-5 text-center transition hover:-translate-y-0.5",
                      state.iconSource === "custom"
                        ? "border-violet-400 bg-violet-50 shadow-[0_20px_42px_-32px_rgba(109,40,217,0.85)]"
                        : "border-border bg-background hover:border-violet-300",
                    )}
                  >
                    <span className="flex size-20 items-center justify-center rounded-[24px] border-2 border-dashed border-violet-300 bg-white text-violet-700">
                      <UploadCloud className="size-8" />
                    </span>
                    <span className="mt-4 font-semibold text-foreground">
                      Usar un icono distinto
                    </span>
                    <span className="mt-1 text-xs leading-5 text-muted-foreground">
                      Subí una imagen cuadrada o pegá una URL segura.
                    </span>
                    {state.iconSource === "custom" ? (
                      <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-bold text-white">
                        <Check className="size-3" /> Seleccionado
                      </span>
                    ) : null}
                  </button>
                </div>
                {state.iconSource === "custom" ? (
                  <div className="grid gap-4 rounded-[22px] border border-violet-200 bg-violet-50/55 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                    <AppIcon
                      source={
                        state.iconImageUploadDataUrl ?? state.iconImageUrl
                      }
                      publisherName={publisherName}
                      colors={previewColors}
                      className="size-24"
                    />
                    <div className="min-w-0 space-y-3">
                      <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700">
                        {iconUploadPending ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <UploadCloud className="size-4" />
                        )}
                        {iconUploadPending
                          ? "Preparando icono…"
                          : "Subir PNG, JPG o WebP"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => void handleIconUpload(event)}
                          disabled={iconUploadPending}
                          className="sr-only"
                        />
                      </label>
                      <div>
                        <Label
                          htmlFor="publisher-app-icon-url"
                          className="text-xs font-semibold text-foreground"
                        >
                          O usá una URL HTTPS
                        </Label>
                        <Input
                          id="publisher-app-icon-url"
                          type="url"
                          value={state.iconImageUrl ?? ""}
                          onChange={(event) =>
                            updateState({
                              iconSource: "custom",
                              iconImageUrl: event.target.value,
                              iconImageUploadDataUrl: null,
                            })
                          }
                          placeholder="https://ejemplo.com/icono.png"
                          className="mt-1 h-11"
                        />
                      </div>
                      {customIconMissing || customIconUrlInvalid ? (
                        <p className="text-xs font-medium text-destructive">
                          {customIconUrlInvalid
                            ? "Ingresá una URL HTTPS válida."
                            : "Subí un icono o ingresá una URL para continuar."}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-border/70 bg-muted/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setStepIndex((current) => Math.max(current - 1, 0))
              }
              disabled={stepIndex === 0 || pending}
              className="h-11 rounded-xl"
            >
              <ArrowLeft className="size-4" />
              Anterior
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              {mode === "edit" ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setState(normalizedPayload(persistedState));
                    setStepIndex(0);
                  }}
                  disabled={!changed || pending}
                  className="h-11 rounded-xl"
                >
                  <RotateCcw className="size-4" />
                  Descartar cambios
                </Button>
              ) : null}
              {stepIndex < WIZARD_STEPS.length - 1 ? (
                <Button
                  type="button"
                  onClick={() =>
                    setStepIndex((current) =>
                      Math.min(current + 1, WIZARD_STEPS.length - 1),
                    )
                  }
                  disabled={pending}
                  className="h-11 rounded-xl bg-violet-600 px-5 text-white shadow-[0_14px_28px_-18px_rgba(109,40,217,0.9)] hover:bg-violet-700"
                >
                  Siguiente
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void save()}
                  disabled={
                    pending ||
                    iconUploadPending ||
                    hasColorErrors ||
                    customIconMissing ||
                    customIconUrlInvalid ||
                    (mode === "edit" && !changed)
                  }
                  className="h-11 rounded-xl bg-violet-600 px-5 text-white shadow-[0_14px_28px_-18px_rgba(109,40,217,0.9)] hover:bg-violet-700"
                >
                  {pending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {pending
                    ? "Guardando…"
                    : mode === "create"
                      ? "Crear mi app"
                      : "Guardar cambios"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="xl:sticky xl:top-24">
          <PublisherAppLivePreview
            publisherName={publisherName}
            state={state}
            colors={previewColors}
            iconSource={resolvedIconSource}
          />
          {mode === "edit" ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <div className="flex items-center gap-2 font-semibold">
                <LockKeyhole className="size-4" /> Estado administrado por
                Pocket Genes
              </div>
              <p className="mt-1 text-xs leading-5 text-amber-900/75">
                Tu app está en <strong>{statusLabel}</strong>. El publicador no
                puede cambiar este estado.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {mode === "edit" ? (
        <div className="mt-8 grid gap-5">
          <section className="rounded-[24px] border border-violet-200/80 bg-[linear-gradient(135deg,rgba(245,243,255,.92),rgba(255,255,255,.96))] p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <Download className="size-5" />
                </span>
                <div>
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    Descargar configuración
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Exportá toda la información persistida de esta app en un
                    archivo JSON, incluyendo identidad, funciones, colores,
                    icono, estado y datos de auditoría.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={downloadConfig}
                disabled={!persistedConfig}
                className="h-11 shrink-0 rounded-xl border-violet-300 bg-white text-violet-800 hover:bg-violet-50"
              >
                <Download className="size-4" />
                Descargar configuración
              </Button>
            </div>
          </section>

          <section className="rounded-[24px] border border-destructive/30 bg-destructive/[0.04] p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                  <Trash2 className="size-5" />
                </span>
                <div>
                  <h3 className="font-heading text-lg font-semibold text-destructive">
                    Zona de peligro
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Eliminar la app borra permanentemente su configuración. Esta
                    acción sólo está disponible mientras el estado sea
                    <strong className="text-foreground">
                      {" "}
                      Pending revision
                    </strong>
                    .
                  </p>
                  {!canDelete ? (
                    <p className="mt-2 text-sm font-semibold text-destructive">
                      La app ya no está pendiente de revisión y no puede ser
                      eliminada por el publicador.
                    </p>
                  ) : null}
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!canDelete || pending || deletePending}
                    className="h-11 shrink-0 rounded-xl"
                  >
                    {deletePending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    {deletePending ? "Eliminando…" : "Eliminar mi app"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia className="bg-destructive/10 text-destructive">
                      <Trash2 className="size-5" />
                    </AlertDialogMedia>
                    <AlertDialogTitle>
                      ¿Eliminar definitivamente tu app?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Se borrará la configuración completa de {publisherName}.
                      Esta acción no se puede deshacer. Podrás iniciar una nueva
                      solicitud desde el banner de Mi app.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deletePending}>
                      Cancelar
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={deletePending}
                      onClick={(event) => {
                        event.preventDefault();
                        void deleteApp();
                      }}
                    >
                      {deletePending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      {deletePending
                        ? "Eliminando…"
                        : "Eliminar definitivamente"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
