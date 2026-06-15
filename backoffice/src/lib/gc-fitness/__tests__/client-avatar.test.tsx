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
import { render, screen } from "@testing-library/react";
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
