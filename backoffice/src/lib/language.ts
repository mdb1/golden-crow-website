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
  "+ New Institution": "Alta de institución",
  "+ New Doctor": "Alta de médico",
  "+ New Patient": "Alta de paciente",
  "+ New Role": "Alta de rol",
  "New institution": "Alta de institución",
  "New doctor": "Alta de médico",
  "New patient": "Alta de paciente",
  "New role assignment": "Alta de rol",
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
  "My account": "Mi cuenta",
  "Current operator role and Firebase Auth details":
    "Rol actual del operador y detalles de Firebase Auth",
  "Current operator role assignment, permissions, and Firebase Auth details.":
    "Asignación de rol, permisos y detalles de Firebase Auth del operador actual.",
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
    "Formularios almacenados de solicitud de estudio y biopsias.",
  "Official 2PQ website, phone, and email contact channels.":
    "Canales oficiales de contacto de 2PQ: web, teléfono y email.",
  "Guided form flow stored in 2pq_forms.":
    "Flujo guiado de formulario almacenado en 2pq_forms.",
  "Study request": "Solicitud de estudio",
  Sample: "Formulario de biopsias",
  "Biopsy form": "Formulario de biopsias",
  "Biopsy form preview": "Vista previa del formulario de biopsias",
  "Biopsy form information": "Información del formulario de biopsias",
  "Patient information": "Información del paciente",
  "Medical information": "Información médica",
  "Previous genetic tests": "Pruebas genéticas previas",
  "Requested test": "Test solicitado",
  "Institution information": "Información de institución",
  "Preview and signature": "Vista previa y firma",
  "Pick linked study request form": "Elegir formulario de solicitud linkeado",
  "Sample information": "Información de biopsia",
  "2PQ case": "Caso 2PQ",
  "2PQ sampling": "Biopsias 2PQ",
  "Biopsy table": "Tabla de biopsias",
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
  "Create the case from the 2PQ case step and attach it to the patient, institution, and doctor.":
    "Crear el caso desde el paso de caso 2PQ y asociarlo al paciente, la institución y el médico.",
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
  "Doctor is required": "Médico requerido",
  "The patient must always belong to a doctor from the institution. The doctor signs the document and is responsible for the form, so this field cannot be empty.":
    "El paciente siempre debe pertenecer a un médico de la institución. El médico firma el documento y se hace responsable del formulario, por lo tanto este campo no puede estar vacío.",
  Understood: "Entendido",
  "Enter a valid patient email.": "Ingresá un email de paciente válido.",
  "Enter a valid patient reference email.":
    "Ingresá un mail de referencia del paciente válido.",
  "Patient full name is required.": "El nombre completo del paciente es requerido.",
  "Patient first name is required.": "El nombre del paciente es requerido.",
  "Patient last name is required.": "El apellido del paciente es requerido.",
  "Partner birth date must be a valid date.":
    "La fecha de nacimiento de la pareja debe ser una fecha válida.",
  "Sperm gamete source is not valid.":
    "El origen del esperma no es válido.",
  "Oocyte gamete source is not valid.":
    "El origen de los ovocitos no es válido.",
  "Select previous miscarriages.": "Seleccioná abortos previos.",
  "Previous miscarriages selection is not valid.":
    "La selección de abortos previos no es válida.",
  "Select male factor.": "Seleccioná factor masculino.",
  "Other background is required.": "Observaciones es requerido.",
  "Observations are required.": "Observaciones es requerido.",
  "Select PGT-A / PGT-SR.": "Seleccioná PGT-A / PGT-SR.",
  "Select karyotype.": "Seleccioná cariotipo.",
  "PGT result is required when PGT-A / PGT-SR is Yes.":
    "Resultado PGT es requerido cuando PGT-A / PGT-SR es Sí.",
  "Karyotype result is required when karyotype is Yes.":
    "Resultado cariotipo es requerido cuando cariotipo es Sí.",
  "Karyotype result is required.": "Resultado cariotipo es requerido.",
  "Select whether there is karyotype information.":
    "Seleccioná si tiene información de cariotipo.",
  "Attach the karyotype file.": "Adjuntá el archivo de cariotipo.",
  "Select one requested test.": "Seleccioná un test solicitado.",
  "Select only one requested test.": "Seleccioná solo un test solicitado.",
  "Select PGT-A.": "Seleccioná PGT-A.",
  "Select PGT-A FAST.": "Seleccioná PGT-A FAST.",
  "Select PGT-A STANDARD.": "Seleccioná PGT-A STANDARD.",
  "Select PGT-SR.": "Seleccioná PGT-SR.",
  "Select Yes for at least one requested test.":
    "Seleccioná Sí para al menos un test solicitado.",
  "Select PGT-A FAST reports mosaicism.":
    "Seleccioná informa mosaicismo para PGT-A FAST.",
  "Select PGT-A FAST reports sex.":
    "Seleccioná informa sexo para PGT-A FAST.",
  "Select PGT-A STANDARD reports mosaicism.":
    "Seleccioná informa mosaicismo para PGT-A STANDARD.",
  "Select PGT-A STANDARD reports sex.":
    "Seleccioná informa sexo para PGT-A STANDARD.",
  "Select PGT-SR reports mosaicism.":
    "Seleccioná informa mosaicismo para PGT-SR.",
  "Select PGT-SR reports sex.": "Seleccioná informa sexo para PGT-SR.",
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
  "Select a 2PQ case type.": "Seleccioná un tipo de caso 2PQ.",
  "Case type is not valid.": "El tipo de caso no es válido.",
  "Priority is required.": "La prioridad es requerida.",
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
  "Select a linked study request form.":
    "Seleccioná un formulario de solicitud linkeado.",
  "Linked study request form is not available in the current lookup data.":
    "El formulario de solicitud linkeado no está disponible en los datos actuales.",
  "Linked study request form must match the patient institution and doctor.":
    "El formulario de solicitud linkeado debe coincidir con la institución y el médico del paciente.",
  "Linked study request form must match the selected patient.":
    "El formulario de solicitud linkeado debe coincidir con el paciente seleccionado.",
  "Select number of biopsies.": "Seleccioná el número de biopsias.",
  "Required field.": "Campo obligatorio.",
  "Stage day must be 5, 6 or 7.": "El estadio día debe ser 5, 6 o 7.",
  "Morphology must be 1 to 3 alphanumeric characters.":
    "La morfología debe tener de 1 a 3 caracteres alfanuméricos.",
  "Biopsy table validation failed.":
    "Falló la validación de la tabla de biopsias.",
  "Complete every required cell and fix cells that do not match their validation criteria before opening preview.":
    "Completá todas las celdas obligatorias y corregí las que no cumplen con sus criterios antes de abrir la vista previa.",
  "Additional table issues": "Errores adicionales en la tabla",
  "Generate the sampling table.": "Generá la tabla de samplings.",
  "Sampling table row count must match number of biopsies plus two.":
    "La cantidad de filas de la tabla debe ser número de biopsias más dos.",
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
  "Requesting doctor is required.":
    "El médico solicitante es requerido.",
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
  "Unknown error": "Error desconocido",
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
  "Linked study request form": "Formulario de solicitud linkeado",
  "Select linked study request form":
    "Seleccionar formulario de solicitud linkeado",
  "Link study request form": "Vincular formulario de solicitud",
  "Use form": "Usar formulario",
  "as the linked study request.": "como solicitud de estudio linkeada.",
  "Confirm the sample has a linked study request form.":
    "Confirmar que la muestra tiene un formulario de solicitud linkeado.",
  "Persist the form with linked study request, patient, case, sample, and sampling records.":
    "Persistir el formulario con solicitud linkeada, paciente, caso, muestra y registros de muestreo.",
  "Select patient": "Seleccionar paciente",
  "Manual patient information": "Información manual de paciente",
  Institution: "Institución",
  "Select institution": "Seleccionar institución",
  "No institution": "Sin institución",
  Doctor: "Médico",
  "Select doctor": "Seleccionar médico",
  "No doctor": "Sin médico",
  Email: "Email",
  "Study request form": "Formulario de solicitud",
  "Patient reference email": "Mail de referencia del paciente",
  "Patient first name": "Nombre del paciente",
  "Patient last name": "Apellido del paciente",
  "Patient DNI": "DNI del paciente",
  "Patient birth date": "Fecha de nacimiento del paciente",
  "Patient notes": "Notas del paciente",
  "Includes partner information": "Incluye información de pareja",
  Partner: "Pareja",
  "Partner first name": "Nombre de la pareja",
  "Partner last name": "Apellido de la pareja",
  "Partner DNI": "DNI de la pareja",
  "Partner birth date": "Fecha de nacimiento de la pareja",
  "Partner notes": "Notas de la pareja",
  "Full name": "Nombre completo",
  "Medical record number": "Número de historia clínica",
  "Birth date": "Fecha de nacimiento",
  "Sex / gender": "Sexo / género",
  Status: "Estado",
  "Select status": "Seleccionar estado",
  Notes: "Notas",
  "Previous miscarriages": "Abortos previos",
  "Gamete donation": "Donación de gametas",
  Sperm: "Esperma",
  Oocytes: "Ovocitos",
  Own: "Propio",
  Donated: "Donado",
  "Not set": "Sin definir",
  "3 or more": "3 o más",
  "3 or more (recurrent)": "3 o más (recurrente)",
  Recurrent: "Recurrente",
  "Male factor": "Factor masculino",
  "Other background": "Observaciones",
  Observations: "Observaciones",
  "Male factor is selected. Specify the type of male factor in observations.":
    "Factor masculino está marcado. Indicá el tipo de factor masculino en observaciones.",
  Karyotype: "Cariotipo",
  "Has karyotype information?": "¿Tiene información de cariotipo?",
  "PGT result": "Resultado PGT",
  "Karyotype result": "Resultado cariotipo",
  "PGT-A FAST reports mosaicism": "PGT-A FAST informa mosaicismo",
  "PGT-A FAST reports sex": "PGT-A FAST informa sexo",
  "PGT-A STANDARD reports mosaicism": "PGT-A STANDARD informa mosaicismo",
  "PGT-A STANDARD reports sex": "PGT-A STANDARD informa sexo",
  "PGT-SR reports mosaicism": "PGT-SR informa mosaicismo",
  "PGT-SR reports sex": "PGT-SR informa sexo",
  "Karyotype file": "Archivo cariotipo",
  "Karyotype attached image": "Imagen adjunta de cariotipo",
  "Karyotype file name": "Nombre de archivo cariotipo",
  "Karyotype file type": "Tipo de archivo cariotipo",
  "Karyotype file size": "Tamaño de archivo cariotipo",
  "Karyotype file is too large.":
    "El archivo de cariotipo es demasiado grande.",
  "Unable to read karyotype file.":
    "No se pudo leer el archivo de cariotipo.",
  "No file selected": "Sin archivo seleccionado",
  "Upload file": "Cargar archivo",
  "Remove file": "Quitar archivo",
  "Maximum file size: 750 KB.": "Tamaño máximo del archivo: 750 KB.",
  "Reports mosaicism": "Informa mosaicismos",
  "Reports sex": "Informa sexo",
  "Request reason": "Motivo de solicitud",
  Date: "Fecha",
  "Pick existing institution": "Elegir institución existente",
  "Manual institution information": "Información manual de institución",
  "Institution ID": "ID de institución",
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
  "Doctor Information": "Información del médico",
  "Doctor ID": "ID del médico",
  "Pick existing doctor": "Elegir médico existente",
  "Select requesting doctor": "Seleccionar médico solicitante",
  "Manual requesting doctor information":
    "Información manual de médico solicitante",
  "Auth email": "Email de autenticación",
  "Auth UID": "UID de autenticación",
  Specialty: "Especialidad",
  "License number": "Matrícula",
  "Sample type": "Tipo de muestra",
  "Number of biopsies": "Número de biopsias",
  "Generate table": "Generar tabla",
  "Generate the biopsy table from the previous step.":
    "Generá la tabla de biopsias desde el paso anterior.",
  "(*): Required field": "(*): Campo obligatorio",
  "Sampling table": "Tabla de samplings",
  "Biopsy rows": "Filas de biopsias",
  "Internal code": "Código interno",
  "Stage day 5, 6 or 7": "Estadio día 5, 6 o 7",
  Morphology: "Morfología",
  "Sent uL": "uL enviados",
  "Biopsied cells": "# de células biopsiadas",
  "Cells visualized?": "¿Células visualizadas?",
  Comments: "Comentarios",
  Row: "Fila",
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
  "Select case type": "Seleccionar tipo de caso",
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
  "Continue to preview": "Continuar a vista previa",
  "Preview validation": "Validación para vista previa",
  "The form validates steps 1 to 5 before opening the read-only preview.":
    "El formulario valida los pasos 1 a 5 antes de abrir la vista previa de solo lectura.",
  "Validating steps 1 to 5 before opening preview.":
    "Validando los pasos 1 a 5 antes de abrir la vista previa.",
  "Steps 1 to 5 passed validation. Saving draft checkpoint.":
    "Los pasos 1 a 5 pasaron la validación. Guardando checkpoint de borrador.",
  "Steps 1 to 5 passed validation. Opening preview.":
    "Los pasos 1 a 5 pasaron la validación. Abriendo vista previa.",
  "Fix these issues before opening the preview.":
    "Corregí estos problemas antes de abrir la vista previa.",
  "Preview validation found issues.":
    "La validación para vista previa encontró problemas.",
  "Preview validation passed, but the draft checkpoint could not be saved.":
    "La validación para vista previa fue exitosa, pero no se pudo guardar el checkpoint del borrador.",
  "draft checkpoint failed": "falló el checkpoint del borrador",
  "Draft checkpoint failed": "Falló el checkpoint del borrador",
  "The information passed validation, but the draft checkpoint failed. You can open the preview anyway; final submission will try to save again and may show the same backend error.":
    "La información pasó la validación, pero falló el checkpoint del borrador. Podés abrir la vista previa de todos modos; el envío final intentará guardar nuevamente y puede mostrar el mismo error de backend.",
  "Technical details": "Detalles técnicos",
  "Go to first issue": "Ir al primer problema",
  "Open preview anyway": "Abrir vista previa igual",
  "Study request form preview": "Vista previa del formulario de solicitud",
  "This preview is read-only. Go back to previous steps to make changes before signing.":
    "Esta vista previa es de solo lectura. Volvé a los pasos anteriores para hacer cambios antes de firmar.",
  "Patient data": "Datos del paciente",
  "Medical data": "Información médica",
  "Requested tests": "Tests solicitados",
  "Requested test and karyotype": "Test solicitado y cariotipo",
  "Karyotype and attachments": "Cariotipo y adjuntos",
  "Institution data": "Datos de institución",
  "Signature and submission": "Firma y envío",
  "By signing, the responsible doctor confirms the information shown here.":
    "Al firmar, el médico responsable confirma la información que se muestra aquí.",
  "After submission, the form cannot be changed. If you find an error after sending it, contact 2PQ directly so they can correct it.":
    "Una vez enviado, el formulario no se puede cambiar. Si encontrás un error después del envío, deberás comunicarte directamente con 2PQ para subsanarlo.",
  "Sign and send form": "Firmar y enviar formulario",
  "Sending...": "Enviando...",
  "Not provided": "No informado",
  "Store form": "Guardar formulario",
  "Storing...": "Guardando...",
  Continue: "Continuar",
  "No stored forms yet.": "Todavía no hay formularios guardados.",
  "No forms match these filters.": "No hay formularios que coincidan con estos filtros.",
  "Unnamed patient": "Paciente sin nombre",
  Author: "Autor",
  Archived: "Archivado",
  Open: "Abrir",
  "Search by patient": "Buscar por paciente",
  "Name, email or DNI": "Nombre, email o DNI",
  From: "Desde",
  To: "Hasta",
  "Form type": "Tipo de formulario",
  "All types": "Todos los tipos",
  "Sample request": "Formulario de biopsias",
  "Selected requested test": "Test solicitado seleccionado",
  "Original requested test": "Test solicitado original",
  "Change warning": "Aviso de cambio",
  "The biopsy form test is different from the linked study request test.":
    "El test del formulario de biopsias es distinto del test de la solicitud de estudio vinculada.",
  "No changes from linked study request.":
    "Sin cambios respecto de la solicitud de estudio vinculada.",
  "Study creation date": "Fecha de creación del estudio",
  "Apply filters": "Aplicar filtros",
  "Clear filters": "Limpiar filtros",
  "Newest first": "Más nuevos primero",
  "Oldest first": "Más antiguos primero",
  "Show archived": "Mostrar archivados",
  "Hide archived": "Ocultar archivados",
  "Load more": "Cargar más",
  "Loading...": "Cargando...",
  "forms shown": "formularios mostrados",
  "Unable to load stored forms.": "No se pudieron cargar los formularios guardados.",
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
  "The biopsy form is ready and stored":
    "El formulario de biopsias está listo y guardado",
  "is now in": "ahora está en",
  "with its author, scope, and linked records preserved.":
    "con su autor, alcance y registros vinculados preservados.",
  "Open completed form": "Abrir formulario completado",
  "See all forms": "Ver todos los formularios",
  "2PQ Case": "Caso 2PQ",
  "2PQ Case and sampling records": "Caso 2PQ y registros de muestreo",
  "2PQ Cases": "Casos 2PQ",
  "2PQ circuit": "Circuito 2PQ",
  "2PQ contact information": "Información de contacto 2PQ",
  "2PQ forms": "Formularios 2PQ",
  "2PQ Providers": "Prestadores 2PQ",
  "2PQ record": "Registro 2PQ",
  "2PQ Reports": "Reportes 2PQ",
  "2PQ reports are separate from the legacy reports module.":
    "Los reportes 2PQ están separados del módulo histórico de reportes.",
  "2PQ Sampling": "Muestreo 2PQ",
  "2PQ Sequencing": "Secuenciación 2PQ",
  "2PQ Shipments": "Envíos 2PQ",
  "6 character codes to be generated": "códigos de 6 caracteres por generar",
  "6-character file name": "Nombre de archivo de 6 caracteres",
  "A doctor can read the whole institution later, but the institution link itself stays singular and explicit from creation onward.":
    "Un médico podrá leer toda la institución más adelante, pero el vínculo institucional queda único y explícito desde la creación.",
  "A fresh report code and uploaded-report link will be created.":
    "Se creará un nuevo código de reporte y un vínculo al reporte subido.",
  "A random candidate is ready. If you want another option before saving, generate a new suggestion.":
    "Hay una opción aleatoria lista. Si querés otra antes de guardar, generá una nueva sugerencia.",
  "A role-by-role explainer for what each assignment can do, where it is scoped, and where the boundary stops.":
    "Una explicación rol por rol de qué puede hacer cada asignación, cuál es su alcance y dónde termina el límite.",
  "A stored file is already linked to this case.":
    "Ya hay un archivo almacenado vinculado a este caso.",
  "A unique three-letter shorthand for this 2PQ case. Use it as a quick visual identifier when operators need a short code instead of the full case label.":
    "Una abreviatura única de tres letras para este caso 2PQ. Usala como identificador visual rápido cuando el operador necesite un código corto en lugar de la etiqueta completa del caso.",
  access: "acceso",
  "Access and communication": "Acceso y comunicación",
  "Access review and doctor creation now start from their own dedicated screens instead of this main area page.":
    "La revisión de acceso y el alta de médico ahora comienzan desde pantallas dedicadas, no desde esta página principal del área.",
  "Access review and institution creation now start from their own dedicated screens instead of this main area page.":
    "La revisión de acceso y el alta de institución ahora comienzan desde pantallas dedicadas, no desde esta página principal del área.",
  "Access review and patient creation now start from their own dedicated screens instead of this main area page.":
    "La revisión de acceso y el alta de paciente ahora comienzan desde pantallas dedicadas, no desde esta página principal del área.",
  "Access review and record creation now start from their own dedicated screens instead of this main area page.":
    "La revisión de acceso y la creación de registros ahora comienzan desde pantallas dedicadas, no desde esta página principal del área.",
  "Access status": "Estado de acceso",
  "Accounts and Community": "Cuentas y comunidad",
  Action: "Acción",
  "Add doctor": "Agregar médico",
  "Add manually": "Agregar manualmente",
  "Add multiple samplings at once": "Agregar varios muestreos a la vez",
  "Add new record": "Alta de registro",
  "Add new role assignment": "Alta de rol",
  "Add patient": "Agregar paciente",
  "Add three letter code": "Agregar código de tres letras",
  admins: "administradores",
  "After creation, replace, update, and delete become available on the detail screen.":
    "Después de crear, reemplazar, actualizar y eliminar quedan disponibles en la pantalla de detalle.",
  All: "Todos",
  "All scoped areas": "Todas las áreas con alcance",
  "All submitted form flows are stored as joined documents here.":
    "Todos los flujos de formularios enviados se almacenan acá como documentos unificados.",
  Allowed: "Permitido",
  "An existing report record will be synchronized to this stored file.":
    "Se sincronizará un registro de reporte existente con este archivo almacenado.",
  "and stays available here for quick reference.":
    "y queda disponible acá como referencia rápida.",
  "and stored file": "y archivo almacenado",
  "and the file name will stay synced to this stored file snapshot.":
    "y el nombre de archivo quedará sincronizado con esta captura de archivo almacenado.",
  Apply: "Aplicar",
  "Archived visible": "Archivados visibles",
  Assigned: "Asignado",
  "Assigned lane": "Carril asignado",
  "Assigned scope": "Alcance asignado",
  "at an unknown time": "en un momento desconocido",
  "Attach an existing case to this sequencing batch. If the case already belongs to another batch, it will be moved.":
    "Vinculá un caso existente a este lote de secuenciación. Si el caso ya pertenece a otro lote, se moverá.",
  "Attach an existing sampling record to this case. If it already belongs to another case, it will be moved.":
    "Vinculá un registro de muestreo existente a este caso. Si ya pertenece a otro caso, se moverá.",
  Attempt: "Intento",
  "Auth uid": "UID de autenticación",
  "Auto Sampling Creation Modal": "Modal de creación automática de muestreos",
  "Auto sampling paused": "Creación automática de muestreos pausada",
  "Awaiting confirmation": "Esperando confirmación",
  "Back to": "Volver a",
  "Back to dashboard": "Volver al dashboard",
  "Back to doctors": "Volver a médicos",
  "Back to institutions": "Volver a instituciones",
  "Back to patients": "Volver a pacientes",
  "Back to roles": "Volver a roles",
  "Backoffice role email associated with this provider lane.":
    "Email de rol de backoffice asociado a este carril de prestador.",
  Batch: "Lote",
  "Batch / Run ID": "ID de lote / corrida",
  "Batch label": "Etiqueta del lote",
  "Batch state": "Estado del lote",
  "Build a fresh JSON snapshot from the current case, its linked batch, and its child samplings, then update the existing file_storage record in place.":
    "Construí una nueva captura JSON desde el caso actual, su lote vinculado y sus muestreos hijos, y actualizá el registro file_storage existente.",
  "Build a JSON snapshot from the current case, its linked batch, and its child samplings, then publish that snapshot into the reusable file storage collection.":
    "Construí una captura JSON desde el caso actual, su lote vinculado y sus muestreos hijos, y publicala en la colección reutilizable de archivos.",
  "Bulk sampling update completed": "Actualización masiva de muestreos completada",
  Carrier: "Transportista",
  Case: "Caso",
  "Case identifier linked to sampling.": "Identificador de caso vinculado al muestreo.",
  "Case intake and orchestration records stored in Firebase under `2pq_case`.":
    "Registros de ingreso y orquestación de casos almacenados en Firebase bajo `2pq_case`.",
  "Case label must match the active three letter code. Expected value:":
    "La etiqueta del caso debe coincidir con el código activo de tres letras. Valor esperado:",
  "Case records are now live Firebase documents.":
    "Los registros de caso ahora son documentos activos de Firebase.",
  "Case state": "Estado del caso",
  "Cases / samples / shipments": "Casos / muestras / envíos",
  "Change batch": "Cambiar lote",
  "Change case": "Cambiar caso",
  "Changing a role changes access boundaries.":
    "Cambiar un rol modifica los límites de acceso.",
  "Checked fields are being patched across the current case child samplings one by one.":
    "Los campos seleccionados se aplican uno por uno en los muestreos hijos del caso actual.",
  Checking: "Verificando",
  "Checking current publish state...": "Verificando estado actual de publicación...",
  "Checking the current report-code linkage...":
    "Verificando el vínculo actual del código de reporte...",
  "Checking...": "Verificando...",
  "Checks mark allowed actions. Crosses call out the hard boundary.":
    "Las marcas indican acciones permitidas. Las cruces señalan el límite estricto.",
  "Child sampling": "Muestreo hijo",
  "Children entities": "Entidades hijas",
  "Choose the doctor deliberately.": "Elegí el médico deliberadamente.",
  "Client case status": "Estado de caso del cliente",
  "Client delivery state.": "Estado de entrega al cliente.",
  "Client-facing case status.": "Estado del caso visible para el cliente.",
  Close: "Cerrar",
  "Close auto sampling creation modal": "Cerrar modal de creación automática de muestreos",
  "Close error log": "Cerrar log de error",
  "Close multi sampling edit modal": "Cerrar modal de edición múltiple de muestreos",
  "Close multi sampling edit progress": "Cerrar progreso de edición múltiple de muestreos",
  "Close multiple sampling modal": "Cerrar modal de muestreo múltiple",
  "Close publish as report code modal": "Cerrar modal de publicación como código de reporte",
  "Close publish to file storage modal": "Cerrar modal de publicación en archivos",
  "Close three letter code modal": "Cerrar modal de código de tres letras",
  "Close update in file storage modal": "Cerrar modal de actualización en archivos",
  codes: "códigos",
  "Collection date": "Fecha de recolección",
  collection: "colección",
  "collection.": "colección.",
  comments: "comentarios",
  "Communication notes, consent status, or support context...":
    "Notas de comunicación, estado de consentimiento o contexto de soporte...",
  "Communication preference.": "Preferencia de comunicación.",
  "Communication state with the provider.": "Estado de comunicación con el prestador.",
  "Communication status": "Estado de comunicación",
  "Community users": "Usuarios de comunidad",
  "Community-facing profile documents for names, icons, and visible fields.":
    "Documentos de perfil visibles para la comunidad, con nombres, íconos y campos públicos.",
  "Compact preview": "Vista previa compacta",
  "Complete guided form flows and review the joined submissions stored in":
    "Completá los flujos guiados de formulario y revisá los envíos unificados almacenados en",
  "Configure one sampling template, then generate sequential sampling records linked to the current case one by one.":
    "Configurá una plantilla de muestreo y luego generá registros secuenciales vinculados al caso actual, uno por uno.",
  Confirm: "Confirmar",
  Conflict: "Conflicto",
  "Contact email.": "Email de contacto.",
  "Contact name": "Nombre de contacto",
  "Contact phone.": "Teléfono de contacto.",
  "Contacts used for run coordination.": "Contactos usados para coordinar la corrida.",
  "Continue from draft": "Continuar desde borrador",
  Copied: "Copiado",
  "Copy error": "Copiar error",
  Coordination: "Coordinación",
  "Core scope controls": "Controles centrales de alcance",
  Correct: "Correcto",
  "Country or region.": "País o región.",
  Create: "Crear",
  "Create a doctor record tied to one institution. The rest of the doctor setup happens after the record exists.":
    "Crear un registro de médico asociado a una institución. El resto de la configuración se completa después de crear el registro.",
  "Create a live Firestore document in": "Crear un documento activo de Firestore en",
  "Create a new email-based role record and tie it to the exact institution, doctor, or patient scope the permission tree allows.":
    "Crear un nuevo registro de rol por email y vincularlo al alcance exacto de institución, médico o paciente que permite el árbol de permisos.",
  "Create a patient record tied to one institution and one doctor. The save path respects institution-admin and doctor write boundaries automatically.":
    "Crear un registro de paciente asociado a una institución y a un médico. El guardado respeta automáticamente los límites de escritura de administradores de institución y médicos.",
  "Create doctor": "Alta de médico",
  "Create establishes a new case document. Replace writes the full document shape. Update patches only changed fields. Delete removes the document from Firestore.":
    "Crear establece un nuevo documento de caso. Reemplazar escribe el documento completo. Actualizar modifica solo los campos cambiados. Eliminar borra el documento de Firestore.",
  "Create institution": "Alta de institución",
  "Create patient": "Alta de paciente",
  "Create Record": "Crear registro",
  "Create role": "Alta de rol",
  "Create role assignment": "Alta de asignación de rol",
  "Create the institution root first.": "Creá primero la raíz de institución.",
  "Create this batch first to start linking cases.":
    "Creá primero este lote para empezar a vincular casos.",
  "Create this case first to start linking samplings.":
    "Creá primero este caso para empezar a vincular muestreos.",
  "Create writes a real Firebase document.":
    "Crear escribe un documento real en Firebase.",
  Created: "Creado",
  "Created record:": "Registro creado:",
  Creating: "Creando",
  "Creating record...": "Creando registro...",
  "Creating...": "Creando...",
  "Cross-user file storage inventory with linked report context.":
    "Inventario de archivos entre usuarios con contexto de reporte vinculado.",
  "Current analysis state.": "Estado actual del análisis.",
  "Current delivery state.": "Estado actual de entrega.",
  "Current linkage": "Vínculo actual",
  "Current processing state.": "Estado actual de procesamiento.",
  "Current publish state": "Estado actual de publicación",
  "Current role": "Rol actual",
  "Current role cannot delete this": "El rol actual no puede eliminar este registro",
  "Current role cannot delete this patient.":
    "El rol actual no puede eliminar este paciente.",
  "Currently linked to batch": "Actualmente vinculado al lote",
  "Currently linked to case": "Actualmente vinculado al caso",
  "Delivery blockers, provider clarifications, or clinician notes...":
    "Bloqueos de entrega, aclaraciones del prestador o notas clínicas...",
  "Delivery date": "Fecha de entrega",
  "Delivery exceptions, customs notes, or courier issues...":
    "Excepciones de entrega, notas de aduana o problemas de mensajería...",
  "Delivery status": "Estado de entrega",
  "Delete patient": "Eliminar paciente",
  "Delete failed. Please try again.": "La eliminación falló. Intentá nuevamente.",
  "Delete record": "Eliminar registro",
  "Delete record?": "¿Eliminar registro?",
  "Deleting...": "Eliminando...",
  "Derived from the case three-letter code as the canonical publish name.":
    "Derivado del código de tres letras del caso como nombre canónico de publicación.",
  "Derived from the current case three-letter code using the fixed":
    "Derivado del código actual de tres letras del caso usando el sufijo fijo",
  "detail and CRUD workbench.": "detalle y mesa de trabajo CRUD.",
  "Direct moderation of uploaded report records and status fields.":
    "Moderación directa de reportes subidos y campos de estado.",
  "Dispatch date": "Fecha de despacho",
  "Display name": "Nombre visible",
  "Doctor access": "Acceso de médico",
  "Doctor auth email is required and must be valid.":
    "El email de autenticación del médico es requerido y debe ser válido.",
  "Doctor changes saved.": "Cambios del médico guardados.",
  "Doctor created.": "Médico creado.",
  "Doctor detail joins the editable doctor profile, linked institution, direct patient list, and role linkage in one operational screen.":
    "El detalle de médico une el perfil editable, la institución vinculada, la lista directa de pacientes y el vínculo de rol en una sola pantalla operativa.",
  "Doctor full name is required.": "El nombre completo del médico es requerido.",
  "Doctor lane that owns the case.": "Carril médico dueño del caso.",
  "Doctor link": "Vínculo de médico",
  "Doctor record": "Registro de médico",
  "Doctor scope": "Alcance del médico",
  "Doctor workbench": "Mesa de trabajo del médico",
  doctors: "médicos",
  "Doctors attached to this institution": "Médicos asociados a esta institución",
  "Doctors belong to exactly one institution.":
    "Los médicos pertenecen exactamente a una institución.",
  "Doctors can CRUD only their own patients. Institution admins and full admins can use the same list as the direct patient handoff.":
    "Los médicos solo pueden hacer CRUD de sus propios pacientes. Administradores de institución y administradores totales pueden usar la misma lista como acceso directo a pacientes.",
  "Doctors can edit only their own patients.":
    "Los médicos solo pueden editar sus propios pacientes.",
  "Doctors can inspect peers, but edit only self.":
    "Los médicos pueden inspeccionar pares, pero solo editar su propio registro.",
  "Doctors can read the whole institution and the rest of the team here, but edit only their own doctor file.":
    "Los médicos pueden leer toda la institución y el resto del equipo acá, pero solo editar su propio legajo médico.",
  "Doctors can view their institution lane and write only records linked to their own doctor id.":
    "Los médicos pueden ver su carril institucional y escribir solo registros vinculados a su propio ID de médico.",
  "Doctors stay tied to one institution. The institution is selected on create, then the doctor detail becomes the main edit surface.":
    "Los médicos quedan asociados a una institución. La institución se selecciona al crear y luego el detalle del médico pasa a ser la pantalla principal de edición.",
  "document in place.": "documento existente.",
  "Each sequential sampling will use the current case three-letter code plus its matching 3 number code as the final sample ID.":
    "Cada muestreo secuencial usará el código actual de tres letras del caso más su número correspondiente de 3 dígitos como sample ID final.",
  "Each tab explains the scope and operating limits for one role assignment type.":
    "Cada pestaña explica el alcance y los límites operativos de un tipo de asignación de rol.",
  Edit: "Editar",
  "Edit multiple samplings at once": "Editar varios muestreos a la vez",
  "Edit three letter code": "Editar código de tres letras",
  Editable: "Editable",
  "Email-based role assignment": "Asignación de rol por email",
  "Email-based role assignments with a clear hierarchy: full admin, institution admin, institution doctor, and patient.":
    "Asignaciones de rol por email con una jerarquía clara: administrador total, administrador de institución, médico de institución y paciente.",
  "Email-scoped access control records with institution, doctor, and patient boundaries.":
    "Registros de control de acceso por email con límites de institución, médico y paciente.",
  "Email-scoped access tree for full admins, institution admins, doctors, and patients.":
    "Árbol de acceso por email para administradores totales, administradores de institución, médicos y pacientes.",
  "Entity Created": "Entidad creada",
  events: "eventos",
  "Every institution-scoped role, doctor, and patient record hangs off one institution. Full admins can create new institutions; institution admins and doctors stay inside their single institution boundary.":
    "Cada rol, médico y paciente con alcance institucional depende de una institución. Los administradores totales pueden crear instituciones; administradores de institución y médicos permanecen dentro de su límite institucional único.",
  "Every sampling record writes to Firestore and keeps the institution-doctor-patient linkage explicit.":
    "Cada registro de muestreo escribe en Firestore y mantiene explícito el vínculo institución-médico-paciente.",
  Exception: "Excepción",
  "Exactly three letters. The code is always stored and shown in uppercase.":
    "Exactamente tres letras. El código siempre se guarda y se muestra en mayúsculas.",
  "Execution provider.": "Prestador ejecutor.",
  "Expected completion date.": "Fecha esperada de finalización.",
  Failed: "Fallido",
  "Existing sampling IDs could not be validated right now. Fix the connection issue before running this batch.":
    "Los sample IDs existentes no se pudieron validar ahora. Corregí el problema de conexión antes de ejecutar este lote.",
  "Existing stored forms": "Formularios guardados existentes",
  "Expand preview": "Expandir vista previa",
  "External logistics tracking number.": "Número externo de seguimiento logístico.",
  "External or internal report code.": "Código de reporte externo o interno.",
  "Failed to load doctors. Confirm the SDK is running and retry.":
    "No se pudieron cargar los médicos. Confirmá que el SDK esté corriendo y reintentá.",
  "Failed to load institutions. Confirm the SDK is running and retry.":
    "No se pudieron cargar las instituciones. Confirmá que el SDK esté corriendo y reintentá.",
  "Failed to load patients. Confirm the SDK is running and retry.":
    "No se pudieron cargar los pacientes. Confirmá que el SDK esté corriendo y reintentá.",
  "Failed to load records. Confirm the SDK is running and retry.":
    "No se pudieron cargar los registros. Confirmá que el SDK esté corriendo y reintentá.",
  "Failed to load role assignments. Confirm the SDK is running and retry.":
    "No se pudieron cargar las asignaciones de rol. Confirmá que el SDK esté corriendo y reintentá.",
  Field: "Campo",
  "field staged for this record.": "campo preparado para este registro.",
  "Fields being applied": "Campos aplicándose",
  "Fields queued for bulk edit:": "Campos en cola para edición masiva:",
  "Fields selected": "Campos seleccionados",
  "fields staged for this record.": "campos preparados para este registro.",
  "file_storage linked code:": "código vinculado en file_storage:",
  "Fill the required fields, then launch the record.":
    "Completá los campos requeridos y luego creá el registro.",
  "Fill the required fields: case label, sample type, and processing status.":
    "Completá los campos requeridos: etiqueta del caso, tipo de muestra y estado de procesamiento.",
  "Firebase Auth users with linked private profile moderation.":
    "Usuarios de Firebase Auth con moderación de perfil privado vinculado.",
  "Formularios y documentos": "Formularios y documentos",
  "Four role assignment lanes": "Cuatro carriles de asignación de rol",
  "Free-form case notes.": "Notas libres del caso.",
  "Full admins can create anything. Institution admins stay inside one institution. Institution doctors can only create patient-facing records and patient roles tied to their own doctor scope.":
    "Los administradores totales pueden crear cualquier cosa. Los administradores de institución permanecen dentro de una institución. Los médicos de institución solo pueden crear registros de pacientes y roles de paciente vinculados a su propio alcance médico.",
  "Full admins can create, replace, update, and delete records across every institution.":
    "Los administradores totales pueden crear, reemplazar, actualizar y eliminar registros en todas las instituciones.",
  "Full request error log. You can copy this message for debugging.":
    "Log completo del error de solicitud. Podés copiar este mensaje para depurar.",
  Generate: "Generar",
  "Generate a reusable JSON snapshot of this case, its parent batch, and its child samplings, then publish that snapshot into the Firebase":
    "Generá una captura JSON reutilizable de este caso, su lote padre y sus muestreos hijos, y publicá esa captura en Firebase",
  "Generate random": "Generar aleatorio",
  "Generate random three letter code": "Generar código aleatorio de tres letras",
  "Generation paused on this item. Inspect the error log for details.":
    "La generación se pausó en este elemento. Revisá el log de error para ver detalles.",
  Global: "Global",
  "Global institution index with editable descriptors, doctor counts, patient totals, and local admin coverage.":
    "Índice global de instituciones con descriptores editables, cantidad de médicos, totales de pacientes y cobertura de administradores locales.",
  "Global scope": "Alcance global",
  "Grouped parent-child entities for the new flow: sequencing batches, cases, and sampling records.":
    "Entidades padre-hijo agrupadas para el nuevo flujo: lotes de secuenciación, casos y registros de muestreo.",
  "Human-readable case identifier.": "Identificador de caso legible.",
  "Human-readable sequencing batch label.": "Etiqueta legible del lote de secuenciación.",
  "Identity, stats, activity visibility, and nested events.":
    "Identidad, estadísticas, visibilidad de actividad y eventos anidados.",
  "In transit": "En tránsito",
  Inspect: "Inspeccionar",
  "Inspect error": "Inspeccionar error",
  "Inspect the current stored snapshot metadata, then update the linked Firebase":
    "Inspeccioná la metadata de la captura almacenada actual y luego actualizá el documento Firebase vinculado",
  "Institution access": "Acceso de institución",
  "Institution admins can create and manage doctors inside their institution. Doctors can inspect peers in the same institution, but only edit their own doctor file.":
    "Los administradores de institución pueden crear y gestionar médicos dentro de su institución. Los médicos pueden inspeccionar pares de la misma institución, pero solo editar su propio legajo.",
  "Institution admins can fully manage records inside one institution boundary.":
    "Los administradores de institución pueden gestionar completamente registros dentro del límite de una institución.",
  "Institution admins can work across the institution. Doctors still see the wider patient list, but write access follows the doctor link on the patient record itself.":
    "Los administradores de institución pueden trabajar en toda la institución. Los médicos siguen viendo la lista amplia de pacientes, pero la escritura sigue el vínculo de médico del propio registro de paciente.",
  "Institution and doctor-linked patient sheets with scoped CRUD rights.":
    "Fichas de pacientes vinculadas a institución y médico con permisos CRUD acotados.",
  "Institution changes saved.": "Cambios de institución guardados.",
  "Institution created.": "Institución creada.",
  "Institution detail is the control surface for institution descriptors, local doctors, and institution-admin role coverage.":
    "El detalle de institución es la superficie de control para descriptores institucionales, médicos locales y cobertura de roles de administradores de institución.",
  "Institution detail should stay operational, not decorative.":
    "El detalle de institución debe mantenerse operativo, no decorativo.",
  "Institution details": "Detalles de institución",
  "Institution doctors": "Médicos de institución",
  "Institution link": "Vínculo de institución",
  "Institution record": "Registro de institución",
  "Institution root that owns the case.": "Raíz institucional dueña del caso.",
  "Institution root.": "Raíz institucional.",
  "Institution roots, doctor relations, patient sheets, and local access control.":
    "Raíces institucionales, relaciones de médicos, fichas de pacientes y control de acceso local.",
  "Institution scope": "Alcance institucional",
  "Institution scope is the root of the new areas model.":
    "El alcance institucional es la raíz del nuevo modelo de áreas.",
  "Institution scoped": "Con alcance institucional",
  "Institution workbench": "Mesa de trabajo de institución",
  "Institution, doctor, and patient anchors that drive permissions.":
    "Anclas de institución, médico y paciente que determinan permisos.",
  "Institution-doctor roles require a doctor link.":
    "Los roles de médico de institución requieren vínculo de médico.",
  "Institution-linked doctor records with scoped editability and patient counts.":
    "Registros de médicos vinculados a institución con edición acotada y conteo de pacientes.",
  "Institution-linked doctors with direct patient counts, role linkage, and a clear distinction between read-only peers and the doctor record you can actually edit.":
    "Médicos vinculados a institución con conteo directo de pacientes, vínculo de rol y una distinción clara entre pares de solo lectura y el registro médico que realmente podés editar.",
  "Institution-scoped roles require an institution.":
    "Los roles con alcance institucional requieren una institución.",
  institutions: "instituciones",
  "Institutions / doctors / patients": "Instituciones / médicos / pacientes",
  "Internal shipment identifier.": "Identificador interno del envío.",
  "is active for this case.": "está activo para este caso.",
  "is live and ready in the full list.": "está activo y disponible en la lista completa.",
  "is staged for this new case.": "está preparado para este nuevo caso.",
  "Jump directly into the live 2PQ areas.":
    "Entrá directamente a las áreas 2PQ activas.",
  "Keep institution records direct and operational: one durable id, one readable descriptor set, and linked doctor operations from the same screen.":
    "Mantené los registros de institución directos y operativos: un ID durable, un conjunto de descriptores legible y operaciones de médicos vinculadas desde la misma pantalla.",
  "Keep these official 2PQ channels visible for form coordination, sample logistics, and operational follow-up.":
    "Mantené visibles estos canales oficiales de 2PQ para coordinar formularios, logística de muestras y seguimiento operativo.",
  "Launch New Record": "Crear nuevo registro",
  "Learning progress": "Progreso de aprendizaje",
  "Letters only. Use this when you want to reserve a specific short code for the case.":
    "Solo letras. Usalo cuando quieras reservar un código corto específico para el caso.",
  "Link batch": "Vincular lote",
  "Link Batch": "Vincular lote",
  "Link case": "Vincular caso",
  "Link Case": "Vincular caso",
  "Link existing": "Vincular existente",
  "Link Existing Case": "Vincular caso existente",
  "Link Existing Sampling": "Vincular muestreo existente",
  "Link sampling": "Vincular muestreo",
  "Linked Batch": "Lote vinculado",
  "Linked Case": "Caso vinculado",
  "Linked cases": "Casos vinculados",
  "Linked entities": "Entidades vinculadas",
  "Linked entity": "Entidad vinculada",
  "Linked institution": "Institución vinculada",
  "Linked institution and doctor": "Institución y médico vinculados",
  "Linked records": "Registros vinculados",
  "linked report on file_storage:": "reporte vinculado en file_storage:",
  "Linked samplings": "Muestreos vinculados",
  "linked samplings were updated and validated for case":
    "muestreos vinculados fueron actualizados y validados para el caso",
  "Linking here will move it.": "Vincularlo acá lo moverá.",
  "Linking...": "Vinculando...",
  "Live documents in": "Los documentos activos en",
  Locked: "Bloqueado",
  "Loading available records...": "Cargando registros disponibles...",
  "Logistics and carrier data.": "Datos de logística y transportista.",
  "Main lifecycle state.": "Estado principal del ciclo de vida.",
  "Main sequencing batch metadata.": "Metadata principal del lote de secuenciación.",
  "Missing file": "Archivo faltante",
  "Missing institution": "Institución faltante",
  "Multi sampling edit modal": "Modal de edición múltiple de muestreos",
  "Multi Sampling Edit Modal": "Modal de edición múltiple de muestreos",
  "Multi sampling edit paused": "Edición múltiple de muestreos pausada",
  "Multi sampling edit progress": "Progreso de edición múltiple de muestreos",
  New: "Nuevo",
  "New case": "Alta de caso",
  "New provider": "Alta de prestador",
  "New record": "Nuevo registro",
  "New report record": "Alta de reporte",
  "New sampling": "Alta de muestreo",
  "New sampling record": "Alta de muestreo",
  "New sequencing batch": "Alta de lote de secuenciación",
  "New shipment": "Alta de envío",
  "New similar form": "Nuevo formulario similar",
  "New value": "Nuevo valor",
  No: "No",
  "No access": "Sin acceso",
  "No backoffice access": "Sin acceso al backoffice",
  "No cases are linked to this batch yet.":
    "Todavía no hay casos vinculados a este lote.",
  "No doctors are attached to this institution yet.":
    "Todavía no hay médicos asociados a esta institución.",
  "No doctors match the current filter.":
    "Ningún médico coincide con el filtro actual.",
  "No fields selected.": "No hay campos seleccionados.",
  "No institutions match the current filter.":
    "Ninguna institución coincide con el filtro actual.",
  "No matching records available.": "No hay registros coincidentes disponibles.",
  "No parent batch is linked to this case yet.":
    "Todavía no hay lote padre vinculado a este caso.",
  "No parent case is linked to this sampling record yet.":
    "Todavía no hay caso padre vinculado a este registro de muestreo.",
  "No patient": "Sin paciente",
  "No patients are tied to this doctor yet.":
    "Todavía no hay pacientes asociados a este médico.",
  "No patients match the current filter.":
    "Ningún paciente coincide con el filtro actual.",
  "No records match the current filter.":
    "Ningún registro coincide con el filtro actual.",
  "No report code has been linked yet.":
    "Todavía no se vinculó ningún código de reporte.",
  "No role": "Sin rol",
  "No role records match the current filter.":
    "Ningún registro de rol coincide con el filtro actual.",
  "No samplings are linked to this case yet.":
    "Todavía no hay muestreos vinculados a este caso.",
  "No stored file has been published yet.":
    "Todavía no se publicó ningún archivo almacenado.",
  "No three letter code has been assigned yet. Add one manually or generate a new random code to reserve a unique shorthand for this case.":
    "Todavía no se asignó ningún código de tres letras. Agregá uno manualmente o generá uno aleatorio para reservar una abreviatura única para este caso.",
  "No three letter code is staged yet. Add one manually or generate a new random code so the case is created with its shorthand already assigned.":
    "Todavía no hay código de tres letras preparado. Agregá uno manualmente o generá uno aleatorio para que el caso se cree con su abreviatura ya asignada.",
  "No timestamp": "Sin fecha",
  "Not assigned": "No asignado",
  "Not available": "No disponible",
  "Not created yet": "Todavía no creado",
  "Not linked yet": "Todavía no vinculado",
  "Not published": "No publicado",
  "Not saved yet": "Todavía no guardado",
  "Number of copies": "Número de copias",
  "Official channels for 2PQ operations, sample coordination, and administrative follow-up.":
    "Canales oficiales para operaciones 2PQ, coordinación de muestras y seguimiento administrativo.",
  "on their own screen before you open a live record.":
    "en su propia pantalla antes de abrir un registro activo.",
  "Only full admins and institution admins can create doctors.":
    "Solo administradores totales y administradores de institución pueden dar de alta médicos.",
  "Only full admins and institution admins can delete doctors in scope.":
    "Solo administradores totales y administradores de institución pueden eliminar médicos dentro de su alcance.",
  "Only full admins can create institution roots.":
    "Solo administradores totales pueden dar de alta raíces institucionales.",
  "Only full admins can create institution roots. Once created, the institution becomes the anchor for doctors, patients, and institution-scoped roles.":
    "Solo administradores totales pueden dar de alta raíces institucionales. Una vez creada, la institución pasa a ser el ancla de médicos, pacientes y roles con alcance institucional.",
  "Only full admins can create institutions.":
    "Solo administradores totales pueden dar de alta instituciones.",
  "Only full admins can delete institution roots.":
    "Solo administradores totales pueden eliminar raíces institucionales.",
  "Only full admins can inspect or publish report-code linkage from this section.":
    "Solo administradores totales pueden inspeccionar o publicar vínculos de código de reporte desde esta sección.",
  "Only full admins can open, publish, or update file_storage documents from this section.":
    "Solo administradores totales pueden abrir, publicar o actualizar documentos file_storage desde esta sección.",
  "Only full admins, institution admins, and scoped institution doctors can create patients.":
    "Solo administradores totales, administradores de institución y médicos de institución dentro de alcance pueden dar de alta pacientes.",
  "Open area": "Abrir área",
  "Open doctor": "Abrir médico",
  "Open Doctors": "Abrir médicos",
  "Open Forms": "Abrir formularios",
  "Open institution": "Abrir institución",
  "Open Institutions": "Abrir instituciones",
  "Open patient": "Abrir paciente",
  "Open Patients": "Abrir pacientes",
  "Open Roles": "Abrir roles",
  "Operational contact information.": "Información de contacto operativo.",
  "Optional batch or sequencing run pointer.":
    "Referencia opcional a lote o corrida de secuenciación.",
  "Optional collection date copied into every generated record.":
    "Fecha opcional de recolección copiada en cada registro generado.",
  "Optional patient linkage for the case.": "Vínculo opcional de paciente para el caso.",
  "Optional patient reference.": "Referencia opcional de paciente.",
  "Optional quality-control outcome shared by the generated set.":
    "Resultado opcional de control de calidad compartido por el conjunto generado.",
  "Optional reception date copied into every generated record.":
    "Fecha opcional de recepción copiada en cada registro generado.",
  "Optional sequencing run pointer.": "Referencia opcional a corrida de secuenciación.",
  "Original intake date.": "Fecha original de ingreso.",
  "Other 2PQ areas": "Otras áreas 2PQ",
  overview: "resumen",
  "Owner and source": "Responsable y origen",
  "Owner/admin profiles that unlock report administration.":
    "Perfiles de responsable/administrador que habilitan la administración de reportes.",
  Ownership: "Titularidad",
  "Owning doctor lane.": "Carril del médico responsable.",
  "Parent case ID": "ID del caso padre",
  "Parent entity": "Entidad padre",
  "Patient access": "Acceso de paciente",
  "Patient changes saved.": "Cambios del paciente guardados.",
  "Patient created.": "Paciente creado.",
  "Patient detail is an informative sheet first: clear linked records, scoped editability, and one explicit delete path when the operator is allowed to use it.":
    "El detalle de paciente es primero una ficha informativa: registros vinculados claros, edición según alcance y una ruta explícita de eliminación cuando el operador puede usarla.",
  "Patient email is required and must be valid.":
    "El email del paciente es requerido y debe ser válido.",
  "Patient link": "Vínculo de paciente",
  "Patient record": "Registro de paciente",
  "Patient roles require both a doctor and a patient link.":
    "Los roles de paciente requieren vínculo de médico y de paciente.",
  "Patient scope": "Alcance de paciente",
  "Patient workbench": "Mesa de trabajo de paciente",
  patients: "pacientes",
  "Patients appear here as institution and doctor-linked records for operations, but they do not access this admin themselves. Doctors can edit only their own patients.":
    "Los pacientes aparecen acá como registros operativos vinculados a institución y médico, pero no acceden ellos mismos a esta administración. Los médicos solo pueden editar sus propios pacientes.",
  "Patients are informative backoffice records.":
    "Los pacientes son registros informativos de backoffice.",
  "Patients are informative backoffice records. Each one stays tied to exactly one institution and one doctor.":
    "Los pacientes son registros informativos de backoffice. Cada uno queda asociado exactamente a una institución y a un médico.",
  "Patients tied to this doctor": "Pacientes asociados a este médico",
  "PDF-inspired workflow map with explicit route access and CRUD visibility.":
    "Mapa de flujo inspirado en PDF con acceso explícito a rutas y visibilidad CRUD.",
  "Permission tree": "Árbol de permisos",
  "Pick the institution once, then manage from doctor detail.":
    "Elegí la institución una vez y luego gestioná desde el detalle del médico.",
  planned: "planificado",
  "Pocket Genes Admin is an operations console first: grouped control surfaces, real Firebase records, and explicit safety affordances.":
    "Pocket Genes Admin es primero una consola operativa: superficies de control agrupadas, registros reales de Firebase y resguardos explícitos.",
  posts: "publicaciones",
  "Prepare file-storage snapshot": "Preparar captura de archivos",
  "Preparing the publish preview": "Preparando vista previa de publicación",
  "Preparing the update preview": "Preparando vista previa de actualización",
  Preview: "Vista previa",
  "Primary case identifiers and status.":
    "Identificadores principales del caso y estado.",
  "Primary contact.": "Contacto principal.",
  "Primary provider contact fields.": "Campos principales de contacto del prestador.",
  "Primary provider email.": "Email principal del prestador.",
  "Primary provider phone.": "Teléfono principal del prestador.",
  "Primary report metadata and delivery state.":
    "Metadata principal del reporte y estado de entrega.",
  "Primary sample metadata and progression.":
    "Metadata principal de la muestra y avance.",
  "Primary sequencing batch identifier.":
    "Identificador principal del lote de secuenciación.",
  "Primary sequencing contact.": "Contacto principal de secuenciación.",
  "Primary actions": "Acciones principales",
  "Private profiles": "Perfiles privados",
  "profiles/{uid} documents that back onboarding and private account state.":
    "Documentos profiles/{uid} que respaldan onboarding y estado privado de cuenta.",
  "progress records": "registros de progreso",
  "Progress records and lesson operations.":
    "Registros de progreso y operaciones de lecciones.",
  "Promote the current": "Promover el",
  "Provider access records are now editable documents.":
    "Los registros de acceso de prestadores ahora son documentos editables.",
  "Provider access status.": "Estado de acceso del prestador.",
  "Provider and access-facing records stored in Firebase under `2pq_client`.":
    "Registros de prestadores y acceso almacenados en Firebase bajo `2pq_client`.",
  "Provider email": "Email del prestador",
  "Provider format": "Formato del prestador",
  "Provider format will be saved as": "El formato del prestador se guardará como",
  "Provider identity": "Identidad del prestador",
  "Provider name": "Nombre del prestador",
  "Provider notes.": "Notas del prestador.",
  "Provider or reporting lab.": "Prestador o laboratorio informante.",
  "Provider output format.": "Formato de salida del prestador.",
  "Provider phone": "Teléfono del prestador",
  "Provider-facing name.": "Nombre visible para el prestador.",
  "Public profiles": "Perfiles públicos",
  "Public profiles, community users, posts, comments, and events.":
    "Perfiles públicos, usuarios de comunidad, publicaciones, comentarios y eventos.",
  Publish: "Publicar",
  "Publish as report code": "Publicar como código de reporte",
  "Publish to File Storage": "Publicar en archivos",
  Published: "Publicado",
  "Publishing will create a new file and save its document id on this case as stored_file_id.":
    "Publicar creará un nuevo archivo y guardará su ID de documento en este caso como stored_file_id.",
  "Pulling the latest linked case graph and generating the JSON snapshot preview for file storage.":
    "Obteniendo el grafo vinculado más reciente del caso y generando la vista previa JSON para archivos.",
  "Pulling the latest linked case graph and generating the JSON snapshot preview that will replace the current stored file contents.":
    "Obteniendo el grafo vinculado más reciente del caso y generando la vista previa JSON que reemplazará el contenido actual del archivo almacenado.",
  "QC status": "Estado QC",
  "Quality-control outcome.": "Resultado de control de calidad.",
  "Queue changes, platform swaps, or analysis blockers...":
    "Cambios de cola, cambios de plataforma o bloqueos de análisis...",
  "Queue priority or urgency.": "Prioridad de cola o urgencia.",
  Queued: "En cola",
  Read: "Leer",
  "Read only": "Solo lectura",
  "Read-only scope": "Alcance solo lectura",
  Ready: "Listo",
  "Ready for review": "Listo para revisión",
  "Reception date": "Fecha de recepción",
  "Reception issues, missing tubes, or extraction notes...":
    "Problemas de recepción, tubos faltantes o notas de extracción...",
  "Record created": "Registro creado",
  "Record launched": "Registro creado",
  records: "registros",
  Refresh: "Actualizar",
  Refreshing: "Actualizando",
  Regenerate: "Regenerar",
  Relations: "Relaciones",
  "Remove three letter code": "Quitar código de tres letras",
  "Removing it clears the staged value so the new case will be created without a three letter code.":
    "Al quitarlo se limpia el valor preparado, por lo que el nuevo caso se creará sin código de tres letras.",
  "Removing it frees the code so another case can use it later.":
    "Al quitarlo se libera el código para que otro caso pueda usarlo más adelante.",
  Replace: "Reemplazar",
  "Replace writes the full record shape, update patches only changed fields, and delete removes the Firestore document.":
    "Reemplazar escribe el registro completo, actualizar modifica solo los campos cambiados y eliminar borra el documento de Firestore.",
  "Replacing...": "Reemplazando...",
  "Report code": "Código de reporte",
  "Report code already resolves back to this stored file.":
    "El código de reporte ya apunta a este archivo almacenado.",
  "Report codes, uploaded reports, stored files, and owner administration.":
    "Códigos de reporte, reportes subidos, archivos almacenados y administración de responsables.",
  "Report delivery": "Entrega de reporte",
  "Report notes.": "Notas del reporte.",
  "Report owner": "Responsable de reporte",
  "Report owners": "Responsables de reportes",
  "Report state": "Estado del reporte",
  "Report-delivery records stored in Firebase under `2pq_report`.":
    "Registros de entrega de reportes almacenados en Firebase bajo `2pq_report`.",
  "Reports and Learning": "Reportes y aprendizaje",
  "Request log": "Log de solicitud",
  "Requesting doctor link": "Vínculo del médico solicitante",
  "Required. All generated samplings start with this processing state.":
    "Requerido. Todos los muestreos generados comienzan con este estado de procesamiento.",
  "Required. This value is copied into each sampling.":
    "Requerido. Este valor se copia en cada muestreo.",
  Reset: "Restablecer",
  "Resolved scope": "Alcance resuelto",
  Restricted: "Restringido",
  Retry: "Reintentar",
  "Retry continues from the blocked child sampling.":
    "Reintentar continúa desde el muestreo hijo bloqueado.",
  "Retry continues from the blocked sequential step.":
    "Reintentar continúa desde el paso secuencial bloqueado.",
  "Retry status": "Estado del reintento",
  "Review role boundaries for": "Revisar los límites de rol para",
  "Review the current CRUD boundary here first, then return to the main area when you want to open or edit a specific record.":
    "Revisá primero acá el límite CRUD actual y luego volvé al área principal cuando quieras abrir o editar un registro específico.",
  "Review the doctor role boundary on its own screen before you open a doctor workbench.":
    "Revisá el límite de rol de médico en su propia pantalla antes de abrir una mesa de trabajo de médico.",
  "Review the institution scope boundary on its own screen before you open the live institution surface.":
    "Revisá el límite de alcance institucional en su propia pantalla antes de abrir la superficie activa de instituciones.",
  "Review the live institutions, doctors, patients, and role assignments tied to this lane, then jump straight into creation or management from the dashboard.":
    "Revisá las instituciones, médicos, pacientes y asignaciones de rol vinculados a este carril, y luego entrá directo a crear o gestionar desde el dashboard.",
  "Review the patient CRUD boundary on its own screen before you open a patient record.":
    "Revisá el límite CRUD de pacientes en su propia pantalla antes de abrir un registro de paciente.",
  "Review the whole team here. Institution admins can add more doctors; institution doctors can inspect peers but only edit their own doctor record.":
    "Revisá todo el equipo acá. Los administradores de institución pueden agregar médicos; los médicos de institución pueden inspeccionar pares, pero solo editar su propio registro.",
  "Review your own role, permissions, and Firebase Auth details without opening another user's role assignment.":
    "Revisá tu propio rol, permisos y detalles de Firebase Auth sin abrir la asignación de rol de otro usuario.",
  "right now.": "ahora.",
  Role: "Rol",
  "Role active": "Rol activo",
  "Role assignment capabilities": "Capacidades de asignación de rol",
  "Role assignment created.": "Asignación de rol creada.",
  "Role assignment operations": "Operaciones de asignación de rol",
  "Role assignment saved.": "Asignación de rol guardada.",
  "Role detail is where email-based access, institution scope, doctor scope, and patient scope all come together in one typed form.":
    "El detalle de rol reúne en un formulario tipado el acceso por email, alcance de institución, alcance de médico y alcance de paciente.",
  "Role email is required and must be valid.":
    "El email del rol es requerido y debe ser válido.",
  "Role email": "Email de rol",
  "Role inactive": "Rol inactivo",
  "Role records defining the active lane": "Registros de rol que definen el carril activo",
  "role records": "registros de rol",
  "Role state": "Estado del rol",
  "Role workbench": "Mesa de trabajo de rol",
  "Role-linked state and communication tracking.":
    "Estado vinculado al rol y seguimiento de comunicación.",
  "Roles & permissions": "Roles y permisos",
  "Roles are attached to emails, then constrained by institution, doctor, and patient links according to the permission tree.":
    "Los roles se asocian a emails y luego se limitan por vínculos de institución, médico y paciente según el árbol de permisos.",
  "Row structure is checkbox, field label, then the new value to write into every linked child sampling. Leave a checked value empty if you want to clear that field.":
    "La estructura de la fila es checkbox, etiqueta de campo y luego el nuevo valor a escribir en cada muestreo hijo vinculado. Dejá vacío un valor marcado si querés limpiar ese campo.",
  "Run ID": "ID de corrida",
  Running: "En ejecución",
  "Running the final validation pass across every created sampling.":
    "Ejecutando la validación final sobre cada muestreo creado.",
  "Running the final validation pass across every updated child sampling.":
    "Ejecutando la validación final sobre cada muestreo hijo actualizado.",
  "Sample ID for sequential slot": "Sample ID para posición secuencial",
  "Sample ID pattern": "Patrón de Sample ID",
  "Sample ID to be created for this sequential sampling slot.":
    "Sample ID que se creará para esta posición secuencial de muestreo.",
  "Sampling and reception records stored in Firebase under `2pq_sampling`.":
    "Registros de muestreo y recepción almacenados en Firebase bajo `2pq_sampling`.",
  "Sampling fields": "Campos de muestreo",
  "Sampling is a first-class CRUD surface now.":
    "Muestreo ahora es una superficie CRUD de primera clase.",
  "Sampling notes.": "Notas de muestreo.",
  "Sampling records are generated sequentially with the current case as their linked parent case.":
    "Los registros de muestreo se generan secuencialmente con el caso actual como caso padre vinculado.",
  "sampling records were created, validated, and linked to case":
    "registros de muestreo fueron creados, validados y vinculados al caso",
  "Sampling state": "Estado de muestreo",
  "Save doctor": "Guardar médico",
  "Save institution": "Guardar institución",
  "Save patient": "Guardar paciente",
  "Save role": "Guardar rol",
  "Save the case, then link existing sampling records or create a new child sampling with this case preloaded.":
    "Guardá el caso y luego vinculá registros de muestreo existentes o creá un nuevo muestreo hijo con este caso precargado.",
  "Save the sequencing batch, then link existing cases or create a new child case with the batch preloaded.":
    "Guardá el lote de secuenciación y luego vinculá casos existentes o creá un nuevo caso hijo con el lote precargado.",
  "Saving...": "Guardando...",
  Scheduled: "Programado",
  "Scheduling slot or note.": "Turno o nota de programación.",
  Scope: "Alcance",
  "Scope first, role second.": "Primero el alcance, después el rol.",
  "Scope links for client-facing records.":
    "Vínculos de alcance para registros visibles al cliente.",
  "Scope links for report delivery records.":
    "Vínculos de alcance para registros de entrega de reportes.",
  "Scope links for sequencing records.":
    "Vínculos de alcance para registros de secuenciación.",
  "Scope links for shipment coordination.":
    "Vínculos de alcance para coordinación de envíos.",
  "Scope links for the sampling record.":
    "Vínculos de alcance para el registro de muestreo.",
  "Scoped areas": "Áreas con alcance",
  "Scoped patient": "Paciente con alcance",
  "Scroll the preview below to inspect the autogenerated case snapshot before it is published into file storage.":
    "Desplazate por la vista previa para inspeccionar la captura autogenerada del caso antes de publicarla en archivos.",
  "Scroll the preview below to inspect the autogenerated case snapshot before it overwrites the current file storage snapshot.":
    "Desplazate por la vista previa para inspeccionar la captura autogenerada del caso antes de sobrescribir la captura actual de archivos.",
  "Search cases by label, status, tracking, priority, or patient...":
    "Buscar casos por etiqueta, estado, seguimiento, prioridad o paciente...",
  "Search doctors by id, name, email, institution, or license...":
    "Buscar médicos por ID, nombre, email, institución o matrícula...",
  "Search institutions by id, code, name, email, or city...":
    "Buscar instituciones por ID, código, nombre, email o ciudad...",
  "Search patients by id, name, email, MRN, doctor, or institution...":
    "Buscar pacientes por ID, nombre, email, DNI, médico o institución...",
  "Search providers by name, email, phone, language, country, role email, or communication status...":
    "Buscar prestadores por nombre, email, teléfono, idioma, país, email de rol o estado de comunicación...",
  "Search records...": "Buscar registros...",
  "Search reports by case, report code, delivery state, provider, upload, or patient...":
    "Buscar reportes por caso, código, estado de entrega, prestador, subida o paciente...",
  "Search roles by email, name, institution, doctor, or patient...":
    "Buscar roles por email, nombre, institución, médico o paciente...",
  "Search sampling by case, sample, type, processing status, run, or patient...":
    "Buscar muestreos por caso, muestra, tipo, estado de procesamiento, corrida o paciente...",
  "Search sequencing by batch, run, platform, analysis status, provider, or contact...":
    "Buscar secuenciación por lote, corrida, plataforma, estado de análisis, prestador o contacto...",
  "Search shipments by case, shipment, tracking, carrier, delivery state, or contact...":
    "Buscar envíos por caso, envío, seguimiento, transportista, estado de entrega o contacto...",
  "Searchable patient index with scoped visibility by institution and scoped edit rights by doctor ownership.":
    "Índice de pacientes buscable con visibilidad por institución y edición acotada por titularidad médica.",
  "Secondary workflow surfaces": "Superficies secundarias de flujo",
  Sent: "Enviado",
  "Select a doctor for this patient.": "Seleccioná un médico para este paciente.",
  "Select an institution for this doctor.":
    "Seleccioná una institución para este médico.",
  "Select an institution for this patient.":
    "Seleccioná una institución para este paciente.",
  "Select processing status": "Seleccionar estado de procesamiento",
  "Select role": "Seleccionar rol",
  "Select role state": "Seleccionar estado del rol",
  "Select the parent case that should own this sampling record.":
    "Seleccioná el caso padre que debe contener este registro de muestreo.",
  "Select the sampling fields to patch across every linked child sampling at once. Only checked rows will be applied.":
    "Seleccioná los campos de muestreo que se aplicarán en todos los muestreos hijos vinculados. Solo se aplican las filas marcadas.",
  "Select the sequencing batch that should act as the parent entity for this case.":
    "Seleccioná el lote de secuenciación que debe actuar como entidad padre de este caso.",
  "Self-service": "Autogestión",
  "Send email": "Enviar email",
  "Sequential sampling batch completed":
    "Lote secuencial de muestreos completado",
  "Sequencing batch scheduling and analysis records stored in Firebase under `2pq_sequencing`.":
    "Registros de programación y análisis de lotes de secuenciación almacenados en Firebase bajo `2pq_sequencing`.",
  "Sequencing batches are editable records now.":
    "Los lotes de secuenciación ahora son registros editables.",
  "Sequencing contact email.": "Email de contacto de secuenciación.",
  "Sequencing contact phone.": "Teléfono de contacto de secuenciación.",
  "Sequencing notes.": "Notas de secuenciación.",
  "Sequencing platform or provider.": "Plataforma o prestador de secuenciación.",
  "Shipment and logistics records stored in Firebase under `2pq_shipment`.":
    "Registros de envíos y logística almacenados en Firebase bajo `2pq_shipment`.",
  "Shipment, reporting, and client operations stay here as separate supporting areas.":
    "Las operaciones de envíos, reportes y clientes quedan acá como áreas de soporte separadas.",
  "Shipment ID": "ID de envío",
  "Shipment notes.": "Notas de envío.",
  "Shipment records now support full CRUD.":
    "Los registros de envío ahora soportan CRUD completo.",
  "Shipment state": "Estado de envío",
  "Shipping provider.": "Proveedor de envío.",
  "Show in File Storage": "Ver en archivos",
  "Show report code": "Ver código de reporte",
  "Show uploaded report": "Ver reporte subido",
  Showing: "Mostrando",
  "snapshot into a reusable 2PQ report code using the current signed-in admin as the report owner. The report code for this case is derived from the three-letter code as":
    "captura en un código de reporte 2PQ reutilizable usando al administrador actual como responsable del reporte. El código de reporte para este caso deriva del código de tres letras como",
  "Some linked option lists could not be loaded.":
    "No se pudieron cargar algunas listas de opciones vinculadas.",
  "Stage a unique three-letter shorthand for this new 2PQ case before it is created. The code will be written into Firebase as part of the initial case document.":
    "Prepará una abreviatura única de tres letras para este nuevo caso 2PQ antes de crearlo. El código se escribirá en Firebase como parte del documento inicial del caso.",
  "Stays inside one doctor-owned lane instead of the whole institution surface.":
    "Permanece dentro de un carril propiedad de un médico, no en toda la superficie institucional.",
  "Stays inside one institution and the doctors, patients, and role assignments linked to it.":
    "Permanece dentro de una institución y los médicos, pacientes y asignaciones de rol vinculados a ella.",
  State: "Provincia",
  "stay scoped to the same institution, doctor, and patient permission lanes already enforced by the SDK.":
    "mantienen el mismo alcance por institución, médico y paciente que ya hace cumplir el SDK.",
  "Step 1 patient link": "Vínculo de paciente del paso 1",
  "Stored 2PQ study request and sample forms.":
    "Formularios 2PQ guardados de solicitud de estudio y biopsias.",
  "Stored 2PQ study request and biopsy forms.":
    "Formularios 2PQ guardados de solicitud de estudio y biopsias.",
  "Stored file": "Archivo almacenado",
  "Stored file document missing.": "Falta el documento de archivo almacenado.",
  "Stored file last updated:": "Última actualización del archivo almacenado:",
  "Stored file status": "Estado del archivo almacenado",
  "Stored files": "Archivos almacenados",
  "suffix.": "sufijo.",
  "Syncing new record": "Sincronizando nuevo registro",
  Tabs: "Pestañas",
  targets: "objetivos",
  "The batch is the parent entity. Unlinking removes the relationship only.":
    "El lote es la entidad padre. Desvincular elimina solo la relación.",
  "The case is the parent entity. Unlinking removes the relationship only.":
    "El caso es la entidad padre. Desvincular elimina solo la relación.",
  "The case points to a stored_file_id that no longer exists, so report-code publishing is blocked until the file is republished.":
    "El caso apunta a un stored_file_id que ya no existe, por lo que la publicación de código de reporte queda bloqueada hasta republicar el archivo.",
  "The code is stored on the case document as":
    "El código está guardado en el documento del caso como",
  "The code will be stored on the new case document as":
    "El código se guardará en el nuevo documento del caso como",
  "The current admin user will be written into the report-code ownership fields and the uploaded-report owner metadata.":
    "El usuario administrador actual se escribirá en los campos de titularidad del código de reporte y en la metadata de responsable del reporte subido.",
  "The current role cannot create role assignments.":
    "El rol actual no puede crear asignaciones de rol.",
  "The current role cannot create role assignments on this screen.":
    "El rol actual no puede crear asignaciones de rol en esta pantalla.",
  "The current role cannot create records on this screen.":
    "El rol actual no puede dar de alta registros en esta pantalla.",
  "The current stored file snapshot may be out of date. This case was updated":
    "La captura actual del archivo almacenado puede estar desactualizada. Este caso se actualizó",
  "The doctor link controls who can actually edit this patient later. Institution scope and doctor scope stay explicit and visible on the patient sheet.":
    "El vínculo de médico controla quién puede editar este paciente más adelante. El alcance institucional y el alcance médico quedan explícitos y visibles en la ficha del paciente.",
  "The institution root, local admin coverage, and the doctor roster attached to it.":
    "La raíz institucional, la cobertura de administradores locales y el listado de médicos asociado.",
  "The list and detail screens write real Firestore data and keep logistics linked to institutions, doctors, and patients.":
    "Las pantallas de lista y detalle escriben datos reales de Firestore y mantienen la logística vinculada a instituciones, médicos y pacientes.",
  "The list below mixes allowed actions and blocked actions so the lane stays readable one rule at a time.":
    "La lista combina acciones permitidas y bloqueadas para que el carril se lea regla por regla.",
  "The new report code will use the current admin user as owner, with provider format":
    "El nuevo código de reporte usará al usuario administrador actual como responsable, con formato de prestador",
  "The patient sheet is informative, but it always resolves back to one institution and one doctor.":
    "La ficha de paciente es informativa, pero siempre resuelve a una institución y un médico.",
  "The permission tree must stay explicit.":
    "El árbol de permisos debe mantenerse explícito.",
  "The process is paused. Review the error, then retry from the blocked step.":
    "El proceso está pausado. Revisá el error y reintentá desde el paso bloqueado.",
  "The redesign is working when an operator can find a user, open a post, inspect a report, and spot the dangerous action in a few seconds.":
    "El rediseño funciona cuando un operador puede encontrar un usuario, abrir una publicación, inspeccionar un reporte y detectar una acción peligrosa en pocos segundos.",
  "The role record is open, but one or more institution, doctor, or patient selector lists failed to load. Refresh after the SDK data source recovers.":
    "El registro de rol está abierto, pero una o más listas de selección de institución, médico o paciente no cargaron. Actualizá cuando se recupere la fuente de datos del SDK.",
  "The SDK enforces the same limits the UI describes here. Institution admins stay inside one institution. Institution doctors can inspect the institution, edit only their own doctor file, and CRUD only their own patients.":
    "El SDK aplica los mismos límites que describe la UI. Los administradores de institución permanecen dentro de una institución. Los médicos de institución pueden inspeccionar la institución, editar solo su propio legajo y hacer CRUD solo de sus pacientes.",
  "The SDK enforces the write boundary. This screen reflects it by showing read-only state whenever the current role can inspect but not modify the selected doctor.":
    "El SDK aplica el límite de escritura. Esta pantalla lo refleja mostrando solo lectura cuando el rol actual puede inspeccionar, pero no modificar, el médico seleccionado.",
  "The selected role determines which linked records are required. When a doctor or patient link exists, the backend validates that the email and relational scope line up correctly.":
    "El rol seleccionado determina qué registros vinculados son requeridos. Cuando existe vínculo de médico o paciente, el backend valida que el email y el alcance relacional coincidan correctamente.",
  "The shell is scoped before the action buttons are.":
    "La consola queda acotada antes que los botones de acción.",
  "The stored file document can no longer be found.":
    "Ya no se encuentra el documento del archivo almacenado.",
  "The workbench below sends a POST to the SDK and creates a new record in":
    "La mesa de trabajo de abajo envía un POST al SDK y crea un nuevo registro en",
  "These records let operators manage real provider-facing state while keeping institution, doctor, patient, and role links visible.":
    "Estos registros permiten gestionar estado real visible para prestadores manteniendo visibles los vínculos de institución, médico, paciente y rol.",
  "These records live in their own Firestore collection but stay linked to institutions, doctors, patients, and existing report identifiers.":
    "Estos registros viven en su propia colección de Firestore, pero permanecen vinculados a instituciones, médicos, pacientes e identificadores de reporte existentes.",
  "These sample IDs already exist and block generation:":
    "Estos sample IDs ya existen y bloquean la generación:",
  "This action cannot be undone.": "Esta acción no se puede deshacer.",
  "This area covers batch scheduling, provider contacts, platform data, and analysis status.":
    "Esta área cubre programación de lotes, contactos de prestadores, datos de plataforma y estado de análisis.",
  "This case will become a child of the current batch.":
    "Este caso pasará a ser hijo del lote actual.",
  "This case will no longer display a three letter code until a new one is assigned.":
    "Este caso dejará de mostrar un código de tres letras hasta que se asigne uno nuevo.",
  "This doctor record is read only for the current role.":
    "Este registro de médico es solo lectura para el rol actual.",
  "This field is written back into the case entity in Firebase after publish.":
    "Este campo se escribe nuevamente en la entidad del caso en Firebase después de publicar.",
  "This form is linked to the scoped patient record used for Step 1.":
    "Este formulario está vinculado al registro de paciente con alcance usado en el paso 1.",
  "This institution is read only for the current role.":
    "Esta institución es solo lectura para el rol actual.",
  "This is the 6-character code derived from the active three-letter code plus":
    "Este es el código de 6 caracteres derivado del código activo de tres letras más",
  "This label is written into every generated sampling record.":
    "Esta etiqueta se escribe en cada registro de muestreo generado.",
  "This legacy form does not have a scoped patient link stored.":
    "Este formulario legado no tiene guardado un vínculo de paciente con alcance.",
  "This new case will no longer carry a staged three letter code until a new one is assigned.":
    "Este nuevo caso ya no tendrá un código de tres letras preparado hasta que se asigne uno nuevo.",
  "This patient record is read only for the current role.":
    "Este registro de paciente es solo lectura para el rol actual.",
  "This removes the Firestore document from":
    "Esto elimina el documento de Firestore de",
  "This removes the patient record and any linked patient role assignment.":
    "Esto elimina el registro de paciente y cualquier asignación de rol de paciente vinculada.",
  "This report code already resolves to the current stored file.":
    "Este código de reporte ya resuelve al archivo almacenado actual.",
  "This sample form is linked to the scoped requesting doctor record.":
    "Este formulario de muestra está vinculado al registro con alcance del médico solicitante.",
  "This sample form is missing the requesting doctor link.":
    "A este formulario de muestra le falta el vínculo del médico solicitante.",
  "This sampling record will become a child of the current case.":
    "Este registro de muestreo pasará a ser hijo del caso actual.",
  "This screen is connected to": "Esta pantalla está conectada a",
  "This screen isolates access from the live browser.":
    "Esta pantalla separa el acceso del navegador activo.",
  "This screen is the operational registry for case-level intake, ownership, and delivery tracking.":
    "Esta pantalla es el registro operativo para ingreso, titularidad y seguimiento de entrega a nivel caso.",
  "This short letter-only identifier is unique to the case and is stored in Firebase as three_letter_code.":
    "Este identificador corto solo de letras es único para el caso y se guarda en Firebase como three_letter_code.",
  "This short letter-only identifier is unique to the case and will be stored in Firebase as three_letter_code when the record is created.":
    "Este identificador corto solo de letras es único para el caso y se guardará en Firebase como three_letter_code al crear el registro.",
  "This will clear the unique three-letter shortcut currently staged for the new case.":
    "Esto limpiará la abreviatura única de tres letras preparada para el nuevo caso.",
  "This will clear the unique three-letter shortcut stored on the case document.":
    "Esto limpiará la abreviatura única de tres letras guardada en el documento del caso.",
  "This workspace is scoped around institutions first: your institution, its doctors, its patients, and the role records that define local access.":
    "Este espacio de trabajo se organiza primero alrededor de instituciones: tu institución, sus médicos, sus pacientes y los registros de rol que definen el acceso local.",
  "Three letter code": "Código de tres letras",
  "Three letter code removed from the draft case.":
    "Código de tres letras quitado del caso borrador.",
  "Three letter code removed.": "Código de tres letras quitado.",
  "Three letter code request": "Solicitud de código de tres letras",
  "Three letter code saved for the draft case.":
    "Código de tres letras guardado para el caso borrador.",
  "Three letter code saved.": "Código de tres letras guardado.",
  "Three letter code updated for the draft case.":
    "Código de tres letras actualizado para el caso borrador.",
  "Three letter code updated.": "Código de tres letras actualizado.",
  "to all linked samplings": "a todos los muestreos vinculados",
  "Tracking and scheduling fields used by downstream shipment and report steps.":
    "Campos de seguimiento y programación usados por pasos posteriores de envío y reporte.",
  "Turn on at least one checkbox before applying a bulk update.":
    "Activá al menos un checkbox antes de aplicar una actualización masiva.",
  "Type of sample collected.": "Tipo de muestra recolectada.",
  "Unable to copy the error log.": "No se pudo copiar el log de error.",
  "Unable to create the doctor.": "No se pudo crear el médico.",
  "Unable to create the institution.": "No se pudo crear la institución.",
  "Unable to create the patient.": "No se pudo crear el paciente.",
  "Unable to create the role assignment.":
    "No se pudo crear la asignación de rol.",
  "Unable to delete the patient.": "No se pudo eliminar el paciente.",
  "Unable to load dashboard stats. Ensure GoldenCrow SDK is running.":
    "No se pudieron cargar las estadísticas del dashboard. Verificá que GoldenCrow SDK esté corriendo.",
  "Unable to prepare the file-storage snapshot preview.":
    "No se pudo preparar la vista previa de la captura de archivos.",
  "Unable to publish this case snapshot to file storage.":
    "No se pudo publicar esta captura del caso en archivos.",
  "Unable to publish this stored file as a report code.":
    "No se pudo publicar este archivo almacenado como código de reporte.",
  "Unable to remove the three letter code.":
    "No se pudo quitar el código de tres letras.",
  "Unable to save the doctor.": "No se pudo guardar el médico.",
  "Unable to save the institution.": "No se pudo guardar la institución.",
  "Unable to save the patient.": "No se pudo guardar el paciente.",
  "Unable to save the role assignment.":
    "No se pudo guardar la asignación de rol.",
  "Unable to save the three letter code.":
    "No se pudo guardar el código de tres letras.",
  "Unable to update this case snapshot in file storage.":
    "No se pudo actualizar esta captura del caso en archivos.",
  "Unable to verify the latest report-code publish state right now. Retry the status check before publishing.":
    "No se pudo verificar ahora el último estado de publicación del código de reporte. Reintentá la verificación antes de publicar.",
  Unique: "Único",
  "Unique sample reference.": "Referencia única de muestra.",
  Unlink: "Desvincular",
  "Unlinking...": "Desvinculando...",
  Update: "Actualizar",
  "Update in File Storage": "Actualizar en archivos",
  "Update it so the file storage snapshot reflects the latest case information.":
    "Actualizalo para que la captura de archivos refleje la información más reciente del caso.",
  "Update paused on this sampling. Inspect the error log for details.":
    "La actualización se pausó en este muestreo. Revisá el log de error para ver detalles.",
  Updated: "Actualizado",
  Updating: "Actualizando",
  "Updating rewrites the current file_storage snapshot in place and keeps this case linked to the same stored_file_id.":
    "Actualizar reescribe la captura actual de file_storage y mantiene este caso vinculado al mismo stored_file_id.",
  "Updating...": "Actualizando...",
  "Uploaded report ID": "ID de reporte subido",
  "uploaded report id:": "ID de reporte subido:",
  "Uploaded reports": "Reportes subidos",
  "Use a clear name, keep the relational id durable, and only add doctors or institution-admin roles after the institution record exists.":
    "Usá un nombre claro, mantené durable el ID relacional y agregá médicos o roles de administrador de institución solo después de que exista el registro de institución.",
  "Use batch": "Usar lote",
  "Use create, replace, update, and delete to manage sequencing batch work items directly in Firebase.":
    "Usá crear, reemplazar, actualizar y eliminar para gestionar lotes de secuenciación directamente en Firebase.",
  "Use shipments for carrier data, dispatch/delivery dates, and operational contact details.":
    "Usá envíos para datos de transportista, fechas de despacho/entrega y detalles de contacto operativo.",
  "Use these links to confirm the role points at the exact institution, doctor, and patient you expect.":
    "Usá estos vínculos para confirmar que el rol apunta exactamente a la institución, médico y paciente esperados.",
  "Use this area for accession, reception, processing status, and sample-specific notes.":
    "Usá esta área para ingreso, recepción, estado de procesamiento y notas específicas de muestra.",
  "Use this area for provider contact state, communication status, preferred language, and role-linked access visibility.":
    "Usá esta área para estado de contacto del prestador, estado de comunicación, idioma preferido y visibilidad de acceso vinculada al rol.",
  "Use this area for report codes, uploaded report linkage, client delivery state, and provider metadata.":
    "Usá esta área para códigos de reporte, vínculo de reporte subido, estado de entrega al cliente y metadata del prestador.",
  "Use this screen before creating or editing a role assignment so the scope, the allowed role types, and the blocked actions stay explicit.":
    "Usá esta pantalla antes de crear o editar una asignación de rol para que el alcance, los tipos de rol permitidos y las acciones bloqueadas queden explícitos.",
  "Use this screen to adjust role power deliberately. The backend prevents cross-institution leakage and stops doctors from assigning anything outside their patient scope.":
    "Usá esta pantalla para ajustar permisos deliberadamente. El backend evita cruces entre instituciones e impide que los médicos asignen fuera de su alcance de pacientes.",
  "Use this screen to manage the institution record itself, confirm which doctors belong to it, and verify which institution-admin emails actually have local power.":
    "Usá esta pantalla para gestionar el registro de institución, confirmar qué médicos pertenecen a ella y verificar qué emails de administradores de institución tienen poder local.",
  "User email": "Email de usuario",
  users: "usuarios",
  "Validate with real tasks, not screenshots.":
    "Validar con tareas reales, no con capturas.",
  "Validating existing sampling IDs before generation...":
    "Validando sample IDs existentes antes de generar...",
  "Visit 2PQ": "Visitar 2PQ",
  "Visualize access permission": "Ver permisos de acceso",
  "Visualize access permissions": "Ver permisos de acceso",
  "What this role can and cannot do": "Qué puede y qué no puede hacer este rol",
  "when you tap": "cuando tocás",
  "When the report was delivered.": "Cuándo se entregó el reporte.",
  "When the sample was collected.": "Cuándo se recolectó la muestra.",
  "When the sample was received.": "Cuándo se recibió la muestra.",
  "When the shipment arrived.": "Cuándo llegó el envío.",
  "When the shipment left origin.": "Cuándo salió el envío de origen.",
  "while the published stored file was last updated":
    "mientras que el archivo almacenado publicado se actualizó por última vez",
  "with explicit institution, doctor, and patient linkage.":
    "con vínculo explícito de institución, médico y paciente.",
  "with record id": "con ID de registro",
  workbench: "mesa de trabajo",
  "Workflow-first shell for cases, samples, shipments, sequencing, reports, clients, and role-aware access.":
    "Consola orientada al flujo para casos, muestras, envíos, secuenciación, reportes, clientes y acceso según rol.",
  "XP, levels, streaks, and completed lesson ids.":
    "XP, niveles, rachas e IDs de lecciones completadas.",
  "Your institution scope starts here. Review the institution record first, then move into doctors, patients, and local role assignments.":
    "Tu alcance institucional empieza acá. Revisá primero el registro de institución y luego avanzá a médicos, pacientes y asignaciones de rol locales.",
  "and will use the signed-in admin as the report owner.":
    "y usará al administrador autenticado como responsable del reporte.",
  "Auto sampling creation modal": "Modal de creación automática de muestreos",
  "Auto sampling validation": "Validación de muestreos automáticos",
  batch: "lote",
  "Batch linked to case.": "Lote vinculado al caso.",
  "Batch preloaded for the new case.": "Lote precargado para el nuevo caso.",
  "Batch removed from the draft case.": "Lote quitado del caso borrador.",
  "Batch unlinked from case.": "Lote desvinculado del caso.",
  Bootstrap: "Bootstrap",
  case: "caso",
  "Case label corrected to": "Etiqueta del caso corregida a",
  "Case linked to batch.": "Caso vinculado al lote.",
  "Case linked to sampling.": "Caso vinculado al muestreo.",
  "Case preloaded for the new sampling record.":
    "Caso precargado para el nuevo registro de muestreo.",
  "Case removed from the draft sampling record.":
    "Caso quitado del registro de muestreo borrador.",
  "Case unlinked from batch.": "Caso desvinculado del lote.",
  "Case unlinked from sampling.": "Caso desvinculado del muestreo.",
  "child sampling record updated.": "registro de muestreo hijo actualizado.",
  "child sampling records updated.":
    "registros de muestreo hijo actualizados.",
  "Correct case label": "Corregir etiqueta del caso",
  "Final validation failed.": "Falló la validación final.",
  "Link batch to case": "Vincular lote al caso",
  "Link case to batch": "Vincular caso al lote",
  "Link case to sampling": "Vincular caso al muestreo",
  "Link sampling to case": "Vincular muestreo al caso",
  "Multi sampling edit validation":
    "Validación de edición múltiple de muestreos",
  record: "registro",
  "record created.": "registro creado.",
  "record replaced.": "registro reemplazado.",
  "record updated.": "registro actualizado.",
  "record.": "registro.",
  "Relation request log": "Log de solicitud de relación",
  "Relation update log": "Log de actualización de relación",
  sampling: "muestreo",
  "Sampling linked to case.": "Muestreo vinculado al caso.",
  "sampling record created and linked.":
    "registro de muestreo creado y vinculado.",
  "sampling records created and linked.":
    "registros de muestreo creados y vinculados.",
  "Sampling unlinked from case.": "Muestreo desvinculado del caso.",
  "Snapshot JSON preview": "Vista previa JSON de la captura",
  "Snapshot nodes": "Nodos de la captura",
  "This will ensure the current stored file is linked to report code":
    "Esto asegura que el archivo almacenado actual quede vinculado al código de reporte",
  "Unable to correct the case label.":
    "No se pudo corregir la etiqueta del caso.",
  "Unable to create": "No se pudo crear",
  "Unable to create sampling": "No se pudo crear el muestreo",
  "Unable to delete": "No se pudo eliminar",
  "Unable to link the selected batch.":
    "No se pudo vincular el lote seleccionado.",
  "Unable to link the selected case.":
    "No se pudo vincular el caso seleccionado.",
  "Unable to link the selected sampling.":
    "No se pudo vincular el muestreo seleccionado.",
  "Unable to replace": "No se pudo reemplazar",
  "Unable to unlink the batch.": "No se pudo desvincular el lote.",
  "Unable to unlink the case.": "No se pudo desvincular el caso.",
  "Unable to unlink the sampling.": "No se pudo desvincular el muestreo.",
  "Unable to update": "No se pudo actualizar",
  "Unable to update sampling": "No se pudo actualizar el muestreo",
  "Unlink batch from case": "Desvincular lote del caso",
  "Unlink case from batch": "Desvincular caso del lote",
  "Unlink case from sampling": "Desvincular caso del muestreo",
  "Unlink sampling from case": "Desvincular muestreo del caso",
  "Unsaved edits in this workbench are not included in the snapshot. This flow uses the saved case detail currently loaded from Firebase.":
    "Las ediciones sin guardar en esta mesa de trabajo no se incluyen en la captura. Este flujo usa el detalle de caso guardado que está cargado desde Firebase.",
  "Admins and doctors can reason about patient-facing access because this role stores the patient lane directly.":
    "Administradores y médicos pueden razonar sobre el acceso orientado a pacientes porque este rol guarda directamente el carril del paciente.",
  "Bootstrap permissions stay protected, so only non-bootstrap role assignments should be edited from the normal workflow.":
    "Los permisos bootstrap quedan protegidos, por lo que solo las asignaciones no-bootstrap deberían editarse desde el flujo normal.",
  "Can anchor patient-specific boundaries":
    "Puede anclar límites específicos de paciente",
  "Can assign every role type": "Puede asignar cualquier tipo de rol",
  "Can exist as a scoped assignment":
    "Puede existir como asignación con alcance",
  "Can inspect the lane but cannot change the records inside it.":
    "Puede inspeccionar el carril, pero no cambiar sus registros.",
  "Can inspect the local permission map":
    "Puede inspeccionar el mapa local de permisos",
  "Can manage local role assignments":
    "Puede gestionar asignaciones locales de rol",
  "Can manage patient-facing role assignments":
    "Puede gestionar asignaciones de rol orientadas a pacientes",
  "Can operate across every lane": "Puede operar en todos los carriles",
  "Can review the surrounding context":
    "Puede revisar el contexto circundante",
  "Can staff their institution": "Puede administrar el equipo de su institución",
  "Can stay inside one doctor lane":
    "Puede permanecer dentro de un carril médico",
  "Can unblock broader admin work":
    "Puede desbloquear trabajo administrativo más amplio",
  "Cannot create admin lanes": "No puede crear carriles administrativos",
  "Cannot create full admins": "No puede crear administradores totales",
  "Cannot cross institution boundaries":
    "No puede cruzar límites institucionales",
  "Cannot enter the backoffice": "No puede ingresar al backoffice",
  "Cannot grant permissions to others":
    "No puede otorgar permisos a otros",
  "Cannot ignore scope links": "No puede ignorar vínculos de alcance",
  "Cannot manage records": "No puede gestionar registros",
  "Cannot rewrite bootstrap access": "No puede reescribir el acceso bootstrap",
  "Cannot touch peer records": "No puede modificar registros de pares",
  "Covers every institution, doctor, patient, and role assignment in the backoffice.":
    "Cubre todas las instituciones, médicos, pacientes y asignaciones de rol del backoffice.",
  "Even with global reach, each role assignment still needs the right institution, doctor, and patient references.":
    "Incluso con alcance global, cada asignación de rol necesita las referencias correctas de institución, médico y paciente.",
  "Full admins can create and update full admin, institution admin, institution doctor, and patient role assignments.":
    "Los administradores totales pueden crear y actualizar asignaciones de administrador total, administrador de institución, médico de institución y paciente.",
  "Global control over institutions, users, roles, and the legacy moderation tools.":
    "Control global sobre instituciones, usuarios, roles y herramientas históricas de moderación.",
  "Institution admins can create and update institution admin, institution doctor, and patient assignments inside their own institution.":
    "Los administradores de institución pueden crear y actualizar asignaciones de administrador de institución, médico de institución y paciente dentro de su propia institución.",
  "Institution doctors can use the backoffice only for their own doctor profile and the patients attached to that doctor id.":
    "Los médicos de institución solo pueden usar el backoffice para su propio perfil médico y los pacientes asociados a ese ID de médico.",
  "Institution-scoped control over one institution, its doctors, its patients, and local role assignments.":
    "Control con alcance institucional sobre una institución, sus médicos, sus pacientes y sus asignaciones locales de rol.",
  "Informational role record only. Patients do not enter the backoffice.":
    "Registro de rol solo informativo. Los pacientes no ingresan al backoffice.",
  "Patient assignments are informational boundaries, not operator accounts with delegation rights.":
    "Las asignaciones de paciente son límites informativos, no cuentas de operador con permisos para delegar.",
  "Patients do not use the Roles & permissions screen, the 2PQ dashboard, or any other admin surface.":
    "Los pacientes no usan la pantalla Roles y permisos, el dashboard 2PQ ni ninguna otra superficie administrativa.",
  "Promotion into the global admin lane stays reserved for existing full admins only.":
    "La promoción al carril de administración global queda reservada únicamente a administradores totales existentes.",
  "Read access to the institution, full control over the doctor's own profile, and CRUD on the doctor's own patients.":
    "Lectura de la institución, control total sobre el perfil propio del médico y CRUD sobre los pacientes propios del médico.",
  "The patient role assignment links an email to one patient record so the permission model stays explicit.":
    "La asignación de rol paciente vincula un email a un registro de paciente para que el modelo de permisos permanezca explícito.",
  "They can create and update patient assignments for patients that belong to their own lane.":
    "Pueden crear y actualizar asignaciones de paciente para pacientes que pertenecen a su propio carril.",
  "They can inspect the institution and doctor roster needed to understand where their patients sit in the hierarchy.":
    "Pueden inspeccionar la institución y el listado de médicos necesarios para entender dónde se ubican sus pacientes en la jerarquía.",
  "They can pair role changes with doctor and patient maintenance for the institution they administer.":
    "Pueden combinar cambios de rol con mantenimiento de médicos y pacientes de la institución que administran.",
  "They can review and adjust role assignments across all institutions, doctors, and patient-linked records.":
    "Pueden revisar y ajustar asignaciones de rol en todas las instituciones, médicos y registros vinculados a pacientes.",
  "They can review which emails are attached to their institution and how those assignments map to the doctor and patient hierarchy.":
    "Pueden revisar qué emails están asociados a su institución y cómo esas asignaciones se mapean a la jerarquía de médicos y pacientes.",
  "They cannot assign institution admin or institution doctor roles to other users.":
    "No pueden asignar roles de administrador de institución ni médico de institución a otros usuarios.",
  "They cannot create, update, or delete institutions, doctors, patients, or role assignments.":
    "No pueden crear, actualizar ni eliminar instituciones, médicos, pacientes o asignaciones de rol.",
  "They cannot edit doctors, patients, or role assignments linked to another institution.":
    "No pueden editar médicos, pacientes o asignaciones de rol vinculados a otra institución.",
  "They cannot edit the institution root, another doctor profile, or patients and role assignments outside their own doctor scope.":
    "No pueden editar la raíz institucional, el perfil de otro médico ni pacientes o asignaciones de rol fuera de su propio alcance médico.",
  "This removes the doctor, all patients tied to this doctor, and any linked doctor or patient role assignments.":
    "Esto elimina el médico, todos los pacientes asociados a este médico y cualquier asignación de rol de médico o paciente vinculada.",
  "This removes the institution, all attached doctors and patients, and any linked local role assignments.":
    "Esto elimina la institución, todos los médicos y pacientes asociados, y cualquier asignación local de rol vinculada.",
  "This role assignment exists for permission modeling, not for admin work.":
    "Esta asignación de rol existe para modelar permisos, no para trabajo administrativo.",
  "When a scope link changes, they can follow through into the institution, doctor, or patient surfaces that support that assignment.":
    "Cuando cambia un vínculo de alcance, pueden continuar hacia las superficies de institución, médico o paciente que respaldan esa asignación.",
  "Pocket Genes Admin operations console.":
    "Consola operativa de administración Pocket Genes.",
};

export function appText(language: AppLanguage, text: string): string {
  return language === "es" ? SPANISH_TEXT[text] ?? text : text;
}
