# Client Activity Timezone Policy

All client-facing activity lists and detail previews in GC Fitness must render instants in an explicit IANA timezone passed from the server component.

Do not rely on:
- `Intl.DateTimeFormat().resolvedOptions().timeZone` inside leaf components
- the host runtime timezone on Vercel or in Jest
- `new Date(...).toISOString().slice(0, 10)` for anything that is supposed to read as the trainer's or client's local day

Use the shared helpers in `src/lib/gc-fitness/client-activity-time.ts` for:
- chat history previews
- recent logs rows
- client notes timestamps
- progress photo fallback dates
- body-weight chart buckets
- any future client activity timeline

Route-level ownership pages should resolve the client timezone once and thread it down as a prop.

If a component needs a civil date, compute it server-side with `civilDateToday(timezone)` or `civilDateFormat(date, timezone)` and pass the string through. If it needs a displayed instant, format it with the shared client activity helpers.
