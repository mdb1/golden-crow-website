/**
 * `https://fit.goldencrowvs.com/f/u/{uid}` — la landing del link de PERFIL
 * compartido (#1184 / SV2-4, decisión D-6). Gemela de `/f/r/[routineId]`.
 *
 * ## Qué hace esta página, y qué NO hace
 *
 * Con la app instalada, nadie la ve: el AASA y `assetlinks.json` cubren `/f/*`, así
 * que iOS y Android se quedan el link y lo rutean al perfil social (`/f/u/{uid}` ⇒
 * `socialProfile(uid)` en los dos routers desde S6). Existe para la preview del chat
 * (OG tags), para alguien sin la app, y para un navegador de escritorio.
 *
 * ## Es pública, y por eso lee `social_profiles` y `public_routines`, NADA más
 *
 * El Admin SDK pasa por encima de las reglas, así que la protección viene de la
 * COLECCIÓN: nunca `/users` (mail, coach, plan). Ver `@/lib/gc-fitness/public-profile`.
 *
 * ## Perfil privado ⇒ la misma cara que ve un desconocido en la app
 *
 * Nombre, @handle, foto, "Perfil privado" y los botones. Ni bio, ni contadores, ni
 * rutinas — tampoco en las OG tags, que son lo que más gente lee.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  profileInitials,
  readProfileRoutines,
  readPublicProfile,
  type PublicProfile,
} from "@/lib/gc-fitness/public-profile";
import {
  profileAppSchemeUrl,
  profileShareUrl,
} from "@/lib/gc-fitness/social-share-link";

import { SharedLinkActions } from "../../shared-link-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ uid: string }>;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function metadataDescription(profile: PublicProfile): string {
  if (profile.isPrivate) return `Seguí a @${profile.handle} en GC Fitness.`;
  if (profile.bio) return profile.bio;
  return `Seguí a @${profile.handle} en GC Fitness — ${plural(
    profile.publicRoutineCount ?? 0,
    "rutina pública",
    "rutinas públicas",
  )}.`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { uid } = await params;
  const profile = await readPublicProfile(uid);
  if (!profile) {
    return { title: "GC Fitness" };
  }

  const title = `${profile.displayName} (@${profile.handle}) · GC Fitness`;
  const description = metadataDescription(profile);

  // Sin OG tags, el link llega a WhatsApp como una URL cruda y nadie lo toca.
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: profileShareUrl(profile.uid) ?? undefined,
      images: profile.photoUrl ? [{ url: profile.photoUrl }] : undefined,
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function SharedProfilePage({ params }: PageProps) {
  const { uid } = await params;
  const profile = await readPublicProfile(uid);
  // Inexistente, suspendido o sin handle comparten el 404, igual que en /f/r:
  // distinguirlos le diría a un desconocido si un uid existe o si fue moderado.
  if (!profile) notFound();

  const routines = profile.isPrivate ? [] : await readProfileRoutines(profile.uid);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-5 py-10">
      <header className="flex items-center gap-4">
        {profile.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa, sin next/image configurado para ese host
          <img
            src={profile.photoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xl font-semibold text-neutral-600"
          >
            {profileInitials(profile.displayName, profile.handle)}
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {profile.displayName}
          </h1>
          <p className="truncate text-sm text-neutral-500">@{profile.handle}</p>
        </div>
      </header>

      {profile.isPrivate ? (
        <p className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-600">
          <strong className="font-semibold">Perfil privado.</strong> Abrí GC Fitness para
          pedir seguir a @{profile.handle}.
        </p>
      ) : (
        <section className="flex flex-col gap-2">
          {profile.bio ? <p className="text-sm text-neutral-700">{profile.bio}</p> : null}
          <p className="text-sm text-neutral-500">
            {plural(profile.followerCount ?? 0, "seguidor", "seguidores")} ·{" "}
            {plural(profile.publicRoutineCount ?? 0, "rutina pública", "rutinas públicas")}
          </p>
        </section>
      )}

      <SharedLinkActions
        appUrl={profileAppSchemeUrl(profile.uid)}
        webUrl={profileShareUrl(profile.uid)}
      />

      {routines.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-700">Rutinas</h2>
          {routines.map((routine) => (
            <Link
              key={routine.templateId}
              href={`/f/r/${encodeURIComponent(routine.templateId)}`}
              className="flex items-baseline justify-between gap-4 rounded-xl border border-neutral-200 px-4 py-3 hover:bg-neutral-50"
            >
              <span className="truncate text-sm font-medium">{routine.name}</span>
              <span className="shrink-0 text-sm text-neutral-500">
                {plural(routine.exerciseCount, "ejercicio", "ejercicios")}
                {routine.estimatedMinutes ? ` · ~${routine.estimatedMinutes} min` : ""}
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </main>
  );
}
