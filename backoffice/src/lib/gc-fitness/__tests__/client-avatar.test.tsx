/**
 * @jest-environment jsdom
 */

// client-avatar.test.tsx
//
// Regression for the initials fallback that vanished on selected gold chips
// (recent-logs / schedule / checklist client filters): the old
// `bg-primary/10` + `text-primary` scheme was gold-on-gold and disappeared on
// the `bg-primary` selected chip. The fallback must use contrasting, non-brand
// colors so the initials stay legible on any chip background.

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";

describe("ClientAvatar initials fallback", () => {
  it("renders contrasting (non-brand-gold) colors so initials show on a gold chip", () => {
    render(<ClientAvatar name="Daniel Herrera" />);
    const el = screen.getByText("DH");
    expect(el.className).toContain("text-foreground");
    // The gold-on-gold scheme that caused the bug must not return.
    expect(el.className).not.toContain("text-primary");
    expect(el.className).not.toContain("bg-primary/10");
  });

  it("derives one or two initials from the name", () => {
    const { rerender } = render(<ClientAvatar name="Colo" />);
    expect(screen.getByText("C")).toBeInTheDocument();
    rerender(<ClientAvatar name="Mateo Palma Beltran" />);
    expect(screen.getByText("MP")).toBeInTheDocument();
  });

  it("renders the photo (no initials) when photoURL is set", () => {
    const { container } = render(
      <ClientAvatar
        name="Daniel Herrera"
        photoURL="https://lh3.googleusercontent.com/x"
      />,
    );
    expect(container.querySelector("img")).not.toBeNull();
    expect(screen.queryByText("DH")).toBeNull();
  });
});

describe("ClientAvatar loading skeleton", () => {
  const PHOTO = "https://lh3.googleusercontent.com/x";

  it("pulses a skeleton disc (and hides the image) while the photo decodes", () => {
    const { container } = render(<ClientAvatar name="Manu" photoURL={PHOTO} />);
    const circle = container.firstElementChild as HTMLElement;
    // An empty transparent circle read as "broken"; now it reads as "loading".
    expect(circle.className).toContain("animate-pulse");
    expect(circle.className).toContain("bg-muted");
    expect(container.querySelector("img")?.className).toContain("opacity-0");
  });

  it("stops pulsing and reveals the photo once it loads", async () => {
    const { container } = render(<ClientAvatar name="Manu" photoURL={PHOTO} />);
    // next/image routes its own load handler through `img.decode()`, so the
    // callback lands a microtask later — hence waitFor, not a bare assertion.
    fireEvent.load(container.querySelector("img")!);

    await waitFor(() => {
      expect((container.firstElementChild as HTMLElement).className).not.toContain(
        "animate-pulse",
      );
    });
    expect(container.querySelector("img")?.className).toContain("opacity-100");
  });

  it("shows initials — never a stuck skeleton — when the photo fails", () => {
    const { container } = render(<ClientAvatar name="Manu Herrera" photoURL={PHOTO} />);
    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByText("MH")).toBeInTheDocument();
    expect((container.firstElementChild as HTMLElement).className).not.toContain(
      "animate-pulse",
    );
  });

  it("re-arms the skeleton when the row is recycled for another client", async () => {
    const { container, rerender } = render(<ClientAvatar name="Manu" photoURL={PHOTO} />);
    fireEvent.load(container.querySelector("img")!);
    await waitFor(() => {
      expect((container.firstElementChild as HTMLElement).className).not.toContain(
        "animate-pulse",
      );
    });

    rerender(<ClientAvatar name="Otro" photoURL="https://lh3.googleusercontent.com/y" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "animate-pulse",
    );
  });
});
