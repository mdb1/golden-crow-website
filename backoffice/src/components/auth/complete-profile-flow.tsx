"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { BACKOFFICE_VERSION } from "@/lib/app-version";
import {
  PROFILE_SETUP_STEPS,
  normalizeProfileSetupForm,
  profileSetupFormWithSkippedDefaults,
  type ProfileSetupStep,
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
  defaults: ProfileSetupForm;
};

function isUsernameValid(value: string) {
  return /^[a-z0-9._-]{3,32}$/.test(value.trim().toLowerCase());
}

function isPhoneValid(value: string) {
  return !value.trim() || /^[0-9+()\-\s]{7,20}$/.test(value.trim());
}

function getFieldError(
  key: keyof ProfileSetupForm,
  value: string
) {
  if (key === "fullName" && !value.trim()) {
    return "Full name is required.";
  }

  if (key === "username" && !isUsernameValid(value)) {
    return "Use 3-32 lowercase letters, numbers, dots, underscores, or hyphens.";
  }

  if (key === "iconName" && !value.trim()) {
    return "Choose an icon to continue.";
  }

  if (key === "ownerContactNumber" && !isPhoneValid(value)) {
    return "Use digits and standard phone punctuation only.";
  }

  return null;
}

function getStepError(step: ProfileSetupStep, form: ProfileSetupForm) {
  for (const fieldKey of step.fieldKeys) {
    const error = getFieldError(fieldKey, form[fieldKey]);
    if (error) {
      return error;
    }
  }

  return null;
}

export function CompleteProfileFlow() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [profileState, setProfileState] = useState<ProfileSetupState | null>(null);
  const [form, setForm] = useState<ProfileSetupForm | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      try {
        const response = await sdkFetch<{ state: ProfileSetupState }>("/auth/profile-setup");

        if (cancelled) {
          return;
        }

        if (!response.state.needsCompletion) {
          router.replace("/");
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
            : "Unable to load the profile setup flow."
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
  }, [router]);

  const activeStep = PROFILE_SETUP_STEPS[currentStep];
  const normalizedForm = useMemo(
    () => (form ? normalizeProfileSetupForm(form) : null),
    [form]
  );
  const activeFieldError = useMemo(() => {
    if (!activeStep || !form) {
      return null;
    }

    return getStepError(activeStep, form);
  }, [activeStep, form]);

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
      Boolean(getStepError(step, normalizedForm))
    );

    if (firstInvalidStep >= 0) {
      setCurrentStep(firstInvalidStep);
      setError(getStepError(PROFILE_SETUP_STEPS[firstInvalidStep], normalizedForm));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await sdkFetch<{ state: ProfileSetupState }>("/auth/profile-setup", {
        method: "PUT",
        body: JSON.stringify(normalizedForm),
      });
      setSuccess("Account creation succeeded. Opening the backoffice now.");
      window.setTimeout(() => {
        router.replace("/");
      }, 900);
    } catch (saveError) {
      setError(
        saveError instanceof SdkRequestError
          ? saveError.message
          : "Unable to save the completed profile."
      );
    } finally {
      setSaving(false);
    }
  }

  function renderStepContent() {
    if (!form || !activeStep) {
      return null;
    }

    if (activeStep.key === "fullName") {
      return (
        <div className="space-y-2">
          <Label htmlFor="setup-full-name">Full name</Label>
          <Input
            id="setup-full-name"
            value={form.fullName}
            onChange={(event) => updateField("fullName", event.target.value)}
            placeholder="Dr. Jane Doe"
            autoFocus
          />
        </div>
      );
    }

    if (activeStep.key === "username") {
      return (
        <div className="space-y-2">
          <Label htmlFor="setup-username">Username</Label>
          <Input
            id="setup-username"
            value={form.username}
            onChange={(event) => updateField("username", event.target.value)}
            placeholder="jane.doe"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
          />
        </div>
      );
    }

    if (activeStep.key === "professionalDetails") {
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="setup-owner-profession">Profession</Label>
            <Input
              id="setup-owner-profession"
              value={form.ownerProfession}
              onChange={(event) =>
                updateField("ownerProfession", event.target.value)
              }
              placeholder="Clinical genetics specialist"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-owner-company">Company</Label>
            <Input
              id="setup-owner-company"
              value={form.ownerCompany}
              onChange={(event) => updateField("ownerCompany", event.target.value)}
              placeholder="Golden Crow"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-owner-contact-number">Contact</Label>
            <Input
              id="setup-owner-contact-number"
              value={form.ownerContactNumber}
              onChange={(event) =>
                updateField("ownerContactNumber", event.target.value)
              }
              placeholder="+54 11 5555 5555"
              inputMode="tel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-owner-bio">Bio</Label>
            <Input
              id="setup-owner-bio"
              value={form.ownerBio}
              onChange={(event) => updateField("ownerBio", event.target.value)}
              placeholder="Short professional bio"
            />
          </div>
        </div>
      );
    }

    return null;
  }

  if (loading) {
    return (
      <div className="glass-panel flex w-full flex-col gap-4 px-6 py-7">
        <p className="section-eyebrow">Golden Crow</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          Preparing profile setup
        </h1>
        <p className="text-sm text-muted-foreground">
          Loading the first-time profile steps for this authenticated account.
        </p>
      </div>
    );
  }

  if (!profileState || !form || !activeStep) {
    return (
      <div className="glass-panel flex w-full flex-col gap-4 px-6 py-7">
        <p className="section-eyebrow">Golden Crow</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          Unable to start profile setup
        </h1>
        <HelperBanner title="Profile setup is unavailable." tone="red">
          {error ?? "The authenticated session could not load the setup state."}
        </HelperBanner>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="glass-panel flex w-full flex-col gap-6 px-6 py-7">
      <div className="flex flex-col gap-2">
        <p className="section-eyebrow">Golden Crow</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          Complete your profile
        </h1>
        <p className="text-sm text-muted-foreground">
          Your account is already authenticated as <span className="font-medium text-foreground">{profileState.email}</span>.
          Finish the remaining setup and we will create the related Firebase profile records.
        </p>
      </div>

      <HelperBanner title="What happens when you finish" tone={success ? "green" : "blue"}>
        {success ??
          "This will create or update your private profile, community user, public profile, and report-owner documents, then open the backoffice."}
      </HelperBanner>

      {error ? (
        <HelperBanner title="Profile setup needs attention" tone="red">
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
            Step {currentStep + 1} of {PROFILE_SETUP_STEPS.length}
          </p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            {activeStep.title}
          </h2>
          <p className="text-sm text-muted-foreground">{activeStep.description}</p>
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
          Back
        </Button>
        {currentStep === PROFILE_SETUP_STEPS.length - 1 ? (
          <Button onClick={() => void handleFinish()} disabled={saving}>
            {saving ? "Saving profile..." : "Finish profile"}
          </Button>
        ) : (
          <Button
            onClick={() => moveStep(1)}
            disabled={Boolean(activeFieldError) || saving}
          >
            Next
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
