/**
 * @jest-environment jsdom
 */

// exercise-quick-create.test.tsx
//
// The inline "exercise not found — create it here" panel shared by the single
// picker and the multi-add dialog. It is the fastest path from "the exercise I
// want doesn't exist" to "it's in the routine", which is exactly why what it
// writes matters: nobody reviews it afterwards.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The payload:
//
//   • BILINGUAL DUPLICATION. One typed name goes out as `{en, es}` with the
//     same text — the Zod schema requires both and a Spanish client would
//     otherwise see a nameless exercise. The coach refines the translation
//     later from the full editor.
//   • THE PICKED MUSCLE IS THE PRIMARY (#480). It goes into BOTH
//     `muscleGroups: [m]` and `primaryMuscleGroup: m`, so the exercise weights
//     a full set (1.0, not 0.5) in the coach's muscle-group progress charts.
//   • `thumbnailURL` IS null WHEN BLANK, never "". An empty string is a real
//     value on Firestore and the media resolvers treat a present-but-empty URL
//     differently from an absent one.
//   • THE DEMO VIDEO GOES IN `youtubeURL`, NOT THE THUMBNAIL (#1032). Before
//     the panel had its own field, a coach who wanted to attach a video had
//     nowhere to put it but "GIF / preview URL" — and that field feeds the
//     image resolvers. It is also normalized: a link copied without its
//     scheme would otherwise be rejected by `z.string().url()` server-side and
//     come back as a raw ZodError blob in the panel's error line.
//   • `ownerId: null` ON THE WIRE IS FINE — but only because `createExercise`
//     overwrites it with the session uid server-side. Worth knowing: the
//     visibility predicate is `source === "trainer" && ownerId != null`, so a
//     server change that ever TRUSTED this field would make every
//     quick-created exercise invisible in every picker, including the one that
//     just created it.
//
// The seeding rules are the other half. The panel's Name field is prefilled
// from the search term the coach typed — until they edit it themselves, at
// which point their text must survive every subsequent keystroke in the search
// box. "Create similar" replaces the whole form from a source row and marks the
// name dirty for the same reason.

import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockCreateExercise = jest.fn();
jest.mock("@/lib/gc-fitness/exercise-server-actions", () => ({
  createExercise: (...args: unknown[]) => mockCreateExercise(...args),
}));

import {
  QuickCreateExercise,
  type QuickCreateSeed,
} from "@/components/gc-fitness/exercise-quick-create";

function seed(overrides: Partial<QuickCreateSeed> = {}): QuickCreateSeed {
  return {
    name: "Barbell Row",
    description: "Pull the bar to your waist.",
    muscleGroup: "back",
    equipment: "barbell",
    gifUrl: "https://storage.example/row.gif",
    youtubeUrl: "https://youtu.be/source-demo",
    ...overrides,
  };
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof QuickCreateExercise>> = {},
) {
  const onCreated = jest.fn();
  const onSeedCleared = jest.fn();
  const view = render(
    <QuickCreateExercise
      searchTerm=""
      seed={null}
      onCreated={onCreated}
      onSeedCleared={onSeedCleared}
      {...props}
    />,
  );
  return { onCreated, onSeedCleared, rerender: view.rerender };
}

function nameField() {
  return screen.getByPlaceholderText("Name");
}

function createButton() {
  return screen.getByRole("button", { name: /^create exercise$/i });
}

function youtubeField() {
  return screen.getByPlaceholderText("YouTube video URL (optional)");
}

async function createdPayload(): Promise<Record<string, unknown>> {
  await waitFor(() => expect(mockCreateExercise).toHaveBeenCalledTimes(1));
  return mockCreateExercise.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  mockCreateExercise.mockResolvedValue({ id: "custom-1" });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("QuickCreateExercise — the payload", () => {
  it("duplicates the single typed name into both languages", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(nameField(), "  Landmine Press  ");
    await user.click(createButton());

    const payload = await createdPayload();
    // Trimmed, and the same text in both — a blank ES is a nameless exercise
    // on a Spanish client's phone.
    expect(payload.name).toEqual({ en: "Landmine Press", es: "Landmine Press" });
  });

  it("makes the picked muscle the PRIMARY, not just a member (#480)", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(nameField(), "Landmine Press");
    await user.click(createButton());

    const payload = await createdPayload();
    // Without `primaryMuscleGroup` the exercise falls back to the anatomy
    // heuristic and can weight 0.5 instead of a full set on the coach's
    // weekly-sets chart.
    expect(payload.muscleGroups).toEqual([payload.primaryMuscleGroup]);
    expect(payload.primaryMuscleGroup).toBeTruthy();
  });

  it("sends null, not '', for a blank thumbnail", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(nameField(), "Landmine Press");
    await user.click(createButton());

    const payload = await createdPayload();
    expect(payload.thumbnailURL).toBeNull();
  });

  it("sends null, not '', for a blank video link", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(nameField(), "Landmine Press");
    await user.click(createButton());

    const payload = await createdPayload();
    // Same reason as thumbnailURL: "" is a present value on Firestore, and
    // "has a demo video" is read as "the field is non-null".
    expect(payload.youtubeURL).toBeNull();
  });

  it("writes the video to youtubeURL, leaving the thumbnail alone (#1032)", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(nameField(), "Landmine Press");
    await user.type(youtubeField(), "https://youtu.be/_R389Jk0tI");
    await user.click(createButton());

    const payload = await createdPayload();
    expect(payload.youtubeURL).toBe("https://youtu.be/_R389Jk0tI");
    // The bug in the ticket: with no video field, the link landed here and
    // the media resolvers tried to render a YouTube page as an image.
    expect(payload.thumbnailURL).toBeNull();
  });

  it("adds the missing scheme to a pasted link instead of failing server-side", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(nameField(), "Landmine Press");
    await user.type(youtubeField(), "  youtu.be/_R389Jk0tI  ");
    await user.click(createButton());

    const payload = await createdPayload();
    // `exerciseSchema.youtubeURL` is a `z.string().url()`: the scheme-less
    // form is a hard reject, and the coach would see the ZodError JSON.
    expect(payload.youtubeURL).toBe("https://youtu.be/_R389Jk0tI");
  });

  it("blocks Create on a video link that is not a URL at all", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(nameField(), "Landmine Press");
    await user.type(youtubeField(), "el video que te mande por whatsapp");

    // Blocking here is the point: the Server Action would reject this too,
    // but as an unreadable ZodError with no hint of which field is at fault.
    expect(createButton()).toBeDisabled();
    expect(
      screen.getByText(/Paste the full YouTube link/i),
    ).toBeInTheDocument();
    expect(mockCreateExercise).not.toHaveBeenCalled();
  });

  it("carries the media URL through when one is seeded", async () => {
    const user = userEvent.setup();
    renderPanel({ seed: seed() });

    await user.clear(nameField());
    await user.type(nameField(), "Pendlay Row");
    await user.click(createButton());

    const payload = await createdPayload();
    expect(payload.thumbnailURL).toBe("https://storage.example/row.gif");
    expect(payload.youtubeURL).toBe("https://youtu.be/source-demo");
    expect(payload.equipment).toEqual(["barbell"]);
    expect(payload.primaryMuscleGroup).toBe("back");
  });

  it("always claims source 'trainer'", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(nameField(), "Landmine Press");
    await user.click(createButton());

    const payload = await createdPayload();
    // The Server Action rejects anything else outright; sending the wrong
    // value turns a quick-create into an error toast the coach can't act on.
    expect(payload.source).toBe("trainer");
  });

  it("reports the new exercise to the parent and clears the form", async () => {
    const user = userEvent.setup();
    const { onCreated, onSeedCleared } = renderPanel();

    await user.type(nameField(), "Landmine Press");
    await user.click(createButton());

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        id: "custom-1",
        name: "Landmine Press",
      }),
    );
    // The panel stays mounted for the next one — a stale name would be
    // submitted again on the following create.
    await waitFor(() => expect(nameField()).toHaveValue(""));
    expect(onSeedCleared).toHaveBeenCalled();
  });

  it("surfaces a failure instead of reporting a creation", async () => {
    const user = userEvent.setup();
    mockCreateExercise.mockRejectedValue(new Error("Name already in use."));
    const { onCreated } = renderPanel();

    await user.type(nameField(), "Landmine Press");
    await user.click(createButton());

    expect(await screen.findByText("Name already in use.")).toBeInTheDocument();
    // Reporting a creation that didn't happen adds a dangling id to the
    // routine being built.
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("QuickCreateExercise — the name prefill", () => {
  it("prefills from the search term the coach typed", () => {
    renderPanel({ searchTerm: "  Landmine Press  " });

    // The whole point of the panel: they already typed the name once.
    expect(nameField()).toHaveValue("Landmine Press");
  });

  it("stops following the search box once the coach edits the name", () => {
    const { rerender } = renderPanel({ searchTerm: "Landmine" });

    fireEvent.change(nameField(), {
      target: { value: "Landmine Press (Half Kneeling)" },
    });

    // The coach keeps typing in the search box behind the panel.
    rerender(
      <QuickCreateExercise
        searchTerm="Landmine P"
        seed={null}
        onCreated={jest.fn()}
        onSeedCleared={jest.fn()}
      />,
    );

    // Overwriting their name mid-edit is the kind of input-stealing that makes
    // a coach retype the same thing three times.
    expect(nameField()).toHaveValue("Landmine Press (Half Kneeling)");
  });
});

describe("QuickCreateExercise — 'Create similar'", () => {
  it("copies the whole source row into the form", () => {
    renderPanel({ seed: seed(), searchTerm: "row" });

    expect(nameField()).toHaveValue("Barbell Row");
    expect(
      screen.getByPlaceholderText("Description (optional)"),
    ).toHaveValue("Pull the bar to your waist.");
  });

  it("does not let the search term overwrite a seeded name", () => {
    // While the seed is present the prefill effect bails on `seed` alone.
    renderPanel({ seed: seed(), searchTerm: "bench" });

    expect(nameField()).toHaveValue("Barbell Row");
  });

  it("keeps the seeded name after the PARENT drops the seed", () => {
    // This is the case `setNameDirty(true)` in the seed effect actually
    // covers, and the only one — verified by mutation: with the seed still
    // set, the prefill already bails on `seed`, so removing the flag changes
    // nothing. It bites here, where the parent clears `seed` on its own (the
    // multi-add dialog does exactly that after a create) WITHOUT the coach
    // pressing Clear: with the flag gone, the search term the coach typed to
    // find the source row overwrites the name they were about to tweak.
    const { rerender } = renderPanel({ seed: seed(), searchTerm: "bench" });
    expect(nameField()).toHaveValue("Barbell Row");

    rerender(
      <QuickCreateExercise
        searchTerm="bench"
        seed={null}
        onCreated={jest.fn()}
        onSeedCleared={jest.fn()}
      />,
    );

    expect(nameField()).toHaveValue("Barbell Row");
  });

  it("blocks Create while the form is still an exact copy", async () => {
    const user = userEvent.setup();
    renderPanel({ seed: seed() });

    // "Create similar" means TWEAK something. Creating a byte-identical
    // duplicate is how the library gets two rows with the same name — the
    // very thing the dedupe layer exists to paper over.
    expect(createButton()).toBeDisabled();

    await user.type(nameField(), " (Pendlay)");

    expect(createButton()).toBeEnabled();
  });

  it("counts a swapped demo video as a real difference (#1032)", async () => {
    const user = userEvent.setup();
    renderPanel({ seed: seed() });

    expect(createButton()).toBeDisabled();

    await user.clear(youtubeField());
    await user.type(youtubeField(), "https://youtu.be/a-better-demo");

    // If `seedEquals` ignored the video, "same exercise, better demo" would
    // read as a byte-identical clone and the CTA would never enable.
    expect(createButton()).toBeEnabled();
  });

  it("clearing the seed empties the form and tells the parent", async () => {
    const user = userEvent.setup();
    const { onSeedCleared } = renderPanel({ seed: seed() });

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(nameField()).toHaveValue("");
    expect(onSeedCleared).toHaveBeenCalled();
  });
});

describe("QuickCreateExercise — the name is required", () => {
  it("keeps Create disabled with an empty name", () => {
    renderPanel();

    // The `if (!trimmedName)` branch inside `onCreate` is unreachable from the
    // UI — the button is disabled first. This asserts the guard that runs.
    expect(createButton()).toBeDisabled();
    expect(mockCreateExercise).not.toHaveBeenCalled();
  });

  it("enables Create as soon as there is a name", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(nameField(), "X");

    expect(createButton()).toBeEnabled();
  });
});
