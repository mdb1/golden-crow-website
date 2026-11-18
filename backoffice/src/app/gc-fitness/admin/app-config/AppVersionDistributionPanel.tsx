"use client";

// AppVersionDistributionPanel — #541: before raising `minBuild`, see who it would lock out.
// Per platform: users with a registered device, the builds they run (newest first), how
// many the CURRENT minBuild already blocks, and a «what if» input that recounts live
// (pure `blockedBy`, no reads).

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blockedBy, type PlatformDistribution } from "@/lib/gc-fitness/app-version-distribution";

export function AppVersionDistributionPanel({
  platforms,
  tokensRead,
  capped,
  currentMinBuild,
}: {
  platforms: PlatformDistribution[];
  tokensRead: number;
  capped: boolean;
  currentMinBuild: { ios: number; android: number };
}) {
  const t = useTranslations("admin.appConfig.distribution");
  const [simulated, setSimulated] = useState<{ ios: string; android: string }>({
    ios: String(currentMinBuild.ios || ""),
    android: String(currentMinBuild.android || ""),
  });
  return (
    <Card data-testid="app-version-distribution">
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        {capped ? (
          <p className="text-xs font-medium text-[color:var(--badge-warning-fg)]" data-testid="app-version-distribution-capped">
            {t("capped", { count: tokensRead })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {platforms.map((p) => {
          const label = p.platform === "ios" ? "iOS" : "Android";
          const now = blockedBy(p, currentMinBuild[p.platform]);
          const simValue = Number.parseInt(simulated[p.platform], 10);
          const sim = blockedBy(p, Number.isFinite(simValue) ? simValue : 0);
          return (
            <section key={p.platform} className="space-y-3" data-testid={`app-version-${p.platform}`}>
              <h3 className="text-sm font-semibold">
                {label} · {t("users", { count: p.users })}
              </h3>
              <p className="text-sm" data-testid={`app-version-${p.platform}-current`}>
                {currentMinBuild[p.platform] > 0
                  ? t("blockedNow", { minBuild: currentMinBuild[p.platform], count: now.known })
                  : t("gateOff")}
              </p>
              <label className="flex flex-wrap items-center gap-2 text-sm">
                {t("simulate")}
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={simulated[p.platform]}
                  onChange={(e) => setSimulated((s) => ({ ...s, [p.platform]: e.target.value }))}
                  className="h-8 w-28 rounded-md border bg-background px-2 text-sm"
                  data-testid={`app-version-${p.platform}-simulate`}
                />
              </label>
              <p className="text-sm font-medium" data-testid={`app-version-${p.platform}-simulated`}>
                {Number.isFinite(simValue) && simValue > 0
                  ? t("wouldBlock", { count: sim.known, unknown: sim.unknown })
                  : t("gateOff")}
              </p>
              {p.buckets.length === 0 && p.unknownBuild === 0 ? (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("col.build")}</TableHead>
                      <TableHead>{t("col.version")}</TableHead>
                      <TableHead className="text-right">{t("col.users")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.buckets.map((b) => (
                      <TableRow key={b.build} data-testid={`app-version-${p.platform}-build-${b.build}`}>
                        <TableCell className="font-mono text-xs">
                          {b.build}{" "}
                          {Number.isFinite(simValue) && simValue > 0 && b.build < simValue ? (
                            <Badge variant="destructive">{t("blocked")}</Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">{b.version ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.users}</TableCell>
                      </TableRow>
                    ))}
                    {p.unknownBuild > 0 ? (
                      <TableRow>
                        <TableCell className="text-xs text-muted-foreground" colSpan={2}>
                          {t("unknown")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.unknownBuild}</TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
