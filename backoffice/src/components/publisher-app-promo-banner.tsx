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
 * Builds one controlled palette around the publisher hue. The saturation floor
 * keeps muted organization colors recognizable without producing the neon
 * highlights and yellow hot spots that the previous banner accumulated.
 */
export function publisherAppIntensePalette(value?: string) {
  const accent = normalizedHexColor(value);
  const { hue, saturation } = rgbToHsl(hexToRgb(accent));

  return {
    source: accent,
    hue: Math.round(hue),
    base: hslColor(hue, Math.min(Math.max(saturation, 68), 78), 32),
    deep: hslColor(hue, Math.min(Math.max(saturation, 56), 68), 10),
    vivid: hslColor(hue, Math.min(Math.max(saturation, 70), 80), 48),
    pop: hslColor(hue, Math.min(Math.max(saturation, 72), 82), 55),
    glow: hslColor(hue, Math.min(Math.max(saturation, 62), 72), 58),
    shine: hslColor(hue, Math.min(Math.max(saturation, 30), 42), 91),
    pale: hslColor(hue, Math.min(Math.max(saturation, 24), 36), 96),
    shadow: hslAlphaColor(hue, Math.min(Math.max(saturation, 54), 64), 8, 0.52),
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
  return `${Math.max(2.45, Math.min(5.42, 86 / Math.max(value.length, 1))).toFixed(2)}cqw`;
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
        <span className="truncate text-[0.92cqw] font-black tracking-[-0.03em] text-slate-950">
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
    <div className="absolute bottom-[0.55cqw] left-1/2 z-30 h-[40.2cqw] w-[23.4cqw] -translate-x-1/2 rotate-[5deg] rounded-[3.95cqw] bg-[linear-gradient(140deg,#effff0_0%,var(--publisher-app-pop)_3%,#26353d_9%,#020617_70%,var(--publisher-app-accent-deep)_94%)] p-[0.42cqw] shadow-[0_2.5cqw_3.1cqw_-1.55cqw_rgba(2,6,23,0.72),-0.35cqw_-0.15cqw_0.65cqw_-0.35cqw_rgba(237,255,238,0.92)]">
      <span className="pointer-events-none absolute inset-[0.12cqw] rounded-[3.8cqw] border-[0.09cqw] border-white/45" />
      <span className="absolute -left-[0.34cqw] top-[8.8cqw] h-[4.8cqw] w-[0.3cqw] rounded-l-full bg-[linear-gradient(180deg,var(--publisher-app-pop),var(--publisher-app-accent-deep))] shadow-[-0.08cqw_0_0.2cqw_rgba(255,255,255,0.5)]" />
      <span className="absolute -right-[0.36cqw] top-[11.5cqw] h-[5.2cqw] w-[0.3cqw] rounded-r-full bg-[linear-gradient(180deg,var(--publisher-app-vivid),var(--publisher-app-accent-deep))]" />
      <div className="h-full rounded-[3.55cqw] bg-slate-950 p-[0.27cqw] shadow-[inset_0_0_0_0.08cqw_rgba(255,255,255,0.1)]">
        <div className="relative h-full overflow-hidden rounded-[3.28cqw] bg-[linear-gradient(180deg,#ffffff_0%,#fff_64%,var(--publisher-app-pale)_100%)] px-[1.28cqw] pb-[1.05cqw] pt-[1.08cqw]">
          <span className="absolute left-1/2 top-[0.52cqw] z-20 h-[1.18cqw] w-[4.8cqw] -translate-x-1/2 rounded-full bg-slate-950 shadow-[inset_0_-0.08cqw_0.18cqw_rgba(255,255,255,0.18)]" />
          <PhoneStatusBar />
          <PhoneBrand name={organizationName} />

          <div className="relative mt-[0.78cqw] overflow-hidden rounded-[1.45cqw] bg-[linear-gradient(125deg,var(--publisher-app-accent),var(--publisher-app-vivid)_60%,var(--publisher-app-pop))] p-[1cqw] text-white shadow-[inset_0_0.1cqw_0_rgba(255,255,255,0.38),0_0.7cqw_1.05cqw_-0.78cqw_rgba(15,23,42,0.58)]">
            <span className="absolute -right-[1.1cqw] -top-[1.25cqw] size-[5.6cqw] rounded-full border-[0.92cqw] border-white/14" />
            <p className="relative text-[0.58cqw] font-extrabold uppercase tracking-[0.16em] text-white/80">
              Para tu comunidad
            </p>
            <p className="relative mt-[0.3cqw] text-[1.38cqw] font-black leading-[0.94]">
              Todo tu mundo,
              <br />
              en una app
            </p>
            <Crown className="absolute bottom-[0.7cqw] right-[0.75cqw] size-[2.15cqw] text-white" />
          </div>

          <div className="mt-[0.62cqw] space-y-[0.48cqw]">
            {rows.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-[0.68cqw] rounded-[1.08cqw] border-[0.07cqw] border-slate-100 bg-white px-[0.68cqw] py-[0.52cqw] shadow-[0_0.38cqw_0.68cqw_-0.48cqw_rgba(15,23,42,0.34)]"
              >
                <span className="flex size-[2.1cqw] shrink-0 items-center justify-center rounded-[0.7cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
                  <Icon className="size-[1.18cqw]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.68cqw] font-extrabold text-slate-900">
                    {label}
                  </span>
                  <span className="mt-[0.28cqw] block h-[0.28cqw] w-[5.1cqw] rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_24%,#e2e8f0)]" />
                </span>
                <ChevronRight className="size-[0.95cqw] text-[var(--publisher-app-vivid)]" />
              </div>
            ))}
          </div>

          <div className="absolute inset-x-[1.18cqw] bottom-[0.82cqw] flex items-center justify-around rounded-[1.08cqw] border-[0.07cqw] border-white bg-white/95 py-[0.62cqw] shadow-[0_0.38cqw_0.68cqw_-0.5cqw_rgba(15,23,42,0.38)]">
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
    <div className="absolute bottom-[2.45cqw] left-[1.8cqw] z-10 h-[33.8cqw] w-[17.7cqw] -rotate-[10deg] rounded-[3.05cqw] bg-[linear-gradient(140deg,#effff0_0%,var(--publisher-app-pop)_4%,#26353d_11%,#020617_73%,var(--publisher-app-accent-deep)_96%)] p-[0.4cqw] shadow-[0_2.1cqw_2.8cqw_-1.55cqw_rgba(2,6,23,0.68),-0.25cqw_-0.1cqw_0.5cqw_-0.3cqw_rgba(237,255,238,0.72)]">
      <span className="pointer-events-none absolute inset-[0.12cqw] rounded-[2.9cqw] border-[0.08cqw] border-white/35" />
      <div className="h-full rounded-[2.68cqw] bg-slate-950 p-[0.23cqw]">
        <div className="relative h-full overflow-hidden rounded-[2.44cqw] bg-[linear-gradient(180deg,#ffffff,var(--publisher-app-pale))] px-[1cqw] pt-[1cqw]">
          <span className="absolute left-1/2 top-[0.48cqw] h-[1.05cqw] w-[3.8cqw] -translate-x-1/2 rounded-full bg-slate-950" />
          <PhoneStatusBar />
          <p className="mt-[2.65cqw] text-[1cqw] font-black text-slate-950">
            Mis servicios
          </p>
          <div className="mt-[1.1cqw] space-y-[0.82cqw]">
            {services.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-[0.6cqw] rounded-[1cqw] border-[0.07cqw] border-slate-100 bg-white p-[0.68cqw] shadow-[0_0.38cqw_0.65cqw_-0.48cqw_rgba(15,23,42,0.34)]"
              >
                <span className="flex size-[2.2cqw] shrink-0 items-center justify-center rounded-[0.72cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
                  <Icon className="size-[1.16cqw]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.62cqw] font-bold text-slate-900">
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
    <div className="absolute bottom-[2.35cqw] right-[0.4cqw] z-10 h-[33.8cqw] w-[17.7cqw] rotate-[11deg] rounded-[3.05cqw] bg-[linear-gradient(140deg,#effff0_0%,var(--publisher-app-pop)_4%,#26353d_11%,#020617_73%,var(--publisher-app-accent-deep)_96%)] p-[0.4cqw] shadow-[0_2.1cqw_2.8cqw_-1.55cqw_rgba(2,6,23,0.68),-0.25cqw_-0.1cqw_0.5cqw_-0.3cqw_rgba(237,255,238,0.72)]">
      <span className="pointer-events-none absolute inset-[0.12cqw] rounded-[2.9cqw] border-[0.08cqw] border-white/35" />
      <div className="h-full rounded-[2.68cqw] bg-slate-950 p-[0.23cqw]">
        <div className="relative h-full overflow-hidden rounded-[2.44cqw] bg-[linear-gradient(180deg,#ffffff,var(--publisher-app-pale))] px-[1cqw] pt-[1cqw]">
          <span className="absolute left-1/2 top-[0.48cqw] h-[1.05cqw] w-[3.8cqw] -translate-x-1/2 rounded-full bg-slate-950" />
          <PhoneStatusBar />
          <p className="mt-[2.65cqw] text-[1cqw] font-black text-slate-950">
            Productos
          </p>
          <div className="mt-[1.1cqw] space-y-[0.82cqw]">
            {products.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-[0.6cqw] rounded-[1cqw] border-[0.07cqw] border-slate-100 bg-white p-[0.68cqw] shadow-[0_0.38cqw_0.65cqw_-0.48cqw_rgba(15,23,42,0.34)]"
              >
                <span className="flex size-[2.2cqw] shrink-0 items-center justify-center rounded-[0.72cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
                  <Icon className="size-[1.16cqw]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.62cqw] font-bold text-slate-900">
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
    containerType: "inline-size",
    backgroundImage: [
      `radial-gradient(circle at 51% 8%, color-mix(in srgb, ${palette.pop} 62%, white 14%) 0%, transparent 31%)`,
      `radial-gradient(circle at 79% 56%, color-mix(in srgb, ${palette.vivid} 76%, white 12%) 0%, transparent 34%)`,
      `radial-gradient(ellipse at 72% 94%, color-mix(in srgb, ${palette.pop} 70%, white 18%) 0%, transparent 28%)`,
      `linear-gradient(116deg, color-mix(in srgb, ${palette.deep} 72%, ${palette.base}) 0%, ${palette.base} 42%, ${palette.vivid} 100%)`,
    ].join(", "),
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -28px 54px rgba(0,35,19,0.13)",
  } as CSSProperties;

  return (
    <article
      data-testid="publisher-app-banner"
      data-accent={palette.source}
      data-palette-hue={palette.hue}
      style={bannerStyle}
      className="relative isolate aspect-[256/125] w-full overflow-hidden rounded-[1.05cqw] font-sans text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_6%_3%,rgba(0,45,25,0.2),transparent_24%),radial-gradient(circle_at_98%_3%,rgba(255,255,255,0.16),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_30%,rgba(0,30,17,0.08))]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[4cqw] -left-[5cqw] size-[17cqw] rounded-full border-[3.2cqw] border-white/8"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-[6cqw] -top-[6cqw] size-[21cqw] rounded-full bg-white/10 blur-[0.12cqw]"
      />

      <div className="absolute left-[4.7cqw] top-[5.65cqw] z-30 inline-flex h-[3.55cqw] items-center gap-[0.78cqw] rounded-full border-[0.08cqw] border-white/55 bg-[linear-gradient(180deg,#fff,var(--publisher-app-pale))] px-[1.12cqw] text-[1.08cqw] font-black uppercase tracking-[0.14em] text-[var(--publisher-app-accent-deep)] shadow-[0_0.6cqw_1.15cqw_-0.82cqw_rgba(0,45,25,0.52)]">
        <span className="flex size-[2.35cqw] items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--publisher-app-pop)_24%,white)] shadow-[inset_0_0.08cqw_0_rgba(255,255,255,0.7)]">
          <Crown className="size-[1.32cqw] fill-current" />
        </span>
        Servicio destacado
      </div>

      <h3
        data-testid="publisher-app-banner-headline"
        className="absolute left-[4.7cqw] top-[11.35cqw] z-30 w-[43cqw] font-black leading-[0.91] tracking-[-0.045em]"
        style={{ fontFamily: "var(--font-nunito)" }}
      >
        <span className="block text-[6.95cqw] text-[#fffdf5] [text-shadow:0_0.18cqw_0.35cqw_rgba(0,45,25,0.12)]">
          La app de
        </span>
        <span
          className="mt-[0.5cqw] block max-w-[42cqw] whitespace-nowrap text-[var(--publisher-app-accent-deep)] [text-shadow:0_0.12cqw_0.25cqw_rgba(255,255,255,0.08)]"
          style={{ fontSize: headlineFontSize(brandName) }}
        >
          {brandName}
        </span>
      </h3>

      <p className="absolute left-[4.7cqw] top-[25.45cqw] z-30 w-[42cqw] text-[1.72cqw] font-medium leading-[2.38cqw] text-[#fffdf5]/95">
        Subimos tu propia app al store, exclusiva para tus servicios y
        productos.
      </p>

      <div className="absolute left-[4.7cqw] top-[31.05cqw] z-30 flex items-center gap-[0.78cqw]">
        {[
          { icon: Smartphone, label: "App propia" },
          { icon: Stethoscope, label: "Tus servicios" },
          { icon: Package, label: "Tus productos" },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex h-[3.45cqw] items-center gap-[0.62cqw] rounded-full border-[0.08cqw] border-white/60 bg-[linear-gradient(180deg,#fff,var(--publisher-app-pale))] px-[1.22cqw] text-[1.08cqw] font-bold text-[var(--publisher-app-accent-deep)] shadow-[0_0.48cqw_0.9cqw_-0.72cqw_rgba(0,45,25,0.45)]"
          >
            <Icon className="size-[1.38cqw]" strokeWidth={2.1} />
            {label}
          </span>
        ))}
      </div>

      <div className="absolute left-[4.7cqw] top-[36.25cqw] z-30 flex h-[8.55cqw] items-center gap-[1.35cqw]">
        <div className="flex w-[10.45cqw] flex-col items-center justify-center text-[color-mix(in_srgb,var(--publisher-app-shine)_80%,white)]">
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
          className="flex h-[8.55cqw] w-[26.9cqw] items-center gap-[1.45cqw] rounded-[2.2cqw] border-[0.1cqw] border-white/68 bg-[linear-gradient(145deg,#fff_0%,var(--publisher-app-pale)_66%,var(--publisher-app-shine)_100%)] px-[1.8cqw] text-[var(--publisher-app-accent-deep)] shadow-[0_0_1.15cqw_color-mix(in_srgb,var(--publisher-app-pop)_24%,transparent),0_0.7cqw_1.2cqw_-0.82cqw_rgba(0,45,25,0.42)]"
        >
          <span className="rounded-full bg-[linear-gradient(135deg,var(--publisher-app-accent),var(--publisher-app-vivid))] px-[1.12cqw] py-[0.48cqw] text-[0.9cqw] font-black uppercase tracking-[0.06em] text-white shadow-[inset_0_0.08cqw_0_rgba(255,255,255,0.38)]">
            Ahora
          </span>
          <span>
            <span className="block text-[4.35cqw] font-black leading-[0.82] tracking-[-0.055em] [font-family:var(--font-nunito)]">
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
        <span className="absolute bottom-[0.3cqw] left-[1.2cqw] z-0 h-[5.7cqw] w-[48.5cqw] -rotate-2 [clip-path:polygon(7%_10%,92%_0,100%_72%,4%_100%)] bg-[linear-gradient(105deg,rgba(255,255,255,0.08),color-mix(in_srgb,var(--publisher-app-pop)_42%,transparent),rgba(255,255,255,0.18))] shadow-[inset_0_0.08cqw_0_rgba(255,255,255,0.34),0_1.2cqw_2cqw_-1.45cqw_rgba(0,45,25,0.56)]" />
        <span className="absolute bottom-[1.65cqw] left-1/2 z-[1] h-[2.25cqw] w-[38cqw] -translate-x-1/2 rounded-full bg-[var(--publisher-app-accent-deep)]/45 blur-[1.2cqw]" />
        <span className="absolute right-[-1.8cqw] top-[18cqw] z-[2] h-[13cqw] w-[10cqw] rotate-[18deg] rounded-full border-[1.05cqw] border-white/24 border-l-transparent shadow-[0_0_1.2cqw_color-mix(in_srgb,var(--publisher-app-pop)_38%,transparent)]" />
        <ServicesPhone />
        <MainPhone organizationName={brandName} />
        <ProductsPhone />

        <span className="absolute left-[5.2cqw] top-[1.9cqw] z-40 flex size-[6.1cqw] -rotate-12 items-center justify-center rounded-[1.65cqw] border-[0.12cqw] border-white/42 bg-[linear-gradient(145deg,var(--publisher-app-pop),var(--publisher-app-vivid)_62%,var(--publisher-app-accent))] text-white shadow-[inset_0_0.18cqw_0.28cqw_rgba(255,255,255,0.38),0_1.1cqw_1.7cqw_-0.88cqw_rgba(0,45,25,0.68)]">
          <span className="absolute -bottom-[0.38cqw] inset-x-[0.5cqw] h-[0.5cqw] rounded-b-[0.8cqw] bg-[var(--publisher-app-accent-deep)]/55" />
          <HeartPulse className="size-[3.25cqw]" strokeWidth={2.55} />
        </span>
        <span className="absolute right-[3.1cqw] top-[4.2cqw] z-40 flex size-[5.7cqw] rotate-12 items-center justify-center rounded-[1.6cqw] border-[0.1cqw] border-white/68 bg-[linear-gradient(145deg,#fff,var(--publisher-app-pale))] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_0.15cqw_0.28cqw_rgba(255,255,255,0.72),0_1cqw_1.55cqw_-0.9cqw_rgba(0,45,25,0.56)]">
          <Sparkles className="size-[2.65cqw] fill-current" strokeWidth={2.5} />
        </span>
        <span className="absolute left-[1.2cqw] top-[8.8cqw] z-[5] size-[2.55cqw] rounded-full border-[0.08cqw] border-white/30 bg-[radial-gradient(circle_at_30%_24%,white_0_8%,var(--publisher-app-shine)_20%,var(--publisher-app-pop)_65%,var(--publisher-app-accent-deep))] shadow-[inset_-0.3cqw_-0.38cqw_0.65cqw_rgba(0,45,25,0.28)]" />
        <span className="absolute left-[1.3cqw] top-[31cqw] z-40 size-[3.2cqw] rounded-full border-[0.08cqw] border-white/30 bg-[radial-gradient(circle_at_30%_24%,white_0_8%,var(--publisher-app-shine)_20%,var(--publisher-app-vivid)_67%,var(--publisher-app-accent-deep))] shadow-[inset_-0.35cqw_-0.45cqw_0.75cqw_rgba(0,45,25,0.3),0_0.55cqw_0.8cqw_-0.5cqw_rgba(0,45,25,0.5)]" />
        <Sparkles className="absolute left-[13.2cqw] top-[5.1cqw] z-40 size-[1.35cqw] fill-white text-white drop-shadow-[0_0_0.35cqw_rgba(255,255,255,0.85)]" />
        <Sparkles className="absolute right-[0.8cqw] top-[18cqw] z-40 size-[1.65cqw] fill-white text-white drop-shadow-[0_0_0.4cqw_rgba(255,255,255,0.88)]" />
      </div>

      <span
        data-testid="publisher-app-banner-cta"
        className="absolute bottom-[3.9cqw] right-[2.9cqw] z-50 inline-flex h-[4.85cqw] items-center gap-[0.78cqw] rounded-[1.55cqw] border-[0.1cqw] border-white/68 bg-[linear-gradient(180deg,#fff,var(--publisher-app-pale))] px-[1.7cqw] text-[1.2cqw] font-black text-[var(--publisher-app-accent-deep)] shadow-[0_0.78cqw_1.3cqw_-0.76cqw_rgba(0,45,25,0.58)] transition duration-200 group-hover:-translate-y-[0.32cqw] group-hover:shadow-[0_1.1cqw_1.65cqw_-0.82cqw_rgba(0,45,25,0.64)] group-active:translate-y-[0.08cqw]"
      >
        <Sparkles className="size-[1.45cqw] fill-current" />
        {ctaLabel}
        <ChevronRight className="size-[1.45cqw] transition-transform group-hover:translate-x-[0.22cqw]" />
      </span>
    </article>
  );
}
