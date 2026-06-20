import { sdkFetchServer } from "@/lib/sdk-server";
import {
  Building2,
  Dna,
  FileCode2,
  FolderOpen,
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
import { appText } from "@/lib/language";
import type { DashboardStats } from "@/lib/moderation-types";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function DashboardPage() {
  const adminContext = await getAdminContextServer();
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

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
          eyebrow={t("Mission")}
          title={`${t(ADMIN_ROLE_LABELS[adminContext.role])} ${t("overview")}`}
          description={t("This workspace is scoped around institutions first: your institution, its doctors, its patients, and the role records that define local access.")}
        />

        <HelperBanner title={t("The shell is scoped before the action buttons are.")} tone="blue">
          {t("The SDK enforces the same limits the UI describes here. Institution admins stay inside one institution. Institution doctors can inspect the institution, edit only their own doctor file, and CRUD only their own patients.")}
        </HelperBanner>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {t("Areas")}
          </h2>
          <div className="grid gap-3">
            <MetricCard
              icon={Dna}
              title={t("2PQ Dashboard")}
              description={t("Workflow-first shell for cases, samples, shipments, sequencing, reports, clients, and role-aware access.")}
              value={t("All scoped areas")}
              href="/2pq-dashboard"
              tone="rose"
            />
            <MetricCard
              icon={Building2}
              title={t("Institutions")}
              description={t("The institution root, local admin coverage, and the doctor roster attached to it.")}
              value={institutionsPayload.institutions.length}
              href="/areas/institutions"
              tone="blue"
            />
            <MetricCard
              icon={Stethoscope}
              title={t("Doctors")}
              description={t("Institution-linked doctor records with scoped editability and patient counts.")}
              value={doctorsPayload.doctors.length}
              href="/areas/doctors"
              tone="blue"
            />
            <MetricCard
              icon={UserPlus}
              title={t("Patients")}
              description={t("Institution and doctor-linked patient sheets with scoped CRUD rights.")}
              value={patientsPayload.patients.length}
              href="/areas/patients"
              tone="blue"
            />
            <MetricCard
              icon={KeyRound}
              title={t("Roles & Permissions")}
              description={t("Email-scoped access control records with institution, doctor, and patient boundaries.")}
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
          {t("Unable to load dashboard stats. Ensure GoldenCrow SDK is running.")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHero
        eyebrow={t("Mission")}
        title={t("Overview")}
        description={t("Pocket Genes Admin is an operations console first: grouped control surfaces, real Firebase records, and explicit safety affordances.")}
      />

      <HelperBanner title={t("Validate with real tasks, not screenshots.")} tone="blue">
        {t("The redesign is working when an operator can find a user, open a post, inspect a report, and spot the dangerous action in a few seconds.")}
      </HelperBanner>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {t("Overview")}
        </h2>
        <div className="grid gap-3">
          <MetricCard
            icon={Dna}
            title={t("2PQ Dashboard")}
            description={t("PDF-inspired workflow map with explicit route access and CRUD visibility.")}
            value={t("Cases / samples / shipments")}
            href="/2pq-dashboard"
            tone="rose"
          />
          <MetricCard
            icon={Users}
            title={t("Accounts")}
            description={t("Firebase Auth users with linked private profile moderation.")}
            value={`${stats.accounts.authUsers}${stats.accounts.authUsersExact ? "" : "+"}`}
            href="/users"
            tone="blue"
          />
          <MetricCard
            icon={Building2}
            title={t("Areas")}
            description={t("Institution roots, doctor relations, patient sheets, and local access control.")}
            value={t("Institutions / doctors / patients")}
            href="/areas/institutions"
            tone="blue"
          />
          <MetricCard
            icon={MessagesSquare}
            title={t("Community")}
            description={t("Public profiles, community users, posts, comments, and events.")}
            value={`${stats.community.posts} ${t("posts")} / ${stats.community.comments} ${t("comments")}`}
            href="/community"
            tone="rose"
          />
          <MetricCard
            icon={FileCode2}
            title={t("Reports")}
            description={t("Report codes, uploaded reports, stored files, and owner administration.")}
            value={`${stats.reports.reportCodes} ${t("codes")}`}
            href="/reports"
            tone="green"
          />
          <MetricCard
            icon={Sparkles}
            title={t("Learning")}
            description={t("Progress records and lesson operations.")}
            value={`${stats.learning.progressRecords} ${t("progress records")}`}
            href="/learning"
            tone="green"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {t("Accounts and Community")}
        </h2>
        <div className="grid gap-3">
          <MetricCard
            icon={Users}
            title={t("Private profiles")}
            description={t("profiles/{uid} documents that back onboarding and private account state.")}
            value={stats.accounts.profiles}
            href="/collections/profiles"
            tone="blue"
          />
          <MetricCard
            icon={MessagesSquare}
            title={t("Public profiles")}
            description={t("Community-facing profile documents for names, icons, and visible fields.")}
            value={stats.accounts.publicProfiles}
            href="/collections/public_profiles"
            tone="rose"
          />
          <MetricCard
            icon={KeyRound}
            title={t("Roles & Permissions")}
            description={t("Email-scoped access tree for full admins, institution admins, institution operators, doctors, and patients.")}
            href="/roles"
            tone="blue"
          />
          <MetricCard
            icon={MessagesSquare}
            title={t("Community users")}
            description={t("Identity, stats, activity visibility, and nested events.")}
            value={`${stats.accounts.communityUsers} ${t("users")} / ${stats.community.events} ${t("events")}`}
            href="/collections/community_users"
            tone="rose"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {t("Reports and Learning")}
        </h2>
        <div className="grid gap-3">
          <MetricCard
            icon={FileCode2}
            title={t("Uploaded reports")}
            description={t("Direct moderation of uploaded report records and status fields.")}
            value={stats.reports.uploadedReports}
            href="/collections/uploaded_reports"
            tone="green"
          />
          <MetricCard
            icon={FolderOpen}
            title={t("Stored files")}
            description={t("Cross-user file storage inventory with linked report context.")}
            value={stats.reports.fileStorage}
            href="/collections/file_storage"
            tone="green"
          />
          <MetricCard
            icon={FileCode2}
            title={t("Report owners")}
            description={t("Owner/admin profiles that unlock report administration.")}
            value={stats.reports.reportOwners}
            href="/collections/report_owners"
            tone="green"
          />
          <MetricCard
            icon={Sparkles}
            title={t("Learning progress")}
            description={t("XP, levels, streaks, and completed lesson ids.")}
            value={stats.learning.progressRecords}
            href="/collections/user_progress"
            tone="green"
          />
        </div>
      </section>
    </div>
  );
}
