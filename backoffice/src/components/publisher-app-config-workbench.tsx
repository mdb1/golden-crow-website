"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  LoaderCircle,
  Save,
  Smartphone,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DEFAULT_PUBLISHER_APP_COLOR,
  normalizePublisherAppColor,
  publisherAppDefaultColors,
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
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

type PublisherAppConfigWorkbenchProps = {
  mode: "create" | "edit";
  initialConfig?: PublisherAppConfig;
  publisherName: string;
  publisherTint?: string;
  publisherEmail: string;
  publisherUsername: string;
};

type WizardStep = "platform" | "features" | "colors";
type ColorKey = keyof PublisherAppColors;

const WIZARD_STEPS: Array<{
  id: WizardStep;
  title: string;
  shortTitle: string;
}> = [
  { id: "platform", title: "Elegí las plataformas", shortTitle: "Plataformas" },
  { id: "features", title: "Elegí las funciones", shortTitle: "Funciones" },
  { id: "colors", title: "Definí tu paleta", shortTitle: "Colores" },
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

function initialState(
  config: PublisherAppConfig | undefined,
  publisherTint?: string,
): PublisherAppConfigInput {
  if (config) {
    return {
      platformOption: config.platformOption,
      connectEnabled: config.connectEnabled,
      profileEnabled: config.profileEnabled,
      learnCustomizationEnabled: config.learnCustomizationEnabled,
      colors: { ...config.colors },
    };
  }

  return {
    platformOption: "ios_android",
    connectEnabled: true,
    profileEnabled: true,
    learnCustomizationEnabled: true,
    colors: publisherAppDefaultColors(publisherTint),
  };
}

function normalizedPayload(state: PublisherAppConfigInput) {
  return {
    ...state,
    colors: {
      primary:
        normalizePublisherAppColor(state.colors.primary) ?? state.colors.primary,
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
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        "group flex cursor-pointer items-start gap-4 rounded-2xl border p-4 shadow-sm transition",
        checked
          ? "border-violet-300 bg-violet-50/80 shadow-[0_18px_40px_-32px_rgba(109,40,217,0.7)] dark:border-violet-400/35 dark:bg-violet-500/10"
          : "border-border/80 bg-card/70 hover:border-foreground/20 hover:bg-card",
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-2xl border transition",
          checked
            ? "border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-200"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground">
          {title}
        </span>
        <span className="mt-1 block text-sm font-normal leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(Boolean(next))}
        className="mt-1"
      />
    </Label>
  );
}

function PublisherAppLivePreview({
  publisherName,
  state,
  colors,
}: {
  publisherName: string;
  state: PublisherAppConfigInput;
  colors: PublisherAppColors;
}) {
  const previewStyle = {
    "--preview-primary": colors.primary,
    "--preview-secondary": colors.secondary,
    "--preview-tertiary": colors.tertiary,
  } as CSSProperties;

  const features = [
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
      className="relative isolate overflow-hidden rounded-[28px] border border-white/50 bg-[radial-gradient(circle_at_78%_8%,var(--preview-secondary),transparent_38%),linear-gradient(145deg,var(--preview-primary),var(--preview-tertiary))] p-5 shadow-[0_30px_70px_-38px_rgba(15,23,42,0.8)]"
    >
      <span className="pointer-events-none absolute -right-14 -top-16 size-48 rounded-full border-[28px] border-white/15" />
      <span className="pointer-events-none absolute -bottom-20 -left-12 size-52 rounded-full bg-white/12 blur-2xl" />

      <div className="relative mb-4 flex items-center justify-between text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">
            Vista previa
          </p>
          <p className="mt-1 max-w-52 truncate font-heading text-lg font-bold">
            {publisherName}
          </p>
        </div>
        <Sparkles className="size-5 fill-white/30" />
      </div>

      <div className="relative mx-auto w-full max-w-[255px] rounded-[36px] bg-slate-950 p-[6px] shadow-[0_28px_54px_-24px_rgba(2,6,23,0.95)]">
        <div className="relative aspect-[9/17.7] overflow-hidden rounded-[30px] bg-[linear-gradient(180deg,#ffffff,#faf8ff)] px-4 pb-4 pt-5 text-slate-950">
          <span className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-slate-950" />
          <div className="mt-4 flex items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-xl text-white shadow-lg"
              style={{ backgroundColor: colors.primary }}
            >
              <Sparkles className="size-4" />
            </span>
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
            {(features.length > 0
              ? features
              : [
                  {
                    icon: Smartphone,
                    label: "Tus servicios",
                    color: colors.primary,
                  },
                ]
            ).map(({ icon: Icon, label, color }) => (
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

export function PublisherAppConfigWorkbench({
  mode,
  initialConfig,
  publisherName,
  publisherTint,
  publisherEmail,
  publisherUsername,
}: PublisherAppConfigWorkbenchProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState(() =>
    initialState(initialConfig, publisherTint),
  );
  const [persistedState, setPersistedState] = useState(() =>
    initialState(initialConfig, publisherTint),
  );
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const activeStep = WIZARD_STEPS[stepIndex] ?? WIZARD_STEPS[0];
  const payload = useMemo(() => normalizedPayload(state), [state]);
  const changed = JSON.stringify(payload) !== JSON.stringify(persistedState);
  const colorErrors = useMemo(
    () =>
      COLOR_FIELDS.reduce<Partial<Record<ColorKey, string>>>((errors, field) => {
        if (!normalizePublisherAppColor(state.colors[field.key])) {
          errors[field.key] = "Ingresá un color hexadecimal de 6 dígitos.";
        }
        return errors;
      }, {}),
    [state.colors],
  );
  const hasColorErrors = Object.keys(colorErrors).length > 0;
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

  function updateState(patch: Partial<PublisherAppConfigInput>) {
    setState((current) => ({ ...current, ...patch }));
  }

  function updateColor(key: ColorKey, value: string) {
    setState((current) => ({
      ...current,
      colors: { ...current.colors, [key]: value },
    }));
  }

  function goToNextStep() {
    setStepIndex((current) =>
      Math.min(current + 1, WIZARD_STEPS.length - 1),
    );
  }

  function goToPreviousStep() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  async function save() {
    if (hasColorErrors || pending || (mode === "edit" && !changed)) {
      return;
    }

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
      if (!saved) {
        throw new Error("La configuración guardada no fue devuelta por el servidor.");
      }

      const nextState = initialState(saved);
      setState(nextState);
      setPersistedState(nextState);
      setToast({
        id: Date.now(),
        tone: "success",
        title: mode === "create" ? "App configurada" : "Cambios guardados",
        message:
          mode === "create"
            ? "Tu configuración quedó lista para continuar."
            : "La configuración de tu app está actualizada.",
      });

      if (mode === "create") {
        router.replace(PUBLISHER_PORTAL_APP_EDIT_ROUTE);
      }
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
        details:
          error instanceof SdkRequestError ? error.details : undefined,
      });
    } finally {
      setPending(false);
    }
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
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-2xl font-semibold text-foreground">
              {mode === "create" ? "Configurá tu app" : "Editá tu app"}
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
        className="mb-5 grid gap-2 sm:grid-cols-3"
      >
        {WIZARD_STEPS.map((step, index) => {
          const active = index === stepIndex;
          const complete = index < stepIndex;
          return (
            <li
              key={step.id}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                active
                  ? "border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-400/35 dark:bg-violet-500/10 dark:text-violet-50"
                  : complete
                    ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-500/8 dark:text-emerald-100"
                    : "border-border/70 bg-card/50 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  active
                    ? "bg-violet-600 text-white"
                    : complete
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {complete ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="font-semibold">{step.shortTitle}</span>
            </li>
          );
        })}
      </ol>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-[24px] border border-border/80 bg-card shadow-[0_24px_64px_-48px_rgba(15,23,42,0.68)]">
          <div className="border-b border-border/70 bg-muted/20 px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              Paso {stepIndex + 1} de {WIZARD_STEPS.length}
            </p>
            <h3 className="mt-1 font-heading text-2xl font-semibold text-foreground">
              {activeStep.title}
            </h3>
          </div>

          <div className="min-h-[390px] p-5 sm:p-6">
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
                      "Publicación para iPhone con una experiencia enfocada en el ecosistema Apple.",
                    badges: ["iPhone"],
                  },
                  {
                    value: "ios_android" as const,
                    title: "iOS + Android",
                    description:
                      "La misma identidad y funciones disponibles en ambas plataformas.",
                    badges: ["iPhone", "Android"],
                  },
                ].map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`publisher-app-platform-${option.value}`}
                    className={cn(
                      "relative flex min-h-52 cursor-pointer flex-col rounded-2xl border p-5 transition",
                      state.platformOption === option.value
                        ? "border-violet-300 bg-[linear-gradient(145deg,rgba(245,243,255,0.96),rgba(240,249,255,0.9))] shadow-[0_20px_46px_-35px_rgba(109,40,217,0.7)] dark:border-violet-400/35 dark:bg-[linear-gradient(145deg,rgba(109,40,217,0.15),rgba(14,116,144,0.1))]"
                        : "border-border/80 bg-background/60 hover:border-foreground/20 hover:bg-background",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200">
                        <Smartphone className="size-6" />
                      </span>
                      <RadioGroupItem
                        id={`publisher-app-platform-${option.value}`}
                        value={option.value}
                      />
                    </div>
                    <span className="mt-5 block text-lg font-semibold text-foreground">
                      {option.title}
                    </span>
                    <span className="mt-2 block text-sm font-normal leading-6 text-muted-foreground">
                      {option.description}
                    </span>
                    <span className="mt-auto flex flex-wrap gap-2 pt-4">
                      {option.badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-violet-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-violet-800 dark:border-violet-400/25 dark:bg-violet-950/40 dark:text-violet-100"
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
              <div className="grid gap-3">
                <FeatureCard
                  id="publisher-app-connect"
                  checked={state.connectEnabled}
                  onCheckedChange={(connectEnabled) =>
                    updateState({ connectEnabled })
                  }
                  icon={<UsersRound className="size-5" />}
                  title="Connect"
                  description="Habilita comunidad, vínculos y espacios de conexión dentro de la app."
                />
                <FeatureCard
                  id="publisher-app-profile"
                  checked={state.profileEnabled}
                  onCheckedChange={(profileEnabled) =>
                    updateState({ profileEnabled })
                  }
                  icon={<UserRound className="size-5" />}
                  title="Perfil"
                  description="Permite que cada persona gestione sus datos y preferencias."
                />
                <FeatureCard
                  id="publisher-app-learn"
                  checked={state.learnCustomizationEnabled}
                  onCheckedChange={(learnCustomizationEnabled) =>
                    updateState({ learnCustomizationEnabled })
                  }
                  icon={<GraduationCap className="size-5" />}
                  title="Personalizar Learn"
                  description="Adapta la sección educativa a tu marca, contenidos y comunidad."
                />
              </div>
            ) : null}

            {activeStep.id === "colors" ? (
              <div className="space-y-4">
                {COLOR_FIELDS.map((field) => {
                  const normalized = normalizePublisherAppColor(
                    state.colors[field.key],
                  );
                  return (
                    <div
                      key={field.key}
                      className="grid gap-3 rounded-2xl border border-border/80 bg-background/60 p-4 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center"
                    >
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
                      </div>
                      <div className="flex items-start gap-2">
                        <label
                          className="relative flex size-10 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-foreground/20 shadow-sm"
                          title={`Elegir ${field.label.toLowerCase()}`}
                        >
                          <input
                            type="color"
                            aria-label={`Elegir ${field.label.toLowerCase()}`}
                            value={normalized ?? DEFAULT_PUBLISHER_APP_COLOR}
                            onChange={(event) =>
                              updateColor(field.key, event.target.value.toUpperCase())
                            }
                            className="absolute -inset-2 size-14 cursor-pointer border-0 bg-transparent p-0"
                          />
                        </label>
                        <div className="min-w-0 flex-1">
                          <Input
                            id={`publisher-app-color-${field.key}`}
                            value={state.colors[field.key]}
                            onChange={(event) =>
                              updateColor(field.key, event.target.value)
                            }
                            onBlur={() => {
                              if (normalized) updateColor(field.key, normalized);
                            }}
                            maxLength={7}
                            spellCheck={false}
                            aria-invalid={Boolean(colorErrors[field.key])}
                            aria-describedby={
                              colorErrors[field.key]
                                ? `publisher-app-color-${field.key}-error`
                                : undefined
                            }
                            className="h-10 font-mono uppercase"
                          />
                          {colorErrors[field.key] ? (
                            <p
                              id={`publisher-app-color-${field.key}-error`}
                              className="mt-1 text-xs text-destructive"
                            >
                              {colorErrors[field.key]}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-muted/15 px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={goToPreviousStep}
              disabled={stepIndex === 0 || pending}
              className="h-10 rounded-xl"
            >
              <ArrowLeft className="size-4" />
              Anterior
            </Button>
            {stepIndex < WIZARD_STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={goToNextStep}
                disabled={pending}
                className="h-10 rounded-xl bg-violet-600 px-4 text-white hover:bg-violet-700"
              >
                Siguiente
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void save()}
                disabled={
                  pending || hasColorErrors || (mode === "edit" && !changed)
                }
                className="h-10 rounded-xl bg-violet-600 px-4 text-white hover:bg-violet-700"
              >
                {pending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {pending
                  ? "Guardando..."
                  : mode === "create"
                    ? "Guardar configuración"
                    : "Guardar cambios"}
              </Button>
            )}
          </div>
        </div>

        <div className="xl:sticky xl:top-[calc(var(--app-header-height)+1.5rem)]">
          <PublisherAppLivePreview
            publisherName={publisherName}
            state={state}
            colors={previewColors}
          />
        </div>
      </div>
    </section>
  );
}
