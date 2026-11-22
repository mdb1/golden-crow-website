// client-doc-read.ts — golden-crow-website#535: ONE read of `users/{clientId}`
// per server render.
//
// The client profile page and the loaders it calls each re-read the client's
// user doc as their ownership gate (the page, calendar peek, photos, exercise
// progress, personal records…): ~7 reads of the same doc per page load. React's
// `cache` memoizes per request on the server, so every gate below shares the
// first read; outside a server render (a Server Action called from the browser,
// jest) it is a plain call. Read-only use only — never cache across a write.
//
// Plain module (no "use server"): importing it from a "use server" file does not
// create a new Server Action.

import { cache } from "react";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "./collections";

export const readClientUserDoc = cache((clientId: string) =>
  gcFitnessFirestore().collection(FirestoreCollections.users).doc(clientId).get(),
);
