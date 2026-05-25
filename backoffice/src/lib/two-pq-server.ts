import type { DoctorListItem, InstitutionListItem, PatientListItem } from "@/lib/admin-areas";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";
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

export async function getTwoPQFormLookupData() {
  const [institutionsPayload, doctorsPayload, patientsPayload, casesPayload] = await Promise.all([
    sdkFetchServer<{ institutions: InstitutionListItem[] }>("/areas/institutions"),
    sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
    sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
    sdkFetchServer<{ records: TwoPQListItem[] }>("/2pq/cases"),
  ]);

  return {
    institutions: institutionsPayload.institutions,
    doctors: doctorsPayload.doctors,
    patients: patientsPayload.patients,
    cases: casesPayload.records,
  };
}

export async function getTwoPQForms(options: { includeArchived?: boolean } = {}) {
  const query = options.includeArchived ? "?includeArchived=1" : "";
  const payload = await sdkFetchServer<{ forms: TwoPQFormRecord[] }>(
    `/2pq/forms${query}`
  );
  return payload.forms;
}

export async function getTwoPQForm(formId: string) {
  const payload = await sdkFetchServer<{ form: TwoPQFormRecord }>(
    `/2pq/forms/${encodeURIComponent(formId)}`
  );
  return payload.form;
}
