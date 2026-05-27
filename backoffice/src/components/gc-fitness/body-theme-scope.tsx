"use client";

// body-theme-scope.tsx
//
// Applies a CSS class to <body> for as long as the gc-fitness layout is
// mounted. We need this because Radix primitives (Dialog, AlertDialog,
// Popover, Tooltip, DropdownMenu, Select…) portal their content out to
// document.body. The gc-fitness design tokens live on a `.gc-fitness-theme`
// wrapper inside the page tree, so portaled content escapes the scope and
// renders with the backoffice's default light palette — that's what made
// the propagation modal show up white with a blue button.
//
// Putting the same class on <body> makes the CSS custom properties cascade
// to every portaled descendant. The class is removed on unmount, so other
// backoffice routes (MyDNAMap, Pocket Gyms) are unaffected.

import { useEffect } from "react";

const BODY_CLASS = "gc-fitness-theme";

export function BodyThemeScope() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add(BODY_CLASS);
    return () => {
      document.body.classList.remove(BODY_CLASS);
    };
  }, []);
  return null;
}
