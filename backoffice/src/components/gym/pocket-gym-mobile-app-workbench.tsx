"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  Dumbbell,
  FileText,
  MessagesSquare,
  RefreshCcw,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { sdkFetch } from "@/lib/sdk-client";

type AppointmentStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "completed";

interface PocketGymMobileUserRecord {
  id: string;
  uid: string;
  email?: string;
  displayName?: string;
  sourceFirebase?: string;
  updatedAt?: string;
}

interface PocketGymStateRecord {
  id: string;
  userId: string;
  app?: string;
  updatedAt?: string;
  profile?: {
    displayName?: string;
    goal?: string;
    level?: string;
    targetWeeklyWorkouts?: number;
    heightCm?: number;
    targetWeightKg?: number;
  };
  summary: {
    habits: number;
    habitLogs: number;
    bodyMetrics: number;
    workoutLogs: number;
    latestWeightKg?: number;
    latestWorkoutAt?: string;
  };
}

interface PocketGymAppointmentRecord {
  id: string;
  userId: string;
  clientName: string;
  clientEmail?: string;
  coachName?: string;
  kind: string;
  title: string;
  location?: string;
  notes?: string;
  startsAt?: string;
  durationMinutes: number;
  status: AppointmentStatus;
  requestedAt?: string;
  updatedAt?: string;
}

interface PocketGymFileRecord {
  id: string;
  userId: string;
  appointmentId?: string;
  scope: string;
  category: string;
  fileName: string;
  contentType?: string;
  byteCount: number;
  storagePath?: string;
  downloadURL?: string;
  note?: string;
  createdAt?: string;
  uploadedAt?: string;
}

interface PocketGymInteractionRecord {
  id: string;
  userId: string;
  type: string;
  summary: string;
  detailText?: string;
  appointmentId?: string;
  fileId?: string;
  createdAt?: string;
}

interface PocketGymCareTeamRecord {
  id: string;
  userId: string;
  updatedAt?: string;
  professionals: Array<{
    id: string;
    role: string;
    displayName: string;
    title?: string;
    organization?: string;
    specialties: string[];
    email?: string;
    phoneNumber?: string;
    isPrimary: boolean;
    isActive: boolean;
    assignedAt?: string;
    lastContactAt?: string;
  }>;
}

interface PocketGymMobileAppOverview {
  counts: {
    users: number;
    states: number;
    appointments: number;
    pendingAppointments: number;
    files: number;
    interactions: number;
    careTeamAssignments: number;
  };
  users: PocketGymMobileUserRecord[];
  states: PocketGymStateRecord[];
  appointments: PocketGymAppointmentRecord[];
  files: PocketGymFileRecord[];
  interactions: PocketGymInteractionRecord[];
  careTeams: PocketGymCareTeamRecord[];
}

const statusOptions: AppointmentStatus[] = [
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "completed",
];

const featureRows = [
  {
    title: "Auth and member identity",
    source: "pocketgym_users",
    coverage: "Live iOS sign-in roster with uid, email, display name, and source Firebase.",
  },
  {
    title: "Dashboard, profile, habits, progress, and training logs",
    source: "pocketgym_state",
    coverage: "Decoded app payload summary for profile preferences, habits, body metrics, and completed workouts.",
  },
  {
    title: "Turnos and coach review",
    source: "pocketgym_turnos",
    coverage: "Backoffice can review appointment requests and move them through the same iOS statuses.",
  },
  {
    title: "Files and appointment attachments",
    source: "pocketgym_files",
    coverage: "User and appointment-scoped uploads are visible with storage/download references.",
  },
  {
    title: "Care team",
    source: "care_team_assignments",
    coverage: "Assigned coaches and physicians are visible by user, role, active state, and contact details.",
  },
  {
    title: "Community ecosystem",
    source: "community_posts, community_users, public_profiles",
    coverage: "Shared PocketGenes community collections remain available through the Community moderation hub.",
  },
] as const;

function formatDateTime(value?: string) {
  if (!value) {
    return "Not set";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} MB`;
  }

  return `${Math.ceil(value / 1_000)} KB`;
}

function statusVariant(status: AppointmentStatus) {
  if (status === "accepted" || status === "completed") {
    return "success" as const;
  }

  if (status === "pending") {
    return "warning" as const;
  }

  return "destructive" as const;
}

function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p className="line-clamp-2 max-w-4xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-background/72 px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
            {value}
          </p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function PocketGymMobileAppWorkbench() {
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: ["pocket-gym-mobile-app-overview"],
    queryFn: () =>
      sdkFetch<PocketGymMobileAppOverview>("/gym/mobile-app"),
  });

  const statusMutation = useMutation({
    mutationFn: ({
      appointmentId,
      status,
    }: {
      appointmentId: string;
      status: AppointmentStatus;
    }) =>
      sdkFetch(`/gym/mobile-app/appointments/${appointmentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["pocket-gym-mobile-app-overview"],
      }),
  });

  if (overview.isLoading) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (overview.error || !overview.data) {
    return (
      <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-4">
        <p className="text-sm text-destructive">
          Unable to load the PocketGym iOS mirror. Confirm the SDK can access
          the MyDNAMap Firebase project.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => overview.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const data = overview.data;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Users}
          label="iOS users"
          value={data.counts.users}
          detail="Signed-in PocketGym users from pocketgym_users."
        />
        <StatTile
          icon={Dumbbell}
          label="App states"
          value={data.counts.states}
          detail="Persisted profile, habits, body metrics, and workout logs."
        />
        <StatTile
          icon={CalendarClock}
          label="Appointments"
          value={data.counts.appointments}
          detail={`${data.counts.pendingAppointments} pending coach review.`}
        />
        <StatTile
          icon={FileText}
          label="Files"
          value={data.counts.files}
          detail="User and appointment attachments from the iOS vault."
        />
      </div>

      <SectionShell
        title="iOS feature coverage"
        description="Every major PocketGym iOS surface is mapped to the Firebase collection the app actually uses, with the available backoffice control shown here."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {featureRows.map((feature) => (
            <article
              key={feature.title}
              className="rounded-lg border bg-background/72 px-4 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{feature.title}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {feature.source}
                  </p>
                </div>
                <Badge variant="success" className="shrink-0">
                  Mirrored
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {feature.coverage}
              </p>
            </article>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/community">
              Open Community Hub
              <MessagesSquare className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => overview.refetch()}>
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh mirror
          </Button>
        </div>
      </SectionShell>

      <SectionShell
        title="Mobile users"
        description="Users created by the iOS app in pocketgym_users. The app still authenticates against the MyDNAMap Firebase project, so uid is the shared identity key."
      >
        {data.users.length === 0 ? (
          <EmptyRow>No PocketGym iOS users found.</EmptyRow>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-background/72">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {user.displayName ?? "Pocket Athlete"}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {user.uid}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.email ?? "No email"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">
                        {user.sourceFirebase ?? "mydnamap-ios"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDateTime(user.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Dashboard, habits, progress, and workout state"
        description="Decoded summaries from pocketgym_state payloads. These are the records powering the iOS dashboard, profile editor, habit logger, progress screen, and completed workout history."
      >
        {data.states.length === 0 ? (
          <EmptyRow>No mobile app state documents found.</EmptyRow>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.states.map((state) => (
              <article
                key={state.id}
                className="rounded-lg border bg-background/72 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {state.profile?.displayName ?? state.userId}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {state.userId}
                    </p>
                  </div>
                  <Badge variant="brand">{state.profile?.level ?? "Level"}</Badge>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                  {state.profile?.goal ?? "No profile goal stored yet."}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <StateMetric label="Habits" value={state.summary.habits} />
                  <StateMetric label="Habit logs" value={state.summary.habitLogs} />
                  <StateMetric label="Body metrics" value={state.summary.bodyMetrics} />
                  <StateMetric label="Workouts" value={state.summary.workoutLogs} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>
                    Target: {state.profile?.targetWeeklyWorkouts ?? "?"} workouts/week
                  </span>
                  <span>
                    Weight:{" "}
                    {state.summary.latestWeightKg
                      ? `${state.summary.latestWeightKg} kg`
                      : "Not logged"}
                  </span>
                  <span>Updated: {formatDateTime(state.updatedAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Turnos"
        description="Appointments from pocketgym_turnos. Changing the status here writes the same status values the iOS coach/client flows use."
      >
        {data.appointments.length === 0 ? (
          <EmptyRow>No PocketGym appointments found.</EmptyRow>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-background/72">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Appointment</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Starts</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Coach action</th>
                </tr>
              </thead>
              <tbody>
                {data.appointments.map((appointment) => (
                  <tr key={appointment.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {appointment.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {appointment.kind} · {appointment.durationMinutes} min
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{appointment.clientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {appointment.clientEmail ?? appointment.userId}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDateTime(appointment.startsAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(appointment.status)}>
                        {appointment.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={appointment.status}
                        onValueChange={(status) =>
                          statusMutation.mutate({
                            appointmentId: appointment.id,
                            status: status as AppointmentStatus,
                          })
                        }
                        disabled={statusMutation.isPending}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Files and attachments"
        description="Uploads from pocketgym_files, including user-level documents and appointment-scoped receipts, progress photos, medical files, contracts, and other attachments."
      >
        {data.files.length === 0 ? (
          <EmptyRow>No PocketGym files found.</EmptyRow>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {data.files.map((file) => (
              <article
                key={file.id}
                className="rounded-lg border bg-background/72 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {file.fileName}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {file.userId}
                    </p>
                  </div>
                  <Badge variant="secondary">{file.category}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{file.scope}</span>
                  <span>{formatBytes(file.byteCount)}</span>
                  <span>{formatDateTime(file.createdAt)}</span>
                </div>
                {file.note ? (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {file.note}
                  </p>
                ) : null}
                {file.downloadURL ? (
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <a href={file.downloadURL} target="_blank" rel="noreferrer">
                      Open file
                    </a>
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Care team assignments"
        description="Professionals assigned to the iOS care-team hub, grouped by user and preserving primary/active state."
      >
        {data.careTeams.length === 0 ? (
          <EmptyRow>No care team assignments found.</EmptyRow>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.careTeams.map((team) => (
              <article
                key={team.id}
                className="rounded-lg border bg-background/72 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">User care team</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {team.userId}
                    </p>
                  </div>
                  <Badge variant="brand">{team.professionals.length} people</Badge>
                </div>
                <div className="mt-4 grid gap-3">
                  {team.professionals.map((professional) => (
                    <div
                      key={professional.id}
                      className="rounded-lg border bg-background/55 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">
                          {professional.displayName}
                        </p>
                        <Badge variant="secondary">{professional.role}</Badge>
                        {professional.isPrimary ? (
                          <Badge variant="success">Primary</Badge>
                        ) : null}
                        {!professional.isActive ? (
                          <Badge variant="outline">Inactive</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[professional.title, professional.organization]
                          .filter(Boolean)
                          .join(" · ") || "No title stored"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {professional.email ?? "No email"}{" "}
                        {professional.phoneNumber ? `· ${professional.phoneNumber}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Interaction audit"
        description="App-generated and backoffice-generated pocketgym_interactions entries for appointment, file, care-team, habit, body metric, and workout events."
      >
        {data.interactions.length === 0 ? (
          <EmptyRow>No PocketGym interactions found.</EmptyRow>
        ) : (
          <div className="grid gap-3">
            {data.interactions.map((interaction) => (
              <article
                key={interaction.id}
                className="rounded-lg border bg-background/72 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {interaction.summary}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {interaction.detailText ?? interaction.type}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{interaction.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(interaction.createdAt)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionShell>
    </div>
  );
}

function StateMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background/55 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-lg font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}
