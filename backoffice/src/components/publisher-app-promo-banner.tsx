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
};

type RGB = {
  red: number;
  green: number;
  blue: number;
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

function mixColors(source: string, target: string, targetWeight: number) {
  const sourceRgb = hexToRgb(source);
  const targetRgb = hexToRgb(target);
  const channel = (sourceValue: number, targetValue: number) =>
    Math.round(sourceValue * (1 - targetWeight) + targetValue * targetWeight);

  return `rgb(${channel(sourceRgb.red, targetRgb.red)} ${channel(sourceRgb.green, targetRgb.green)} ${channel(sourceRgb.blue, targetRgb.blue)})`;
}

function rgba(value: string, alpha: number) {
  const { red, green, blue } = hexToRgb(value);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function compactBrandName(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 22) {
    return trimmed;
  }

  return `${trimmed.slice(0, 21).trimEnd()}…`;
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
        <span className="flex size-5 shrink-0 items-center justify-center rounded-[7px] bg-[var(--publisher-app-accent)] text-white shadow-sm">
          <HeartPulse className="size-3" strokeWidth={2.6} />
        </span>
        <span className="truncate text-[10px] font-black tracking-tight text-slate-950">
          {compactBrandName(name)}
        </span>
      </div>
      <Bell className="size-3 text-slate-600" />
    </div>
  );
}

function MainPhone({ organizationName }: { organizationName: string }) {
  const cards = [
    { icon: Stethoscope, label: "Mis servicios" },
    { icon: ShoppingBag, label: "Productos" },
  ];

  return (
    <div className="relative z-20 w-[184px] rotate-[2deg] rounded-[35px] border-[5px] border-slate-900 bg-slate-950 p-[3px] shadow-[0_30px_50px_-18px_rgba(15,23,42,0.78)] sm:w-[206px] lg:w-[220px]">
      <div className="relative aspect-[9/18.5] overflow-hidden rounded-[27px] bg-[linear-gradient(180deg,#fff_0%,#fff8fb_58%,#f7f1ff_100%)] px-3 pb-3 pt-3">
        <span className="absolute left-1/2 top-1.5 h-3.5 w-12 -translate-x-1/2 rounded-full bg-slate-950" />
        <PhoneStatusBar />
        <PhoneBrand name={organizationName} />

        <div className="relative mt-3 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--publisher-app-accent-deep),var(--publisher-app-accent)_58%,var(--publisher-app-accent-light))] p-3 text-white shadow-[0_10px_22px_-12px_rgba(15,23,42,0.7)]">
          <span className="absolute -right-3 -top-5 size-16 rounded-full border-[12px] border-white/10" />
          <p className="relative text-[7px] font-bold uppercase tracking-[0.16em] text-white/75">
            Para tu comunidad
          </p>
          <p className="relative mt-1 text-[14px] font-black leading-[0.95]">
            Todo tu mundo,
            <br />
            en una app
          </p>
          <Crown className="absolute bottom-2 right-2 size-6 text-white/90" />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {cards.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200/90 bg-white/90 p-2 shadow-[0_6px_14px_-10px_rgba(15,23,42,0.6)]"
            >
              <Icon className="size-4 text-[var(--publisher-app-accent)]" />
              <p className="mt-2 text-[7px] font-extrabold text-slate-900">
                {label}
              </p>
              <span className="mt-1 block h-1 w-8 rounded-full bg-slate-200" />
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white/90 p-2 shadow-[0_6px_14px_-10px_rgba(15,23,42,0.6)]">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--publisher-app-accent)_12%,white)] text-[var(--publisher-app-accent)]">
            <CalendarDays className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[7px] font-extrabold text-slate-900">
              Turnos online
            </span>
            <span className="mt-1 block h-1 w-12 rounded-full bg-slate-200" />
          </span>
          <ChevronRight className="size-3 text-[var(--publisher-app-accent)]" />
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-center justify-around rounded-xl border border-white/80 bg-white/90 py-2 shadow-[0_8px_20px_-14px_rgba(15,23,42,0.65)]">
          <HeartPulse className="size-3.5 text-[var(--publisher-app-accent)]" />
          <Package className="size-3.5 text-slate-400" />
          <UsersRound className="size-3.5 text-slate-400" />
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
    <div className="absolute bottom-1 left-0 z-10 hidden w-[168px] -rotate-[8deg] rounded-[31px] border-[5px] border-slate-900 bg-slate-950 p-[3px] shadow-[0_24px_45px_-20px_rgba(15,23,42,0.8)] sm:block lg:left-1 lg:w-[180px]">
      <div className="relative aspect-[9/18.5] overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,#fff_0%,#fff8fb_100%)] px-3 pt-3">
        <span className="absolute left-1/2 top-1.5 h-3 w-10 -translate-x-1/2 rounded-full bg-slate-950" />
        <PhoneStatusBar />
        <p className="mt-7 text-[11px] font-black text-slate-950">Mis servicios</p>
        <div className="mt-3 space-y-2">
          {services.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-2 shadow-[0_6px_14px_-10px_rgba(15,23,42,0.55)]"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--publisher-app-accent)_12%,white)] text-[var(--publisher-app-accent)]">
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[7px] font-bold text-slate-900">
                  {label}
                </span>
                <span className="mt-1 block h-1 w-11 rounded-full bg-slate-200" />
              </span>
              <ChevronRight className="size-3 text-slate-500" />
            </div>
          ))}
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
    <div className="absolute bottom-2 right-0 z-10 hidden w-[168px] rotate-[9deg] rounded-[31px] border-[5px] border-slate-900 bg-slate-950 p-[3px] shadow-[0_24px_45px_-20px_rgba(15,23,42,0.8)] sm:block lg:right-1 lg:w-[180px]">
      <div className="relative aspect-[9/18.5] overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,#fff_0%,#fff8fb_100%)] px-3 pt-3">
        <span className="absolute left-1/2 top-1.5 h-3 w-10 -translate-x-1/2 rounded-full bg-slate-950" />
        <PhoneStatusBar />
        <p className="mt-7 text-[11px] font-black text-slate-950">Productos</p>
        <div className="mt-3 space-y-2">
          {products.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-2 shadow-[0_6px_14px_-10px_rgba(15,23,42,0.55)]"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--publisher-app-accent)_12%,white)] text-[var(--publisher-app-accent)]">
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[7px] font-bold text-slate-900">
                  {label}
                </span>
                <span className="mt-1 block h-1 w-10 rounded-full bg-slate-200" />
              </span>
              <ChevronRight className="size-3 text-slate-500" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PublisherAppPromoBanner({
  organizationName,
  organizationTint,
}: PublisherAppPromoBannerProps) {
  const brandName = organizationName.trim() || "tu organización";
  const accent = normalizedHexColor(organizationTint);
  const accentDeep = mixColors(accent, "#07111F", 0.48);
  const accentLight = mixColors(accent, "#FFFFFF", 0.24);
  const bannerStyle = {
    "--publisher-app-accent": accent,
    "--publisher-app-accent-deep": accentDeep,
    "--publisher-app-accent-light": accentLight,
    backgroundImage: [
      "radial-gradient(circle at 82% 14%, rgba(255,255,255,0.25) 0 8%, transparent 8.2%)",
      `radial-gradient(circle at 96% 72%, ${rgba(accent, 0.62)} 0 12%, transparent 12.2%)`,
      `linear-gradient(135deg, ${accentDeep} 0%, ${accent} 48%, ${accentLight} 100%)`,
    ].join(", "),
  } as CSSProperties;

  return (
    <article
      data-testid="publisher-app-banner"
      data-accent={accent}
      style={bannerStyle}
      className="relative isolate overflow-hidden rounded-[28px] border border-white/20 text-white shadow-[0_28px_80px_-42px_rgba(15,23,42,0.85)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full border-[46px] border-white/[0.07]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[46%] top-12 hidden size-3 rotate-12 rounded-[3px] bg-white/60 shadow-[90px_38px_0_-2px_rgba(255,255,255,0.46),45px_190px_0_-1px_rgba(255,255,255,0.38)] lg:block"
      />

      <div className="relative grid min-h-[510px] items-center gap-8 px-5 py-7 sm:px-8 sm:py-9 lg:min-h-[478px] lg:grid-cols-[minmax(0,0.93fr)_minmax(440px,1.07fr)] lg:gap-5 lg:px-10 lg:py-10">
        <div className="relative z-20 min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/90 px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--publisher-app-accent-deep)] shadow-sm backdrop-blur-sm">
            <Crown className="size-4 fill-current" />
            Servicio destacado
          </div>

          <h3 className="mt-5 max-w-xl font-heading text-[clamp(2.65rem,7vw,4.9rem)] font-black leading-[0.84] tracking-[-0.06em] [text-shadow:0_4px_18px_rgba(15,23,42,0.2)]">
            La app de
            <span className="mt-2 block break-words text-white/95">
              {brandName}
            </span>
          </h3>

          <p className="mt-5 max-w-lg text-base font-medium leading-6 text-white/88 sm:text-lg sm:leading-7">
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
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/90 px-3 py-2 text-xs font-bold text-[var(--publisher-app-accent-deep)] shadow-sm backdrop-blur-sm"
              >
                <Icon className="size-3.5 text-[var(--publisher-app-accent)]" />
                {label}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-stretch gap-3">
            <div className="flex min-w-28 flex-col justify-center rounded-2xl border border-white/35 bg-white/88 px-4 py-3 text-center text-slate-600 shadow-sm backdrop-blur-sm">
              <span className="relative mx-auto text-2xl font-black tracking-[-0.04em]">
                99.99
                <span className="absolute left-[-5%] top-1/2 h-0.5 w-[110%] -rotate-6 bg-rose-500" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide">
                USD / mes
              </span>
            </div>
            <div className="flex min-w-52 items-center gap-3 rounded-2xl border border-white/35 bg-white/94 px-4 py-3 text-[var(--publisher-app-accent-deep)] shadow-[0_16px_35px_-18px_rgba(15,23,42,0.65)] backdrop-blur-sm">
              <span className="rounded-full bg-[var(--publisher-app-accent)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                Ahora
              </span>
              <span>
                <span className="block text-4xl font-black leading-none tracking-[-0.05em]">
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
          <span className="absolute bottom-0 left-1/2 h-14 w-[82%] -translate-x-1/2 rounded-[50%] bg-slate-950/25 blur-lg" />
          <ServicesPhone />
          <MainPhone organizationName={brandName} />
          <ProductsPhone />
          <span className="absolute right-[8%] top-[9%] z-30 flex size-12 rotate-12 items-center justify-center rounded-2xl border border-white/35 bg-white/90 text-[var(--publisher-app-accent)] shadow-[0_16px_30px_-14px_rgba(15,23,42,0.75)] sm:size-14">
            <Sparkles className="size-6 fill-current" />
          </span>
        </div>
      </div>
    </article>
  );
}
