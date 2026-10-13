// CorvoReportContextView — the read-only view of ONE reported Corvo reply
// (#1330): the report itself, then the up-to-6 previous messages and the
// reported one, in chronological order. Nothing after the reported message is
// ever loaded. A deleted conversation shows only the report and a notice.

import { useTranslations } from "next-intl";

import type { CorvoReportContext } from "@/lib/gc-fitness/ai-coach-admin-actions";
import { cn } from "@/lib/utils";

export function CorvoReportContextView({ context }: { context: CorvoReportContext }) {
  const t = useTranslations("corvoAdmin.context");
  const tReason = useTranslations("corvoAdmin.reasons");

  if (context.kind === "not_found") {
    return (
      <p className="rounded-2xl border px-4 py-6 text-sm text-muted-foreground" data-testid="corvo-context-not-found">
        {t("notFound")}
      </p>
    );
  }

  const { report } = context;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm" data-testid="corvo-context-report">
        <p className="font-semibold">
          {tReason(report.reason)} · {t("reportedBy", { user: report.email ?? report.uid })}
        </p>
        {report.note ? <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{report.note}</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {[report.createdAtISO?.slice(0, 16).replace("T", " "), report.platform, report.appVersion]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {context.kind === "deleted" ? (
        <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground" data-testid="corvo-context-deleted">
          {t("deleted")}
        </p>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="corvo-context-messages">
          {context.messages.map((m) => (
            <li
              key={m.id}
              data-testid={`context-message-${m.id}`}
              data-reported={m.isReported ? "true" : "false"}
              className={cn(
                "max-w-[85%] rounded-2xl border px-4 py-3 text-sm",
                m.role === "user" ? "self-end bg-muted/50" : "self-start bg-card",
                m.isReported && "border-2 border-amber-500",
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{t(m.role)}</span>
                {m.createdAtISO ? <span>{m.createdAtISO.slice(0, 16).replace("T", " ")}</span> : null}
                {m.isReported ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                    {t("reportedBadge")}
                  </span>
                ) : null}
              </div>
              {m.status === "error" ? (
                <p className="italic text-muted-foreground">{t("errorMessage", { code: m.errorCode ?? "?" })}</p>
              ) : (
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.text || t("emptyText")}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
