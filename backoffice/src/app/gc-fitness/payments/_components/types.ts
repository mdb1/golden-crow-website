// gc-fitness #1540 — filas que el servidor arma para la UI de pagos (serializables).

import type { BillingStatus } from "@/lib/gc-fitness/billing";
import type { ClientBillingView } from "@/lib/gc-fitness/payments-model";

export interface CollectionRow {
  clientId: string;
  /** Nombre visible para el coach (apodo si lo tiene). */
  name: string;
  /** Para el saludo del recordatorio («Hola Juan!»). */
  firstName: string;
  billing: ClientBillingView | null;
  status: BillingStatus;
}

export interface ClientOption {
  id: string;
  name: string;
}
