import { sdkFetchServer } from "@/lib/sdk-server";
import {
  Building2,
  Dna,
  FileCode2,
  KeyRound,
  MessagesSquare,
  Sparkles,
  Stethoscope,
  UserPlus,
  Users,
} from "lucide-react";
import { HelperBanner } from "@/components/helper-banner";
import { MetricCard } from "@/components/metric-card";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type {
  DoctorListItem,
  InstitutionListItem,
  PatientListItem,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-areas";
import type { DashboardStats } from "@/lib/moderation-types";

export default async function DashboardPage() {
  const adminContext = await getAdminContextServer();

  if (adminContext.role !== "full_admin") {
    const [institutionsPayload, doctorsPayload, patientsPayload, rolesPayload] =
      await Promise.all([
        sdkFetchServer<{ institutions: InstitutionListItem[] }>("/areas/institutions"),
        sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
        sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
        sdkFetchServer<{ roles: RoleManagementRecord[] }>("/roles"),
      ]);

    return (
      <div className="flex flex-col gap-8">
        <PageHero
          eyebrow="Mission"
          title={`${ADMIN_ROLE_LABELS[adminContext.role]} overview`}
          description="This workspace is scoped around institutions first: your institution, its doctors, its patients, and the role records that define local access."
        />

        <HelperBanner title="The shell is scoped before the action buttons are." tone="blue">
          The SDK enforces the same limits the UI describes here. Institution admins stay inside one institution. Institution doctors can inspect the institution, edit only their own doctor file, and CRUD only their own patients.
        </HelperBanner>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Areas
          </h2>
          <div className="grid gap-3">
            <MetricCard
              icon={Dna}
              title="2PQ Dashboard"
              description="Workflow-first shell for cases, samples, shipments, sequencing, reports, clients, and role-aware access."
              value="All scoped areas"
              href="/2pq-dashboard"
              tone="rose"
            />
            <MetricCard
              icon={Building2}
              title="Institutions"
              description="The institution root, local admin coverage, and the doctor roster attached to it."
              value={institutionsPayload.institutions.length}
              href="/areas/institutions"
              tone="blue"
            />
            <MetricCard
              icon={Stethoscope}
              title="Doctors"
              description="Institution-linked doctor records with scoped editability and patient counts."
              value={doctorsPayload.doctors.length}
              href="/areas/doctors"
              tone="blue"
            />
            <MetricCard
              icon={UserPlus}
              title="Patients"
              description="Institution and doctor-linked patient sheets with scoped CRUD rights."
              value={patientsPayload.patients.length}
              href="/areas/patients"
              tone="blue"
            />
            <MetricCard
              icon={KeyRound}
              title="Roles & Permissions"
              description="Email-scoped access control records with institution, doctor, and patient boundaries."
              value={rolesPayload.roles.length}
              href="/roles"
              tone="blue"
            />
          </div>
        </section>
      </div>
    );
  }

  let stats: DashboardStats | null = null;

  try {
    stats = await sdkFetchServer<DashboardStats>("/stats");
  } catch {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Unable to load dashboard stats. Ensure GoldenCrow SDK is running.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHero
        eyebrow="Mission"
        title="Overview"
        description="Pocket Genes Admin is an operations console first: grouped control surfaces, real Firebase records, and explicit safety affordances."
      />

      <HelperBanner title="Validate with real tasks, not screenshots." tone="blue">
        The redesign is working when an operator can find a user, open a post,
        inspect a report, and spot the dangerous action in a few seconds.
      </HelperBanner>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Overview
        </h2>
        <div className="grid gap-3">
          <MetricCard
            icon={Dna}
            title="2PQ Dashboard"
            description="PDF-inspired workflow map with explicit route access and CRUD visibility."
            value="Cases / samples / shipments"
            href="/2pq-dashboard"
            tone="rose"
          />
          <MetricCard
            icon={Users}
            title="Accounts"
            description="Firebase Auth users with linked private profile moderation."
            value={`${stats.accounts.authUsers}${stats.accounts.authUsersExact ? "" : "+"}`}
            href="/users"
            tone="blue"
          />
          <MetricCard
            icon={Building2}
            title="Areas"
            description="Institution roots, doctor relations, patient sheets, and local access control."
            value="Institutions / doctors / patients"
            href="/areas/institutions"
            tone="blue"
          />
          <MetricCard
            icon={MessagesSquare}
            title="Community"
            description="Public profiles, community users, posts, comments, and events."
            value={`${stats.community.posts} posts / ${stats.community.comments} comments`}
            href="/community"
            tone="rose"
          />
          <MetricCard
            icon={FileCode2}
            title="Reports"
            description="Report codes, uploaded reports, and owner administration."
            value={`${stats.reports.reportCodes} codes`}
            href="/reports"
            tone="green"
          />
          <MetricCard
            icon={Sparkles}
            title="Learning"
            description="Progress records and lesson operations."
            value={`${stats.learning.progressRecords} progress records`}
            href="/learning"
            tone="green"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Accounts and Community
        </h2>
        <div className="grid gap-3">
          <MetricCard
            icon={Users}
            title="Private profiles"
            description="profiles/{uid} documents that back onboarding and private account state."
            value={stats.accounts.profiles}
            href="/collections/profiles"
            tone="blue"
          />
          <MetricCard
            icon={MessagesSquare}
            title="Public profiles"
            description="Community-facing profile documents for names, icons, and visible fields."
            value={stats.accounts.publicProfiles}
            href="/collections/public_profiles"
            tone="rose"
          />
          <MetricCard
            icon={KeyRound}
            title="Roles & Permissions"
            description="Email-scoped access tree for full admins, institution admins, doctors, and patients."
            href="/roles"
            tone="blue"
          />
          <MetricCard
            icon={MessagesSquare}
            title="Community users"
            description="Identity, stats, activity visibility, and nested events."
            value={`${stats.accounts.communityUsers} users / ${stats.community.events} events`}
            href="/collections/community_users"
            tone="rose"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Reports and Learning
        </h2>
        <div className="grid gap-3">
          <MetricCard
            icon={FileCode2}
            title="Uploaded reports"
            description="Direct moderation of uploaded report records and status fields."
            value={stats.reports.uploadedReports}
            href="/collections/uploaded_reports"
            tone="green"
          />
          <MetricCard
            icon={FileCode2}
            title="Report owners"
            description="Owner/admin profiles that unlock report administration."
            value={stats.reports.reportOwners}
            href="/collections/report_owners"
            tone="green"
          />
          <MetricCard
            icon={Sparkles}
            title="Learning progress"
            description="XP, levels, streaks, and completed lesson ids."
            value={stats.learning.progressRecords}
            href="/collections/user_progress"
            tone="green"
          />
        </div>
      </section>
    </div>
  );
}
