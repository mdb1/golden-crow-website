// ComplianceSparkline.tsx — inline-SVG daily-completion bar chart.
//
// Plan 06-08 Task 2. Pure-render React component (server-renderable — no
// hooks, no event handlers, no "use client" directive needed). Renders one
// vertical bar per civil day in the supplied `counts` array; completed days
// get a tall green bar, missed days get a short muted-foreground bar. The
// per-bar `<title>` element provides a native HTML tooltip when the user
// hovers a specific day — no JS required, accessible by default.
//
// WHY NO CHART LIBRARY:
//   CLAUDE.md mandates "no new frameworks" — recharts, nivo, victory, etc.
//   are all heavyweight + bundle-bloat for a 30-bar bar chart. Inline SVG
//   is ~40 lines of declarative rendering, server-renderable, and uses the
//   shadcn theme variables (`fill-green-500`, `fill-muted-foreground/30`)
//   so it matches the rest of the trainer surface palette.
//
// ACCESSIBILITY:
//   - `role="img"` + `aria-label` describes the chart for screen readers.
//   - Per-bar `<title>` element provides hover-tooltips natively (HTML5 SVG
//     standard, no JS, no a11y plugin needed).
//   - High-contrast theme tokens (fill-green-500 vs fill-muted-foreground/30)
//     keep the chart readable in both light and dark modes (Tailwind v4
//     theme variables auto-swap).

interface ComplianceSparklineProps {
  counts: { date: string; completed: boolean }[];
}

const BAR_WIDTH = 8;
const BAR_GAP = 2;
const FULL_BAR_HEIGHT = 24;
const EMPTY_BAR_HEIGHT = 6;
const SVG_PADDING = 4;
const SVG_HEIGHT = FULL_BAR_HEIGHT + SVG_PADDING;

export function ComplianceSparkline({ counts }: ComplianceSparklineProps) {
  if (counts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No compliance data yet.
      </p>
    );
  }

  const totalWidth = counts.length * (BAR_WIDTH + BAR_GAP);

  return (
    <svg
      width={totalWidth}
      height={SVG_HEIGHT}
      role="img"
      aria-label={`Last ${counts.length} days compliance`}
      className="text-foreground"
    >
      {counts.map((c, i) => {
        const x = i * (BAR_WIDTH + BAR_GAP);
        const h = c.completed ? FULL_BAR_HEIGHT : EMPTY_BAR_HEIGHT;
        const y = SVG_HEIGHT - h - 2;
        return (
          <rect
            key={c.date}
            x={x}
            y={y}
            width={BAR_WIDTH}
            height={h}
            rx={1}
            className={
              c.completed ? "fill-green-500" : "fill-muted-foreground/30"
            }
          >
            <title>
              {c.date}: {c.completed ? "completed" : "not logged"}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}
