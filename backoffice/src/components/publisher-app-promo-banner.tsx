import type { CSSProperties } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Crown,
  Dna,
  FileChartColumnIncreasing,
  HeartPulse,
  Package,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Stethoscope,
  UsersRound,
} from "lucide-react";

const DEFAULT_APP_TINT = "#6D28D9";

type PublisherAppPromoBannerProps = {
  organizationName: string;
  organizationTint?: string;
  ctaLabel?: string;
};

type RGB = {
  red: number;
  green: number;
  blue: number;
};

type HSL = {
  hue: number;
  saturation: number;
  lightness: number;
};

function normalizedHexColor(value?: string) {
  const trimmed = value?.trim() ?? "";
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash)
    ? withHash.toUpperCase()
    : DEFAULT_APP_TINT;
}

function hexToRgb(value: string): RGB {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}

function rgbToHsl({ red, green, blue }: RGB): HSL {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  let hue = 0;
  if (delta > 0) {
    if (maximum === normalizedRed) {
      hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
    } else if (maximum === normalizedGreen) {
      hue = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
    } else {
      hue = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
    }
  }

  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation: saturation * 100,
    lightness: lightness * 100,
  };
}

function hslColor(hue: number, saturation: number, lightness: number) {
  return `hsl(${Math.round((hue + 360) % 360)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

function hslAlphaColor(
  hue: number,
  saturation: number,
  lightness: number,
  alpha: number,
) {
  return `hsl(${Math.round((hue + 360) % 360)} ${Math.round(saturation)}% ${Math.round(lightness)}% / ${alpha})`;
}

/**
 * Builds one controlled palette around the publisher hue. Green identities use
 * the reference's fixed emerald/lime scene; other hues keep the same saturation
 * and contrast structure while remaining recognizably tied to their source.
 */
export function publisherAppIntensePalette(value?: string) {
  const accent = normalizedHexColor(value);
  const { hue, saturation } = rgbToHsl(hexToRgb(accent));
  const isEmeraldScene = hue >= 72 && hue <= 155;
  const sceneHue = isEmeraldScene ? 136 : hue;
  const brightHue = isEmeraldScene ? 118 : hue;

  return {
    source: accent,
    hue: Math.round(hue),
    sceneHue: Math.round(sceneHue),
    isEmeraldScene,
    base: isEmeraldScene
      ? "#109A38"
      : hslColor(sceneHue, Math.min(Math.max(saturation, 76), 86), 34),
    deep: isEmeraldScene
      ? "#056B30"
      : hslColor(sceneHue + 7, Math.min(Math.max(saturation, 78), 90), 22),
    vivid: isEmeraldScene
      ? "#35C745"
      : hslColor(sceneHue - 10, Math.min(Math.max(saturation, 82), 92), 48),
    pop: isEmeraldScene
      ? "#B2F66A"
      : hslColor(brightHue, Math.min(Math.max(saturation, 84), 94), 61),
    glow: isEmeraldScene
      ? "#7AE85E"
      : hslColor(brightHue, Math.min(Math.max(saturation, 78), 88), 68),
    shine: isEmeraldScene
      ? "#E8F7E3"
      : hslColor(sceneHue - 8, Math.min(Math.max(saturation, 38), 52), 91),
    pale: isEmeraldScene
      ? "#F6FAF1"
      : hslColor(sceneHue, Math.min(Math.max(saturation, 24), 34), 96),
    mint: isEmeraldScene
      ? "#A8E3B4"
      : hslColor(sceneHue - 4, Math.min(Math.max(saturation, 48), 62), 76),
    shadow: hslAlphaColor(sceneHue + 8, Math.min(Math.max(saturation, 72), 84), 8, 0.58),
  };
}

function compactBrandName(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 22) {
    return trimmed;
  }

  return `${trimmed.slice(0, 21).trimEnd()}…`;
}

function headlineFontSize(value: string) {
  return `${Math.max(2.45, Math.min(5.85, 94 / Math.max(value.length, 1))).toFixed(2)}cqw`;
}

function PhoneStatusBar() {
  return (
    <div className="flex items-center justify-between text-[0.62cqw] font-extrabold text-slate-950">
      <span>9:41</span>
      <div className="flex items-end gap-[0.18cqw]" aria-hidden="true">
        <span className="h-[0.45cqw] w-[0.13cqw] rounded-full bg-slate-800" />
        <span className="h-[0.62cqw] w-[0.13cqw] rounded-full bg-slate-800" />
        <span className="h-[0.78cqw] w-[0.13cqw] rounded-full bg-slate-800" />
        <span className="ml-[0.12cqw] h-[0.62cqw] w-[1.05cqw] rounded-[0.18cqw] border-[0.08cqw] border-slate-800">
          <span className="block h-full w-[0.64cqw] bg-slate-800" />
        </span>
      </div>
    </div>
  );
}

function PhoneBrand({ name }: { name: string }) {
  return (
    <div className="mt-[1.15cqw] flex items-center justify-between gap-[0.7cqw]">
      <div className="flex min-w-0 items-center gap-[0.55cqw]">
        <span className="flex size-[1.85cqw] shrink-0 items-center justify-center rounded-[0.58cqw] bg-[var(--publisher-app-vivid)] text-white shadow-[inset_0_0.08cqw_0_rgba(255,255,255,0.55),0_0.28cqw_0.5cqw_-0.35cqw_rgba(2,6,23,0.5)]">
          <HeartPulse className="size-[1.08cqw]" strokeWidth={2.7} />
        </span>
        <span className="truncate text-[1.14cqw] font-black tracking-[-0.03em] text-slate-950">
          {compactBrandName(name)}
        </span>
      </div>
      <span className="flex size-[1.8cqw] items-center justify-center rounded-full border-[0.08cqw] border-slate-200 bg-white">
        <Bell className="size-[0.88cqw] text-[var(--publisher-app-accent-deep)]" />
      </span>
    </div>
  );
}

function MainPhone({ organizationName }: { organizationName: string }) {
  const rows = [
    { icon: Stethoscope, label: "Mis servicios" },
    { icon: ShoppingBag, label: "Productos" },
    { icon: CalendarDays, label: "Turnos online" },
    { icon: Sparkles, label: "Novedades" },
  ];

  return (
    <div
      data-testid="publisher-app-main-phone"
      className="absolute bottom-[1.3cqw] left-[42%] z-30 h-[40.4cqw] w-[20.2cqw] -translate-x-1/2 rotate-[5deg] rounded-[4.1cqw] bg-[linear-gradient(140deg,#effff0_0%,var(--publisher-app-pop)_5%,var(--publisher-app-accent)_13%,#15222c_25%,#020617_72%,var(--publisher-app-vivid)_96%)] p-[0.54cqw] shadow-[0_0_0_0.13cqw_color-mix(in_srgb,var(--publisher-app-glow)_58%,transparent),0_2.5cqw_3.1cqw_-1.55cqw_rgba(0,45,25,0.76),-0.42cqw_-0.2cqw_0.75cqw_-0.3cqw_rgba(237,255,238,0.98)]"
    >
      <span className="pointer-events-none absolute inset-[0.12cqw] rounded-[4.08cqw] border-[0.1cqw] border-white/55" />
      <span className="absolute -left-[0.34cqw] top-[8.8cqw] h-[4.8cqw] w-[0.3cqw] rounded-l-full bg-[linear-gradient(180deg,var(--publisher-app-pop),var(--publisher-app-accent-deep))] shadow-[-0.08cqw_0_0.2cqw_rgba(255,255,255,0.5)]" />
      <span className="absolute -right-[0.36cqw] top-[11.5cqw] h-[5.2cqw] w-[0.3cqw] rounded-r-full bg-[linear-gradient(180deg,var(--publisher-app-vivid),var(--publisher-app-accent-deep))]" />
      <div className="h-full rounded-[3.82cqw] bg-slate-950 p-[0.26cqw] shadow-[inset_0_0_0_0.08cqw_rgba(255,255,255,0.14)]">
        <div className="relative h-full overflow-hidden rounded-[3.54cqw] bg-[linear-gradient(180deg,#ffffff_0%,#fff_64%,var(--publisher-app-pale)_100%)] px-[1.2cqw] pb-[1.05cqw] pt-[1.08cqw]">
          <span className="absolute left-1/2 top-[0.52cqw] z-20 h-[1.18cqw] w-[4.8cqw] -translate-x-1/2 rounded-full bg-slate-950 shadow-[inset_0_-0.08cqw_0.18cqw_rgba(255,255,255,0.18)]" />
          <PhoneStatusBar />
          <PhoneBrand name={organizationName} />

          <div className="relative mt-[0.72cqw] overflow-hidden rounded-[2cqw] bg-[linear-gradient(125deg,var(--publisher-app-accent),var(--publisher-app-vivid)_60%,var(--publisher-app-pop))] p-[1.35cqw] text-white shadow-[inset_0_0.12cqw_0_rgba(255,255,255,0.48),0_0.8cqw_1.15cqw_-0.72cqw_rgba(0,45,25,0.62)]">
            <span className="absolute -right-[1.1cqw] -top-[1.25cqw] size-[5.6cqw] rounded-full border-[0.92cqw] border-white/14" />
            <p className="relative text-[0.58cqw] font-extrabold uppercase tracking-[0.16em] text-white/80">
              Para tu comunidad
            </p>
            <p className="relative mt-[0.3cqw] text-[1.52cqw] font-black leading-[0.94]">
              Todo tu mundo,
              <br />
              en una app
            </p>
            <Crown className="absolute bottom-[0.7cqw] right-[0.75cqw] size-[2.15cqw] text-white" />
          </div>

          <div className="mt-[0.62cqw] space-y-[0.62cqw]">
            {rows.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-[0.72cqw] rounded-[1.58cqw] border-[0.07cqw] border-slate-100 bg-[linear-gradient(180deg,#fff,#fbfdf9)] px-[0.78cqw] py-[0.96cqw] shadow-[0_0.48cqw_0.78cqw_-0.5cqw_rgba(0,45,25,0.3)]"
              >
                <span className="flex size-[2.42cqw] shrink-0 items-center justify-center rounded-[0.98cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
                  <Icon className="size-[1.3cqw]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.88cqw] font-extrabold text-slate-900">
                    {label}
                  </span>
                  <span className="mt-[0.28cqw] block h-[0.28cqw] w-[5.1cqw] rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_24%,#e2e8f0)]" />
                </span>
                <ChevronRight className="size-[0.95cqw] text-[var(--publisher-app-vivid)]" />
              </div>
            ))}
          </div>

          <div className="absolute inset-x-[1.18cqw] bottom-[0.82cqw] flex items-center justify-around rounded-[1.55cqw] border-[0.07cqw] border-white bg-white/95 py-[0.68cqw] shadow-[0_0.45cqw_0.78cqw_-0.48cqw_rgba(0,45,25,0.38)]">
            <HeartPulse className="size-[1.18cqw] text-[var(--publisher-app-vivid)]" />
            <Package className="size-[1.18cqw] text-slate-400" />
            <UsersRound className="size-[1.18cqw] text-slate-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ServicesPhone() {
  const services = [
    { icon: Dna, label: "Análisis genéticos" },
    { icon: HeartPulse, label: "Seguimiento" },
    { icon: FileChartColumnIncreasing, label: "Resultados" },
  ];

  return (
    <div className="absolute bottom-[2.45cqw] left-[-1cqw] z-10 h-[33.8cqw] w-[16.8cqw] -rotate-[10deg] rounded-[3.55cqw] bg-[linear-gradient(140deg,#effff0_0%,var(--publisher-app-pop)_5%,var(--publisher-app-accent)_14%,#15222c_28%,#020617_74%,var(--publisher-app-vivid)_97%)] p-[0.48cqw] shadow-[0_0_0_0.1cqw_color-mix(in_srgb,var(--publisher-app-glow)_48%,transparent),0_2.1cqw_2.8cqw_-1.55cqw_rgba(0,45,25,0.72),-0.3cqw_-0.12cqw_0.58cqw_-0.25cqw_rgba(237,255,238,0.82)]">
      <span className="pointer-events-none absolute inset-[0.12cqw] rounded-[3.38cqw] border-[0.09cqw] border-white/45" />
      <div className="h-full rounded-[3.15cqw] bg-slate-950 p-[0.23cqw]">
        <div className="relative h-full overflow-hidden rounded-[2.9cqw] bg-[linear-gradient(180deg,#ffffff,var(--publisher-app-pale))] px-[1cqw] pt-[1cqw]">
          <span className="absolute left-1/2 top-[0.48cqw] h-[1.05cqw] w-[3.8cqw] -translate-x-1/2 rounded-full bg-slate-950" />
          <PhoneStatusBar />
          <p className="mt-[2.65cqw] text-[1cqw] font-black text-slate-950">
            Mis servicios
          </p>
          <div className="mt-[1.1cqw] space-y-[0.82cqw]">
            {services.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-[0.6cqw] rounded-[1.32cqw] border-[0.07cqw] border-slate-100 bg-white p-[0.72cqw] shadow-[0_0.42cqw_0.7cqw_-0.48cqw_rgba(0,45,25,0.3)]"
              >
                <span className="flex size-[2.2cqw] shrink-0 items-center justify-center rounded-[0.72cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
                  <Icon className="size-[1.16cqw]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.72cqw] font-bold text-slate-900">
                    {label}
                  </span>
                  <span className="mt-[0.3cqw] block h-[0.28cqw] w-[3.7cqw] rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_22%,#e2e8f0)]" />
                </span>
                <ChevronRight className="size-[0.8cqw] text-[var(--publisher-app-vivid)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductsPhone() {
  const products = [
    { icon: Package, label: "Kits de salud" },
    { icon: ShoppingBag, label: "Productos" },
    { icon: Sparkles, label: "Novedades" },
  ];

  return (
    <div className="absolute bottom-[2.35cqw] right-[5.8cqw] z-10 h-[33.8cqw] w-[18.5cqw] rotate-[11deg] rounded-[3.65cqw] bg-[linear-gradient(140deg,#effff0_0%,var(--publisher-app-pop)_5%,var(--publisher-app-accent)_14%,#15222c_28%,#020617_74%,var(--publisher-app-vivid)_97%)] p-[0.48cqw] shadow-[0_0_0_0.1cqw_color-mix(in_srgb,var(--publisher-app-glow)_48%,transparent),0_2.1cqw_2.8cqw_-1.55cqw_rgba(0,45,25,0.72),-0.3cqw_-0.12cqw_0.58cqw_-0.25cqw_rgba(237,255,238,0.82)]">
      <span className="pointer-events-none absolute inset-[0.12cqw] rounded-[3.38cqw] border-[0.09cqw] border-white/45" />
      <div className="h-full rounded-[3.15cqw] bg-slate-950 p-[0.23cqw]">
        <div className="relative h-full overflow-hidden rounded-[2.9cqw] bg-[linear-gradient(180deg,#ffffff,var(--publisher-app-pale))] px-[1cqw] pt-[1cqw]">
          <span className="absolute left-1/2 top-[0.48cqw] h-[1.05cqw] w-[3.8cqw] -translate-x-1/2 rounded-full bg-slate-950" />
          <PhoneStatusBar />
          <p className="mt-[2.65cqw] text-[1cqw] font-black text-slate-950">
            Productos
          </p>
          <div className="mt-[1.1cqw] space-y-[0.82cqw]">
            {products.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-[0.6cqw] rounded-[1.32cqw] border-[0.07cqw] border-slate-100 bg-white p-[0.72cqw] shadow-[0_0.42cqw_0.7cqw_-0.48cqw_rgba(0,45,25,0.3)]"
              >
                <span className="flex size-[2.2cqw] shrink-0 items-center justify-center rounded-[0.72cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
                  <Icon className="size-[1.16cqw]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.72cqw] font-bold text-slate-900">
                    {label}
                  </span>
                  <span className="mt-[0.3cqw] block h-[0.28cqw] w-[3.7cqw] rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_22%,#e2e8f0)]" />
                </span>
                <ChevronRight className="size-[0.8cqw] text-[var(--publisher-app-vivid)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublisherAppPromoBanner({
  organizationName,
  organizationTint,
  ctaLabel = "Crear mi app",
}: PublisherAppPromoBannerProps) {
  const brandName = organizationName.trim() || "tu organización";
  const palette = publisherAppIntensePalette(organizationTint);
  const bannerStyle = {
    "--publisher-app-accent": palette.base,
    "--publisher-app-accent-deep": palette.deep,
    "--publisher-app-vivid": palette.vivid,
    "--publisher-app-pop": palette.pop,
    "--publisher-app-glow": palette.glow,
    "--publisher-app-shine": palette.shine,
    "--publisher-app-pale": palette.pale,
    "--publisher-app-mint": palette.mint,
    containerType: "inline-size",
    backgroundImage: (palette.isEmeraldScene
      ? [
          "linear-gradient(90deg,#08742F 0%,#0B8E36 22%,rgba(11,142,54,0.45) 38%,transparent 46%)",
          "radial-gradient(ellipse 34% 46% at 50% 0%, rgba(98,217,91,0.9) 0%, rgba(54,195,72,0.46) 56%, transparent 100%)",
          "radial-gradient(ellipse 38% 68% at 78% 52%, rgba(102,232,82,0.82) 0%, rgba(47,201,66,0.32) 56%, transparent 100%)",
          "radial-gradient(ellipse 55% 35% at 72% 100%, rgba(178,246,106,0.92) 0%, rgba(53,199,69,0.44) 55%, transparent 100%)",
          "linear-gradient(116deg,#08782F 0%,#0B8D38 34%,#1BAD3F 62%,#35C745 100%)",
        ]
      : [
          `radial-gradient(circle at 51% 8%, color-mix(in srgb, ${palette.base} 55%, ${palette.glow}) 0%, transparent 31%)`,
          `radial-gradient(circle at 79% 56%, color-mix(in srgb, ${palette.vivid} 76%, white 12%) 0%, transparent 34%)`,
          `radial-gradient(ellipse at 72% 94%, color-mix(in srgb, ${palette.pop} 70%, white 18%) 0%, transparent 28%)`,
          `linear-gradient(116deg, color-mix(in srgb, ${palette.deep} 72%, ${palette.base}) 0%, ${palette.base} 42%, ${palette.vivid} 100%)`,
        ]).join(", "),
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -28px 54px rgba(0,35,19,0.13)",
  } as CSSProperties;

  return (
    <article
      data-testid="publisher-app-banner"
      data-accent={palette.source}
      data-palette-hue={palette.hue}
      data-scene-hue={palette.sceneHue}
      style={bannerStyle}
      className="relative isolate aspect-[256/125] w-full overflow-hidden rounded-[1.05cqw] font-sans text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_6%_3%,rgba(0,45,25,0.05),transparent_24%),radial-gradient(circle_at_98%_3%,rgba(255,255,255,0.18),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.012),transparent_30%,rgba(0,30,17,0.1))]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[4cqw] -left-[5cqw] size-[17cqw] rounded-full border-[3.2cqw] border-white/8"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-[6cqw] -top-[6cqw] size-[21cqw] rounded-full bg-[radial-gradient(circle_at_30%_65%,rgba(255,255,255,0.78),var(--publisher-app-glow)_48%,var(--publisher-app-vivid))] opacity-55 blur-[0.12cqw]"
      />

      <div className="absolute left-[4.7cqw] top-[5.65cqw] z-30 inline-flex h-[3.65cqw] items-center gap-[0.8cqw] rounded-full border-[0.08cqw] border-white/65 bg-[linear-gradient(180deg,#fffef8,var(--publisher-app-pale))] px-[1.3cqw] text-[1.1cqw] font-black uppercase tracking-[0.14em] text-[var(--publisher-app-accent-deep)] shadow-[0_0.65cqw_1.2cqw_-0.8cqw_rgba(0,45,25,0.56)]">
        <span className="flex size-[2.35cqw] items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--publisher-app-pop)_24%,white)] shadow-[inset_0_0.08cqw_0_rgba(255,255,255,0.7)]">
          <Crown className="size-[1.32cqw] fill-current" />
        </span>
        Servicio destacado
      </div>

      <h3
        data-testid="publisher-app-banner-headline"
        className="absolute left-[4.7cqw] top-[11.35cqw] z-30 w-[43cqw] font-black leading-[0.91] tracking-[-0.045em]"
        style={{ fontFamily: "var(--font-fredoka)" }}
      >
        <span className="block text-[6.5cqw] text-[#fffdf5] [text-shadow:0_0.18cqw_0.35cqw_rgba(0,45,25,0.12)]">
          La app de
        </span>
        <span
          className="mt-[0.5cqw] block max-w-[42cqw] whitespace-nowrap text-[var(--publisher-app-accent-deep)] [text-shadow:0_0.12cqw_0.25cqw_rgba(255,255,255,0.08)]"
          style={{ fontSize: headlineFontSize(brandName) }}
        >
          {brandName}
        </span>
      </h3>

      <p className="absolute left-[4.7cqw] top-[24.85cqw] z-30 w-[42cqw] text-[1.88cqw] font-medium leading-[2.45cqw] text-[#fffdf5]/95">
        Subimos tu propia app al store, exclusiva para tus servicios y
        productos.
      </p>

      <div className="absolute left-[4.7cqw] top-[31.05cqw] z-30 flex items-center gap-[1cqw]">
        {[
          { icon: Smartphone, label: "App propia" },
          { icon: Stethoscope, label: "Tus servicios" },
          { icon: Package, label: "Tus productos" },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex h-[3.8cqw] items-center gap-[0.7cqw] rounded-full border-[0.1cqw] border-white/70 bg-[linear-gradient(180deg,#fffef8,var(--publisher-app-pale))] px-[1.65cqw] text-[1.16cqw] font-bold text-[var(--publisher-app-accent-deep)] shadow-[inset_0_0.12cqw_0_rgba(255,255,255,0.8),0_0.58cqw_1cqw_-0.72cqw_rgba(0,45,25,0.5)]"
          >
            <Icon className="size-[1.38cqw]" strokeWidth={2.1} />
            {label}
          </span>
        ))}
      </div>

      <div className="absolute left-[4.7cqw] top-[36.25cqw] z-30 flex h-[9cqw] items-center gap-[1.35cqw]">
        <div className="flex w-[10.45cqw] flex-col items-center justify-center text-[var(--publisher-app-mint)]">
          <span className="relative text-[2.92cqw] font-black leading-none tracking-[-0.04em] [text-shadow:0_0.12cqw_0.28cqw_rgba(0,45,25,0.3)]">
            99.99
            <span className="absolute left-[-3%] top-[48%] h-[0.18cqw] w-[106%] -rotate-6 rounded-full bg-[var(--publisher-app-pop)]" />
          </span>
          <span className="mt-[0.62cqw] text-[0.92cqw] font-black uppercase tracking-[0.08em] text-white/90">
            USD / MES
          </span>
        </div>

        <div
          data-testid="publisher-app-current-price"
          className="flex h-[9cqw] w-[26.9cqw] items-center gap-[1.65cqw] rounded-[2.85cqw] border-[0.12cqw] border-white/78 bg-[linear-gradient(145deg,#fffef8_0%,var(--publisher-app-pale)_62%,var(--publisher-app-shine)_100%)] px-[1.8cqw] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_0.14cqw_0_rgba(255,255,255,0.9),0_0_1.45cqw_color-mix(in_srgb,var(--publisher-app-pop)_34%,transparent),0_0.85cqw_1.4cqw_-0.78cqw_rgba(0,45,25,0.48)]"
        >
          <span className="rounded-full bg-[linear-gradient(135deg,var(--publisher-app-accent),var(--publisher-app-vivid))] px-[1.55cqw] py-[0.56cqw] text-[1cqw] font-black uppercase tracking-[0.06em] text-white shadow-[inset_0_0.08cqw_0_rgba(255,255,255,0.38)]">
            Ahora
          </span>
          <span>
            <span className="block text-[5.9cqw] font-black leading-[0.72] tracking-[-0.055em] [font-family:var(--font-fredoka)]">
              59.99
            </span>
            <span className="mt-[0.72cqw] block text-[0.98cqw] font-black uppercase tracking-[0.08em]">
              USD / MES
            </span>
          </span>
        </div>
      </div>

      <div
        aria-hidden="true"
        data-testid="publisher-app-phone-scene"
        className="absolute left-[46.2cqw] top-[3.65cqw] h-[42.7cqw] w-[52cqw]"
      >
        <span className="absolute left-[10cqw] top-[4.2cqw] z-0 h-[31cqw] w-[34cqw] rounded-full bg-[color-mix(in_srgb,var(--publisher-app-pop)_36%,transparent)] blur-[3.2cqw]" />
        <span className="absolute bottom-[0.1cqw] left-[1.2cqw] z-0 h-[6.5cqw] w-[48.5cqw] -rotate-2 [clip-path:polygon(7%_10%,92%_0,100%_72%,4%_100%)] bg-[linear-gradient(105deg,rgba(255,255,255,0.14),color-mix(in_srgb,var(--publisher-app-pop)_58%,transparent),rgba(255,255,255,0.26))] shadow-[inset_0_0.1cqw_0_rgba(255,255,255,0.5),0_1.25cqw_2.1cqw_-1.35cqw_rgba(0,45,25,0.6)]" />
        <span className="absolute bottom-[1.65cqw] left-1/2 z-[1] h-[2.25cqw] w-[38cqw] -translate-x-1/2 rounded-full bg-[var(--publisher-app-accent-deep)]/45 blur-[1.2cqw]" />
        <span className="absolute right-[-1.8cqw] top-[18cqw] z-[2] h-[13cqw] w-[10cqw] rotate-[18deg] rounded-full border-[1.05cqw] border-white/24 border-l-transparent shadow-[0_0_1.2cqw_color-mix(in_srgb,var(--publisher-app-pop)_38%,transparent)]" />
        <ServicesPhone />
        <MainPhone organizationName={brandName} />
        <ProductsPhone />

        <span className="absolute left-[0.7cqw] top-[3.8cqw] z-40 flex size-[7.25cqw] -rotate-12 items-center justify-center rounded-[2.15cqw] border-[0.14cqw] border-white/52 bg-[linear-gradient(145deg,var(--publisher-app-glow),var(--publisher-app-vivid)_58%,var(--publisher-app-accent))] text-white shadow-[inset_0_0.22cqw_0.35cqw_rgba(255,255,255,0.52),0_1.25cqw_1.9cqw_-0.78cqw_rgba(0,45,25,0.72)]">
          <span className="absolute -bottom-[0.38cqw] inset-x-[0.5cqw] h-[0.5cqw] rounded-b-[0.8cqw] bg-[var(--publisher-app-accent-deep)]/55" />
          <HeartPulse className="size-[3.85cqw]" strokeWidth={2.55} />
        </span>
        <span className="absolute right-[10.2cqw] top-[2.5cqw] z-40 flex size-[7cqw] rotate-12 items-center justify-center rounded-[2.1cqw] border-[0.12cqw] border-white/78 bg-[linear-gradient(145deg,#fffef8,var(--publisher-app-pale))] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_0.18cqw_0.32cqw_rgba(255,255,255,0.86),0_1.15cqw_1.75cqw_-0.82cqw_rgba(0,45,25,0.62)]">
          <Sparkles className="size-[3.2cqw] fill-current" strokeWidth={2.5} />
        </span>
        <span className="absolute left-[0.15cqw] top-[8.8cqw] z-40 size-[2.55cqw] rounded-full border-[0.08cqw] border-white/38 bg-[radial-gradient(circle_at_30%_24%,white_0_8%,var(--publisher-app-shine)_20%,var(--publisher-app-pop)_65%,var(--publisher-app-accent-deep))] shadow-[inset_-0.3cqw_-0.38cqw_0.65cqw_rgba(0,45,25,0.28)]" />
        <span className="absolute left-[1.3cqw] top-[31cqw] z-40 size-[3.2cqw] rounded-full border-[0.08cqw] border-white/30 bg-[radial-gradient(circle_at_30%_24%,white_0_8%,var(--publisher-app-shine)_20%,var(--publisher-app-vivid)_67%,var(--publisher-app-accent-deep))] shadow-[inset_-0.35cqw_-0.45cqw_0.75cqw_rgba(0,45,25,0.3),0_0.55cqw_0.8cqw_-0.5cqw_rgba(0,45,25,0.5)]" />
        <Sparkles className="absolute left-[13.2cqw] top-[5.1cqw] z-40 size-[1.35cqw] fill-white text-white drop-shadow-[0_0_0.35cqw_rgba(255,255,255,0.85)]" />
        <Sparkles className="absolute right-[0.8cqw] top-[18cqw] z-40 size-[1.65cqw] fill-white text-white drop-shadow-[0_0_0.4cqw_rgba(255,255,255,0.88)]" />
      </div>

      <span
        data-testid="publisher-app-banner-cta"
        className="absolute bottom-[4.6cqw] right-[2.9cqw] z-50 inline-flex h-[5.2cqw] items-center gap-[0.9cqw] rounded-[1.7cqw] border-[0.1cqw] border-white/68 bg-[linear-gradient(180deg,#fff,var(--publisher-app-pale))] px-[2.15cqw] text-[1.28cqw] font-black text-[var(--publisher-app-accent-deep)] shadow-[0_0.78cqw_1.3cqw_-0.76cqw_rgba(0,45,25,0.58)] transition duration-200 group-hover:-translate-y-[0.32cqw] group-hover:shadow-[0_1.1cqw_1.65cqw_-0.82cqw_rgba(0,45,25,0.64)] group-active:translate-y-[0.08cqw]"
      >
        <Sparkles className="size-[1.45cqw] fill-current" />
        {ctaLabel}
        <ChevronRight className="size-[1.45cqw] transition-transform group-hover:translate-x-[0.22cqw]" />
      </span>
    </article>
  );
}
