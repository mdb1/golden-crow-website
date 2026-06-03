"use client";

// RelativeTime.tsx — '2h ago', 'yesterday', '3 days ago', 'just now'.
//
// Pure presentational client component. Computes once on render (no clock
// state — re-renders only when the parent re-renders, which is acceptable
// for a roster table refreshed on every navigation).
//
// Pattern mirrors `Date.FormatStyle` on iOS but kept JS-side using simple
// elapsed-time bucketing. We deliberately do NOT pull in `date-fns`
// formatDistance — the bucket semantics here are tuned for the roster
// view ("2h ago" reads better than "about 2 hours ago" in a dense table).
//
// Time travel safety: future timestamps (clock drift, server-clock skew,
// or a legitimately future `scheduledFor`) render as "just now" rather
// than throwing — graceful degradation per T-11-05-TIMESTAMP-DRIFT.

export interface RelativeTimeProps {
  /** ISO-8601 string (e.g. "2026-05-20T18:00:00Z"). */
  iso: string | null;
  /** Shown when iso === null. */
  fallback?: string;
}

export function RelativeTime({
  iso,
  fallback = "No activity yet",
}: RelativeTimeProps) {
  if (!iso) {
    return <span className="text-muted-foreground">{fallback}</span>;
  }

  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return <span className="text-muted-foreground">{fallback}</span>;
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - then.getTime());
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  let text: string;
  if (sec < 60) text = "just now";
  else if (min < 60) text = `${min}m ago`;
  else if (hr < 24) text = `${hr}h ago`;
  else if (day === 1) text = "yesterday";
  else if (day < 7) text = `${day} days ago`;
  else if (day < 30) text = `${Math.floor(day / 7)}w ago`;
  else if (day < 365) text = `${Math.floor(day / 30)}mo ago`;
  else text = `${Math.floor(day / 365)}y ago`;

  return <time dateTime={iso} title={then.toISOString()}>{text}</time>;
}
