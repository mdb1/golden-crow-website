import type { DoctorListItem, InstitutionListItem, PatientListItem } from "@/lib/admin-areas";
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
  const [institutionsPayload, doctorsPayload, patientsPayload] = await Promise.all([
    sdkFetchServer<{ institutions: InstitutionListItem[] }>("/areas/institutions"),
    sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
    sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
  ]);

  return {
    institutions: institutionsPayload.institutions,
    doctors: doctorsPayload.doctors,
    patients: patientsPayload.patients,
  };
}

export async function getTwoPQForms() {
  const payload = await sdkFetchServer<{ forms: TwoPQFormRecord[] }>("/2pq/forms");
  return payload.forms;
}
