"use client";

// use-coach-payment-details.ts — gc-fitness #1697: los «Datos de cobro» del coach del lado del
// navegador. Una sola lectura por pestaña (la comparten todas las filas de Cobros, que montan
// un `ClientPaymentActions` cada una) y sólo cuando un diálogo la necesita; el editor la
// actualiza al guardar, así que un «Aviso de pago» abierto después ya sale con lo nuevo.

import { useEffect, useState } from "react";

import { getCoachPaymentDetails } from "./payment-details-actions";

type State = { loaded: boolean; value: string | null };

let current: State = { loaded: false, value: null };
let inflight: Promise<void> | null = null;
const listeners = new Set<(s: State) => void>();

function publish(next: State) {
  current = next;
  for (const l of listeners) l(next);
}

function load(): Promise<void> {
  if (current.loaded) return Promise.resolve();
  if (!inflight) {
    inflight = getCoachPaymentDetails()
      .then((value) => publish({ loaded: true, value }))
      .catch(() => publish({ loaded: true, value: null }))
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Lo que guardó el editor (o null al borrarlo): todos los diálogos lo ven al toque. */
export function setCoachPaymentDetailsCache(value: string | null) {
  publish({ loaded: true, value });
}

/** Sólo para tests. */
export function resetCoachPaymentDetailsCache() {
  current = { loaded: false, value: null };
  inflight = null;
}

/** `enabled` = algún diálogo abierto; hasta entonces no se lee nada. */
export function useCoachPaymentDetails(enabled: boolean): State {
  const [state, setState] = useState<State>(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  useEffect(() => {
    if (enabled) void load();
  }, [enabled]);
  return state;
}
