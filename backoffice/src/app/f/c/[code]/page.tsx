/**
 * `https://fit.goldencrowvs.com/f/c/{code}` — la landing del link de INVITACIÓN de un
 * coach (gc-fitness#1631). Gemela de `/f/u/[uid]` y `/f/r/[routineId]`.
 *
 * Con la app instalada nadie la ve: el AASA y `assetlinks.json` cubren `/f/*`, y las dos
 * apps rutean `/f/c/{code}` a la hoja «Invitación de coach». Existe para la preview de
 * WhatsApp (OG tags), para alguien sin la app y para un navegador de escritorio.
 *
 * Sin la app, el botón de la tienda RECUERDA el link (#1643): en Android va en el
 * `referrer` de Play, en iOS se copia al portapapeles (ver `SharedLinkActions`).
 *
 * Inexistente, revocada o de un coach dado de baja comparten el 404 (ver
 * `@/lib/gc-fitness/public-coach-invite`).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { readCoachInvite } from "@/lib/gc-fitness/public-coach-invite";
import { profileInitials } from "@/lib/gc-fitness/public-profile";
import {
  coachInviteAppSchemeUrl,
  coachInviteUrl,
} from "@/lib/gc-fitness/social-share-link";

import { SharedLinkActions } from "../../shared-link-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const invite = await readCoachInvite(code);
  if (!invite) return { title: "Corvo" };

  const title = `${invite.coachName} te invitó a entrenar en Corvo`;
  const description = `Sumate como cliente de ${invite.coachName}: tus entrenamientos, hábitos y progreso, con tu coach.`;
  return {
    title,
    description,
    // Una invitación no es contenido para indexar: el link es del coach y de su gente.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
      url: coachInviteUrl(invite.code) ?? undefined,
      images: invite.coachPhotoUrl ? [{ url: invite.coachPhotoUrl }] : undefined,
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function CoachInvitePage({ params }: PageProps) {
  const { code } = await params;
  const invite = await readCoachInvite(code);
  if (!invite) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-5 py-10">
      <header className="flex items-center gap-4">
        {invite.coachPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa, sin next/image configurado para ese host
          <img
            src={invite.coachPhotoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xl font-semibold text-neutral-600"
          >
            {profileInitials(invite.coachName, invite.coachName)}
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <p className="text-sm text-neutral-500">Invitación de coach</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {invite.coachName} te invitó a ser su cliente
          </h1>
        </div>
      </header>

      <p className="text-sm text-neutral-700">
        Con Corvo, tu coach te asigna entrenamientos, hábitos y nutrición, y ve tu progreso.
        Abrí el link en Corvo y aceptá la invitación.
      </p>

      <SharedLinkActions
        appUrl={coachInviteAppSchemeUrl(invite.code)}
        webUrl={coachInviteUrl(invite.code)}
      />
    </main>
  );
}
