"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Atom,
  Bandage,
  BookOpen,
  Brain,
  BriefcaseMedical,
  ChartColumn,
  CircleUserRound,
  Cross,
  Droplets,
  Ear,
  Eye,
  FlaskConical,
  Footprints,
  Globe,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Hexagon,
  Leaf,
  Lightbulb,
  Link2,
  Pill,
  Shield,
  Sparkles,
  Star,
  Stethoscope,
  TestTube2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  "circle.hexagonpath": Hexagon,
  "heart.text.square": HeartPulse,
  bandage: Bandage,
  "cross.case": BriefcaseMedical,
  stethoscope: Stethoscope,
  pills: Pill,
  "book.fill": BookOpen,
  "graduationcap.fill": GraduationCap,
  "brain.head.profile": Brain,
  atom: Atom,
  "bolt.heart.fill": HeartHandshake,
  "waveform.path.ecg": Activity,
  "flask.fill": FlaskConical,
  "leaf.fill": Leaf,
  "globe.americas.fill": Globe,
  "link.circle.fill": Link2,
  "lightbulb.fill": Lightbulb,
  "chart.bar.fill": ChartColumn,
  "person.crop.circle.fill": CircleUserRound,
  "person.3.fill": Users,
  "star.circle.fill": Star,
  "eye.fill": Eye,
  "drop.fill": Droplets,
  "shield.lefthalf.filled": Shield,
  "figure.walk": Footprints,
  "ear.fill": Ear,
  "lungs.fill": Activity,
  "testtube.2": TestTube2,
  staroflife: Cross,
  "staroflife.fill": Cross,
};

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(79, 98, 148, ${alpha})`;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function CommunityIconAvatar({
  iconName,
  iconColorHex,
  size = "md",
  className,
}: {
  iconName?: string;
  iconColorHex?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = ICON_MAP[iconName?.trim() ?? ""] ?? CircleUserRound;
  const color = iconColorHex?.trim() || "#5A4FCF";
  const sizeClass =
    size === "sm" ? "h-9 w-9" : size === "lg" ? "h-14 w-14" : "h-11 w-11";
  const iconClass =
    size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border shadow-[0_10px_24px_rgba(9,12,18,0.08)]",
        sizeClass,
        className
      )}
      style={{
        backgroundColor: hexToRgba(color, 0.16),
        borderColor: hexToRgba(color, 0.32),
        color,
      }}
    >
      <Icon className={iconClass} strokeWidth={2} />
    </div>
  );
}

