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

export function publisherAppIntensePalette(value?: string) {
  const accent = normalizedHexColor(value);
  const { hue, saturation, lightness } = rgbToHsl(hexToRgb(accent));
  const baseSaturation = Math.max(saturation, 88);
  const baseLightness = Math.min(Math.max(lightness, 43), 52);

  return {
    source: accent,
    hue: Math.round(hue),
    base: hslColor(hue, baseSaturation, baseLightness),
    deep: hslColor(
      hue,
      Math.max(saturation, 82),
      Math.min(Math.max(lightness - 20, 18), 26),
    ),
    vivid: hslColor(
      hue,
      Math.max(saturation, 94),
      Math.min(Math.max(lightness + 8, 52), 58),
    ),
    pop: hslColor(
      hue,
      Math.max(saturation, 96),
      Math.min(Math.max(lightness + 16, 58), 64),
    ),
    glow: hslColor(hue, Math.max(saturation, 92), 62),
    shine: hslColor(hue, Math.max(saturation, 88), 86),
    shadow: hslAlphaColor(hue, Math.max(saturation, 86), 20, 0.88),
  };
}

function compactBrandName(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 22) {
    return trimmed;
  }

  return `${trimmed.slice(0, 21).trimEnd()}…`;
}

function GlossOrb({ className }: { className: string }) {
  return (
    <span
      className={`pointer-events-none absolute rounded-full border border-white/45 bg-[radial-gradient(circle_at_30%_24%,white_0_5%,var(--publisher-app-shine)_12%,var(--publisher-app-vivid)_48%,var(--publisher-app-accent-deep)_100%)] shadow-[inset_-8px_-10px_18px_rgba(15,23,42,0.28),inset_7px_7px_14px_rgba(255,255,255,0.42),0_16px_30px_-15px_rgba(15,23,42,0.72)] ${className}`}
    >
      <span className="absolute left-[20%] top-[15%] size-[24%] rounded-full bg-white/75 blur-[1px]" />
    </span>
  );
}

function PhoneStatusBar() {
  return (
    <div className="flex items-center justify-between text-[7px] font-bold text-slate-900">
      <span>9:41</span>
      <div className="flex items-end gap-0.5" aria-hidden="true">
        <span className="h-1 w-0.5 rounded-full bg-slate-800" />
        <span className="h-1.5 w-0.5 rounded-full bg-slate-800" />
        <span className="h-2 w-0.5 rounded-full bg-slate-800" />
        <span className="ml-0.5 h-1.5 w-2.5 rounded-[2px] border border-slate-800">
          <span className="block h-full w-1.5 bg-slate-800" />
        </span>
      </div>
    </div>
  );
}

function PhoneBrand({ name }: { name: string }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-[7px] border border-white/70 bg-[linear-gradient(145deg,var(--publisher-app-shine),var(--publisher-app-vivid)_42%,var(--publisher-app-accent-deep))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_4px_9px_-4px_rgba(15,23,42,0.7)]">
          <HeartPulse className="size-3" strokeWidth={2.6} />
        </span>
        <span className="truncate text-[10px] font-black tracking-tight text-slate-950">
          {compactBrandName(name)}
        </span>
      </div>
      <span className="flex size-5 items-center justify-center rounded-full border border-slate-200 bg-white/85 shadow-sm">
        <Bell className="size-2.5 text-[var(--publisher-app-accent)]" />
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
    <div className="relative z-20 w-[184px] rotate-[2deg] rounded-[36px] bg-[linear-gradient(145deg,var(--publisher-app-shine)_0%,var(--publisher-app-vivid)_8%,#111827_22%,#020617_58%,var(--publisher-app-vivid)_93%,var(--publisher-app-shine)_100%)] p-[5px] shadow-[0_36px_60px_-20px_rgba(2,6,23,0.9),0_0_38px_-18px_var(--publisher-app-shine)] sm:w-[206px] lg:w-[220px]">
      <span className="absolute -left-[7px] top-24 h-12 w-[4px] rounded-l-full bg-[linear-gradient(180deg,var(--publisher-app-shine),var(--publisher-app-accent-deep))]" />
      <span className="absolute -right-[7px] top-32 h-16 w-[4px] rounded-r-full bg-[linear-gradient(180deg,var(--publisher-app-shine),var(--publisher-app-accent-deep))]" />
      <div className="rounded-[31px] bg-slate-950 p-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]">
        <div className="relative aspect-[9/18.5] overflow-hidden rounded-[27px] bg-[radial-gradient(circle_at_78%_3%,color-mix(in_srgb,var(--publisher-app-shine)_58%,white),transparent_28%),linear-gradient(180deg,#fff_0%,#fff8fb_56%,color-mix(in_srgb,var(--publisher-app-shine)_22%,#f7f1ff)_100%)] px-3 pb-3 pt-3">
          <span className="absolute left-1/2 top-1.5 z-20 h-3.5 w-12 -translate-x-1/2 rounded-full bg-slate-950 shadow-[inset_0_-1px_0_rgba(255,255,255,0.2)]" />
          <PhoneStatusBar />
          <PhoneBrand name={organizationName} />

          <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/25 bg-[linear-gradient(135deg,var(--publisher-app-accent-deep),var(--publisher-app-vivid)_56%,var(--publisher-app-pop))] p-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_12px_24px_-13px_rgba(15,23,42,0.76)]">
            <span className="absolute -right-3 -top-5 size-16 rounded-full border-[12px] border-white/12" />
            <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
            <p className="relative text-[7px] font-bold uppercase tracking-[0.16em] text-white/80">
              Para tu comunidad
            </p>
            <p className="relative mt-1 text-[14px] font-black leading-[0.95] [text-shadow:0_2px_5px_rgba(15,23,42,0.35)]">
              Todo tu mundo,
              <br />
              en una app
            </p>
            <Crown className="absolute bottom-2 right-2 size-6 fill-white/10 text-white drop-shadow" />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {cards.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="rounded-xl border border-white bg-white/88 p-2 shadow-[inset_0_1px_0_white,0_9px_18px_-11px_rgba(15,23,42,0.65)] backdrop-blur-sm"
              >
                <span className="flex size-6 items-center justify-center rounded-lg bg-[linear-gradient(145deg,var(--publisher-app-shine),color-mix(in_srgb,var(--publisher-app-vivid)_18%,white))] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_1px_0_white]">
                  <Icon className="size-3.5" />
                </span>
                <p className="mt-1.5 text-[7px] font-extrabold text-slate-900">
                  {label}
                </p>
                <span className="mt-1 block h-1 w-8 rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_18%,#e2e8f0)]" />
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2 rounded-xl border border-white bg-white/88 p-2 shadow-[inset_0_1px_0_white,0_9px_18px_-11px_rgba(15,23,42,0.65)] backdrop-blur-sm">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[linear-gradient(145deg,var(--publisher-app-shine),color-mix(in_srgb,var(--publisher-app-vivid)_18%,white))] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_1px_0_white]">
              <CalendarDays className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[7px] font-extrabold text-slate-900">
                Turnos online
              </span>
              <span className="mt-1 block h-1 w-12 rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_18%,#e2e8f0)]" />
            </span>
            <ChevronRight className="size-3 text-[var(--publisher-app-vivid)]" />
          </div>

          <div className="absolute inset-x-3 bottom-3 flex items-center justify-around rounded-xl border border-white bg-white/88 py-2 shadow-[inset_0_1px_0_white,0_10px_22px_-14px_rgba(15,23,42,0.7)] backdrop-blur-md">
            <HeartPulse className="size-3.5 text-[var(--publisher-app-vivid)]" />
            <Package className="size-3.5 text-slate-400" />
            <UsersRound className="size-3.5 text-slate-400" />
          </div>

          <span className="pointer-events-none absolute -right-20 -top-12 h-[125%] w-24 rotate-[16deg] bg-gradient-to-r from-transparent via-white/20 to-transparent blur-[1px]" />
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
    <div className="absolute bottom-1 left-0 z-10 hidden w-[168px] -rotate-[8deg] rounded-[32px] bg-[linear-gradient(145deg,var(--publisher-app-shine),var(--publisher-app-vivid)_12%,#0f172a_28%,#020617_70%,var(--publisher-app-vivid))] p-[5px] shadow-[0_28px_50px_-20px_rgba(2,6,23,0.9),0_0_28px_-18px_var(--publisher-app-shine)] sm:block lg:left-1 lg:w-[180px]">
      <div className="rounded-[27px] bg-slate-950 p-[3px]">
        <div className="relative aspect-[9/18.5] overflow-hidden rounded-[23px] bg-[radial-gradient(circle_at_20%_4%,color-mix(in_srgb,var(--publisher-app-shine)_48%,white),transparent_27%),linear-gradient(180deg,#fff_0%,color-mix(in_srgb,var(--publisher-app-shine)_18%,#fff8fb)_100%)] px-3 pt-3">
          <span className="absolute left-1/2 top-1.5 z-20 h-3 w-10 -translate-x-1/2 rounded-full bg-slate-950" />
          <PhoneStatusBar />
          <p className="mt-7 text-[11px] font-black text-slate-950">
            Mis servicios
          </p>
          <div className="mt-3 space-y-2">
            {services.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-xl border border-white bg-white/88 p-2 shadow-[inset_0_1px_0_white,0_8px_16px_-10px_rgba(15,23,42,0.64)] backdrop-blur-sm"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(145deg,var(--publisher-app-shine),color-mix(in_srgb,var(--publisher-app-vivid)_20%,white))] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_1px_0_white]">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[7px] font-bold text-slate-900">
                    {label}
                  </span>
                  <span className="mt-1 block h-1 w-11 rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_18%,#e2e8f0)]" />
                </span>
                <ChevronRight className="size-3 text-[var(--publisher-app-vivid)]" />
              </div>
            ))}
          </div>
          <span className="pointer-events-none absolute -right-20 -top-10 h-[125%] w-24 rotate-[15deg] bg-gradient-to-r from-transparent via-white/18 to-transparent" />
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
    <div className="absolute bottom-2 right-0 z-10 hidden w-[168px] rotate-[9deg] rounded-[32px] bg-[linear-gradient(145deg,var(--publisher-app-shine),var(--publisher-app-vivid)_12%,#0f172a_28%,#020617_70%,var(--publisher-app-vivid))] p-[5px] shadow-[0_28px_50px_-20px_rgba(2,6,23,0.9),0_0_28px_-18px_var(--publisher-app-shine)] sm:block lg:right-1 lg:w-[180px]">
      <div className="rounded-[27px] bg-slate-950 p-[3px]">
        <div className="relative aspect-[9/18.5] overflow-hidden rounded-[23px] bg-[radial-gradient(circle_at_82%_4%,color-mix(in_srgb,var(--publisher-app-shine)_48%,white),transparent_27%),linear-gradient(180deg,#fff_0%,color-mix(in_srgb,var(--publisher-app-shine)_18%,#fff8fb)_100%)] px-3 pt-3">
          <span className="absolute left-1/2 top-1.5 z-20 h-3 w-10 -translate-x-1/2 rounded-full bg-slate-950" />
          <PhoneStatusBar />
          <p className="mt-7 text-[11px] font-black text-slate-950">
            Productos
          </p>
          <div className="mt-3 space-y-2">
            {products.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-xl border border-white bg-white/88 p-2 shadow-[inset_0_1px_0_white,0_8px_16px_-10px_rgba(15,23,42,0.64)] backdrop-blur-sm"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(145deg,var(--publisher-app-shine),color-mix(in_srgb,var(--publisher-app-vivid)_20%,white))] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_1px_0_white]">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[7px] font-bold text-slate-900">
                    {label}
                  </span>
                  <span className="mt-1 block h-1 w-10 rounded-full bg-[color-mix(in_srgb,var(--publisher-app-vivid)_18%,#e2e8f0)]" />
                </span>
                <ChevronRight className="size-3 text-[var(--publisher-app-vivid)]" />
              </div>
            ))}
          </div>
          <span className="pointer-events-none absolute -right-20 -top-10 h-[125%] w-24 rotate-[15deg] bg-gradient-to-r from-transparent via-white/18 to-transparent" />
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
    backgroundImage: [
      "radial-gradient(circle at 80% 12%, rgba(255,255,255,0.18) 0 6%, transparent 18%)",
      `radial-gradient(circle at 74% 58%, color-mix(in srgb, ${palette.vivid} 88%, transparent) 0%, transparent 37%)`,
      `radial-gradient(circle at 103% 78%, color-mix(in srgb, ${palette.pop} 92%, transparent) 0%, transparent 34%)`,
      `radial-gradient(circle at 8% -10%, ${palette.base} 0%, transparent 36%)`,
      `radial-gradient(circle at 24% 110%, ${palette.deep} 0%, transparent 44%)`,
      `linear-gradient(122deg, ${palette.deep} 0%, ${palette.base} 38%, ${palette.vivid} 76%, ${palette.pop} 128%)`,
    ].join(", "),
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -38px 65px rgba(3,7,18,0.13), 0 32px 84px -38px ${palette.shadow}`,
  } as CSSProperties;

  return (
    <article
      data-testid="publisher-app-banner"
      data-accent={palette.source}
      data-palette-hue={palette.hue}
      style={bannerStyle}
      className="relative isolate overflow-hidden rounded-[30px] border-2 border-white/30 text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[42%] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_74%)] mix-blend-screen"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[12%] top-[-48%] h-[125%] w-[42%] rotate-[16deg] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full border-[46px] border-white/[0.09] shadow-[0_0_50px_color-mix(in_srgb,var(--publisher-app-vivid)_18%,transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden sm:block"
      >
        <GlossOrb className="right-[4%] top-[11%] size-12 opacity-90" />
        <GlossOrb className="right-[39%] top-[16%] size-5 opacity-80" />
        <GlossOrb className="bottom-[12%] right-[7%] size-7 opacity-75" />
        <Sparkles className="absolute right-[2.5%] top-[38%] size-7 fill-[#FFE787] text-[#FFF2A8] drop-shadow-[0_0_9px_rgba(255,235,120,0.9)]" />
        <Sparkles className="absolute left-[47%] top-[11%] size-4 fill-white text-white drop-shadow-[0_0_8px_white]" />
        <span className="absolute left-[49%] top-[33%] size-2 rotate-12 rounded-[2px] bg-white/75 shadow-[72px_128px_0_-1px_rgba(255,255,255,0.66),-36px_184px_0_-1px_rgba(255,255,255,0.5)]" />
      </div>

      <div className="relative grid min-h-[510px] items-center gap-8 px-5 py-7 sm:px-8 sm:py-9 lg:min-h-[478px] lg:grid-cols-[minmax(0,0.93fr)_minmax(440px,1.07fr)] lg:gap-5 lg:px-10 lg:py-10">
        <div className="relative z-20 min-w-0">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-white/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.82))] px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_1px_0_white,0_10px_26px_-16px_rgba(3,7,18,0.76)] backdrop-blur-md">
            <span className="flex size-6 items-center justify-center rounded-full bg-[linear-gradient(145deg,var(--publisher-app-shine),var(--publisher-app-vivid))] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_1px_0_white,0_3px_8px_-4px_rgba(15,23,42,0.7)]">
              <Crown className="size-3.5 fill-current" />
            </span>
            Servicio destacado
          </div>

          <h3 className="mt-5 max-w-xl font-heading text-[clamp(2.65rem,7vw,4.9rem)] font-black leading-[0.84] tracking-[-0.06em] [text-shadow:0_5px_20px_rgba(2,6,23,0.3)]">
            La app de
            <span className="mt-2 block break-words bg-[linear-gradient(180deg,#fff_0%,var(--publisher-app-shine)_54%,#fff_100%)] bg-clip-text text-transparent [filter:drop-shadow(0_7px_14px_rgba(2,6,23,0.28))]">
              {brandName}
            </span>
          </h3>

          <p className="mt-5 max-w-lg text-base font-medium leading-6 text-white/92 [text-shadow:0_2px_10px_rgba(2,6,23,0.24)] sm:text-lg sm:leading-7">
            Subimos tu propia app al store, exclusiva para tus servicios y
            productos.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: Smartphone, label: "App propia" },
              { icon: Stethoscope, label: "Tus servicios" },
              { icon: Package, label: "Tus productos" },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(255,255,255,0.8))] py-1.5 pl-1.5 pr-3 text-xs font-bold text-[var(--publisher-app-accent-deep)] shadow-[inset_0_1px_0_white,0_9px_22px_-15px_rgba(3,7,18,0.78)] backdrop-blur-md"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-[linear-gradient(145deg,var(--publisher-app-shine),color-mix(in_srgb,var(--publisher-app-vivid)_32%,white))] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_1px_0_white]">
                  <Icon className="size-3.5" />
                </span>
                {label}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex min-w-28 flex-col justify-center rounded-[22px] border border-white/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,255,255,0.72))] px-4 py-3 text-center text-slate-600 shadow-[inset_0_1px_0_white,0_14px_30px_-20px_rgba(3,7,18,0.78)] backdrop-blur-md">
              <span className="relative mx-auto text-2xl font-black tracking-[-0.04em]">
                99.99
                <span className="absolute left-[-5%] top-1/2 h-0.5 w-[110%] -rotate-6 bg-[var(--publisher-app-pop)] shadow-[0_0_6px_var(--publisher-app-pop)]" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide">
                USD / mes
              </span>
            </div>
            <div className="relative flex min-w-56 items-center gap-3 overflow-hidden rounded-[24px] border border-white/65 bg-[linear-gradient(135deg,var(--publisher-app-vivid),var(--publisher-app-accent)_48%,var(--publisher-app-pop))] px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_0_34px_color-mix(in_srgb,var(--publisher-app-glow)_48%,transparent),0_20px_42px_-18px_rgba(3,7,18,0.7)]">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              <Sparkles className="absolute -right-1 -top-1 size-7 fill-[#FFF3A1] text-[#FFF3A1] opacity-90 drop-shadow-[0_0_8px_rgba(255,240,145,0.85)]" />
              <span className="relative rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-sm">
                Ahora
              </span>
              <span className="relative">
                <span className="block text-4xl font-black leading-none tracking-[-0.05em] [text-shadow:0_3px_8px_rgba(2,6,23,0.35)]">
                  59.99
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide">
                  USD / mes
                </span>
              </span>
            </div>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="relative mx-auto flex h-[365px] w-full max-w-[460px] items-end justify-center sm:h-[410px] lg:h-[420px]"
        >
          <span className="absolute bottom-[12%] left-1/2 h-[68%] w-[68%] -translate-x-1/2 rounded-full bg-[var(--publisher-app-glow)] opacity-45 blur-[62px]" />
          <span className="absolute -bottom-3 left-1/2 z-[4] h-24 w-[88%] -translate-x-1/2 rounded-[50%] border-t-2 border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.36),color-mix(in_srgb,var(--publisher-app-vivid)_30%,rgba(255,255,255,0.08))_46%,rgba(2,6,23,0.18)_100%)] shadow-[inset_0_10px_24px_rgba(255,255,255,0.18),0_22px_38px_-20px_rgba(2,6,23,0.82)] backdrop-blur-sm" />
          <span className="absolute -bottom-2 left-1/2 z-[3] h-16 w-[76%] -translate-x-1/2 rounded-[50%] bg-[var(--publisher-app-vivid)] opacity-45 blur-2xl" />
          <span className="absolute -bottom-1 left-1/2 h-14 w-[82%] -translate-x-1/2 rounded-[50%] bg-slate-950/40 blur-xl" />
          <ServicesPhone />
          <MainPhone organizationName={brandName} />
          <ProductsPhone />
          <span className="absolute left-[7%] top-[18%] z-30 hidden size-14 -rotate-12 items-center justify-center rounded-[20px] border border-white/55 bg-[linear-gradient(145deg,var(--publisher-app-shine),var(--publisher-app-vivid)_48%,var(--publisher-app-accent-deep))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_18px_34px_-16px_rgba(2,6,23,0.8),0_0_22px_color-mix(in_srgb,var(--publisher-app-glow)_46%,transparent)] sm:flex">
            <span className="absolute inset-x-2 top-1.5 h-1/3 rounded-full bg-white/35 blur-sm" />
            <HeartPulse
              className="relative size-7 drop-shadow"
              strokeWidth={2.5}
            />
          </span>
          <span className="absolute right-[8%] top-[9%] z-30 flex size-12 rotate-12 items-center justify-center rounded-[20px] border border-white/55 bg-[linear-gradient(145deg,#fff,var(--publisher-app-shine)_48%,var(--publisher-app-glow))] text-[var(--publisher-app-accent-deep)] shadow-[inset_0_1px_0_white,0_18px_34px_-16px_rgba(2,6,23,0.8),0_0_22px_color-mix(in_srgb,var(--publisher-app-glow)_42%,transparent)] sm:size-14">
            <span className="absolute inset-x-2 top-1.5 h-1/3 rounded-full bg-white/55 blur-sm" />
            <Sparkles className="relative size-6 fill-current drop-shadow" />
          </span>
        </div>
      </div>
      <span className="absolute bottom-4 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(255,255,255,.84))] px-5 py-3 text-sm font-black text-[var(--publisher-app-accent-deep)] shadow-[inset_0_1px_0_white,0_7px_0_color-mix(in_srgb,var(--publisher-app-accent-deep)_70%,#020617),0_18px_36px_-14px_rgba(2,6,23,.86)] backdrop-blur transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[inset_0_1px_0_white,0_10px_0_color-mix(in_srgb,var(--publisher-app-accent-deep)_70%,#020617),0_24px_42px_-14px_rgba(2,6,23,.9)] group-active:translate-y-1 group-active:shadow-[inset_0_1px_0_white,0_3px_0_color-mix(in_srgb,var(--publisher-app-accent-deep)_70%,#020617),0_12px_24px_-14px_rgba(2,6,23,.8)] sm:bottom-6 sm:right-7">
        <Sparkles className="size-4 fill-current" />
        {ctaLabel}
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </article>
  );
}
