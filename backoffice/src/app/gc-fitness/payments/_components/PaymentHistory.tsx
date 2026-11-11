"use client";

// gc-fitness #1540 — historial de pagos (pestaña «Historial» y `clients/[id]/pagos`).
// Filtros por mes / alumno / medio, «Cargar más» (cursor por fecha, 20 por página),
// anular con confirmación (queda como «Anulado») y exportar CSV de lo filtrado.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, Ban } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/gc-fitness/billing";
import {
  listClientPayments,
  listClientPaymentsForExport,
  voidClientPayment,
} from "@/lib/gc-fitness/payments-actions";
import {
  buildPaymentsCsv,
  type ClientPaymentView,
  type PaymentsPage,
} from "@/lib/gc-fitness/payments-model";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";
import { cn } from "@/lib/utils";

import { SELECT_CLASS, usePaymentLabels } from "./payment-labels";
import type { ClientOption } from "./types";

interface Props {
  initialPage: PaymentsPage;
  clients: ClientOption[];
  /** En la ficha del alumno: historial fijo de ese alumno (sin filtro ni columna). */
  fixedClientId?: string;
}

interface Filters {
  clientId: string;
  month: string;
  method: PaymentMethod | "";
}

export function PaymentHistory({ initialPage, clients, fixedClientId }: Props) {
  const t = useTranslations("payments");
  const labels = usePaymentLabels();
  const router = useRouter();
  const [rows, setRows] = useState<ClientPaymentView[]>(initialPage.payments);
  const [cursor, setCursor] = useState<string | null>(initialPage.nextCursor);
  const [filters, setFilters] = useState<Filters>({ clientId: fixedClientId ?? "", month: "", method: "" });
  const [toVoid, setToVoid] = useState<ClientPaymentView | null>(null);
  const [reason, setReason] = useState("");
  const [loading, startLoading] = useTransition();
  const [voiding, startVoiding] = useTransition();
  const [exporting, startExporting] = useTransition();

  const names = new Map(clients.map((c) => [c.id, c.name]));
  const nameOf = (id: string) => names.get(id) ?? id;

  function query(f: Filters, nextCursor: string | null) {
    return {
      clientId: f.clientId || null,
      month: f.month || null,
      method: f.method || null,
      cursor: nextCursor,
    };
  }

  function applyFilters(next: Filters) {
    setFilters(next);
    startLoading(async () => {
      try {
        const page = await listClientPayments(query(next, null));
        setRows(page.payments);
        setCursor(page.nextCursor);
      } catch (err) {
        if (!noteIfStaleDeployment(err)) toast.error(t("errorGeneric"));
      }
    });
  }

  function loadMore() {
    startLoading(async () => {
      try {
        const page = await listClientPayments(query(filters, cursor));
        setRows((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...page.payments.filter((p) => !seen.has(p.id))];
        });
        setCursor(page.nextCursor);
      } catch (err) {
        if (!noteIfStaleDeployment(err)) toast.error(t("errorGeneric"));
      }
    });
  }

  function confirmVoid() {
    const target = toVoid;
    if (!target) return;
    startVoiding(async () => {
      try {
        const result = await voidClientPayment({ paymentId: target.id, reason });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setRows((prev) =>
          prev.map((p) =>
            p.id === target.id ? { ...p, voidedAt: new Date().toISOString(), voidReason: reason.trim() || null } : p,
          ),
        );
        setToVoid(null);
        setReason("");
        toast.success(t("void.done"));
        router.refresh();
      } catch (err) {
        if (!noteIfStaleDeployment(err)) toast.error(t("errorGeneric"));
      }
    });
  }

  function exportCsv() {
    startExporting(async () => {
      try {
        const all = await listClientPaymentsForExport(query(filters, null));
        const csv = buildPaymentsCsv(all, {
          headers: [
            t("csv.date"),
            t("csv.client"),
            t("csv.amount"),
            t("csv.currency"),
            t("csv.method"),
            t("csv.methodNote"),
            t("csv.covers"),
            t("csv.plan"),
            t("csv.note"),
            t("csv.status"),
          ],
          clientName: nameOf,
          method: labels.method,
          covers: labels.covers,
          voided: t("voided"),
        });
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pagos${filters.month ? `-${filters.month}` : ""}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        if (!noteIfStaleDeployment(err)) toast.error(t("errorGeneric"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          type="month"
          aria-label={t("history.allMonths")}
          className="w-44"
          value={filters.month}
          onChange={(e) => applyFilters({ ...filters, month: e.target.value })}
        />
        {fixedClientId ? null : (
          <select
            aria-label={t("history.allClients")}
            className={cn(SELECT_CLASS, "w-56")}
            value={filters.clientId}
            onChange={(e) => applyFilters({ ...filters, clientId: e.target.value })}
          >
            <option value="">{t("history.allClients")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label={t("history.allMethods")}
          data-testid="payments-method-filter"
          className={cn(SELECT_CLASS, "w-48")}
          value={filters.method}
          onChange={(e) => applyFilters({ ...filters, method: e.target.value as PaymentMethod | "" })}
        >
          <option value="">{t("history.allMethods")}</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {labels.method(m)}
            </option>
          ))}
        </select>
        <Button variant="outline" className="ml-auto" onClick={exportCsv} disabled={exporting} data-testid="payments-export-csv">
          <Download className="size-4" />
          {t("exportCsv")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground" data-testid="payments-empty">
              {t("empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  {fixedClientId ? null : <TableHead>{t("client")}</TableHead>}
                  <TableHead>{t("amount")}</TableHead>
                  <TableHead>{t("method.title")}</TableHead>
                  <TableHead>{t("covers.title")}</TableHead>
                  <TableHead>{t("note")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow
                    key={p.id}
                    data-testid={`payment-row-${p.id}`}
                    className={p.voidedAt ? "text-muted-foreground" : undefined}
                  >
                    <TableCell>{labels.date(p.paidCivil)}</TableCell>
                    {fixedClientId ? null : <TableCell>{nameOf(p.clientId)}</TableCell>}
                    <TableCell className={cn("tabular-nums", p.voidedAt && "line-through")}>
                      {labels.money(p.amount, p.currency)}
                    </TableCell>
                    <TableCell>
                      {labels.method(p.method)}
                      {p.methodNote ? <span className="block text-xs text-muted-foreground">{p.methodNote}</span> : null}
                    </TableCell>
                    <TableCell>
                      {labels.covers(p.covers)}
                      {p.planName ? <span className="block text-xs text-muted-foreground">{p.planName}</span> : null}
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-sm">{p.note ?? ""}</TableCell>
                    <TableCell className="text-right">
                      {p.voidedAt ? (
                        <Badge variant="secondary" title={p.voidReason ?? undefined}>
                          {t("voided")}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setToVoid(p)}
                          data-testid={`void-payment-${p.id}`}
                        >
                          <Ban className="size-4" />
                          {t("void.action")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {t("history.loadMore")}
          </Button>
        </div>
      ) : null}

      <AlertDialog open={toVoid !== null} onOpenChange={(open) => (open ? null : setToVoid(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("void.action")}</AlertDialogTitle>
            <AlertDialogDescription>{t("void.confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            aria-label={t("void.reason")}
            placeholder={t("void.reason")}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="void-payment-confirm"
              disabled={voiding}
              onClick={(e) => {
                e.preventDefault();
                confirmVoid();
              }}
            >
              {t("void.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
