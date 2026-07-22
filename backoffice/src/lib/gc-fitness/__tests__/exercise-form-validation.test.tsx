/**
 * @jest-environment jsdom
 */

// exercise-form-validation.test.tsx
//
// 8 RTL tests for the trainer Exercise CRUD form + dropzone + GIF modal.
// Covers UI-SPEC verbatim copy, Zod validation surfacing, MP4/GIF/size
// validation in the dropzone, and the signed-URL → fetch(PUT) flow.
//
// Drift-guard pattern (T5): the verbatim ffmpeg one-liner is exported from
// GifConversionModal.tsx as FFMPEG_ONELINER and asserted string-equal here
// against a hardcoded literal. Any tweak to the ffmpeg recipe fails the
// build — same approach as P02-10's DeleteAccountFlowTests verbatim copy
// guard.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// --- Mock Next.js router so the form can call router.back() / router.push() ---
const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  refresh: jest.fn(),
  replace: jest.fn(),
};
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  redirect: jest.fn(),
}));

// --- Mock the Server Actions module so we don't try to hit Firestore ---
// The form imports these as `import { createExercise, ... } from
// '@/lib/gc-fitness/exercise-server-actions'`. With `"use server"` in the
// real file, Next.js wraps them in a `serverAction` proxy at build time;
// under Jest we bypass that and substitute plain async mocks.
const mockCreateExercise = jest.fn<Promise<{ id: string }>, [unknown]>();
const mockUpdateExercise = jest.fn<Promise<{ ok: true }>, [string, unknown]>();
const mockSoftDeleteExercise = jest.fn<Promise<{ ok: true }>, [string]>();
const mockDuplicateExercise = jest.fn<Promise<{ id: string }>, [string]>();
const mockMintUploadUrl =
  jest.fn<
    Promise<{ url: string; gsPath: string }>,
    [{ exerciseId: string; contentLength: number }]
  >();

jest.mock("@/lib/gc-fitness/exercise-server-actions", () => ({
  createExercise: (input: unknown) => mockCreateExercise(input),
  updateExercise: (id: string, input: unknown) =>
    mockUpdateExercise(id, input),
  softDeleteExercise: (id: string) => mockSoftDeleteExercise(id),
  duplicateExercise: (id: string) => mockDuplicateExercise(id),
  mintExerciseMediaUploadUrl: (input: {
    exerciseId: string;
    contentLength: number;
  }) => mockMintUploadUrl(input),
}));

// 260529 — ExerciseForm now calls useQueryClient() to invalidate the
// one-shot exercises feed after each mutation (create/update/duplicate/
// delete). Stub it so these render tests don't need a QueryClientProvider;
// invalidateQueries resolves to undefined which the `await` tolerates.
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// This validation suite never exercises the upload path, so stub the
// GC Fitness Firebase client helper to avoid importing the browser-only
// Firebase Auth module under the Node-based Jest environment.
jest.mock("@/lib/firebase/gc-fitness-client", () => ({
  getGCFitnessStorage: () => ({}),
}));

// --- Mock sonner toasts (sonner needs a DOM container that's harder to wire
// in jsdom; the form imports the helper directly so we observe call args). ---
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: (msg: string) => mockToastError(msg),
    success: (msg: string) => mockToastSuccess(msg),
  },
  Toaster: () => null,
}));

// --- Mock react-markdown (it's an ESM-only package and ts-jest in CJS
// mode struggles with it; we don't need real markdown for unit tests). ---
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: function MarkdownStub({ children }: { children: React.ReactNode }) {
    return <div data-testid="markdown-preview">{String(children ?? "")}</div>;
  },
}));

// Import AFTER mocks so the form modules pick up the mocked Server Actions.
import { ExerciseForm } from "@/app/gc-fitness/exercises/_components/ExerciseForm";
import {
  GifConversionModal,
  FFMPEG_ONELINER,
} from "@/app/gc-fitness/exercises/_components/GifConversionModal";

// Locked verbatim ffmpeg one-liner — must equal the constant exported from
// GifConversionModal.tsx. Drift fails the build (T5 drift-guard).
const UI_SPEC_FFMPEG_ONELINER =
  "ffmpeg -i input.gif -vcodec libx264 -pix_fmt yuv420p -crf 23 -preset slow -movflags +faststart -vf \"scale='min(480,iw)':-2\" output.mp4";

// jsdom doesn't include a global fetch — wire one we can spy on.
const mockFetch = jest.fn(
  async () => ({ ok: true, status: 200 }) as unknown as Response,
);
beforeEach(() => {
  jest.clearAllMocks();
  mockCreateExercise.mockResolvedValue({ id: "custom-test-1" });
  mockUpdateExercise.mockResolvedValue({ ok: true });
  mockSoftDeleteExercise.mockResolvedValue({ ok: true });
  mockDuplicateExercise.mockResolvedValue({ id: "custom-dup-1" });
  mockMintUploadUrl.mockResolvedValue({
    url: "https://storage.example.test/signed?token=abc",
    gsPath:
      "gs://gcfitness-3476b.firebasestorage.app/exercises/custom-test-1.mp4",
  });
  (global as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
});

describe("ExerciseForm — UI-SPEC verbatim validation copy", () => {
  it("T1: renders the core fields + Save + Cancel in create mode", () => {
    render(<ExerciseForm mode="create" />);

    // 26-09 — while collapsed, labels carry NO language suffix (the language
    // is implied by the coach's UI locale); they gain "(English)/(Spanish)"
    // only once "Add translation" is clicked.
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^description$/i)).toBeInTheDocument();
    // Coach-language-first: the other-language fields stay hidden behind the
    // "Add translation" toggle until the coach asks for them.
    expect(
      screen.queryByLabelText(/name \(spanish\)/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/name \(english\)/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add translation/i }),
    ).toBeInTheDocument();
    // #480 — Primary muscle (single-select) + Secondary muscles (multi-select)
    // + Equipment render as combobox triggers — assert by accessible name.
    expect(
      screen.getByRole("combobox", { name: /primary muscle/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /secondary muscles/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /equipment/i }),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("T2: submitting empty form surfaces UI-SPEC Zod error copy", async () => {
    const user = userEvent.setup();
    render(<ExerciseForm mode="create" />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      // 26-09 — the required error now renders as a single localized message
      // on the visible (collapsed) field rather than the raw Zod copy, so the
      // Spanish-primary coach sees the error even though the schema-required
      // language is the hidden English mirror.
      expect(screen.getByText("Enter a name.")).toBeInTheDocument();
    });
    // Description is now optional — no description-required error surfaces.
    expect(
      screen.queryByText("Add a short description so clients know what to do."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Pick at least one muscle group."),
    ).toBeInTheDocument();
    expect(mockCreateExercise).not.toHaveBeenCalled();
  });

  it("T3: a valid filled form calls createExercise with the expected shape", async () => {
    const user = userEvent.setup();
    render(<ExerciseForm mode="create" />);

    await user.type(
      screen.getByLabelText(/^name$/i),
      "Barbell Bench Press",
    );
    await user.type(
      screen.getByLabelText(/^description$/i),
      "Lie on a flat bench and press the bar.",
    );
    // #480 — pick "chest" as the PRIMARY muscle (single-select Radix Select).
    await user.click(screen.getByRole("combobox", { name: /primary muscle/i }));
    await user.click(await screen.findByRole("option", { name: /chest/i }));
    await user.click(screen.getByRole("combobox", { name: /equipment/i }));
    await user.click(await screen.findByRole("option", { name: /barbell/i }));
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockCreateExercise).toHaveBeenCalledTimes(1);
    });
    const calls = mockCreateExercise.mock.calls as unknown as Array<
      [
        {
          name: { en: string };
          muscleGroups: string[];
          primaryMuscleGroup?: string;
          equipment: string[];
        },
      ]
    >;
    const payload = calls[0][0];
    expect(payload.name.en).toBe("Barbell Bench Press");
    expect(payload.muscleGroups).toContain("chest");
    // #480 — the picked muscle is written as the explicit PRIMARY mover.
    expect(payload.primaryMuscleGroup).toBe("chest");
    expect(payload.equipment).toContain("barbell");
  });

  it("T4: a valid form without equipment defaults to bodyweight", async () => {
    const user = userEvent.setup();
    render(<ExerciseForm mode="create" />);

    await user.type(
      screen.getByLabelText(/^name$/i),
      "No Equipment Drill",
    );
    await user.type(
      screen.getByLabelText(/^description$/i),
      "Move with control.",
    );
    await user.click(screen.getByRole("combobox", { name: /primary muscle/i }));
    await user.click(await screen.findByRole("option", { name: /core/i }));

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockCreateExercise).toHaveBeenCalledTimes(1);
    });
    const calls = mockCreateExercise.mock.calls as unknown as Array<
      [{ equipment: string[] }]
    >;
    expect(calls[0][0].equipment).toEqual(["bodyweight"]);
  });
});

describe("GifConversionModal — ffmpeg drift guard", () => {
  it("T5 [DRIFT-GUARD]: GifConversionModal exports the locked verbatim ffmpeg one-liner", () => {
    // Byte-equal assertion — any tweak to the ffmpeg recipe in the source
    // file or in the literal here fails the build.
    expect(FFMPEG_ONELINER).toBe(UI_SPEC_FFMPEG_ONELINER);

    // Rendering check — the literal is also visible in the modal body.
    render(<GifConversionModal open={true} onOpenChange={() => undefined} />);
    expect(screen.getByText(FFMPEG_ONELINER)).toBeInTheDocument();
  });
});

describe("ExerciseForm — read-only view route", () => {
  it("T8: view mode disables all inputs + shows wger banner + Duplicate CTA", async () => {
    const user = userEvent.setup();
    render(
      <ExerciseForm
        mode="view"
        exerciseId="wger-abc"
        defaultValues={{
          name: { en: "Squat", es: "Sentadilla" },
          description: { en: "Stand and squat down.", es: "" },
          muscleGroups: ["legs"],
          equipment: ["barbell"],
          mediaURL: null,
          thumbnailURL: null,
          source: "wger",
          ownerId: null,
          version: 1,
        }}
      />,
    );

    expect(
      screen.getByText(
        "This exercise is sourced from wger.de and is read-only.",
      ),
    ).toBeInTheDocument();

    const nameEn = screen.getByLabelText(/name \(english\)/i) as HTMLInputElement;
    expect(nameEn).toBeDisabled();
    expect(nameEn.value).toBe("Squat");

    const duplicateBtn = screen.getByRole("button", {
      name: /duplicate to customize/i,
    });
    expect(duplicateBtn).toBeInTheDocument();

    await user.click(duplicateBtn);
    await waitFor(() => {
      expect(mockDuplicateExercise).toHaveBeenCalledWith("wger-abc");
    });
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/gc-fitness/exercises/custom-dup-1/edit",
    );
  });
});
