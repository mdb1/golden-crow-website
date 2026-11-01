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
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileCheck2,
  GraduationCap,
  ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Newspaper,
  Package,
  Palette,
  Pencil,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
  UploadCloud,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DEFAULT_PUBLISHER_APP_COLOR,
  normalizePublisherAppColor,
  publisherAppDefaultColors,
  publisherAppPaletteSuggestions,
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

type WizardStep = "platform" | "features" | "colors" | "icon" | "review";
type ColorKey = keyof PublisherAppColors;

const PUBLISHER_APP_TERMS_PDF_PATH =
  "/PocketGenesSDK_Terminos_y_Condiciones.pdf";

const PUBLISHER_APP_MANAGED_SERVICE_BENEFITS = [
  "Continued licensing of PocketGenesSDK.",
  "Ongoing SDK maintenance and improvements.",
  "Integration of SDK updates into your app.",
  "New app builds and store submissions included.",
  "Security and compatibility updates.",
  "Technical support for SDK functionality.",
];

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

const REVIEW_STEP = {
  id: "review",
  title: "Revisá y confirmá tu solicitud",
  shortTitle: "Revisión",
  description: "Resumen y condiciones",
  icon: FileCheck2,
} satisfies (typeof WIZARD_STEPS)[number];

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

const PALETTE_SUGGESTION_COPY = [
  {
    name: "Tu marca, más viva",
    description: "La recomendada: intensifica tu identidad sin perderla.",
  },
  {
    name: "Comunidad vibrante",
    description: "Contraste enérgico para interacción y novedades.",
  },
  {
    name: "Lectura y contenido",
    description: "Equilibrio luminoso para clases, notas y navegación.",
  },
  {
    name: "Profundidad premium",
    description: "Una base profunda con acentos claros y expresivos.",
  },
] as const;

function samePalette(left: PublisherAppColors, right: PublisherAppColors) {
  return (Object.keys(left) as ColorKey[]).every(
    (key) =>
      normalizePublisherAppColor(left[key]) ===
      normalizePublisherAppColor(right[key]),
  );
}

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
    platformOption: "ios",
    connectEnabled: true,
    profileEnabled: false,
    learnCustomizationEnabled: false,
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
        "group relative flex min-h-[108px] items-center gap-4 overflow-hidden rounded-[24px] border px-4 py-4 transition duration-200 sm:gap-5 sm:px-5",
        checked
          ? "border-violet-300 bg-[linear-gradient(135deg,rgba(139,92,246,0.11),rgba(109,40,217,0.045))] shadow-[0_18px_38px_-34px_rgba(109,40,217,0.72)] dark:border-violet-400/35 dark:bg-[linear-gradient(135deg,rgba(139,92,246,0.16),rgba(109,40,217,0.06))]"
          : "border-border/80 bg-card/70",
        locked
          ? "cursor-default"
          : "cursor-pointer hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_18px_38px_-32px_rgba(109,40,217,0.58)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-5 left-0 w-1 rounded-r-full transition-colors",
          checked ? "bg-violet-600" : "bg-transparent",
        )}
      />
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-2xl border transition sm:size-14",
          checked
            ? "border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-200"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground sm:text-lg">
          {title}
        </span>
        <span className="mt-1 block max-w-3xl text-sm font-normal leading-5 text-muted-foreground sm:min-h-12 sm:leading-6">
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="flex shrink-0 flex-col items-end gap-2"
      >
        {locked ? (
          <span className="hidden items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-violet-800 sm:inline-flex dark:bg-violet-400/15 dark:text-violet-100">
            <LockKeyhole className="size-3" />
            Incluida
          </span>
        ) : null}
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-[14px] border-2 transition duration-200",
            checked
              ? "border-violet-600 bg-violet-600 text-white shadow-[0_8px_18px_-12px_rgba(109,40,217,0.9)]"
              : "border-slate-300 bg-background text-transparent group-hover:border-violet-400 dark:border-slate-600",
          )}
        >
          <Check className="size-5" strokeWidth={3} />
        </span>
      </span>
      <span className="sr-only">
        <Checkbox
          id={id}
          checked={checked}
          disabled={locked}
          onCheckedChange={(next) => onCheckedChange?.(Boolean(next))}
          aria-label={title}
        />
      </span>
    </Label>
  );
}

function AppIcon({
  source,
  publisherName,
  colors,
  whiteBackground = false,
  className,
}: {
  source?: string | null;
  publisherName: string;
  colors: PublisherAppColors;
  whiteBackground?: boolean;
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
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[24%] border border-white/55 text-xl font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_14px_30px_-16px_rgba(15,23,42,0.9)]",
        whiteBackground ? "bg-white" : "text-white",
        className,
      )}
      style={{
        background: whiteBackground
          ? "#FFFFFF"
          : `linear-gradient(145deg, ${colors.secondary}, ${colors.primary} 56%, ${colors.tertiary})`,
        color: whiteBackground ? colors.primary : undefined,
      }}
    >
      {source ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt=""
          className={cn(
            "size-full",
            whiteBackground ? "object-contain p-1" : "object-cover",
          )}
        />
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
      ? { icon: UsersRound, label: "Comunidad", color: colors.primary }
      : null,
    state.learnCustomizationEnabled
      ? { icon: GraduationCap, label: "Clases", color: colors.tertiary }
      : null,
    state.profileEnabled
      ? { icon: CalendarDays, label: "Turnos", color: colors.secondary }
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
              whiteBackground={state.iconSource === "publisher"}
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

function ReviewField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-black/55">
        {label}
      </dt>
      <dd className="mt-1 min-h-9 whitespace-pre-wrap break-words border-b border-black/12 pb-2 text-sm leading-6 text-black">
        {children}
      </dd>
    </div>
  );
}

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-black/12 pt-6 first:border-t-0 first:pt-0">
      <h4 className="font-heading text-base font-semibold text-black">
        {title}
      </h4>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PublisherAppReviewDocument({
  publisherName,
  publisherEmail,
  state,
  colors,
  iconSource,
  termsAccepted,
  onTermsAcceptedChange,
}: {
  publisherName: string;
  publisherEmail: string;
  state: PublisherAppConfigInput;
  colors: PublisherAppColors;
  iconSource?: string | null;
  termsAccepted: boolean;
  onTermsAcceptedChange: (accepted: boolean) => void;
}) {
  const [showFullTerms, setShowFullTerms] = useState(false);
  const selectedFeatures = [
    {
      label: "Catálogo de productos y servicios",
      enabled: true,
      detail: "Incluida de forma obligatoria",
    },
    {
      label: "Feed de novedades",
      enabled: true,
      detail: "Notas, eventos y publicaciones",
    },
    {
      label: "Sección Comunidad",
      enabled: state.connectEnabled,
      detail: "Interacción y publicaciones entre usuarios",
    },
    {
      label: "Contenidos educativos propios",
      enabled: state.learnCustomizationEnabled,
      detail: "Clases y contenidos personalizados",
    },
    {
      label: "Gestión de turnos",
      enabled: state.profileEnabled,
      detail: "Solicitud y reserva de turnos",
    },
  ];
  const iconDescription =
    state.iconSource === "publisher"
      ? "Identidad actual del publicador"
      : state.iconImageUploadDataUrl
        ? "Icono personalizado subido"
        : "Icono personalizado mediante URL HTTPS";
  const platformMultiplier = state.platformOption === "ios_android" ? 2 : 1;
  const formatCommercialPrice = (pricePerPlatform: number) =>
    (pricePerPlatform * platformMultiplier).toFixed(2).replace(".", ",");
  const promotionalMonthlyPrice = formatCommercialPrice(59.99);
  const standardMonthlyPrice = formatCommercialPrice(99.99);
  const initialStoreSetupPrice = formatCommercialPrice(139.99);

  return (
    <div className="space-y-5" data-testid="publisher-app-review">
      <article className="mx-auto max-w-5xl rounded-sm bg-white px-6 py-8 text-black shadow-[0_24px_70px_rgba(15,23,42,0.16)] ring-1 ring-black/10 sm:px-10 sm:py-12">
        <header className="border-b border-black/20 pb-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/55">
                Pocket Genes · Solicitud de app propia
              </p>
              <h3 className="mt-2 font-heading text-2xl font-semibold text-black">
                Revisión de configuración y condiciones
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/70">
                Documento de revisión de solo lectura. Volvé a los pasos
                anteriores si necesitás modificar alguna selección antes de
                aceptar.
              </p>
            </div>
            <AppIcon
              source={iconSource}
              publisherName={publisherName}
              colors={colors}
              whiteBackground={state.iconSource === "publisher"}
              className="size-20"
            />
          </div>
        </header>

        <div className="mt-8 space-y-8">
          <ReviewSection title="Identidad del solicitante">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <ReviewField label="Cliente">{publisherName}</ReviewField>
              <ReviewField label="Email">
                {publisherEmail || "No informado"}
              </ReviewField>
            </dl>
          </ReviewSection>

          <ReviewSection title="Configuración solicitada">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <ReviewField label="Plataformas">
                {state.platformOption === "ios_android"
                  ? "iOS + Android"
                  : "Solo iOS"}
              </ReviewField>
              <ReviewField label="Icono de la app">
                {iconDescription}
              </ReviewField>
            </dl>
          </ReviewSection>

          <ReviewSection title="Funciones y experiencias">
            <div className="overflow-hidden border border-black/15">
              {selectedFeatures.map((feature) => (
                <div
                  key={feature.label}
                  className="grid gap-2 border-b border-black/10 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold text-black">
                      {feature.label}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-black/60">
                      {feature.detail}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex w-fit items-center gap-1.5 text-xs font-semibold",
                      feature.enabled ? "text-emerald-700" : "text-black/45",
                    )}
                  >
                    {feature.enabled ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <span className="size-4 rounded-full border border-black/30" />
                    )}
                    {feature.enabled ? "Incluida" : "No incluida"}
                  </span>
                </div>
              ))}
            </div>
          </ReviewSection>

          <ReviewSection title="Paleta visual">
            <dl className="grid gap-4 sm:grid-cols-3">
              {COLOR_FIELDS.map((field) => (
                <div key={field.key} className="border border-black/15 p-3">
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-black/55">
                    {field.label}
                  </dt>
                  <dd className="mt-3 flex items-center gap-3 text-sm font-semibold text-black">
                    <span
                      className="size-9 rounded-sm border border-black/15"
                      style={{ backgroundColor: colors[field.key] }}
                    />
                    {colors[field.key]}
                  </dd>
                </div>
              ))}
            </dl>
          </ReviewSection>

          <ReviewSection title="Resumen comercial">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <ReviewField label="Suscripción mensual">
                USD {promotionalMonthlyPrice} por mes · precio bonificado por 6
                meses (luego USD {standardMonthlyPrice})
              </ReviewField>
              <ReviewField label="Alta inicial en stores">
                USD {initialStoreSetupPrice} · pago único
              </ReviewField>
            </dl>
          </ReviewSection>

          <ReviewSection title="PocketGenesSDK managed service">
            <div
              data-testid="publisher-app-subscription-offer"
              className="relative isolate overflow-hidden rounded-[28px] border border-black/10 bg-white px-5 py-6 text-black shadow-[0_28px_64px_-38px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#0b0c0d] dark:text-white dark:shadow-[0_28px_64px_-34px_rgba(0,0,0,0.88)] sm:px-8 sm:py-8"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-emerald-500/15 blur-3xl dark:bg-emerald-500/10"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-violet-500/10 blur-3xl"
              />
              <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-medium text-black/65 dark:text-white/72 sm:text-xl">
                    Monthly subscription per platform
                  </p>
                  <div
                    data-testid="publisher-app-promotional-price"
                    aria-label="$59.99 USD per month for the first six months"
                    className="mt-4 flex flex-col gap-4 text-black dark:text-white sm:flex-row sm:items-end sm:gap-6"
                  >
                    <span className="shrink-0 font-heading font-semibold tracking-tight">
                      <span
                        data-testid="publisher-app-promotional-amount"
                        className="block text-5xl leading-none sm:text-6xl"
                      >
                        $59.99
                      </span>
                      <span
                        data-testid="publisher-app-promotional-unit"
                        className="mt-2 block text-sm font-bold uppercase tracking-[0.16em] text-black/55 dark:text-white/60 sm:text-base"
                      >
                        USD / month
                      </span>
                    </span>
                    <span
                      data-testid="publisher-app-promotional-duration"
                      className="border-t border-emerald-700/20 pt-3 sm:border-l sm:border-t-0 sm:pb-0.5 sm:pl-6 sm:pt-0 dark:border-emerald-300/25"
                    >
                      <span className="block text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
                        Promotional price
                      </span>
                      <span className="mt-1 block text-lg font-medium leading-tight text-black/65 dark:text-white/70 sm:text-xl">
                        for the first
                      </span>
                      <span className="block font-heading text-3xl font-semibold leading-tight tracking-tight text-emerald-700 dark:text-emerald-400 sm:text-4xl">
                        six months
                      </span>
                    </span>
                  </div>
                  <p
                    data-testid="publisher-app-standard-price"
                    className="mt-3 text-base font-medium text-black/48 dark:text-white/55 sm:text-lg"
                  >
                    Regular price:{" "}
                    <span className="line-through decoration-2 decoration-black/35 dark:decoration-white/35">
                      $99.99 USD
                    </span>
                  </p>
                </div>
                <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-emerald-700/15 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-400/15 dark:bg-emerald-500/15 dark:text-emerald-400 sm:text-base">
                  Managed service
                </span>
              </div>

              <div className="relative mt-7 border-t border-black/10 pt-7 dark:border-white/10">
                <h5 className="text-lg font-semibold text-black dark:text-white sm:text-xl">
                  Included while the subscription is active
                </h5>
                <ul className="mt-5 grid gap-4">
                  {PUBLISHER_APP_MANAGED_SERVICE_BENEFITS.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-start gap-3 text-base leading-6 text-black/80 dark:text-white/88 sm:text-lg"
                    >
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 size-5 shrink-0 text-emerald-400 sm:size-6"
                      />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-5 flex justify-center">
              <Button
                type="button"
                variant="outline"
                aria-expanded={showFullTerms}
                aria-controls="publisher-app-full-terms"
                onClick={() => setShowFullTerms((current) => !current)}
                className="h-11 rounded-xl border-violet-200 bg-white px-5 font-semibold text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900"
              >
                {showFullTerms
                  ? "Hide full terms and conditions"
                  : "See full terms and conditions"}
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform duration-200",
                    showFullTerms && "rotate-180",
                  )}
                />
              </Button>
            </div>

            {showFullTerms ? (
              <div
                id="publisher-app-full-terms"
                data-testid="publisher-app-terms-document"
                className="mt-5 overflow-hidden rounded-2xl border border-black/15 bg-[#e8ebef] shadow-[0_18px_45px_-32px_rgba(15,23,42,0.5)]"
              >
                <div className="flex flex-col gap-3 border-b border-black/10 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                      <FileCheck2 className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-black">
                        PocketGenesSDK_Terminos_y_Condiciones.pdf
                      </p>
                      <p className="mt-0.5 text-xs text-black/55">
                        Documento contractual · PDF · 25 páginas
                      </p>
                    </div>
                  </div>
                  <a
                    href={PUBLISHER_APP_TERMS_PDF_PATH}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-black/15 bg-white px-3 text-xs font-semibold text-black transition hover:border-violet-300 hover:text-violet-700"
                  >
                    Abrir PDF <ExternalLink className="size-3.5" />
                  </a>
                </div>
                <div className="h-[360px] overflow-hidden bg-[#d7dbe1] sm:h-[440px]">
                  <iframe
                    title="Términos y condiciones de PocketGenesSDK"
                    src={`${PUBLISHER_APP_TERMS_PDF_PATH}#page=1&view=FitH&toolbar=0&navpanes=0`}
                    loading="lazy"
                    scrolling="yes"
                    className="h-full w-full bg-white"
                  />
                </div>
                <p className="border-t border-black/10 bg-white px-4 py-2.5 text-xs leading-5 text-black/55">
                  Desplazate dentro del documento para revisar todas las páginas
                  sin abandonar este paso.
                </p>
              </div>
            ) : null}
          </ReviewSection>
        </div>

        <footer className="mt-10 border-t border-black/20 pt-5 text-xs leading-5 text-black/55">
          Versión de condiciones: 31 de octubre de 2026 · La aceptación será
          registrada junto con la solicitud de creación.
        </footer>
      </article>

      <div
        data-testid="publisher-app-terms-acceptance"
        data-selected={termsAccepted ? "true" : "false"}
        className={cn(
          "mx-auto max-w-5xl rounded-[22px] border p-1 shadow-[0_18px_48px_-36px_rgba(109,40,217,0.7)] transition-all duration-200",
          termsAccepted
            ? "border-emerald-300 bg-emerald-50/80 shadow-[0_18px_48px_-32px_rgba(5,150,105,0.55)]"
            : "border-violet-200 bg-[linear-gradient(135deg,rgba(245,243,255,0.94),rgba(255,255,255,0.96))] hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_22px_52px_-34px_rgba(109,40,217,0.75)]",
        )}
      >
        <Label
          htmlFor="publisher-app-terms"
          className="flex cursor-pointer items-center gap-4 rounded-[18px] px-4 py-4 sm:gap-5 sm:px-6 sm:py-5"
        >
          <Checkbox
            id="publisher-app-terms"
            checked={termsAccepted}
            onCheckedChange={(checked) =>
              onTermsAcceptedChange(checked === true)
            }
            className="size-8 rounded-[10px] border-[2.5px] border-violet-300 bg-white shadow-[0_8px_20px_-12px_rgba(109,40,217,0.9)] hover:border-violet-500 data-checked:border-violet-600 data-checked:bg-violet-600 data-checked:text-white [&_svg]:size-5"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold leading-6 text-violet-950 sm:text-lg">
              Leí y acepto los términos y condiciones.
            </span>
            <span className="mt-1 block text-sm font-normal leading-6 text-violet-900/72 sm:text-[15px]">
              Confirmo esta solicitud en representación de
              <strong className="font-semibold text-violet-950">
                {" "}
                {publisherName}
              </strong>
              .
            </span>
          </span>
          <span
            className={cn(
              "hidden shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold sm:inline-flex",
              termsAccepted
                ? "border-emerald-200 bg-white text-emerald-700"
                : "border-violet-200 bg-white/80 text-violet-700",
            )}
          >
            {termsAccepted ? "Aceptado" : "Requerido"}
          </span>
        </Label>
      </div>
    </div>
  );
}

function PublisherAppEditSection({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  children,
  testId,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="overflow-hidden rounded-2xl border border-violet-100/80 bg-white/78 shadow-[0_18px_56px_-48px_rgba(109,40,217,0.48)] dark:border-violet-400/16 dark:bg-slate-950/32"
    >
      <div className="flex flex-col gap-4 border-b border-violet-100/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 dark:border-violet-400/14">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-700 shadow-inner dark:border-violet-400/16 dark:bg-violet-500/10 dark:text-violet-100">
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {title}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAction}
          className="h-9 shrink-0 rounded-xl border-violet-200/80 bg-white/82 px-3 font-semibold text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-950 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50 dark:hover:bg-violet-500/18"
        >
          <Pencil className="size-3.5" />
          {actionLabel}
        </Button>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

type PublisherAppEditDialog =
  "platforms" | "features" | "colors" | "icon" | null;

function PublisherAppEditSheet({
  publisherName,
  publisherEmail,
  publisherUsername,
  publisherImageUrl,
  state,
  colors,
  iconSource,
  suggestedPalettes,
  statusLabel,
  changed,
  pending,
  iconUploadPending,
  customIconMissing,
  customIconUrlInvalid,
  canDelete,
  deletePending,
  hasPersistedConfig,
  onUpdateState,
  onUpdateColor,
  onChooseIconSource,
  onIconUpload,
  onReset,
  onSave,
  onDownload,
  onDelete,
}: {
  publisherName: string;
  publisherEmail: string;
  publisherUsername: string;
  publisherImageUrl?: string;
  state: PublisherAppConfigInput;
  colors: PublisherAppColors;
  iconSource?: string | null;
  suggestedPalettes: Array<{
    name: string;
    description: string;
    colors: PublisherAppColors;
  }>;
  statusLabel: string;
  changed: boolean;
  pending: boolean;
  iconUploadPending: boolean;
  customIconMissing: boolean;
  customIconUrlInvalid: boolean;
  canDelete: boolean;
  deletePending: boolean;
  hasPersistedConfig: boolean;
  onUpdateState: (patch: Partial<PublisherAppConfigInput>) => void;
  onUpdateColor: (key: ColorKey, value: string) => void;
  onChooseIconSource: (source: "publisher" | "custom") => void;
  onIconUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  onSave: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [activeDialog, setActiveDialog] =
    useState<PublisherAppEditDialog>(null);
  const [dangerOpen, setDangerOpen] = useState(false);
  const optionalFeatures = [
    {
      label: "Sección Comunidad",
      enabled: state.connectEnabled,
      icon: UsersRound,
    },
    {
      label: "Contenidos educativos propios",
      enabled: state.learnCustomizationEnabled,
      icon: GraduationCap,
    },
    {
      label: "Gestión de turnos",
      enabled: state.profileEnabled,
      icon: CalendarDays,
    },
  ];
  const enabledFeatureCount =
    2 + optionalFeatures.filter((feature) => feature.enabled).length;
  const currentPlatformLabel =
    state.platformOption === "ios_android" ? "iOS + Android" : "Solo iOS";
  const dialogCopy = {
    platforms: {
      title: "Editar plataformas",
      description: "Definí en qué stores se prepara y mantiene la aplicación.",
    },
    features: {
      title: "Editar funciones",
      description:
        "Combiná las experiencias incluidas y opcionales de tu aplicación.",
    },
    colors: {
      title: "Editar identidad visual",
      description:
        "Elegí una paleta completa o ajustá cada color con el selector visual.",
    },
    icon: {
      title: "Editar icono de la app",
      description:
        "Usá la identidad actual o prepará un icono específico para los stores.",
    },
  } as const;
  const activeDialogCopy = activeDialog ? dialogCopy[activeDialog] : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-9 rounded-xl text-violet-800 hover:bg-violet-100 hover:text-violet-950 dark:text-violet-100 dark:hover:bg-violet-500/14"
        >
          <Link href={PUBLISHER_PORTAL_HOME_ROUTE}>
            <ArrowLeft className="size-3.5" />
            Volver al inicio
          </Link>
        </Button>
      </div>

      <section
        data-testid="publisher-app-edit-sheet"
        className="overflow-hidden rounded-2xl border border-violet-100/80 bg-white/92 shadow-[0_22px_62px_-46px_rgba(109,40,217,0.46)] dark:border-violet-400/16 dark:bg-slate-950/50"
      >
        <header className="border-b border-violet-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,243,255,0.90)_54%,rgba(240,249,255,0.72))] px-5 py-4 dark:border-violet-400/14 dark:bg-[linear-gradient(145deg,rgba(30,24,57,0.94),rgba(12,35,54,0.68))]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <AppIcon
                source={iconSource}
                publisherName={publisherName}
                colors={colors}
                whiteBackground={state.iconSource === "publisher"}
                className="size-12"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-xl font-semibold text-foreground">
                    Editar app
                  </h2>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:border-amber-400/24 dark:bg-amber-500/12 dark:text-amber-100">
                    {statusLabel}
                  </span>
                  <HeaderUnclutterButton />
                </div>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {publisherName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {publisherUsername ? `@${publisherUsername} · ` : ""}
                  {publisherEmail}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReset}
                disabled={!changed || pending}
                className="h-9 rounded-xl border-violet-200/80 bg-white/82 text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50"
              >
                <RotateCcw className="size-3.5" />
                Descartar cambios
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDownload}
                disabled={!hasPersistedConfig}
                className="h-9 rounded-xl border-violet-200/80 bg-white/82 text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50"
              >
                <Download className="size-3.5" />
                Descargar configuración
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex flex-col gap-5 px-5 py-5">
            <PublisherAppEditSection
              testId="publisher-app-edit-platforms"
              icon={<Smartphone className="size-5" />}
              title="Plataformas"
              description="Disponibilidad, alcance y costo operativo de la app."
              actionLabel="Editar plataformas"
              onAction={() => setActiveDialog("platforms")}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-violet-100 bg-violet-50/55 p-4 dark:border-violet-400/14 dark:bg-violet-500/8">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-violet-700 dark:text-violet-200">
                    Publicación seleccionada
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {currentPlatformLabel}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-800 dark:border-violet-400/20 dark:bg-violet-950/40 dark:text-violet-100">
                      iOS
                    </span>
                    {state.platformOption === "ios_android" ? (
                      <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-800 dark:border-violet-400/20 dark:bg-violet-950/40 dark:text-violet-100">
                        Android
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/55 p-4 dark:border-emerald-400/14 dark:bg-emerald-500/8">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-200">
                    Suscripción promocional
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {state.platformOption === "ios_android"
                      ? "USD 119,98 / mes"
                      : "USD 59,99 / mes"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Precio total para las plataformas elegidas durante los
                    primeros seis meses.
                  </p>
                </div>
              </div>
            </PublisherAppEditSection>

            <PublisherAppEditSection
              testId="publisher-app-edit-features"
              icon={<Sparkles className="size-5" />}
              title="Funciones de la app"
              description={`${enabledFeatureCount} de 5 experiencias incluidas en la configuración actual.`}
              actionLabel="Editar funciones"
              onAction={() => setActiveDialog("features")}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    label: "Catálogo de productos y servicios",
                    enabled: true,
                    locked: true,
                    icon: Package,
                  },
                  {
                    label: "Feed de novedades",
                    enabled: true,
                    locked: true,
                    icon: Newspaper,
                  },
                  ...optionalFeatures.map((feature) => ({
                    ...feature,
                    locked: false,
                  })),
                ].map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.label}
                      className="flex items-center gap-3 rounded-xl border border-violet-100/80 bg-white/72 px-3 py-3 dark:border-violet-400/14 dark:bg-slate-950/28"
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl",
                          feature.enabled
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-500/14 dark:text-violet-100"
                            : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {feature.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {feature.locked
                            ? "Incluida siempre"
                            : feature.enabled
                              ? "Activa"
                              : "No incluida"}
                        </span>
                      </span>
                      {feature.enabled ? (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                      ) : (
                        <span className="size-4 shrink-0 rounded-full border border-slate-300 dark:border-slate-600" />
                      )}
                    </div>
                  );
                })}
              </div>
            </PublisherAppEditSection>

            <PublisherAppEditSection
              testId="publisher-app-edit-colors"
              icon={<Palette className="size-5" />}
              title="Identidad visual"
              description="Paleta principal aplicada a navegación, superficies y acentos."
              actionLabel="Editar paleta"
              onAction={() => setActiveDialog("colors")}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {COLOR_FIELDS.map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center gap-3 rounded-xl border border-violet-100/80 bg-white/72 p-3 dark:border-violet-400/14 dark:bg-slate-950/28"
                  >
                    <span
                      className="size-11 shrink-0 rounded-xl border-2 border-white shadow-[0_10px_24px_-14px_rgba(15,23,42,0.85)] ring-1 ring-black/8"
                      style={{ backgroundColor: colors[field.key] }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {field.label}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {colors[field.key]}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </PublisherAppEditSection>

            <PublisherAppEditSection
              testId="publisher-app-edit-icon"
              icon={<ImageIcon className="size-5" />}
              title="Icono de la app"
              description="Identidad que se muestra en el dispositivo y en los stores."
              actionLabel="Editar icono"
              onAction={() => setActiveDialog("icon")}
            >
              <div className="flex flex-col gap-4 rounded-xl border border-violet-100/80 bg-white/72 p-4 sm:flex-row sm:items-center dark:border-violet-400/14 dark:bg-slate-950/28">
                <AppIcon
                  source={iconSource}
                  publisherName={publisherName}
                  colors={colors}
                  whiteBackground={state.iconSource === "publisher"}
                  className="size-20"
                />
                <div className="min-w-0">
                  <p className="font-heading text-lg font-semibold text-foreground">
                    {state.iconSource === "publisher"
                      ? "Identidad actual"
                      : "Icono personalizado"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {state.iconSource === "publisher"
                      ? "Se reutiliza el logo vigente del publicador sobre fondo blanco."
                      : "Se utilizará la imagen personalizada configurada para esta app."}
                  </p>
                </div>
              </div>
            </PublisherAppEditSection>
          </div>

          <aside className="border-t border-violet-100/80 bg-violet-50/35 px-5 py-5 xl:border-l xl:border-t-0 dark:border-violet-400/14 dark:bg-violet-950/10">
            <div className="xl:sticky xl:top-24">
              <PublisherAppLivePreview
                publisherName={publisherName}
                state={state}
                colors={colors}
                iconSource={iconSource}
              />
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/24 dark:bg-amber-500/10 dark:text-amber-100">
                <div className="flex items-center gap-2 font-semibold">
                  <LockKeyhole className="size-4" />
                  Seguimiento de la solicitud
                </div>
                <p className="mt-1 text-xs leading-5 text-amber-900/75 dark:text-amber-100/70">
                  Estado actual: <strong>{statusLabel}</strong>. Nuestro equipo
                  te avisará cuando haya novedades.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <div className="border-t border-violet-100/80 dark:border-violet-400/14">
          <button
            type="button"
            aria-expanded={dangerOpen}
            aria-controls="publisher-app-danger-content"
            data-testid="publisher-app-danger-toggle"
            onClick={() => setDangerOpen((open) => !open)}
            className="group flex w-full items-center gap-3 bg-slate-50/55 px-5 py-4 text-left transition hover:bg-slate-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 dark:bg-slate-950/22 dark:hover:bg-slate-900/45"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-200/70 text-slate-600 transition group-hover:bg-destructive/10 group-hover:text-destructive dark:bg-slate-800 dark:text-slate-300">
              <Trash2 className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-base font-semibold text-foreground">
                Zona de peligro
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Acciones sensibles sobre esta solicitud
              </span>
            </span>
            <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">
              {dangerOpen ? "Ocultar" : "Mostrar"}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                dangerOpen && "rotate-180",
              )}
            />
          </button>

          {dangerOpen ? (
            <div
              id="publisher-app-danger-content"
              data-testid="publisher-app-danger-content"
              className="animate-in fade-in slide-in-from-top-2 border-t border-destructive/20 bg-destructive/[0.025] px-5 py-5 duration-200"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    Si eliminás esta solicitud, se borrarán los datos que
                    cargaste. Esta acción no se puede deshacer.
                  </p>
                  {!canDelete ? (
                    <p className="mt-2 text-sm font-semibold text-destructive">
                      Para cancelar esta solicitud, contactá al equipo de Pocket
                      Genes.
                    </p>
                  ) : null}
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
                        Se eliminarán la solicitud de {publisherName} y todos
                        los datos que cargaste. Esta acción no se puede
                        deshacer. Si más adelante cambiás de opinión, podrás
                        crear una nueva solicitud desde Mi app.
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
                          onDelete();
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
            </div>
          ) : null}
        </div>

        <footer className="sticky bottom-0 z-20 border-t border-violet-100/80 bg-white/92 px-5 py-4 shadow-[0_-20px_60px_rgba(109,40,217,0.10)] backdrop-blur dark:border-violet-400/14 dark:bg-slate-950/88">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {changed
                ? "Tenés cambios sin guardar."
                : "Todos los cambios están guardados."}
            </p>
            <Button
              type="button"
              size="lg"
              onClick={onSave}
              disabled={
                pending ||
                iconUploadPending ||
                customIconMissing ||
                customIconUrlInvalid ||
                !changed
              }
              className="h-14 min-w-[min(100%,15rem)] justify-center rounded-xl bg-violet-600 text-base font-semibold text-white shadow-[0_16px_42px_rgba(109,40,217,0.24)] hover:bg-violet-700"
            >
              {pending ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <Save className="size-5" />
              )}
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </footer>
      </section>

      <Dialog
        open={Boolean(activeDialog)}
        onOpenChange={(open) => {
          if (!open) setActiveDialog(null);
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-hidden rounded-[24px] border-violet-100 p-0 sm:max-w-4xl dark:border-violet-400/18">
          <DialogHeader className="border-b border-violet-100 bg-violet-50/55 px-6 py-5 text-left dark:border-violet-400/14 dark:bg-violet-950/18">
            <DialogTitle className="font-heading text-xl font-semibold">
              {activeDialogCopy?.title}
            </DialogTitle>
            <DialogDescription>
              {activeDialogCopy?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[66vh] overflow-y-auto px-5 py-5 sm:px-6">
            {activeDialog === "platforms" ? (
              <RadioGroup
                aria-label="Plataformas de la app"
                value={state.platformOption}
                onValueChange={(value) =>
                  onUpdateState({
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
                      "App para iPhone con mantenimiento y publicaciones en App Store.",
                    price: "USD 59,99 / mes",
                  },
                  {
                    value: "ios_android" as const,
                    title: "iOS + Android",
                    description:
                      "La misma experiencia disponible en App Store y Google Play.",
                    price: "USD 119,98 / mes",
                  },
                ].map((option) => {
                  const selected = state.platformOption === option.value;
                  return (
                    <Label
                      key={option.value}
                      htmlFor={`publisher-app-edit-platform-${option.value}`}
                      className={cn(
                        "relative flex min-h-56 cursor-pointer flex-col overflow-hidden rounded-[22px] border p-5 transition hover:-translate-y-0.5",
                        selected
                          ? "border-violet-500 bg-[linear-gradient(145deg,#5b21b6,#7c3aed)] text-white shadow-[0_24px_50px_-30px_rgba(109,40,217,0.95)]"
                          : "border-violet-100 bg-white hover:border-violet-300 hover:bg-violet-50 dark:border-violet-400/16 dark:bg-slate-950/42",
                      )}
                    >
                      <span className="sr-only">
                        <RadioGroupItem
                          id={`publisher-app-edit-platform-${option.value}`}
                          value={option.value}
                        />
                      </span>
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={cn(
                            "flex size-14 items-center justify-center rounded-2xl border",
                            selected
                              ? "border-white/25 bg-white/15"
                              : "border-violet-200 bg-violet-100 text-violet-700",
                          )}
                        >
                          <Smartphone className="size-7" />
                        </span>
                        <span
                          className={cn(
                            "flex size-9 items-center justify-center rounded-xl border-2",
                            selected
                              ? "border-white bg-white text-violet-700"
                              : "border-violet-200 text-transparent",
                          )}
                        >
                          <Check className="size-5" strokeWidth={3} />
                        </span>
                      </div>
                      <span className="mt-5 text-xl font-semibold">
                        {option.title}
                      </span>
                      <span
                        className={cn(
                          "mt-2 text-sm font-normal leading-6",
                          selected ? "text-white/78" : "text-muted-foreground",
                        )}
                      >
                        {option.description}
                      </span>
                      <span
                        className={cn(
                          "mt-auto pt-5 text-sm font-bold",
                          selected ? "text-white" : "text-violet-800",
                        )}
                      >
                        {option.price}
                      </span>
                    </Label>
                  );
                })}
              </RadioGroup>
            ) : null}

            {activeDialog === "features" ? (
              <div
                className="grid gap-3"
                data-testid="publisher-app-edit-feature-list"
              >
                <FeatureCard
                  id="publisher-app-edit-catalog"
                  checked
                  locked
                  icon={<Package className="size-5" />}
                  title="Catálogo de productos y servicios"
                  description="Tus productos y servicios, siempre organizados, disponibles y listos para descubrir."
                />
                <FeatureCard
                  id="publisher-app-edit-feed"
                  checked
                  locked
                  icon={<Newspaper className="size-5" />}
                  title="Feed de novedades"
                  description="Notas, eventos y publicaciones para mantener informada y activa tu comunidad."
                />
                <FeatureCard
                  id="publisher-app-edit-connect"
                  checked={state.connectEnabled}
                  onCheckedChange={(connectEnabled) =>
                    onUpdateState({ connectEnabled })
                  }
                  icon={<UsersRound className="size-5" />}
                  title="Sección Comunidad"
                  description="Permite conversar, publicar preguntas y encontrar otros miembros de la comunidad."
                />
                <FeatureCard
                  id="publisher-app-edit-learn"
                  checked={state.learnCustomizationEnabled}
                  onCheckedChange={(learnCustomizationEnabled) =>
                    onUpdateState({ learnCustomizationEnabled })
                  }
                  icon={<GraduationCap className="size-5" />}
                  title="Contenidos educativos propios"
                  description="Customiza tus clases y contenidos según las necesidades de tus usuarios."
                />
                <FeatureCard
                  id="publisher-app-edit-profile"
                  checked={state.profileEnabled}
                  onCheckedChange={(profileEnabled) =>
                    onUpdateState({ profileEnabled })
                  }
                  icon={<CalendarDays className="size-5" />}
                  title="Gestión de turnos"
                  description="Tus usuarios pueden solicitar y reservar turnos directamente desde la aplicación."
                />
              </div>
            ) : null}

            {activeDialog === "colors" ? (
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-200">
                    Paletas creadas desde tu identidad
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {suggestedPalettes.map((palette) => {
                      const selected = samePalette(
                        state.colors,
                        palette.colors,
                      );
                      return (
                        <button
                          key={palette.name}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            onUpdateState({ colors: palette.colors })
                          }
                          className={cn(
                            "flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5",
                            selected
                              ? "border-violet-400 bg-violet-50 shadow-[0_16px_36px_-28px_rgba(109,40,217,0.8)] dark:bg-violet-500/12"
                              : "border-violet-100 bg-white hover:border-violet-300 dark:border-violet-400/16 dark:bg-slate-950/36",
                          )}
                        >
                          <span className="flex shrink-0 -space-x-2">
                            {Object.values(palette.colors).map((color) => (
                              <span
                                key={color}
                                className="size-10 rounded-full border-2 border-white shadow-sm dark:border-slate-950"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold text-foreground">
                              {palette.name}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {palette.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {COLOR_FIELDS.map((field) => {
                    const normalized =
                      normalizePublisherAppColor(state.colors[field.key]) ??
                      DEFAULT_PUBLISHER_APP_COLOR;
                    return (
                      <label
                        key={field.key}
                        className="group relative flex min-h-52 cursor-pointer flex-col items-center rounded-[22px] border border-violet-100 bg-white p-4 text-center transition hover:-translate-y-0.5 hover:border-violet-400 dark:border-violet-400/16 dark:bg-slate-950/36"
                      >
                        <input
                          type="color"
                          aria-label={`Elegir ${field.label.toLowerCase()}`}
                          value={normalized}
                          onChange={(event) =>
                            onUpdateColor(
                              field.key,
                              event.target.value.toUpperCase(),
                            )
                          }
                          className="absolute inset-0 z-20 size-full cursor-pointer opacity-0"
                        />
                        <span
                          className="mt-2 size-24 rounded-[28px] border-4 border-white shadow-[0_20px_36px_-20px_rgba(15,23,42,0.8)] ring-1 ring-black/8"
                          style={{ backgroundColor: normalized }}
                        />
                        <span className="mt-4 font-semibold text-foreground">
                          {field.label}
                        </span>
                        <span className="mt-1 text-xs leading-5 text-muted-foreground">
                          {field.description}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {activeDialog === "icon" ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onChooseIconSource("publisher")}
                    className={cn(
                      "flex min-h-48 flex-col items-center rounded-[22px] border p-5 text-center transition hover:-translate-y-0.5",
                      state.iconSource === "publisher"
                        ? "border-violet-400 bg-violet-50 shadow-[0_20px_42px_-32px_rgba(109,40,217,0.85)] dark:bg-violet-500/12"
                        : "border-violet-100 bg-white hover:border-violet-300 dark:border-violet-400/16 dark:bg-slate-950/36",
                    )}
                  >
                    <AppIcon
                      source={publisherImageUrl}
                      publisherName={publisherName}
                      colors={colors}
                      whiteBackground
                      className="size-20"
                    />
                    <span className="mt-4 font-semibold text-foreground">
                      Usar mi identidad actual
                    </span>
                    <span className="mt-1 text-xs leading-5 text-muted-foreground">
                      Mantiene el logo vigente del publicador.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChooseIconSource("custom")}
                    className={cn(
                      "flex min-h-48 flex-col items-center rounded-[22px] border p-5 text-center transition hover:-translate-y-0.5",
                      state.iconSource === "custom"
                        ? "border-violet-400 bg-violet-50 shadow-[0_20px_42px_-32px_rgba(109,40,217,0.85)] dark:bg-violet-500/12"
                        : "border-violet-100 bg-white hover:border-violet-300 dark:border-violet-400/16 dark:bg-slate-950/36",
                    )}
                  >
                    <span className="flex size-20 items-center justify-center rounded-[24px] border-2 border-dashed border-violet-300 bg-white text-violet-700 dark:bg-slate-950/40 dark:text-violet-100">
                      <UploadCloud className="size-8" />
                    </span>
                    <span className="mt-4 font-semibold text-foreground">
                      Usar un icono distinto
                    </span>
                    <span className="mt-1 text-xs leading-5 text-muted-foreground">
                      Subí una imagen cuadrada o usá una URL segura.
                    </span>
                  </button>
                </div>

                {state.iconSource === "custom" ? (
                  <div className="grid gap-4 rounded-[22px] border border-violet-200 bg-violet-50/55 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center dark:border-violet-400/18 dark:bg-violet-500/10">
                    <AppIcon
                      source={
                        state.iconImageUploadDataUrl ?? state.iconImageUrl
                      }
                      publisherName={publisherName}
                      colors={colors}
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
                          onChange={(event) => onIconUpload(event)}
                          disabled={iconUploadPending}
                          className="sr-only"
                        />
                      </label>
                      <div>
                        <Label
                          htmlFor="publisher-app-edit-icon-url"
                          className="text-xs font-semibold text-foreground"
                        >
                          O usá una URL HTTPS
                        </Label>
                        <Input
                          id="publisher-app-edit-icon-url"
                          type="url"
                          value={state.iconImageUrl ?? ""}
                          onChange={(event) =>
                            onUpdateState({
                              iconSource: "custom",
                              iconImageUrl: event.target.value,
                              iconImageUploadDataUrl: null,
                            })
                          }
                          placeholder="https://ejemplo.com/icono.png"
                          className="mt-1 h-11 rounded-xl border-violet-200/80"
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

          <DialogFooter className="border-t border-violet-100 bg-violet-50/55 px-6 py-4 dark:border-violet-400/14 dark:bg-violet-950/18">
            <Button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="h-11 min-w-28 rounded-xl bg-violet-600 text-white hover:bg-violet-700"
            >
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SuccessCelebration({ publisherName }: { publisherName: string }) {
  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="publisher-app-success-overlay"
      className="publisher-app-success-overlay fixed inset-0 z-[2200] grid place-items-center overflow-y-auto px-5 py-8 text-white sm:px-12 sm:py-12"
    >
      <span
        data-testid="publisher-app-success-circle"
        aria-hidden="true"
        className="publisher-app-success-circle pointer-events-none fixed left-1/2 top-1/2 size-9 rounded-full bg-[#16a34a]"
      />

      <div
        data-testid="publisher-app-success-content"
        className="publisher-app-success-content relative z-10 w-full max-w-[920px] text-center"
      >
        <div
          data-testid="publisher-app-success-mark"
          aria-hidden="true"
          className="mx-auto grid size-[92px] place-items-center rounded-full bg-white/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]"
        >
          <Check className="size-12" strokeWidth={2.7} />
        </div>

        <p className="mt-7 text-xs font-extrabold uppercase tracking-[0.2em] text-white/72">
          Solicitud recibida
        </p>
        <h2 className="mx-auto mt-3 max-w-4xl font-heading text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
          ¡La app de {publisherName} ya está en marcha!
        </h2>
        <p className="mx-auto mt-6 max-w-[720px] text-lg leading-[1.55] text-white/88 sm:text-xl">
          Recibimos la configuración y nuestro equipo la va a revisar dentro de
          las próximas 24 a 48 horas.
          <br />
          <br />
          Te contactaremos si necesitamos algún detalle adicional.
        </p>

        <div className="mt-9 flex flex-col flex-wrap justify-center gap-4 sm:flex-row">
          <Link
            href={PUBLISHER_PORTAL_APP_EDIT_ROUTE}
            className="inline-grid min-h-[68px] place-items-center gap-0.5 rounded-full bg-white px-8 py-3 text-emerald-700 shadow-[0_20px_45px_-22px_rgba(0,0,0,0.42)] transition hover:-translate-y-0.5 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/45 motion-reduce:transform-none"
          >
            <span className="text-xs font-semibold text-slate-500">
              Tu solicitud
            </span>
            <strong className="inline-flex items-center gap-2 font-extrabold">
              Ver y editar mi app <ArrowRight className="size-4" />
            </strong>
          </Link>
          <Link
            href={PUBLISHER_PORTAL_HOME_ROUTE}
            className="inline-flex min-h-[68px] items-center justify-center gap-2 rounded-full border border-white/50 px-8 py-3 font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/35 motion-reduce:transform-none"
          >
            <ArrowLeft className="size-4" /> Volver al inicio
          </Link>
        </div>
      </div>
    </section>
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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const wizardSteps =
    mode === "create" ? [...WIZARD_STEPS, REVIEW_STEP] : WIZARD_STEPS;
  const activeStep = wizardSteps[stepIndex] ?? wizardSteps[0];
  const statusLabel = publisherAppStatusLabel(
    persistedConfig?.status ?? "pending_revision",
  );
  const canDelete = persistedConfig?.status === "pending_revision";
  const payload = useMemo(() => normalizedPayload(state), [state]);
  const changed =
    JSON.stringify(payload) !==
    JSON.stringify(normalizedPayload(persistedState));
  const suggestedPalettes = useMemo(() => {
    const generated = publisherAppPaletteSuggestions(publisherTint);
    return PALETTE_SUGGESTION_COPY.map((copy, index) => ({
      ...copy,
      colors:
        generated[index] ??
        generated[0] ??
        publisherAppDefaultColors(publisherTint),
    }));
  }, [publisherTint]);
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
    setTermsAccepted(false);
    setState((current) => ({ ...current, ...patch }));
  }
  function updateColor(key: ColorKey, value: string) {
    setTermsAccepted(false);
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
      customIconMissing ||
      customIconUrlInvalid ||
      pending ||
      iconUploadPending ||
      (mode === "create" && !termsAccepted) ||
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
          body: JSON.stringify(
            mode === "create"
              ? { ...payload, termsAccepted: true as const }
              : payload,
          ),
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

  if (mode === "edit") {
    return (
      <section className="pb-24" data-testid="publisher-app-config-workbench">
        <ActionToast
          toast={toast}
          onDismiss={() => setToast(null)}
          language="es"
        />
        <PublisherAppEditSheet
          publisherName={publisherName}
          publisherEmail={publisherEmail}
          publisherUsername={publisherUsername}
          publisherImageUrl={publisherImageUrl}
          state={state}
          colors={previewColors}
          iconSource={resolvedIconSource}
          suggestedPalettes={suggestedPalettes}
          statusLabel={statusLabel}
          changed={changed}
          pending={pending}
          iconUploadPending={iconUploadPending}
          customIconMissing={customIconMissing}
          customIconUrlInvalid={customIconUrlInvalid}
          canDelete={canDelete}
          deletePending={deletePending}
          hasPersistedConfig={Boolean(persistedConfig)}
          onUpdateState={updateState}
          onUpdateColor={updateColor}
          onChooseIconSource={chooseIconSource}
          onIconUpload={(event) => void handleIconUpload(event)}
          onReset={() => setState(normalizedPayload(persistedState))}
          onSave={() => void save()}
          onDownload={downloadConfig}
          onDelete={() => void deleteApp()}
        />
      </section>
    );
  }

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
              Configurá tu app
            </h2>
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
        className={cn(
          "mb-6 grid gap-3 md:grid-cols-2",
          mode === "create" ? "xl:grid-cols-5" : "xl:grid-cols-4",
        )}
      >
        {wizardSteps.map((step, index) => {
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

      <div
        className={cn(
          "grid items-start gap-6",
          activeStep.id === "review"
            ? "grid-cols-1"
            : "xl:grid-cols-[minmax(0,1fr)_390px]",
        )}
      >
        <div className="overflow-hidden rounded-[28px] border border-border/80 bg-card shadow-[0_26px_68px_-48px_rgba(15,23,42,0.68)]">
          <div className="border-b border-violet-100 bg-[linear-gradient(135deg,rgba(109,40,217,0.08),rgba(139,92,246,0.03))] px-5 py-5 sm:px-7">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              Paso {stepIndex + 1} de {wizardSteps.length}
            </p>
            <h3 className="mt-1 font-heading text-2xl font-semibold text-foreground sm:text-3xl">
              {activeStep.title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {activeStep.id === "review"
                ? "Revisá todas las selecciones y las condiciones antes de enviar la solicitud."
                : "Podés tocar cualquier paso de arriba para avanzar o volver cuando quieras."}
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
                      "relative flex min-h-60 cursor-pointer flex-col overflow-hidden rounded-[24px] border p-5 transition hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-violet-500 focus-within:ring-offset-2",
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
                      <span className="sr-only">
                        <RadioGroupItem
                          id={`publisher-app-platform-${option.value}`}
                          value={option.value}
                        />
                      </span>
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
              <div
                className="grid gap-3"
                data-testid="publisher-app-feature-list"
              >
                <FeatureCard
                  id="publisher-app-catalog"
                  checked
                  locked
                  icon={<Package className="size-5" />}
                  title="Catálogo de productos y servicios"
                  description="Tus productos y servicios, siempre organizados, disponibles y listos para descubrir."
                />
                <FeatureCard
                  id="publisher-app-feed"
                  checked
                  locked
                  icon={<Newspaper className="size-5" />}
                  title="Feed de novedades"
                  description="Notas, eventos y publicaciones para mantener informada y activa tu comunidad."
                />
                <FeatureCard
                  id="publisher-app-connect"
                  checked={state.connectEnabled}
                  onCheckedChange={(connectEnabled) =>
                    updateState({ connectEnabled })
                  }
                  icon={<UsersRound className="size-5" />}
                  title="Sección Comunidad"
                  description="Permite conversar, publicar preguntas y encontrar otros miembros de la comunidad."
                />
                <FeatureCard
                  id="publisher-app-learn"
                  checked={state.learnCustomizationEnabled}
                  onCheckedChange={(learnCustomizationEnabled) =>
                    updateState({ learnCustomizationEnabled })
                  }
                  icon={<GraduationCap className="size-5" />}
                  title="Contenidos educativos propios"
                  description="Customiza tus clases y contenidos según las necesidades de tus usuarios."
                />
                <FeatureCard
                  id="publisher-app-profile"
                  checked={state.profileEnabled}
                  onCheckedChange={(profileEnabled) =>
                    updateState({ profileEnabled })
                  }
                  icon={<CalendarDays className="size-5" />}
                  title="Gestión de turnos"
                  description="Tus usuarios pueden solicitar y reservar turnos directamente desde la aplicación."
                />
              </div>
            ) : null}

            {activeStep.id === "colors" ? (
              <div className="space-y-6">
                <div className="rounded-[24px] border border-violet-200/80 bg-[linear-gradient(135deg,rgba(109,40,217,0.08),rgba(139,92,246,0.025))] p-4 sm:p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                    Creadas desde tu identidad
                  </p>
                  <h4 className="mt-1 text-lg font-semibold text-foreground">
                    Paletas pensadas para la app de {publisherName}
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Intensificamos tu color actual y construimos combinaciones
                    para comunidad, contenido y navegación.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {suggestedPalettes.map((preset, index) => {
                      const selected = samePalette(state.colors, preset.colors);
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            updateState({ colors: { ...preset.colors } })
                          }
                          className={cn(
                            "group relative mt-3 flex min-h-28 items-center gap-3 overflow-hidden rounded-[20px] border bg-card p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_16px_34px_-28px_rgba(109,40,217,0.8)]",
                            selected
                              ? "border-violet-500 ring-2 ring-violet-500/15"
                              : "border-border/80",
                          )}
                        >
                          <span
                            className="relative h-[72px] w-[88px] shrink-0 overflow-hidden rounded-[18px] shadow-[0_12px_24px_-18px_rgba(15,23,42,0.78)]"
                            style={{ backgroundColor: preset.colors.primary }}
                            aria-hidden="true"
                          >
                            <span
                              className="absolute -right-4 -top-4 size-14 rounded-full"
                              style={{
                                backgroundColor: preset.colors.secondary,
                              }}
                            />
                            <span className="absolute bottom-2 left-2 h-8 w-12 rounded-[10px] bg-white/92 shadow-sm" />
                            <span
                              className="absolute bottom-2 right-2 size-5 rounded-full border-2 border-white/70"
                              style={{
                                backgroundColor: preset.colors.tertiary,
                              }}
                            />
                          </span>
                          <span className="min-w-0 flex-1 pr-4">
                            {index === 0 ? (
                              <span className="mb-1 block text-[9px] font-extrabold uppercase tracking-[0.1em] text-violet-700 dark:text-violet-200">
                                Recomendada
                              </span>
                            ) : null}
                            <span className="block font-semibold leading-5 text-foreground">
                              {preset.name}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {preset.description}
                            </span>
                          </span>
                          {selected ? (
                            <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm">
                              <Check className="size-3.5" strokeWidth={3} />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-[24px] border border-border/80 bg-background/60 p-4 sm:p-5">
                  <div className="mb-4">
                    <p className="text-base font-semibold text-foreground">
                      Ajustá cada color
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tocá una muestra para abrir el selector completo. La vista
                      previa cambia al instante.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {COLOR_FIELDS.map((field) => {
                      const normalized = normalizePublisherAppColor(
                        state.colors[field.key],
                      );
                      return (
                        <label
                          key={field.key}
                          className="group relative flex min-h-56 cursor-pointer flex-col items-center overflow-hidden rounded-[22px] border border-border/80 bg-card p-4 text-center transition duration-200 hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_18px_38px_-30px_rgba(109,40,217,0.72)]"
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
                            className="absolute inset-0 z-20 size-full cursor-pointer opacity-0"
                          />
                          <span className="relative flex size-24 items-center justify-center">
                            <span
                              className="absolute inset-1 rounded-full border border-dashed border-violet-300 transition-transform duration-500 group-hover:rotate-45 group-hover:scale-105"
                              aria-hidden="true"
                            />
                            <span
                              className="relative flex size-[68px] items-center justify-center overflow-hidden rounded-[23px] border-4 border-white text-white shadow-[0_18px_32px_-18px_rgba(15,23,42,0.8)]"
                              style={{
                                backgroundColor:
                                  normalized ?? DEFAULT_PUBLISHER_APP_COLOR,
                              }}
                            >
                              <span className="absolute inset-x-2 top-1.5 h-1/3 rounded-full bg-white/25 blur-sm" />
                              <Palette className="relative size-6 drop-shadow" />
                            </span>
                          </span>
                          <span className="mt-2 text-sm font-semibold text-foreground">
                            {field.label}
                          </span>
                          <span className="mt-1 text-xs leading-5 text-muted-foreground">
                            {field.description}
                          </span>
                          <span className="mt-auto rounded-full bg-violet-100 px-3 py-1 text-[10px] font-bold text-violet-800 transition group-hover:bg-violet-600 group-hover:text-white dark:bg-violet-400/15 dark:text-violet-100">
                            Cambiar color
                          </span>
                        </label>
                      );
                    })}
                  </div>
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
                      whiteBackground
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

            {activeStep.id === "review" ? (
              <PublisherAppReviewDocument
                publisherName={publisherName}
                publisherEmail={publisherEmail}
                state={state}
                colors={previewColors}
                iconSource={resolvedIconSource}
                termsAccepted={termsAccepted}
                onTermsAcceptedChange={setTermsAccepted}
              />
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
              {stepIndex < wizardSteps.length - 1 ? (
                <Button
                  type="button"
                  onClick={() =>
                    setStepIndex((current) =>
                      Math.min(current + 1, wizardSteps.length - 1),
                    )
                  }
                  disabled={
                    pending ||
                    (activeStep.id === "icon" &&
                      (iconUploadPending ||
                        customIconMissing ||
                        customIconUrlInvalid))
                  }
                  className="h-11 rounded-xl bg-violet-600 px-5 text-white shadow-[0_14px_28px_-18px_rgba(109,40,217,0.9)] hover:bg-violet-700"
                >
                  {activeStep.id === "icon" ? "Revisar solicitud" : "Siguiente"}
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void save()}
                  disabled={
                    pending ||
                    iconUploadPending ||
                    customIconMissing ||
                    customIconUrlInvalid ||
                    !termsAccepted
                  }
                  className="h-14 rounded-xl bg-violet-600 px-6 text-base text-white shadow-[0_14px_28px_-18px_rgba(109,40,217,0.9)] hover:bg-violet-700"
                >
                  {pending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-5" />
                  )}
                  {pending ? "Guardando…" : "Aceptar condiciones y continuar"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {activeStep.id !== "review" ? (
          <div className="xl:sticky xl:top-24">
            <PublisherAppLivePreview
              publisherName={publisherName}
              state={state}
              colors={previewColors}
              iconSource={resolvedIconSource}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
