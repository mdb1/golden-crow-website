"use client";

import { useState, type CSSProperties } from "react";
import {
  CalendarDays,
  Check,
  GraduationCap,
  ImageIcon,
  Newspaper,
  Package,
  Palette,
  Smartphone,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type {
  PublisherAppColors,
  PublisherAppConfigInput,
} from "@/lib/publisher-app-config";
import "./publisher-app-demo-preview.css";

type DemoState = Pick<
  PublisherAppConfigInput,
  | "platformOption"
  | "connectEnabled"
  | "profileEnabled"
  | "learnCustomizationEnabled"
  | "iconSource"
>;

export type PublisherAppDemoPreviewProps = {
  stepIndex: number;
  publisherName: string;
  state: DemoState;
  colors: PublisherAppColors;
  iconSource?: string | null;
};

const STAGES = [
  { title: "Una base para tu app", label: "Base", icon: Smartphone },
  { title: "Tu contenido toma forma", label: "Funciones", icon: Sparkles },
  { title: "Tu marca entra en escena", label: "Colores", icon: Palette },
  { title: "El toque que la hace tuya", label: "Icono", icon: ImageIcon },
] as const;

export function PublisherAppDemoPreview({
  stepIndex,
  publisherName,
  state,
  colors,
  iconSource,
}: PublisherAppDemoPreviewProps) {
  const stage = Number.isFinite(stepIndex)
    ? Math.max(0, Math.min(3, Math.trunc(stepIndex)))
    : 0;
  const [navigation, setNavigation] = useState({
    stage,
    direction: "forward" as "forward" | "backward",
  });
  if (navigation.stage !== stage) {
    setNavigation({
      stage,
      direction: stage > navigation.stage ? "forward" : "backward",
    });
  }
  const built = stage >= 1;
  const colored = stage >= 2;
  const branded = stage >= 3;
  const initials =
    publisherName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "PG";
  const platforms =
    state.platformOption === "ios_android" ? "iOS + Android" : "iOS";
  const optionalFeatures = [
    { label: "Comunidad", icon: UsersRound, enabled: state.connectEnabled },
    {
      label: "Clases",
      icon: GraduationCap,
      enabled: state.learnCustomizationEnabled,
    },
    { label: "Turnos", icon: CalendarDays, enabled: state.profileEnabled },
  ];
  const featureCount =
    2 + optionalFeatures.filter((feature) => feature.enabled).length;
  const descriptions = [
    `La base de tu demo en ${platforms}.`,
    `${featureCount} funciones para conectar con tu comunidad.`,
    "Tu paleta le da vida a cada detalle.",
    "Tu nombre y tu icono, en un mismo lugar.",
  ];
  const iconStyle: CSSProperties = {
    background:
      state.iconSource === "publisher"
        ? "#FFFFFF"
        : `linear-gradient(145deg, ${colors.secondary}, ${colors.primary} 56%, ${colors.tertiary})`,
    color: state.iconSource === "publisher" ? colors.primary : "#FFFFFF",
  };
  const previewStyle = {
    "--demo-primary": colors.primary,
    "--demo-secondary": colors.secondary,
    "--demo-tertiary": colors.tertiary,
    "--demo-stage": stage,
  } as CSSProperties;

  function brandIcon(className: string) {
    return (
      <span className={className} style={iconStyle}>
        <span className="publisher-demo-icon-initials">{initials}</span>
        {iconSource ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconSource}
            alt=""
            className={`publisher-demo-icon-image ${state.iconSource === "publisher" ? "object-contain" : "object-cover"}`}
            style={{
              objectFit: state.iconSource === "publisher" ? "contain" : "cover",
            }}
            onError={(event) => {
              event.currentTarget.style.opacity = "0";
            }}
            onLoad={(event) => {
              event.currentTarget.style.opacity = "1";
            }}
          />
        ) : null}
      </span>
    );
  }

  return (
    <aside
      aria-label="Vista previa de la app"
      data-testid="publisher-app-demo-preview"
      data-step-index={stage}
      data-stage={stage}
      data-direction={navigation.direction}
      data-colored={colored}
      className="publisher-demo-assembly"
      style={previewStyle}
    >
      <div className="publisher-demo-heading">
        <span className="publisher-demo-heading-icon" aria-hidden="true">
          <Sparkles />
        </span>
        <div className="min-w-0">
          <h3>Preparando tu demo</h3>
          <p>{publisherName}</p>
        </div>
        <span className="publisher-demo-step-count">
          {stage + 1}
          <span> / 4</span>
        </span>
      </div>

      <div className="publisher-demo-rail" aria-hidden="true">
        <span className="publisher-demo-rail-marker" />
        {STAGES.map(({ label, icon: Icon }, index) => (
          <span
            key={label}
            className="publisher-demo-rail-stage"
            data-active={index === stage}
            data-complete={index < stage}
          >
            <Icon />
            <span>{label}</span>
          </span>
        ))}
      </div>

      <div className="publisher-demo-caption" aria-hidden="true">
        {STAGES.map(({ title }, index) => (
          <div
            key={title}
            className="publisher-demo-caption-layer"
            data-active={index === stage}
            style={{
              transform: `translateX(${Math.sign(index - stage) * 18}px)`,
            }}
          >
            <strong>{title}</strong>
            <p>{descriptions[index]}</p>
          </div>
        ))}
      </div>
      <span
        className="sr-only"
        role="status"
        aria-label="Avance de tu demo"
        aria-live="polite"
        aria-atomic="true"
      >
        Paso {stage + 1} de 4. {STAGES[stage]!.title}.
      </span>

      <div className="publisher-demo-scene" aria-hidden="true">
        <span className="publisher-demo-preview-tag">Vista previa</span>
        <span className="publisher-demo-orbit publisher-demo-orbit-one" />
        <span className="publisher-demo-orbit publisher-demo-orbit-two" />
        <span className="publisher-demo-scene-grid" />
        <span className="publisher-demo-color-cloud" data-visible={colored} />
        <div className="publisher-demo-device-float">
          <div className="publisher-demo-phone">
            <div className="publisher-demo-screen">
              <div className="publisher-demo-phone-status">
                <span>9:41</span>
                <span className="publisher-demo-notch" />
                <span>•••</span>
              </div>
              <div className="publisher-demo-app-header">
                <div
                  className="publisher-demo-header-icon"
                  data-visible={branded}
                >
                  {brandIcon("publisher-demo-small-icon")}
                </div>
                <span
                  className="publisher-demo-icon-placeholder"
                  data-visible={!branded}
                >
                  <ImageIcon />
                </span>
                <strong>{publisherName}</strong>
                <span className="publisher-demo-avatar" />
              </div>
              <div className="publisher-demo-hero" data-visible={built}>
                <span
                  className="publisher-demo-hero-tint"
                  data-visible={colored}
                />
                <span className="publisher-demo-hero-orb" />
                <div className="publisher-demo-hero-copy">
                  <span>Tu comunidad</span>
                  <strong>
                    Todo en
                    <br />
                    un solo lugar
                  </strong>
                </div>
              </div>
              <div className="publisher-demo-core-features">
                {[
                  { label: "Catálogo", icon: Package },
                  { label: "Novedades", icon: Newspaper },
                ].map(({ label, icon: Icon }, index) => (
                  <div
                    key={label}
                    className="publisher-demo-feature-card"
                    data-visible={built}
                    style={{ "--demo-order": index } as CSSProperties}
                  >
                    <span className="publisher-demo-feature-icon">
                      <Icon />
                    </span>
                    <strong>{label}</strong>
                    <span className="publisher-demo-feature-line" />
                  </div>
                ))}
              </div>
              <div className="publisher-demo-extra-features">
                {optionalFeatures.map(
                  ({ label, icon: Icon, enabled }, index) => (
                    <div
                      key={label}
                      className="publisher-demo-feature-row"
                      data-visible={built && enabled}
                      style={{ "--demo-order": index + 2 } as CSSProperties}
                    >
                      <div>
                        <span className="publisher-demo-feature-icon">
                          <Icon />
                        </span>
                        <strong>{label}</strong>
                        <span className="publisher-demo-row-arrow">›</span>
                      </div>
                    </div>
                  ),
                )}
              </div>
              <div className="publisher-demo-wireframe" data-visible={!built}>
                <span className="publisher-demo-wireframe-hero" />
                <span />
                <span />
                <span />
              </div>
              <div className="publisher-demo-bottom-nav" data-visible={built}>
                <span className="publisher-demo-nav-active">
                  <Package />
                </span>
                <Newspaper />
                {state.connectEnabled && <UsersRound />}
                <span className="publisher-demo-nav-avatar" />
              </div>
              <span key={stage} className="publisher-demo-scan" />
            </div>
          </div>
        </div>
        <div className="publisher-demo-floating-icon" data-visible={branded}>
          {brandIcon("publisher-demo-large-icon")}
          <span>
            <Check />
          </span>
        </div>
        <div className="publisher-demo-floating-palette" data-visible={colored}>
          {[colors.primary, colors.secondary, colors.tertiary].map(
            (color, index) => (
              <span key={index} style={{ background: color }} />
            ),
          )}
        </div>
      </div>

      <div
        className="publisher-demo-platforms"
        aria-label={`Plataformas de la demo: ${platforms}`}
      >
        <span>
          <Smartphone /> iOS
        </span>
        <span
          data-visible={state.platformOption === "ios_android"}
          aria-hidden={state.platformOption !== "ios_android"}
        >
          <Smartphone /> Android
        </span>
        <span className="publisher-demo-live-dot" aria-hidden="true" />
      </div>
    </aside>
  );
}
