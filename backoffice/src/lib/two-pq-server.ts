import type { DoctorListItem, InstitutionListItem, PatientListItem } from "@/lib/admin-areas";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
import type {
  TwoPQFormDraftRecord,
  TwoPQFormRecord,
  TwoPQFormsOrder,
  TwoPQFormsPage,
} from "@/lib/two-pq-forms";
import { sdkFetchServer } from "@/lib/sdk-server";

export async function getTwoPQLookupData() {
  const [institutionsPayload, doctorsPayload, patientsPayload] = await Promise.all([
    sdkFetchServer<{ institutions: InstitutionListItem[] }>("/areas/institutions"),
    sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
    sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
  ]);

  return {
    institutions: institutionsPayload.institutions.map((institution) => ({
      id: institution.id,
      name: institution.name,
    })),
    doctors: doctorsPayload.doctors.map((doctor) => ({
      id: doctor.id,
      fullName: doctor.fullName,
      institutionId: doctor.institutionId,
    })),
    patients: patientsPayload.patients.map((patient) => ({
      id: patient.id,
      fullName: patient.fullName,
      institutionId: patient.institutionId,
      doctorId: patient.doctorId,
    })),
  };
}

export async function getTwoPQFormLookupData(
  options: { includeStudyRequestForms?: boolean } = {}
) {
  const [
    institutionsPayload,
    doctorsPayload,
    patientsPayload,
    casesPayload,
    studyRequestFormsPayload,
  ] = await Promise.all([
    sdkFetchServer<{ institutions: InstitutionListItem[] }>("/areas/institutions"),
    sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
    sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
    sdkFetchServer<{ records: TwoPQListItem[] }>("/2pq/cases"),
    options.includeStudyRequestForms
      ? sdkFetchServer<{ forms: TwoPQFormRecord[] }>(
          "/2pq/forms?formType=study_request&limit=20"
        )
      : Promise.resolve({ forms: [] }),
  ]);

  return {
    institutions: institutionsPayload.institutions,
    doctors: doctorsPayload.doctors,
    patients: patientsPayload.patients,
    cases: casesPayload.records,
    studyRequestForms: studyRequestFormsPayload.forms,
  };
}

export async function getTwoPQForms(
  options: {
    includeArchived?: boolean;
    formType?: "study_request" | "sample";
    limit?: number;
    search?: string;
    createdFrom?: string;
    createdTo?: string;
    order?: TwoPQFormsOrder;
    cursor?: string;
  } = {}
) {
  const payload = await getTwoPQFormsPage(options);
  return payload.forms;
}

export async function getTwoPQFormsPage(
  options: {
    includeArchived?: boolean;
    formType?: "study_request" | "sample";
    limit?: number;
    search?: string;
    createdFrom?: string;
    createdTo?: string;
    order?: TwoPQFormsOrder;
    cursor?: string;
  } = {}
) {
  const params = new URLSearchParams();
  if (options.includeArchived) {
    params.set("includeArchived", "1");
  }
  if (options.formType) {
    params.set("formType", options.formType);
  }
  if (options.limit) {
    params.set("limit", String(options.limit));
  }
  if (options.search) {
    params.set("search", options.search);
  }
  if (options.createdFrom) {
    params.set("createdFrom", options.createdFrom);
  }
  if (options.createdTo) {
    params.set("createdTo", options.createdTo);
  }
  if (options.order) {
    params.set("order", options.order);
  }
  if (options.cursor) {
    params.set("cursor", options.cursor);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const payload = await sdkFetchServer<TwoPQFormsPage>(
    `/2pq/forms${query}`
  );
  return {
    forms: payload.forms,
    nextCursor: payload.nextCursor ?? null,
    hasMore: Boolean(payload.hasMore),
  };
}

export async function getTwoPQFormDraft() {
  const payload = await sdkFetchServer<{ draft: TwoPQFormDraftRecord | null }>(
    "/2pq/form-draft"
  );
  return payload.draft;
}

export async function getTwoPQForm(formId: string) {
  const payload = await sdkFetchServer<{ form: TwoPQFormRecord }>(
    `/2pq/forms/${encodeURIComponent(formId)}`
  );
  return payload.form;
}
