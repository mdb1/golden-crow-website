export type AppLanguage = "en" | "es";

export const LANGUAGE_STORAGE_KEY = "golden-crow-backoffice-language";
export const LANGUAGE_COOKIE_NAME = "golden-crow-backoffice-language";

export function isAppLanguage(
  value: string | null | undefined
): value is AppLanguage {
  return value === "en" || value === "es";
}

export function resolveAppLanguage(
  value: string | null | undefined
): AppLanguage {
  return isAppLanguage(value) ? value : "en";
}

export function toggleAppLanguage(language: AppLanguage): AppLanguage {
  return language === "en" ? "es" : "en";
}

const SPANISH_TEXT: Record<string, string> = {
  "Golden Crow": "Golden Crow",
  "Pocket Gyms": "Pocket Gyms",
  "GC Fitness": "GC Fitness",
  PocketGenes: "PocketGenes",
  Operator: "Operador",
  "Pocket Genes Admin": "Administración Pocket Genes",
  "Full admin": "Administrador total",
  "Institution admin": "Administrador de institución",
  "Institution doctor": "Médico de institución",
  Patient: "Paciente",
  "Light mode": "Modo claro",
  "Dark mode": "Modo oscuro",
  "Switch to dark mode": "Cambiar a modo oscuro",
  "Switch to light mode": "Cambiar a modo claro",
  Appearance: "Apariencia",
  "Sign out": "Cerrar sesión",
  "Signing out...": "Cerrando sesión...",
  Switch: "Cambiar",
  "Switch project": "Cambiar proyecto",
  "Switching...": "Cambiando...",
  "Switch to PocketGenes": "Cambiar a PocketGenes",
  "Switch to Pocket Gyms": "Cambiar a Pocket Gyms",
  "Coach operations console.": "Consola de operaciones del coach.",
  "Coach queues and athlete signals":
    "Colas del coach y señales de atletas",
  "Coach console": "Consola del coach",
  "Coach-facing queues, athlete signals, files, care-team context, and activity history that complement the user app.":
    "Colas del coach, señales de atletas, archivos, contexto del equipo de cuidado e historial de actividad que complementan la app del usuario.",
  "Coach dashboard": "Dashboard del coach",
  "Key coach-side metrics: athletes, active plans, and upcoming sessions.":
    "Métricas clave del lado del coach: atletas, planes activos y próximas sesiones.",
  "Athlete roster": "Roster de atletas",
  "Coach roster with profile, plan, evaluation, nutrition, and history access.":
    "Roster del coach con acceso a perfil, plan, evaluación, nutrición e historial.",
  "Athlete detail": "Detalle de atleta",
  "Athlete profile with coaching plans, evaluations, nutrition, and clinical history.":
    "Perfil del atleta con planes de coaching, evaluaciones, nutrición e historial clínico.",
  "Create and edit weekly coaching plans for an athlete.":
    "Crear y editar planes semanales de coaching para un atleta.",
  "Record a coach-side physical assessment for an athlete.":
    "Registrar una evaluación física del lado del coach para un atleta.",
  "Create and edit daily nutrition guidance for an athlete.":
    "Crear y editar guía nutricional diaria para un atleta.",
  "Coach availability": "Disponibilidad del coach",
  "Manage available training slots athletes can request.":
    "Gestionar turnos de entrenamiento disponibles que los atletas pueden solicitar.",
  "Session requests": "Solicitudes de sesión",
  "Review athlete bookings and their confirmation status.":
    "Revisar reservas de atletas y su estado de confirmación.",
  "Create and edit achievement definitions that coaches use to reinforce progress.":
    "Crear y editar logros que los coaches usan para reforzar el progreso.",
  "Create and edit challenge definitions for athlete motivation.":
    "Crear y editar desafíos para motivar atletas.",
  "Trainer coaching console.": "Consola de coaching para entrenadores.",
  "Readable operations console for the live Firebase model.":
    "Consola operativa legible para el modelo Firebase en vivo.",
  "Full admins can reach the global moderation surfaces and the institution-area model from the same shell.":
    "Los administradores totales pueden acceder a las superficies globales de moderación y al modelo por institución desde la misma consola.",
  "Institution admins stay scoped to one institution, its doctors, its patients, and local role assignments.":
    "Los administradores de institución permanecen limitados a una institución, sus médicos, sus pacientes y sus roles locales.",
  "Institution doctors stay scoped to one institution, their own doctor record, and their own patients.":
    "Los médicos de institución permanecen limitados a una institución, su propio registro médico y sus propios pacientes.",
  Mission: "Misión",
  Accounts: "Cuentas",
  Community: "Comunidad",
  Reports: "Reportes",
  Learning: "Aprendizaje",
  Areas: "Áreas",
  Access: "Acceso",
  Overview: "Resumen",
  "2PQ Dashboard": "Dashboard 2PQ",
  Contact: "Contacto",
  Forms: "Formularios",
  Profiles: "Perfiles",
  "Public Profiles": "Perfiles públicos",
  "Community Users": "Usuarios de comunidad",
  Posts: "Publicaciones",
  "Report Codes": "Códigos de reporte",
  Uploads: "Subidas",
  "File Storage": "Archivos almacenados",
  "Report Owners": "Responsables de reportes",
  Lessons: "Lecciones",
  Progress: "Progreso",
  Institutions: "Instituciones",
  Doctors: "Médicos",
  Patients: "Pacientes",
  "Roles & Permissions": "Roles y permisos",
  Dashboard: "Dashboard",
  "Coach Console": "Consola del coach",
  "Coach Dashboard": "Dashboard del coach",
  "Coach workload metrics": "Métricas de carga del coach",
  Athletes: "Atletas",
  "Roster and athlete profiles": "Roster y perfiles de atletas",
  "Coach schedule": "Agenda del coach",
  "Session availability and booking review":
    "Disponibilidad de sesiones y revisión de reservas",
  Programs: "Programas",
  "Motivation tools coaches manage":
    "Herramientas de motivación gestionadas por coaches",
  "Coach Availability": "Disponibilidad del coach",
  "Available training slots": "Turnos de entrenamiento disponibles",
  "Session Requests": "Solicitudes de sesión",
  "Bookings and status review": "Reservas y revisión de estado",
  Members: "Miembros",
  Scheduling: "Agenda",
  "Booking Slots": "Turnos disponibles",
  Bookings: "Reservas",
  Achievements: "Logros",
  Challenges: "Desafíos",
  "Workflow map and role-aware CRUD shell for cases, samples, shipments, sequencing, reports, and clients.":
    "Mapa de flujo y consola CRUD sensible a roles para casos, muestras, envíos, secuenciación, reportes y clientes.",
  "Stored study request and sample form submissions.":
    "Formularios almacenados de solicitud de estudio y muestra.",
  "Official 2PQ website, phone, and email contact channels.":
    "Canales oficiales de contacto de 2PQ: web, teléfono y email.",
  "Guided form flow stored in 2pq_forms.":
    "Flujo guiado de formulario almacenado en 2pq_forms.",
  "Study request": "Solicitud de estudio",
  Sample: "Muestra",
  "Patient information": "Información del paciente",
  "Medical information": "Información médica",
  "Previous genetic tests": "Pruebas genéticas previas",
  "Requested test": "Test solicitado",
  "Institution information": "Información de institución",
  "Sample information": "Información de muestra",
  "2PQ case": "Caso 2PQ",
  "2PQ sampling": "Muestreo 2PQ",
  Yes: "Sí",
  "Trophectoderm biopsy": "Biopsia de trofoectodermo",
  "Trophectoderm rebiopsy": "Rebiopsia de trofoectodermo",
  "Culture media": "Medio de cultivo",
  Other: "Otro",
  Active: "Activo",
  Inactive: "Inactivo",
  Intake: "Ingreso",
  Blocked: "Bloqueado",
  Reporting: "Reporte",
  Delivered: "Entregado",
  Routine: "Rutina",
  Priority: "Prioridad",
  Urgent: "Urgente",
  "Awaiting reception": "Esperando recepción",
  Received: "Recibido",
  Processing: "Procesando",
  "QC hold": "Retención QC",
  "Ready for sequencing": "Listo para secuenciación",
  "Validate form payload": "Validar datos del formulario",
  "Confirm every required field across the current form is complete.":
    "Confirmar que todos los campos requeridos del formulario estén completos.",
  "Save temporary draft checkpoint": "Guardar punto de control del borrador",
  "Persist the final in-progress state before handing it to storage.":
    "Persistir el último estado en progreso antes de enviarlo al almacenamiento.",
  "Link selected scoped patient": "Vincular paciente seleccionado",
  "Create scoped patient": "Crear paciente",
  "Use patient": "Usar paciente",
  "as the form patient.": "como paciente del formulario.",
  "as the sample patient.": "como paciente de la muestra.",
  "Create the scoped patient from step 1 and link it to the form.":
    "Crear el paciente desde el paso 1 y vincularlo al formulario.",
  "Create the scoped patient from step 1 and link it to the stored form.":
    "Crear el paciente desde el paso 1 y vincularlo al formulario almacenado.",
  "Link selected institution": "Vincular institución seleccionada",
  "Create scoped institution": "Crear institución",
  "Use institution": "Usar institución",
  "for the request.": "para la solicitud.",
  "Create the institution details provided in the request.":
    "Crear la institución con los datos cargados en la solicitud.",
  "Store joined 2PQ form": "Guardar formulario 2PQ unido",
  "Persist the final form document with patient, institution, and test payloads.":
    "Persistir el documento final con datos de paciente, institución y test.",
  "Clean temporary draft": "Limpiar borrador temporal",
  "Remove the one-user temporary draft after storage succeeds.":
    "Eliminar el borrador temporal del usuario cuando el guardado termine correctamente.",
  "Create sampling": "Crear muestreo",
  "Link this sampling to": "Vincular este muestreo a",
  "collection date, reception date, run ID, and QC status stay nil.":
    "fecha de colección, fecha de recepción, run ID y estado QC quedan nulos.",
  "Link selected requesting doctor": "Vincular médico solicitante seleccionado",
  "Create scoped requesting doctor": "Crear médico solicitante",
  "Use doctor": "Usar médico",
  "as requesting doctor.": "como médico solicitante.",
  "Create the scoped doctor from the manual requesting doctor fields.":
    "Crear el médico desde los campos manuales de médico solicitante.",
  "Link existing 2PQ case": "Vincular caso 2PQ existente",
  "Create 2PQ case": "Crear caso 2PQ",
  "Use case": "Usar caso",
  "after confirming it matches box code": "después de confirmar que coincide con código caja",
  "Create the case from step 4 and attach it to the patient, institution, and doctor.":
    "Crear el caso desde el paso 4 y asociarlo al paciente, la institución y el médico.",
  "Bind three-letter box code": "Vincular código caja de tres letras",
  "Store box code": "Guardar código caja",
  "as the case three_letter_code and keep the form linked to it.":
    "como three_letter_code del caso y mantener el formulario vinculado.",
  "Store the validated box code as the case three_letter_code.":
    "Guardar el código caja validado como three_letter_code del caso.",
  "Persist the form with linked patient, doctor, case, sample, and sampling records.":
    "Persistir el formulario con paciente, médico, caso, muestra y muestreos vinculados.",
  "Remove the one-user temporary draft after the final form is stored.":
    "Eliminar el borrador temporal del usuario cuando el formulario final quede guardado.",
  "Select an institution.": "Seleccioná una institución.",
  "Select a doctor.": "Seleccioná un médico.",
  "Enter a valid patient email.": "Ingresá un email de paciente válido.",
  "Patient full name is required.": "El nombre completo del paciente es requerido.",
  "Previous conceptions must be a whole number of 0 or more.":
    "Concepciones previas debe ser un número entero de 0 o más.",
  "Previous miscarriages must be a whole number of 0 or more.":
    "Abortos previos debe ser un número entero de 0 o más.",
  "Previous births must be a whole number of 0 or more.":
    "Nacimientos previos debe ser un número entero de 0 o más.",
  "Previous cycles must be a whole number of 0 or more.":
    "Ciclos previos debe ser un número entero de 0 o más.",
  "Select male factor.": "Seleccioná factor masculino.",
  "Other background is required.": "Otros antecedentes es requerido.",
  "Select PGT-A / PGT-SR.": "Seleccioná PGT-A / PGT-SR.",
  "Select karyotype.": "Seleccioná cariotipo.",
  "PGT result is required when PGT-A / PGT-SR is Yes.":
    "Resultado PGT es requerido cuando PGT-A / PGT-SR es Sí.",
  "Karyotype result is required when karyotype is Yes.":
    "Resultado cariotipo es requerido cuando cariotipo es Sí.",
  "Select PGT-A.": "Seleccioná PGT-A.",
  "Select PGT-SR.": "Seleccioná PGT-SR.",
  "Select Yes for at least one requested test.":
    "Seleccioná Sí para al menos un test solicitado.",
  "Select reports mosaicism.": "Seleccioná informa mosaicismos.",
  "Select reports sex.": "Seleccioná informa sexo.",
  "Request reason is required.": "Motivo de solicitud es requerido.",
  "Date is required.": "Fecha es requerida.",
  "Birth date must be a valid date.":
    "Fecha de nacimiento debe ser una fecha válida.",
  "Date must be a valid date.": "Fecha debe ser una fecha válida.",
  "Institution name is required.": "Nombre de institución es requerido.",
  "Enter a valid institution contact email.":
    "Ingresá un email de contacto de institución válido.",
  "FIV center is required.": "Centro FIV es requerido.",
  "Center code is required.": "Código centro es requerido.",
  "Full name is required.": "Nombre completo es requerido.",
  "Auth email must be valid.": "Email de autenticación debe ser válido.",
  "Sample type is required.": "Tipo de muestra es requerido.",
  "Sample type is not valid.": "Tipo de muestra no es válido.",
  "First name is required.": "Nombre es requerido.",
  "Last name is required.": "Apellido es requerido.",
  "Process date is required.": "Fecha proceso es requerida.",
  "Process date must be a valid date.":
    "Fecha proceso debe ser una fecha válida.",
  "Box code is required.": "Código caja es requerido.",
  "Box code must be exactly three letters (A-Z).":
    "Código caja debe tener exactamente tres letras (A-Z).",
  "2PQ case label is required.": "Etiqueta del caso 2PQ es requerida.",
  "Select a 2PQ case status.": "Seleccioná un estado de caso 2PQ.",
  "Case status is not valid.": "Estado del caso no es válido.",
  "Priority is not valid.": "Prioridad no es válida.",
  "Requested at is required for a new 2PQ case.":
    "Solicitado el es requerido para un nuevo caso 2PQ.",
  "Requested at must be a valid date.":
    "Solicitado el debe ser una fecha válida.",
  "Due at must be a valid date.": "Vence el debe ser una fecha válida.",
  "Add at least one 2PQ sampling record.":
    "Agregá al menos un registro de muestreo 2PQ.",
  Sampling: "Muestreo",
  "Sample ID is required.": "Sample ID es requerido.",
  "Sample ID must be unique in this form.":
    "Sample ID debe ser único en este formulario.",
  "Select processing status.": "Seleccioná estado de procesamiento.",
  "Processing status is not valid.":
    "Estado de procesamiento no es válido.",
  "Selected institution is not available in the current lookup data.":
    "La institución seleccionada no está disponible en los datos actuales.",
  "Selected doctor is not available in the current lookup data.":
    "El médico seleccionado no está disponible en los datos actuales.",
  "Selected doctor must belong to the selected institution.":
    "El médico seleccionado debe pertenecer a la institución seleccionada.",
  "Selected patient is not available in the current lookup data.":
    "El paciente seleccionado no está disponible en los datos actuales.",
  "Selected patient must belong to the selected institution and doctor.":
    "El paciente seleccionado debe pertenecer a la institución y al médico seleccionados.",
  "Selected institution must match the form institution scope.":
    "La institución seleccionada debe coincidir con el alcance institucional del formulario.",
  "Selected requesting doctor is not available in the current lookup data.":
    "El médico solicitante seleccionado no está disponible en los datos actuales.",
  "Selected requesting doctor must belong to the selected institution.":
    "El médico solicitante seleccionado debe pertenecer a la institución seleccionada.",
  "Selected 2PQ case is not available in the current lookup data.":
    "El caso 2PQ seleccionado no está disponible en los datos actuales.",
  "Selected 2PQ case must belong to the selected institution and doctor.":
    "El caso 2PQ seleccionado debe pertenecer a la institución y al médico seleccionados.",
  "Selected 2PQ case is already linked to an existing patient. Pick that patient or create a new case.":
    "El caso 2PQ seleccionado ya está vinculado a un paciente existente. Elegí ese paciente o creá un caso nuevo.",
  "Selected 2PQ case must belong to the selected patient.":
    "El caso 2PQ seleccionado debe pertenecer al paciente seleccionado.",
  "Selected 2PQ case must match the validated box code.":
    "El caso 2PQ seleccionado debe coincidir con el código caja validado.",
  "Case label must start with the validated box code.":
    "La etiqueta del caso debe comenzar con el código caja validado.",
  "Box code": "Código caja",
  Validated: "Validado",
  "Required first": "Requerido primero",
  "Three-letter code": "Código de tres letras",
  "Exactly three letters. Numbers and special characters are not accepted.":
    "Exactamente tres letras. No se aceptan números ni caracteres especiales.",
  "Linked caja request": "Solicitud vinculada a caja",
  "This sample request will be linked to the validated three-letter caja code. It is shown read-only here before the 2PQ case is created or selected.":
    "Esta solicitud de muestra se vinculará al código caja validado de tres letras. Se muestra solo lectura antes de crear o seleccionar el caso 2PQ.",
  Select: "Seleccionar",
  "Unable to save the form draft.": "No se pudo guardar el borrador del formulario.",
  "Unable to prepare the form draft.":
    "No se pudo preparar el borrador del formulario.",
  Form: "Formulario",
  "stored.": "guardado.",
  "Unable to store the form. Review the form and try again.":
    "No se pudo guardar el formulario. Revisá el formulario e intentá nuevamente.",
  "Unable to store the form.": "No se pudo guardar el formulario.",
  "Whole data validation found issues before storage.":
    "La validación completa encontró problemas antes del guardado.",
  "2PQ form storage": "Guardado de formulario 2PQ",
  "Phase 1 validates the whole document. Phase 2 stores the scoped records and linked 2PQ entities.":
    "La fase 1 valida todo el documento. La fase 2 guarda los registros de alcance y las entidades 2PQ vinculadas.",
  "2PQ form storage processing": "Procesamiento de guardado del formulario 2PQ",
  "The form is being stored with its scoped records and linked 2PQ entities.":
    "El formulario se está guardando con sus registros de alcance y entidades 2PQ vinculadas.",
  "Phase 1": "Fase 1",
  "Whole data validation": "Validación completa de datos",
  "Checking required fields, formats, linked records, and cross-step consistency.":
    "Revisando campos requeridos, formatos, registros vinculados y consistencia entre pasos.",
  "No missing or malformed data was found. Storage processing can continue.":
    "No se encontraron datos faltantes o mal formados. El guardado puede continuar.",
  "Fix these issues before storage processing starts.":
    "Corregí estos problemas antes de iniciar el guardado.",
  "Running whole document validation.":
    "Ejecutando validación completa del documento.",
  "Whole data validation passed.": "La validación completa fue exitosa.",
  "Phase 2": "Fase 2",
  "Process progress": "Progreso del proceso",
  "Storage paused on the blocked checklist item.":
    "El almacenamiento se pausó en el elemento bloqueado de la lista.",
  "stored. Redirecting to forms.": "guardado. Redirigiendo a formularios.",
  "Preparing the storage checklist.": "Preparando lista de guardado.",
  Completed: "Completado",
  Pending: "Pendiente",
  pending: "pendiente",
  running: "en curso",
  success: "completo",
  error: "error",
  "Close and review form": "Cerrar y revisar formulario",
  "Close and review data": "Cerrar y revisar datos",
  "Back to forms": "Volver a formularios",
  "Recovered draft": "Borrador recuperado",
  "Saving draft": "Guardando borrador",
  "Pick existing patient": "Elegir paciente existente",
  "Select patient": "Seleccionar paciente",
  "Manual patient information": "Información manual de paciente",
  Institution: "Institución",
  "Select institution": "Seleccionar institución",
  "No institution": "Sin institución",
  Doctor: "Médico",
  "Select doctor": "Seleccionar médico",
  "No doctor": "Sin médico",
  Email: "Email",
  "Full name": "Nombre completo",
  "Medical record number": "Número de historia clínica",
  "Birth date": "Fecha de nacimiento",
  "Sex / gender": "Sexo / género",
  Status: "Estado",
  "Select status": "Seleccionar estado",
  Notes: "Notas",
  "Previous conceptions": "Concepciones previas",
  "Previous miscarriages": "Abortos previos",
  "Previous births": "Nacimientos previos",
  "Previous cycles": "Ciclos previos",
  "Male factor": "Factor masculino",
  "Other background": "Otros antecedentes",
  Karyotype: "Cariotipo",
  "PGT result": "Resultado PGT",
  "Karyotype result": "Resultado cariotipo",
  "Reports mosaicism": "Informa mosaicismos",
  "Reports sex": "Informa sexo",
  "Request reason": "Motivo de solicitud",
  Date: "Fecha",
  "Pick existing institution": "Elegir institución existente",
  "Manual institution information": "Información manual de institución",
  "Institution code": "Código de institución",
  "Institution name": "Nombre de institución",
  "Legal name": "Razón social",
  "Contact email": "Email de contacto",
  "Contact phone": "Teléfono de contacto",
  "Address line 1": "Dirección línea 1",
  "Address line 2": "Dirección línea 2",
  City: "Ciudad",
  "State / region": "Provincia / región",
  Country: "País",
  "FIV center": "Centro FIV",
  "Center code": "Código centro",
  "Requesting doctor": "Médico solicitante",
  "Pick existing doctor": "Elegir médico existente",
  "Select requesting doctor": "Seleccionar médico solicitante",
  "Manual requesting doctor information":
    "Información manual de médico solicitante",
  "Auth email": "Email de autenticación",
  "Auth UID": "UID de autenticación",
  Specialty: "Especialidad",
  "License number": "Matrícula",
  "Sample type": "Tipo de muestra",
  "Process date": "Fecha proceso",
  "Processed by": "Procesado por",
  "First name": "Nombre",
  "Last name": "Apellido",
  "Pick existing 2PQ case": "Elegir caso 2PQ existente",
  "Select 2PQ case": "Seleccionar caso 2PQ",
  "Create a new 2PQ case from these fields":
    "Crear un nuevo caso 2PQ con estos campos",
  "Case label": "Etiqueta del caso",
  "Case status": "Estado del caso",
  "Case type": "Tipo de caso",
  "Select priority": "Seleccionar prioridad",
  "Tracking number": "Número de seguimiento",
  "Requested at": "Solicitado el",
  "Due at": "Vence el",
  "Case notes": "Notas del caso",
  "Sample ID": "Sample ID",
  "Processing status": "Estado de procesamiento",
  "Sampling notes": "Notas de muestreo",
  Remove: "Quitar",
  "Add sampling": "Agregar muestreo",
  "No institution selected": "Sin institución seleccionada",
  Previous: "Anterior",
  "Store form": "Guardar formulario",
  "Storing...": "Guardando...",
  Continue: "Continuar",
  "No stored forms yet.": "Todavía no hay formularios guardados.",
  "Unnamed patient": "Paciente sin nombre",
  Author: "Autor",
  Archived: "Archivado",
  Open: "Abrir",
  Delete: "Eliminar",
  Archive: "Archivar",
  "Delete form": "Eliminar formulario",
  "Archive form": "Archivar formulario",
  "This permanently deletes": "Esto elimina permanentemente",
  "from 2pq_forms. Linked 2PQ case or sampling records are kept. This is only available to full admins.":
    "de 2pq_forms. El caso 2PQ o los muestreos vinculados se conservan. Esto solo está disponible para administradores totales.",
  "This archives": "Esto archiva",
  "so it leaves the default forms list. It can still be reviewed when archived forms are shown.":
    "para que salga de la lista predeterminada de formularios. Aún puede revisarse cuando se muestran formularios archivados.",
  Cancel: "Cancelar",
  "Working...": "Trabajando...",
  "was deleted.": "fue eliminado.",
  "was archived.": "fue archivado.",
  "Unable to update this form.": "No se pudo actualizar este formulario.",
  "Form completed": "Formulario completado",
  "The 2PQ form is stored and ready":
    "El formulario 2PQ está guardado y listo",
  "is now in": "ahora está en",
  "with its author, scope, and linked records preserved.":
    "con su autor, alcance y registros vinculados preservados.",
  "Open completed form": "Abrir formulario completado",
  "See all forms": "Ver todos los formularios",
  "Pocket Genes Admin operations console.":
    "Consola operativa de administración Pocket Genes.",
};

export function appText(language: AppLanguage, text: string): string {
  return language === "es" ? SPANISH_TEXT[text] ?? text : text;
}
