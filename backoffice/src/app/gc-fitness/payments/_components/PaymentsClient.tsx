"use client";

// gc-fitness #1540 — /gc-fitness/payments: Cobros · Planes · Historial, y #1695 el Tablero
// (métricas, proyecciones y Facturación; carga sus datos sólo al abrirse).

import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PaymentPlan, PaymentsPage } from "@/lib/gc-fitness/payments-model";

import { CollectionsTab } from "./CollectionsTab";
import { DashboardTab } from "./DashboardTab";
import { PaymentDetailsEditor } from "./PaymentDetailsEditor";
import { PaymentHistory } from "./PaymentHistory";
import { PlansTab } from "./PlansTab";
import type { ClientOption, CollectionRow } from "./types";

interface Props {
  rows: CollectionRow[];
  plans: PaymentPlan[];
  collected: Array<{ currency: string; amount: number }>;
  coachName: string;
  todayCivil: string;
  history: PaymentsPage;
  clients: ClientOption[];
}

export function PaymentsClient({ rows, plans, collected, coachName, todayCivil, history, clients }: Props) {
  const t = useTranslations("payments");
  return (
    <Tabs defaultValue="collections" className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="dashboard" data-testid="payments-tab-dashboard">
            {t("dashboard.tab")}
          </TabsTrigger>
          <TabsTrigger value="collections">{t("collections.title")}</TabsTrigger>
          <TabsTrigger value="plans">{t("plans.title")}</TabsTrigger>
          <TabsTrigger value="history">{t("history.title")}</TabsTrigger>
        </TabsList>
        {/* #1697 — «Datos de cobro», lo que sale en el aviso de pago y en el recordatorio. */}
        <PaymentDetailsEditor />
      </div>
      <TabsContent value="collections">
        <CollectionsTab rows={rows} plans={plans} collected={collected} coachName={coachName} todayCivil={todayCivil} />
      </TabsContent>
      <TabsContent value="plans">
        <PlansTab plans={plans} />
      </TabsContent>
      <TabsContent value="history">
        <PaymentHistory initialPage={history} clients={clients} />
      </TabsContent>
      <TabsContent value="dashboard">
        <DashboardTab />
      </TabsContent>
    </Tabs>
  );
}
