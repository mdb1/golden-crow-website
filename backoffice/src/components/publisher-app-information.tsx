import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, Clock3, ExternalLink, Mail, Smartphone, Store } from "lucide-react";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Button } from "@/components/ui/button";
import { publisherAppStatusLabel, type PublisherAppConfig } from "@/lib/publisher-app-config";
import { PUBLISHER_PORTAL_HOME_ROUTE } from "@/lib/publisher-portal-routes";

const SUPPORT_EMAIL = "support@goldencrowvs.com";
const APPLE_DUNS_GUIDE = "https://developer.apple.com/help/account/membership/D-U-N-S/";

function InformationFrame({ config, title, icon, children }: {
  config: PublisherAppConfig;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5 pb-8">
      <Button variant="ghost" size="sm" asChild>
        <Link href={PUBLISHER_PORTAL_HOME_ROUTE} prefetch={false}>
          <ArrowLeft className="size-4" /> Volver al inicio
        </Link>
      </Button>
      <div className="overflow-hidden rounded-[28px] border border-violet-100 bg-card shadow-[0_24px_64px_-44px_rgba(109,40,217,0.4)] dark:border-violet-400/20">
        <header className="flex items-start justify-between gap-4 border-b border-violet-100 bg-violet-50/60 px-5 py-6 sm:px-7 dark:border-violet-400/15 dark:bg-violet-500/8">
          <div className="flex min-w-0 gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">{icon}</span>
            <div className="min-w-0">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1 break-words text-sm text-muted-foreground">{config.publisherName}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100">{publisherAppStatusLabel(config.status)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1"><Smartphone className="size-3.5" />{config.platformOption === "ios_android" ? "iOS + Android · 2 plataformas" : "iOS · 1 plataforma"}</span>
              </div>
            </div>
          </div>
          <HeaderUnclutterButton />
        </header>
        <div className="space-y-6 p-5 sm:p-7">{children}</div>
      </div>
    </section>
  );
}

function SupportContact({ config, topic }: { config: PublisherAppConfig; topic: "pago" | "publicación" }) {
  const subject = `Consulta de ${topic} · ${config.publisherName}`;
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5 dark:border-violet-400/25 dark:bg-violet-500/10">
      <h2 className="font-heading text-lg font-semibold">Coordiná con nuestro equipo</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Escribinos a <a className="break-all font-semibold text-violet-700 underline underline-offset-4 dark:text-violet-200" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{" "}
        {topic === "pago" ? "y te indicaremos cómo realizar el pago y los próximos pasos." : "para consultar el estado de la publicación y recibir ayuda con los próximos pasos."}
      </p>
      <Button asChild size="lg" className="mt-4 h-auto min-h-12 w-full whitespace-normal rounded-xl bg-violet-600 px-5 py-3 text-center text-white hover:bg-violet-700 sm:w-auto">
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`}><Mail className="size-4 shrink-0" /> Contactar a soporte</a>
      </Button>
    </div>
  );
}

export function PublisherAppPaymentDetails({ config }: { config: PublisherAppConfig }) {
  const platformCount = config.platformOption === "ios_android" ? 2 : 1;
  const price = (perPlatform: number) => (perPlatform * platformCount).toFixed(2).replace(".", ",");
  return (
    <InformationFrame config={config} title="Completar información de pago" icon={<Store className="size-6" />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border bg-background p-5">
          <Store className="size-5 text-violet-600 dark:text-violet-300" />
          <h2 className="mt-4 text-sm font-semibold text-muted-foreground">Alta inicial en stores</h2>
          <p className="mt-2 font-heading text-3xl font-bold">USD {price(139.99)}</p>
          <p className="mt-1 text-sm font-semibold">Pago único</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">USD 139,99 por plataforma · {platformCount === 2 ? "App Store y Google Play" : "App Store"}.</p>
        </article>
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-400/25 dark:bg-emerald-500/8">
          <CalendarDays className="size-5 text-emerald-700 dark:text-emerald-300" />
          <h2 className="mt-4 text-sm font-semibold text-muted-foreground">Suscripción mensual</h2>
          <p className="mt-2 font-heading text-3xl font-bold">USD {price(59.99)} <span className="text-base font-medium text-muted-foreground">/ mes</span></p>
          <p className="mt-1 text-sm font-semibold">Durante los primeros 6 meses</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">USD 59,99 por plataforma al mes. Desde el mes 7: USD {price(99.99)} al mes en total.</p>
        </article>
      </div>
      <SupportContact config={config} topic="pago" />
    </InformationFrame>
  );
}

export function PublisherAppUploadBuildDetails({ config }: { config: PublisherAppConfig }) {
  return (
    <InformationFrame config={config} title="Consultar estado de publicación" icon={<Store className="size-6" />}>
      <div className="flex items-start gap-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-5 dark:border-sky-400/25 dark:bg-sky-500/8">
        <Clock3 className="mt-0.5 size-6 shrink-0 text-sky-700 dark:text-sky-300" />
        <div>
          <h2 className="font-heading text-lg font-semibold">Preparación y publicación</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">La preparación de las cuentas, las verificaciones y la coordinación de la publicación pueden llevar hasta 3 semanas. Es una estimación del proceso completo: los tiempos de Apple, Dun &amp; Bradstreet y las tiendas pueden variar y extenderse.</p>
        </div>
      </div>
      <div>
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><Building2 className="size-5 text-violet-600 dark:text-violet-300" /> Prepará tu organización para Apple</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Apple solicita un número D-U-N-S para verificar la identidad legal de las organizaciones. La inscripción como persona individual no requiere D-U-N-S.</p>
        <ol className="mt-4 space-y-4">
          {[
            ["Buscá tu organización", "Consultá en la guía de Apple si tu entidad ya tiene un número D-U-N-S asignado."],
            ["Solicitá el número si todavía no existe", "Desde la consulta de Apple podés solicitarlo gratis a Dun & Bradstreet. Prepará la razón social, las direcciones, el contacto laboral y la documentación de registro de la entidad."],
            ["Completá la verificación y la inscripción", "Dun & Bradstreet puede pedir documentación adicional. Cuando recibas el número y Apple tenga la información actualizada, continuá la inscripción de tu organización en Apple Developer."],
          ].map(([title, description], index) => (
            <li key={title} className="flex gap-3 rounded-2xl border bg-background p-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">{index + 1}</span>
              <div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>
            </li>
          ))}
        </ol>
        <a href={APPLE_DUNS_GUIDE} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 underline underline-offset-4 dark:text-violet-200">Consultar la guía oficial de Apple <ExternalLink className="size-4" /></a>
        {config.platformOption === "ios_android" ? <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-muted-foreground"><CheckCircle2 className="mt-1 size-4 shrink-0" /> Esta guía D-U-N-S corresponde a Apple. La publicación en Google Play se coordina por separado con nuestro equipo.</p> : null}
      </div>
      <SupportContact config={config} topic="publicación" />
    </InformationFrame>
  );
}
