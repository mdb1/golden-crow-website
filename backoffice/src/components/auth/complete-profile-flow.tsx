"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { HelperBanner } from "@/components/helper-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { BACKOFFICE_VERSION } from "@/lib/app-version";
import {
  PROFILE_SETUP_STEPS,
  hasProfileSetupProfessionalDetails,
  normalizeProfileSetupForm,
  profileSetupFormWithSkippedDefaults,
  type ProfileSetupStep,
  type ProfileSetupDefaults,
  type ProfileSetupForm,
} from "@/lib/profile-setup-flow";

type ProfileSetupState = {
  uid: string;
  email: string;
  displayName: string;
  onboardingCompleted: boolean;
  needsCompletion: boolean;
  docs: {
    profile: boolean;
    publicProfile: boolean;
    communityUser: boolean;
    reportOwner: boolean;
  };
  defaults: ProfileSetupDefaults;
};

type ProfileSetupLanguage = "es" | "en";

type CompleteProfileCopy = {
  languageAriaLabel: string;
  loadingTitle: string;
  loadingDescription: string;
  unavailableTitle: string;
  unavailableBannerTitle: string;
  unavailableFallback: string;
  loadErrorFallback: string;
  saveErrorFallback: string;
  tryAgain: string;
  heading: string;
  authenticatedPrefix: string;
  authenticatedSuffix: string;
  attentionTitle: string;
  stepLabel: (step: number, total: number) => string;
  steps: Record<ProfileSetupStep["key"], { title: string; description: string }>;
  labels: {
    fullName: string;
    profession: string;
    company: string;
    contact: string;
    bio: string;
  };
  optional: string;
  placeholders: {
    fullName: string;
    profession: string;
    company: string;
    contact: string;
    bio: string;
  };
  optionalDisclaimer: string;
  errors: {
    fullName: string;
    iconName: string;
    ownerContactNumber: string;
  };
  back: string;
  next: string;
  finishProfile: string;
  skip: string;
  savingProfile: string;
  skipping: string;
};

const LANGUAGE_OPTIONS: Array<{ value: ProfileSetupLanguage; label: string }> = [
  { value: "es", label: "ES" },
  { value: "en", label: "EN" },
];

const COMPLETE_PROFILE_COPY: Record<ProfileSetupLanguage, CompleteProfileCopy> = {
  es: {
    languageAriaLabel: "Idioma del flujo de perfil",
    loadingTitle: "Preparando la configuración del perfil",
    loadingDescription:
      "Estamos cargando los pasos iniciales de esta cuenta autenticada.",
    unavailableTitle: "No se pudo iniciar la configuración del perfil",
    unavailableBannerTitle: "La configuración del perfil no está disponible.",
    unavailableFallback:
      "No se pudo cargar el estado de configuración de la sesión autenticada.",
    loadErrorFallback: "No se pudo cargar el flujo de configuración del perfil.",
    saveErrorFallback: "No se pudo guardar el perfil completo.",
    tryAgain: "Intentar de nuevo",
    heading: "Completa tu perfil",
    authenticatedPrefix: "Tu cuenta ya está autenticada como",
    authenticatedSuffix:
      "Finaliza la configuración y crearemos los registros de perfil correspondientes.",
    attentionTitle: "La configuración del perfil necesita revisión",
    stepLabel: (step, total) => `Paso ${step} de ${total}`,
    steps: {
      fullName: {
        title: "Tu nombre",
        description:
          "Este nombre se usa en tu perfil privado, perfil público y registro asociado a reportes.",
      },
      professionalDetails: {
        title: "Datos profesionales",
        description:
          "Puedes agregar estos datos profesionales ahora o dejarlos en blanco.",
      },
    },
    labels: {
      fullName: "Nombre completo",
      profession: "Profesión",
      company: "Empresa",
      contact: "Contacto",
      bio: "Bio",
    },
    optional: "opcional",
    placeholders: {
      fullName: "Dra. Jane Doe",
      profession: "Especialista en genética clínica",
      company: "Golden Crow",
      contact: "+54 11 5555 5555",
      bio: "Breve bio profesional",
    },
    optionalDisclaimer:
      "Estos datos profesionales son opcionales. Si los dejas en blanco, puedes omitir este paso ahora.",
    errors: {
      fullName: "El nombre completo es obligatorio.",
      iconName: "Selecciona un ícono para continuar.",
      ownerContactNumber: "Usa solo números y signos telefónicos estándar.",
    },
    back: "Atrás",
    next: "Siguiente",
    finishProfile: "Finalizar perfil",
    skip: "Omitir",
    savingProfile: "Guardando perfil...",
    skipping: "Omitiendo...",
  },
  en: {
    languageAriaLabel: "Profile flow language",
    loadingTitle: "Preparing profile setup",
    loadingDescription:
      "Loading the first-time profile steps for this authenticated account.",
    unavailableTitle: "Unable to start profile setup",
    unavailableBannerTitle: "Profile setup is unavailable.",
    unavailableFallback:
      "The authenticated session could not load the setup state.",
    loadErrorFallback: "Unable to load the profile setup flow.",
    saveErrorFallback: "Unable to save the completed profile.",
    tryAgain: "Try again",
    heading: "Complete your profile",
    authenticatedPrefix: "Your account is already authenticated as",
    authenticatedSuffix:
      "Finish the remaining setup and we will create the related Firebase profile records.",
    attentionTitle: "Profile setup needs attention",
    stepLabel: (step, total) => `Step ${step} of ${total}`,
    steps: {
      fullName: {
        title: "Your name",
        description:
          "This appears in the private profile, public profile, and report-owner record.",
      },
      professionalDetails: {
        title: "Professional details",
        description: "Add optional report-owner details now, or leave them blank.",
      },
    },
    labels: {
      fullName: "Full name",
      profession: "Profession",
      company: "Company",
      contact: "Contact",
      bio: "Bio",
    },
    optional: "optional",
    placeholders: {
      fullName: "Dr. Jane Doe",
      profession: "Clinical genetics specialist",
      company: "Golden Crow",
      contact: "+54 11 5555 5555",
      bio: "Short professional bio",
    },
    optionalDisclaimer:
      "These professional details are optional. Leave them blank to skip this step now.",
    errors: {
      fullName: "Full name is required.",
      iconName: "Choose an icon to continue.",
      ownerContactNumber: "Use digits and standard phone punctuation only.",
    },
    back: "Back",
    next: "Next",
    finishProfile: "Finish profile",
    skip: "Skip",
    savingProfile: "Saving profile...",
    skipping: "Skipping...",
  },
};

function isPhoneValid(value: string) {
  return !value.trim() || /^[0-9+()\-\s]{7,20}$/.test(value.trim());
}

function getFieldError(
  key: keyof ProfileSetupForm,
  value: string,
  copy: CompleteProfileCopy
) {
  if (key === "fullName" && !value.trim()) {
    return copy.errors.fullName;
  }

  if (key === "iconName" && !value.trim()) {
    return copy.errors.iconName;
  }

  if (key === "ownerContactNumber" && !isPhoneValid(value)) {
    return copy.errors.ownerContactNumber;
  }

  return null;
}

function getStepError(
  step: ProfileSetupStep,
  form: ProfileSetupForm,
  copy: CompleteProfileCopy
) {
  for (const fieldKey of step.fieldKeys) {
    const error = getFieldError(fieldKey, form[fieldKey], copy);
    if (error) {
      return error;
    }
  }

  return null;
}

export function CompleteProfileFlow({
  homeHref = "/",
}: {
  homeHref?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [profileState, setProfileState] = useState<ProfileSetupState | null>(null);
  const [form, setForm] = useState<ProfileSetupForm | null>(null);
  const [language, setLanguage] = useState<ProfileSetupLanguage>("es");
  const copy = COMPLETE_PROFILE_COPY[language];

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      try {
        const response = await sdkFetch<{ state: ProfileSetupState }>("/auth/profile-setup");

        if (cancelled) {
          return;
        }

        if (!response.state.needsCompletion) {
          router.replace(homeHref);
          return;
        }

        setProfileState(response.state);
        setForm(profileSetupFormWithSkippedDefaults(response.state.defaults));
        setError(null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof SdkRequestError
            ? loadError.message
            : COMPLETE_PROFILE_COPY.es.loadErrorFallback
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadState();

    return () => {
      cancelled = true;
    };
  }, [homeHref, router]);

  const activeStep = PROFILE_SETUP_STEPS[currentStep];
  const activeStepCopy = activeStep ? copy.steps[activeStep.key] : null;
  const normalizedForm = useMemo(
    () => (form ? normalizeProfileSetupForm(form) : null),
    [form]
  );
  const professionalDetailsWereFilled = useMemo(
    () => (form ? hasProfileSetupProfessionalDetails(form) : false),
    [form]
  );
  const activeFieldError = useMemo(() => {
    if (!activeStep || !form) {
      return null;
    }

    return getStepError(activeStep, form, copy);
  }, [activeStep, copy, form]);

  function updateField<K extends keyof ProfileSetupForm>(
    key: K,
    value: ProfileSetupForm[K]
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setError(null);
  }

  function moveStep(direction: -1 | 1) {
    setCurrentStep((current) =>
      Math.min(Math.max(current + direction, 0), PROFILE_SETUP_STEPS.length - 1)
    );
  }

  async function handleFinish() {
    if (!normalizedForm) {
      return;
    }

    const firstInvalidStep = PROFILE_SETUP_STEPS.findIndex((step) =>
      Boolean(getStepError(step, normalizedForm, copy))
    );

    if (firstInvalidStep >= 0) {
      setCurrentStep(firstInvalidStep);
      setError(
        getStepError(PROFILE_SETUP_STEPS[firstInvalidStep], normalizedForm, copy)
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await sdkFetch<{ state: ProfileSetupState }>("/auth/profile-setup", {
        method: "PUT",
        body: JSON.stringify(normalizedForm),
      });
      window.setTimeout(() => {
        router.replace(homeHref);
      }, 900);
    } catch (saveError) {
      setError(
        saveError instanceof SdkRequestError
          ? saveError.message
          : copy.saveErrorFallback
      );
    } finally {
      setSaving(false);
    }
  }

  function renderLanguageSwitcher() {
    return (
      <div className="flex justify-end">
        <div
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/72 p-1"
          role="group"
          aria-label={copy.languageAriaLabel}
        >
          <Languages className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
          {LANGUAGE_OPTIONS.map((option) => {
            const active = option.value === language;

            return (
              <Button
                key={option.value}
                type="button"
                variant={active ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs font-semibold"
                aria-pressed={active}
                onClick={() => setLanguage(option.value)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderStepContent() {
    if (!form || !activeStep) {
      return null;
    }

    if (activeStep.key === "fullName") {
      return (
        <div className="space-y-2">
          <Label htmlFor="setup-full-name">{copy.labels.fullName}</Label>
          <Input
            id="setup-full-name"
            value={form.fullName}
            onChange={(event) => updateField("fullName", event.target.value)}
            placeholder={copy.placeholders.fullName}
            autoFocus
          />
        </div>
      );
    }

    if (activeStep.key === "professionalDetails") {
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="setup-owner-profession">
                {copy.labels.profession}{" "}
                <span className="font-normal text-muted-foreground">
                  ({copy.optional})
                </span>
              </Label>
              <Input
                id="setup-owner-profession"
                value={form.ownerProfession}
                onChange={(event) =>
                  updateField("ownerProfession", event.target.value)
                }
                placeholder={copy.placeholders.profession}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-owner-company">
                {copy.labels.company}{" "}
                <span className="font-normal text-muted-foreground">
                  ({copy.optional})
                </span>
              </Label>
              <Input
                id="setup-owner-company"
                value={form.ownerCompany}
                onChange={(event) =>
                  updateField("ownerCompany", event.target.value)
                }
                placeholder={copy.placeholders.company}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-owner-contact-number">
                {copy.labels.contact}{" "}
                <span className="font-normal text-muted-foreground">
                  ({copy.optional})
                </span>
              </Label>
              <Input
                id="setup-owner-contact-number"
                value={form.ownerContactNumber}
                onChange={(event) =>
                  updateField("ownerContactNumber", event.target.value)
                }
                placeholder={copy.placeholders.contact}
                inputMode="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-owner-bio">
                {copy.labels.bio}{" "}
                <span className="font-normal text-muted-foreground">
                  ({copy.optional})
                </span>
              </Label>
              <Input
                id="setup-owner-bio"
                value={form.ownerBio}
                onChange={(event) => updateField("ownerBio", event.target.value)}
                placeholder={copy.placeholders.bio}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {copy.optionalDisclaimer}
          </p>
        </>
      );
    }

    return null;
  }

  if (loading) {
    return (
      <div className="glass-panel flex w-full flex-col gap-4 px-6 py-7">
        {renderLanguageSwitcher()}
        <p className="section-eyebrow">Golden Crow</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          {copy.loadingTitle}
        </h1>
        <p className="text-sm text-muted-foreground">
          {copy.loadingDescription}
        </p>
      </div>
    );
  }

  if (!profileState || !form || !activeStep || !activeStepCopy) {
    return (
      <div className="glass-panel flex w-full flex-col gap-4 px-6 py-7">
        {renderLanguageSwitcher()}
        <p className="section-eyebrow">Golden Crow</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          {copy.unavailableTitle}
        </h1>
        <HelperBanner title={copy.unavailableBannerTitle} tone="red">
          {error ?? copy.unavailableFallback}
        </HelperBanner>
        <Button onClick={() => window.location.reload()}>{copy.tryAgain}</Button>
      </div>
    );
  }

  return (
    <div className="glass-panel flex w-full flex-col gap-6 px-6 py-7">
      {renderLanguageSwitcher()}

      <div className="flex flex-col gap-2">
        <p className="section-eyebrow">Golden Crow</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          {copy.heading}
        </h1>
        <p className="text-sm text-muted-foreground">
          {copy.authenticatedPrefix}{" "}
          <span className="font-medium text-foreground">
            {profileState.email}
          </span>
          . {copy.authenticatedSuffix}
        </p>
      </div>

      {error ? (
        <HelperBanner title={copy.attentionTitle} tone="red">
          {error}
        </HelperBanner>
      ) : null}

      <div className="flex items-center justify-center gap-2">
        {PROFILE_SETUP_STEPS.map((step, index) => {
          const complete = index < currentStep;
          const active = index === currentStep;
          return (
            <span
              key={step.key}
              className={
                active
                  ? "h-2.5 w-6 rounded-full bg-primary"
                  : complete
                    ? "h-2.5 w-2.5 rounded-full bg-primary/55"
                    : "h-2.5 w-2.5 rounded-full bg-border"
              }
            />
          );
        })}
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-background/55 px-4 py-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {copy.stepLabel(currentStep + 1, PROFILE_SETUP_STEPS.length)}
          </p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            {activeStepCopy.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {activeStepCopy.description}
          </p>
        </div>

        {renderStepContent()}

        {activeFieldError ? (
          <p className="text-sm text-destructive">{activeFieldError}</p>
        ) : null}
      </section>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => moveStep(-1)}
          disabled={currentStep === 0 || saving}
        >
          {copy.back}
        </Button>
        {currentStep === PROFILE_SETUP_STEPS.length - 1 ? (
          <Button onClick={() => void handleFinish()} disabled={saving}>
            {saving
              ? professionalDetailsWereFilled
                ? copy.savingProfile
                : copy.skipping
              : professionalDetailsWereFilled
                ? copy.finishProfile
                : copy.skip}
          </Button>
        ) : (
          <Button
            onClick={() => moveStep(1)}
            disabled={Boolean(activeFieldError) || saving}
          >
            {copy.next}
          </Button>
        )}
      </div>

      <div className="pt-1">
        <span className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Backoffice v{BACKOFFICE_VERSION}
        </span>
      </div>
    </div>
  );
}
