import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SUPPORT_SERVICE_FORM_CSV_HEADER,
  SupportServiceFormCsvError,
  parseSupportServiceFormCsv,
} from "@/lib/support-service-form-csv";

describe("support service request-form CSV", () => {
  it("parses the downloadable 2PQ template into the exact canonical form", () => {
    const csv = readFileSync(
      join(
        process.cwd(),
        "public/templates/formulario-solicitud-estudio-2pq.csv",
      ),
      "utf8",
    );

    expect(parseSupportServiceFormCsv(csv)).toEqual([
      {
        key: "source_study_request_form_id",
        label: "Formulario de solicitud de estudio",
        type: "identifier",
        required: true,
      },
      { key: "patient_id", label: "ID del paciente", type: "identifier", required: true },
      { key: "institution_id", label: "ID de la institución", type: "identifier", required: true },
      { key: "doctor_id", label: "ID del médico", type: "identifier", required: true },
      { key: "patient_email", label: "Email del paciente", type: "email", required: true },
      { key: "patient_full_name", label: "Nombre del paciente", type: "text", required: true },
      {
        key: "patient_medical_record_number",
        label: "Número de historia clínica",
        type: "text",
        required: false,
      },
      { key: "patient_birth_date", label: "Fecha de nacimiento", type: "date", required: false },
      { key: "patient_sex", label: "Sexo", type: "text", required: false },
      {
        key: "patient_status",
        label: "Estado del paciente",
        type: "enum",
        required: true,
        options: [
          { value: "active", label: "Activo" },
          { value: "inactive", label: "Inactivo" },
        ],
      },
      { key: "patient_notes", label: "Observaciones del paciente", type: "long_text", required: false },
      { key: "partner_full_name", label: "Nombre de la pareja", type: "text", required: false },
      {
        key: "partner_medical_record_number",
        label: "Número de historia clínica de la pareja",
        type: "text",
        required: false,
      },
      { key: "partner_birth_date", label: "Fecha de nacimiento de la pareja", type: "date", required: false },
      { key: "partner_notes", label: "Observaciones de la pareja", type: "long_text", required: false },
      {
        key: "sperm_gamete_source",
        label: "Origen de espermatozoides",
        type: "enum",
        required: false,
        options: [
          { value: "propio", label: "Propio" },
          { value: "donado", label: "Donado" },
        ],
      },
      {
        key: "oocyte_gamete_source",
        label: "Origen de ovocitos",
        type: "enum",
        required: false,
        options: [
          { value: "propio", label: "Propio" },
          { value: "donado", label: "Donado" },
        ],
      },
      { key: "male_factor", label: "Factor masculino", type: "boolean", required: true },
      {
        key: "previous_miscarriages_count",
        label: "Abortos previos",
        type: "enum",
        required: true,
        options: [
          { value: "0", label: "0" },
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3_or_more", label: "3 o más" },
          { value: "recurrent", label: "Recurrentes" },
        ],
      },
      { key: "other_background", label: "Otros antecedentes", type: "long_text", required: true },
      { key: "karyotype", label: "Cuenta con información de cariotipo", type: "boolean", required: true },
      { key: "karyotype_result", label: "Resultado de cariotipo", type: "long_text", required: false },
      { key: "karyotype_file_name", label: "Nombre del archivo de cariotipo", type: "text", required: false },
      { key: "karyotype_file_type", label: "Tipo del archivo de cariotipo", type: "text", required: false },
      { key: "karyotype_file_size", label: "Tamaño del archivo de cariotipo", type: "positive_integer", required: false },
      { key: "pgt_a_fast", label: "PGT-A FAST", type: "boolean", required: true },
      { key: "pgt_a_fast_reports_mosaicism", label: "PGT-A FAST informa mosaicismos", type: "boolean", required: false },
      { key: "pgt_a_fast_reports_sex", label: "PGT-A FAST informa sexo", type: "boolean", required: false },
      { key: "pgt_a_standard", label: "PGT-A STANDARD", type: "boolean", required: true },
      { key: "pgt_a_standard_reports_mosaicism", label: "PGT-A STANDARD informa mosaicismos", type: "boolean", required: false },
      { key: "pgt_a_standard_reports_sex", label: "PGT-A STANDARD informa sexo", type: "boolean", required: false },
      { key: "pgt_sr", label: "PGT-SR", type: "boolean", required: true },
      { key: "pgt_sr_reports_mosaicism", label: "PGT-SR informa mosaicismos", type: "boolean", required: false },
      { key: "pgt_sr_reports_sex", label: "PGT-SR informa sexo", type: "boolean", required: false },
      { key: "institution_code", label: "Código de la institución", type: "text", required: false },
      { key: "institution_name", label: "Nombre de la institución", type: "text", required: true },
      { key: "institution_legal_name", label: "Razón social", type: "text", required: false },
      { key: "institution_contact_email", label: "Email de contacto de la institución", type: "email", required: false },
      { key: "institution_contact_phone", label: "Teléfono de contacto de la institución", type: "text", required: false },
      { key: "institution_address", label: "Dirección de la institución", type: "address", required: false },
      { key: "institution_city", label: "Ciudad de la institución", type: "text", required: false },
      { key: "institution_state", label: "Provincia de la institución", type: "text", required: false },
      { key: "institution_country", label: "País de la institución", type: "text", required: false },
      { key: "institution_notes", label: "Observaciones de la institución", type: "long_text", required: false },
    ]);
  });

  it("accepts UTF-8 BOM and RFC-style quoted cells", () => {
    const csv = [
      `\uFEFF${SUPPORT_SERVICE_FORM_CSV_HEADER}`,
      'request_reason,"Motivo, detalle",long_text,false,"Puede incluir ""texto""",',
    ].join("\r\n");

    expect(parseSupportServiceFormCsv(csv)).toEqual([
      {
        key: "request_reason",
        label: "Motivo, detalle",
        type: "long_text",
        required: false,
        helpInfoText: 'Puede incluir "texto"',
      },
    ]);
  });

  it("requires the exact header and exact lower-case boolean values", () => {
    expect(() =>
      parseSupportServiceFormCsv(
        "label,key,type,required,helpInfoText,options\nName,name,text,true,,",
      ),
    ).toThrow(`CSV header must be exactly: ${SUPPORT_SERVICE_FORM_CSV_HEADER}`);
    expect(() =>
      parseSupportServiceFormCsv(
        `${SUPPORT_SERVICE_FORM_CSV_HEADER}\nname,Name,text,TRUE,,`,
      ),
    ).toThrow("CSV row 2: required must be exactly true or false.");
  });

  it("rejects duplicate keys and rejects the complete import", () => {
    const csv = [
      SUPPORT_SERVICE_FORM_CSV_HEADER,
      "name,Name,text,true,,",
      "name,Repeated name,text,false,,",
    ].join("\n");

    expect(() => parseSupportServiceFormCsv(csv)).toThrow(
      "CSV row 3: Duplicate form field key: name.",
    );
  });

  it("requires strict option JSON only for enum fields", () => {
    expect(() =>
      parseSupportServiceFormCsv(
        `${SUPPORT_SERVICE_FORM_CSV_HEADER}\nstatus,Status,enum,true,,`,
      ),
    ).toThrow("CSV row 2: enum and multi_enum fields require options.");
    expect(() =>
      parseSupportServiceFormCsv(
        `${SUPPORT_SERVICE_FORM_CSV_HEADER}\nname,Name,text,true,,[]`,
      ),
    ).toThrow(
      "CSV row 2: options must be blank unless type is enum or multi_enum.",
    );
    expect(() =>
      parseSupportServiceFormCsv(
        `${SUPPORT_SERVICE_FORM_CSV_HEADER}\nstatus,Status,enum,true,,"[{""value"":""active"",""label"":""Active"",""extra"":true}]"`,
      ),
    ).toThrow(
      "CSV row 2: option 1 must contain only string value and label fields.",
    );
  });

  it("uses a dedicated error type for callers", () => {
    expect(() => parseSupportServiceFormCsv("")).toThrow(
      SupportServiceFormCsvError,
    );
  });
});
