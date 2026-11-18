"use client";

// gc-fitness #1695 — pestaña «Tablero» de /payments. Carga sus datos AL ABRIRSE (Radix monta
// el contenido de una pestaña sólo cuando está activa), así la página de Pagos no paga la
// query de 15 meses si el coach no mira el tablero. Una sola Server Action
// (`getBillingDashboardData`, archivo propio) trae el tablero ya calculado por el gemelo
// `billing-dashboard.ts` + los pagos de la ventana para «Facturación».

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { getBillingDashboardData, type BillingDashboardData } from "@/lib/gc-fitness/billing-dashboard-actions";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";

import { BillingDashboardView } from "./BillingDashboardView";
import { BillingLedger } from "./BillingLedger";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: BillingDashboardData };

export function DashboardTab() {
  const t = useTranslations("payments.dashboard");
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const result = await getBillingDashboardData();
      setState(result.ok ? { kind: "ready", data: result.data } : { kind: "error" });
    } catch (err) {
      noteIfStaleDeployment(err);
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <p className="p-6 text-sm text-muted-foreground" data-testid="billing-dashboard-loading">
        {t("loading")}
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex items-center gap-3 p-6 text-sm" data-testid="billing-dashboard-error">
        <span className="text-muted-foreground">{t("error")}</span>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  const { data } = state;
  return (
    <div className="flex flex-col gap-6">
      {data.truncated ? <p className="text-sm text-muted-foreground">{t("truncated")}</p> : null}
      <BillingDashboardView dashboard={data.dashboard} />
      <BillingLedger payments={data.payments} clients={data.clients} todayCivil={data.todayCivil} />
    </div>
  );
}
