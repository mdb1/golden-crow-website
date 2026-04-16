"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CommunityIconAvatar } from "@/components/community-icon-avatar";
import {
  ColorPaletteField,
  OptionSelectField,
} from "@/components/constrained-fields";
import { HelperBanner } from "@/components/helper-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMUNITY_COLOR_OPTIONS,
  COMMUNITY_ICON_OPTIONS,
  CONDITION_OPTIONS,
  GENDER_OPTIONS,
} from "@/lib/admin-option-catalog";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { BACKOFFICE_VERSION } from "@/lib/app-version";

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
  defaults: {
    fullName: string;
    username: string;
    iconName: string;
    iconColorHex: string;
    ownerProfession: string;
    ownerCompany: string;
    ownerContactNumber: string;
    ownerBio: string;
    gender: string;
    condition: string;
  };
};

type ProfileSetupForm = ProfileSetupState["defaults"];

const PROFILE_STEPS: Array<{
  key: keyof ProfileSetupForm;
  title: string;
  description: string;
  required?: boolean;
}> = [
  {
    key: "fullName",
    title: "Your name",
    description: "This appears in the private profile, public profile, and report-owner record.",
    required: true,
  },
  {
    key: "username",
    title: "Pick a username",
    description: "Choose the public community handle tied to this admin account.",
    required: true,
  },
  {
    key: "iconName",
    title: "Choose an icon",
    description: "Pick the symbol used by your community and public profile records.",
    required: true,
  },
  {
    key: "iconColorHex",
    title: "Choose a color",
    description: "Set the accent color paired with your selected icon.",
    required: true,
  },
  {
    key: "ownerProfession",
    title: "Profession",
    description: "Add the professional role stored on the report-owner profile.",
  },
  {
    key: "ownerCompany",
    title: "Company",
    description: "Add the organization or institution for the report-owner profile.",
  },
  {
    key: "ownerContactNumber",
    title: "Contact number",
    description: "Store a phone number for the report-owner profile.",
  },
  {
    key: "ownerBio",
    title: "Short bio",
    description: "Describe this admin briefly for the report-owner profile.",
  },
  {
    key: "gender",
    title: "Gender",
    description: "This populates the public profile record.",
  },
  {
    key: "condition",
    title: "Condition",
    description: "This populates the public profile and private profile condition fields.",
  },
];

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

function normalizeForm(state: ProfileSetupForm): ProfileSetupForm {
  return {
    fullName: state.fullName.trim(),
    username: state.username.trim().toLowerCase(),
    iconName: state.iconName.trim(),
    iconColorHex: state.iconColorHex.trim(),
    ownerProfession: state.ownerProfession.trim(),
    ownerCompany: state.ownerCompany.trim(),
    ownerContactNumber: state.ownerContactNumber.trim(),
    ownerBio: state.ownerBio.trim(),
    gender: state.gender.trim(),
    condition: state.condition.trim(),
  };
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
        setForm(response.state.defaults);
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

  const activeStep = PROFILE_STEPS[currentStep];
  const normalizedForm = useMemo(
    () => (form ? normalizeForm(form) : null),
    [form]
  );
  const activeFieldError = useMemo(() => {
    if (!activeStep || !form) {
      return null;
    }

    return getFieldError(activeStep.key, form[activeStep.key]);
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
      Math.min(Math.max(current + direction, 0), PROFILE_STEPS.length - 1)
    );
  }

  async function handleFinish() {
    if (!normalizedForm) {
      return;
    }

    const firstInvalidStep = PROFILE_STEPS.findIndex((step) =>
      Boolean(getFieldError(step.key, normalizedForm[step.key]))
    );

    if (firstInvalidStep >= 0) {
      setCurrentStep(firstInvalidStep);
      setError(getFieldError(PROFILE_STEPS[firstInvalidStep].key, normalizedForm[PROFILE_STEPS[firstInvalidStep].key]));
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

    if (activeStep.key === "iconName") {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
            <CommunityIconAvatar
              iconName={form.iconName}
              iconColorHex={form.iconColorHex}
              size="lg"
            />
            <div>
              <p className="text-sm font-medium text-foreground">Live preview</p>
              <p className="text-xs text-muted-foreground">
                The icon is reused in the community and public profile records.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <OptionSelectField
              options={COMMUNITY_ICON_OPTIONS}
              value={form.iconName}
              onChange={(value) => updateField("iconName", value)}
              placeholder="Select an icon"
              emptyLabel="No icon"
            />
          </div>
        </div>
      );
    }

    if (activeStep.key === "iconColorHex") {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
            <CommunityIconAvatar
              iconName={form.iconName}
              iconColorHex={form.iconColorHex}
              size="lg"
            />
            <div>
              <p className="text-sm font-medium text-foreground">Color preview</p>
              <p className="text-xs text-muted-foreground">
                The color accent is stored beside the icon in all community-facing records.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <ColorPaletteField
              colors={COMMUNITY_COLOR_OPTIONS}
              value={form.iconColorHex}
              onChange={(value) => updateField("iconColorHex", value)}
            />
          </div>
        </div>
      );
    }

    if (activeStep.key === "ownerBio") {
      return (
        <div className="space-y-2">
          <Label htmlFor="setup-owner-bio">Bio</Label>
          <Textarea
            id="setup-owner-bio"
            value={form.ownerBio}
            onChange={(event) => updateField("ownerBio", event.target.value)}
            placeholder="Clinical genetics specialist focused on preventive genomics."
            className="min-h-28"
            autoFocus
          />
        </div>
      );
    }

    if (activeStep.key === "gender") {
      return (
        <div className="space-y-2">
          <Label>Gender</Label>
          <OptionSelectField
            options={GENDER_OPTIONS}
            value={form.gender}
            onChange={(value) => updateField("gender", value)}
            placeholder="Select gender"
            emptyLabel="Prefer not to say"
          />
        </div>
      );
    }

    if (activeStep.key === "condition") {
      return (
        <div className="space-y-2">
          <Label>Condition</Label>
          <OptionSelectField
            options={CONDITION_OPTIONS}
            value={form.condition}
            onChange={(value) => updateField("condition", value)}
            placeholder="Select condition"
            emptyLabel="No condition"
          />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Label htmlFor={`setup-${activeStep.key}`}>{activeStep.title}</Label>
        <Input
          id={`setup-${activeStep.key}`}
          value={form[activeStep.key]}
          onChange={(event) => updateField(activeStep.key, event.target.value)}
          placeholder={activeStep.title}
          autoFocus
        />
      </div>
    );
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
        {PROFILE_STEPS.map((step, index) => {
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
            Step {currentStep + 1} of {PROFILE_STEPS.length}
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
        {currentStep === PROFILE_STEPS.length - 1 ? (
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
