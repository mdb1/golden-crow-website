"use client";

// gc-fitness #1540 — /gc-fitness/payments: tres pestañas (Cobros · Planes · Historial).

import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PaymentPlan, PaymentsPage } from "@/lib/gc-fitness/payments-model";

import { CollectionsTab } from "./CollectionsTab";
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
      <TabsList>
        <TabsTrigger value="collections">{t("collections.title")}</TabsTrigger>
        <TabsTrigger value="plans">{t("plans.title")}</TabsTrigger>
        <TabsTrigger value="history">{t("history.title")}</TabsTrigger>
      </TabsList>
      <TabsContent value="collections">
        <CollectionsTab rows={rows} plans={plans} collected={collected} coachName={coachName} todayCivil={todayCivil} />
      </TabsContent>
      <TabsContent value="plans">
        <PlansTab plans={plans} />
      </TabsContent>
      <TabsContent value="history">
        <PaymentHistory initialPage={history} clients={clients} />
      </TabsContent>
    </Tabs>
  );
}
