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
  return `${Math.max(2.45, Math.min(5.48, 88 / Math.max(value.length, 1))).toFixed(2)}cqw`;
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
  const cards = [
    { icon: Stethoscope, label: "Mis servicios" },
    { icon: ShoppingBag, label: "Productos" },
  ];

  return (
    <div className="absolute bottom-[2.7cqw] left-1/2 z-20 h-[34cqw] w-[19cqw] -translate-x-1/2 rotate-[1deg] rounded-[3.25cqw] bg-[linear-gradient(145deg,#1f2937,#020617_58%,var(--publisher-app-accent-deep))] p-[0.46cqw] shadow-[0_2.1cqw_2.8cqw_-1.5cqw_rgba(2,6,23,0.72)]">
      <span className="absolute -left-[0.42cqw] top-[7.5cqw] h-[3.8cqw] w-[0.28cqw] rounded-l-full bg-[var(--publisher-app-accent-deep)]" />
      <span className="absolute -right-[0.42cqw] top-[10cqw] h-[4.6cqw] w-[0.28cqw] rounded-r-full bg-[var(--publisher-app-accent-deep)]" />
      <div className="h-full rounded-[2.86cqw] bg-slate-950 p-[0.25cqw]">
        <div className="relative h-full overflow-hidden rounded-[2.62cqw] bg-[linear-gradient(180deg,#ffffff_0%,#ffffff_62%,var(--publisher-app-pale)_100%)] px-[1.12cqw] pb-[1.05cqw] pt-[1.05cqw]">
          <span className="absolute left-1/2 top-[0.55cqw] z-20 h-[1.15cqw] w-[4.25cqw] -translate-x-1/2 rounded-full bg-slate-950" />
          <PhoneStatusBar />
          <PhoneBrand name={organizationName} />

          <div className="relative mt-[1cqw] overflow-hidden rounded-[1.45cqw] bg-[linear-gradient(130deg,var(--publisher-app-accent-deep),var(--publisher-app-accent)_48%,var(--publisher-app-vivid))] p-[1cqw] text-white shadow-[0_0.72cqw_1.15cqw_-0.9cqw_rgba(15,23,42,0.65)]">
            <span className="absolute -right-[1.2cqw] -top-[1.5cqw] size-[5.4cqw] rounded-full border-[0.9cqw] border-white/10" />
            <p className="relative text-[0.55cqw] font-extrabold uppercase tracking-[0.16em] text-white/80">
              Para tu comunidad
            </p>
            <p className="relative mt-[0.35cqw] text-[1.28cqw] font-black leading-[0.94]">
              Todo tu mundo,
              <br />
              en una app
            </p>
            <Crown className="absolute bottom-[0.68cqw] right-[0.68cqw] size-[2cqw] text-white" />
          </div>

          <div className="mt-[0.72cqw] grid grid-cols-2 gap-[0.68cqw]">
            {cards.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="rounded-[1.05cqw] border-[0.08cqw] border-slate-100 bg-white p-[0.68cqw] shadow-[0_0.42cqw_0.72cqw_-0.55cqw_rgba(15,23,42,0.4)]"
              >
                <span className="flex size-[2cqw] items-center justify-center rounded-[0.7cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
                  <Icon className="size-[1.18cqw]" />
                </span>
                <p className="mt-[0.46cqw] text-[0.58cqw] font-extrabold text-slate-900">
                  {label}
                </p>
                <span className="mt-[0.35cqw] block h-[0.3cqw] w-[2.8cqw] rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_24%,#e2e8f0)]" />
              </div>
            ))}
          </div>

          <div className="mt-[0.72cqw] flex items-center gap-[0.6cqw] rounded-[1.05cqw] border-[0.08cqw] border-slate-100 bg-white p-[0.68cqw] shadow-[0_0.42cqw_0.72cqw_-0.55cqw_rgba(15,23,42,0.4)]">
            <span className="flex size-[2.15cqw] items-center justify-center rounded-[0.7cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
              <CalendarDays className="size-[1.2cqw]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.6cqw] font-extrabold text-slate-900">
                Turnos online
              </span>
              <span className="mt-[0.32cqw] block h-[0.3cqw] w-[4.2cqw] rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_24%,#e2e8f0)]" />
            </span>
            <ChevronRight className="size-[0.95cqw] text-[var(--publisher-app-vivid)]" />
          </div>

          <div className="mt-[0.65cqw] flex items-center gap-[0.6cqw] rounded-[1.05cqw] bg-white px-[0.7cqw] py-[0.56cqw] shadow-[0_0.36cqw_0.62cqw_-0.5cqw_rgba(15,23,42,0.34)]">
            <span className="flex size-[1.85cqw] items-center justify-center rounded-[0.62cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
              <Sparkles className="size-[1.05cqw]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.6cqw] font-extrabold text-slate-900">
                Novedades
              </span>
              <span className="mt-[0.2cqw] block text-[0.46cqw] font-bold text-slate-400">
                Notas y eventos
              </span>
            </span>
            <ChevronRight className="size-[0.9cqw] text-[var(--publisher-app-vivid)]" />
          </div>

          <div className="absolute inset-x-[1.08cqw] bottom-[0.86cqw] flex items-center justify-around rounded-[1.05cqw] bg-white py-[0.65cqw] shadow-[0_0.4cqw_0.7cqw_-0.55cqw_rgba(15,23,42,0.38)]">
            <HeartPulse className="size-[1.2cqw] text-[var(--publisher-app-vivid)]" />
            <Package className="size-[1.2cqw] text-slate-400" />
            <UsersRound className="size-[1.2cqw] text-slate-400" />
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
    <div className="absolute bottom-[3.2cqw] left-[1.1cqw] z-10 h-[28.5cqw] w-[15.2cqw] -rotate-[8deg] rounded-[2.65cqw] bg-[linear-gradient(145deg,#1f2937,#020617_65%,var(--publisher-app-accent-deep))] p-[0.42cqw] shadow-[0_1.8cqw_2.6cqw_-1.5cqw_rgba(2,6,23,0.68)]">
      <div className="h-full rounded-[2.28cqw] bg-slate-950 p-[0.24cqw]">
        <div className="relative h-full overflow-hidden rounded-[2.04cqw] bg-[linear-gradient(180deg,#ffffff,var(--publisher-app-pale))] px-[0.95cqw] pt-[1cqw]">
          <span className="absolute left-1/2 top-[0.48cqw] h-[1cqw] w-[3.5cqw] -translate-x-1/2 rounded-full bg-slate-950" />
          <PhoneStatusBar />
          <p className="mt-[2.4cqw] text-[0.92cqw] font-black text-slate-950">
            Mis servicios
          </p>
          <div className="mt-[1.1cqw] space-y-[0.72cqw]">
            {services.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-[0.56cqw] rounded-[0.95cqw] bg-white p-[0.62cqw] shadow-[0_0.38cqw_0.65cqw_-0.48cqw_rgba(15,23,42,0.38)]"
              >
                <span className="flex size-[2.05cqw] shrink-0 items-center justify-center rounded-[0.68cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
                  <Icon className="size-[1.08cqw]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.55cqw] font-bold text-slate-900">
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
    <div className="absolute bottom-[3.2cqw] right-[1.1cqw] z-10 h-[28.5cqw] w-[15.2cqw] rotate-[9deg] rounded-[2.65cqw] bg-[linear-gradient(145deg,#1f2937,#020617_65%,var(--publisher-app-accent-deep))] p-[0.42cqw] shadow-[0_1.8cqw_2.6cqw_-1.5cqw_rgba(2,6,23,0.68)]">
      <div className="h-full rounded-[2.28cqw] bg-slate-950 p-[0.24cqw]">
        <div className="relative h-full overflow-hidden rounded-[2.04cqw] bg-[linear-gradient(180deg,#ffffff,var(--publisher-app-pale))] px-[0.95cqw] pt-[1cqw]">
          <span className="absolute left-1/2 top-[0.48cqw] h-[1cqw] w-[3.5cqw] -translate-x-1/2 rounded-full bg-slate-950" />
          <PhoneStatusBar />
          <p className="mt-[2.4cqw] text-[0.92cqw] font-black text-slate-950">
            Productos
          </p>
          <div className="mt-[1.1cqw] space-y-[0.72cqw]">
            {products.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-[0.56cqw] rounded-[0.95cqw] bg-white p-[0.62cqw] shadow-[0_0.38cqw_0.65cqw_-0.48cqw_rgba(15,23,42,0.38)]"
              >
                <span className="flex size-[2.05cqw] shrink-0 items-center justify-center rounded-[0.68cqw] bg-[var(--publisher-app-shine)] text-[var(--publisher-app-accent-deep)]">
                  <Icon className="size-[1.08cqw]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.55cqw] font-bold text-slate-900">
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
      `radial-gradient(circle at 78% 38%, color-mix(in srgb, ${palette.vivid} 72%, white 10%) 0%, transparent 34%)`,
      `linear-gradient(112deg, color-mix(in srgb, ${palette.deep} 38%, ${palette.base}) 0%, ${palette.base} 48%, ${palette.vivid} 100%)`,
    ].join(", "),
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
  } as CSSProperties;

  return (
    <article
      data-testid="publisher-app-banner"
      data-accent={palette.source}
      data-palette-hue={palette.hue}
      style={bannerStyle}
      className="relative isolate aspect-[256/125] w-full overflow-hidden rounded-[2.7cqw] font-sans text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),transparent_30%,rgba(2,6,23,0.055))]"
      />

      <div className="absolute left-[4.7cqw] top-[6.4cqw] z-20 inline-flex h-[3.5cqw] items-center gap-[0.75cqw] rounded-full bg-[var(--publisher-app-pale)] px-[1.15cqw] text-[1.16cqw] font-black uppercase tracking-[0.18em] text-[var(--publisher-app-accent-deep)]">
        <span className="flex size-[2.4cqw] items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_20%,white)]">
          <Crown className="size-[1.35cqw] fill-current" />
        </span>
        Servicio destacado
      </div>

      <h3
        className="absolute left-[4.7cqw] top-[12.6cqw] z-20 w-[48cqw] font-black leading-[0.98] tracking-[-0.045em]"
        style={{ fontFamily: "var(--font-public-sans)" }}
      >
        <span className="block text-[5.48cqw] text-white">La app de</span>
        <span
          className="block max-w-[48cqw] whitespace-nowrap text-[var(--publisher-app-accent-deep)]"
          style={{ fontSize: headlineFontSize(brandName) }}
        >
          {brandName}
        </span>
      </h3>

      <p className="absolute left-[4.7cqw] top-[27.1cqw] z-20 w-[46cqw] text-[1.82cqw] font-bold leading-[2.55cqw] text-white/95">
        Subimos tu propia app al store, exclusiva para tus servicios y
        productos.
      </p>

      <div className="absolute left-[4.7cqw] top-[32.9cqw] z-20 flex items-center gap-[0.9cqw]">
        {[
          { icon: Smartphone, label: "App propia" },
          { icon: Stethoscope, label: "Tus servicios" },
          { icon: Package, label: "Tus productos" },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex h-[3.5cqw] items-center gap-[0.6cqw] rounded-full bg-[var(--publisher-app-pale)] px-[1.05cqw] text-[1.2cqw] font-extrabold text-[var(--publisher-app-accent-deep)]"
          >
            <Icon className="size-[1.45cqw]" strokeWidth={2.2} />
            {label}
          </span>
        ))}
      </div>

      <div className="absolute left-[4.7cqw] top-[38.8cqw] z-20 flex h-[8.8cqw] items-center gap-[2.3cqw]">
        <div className="flex w-[10.4cqw] flex-col items-center justify-center text-[var(--publisher-app-accent-deep)]">
          <span className="relative text-[2.8cqw] font-black leading-none tracking-[-0.04em]">
            99.99
            <span className="absolute left-[-3%] top-[48%] h-[0.16cqw] w-[106%] -rotate-6 bg-[var(--publisher-app-accent-deep)]" />
          </span>
          <span className="mt-[0.65cqw] text-[0.95cqw] font-black uppercase tracking-[0.08em]">
            USD / MES
          </span>
        </div>

        <div className="flex h-[8.8cqw] w-[24.4cqw] items-center gap-[1.35cqw] rounded-[2.15cqw] bg-[var(--publisher-app-pale)] px-[1.7cqw] text-[var(--publisher-app-accent-deep)] shadow-[0_0.75cqw_1.2cqw_-0.85cqw_rgba(2,6,23,0.32)]">
          <span className="rounded-full bg-[var(--publisher-app-accent)] px-[1cqw] py-[0.45cqw] text-[0.92cqw] font-black uppercase tracking-[0.06em] text-white">
            Ahora
          </span>
          <span>
            <span className="block text-[4.5cqw] font-black leading-[0.82] tracking-[-0.055em]">
              59.99
            </span>
            <span className="mt-[0.75cqw] block text-[1.02cqw] font-black uppercase tracking-[0.08em]">
              USD / MES
            </span>
          </span>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="absolute left-[55.3cqw] top-[6.2cqw] h-[38.2cqw] w-[40.4cqw]"
      >
        <span className="absolute bottom-[2.2cqw] left-1/2 h-[2.5cqw] w-[31cqw] -translate-x-1/2 rounded-full bg-slate-950/45 blur-[1.2cqw]" />
        <ServicesPhone />
        <MainPhone organizationName={brandName} />
        <ProductsPhone />

        <span className="absolute left-[2.5cqw] top-[5.6cqw] z-30 flex size-[4.5cqw] -rotate-12 items-center justify-center rounded-[1.35cqw] bg-[var(--publisher-app-vivid)] text-white shadow-[0_0.9cqw_1.5cqw_-0.9cqw_rgba(2,6,23,0.62)]">
          <HeartPulse className="size-[2.45cqw]" strokeWidth={2.6} />
        </span>
        <span className="absolute right-[2.3cqw] top-[4.5cqw] size-[3.7cqw] rounded-full border-[0.08cqw] border-white/30 bg-[radial-gradient(circle_at_32%_25%,white_0_8%,var(--publisher-app-shine)_20%,var(--publisher-app-vivid)_72%,var(--publisher-app-accent-deep))] shadow-[inset_-0.35cqw_-0.45cqw_0.75cqw_rgba(2,6,23,0.22)]" />
      </div>

      <span className="absolute bottom-[2.1cqw] right-[3cqw] z-40 inline-flex h-[4.6cqw] items-center gap-[0.75cqw] rounded-[1.45cqw] bg-[var(--publisher-app-pale)] px-[1.65cqw] text-[1.22cqw] font-black text-[var(--publisher-app-accent-deep)] shadow-[0_0.55cqw_0_var(--publisher-app-accent-deep),0_1.1cqw_1.6cqw_-1cqw_rgba(2,6,23,0.68)] transition duration-200 group-hover:-translate-y-[0.35cqw] group-hover:shadow-[0_0.75cqw_0_var(--publisher-app-accent-deep),0_1.4cqw_1.9cqw_-1cqw_rgba(2,6,23,0.72)] group-active:translate-y-[0.2cqw] group-active:shadow-[0_0.25cqw_0_var(--publisher-app-accent-deep)]">
        <Sparkles className="size-[1.45cqw] fill-current" />
        {ctaLabel}
        <ChevronRight className="size-[1.45cqw] transition-transform group-hover:translate-x-[0.22cqw]" />
      </span>
    </article>
  );
}
