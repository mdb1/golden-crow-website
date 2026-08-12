export interface InformedConsentFileSummary {
  name: string;
  type: string;
  size: number;
}

export interface InformedConsentRecord {
  id: string;
  collectionKey: "2pq-informed-consent";
  institutionId: string;
  doctorId: string;
  patientId: string;
  patientName: string;
  file: InformedConsentFileSummary;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
}

export interface InformedConsentPatientOption {
  id: string;
  fullName: string;
  email: string;
}

export interface InformedConsentPage {
  records: InformedConsentRecord[];
  nextCursor?: string;
}

export interface InformedConsentPatientPage {
  patients: InformedConsentPatientOption[];
  nextCursor?: string;
}
