/**
 * La lectura de la landing pública de invitación de coach `/f/c/[code]`
 * (gc-fitness#1631).
 *
 * ## Qué lee, y por qué esta vez sí toca `/users`
 *
 * El link lo manda el COACH, por WhatsApp o con un QR, para que alguien se sume como su
 * cliente. La landing tiene que decir de quién es la invitación, y el nombre del coach
 * vive en `users/{coachId}` (un coach no tiene por qué tener perfil social). El Admin
 * SDK pasa por encima de las reglas, así que lo que protege es QUÉ CAMPOS salen de acá:
 * sólo `displayName` y una foto `https` servible — nunca el mail, el plan ni nada más.
 * Y sólo de un uid que figura como `coachId` de una invitación ACTIVA, o sea alguien
 * que eligió publicar ese link; no sirve para leer un uid cualquiera.
 *
 * ## Inexistente, revocada o de alguien que ya no es coach ⇒ `null`
 *
 * Las tres comparten el 404, como las landings hermanas: un link rotado ("Generar un
 * link nuevo") tiene que dejar de mostrar al coach, que es justo para lo que se rota.
 *
 * No es un archivo `"use server"`: funciones comunes que llama un Server Component.
 */
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { servablePhotoUrl } from "./public-profile";

export interface PublicCoachInvite {
  code: string;
  coachName: string;
  /** Sólo una URL `https` servible; un path de Storage cae a iniciales. */
  coachPhotoUrl: string | null;
}

/** Mismo alfabeto que genera `coachGetInviteLink` (sin 0/1/i/l/o), pero tolerante al largo. */
const CODE_RE = /^[a-z0-9]{4,40}$/;

export async function readCoachInvite(rawCode: string): Promise<PublicCoachInvite | null> {
  const code = (rawCode ?? "").trim().toLowerCase();
  // Un id con barra o reservado (`/^__.*__$/`) haría THROW en `.doc()` → 500. La regex
  // los descarta a los dos.
  if (!CODE_RE.test(code)) return null;

  const db = gcFitnessFirestore();
  const invite = await db.collection("coach_invite_links").doc(code).get();
  if (!invite.exists) return null;
  if (invite.get("active") !== true) return null;
  const coachId = invite.get("coachId");
  if (typeof coachId !== "string" || !coachId || coachId.includes("/")) return null;

  const coach = await db.collection("users").doc(coachId).get();
  if (!coach.exists) return null;
  // Un coach dado de baja (#1660) o una cuenta que volvió a ser cliente ya no puede
  // recibir a nadie: `acceptCoachInvite` lo va a rechazar, la landing no lo promete.
  // (`role` puede faltar en un doc de admin-coach viejo; sólo `client` descarta.)
  if (coach.get("role") === "client" || coach.get("coachDisabled") === true) return null;

  const rawName = coach.get("displayName");
  const coachName = typeof rawName === "string" && rawName.trim() ? rawName.trim() : "Tu coach";

  return { code, coachName, coachPhotoUrl: servablePhotoUrl(coach.get("photoURL")) };
}
