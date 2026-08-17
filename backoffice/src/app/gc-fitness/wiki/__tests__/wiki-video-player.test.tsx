/**
 * @jest-environment jsdom
 */
//
// wiki-video-player.test.tsx
//
// The reported bug in assertions: "a veces entro y los videos se ven en negro, y
// hay que recargar para que aparezcan" — coaches concluded there were no videos
// and we were losing clients over it.
//
// Two independent things went wrong, so there are two independent guarantees to
// keep, and a fix for either one alone leaves the page able to fail this way:
//
//   1. FIFTEEN Loom players initialised on one route. That is what made some of
//      them fail to come up in the first place. → No iframe exists until the
//      coach presses play.
//   2. The container behind a failed player was `bg-black`, so a player that did
//      not paint was indistinguishable from an empty card. → No state of this
//      component renders a black box, and the walkthrough is always reachable.

// Imported per-file (not just in jest.setup.ts) so the matcher TYPES resolve —
// same as the other component suites in this repo.
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WikiVideoPlayer } from "../wiki-video-player";

const POSTER = {
  posterUrl: "https://cdn.loom.com/sessions/thumbnails/abc123-ff00.jpg",
  durationSeconds: 70.946,
};

function renderPlayer(poster: typeof POSTER | null = POSTER) {
  return render(
    <WikiVideoPlayer
      loomId="abc123"
      anchorId="dashboard"
      title="GCFitness - Inicio"
      poster={poster}
      locale="es"
    />,
  );
}

/** The iframe carries no ARIA role, so query the DOM node directly. */
function loomIframe(container: HTMLElement): HTMLIFrameElement | null {
  return container.querySelector("iframe");
}

beforeEach(() => {
  window.location.hash = "";
});

describe("WikiVideoPlayer", () => {
  /// Guarantee 1. Before this fix the page mounted one of these per card, all
  /// fifteen at once — `loading="lazy"` on an iframe is a hint, and Chrome's
  /// lazy viewport margin (~1250px on a fast connection) covers most of a 2-up
  /// grid on a wide screen. If this ever fails, the contention is back.
  it("mounts no player until the coach presses play", () => {
    const { container } = renderPlayer();
    expect(loomIframe(container)).toBeNull();
  });

  it("mounts the player on click, and autoplays it", async () => {
    const user = userEvent.setup();
    const { container } = renderPlayer();

    await user.click(screen.getByRole("button", { name: /GCFitness - Inicio/ }));

    const iframe = loomIframe(container);
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("loom.com/embed/abc123");
    // Without autoplay the click costs a second click inside Loom's own UI,
    // which reads as "the play button did nothing".
    expect(iframe?.getAttribute("src")).toContain("autoplay=1");
  });

  /// Guarantee 2, first half. `bg-black` is what turned every failure mode —
  /// whatever its cause — into "this page has no videos".
  it("never paints a black box, with or without a poster", () => {
    for (const poster of [POSTER, null]) {
      const { container, unmount } = renderPlayer(poster);
      expect(container.querySelector(".bg-black")).toBeNull();
      unmount();
    }
  });

  /// Guarantee 2, second half: the poster stays as the container's background
  /// while the iframe is mounted, so a player that never paints reveals the
  /// video's own frame instead of a void.
  it("keeps the poster behind the player once it is mounted", async () => {
    const user = userEvent.setup();
    const { container } = renderPlayer();
    const frame = container.querySelector<HTMLElement>("[style*='background-image']");
    expect(frame?.style.backgroundImage).toContain(POSTER.posterUrl);

    await user.click(screen.getByRole("button", { name: /GCFitness - Inicio/ }));

    expect(
      container.querySelector<HTMLElement>("[style*='background-image']")?.style
        .backgroundImage,
    ).toContain(POSTER.posterUrl);
  });

  /// The state the FIRST facade shipped as a black rectangle for every card once
  /// its guessed URL started failing. A poster we could not resolve is allowed;
  /// an anonymous card is not — the title has to be on it.
  it("labels the card when no poster could be resolved", () => {
    renderPlayer(null);
    expect(screen.getAllByText("GCFitness - Inicio").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /GCFitness - Inicio/ }),
    ).toBeInTheDocument();
  });

  /// The escape hatch, present in every state. If our embed breaks for a reason
  /// nobody has thought of, the walkthrough is still one click away — the
  /// difference between a degraded page and the lost client in the report.
  it("always offers the Loom link", async () => {
    const user = userEvent.setup();
    renderPlayer(null);
    const link = screen.getByRole("link", { name: "Ver en Loom" });
    expect(link).toHaveAttribute("href", "https://www.loom.com/share/abc123");

    await user.click(screen.getByRole("button", { name: /GCFitness - Inicio/ }));
    expect(screen.getByRole("link", { name: "Ver en Loom" })).toBeInTheDocument();
  });

  /// #349 — the per-video copy-link button promises that the recipient lands ON
  /// that walkthrough. Under the old always-mounted embed that was free. With a
  /// facade the targeted card has to open itself, or the share feature quietly
  /// degrades to "lands near it".
  it("opens itself when the page is deep-linked to this card", () => {
    window.location.hash = "#dashboard";
    const { container } = renderPlayer();
    expect(loomIframe(container)).not.toBeNull();
  });

  it("stays closed when the deep link targets another card", () => {
    window.location.hash = "#habitos";
    const { container } = renderPlayer();
    expect(loomIframe(container)).toBeNull();
  });
});
