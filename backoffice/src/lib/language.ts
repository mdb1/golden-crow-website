export type AppLanguage = "en" | "es";

export const LANGUAGE_STORAGE_KEY = "golden-crow-backoffice-language";
export const LANGUAGE_COOKIE_NAME = "golden-crow-backoffice-language";

export function isAppLanguage(
  value: string | null | undefined,
): value is AppLanguage {
  return value === "en" || value === "es";
}

export function resolveAppLanguage(
  value: string | null | undefined,
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
  "Individual publisher": "Editor",
  "Transport dispatcher": "Transportista",
  "Transport dispatchers": "Transportistas",
  "PGFlex Dispatchers": "PGFlex Transportistas",
  "Open Transport Dispatchers": "Abrir transportistas",
  "+ New Transport Dispatcher": "+ Nuevo transportista",
  "Create transport dispatcher": "Crear transportista",
  "No transport dispatchers match the current filter.":
    "No hay transportistas que coincidan con el filtro actual.",
  "Search transport dispatchers by email, name, or notes...":
    "Buscar transportistas por email, nombre o notas...",
  "transport dispatchers": "transportistas",
  "No Firebase ID": "Sin Firebase ID",
  "Assigned dispatcher": "Transportista asignado",
  "Loading transport dispatchers...": "Cargando transportistas...",
  "Select transport dispatcher": "Seleccionar transportista",
  "Assign shipments by default": "Asignarle los envíos por defecto",
  Envios: "Envios",
  "Time requested": "Hora solicitada",
  "Standalone PGFlex logistics roles without institution, doctor, or patient scope.":
    "Roles logísticos independientes de PGFlex, sin alcance de institución, médico ni paciente.",
  "Standalone PGFlex dispatcher accounts":
    "Cuentas independientes de transportistas PGFlex",
  "Standalone PGFlex dispatcher accounts for logistics assignments.":
    "Cuentas independientes de transportistas PGFlex para asignaciones logísticas.",
  "The current role cannot create transport dispatchers on this screen.":
    "El rol actual no puede crear transportistas en esta pantalla.",
  "Standalone logistics role for PGFlex dispatches assigned to the Firebase account.":
    "Rol logístico independiente para envíos PGFlex asignados a la cuenta Firebase.",
  "Transport dispatchers can enter the PGFlex logistics hub and inspect dispatches assigned to their Firebase account.":
    "Los transportistas pueden entrar al hub logístico PGFlex y revisar envíos asignados a su cuenta Firebase.",
  "Can see only logistics items assigned to their Firebase account.":
    "Puede ver solo envíos logísticos asignados a su cuenta Firebase.",
  "Transport dispatcher roles require a display name.":
    "Los roles de transportista requieren un nombre visible.",
  "Transport dispatchers cannot create role assignments.":
    "Los transportistas no pueden crear asignaciones de rol.",
  "Transport dispatchers cannot create or modify role assignments.":
    "Los transportistas no pueden crear ni modificar asignaciones de rol.",
  "Delete user": "Eliminar usuario",
  "Delete role user?": "¿Eliminar este usuario?",
  "Role user deleted.": "Usuario eliminado.",
  "Unable to delete the role user.": "No se pudo eliminar el usuario.",
  "This deletes the role assignment and the Firebase Auth user if one exists. This cannot be undone.":
    "Esto elimina la asignación de rol y el usuario de Firebase Auth si existe. No se puede deshacer.",
  "Email-based access tree for full admins, transport dispatchers, institution admins, institution operators, institution laboratory staff, doctors, and patients.":
    "Árbol de acceso por email para administradores totales, transportistas, administradores de institución, operarios de institución, personal de laboratorio, médicos y pacientes.",
  "Institution operator": "Operario de institución",
  "Institution laboratory staff": "Personal de laboratorio de institución",
  "Institution doctor": "Médico de institución",
  Patient: "Paciente",
  "Light mode": "Modo claro",
  "Dark mode": "Modo oscuro",
  "Switch to dark mode": "Cambiar a modo oscuro",
  "Switch to light mode": "Cambiar a modo claro",
  Appearance: "Apariencia",
  "API documentation": "Documentación API",
  "API Keys": "Claves API",
  PGFlex: "PGFlex",
  "PGFlex portal": "Portal PGFlex",
  "You are in the PGFlex portal": "Estás en el portal PGFlex",
  "PGFlex access": "Acceso PGFlex",
  Logistics: "Logística",
  "PGFlex logistics": "Logística PGFlex",
  "Create dispatch": "Crear envío",
  "Search dispatches by identifier, route, dispatcher, or status...":
    "Buscar envíos por identificador, recorrido, transportista o estado...",
  "loaded dispatches": "envíos cargados",
  "Dispatch status group": "Grupo de estado de envío",
  Dispatch: "Envío",
  Route: "Recorrido",
  Pickup: "Retiro",
  "No PGFlex logistics items match the current filter.":
    "No hay envíos PGFlex activos en este momento.",
  "Unable to load more PGFlex logistics items.":
    "No se pudieron cargar más envíos PGFlex.",
  "Unable to refresh PGFlex logistics items.":
    "No se pudieron actualizar los envíos PGFlex.",
  "Standalone dispatch": "Envío independiente",
  "No route": "Sin recorrido",
  Unassigned: "Sin asignar",
  "Shipment type": "Tipo de envío",
  "Select shipment type": "Seleccionar tipo de envío",
  Identifier: "Identificador",
  "Linked codes": "Códigos vinculados",
  "No linked codes added.": "No hay códigos vinculados.",
  "Add more": "Agregar más",
  "Enter a 3-letter code": "Ingresá un código de 3 letras",
  "Use exactly 3 letters, no numbers.":
    "Usá exactamente 3 letras, sin números.",
  "Remove code": "Quitar código",
  "Code already added.": "El código ya fue agregado.",
  "Dispatcher ID": "ID de transportista",
  "Transport dispatcher email": "Email del transportista",
  Origin: "Origen",
  "Neighborhood / Locality": "Barrio / Localidad",
  "Province / District": "Provincia / Distrito",
  "Buenos Aires Province": "Provincia de Buenos Aires",
  Destination: "Destino",
  "Route preview": "Vista del recorrido",
  "Route preview map": "Mapa de vista del recorrido",
  "Preview route": "Visualizar recorrido",
  "Change route": "Cambiar recorrido",
  "Google Maps route log": "Log de recorrido Google Maps",
  "Close route error log": "Cerrar log de error de recorrido",
  "Route error log details": "Detalle del log de error de recorrido",
  "Full Google Maps route error log. Copy this JSON and send it for debugging.":
    "Log completo del error de recorrido de Google Maps. Copiá este JSON para enviarlo a depuración.",
  "Clipboard copy failed. You can still select the log text and copy it manually.":
    "No se pudo copiar al portapapeles. Todavía podés seleccionar el texto del log y copiarlo manualmente.",
  "No route error log available.":
    "No hay log de error de recorrido disponible.",
  "Best driving route with approximate time.":
    "Mejor recorrido en auto con tiempo aproximado.",
  "Traffic aware": "Considera tráfico",
  "Google Maps preview is not configured.":
    "La vista de Google Maps no está configurada.",
  "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable route previews.":
    "Configurá NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para activar las vistas de recorrido.",
  "Finding route...": "Calculando recorrido...",
  "Unable to load Google Maps.": "No se pudo cargar Google Maps.",
  "Google Maps route preview is unavailable.":
    "La previsualización de recorrido de Google Maps no está disponible.",
  "Unable to calculate a route for these addresses.":
    "No se pudo calcular un recorrido para estas direcciones.",
  "Routes API is disabled for this Google Cloud project. Enable Routes API on the project that owns this browser key.":
    "Routes API está desactivada en este proyecto de Google Cloud. Activá Routes API en el proyecto dueño de esta browser key.",
  "This API key is blocked from using Routes API. Add Routes API to the key API restrictions or remove API restrictions for testing.":
    "Esta API key no tiene permitido usar Routes API. Agregá Routes API a las restricciones de API de la key o quitá restricciones para probar.",
  "Billing is disabled for the Google Cloud project. Enable billing before calculating PGFlex routes.":
    "Billing está desactivado para el proyecto de Google Cloud. Activá billing antes de calcular recorridos PGFlex.",
  "Google could not match this API key to a valid consumer project. Check that the deployed key belongs to the expected Google Cloud project.":
    "Google no pudo asociar esta API key con un proyecto válido. Revisá que la key desplegada pertenezca al proyecto de Google Cloud esperado.",
  "Google rejected the API key as invalid. Check the deployed key value character by character.":
    "Google rechazó la API key como inválida. Revisá caracter por caracter la key desplegada.",
  "Google denied the Routes REST request. Open Show log to copy the raw Google response with HTTP status, headers and body.":
    "Google denegó la solicitud REST de Routes. Abrí Ver log para copiar la respuesta cruda de Google con status HTTP, headers y body.",
  "Google Maps rejected the route preview before calculation. This is a browser API key, billing, or API enablement problem, not an address problem. Check allowed domains for this deploy URL and that Maps JavaScript API and Routes API are enabled.":
    "Google Maps rechazó la previsualización antes de calcular el recorrido. Es un problema de API key del navegador, billing o APIs activas, no de las direcciones. Revisá los dominios permitidos para esta URL y que Maps JavaScript API y Routes API estén activas.",
  "Google rejected the route services request. This is usually API configuration, not the addresses. Check API key restrictions, billing, and that Maps JavaScript API and Routes API are enabled.":
    "Google rechazó la solicitud de servicios de recorrido. Normalmente es configuración de APIs, no las direcciones. Revisá restricciones de API key, billing y que Maps JavaScript API y Routes API estén activas.",
  "Google could not find a drivable route for these addresses. Use full street, city, province, and country, then try again.":
    "Google no encontró un recorrido manejable para estas direcciones. Usá calle, ciudad, provincia y país completos, y volvé a intentar.",
  "Google Maps quota rejected this route request. Check project quota and billing before trying again.":
    "La cuota de Google Maps rechazó la solicitud. Revisá la cuota del proyecto y billing antes de volver a intentar.",
  "Google Maps did not answer in time. Use Change route and try again, or verify the Google APIs and billing configuration.":
    "Google Maps no respondió a tiempo. Usá Change route y volvé a intentar, o revisá las APIs de Google y la configuración de billing.",
  "Google Maps did not answer in time. Use Change route and try again. If the map behind this message shows a Google error, check browser API key restrictions, billing, and enabled Google Maps APIs.":
    "Google Maps no respondió a tiempo. Usá Cambiar recorrido y volvé a intentar. Si el mapa detrás de este mensaje muestra un error de Google, revisá restricciones de API key, billing y APIs de Google Maps activas.",
  "Routes API did not answer in time. Use Change route and try again; the running request is cancelled when the route is changed.":
    "Routes API no respondió a tiempo. Usá Cambiar recorrido y volvé a intentar; la solicitud en curso se cancela cuando cambiás el recorrido.",
  "The browser could not reach Routes API. Check network access, CORS, allowed referrers and the deployed browser key.":
    "El navegador no pudo llegar a Routes API. Revisá red, CORS, referrers permitidos y la browser key desplegada.",
  "Google Maps failed to load. Verify the browser API key, allowed domains, billing, and that Maps JavaScript API is enabled.":
    "Google Maps no pudo cargar. Revisá la API key del browser, los dominios permitidos, billing y que Maps JavaScript API esté activa.",
  "Google Maps could not calculate this route. Check both addresses and try again with Preview route.":
    "Google Maps no pudo calcular este recorrido. Revisá ambas direcciones y volvé a intentar con Visualizar recorrido.",
  "Add origin and destination addresses to preview the route.":
    "Agregá origen y destino para visualizar el recorrido.",
  "Open in Google Maps": "Ver en Google Maps",
  "Complete origin address": "Completá el origen",
  "Add at least locality and province to the origin before previewing the route.":
    "Indicá al menos localidad y provincia en el origen antes de visualizar el recorrido.",
  "Address and neighborhood/locality must each have at least 3 characters.":
    "Dirección y barrio/localidad deben tener al menos 3 caracteres cada uno.",
  "Time of pick up": "Hora de retiro",
  Arrived: "Llegó",
  Lost: "Perdido",
  "Back to logistics": "Volver a logística",
  "Logistics workbench": "Mesa de trabajo logística",
  "Picked up at": "Retirado el",
  "Delivered at": "Entregado el",
  "Mark as picked up": "Marcar como retirado",
  "Mark as delivered": "Marcar como entregado",
  "Saving pickup...": "Guardando retiro...",
  "Saving delivery...": "Guardando entrega...",
  "Are you sure?": "¿Estás seguro?",
  "This action is irreversible. It will log the time and notify the client.":
    "Esta acción es irreversible. Se va a registrar la hora y notificar al cliente.",
  "Transport dispatchers can update only the status of assigned logistics items.":
    "Los transportistas solo pueden actualizar el estado de los envíos asignados.",
  "Identifier is required.": "El identificador es requerido.",
  "Origin is required.": "El origen es requerido.",
  "Destination is required.": "El destino es requerido.",
  "Time of pick up is required.": "La hora de retiro es requerida.",
  "PGFlex logistics item saved.": "Envío PGFlex guardado.",
  "PGFlex logistics status updated.": "Estado del envío PGFlex actualizado.",
  "Dispatch created": "Envío creado",
  "The PGFlex dispatch is ready": "El envío PGFlex está listo",
  "was saved and is available in PGFlex.":
    "quedó guardado y está disponible en PGFlex.",
  "Open dispatch": "Ver envío",
  "See all dispatches": "Ver todos los envíos",
  "Unable to update PGFlex logistics status.":
    "No se pudo actualizar el estado del envío PGFlex.",
  "Unable to create PGFlex logistics item.":
    "No se pudo crear el envío PGFlex.",
  "Unable to save PGFlex logistics item.":
    "No se pudo guardar el envío PGFlex.",
  "Unable to delete PGFlex logistics item.":
    "No se pudo eliminar el envío PGFlex.",
  "Danger zone": "Zona de riesgo",
  "Irreversible actions that permanently delete this PGFlex dispatch.":
    "Acciones irreversibles que eliminan permanentemente este envío PGFlex.",
  "Dispatch deletion": "Eliminación de envío",
  "Delete this standalone PGFlex logistics item only when it was created by mistake or should no longer appear in PGFlex. This action cannot be undone.":
    "Eliminá este envío logístico independiente solo cuando fue creado por error o ya no debe aparecer en PGFlex. Esta acción no se puede deshacer.",
  "Delete dispatch": "Eliminar envío",
  "Delete dispatch?": "¿Eliminar envío?",
  "This removes the standalone PGFlex logistics item.":
    "Esto elimina el envío PGFlex independiente.",
  "Standalone PGFlex logistics role": "Rol logístico PGFlex independiente",
  "Open PGFlex logistics": "Abrir logística PGFlex",
  "Standalone logistics dispatches and transport status.":
    "Envíos logísticos independientes y estado de transporte.",
  "Standalone PGFlex logistics dispatches":
    "Envíos logísticos independientes de PGFlex",
  "New logistics item": "Nuevo envío logístico",
  "Create a standalone dispatch record.":
    "Crear un registro de envío independiente.",
  "Logistics detail": "Detalle logístico",
  "Dispatch status, route, pickup time, and dispatcher assignment.":
    "Estado del envío, recorrido, hora de retiro y asignación de transportista.",
  "Public OpenAPI reference and integration examples":
    "Referencia OpenAPI pública y ejemplos de integración",
  "Public reporting bearer token setup and rotation notes":
    "Configuración del bearer token público de reportes y notas de rotación",
  "2PQ API": "API 2PQ",
  "Public OpenAPI reference for patient lookup, report upload notifications, and 2PQ case lookup.":
    "Referencia OpenAPI pública para buscar pacientes, notificar reportes subidos y consultar casos 2PQ.",
  "Public reporting API bearer token handling for full admins.":
    "Gestión del bearer token público de la API de reportes para administradores totales.",
  "Sign out": "Cerrar sesión",
  "Signing out...": "Cerrando sesión...",
  Switch: "Cambiar",
  "Switch project": "Cambiar proyecto",
  "Switching...": "Cambiando...",
  "Switch to PocketGenes": "Cambiar a PocketGenes",
  "Switch to Pocket Gyms": "Cambiar a Pocket Gyms",
  "Show header context": "Mostrar contexto de encabezado",
  "Hide header context": "Ocultar contexto de encabezado",
  "Coach operations console.": "Consola de operaciones del coach.",
  "Coach queues and athlete signals": "Colas del coach y señales de atletas",
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
  "Set manually": "Definir manualmente",
  "Additional trip notes": "Notas adicionales del viaje",
  Description: "Descripción",
  "Description language": "Idioma de descripción",
  English: "Inglés",
  Spanish: "Español",
  "Add an English organization description to reach a broader audience.":
    "Agregá una descripción de la organización en inglés para llegar a una audiencia más amplia.",
  "Add an English individual publisher description to reach a broader audience.":
    "Agregá una descripción del editor en inglés para llegar a una audiencia más amplia.",
  Discover: "Discover",
  "Discover feed publishers and mobile feed entries.":
    "Publicadores y entradas móviles del feed Discover.",
  "Discover publisher": "Publicador de Discover",
  "Discover entry": "Entrada de Discover",
  Organizations: "Organizaciones",
  Organization: "Organización",
  "Individual Publishers": "Editores",
  "New individual publisher": "Nuevo editor",
  "Create individual publisher": "Crear editor",
  "Back to individual publishers": "Volver a editores",
  "Individual type": "Tipo de individuo",
  "Organization category": "Categoría de organización",
  "Professional categories": "Categoría profesional",
  "Genetic report provider": "Proveedor de reportes genéticos",
  "Not a genetic report provider": "No es proveedor de reportes genéticos",
  "Genetic report category": "Categoría de reporte genético",
  "No genetic report category": "Sin categoría de reporte genético",
  "Genetic reports": "Reportes genéticos",
  "All report providers": "Todos los proveedores de reportes",
  "Report providers only": "Solo proveedores de reportes",
  "Non-providers": "No proveedores",
  "All report categories": "Todas las categorías de reportes",
  Reproductive: "Reproductivo",
  Ophthalmics: "Oftalmológico",
  "Full genome": "Genoma completo",
  "Raw PDF": "PDF sin procesar",
  "Raw VCF": "VCF sin procesar",
  "Country coverage": "Cobertura por país",
  "Select organization category": "Seleccionar categoría de organización",
  "Select professional categories": "Seleccionar categoría profesional",
  "Choose one or more canonical Discover categories. They will be saved as comma-separated keys.":
    "Elegí una o más opciones canónicas de Discover. Se guardan como claves separadas por coma.",
  "No categories selected": "Sin opción seleccionada",
  "Search categories": "Buscar opción",
  "category selected": "opción seleccionada",
  "categories selected": "opciones seleccionadas",
  "country selected": "país seleccionado",
  "All categories": "Todas las opciones",
  Categories: "Categoría",
  "Open color picker": "Abrir paleta de colores",
  "Social networks": "Redes sociales",
  "Add one optional link for each social network.":
    "Agregá un enlace opcional por cada red social.",
  "Social network": "Red social",
  "Add social link": "Agregar red social",
  "Choose social network": "Elegir red social",
  "Select a social network to add one optional link.":
    "Elegí una red social para agregar un enlace opcional.",
  "All social networks added": "Todas las redes sociales agregadas",
  "No social links added": "Sin redes sociales agregadas",
  "Facebook profile": "Perfil de Facebook",
  "X / Twitter profile": "Perfil en X / Twitter",
  "Instagram profile": "Perfil de Instagram",
  "TikTok profile": "Perfil de TikTok",
  "YouTube channel": "Canal de YouTube",
  "LinkedIn profile": "Perfil de LinkedIn",
  "GitHub profile": "Perfil de GitHub",
  "GitLab profile": "Perfil de GitLab",
  "Stack Overflow profile": "Perfil de Stack Overflow",
  "Hugging Face profile": "Perfil de Hugging Face",
  "Kaggle profile": "Perfil de Kaggle",
  "ResearchGate profile": "Perfil de ResearchGate",
  ORCID: "ORCID",
  "Google Scholar profile": "Perfil de Google Scholar",
  "PubMed profile": "Perfil de PubMed",
  "Scopus profile": "Perfil de Scopus",
  "Web of Science profile": "Perfil de Web of Science",
  "BioStars profile": "Perfil de BioStars",
  "protocols.io profile": "Perfil de protocols.io",
  "OSF profile": "Perfil de OSF",
  "Zenodo profile": "Perfil de Zenodo",
  WhatsApp: "WhatsApp",
  Telegram: "Telegram",
  "Threads profile": "Perfil de Threads",
  "Pinterest profile": "Perfil de Pinterest",
  "Snapchat profile": "Perfil de Snapchat",
  "Reddit profile": "Perfil de Reddit",
  "Discord server": "Servidor de Discord",
  "Twitch channel": "Canal de Twitch",
  "Bluesky profile": "Perfil de Bluesky",
  "Mastodon profile": "Perfil de Mastodon",
  "Other link": "Otro enlace",
  "Individual publisher name": "Nombre del editor",
  "Individual publisher name is required.":
    "El nombre del editor es obligatorio.",
  "Individual publisher color must be a 6-digit hex value.":
    "El color del editor debe ser un valor hexadecimal de 6 dígitos.",
  "Individual publisher created.": "Editor creado.",
  "Individual publisher changes saved.": "Cambios del editor guardados.",
  "Individual publisher archived.": "Editor archivado.",
  "Individual publisher reactivated.": "Editor reactivado.",
  "Unable to save the individual publisher.": "No se pudo guardar el editor.",
  "Unable to load more individual publishers.":
    "No se pudieron cargar más editores.",
  "Unable to refresh individual publishers.":
    "No se pudieron actualizar los editores.",
  "Unable to update the individual publisher status.":
    "No se pudo actualizar el estado del editor.",
  "No Discover individual publishers match the loaded rows.":
    "Ningún editor de Discover coincide con las filas cargadas.",
  "Search individual publisher name, URL, email, or slug":
    "Buscar por nombre, URL, email o slug de editor",
  "New organization": "Nueva organización",
  "Create organization": "Crear organización",
  "Back to organizations": "Volver a organizaciones",
  "Organization type": "Tipo de organización",
  "Organization name": "Nombre de organización",
  "Organization name is required.":
    "El nombre de la organización es obligatorio.",
  "Organization color must be a 6-digit hex value.":
    "El color de la organización debe ser un valor hexadecimal de 6 dígitos.",
  "Organization created.": "Organización creada.",
  "Organization changes saved.": "Cambios de organización guardados.",
  "Organization archived.": "Organización archivada.",
  "Organization reactivated.": "Organización reactivada.",
  "Unable to save the organization.": "No se pudo guardar la organización.",
  "Unable to load more organizations.":
    "No se pudieron cargar más organizaciones.",
  "Unable to refresh organizations.":
    "No se pudieron actualizar las organizaciones.",
  "Unable to update the organization status.":
    "No se pudo actualizar el estado de la organización.",
  "No Discover organizations match the loaded rows.":
    "Ninguna organización de Discover coincide con las filas cargadas.",
  "Search organization name, URL, email, or slug":
    "Buscar por nombre, URL, email o slug de organización",
  "Accent color": "Color principal",
  "Accent color picker": "Selector de color principal",
  "No accent color": "Sin color principal",
  "No image URL": "Sin URL de imagen",
  "No website URL": "Sin URL de sitio web",
  "Image URL": "URL de imagen",
  "Image URL is required.": "La URL de imagen es obligatoria.",
  "Website URL": "URL del sitio web",
  "Internal notes": "Notas internas",
  "Verified publisher": "Publicador verificado",
  Verified: "Verificado",
  Unverified: "No verificado",
  active: "activo",
  inactive: "inactivo",
  archived: "archivado",
  pending_approval: "pendiente de aprobación",
  draft: "borrador",
  published: "publicado",
  Foundation: "Fundación",
  Hospital: "Hospital",
  University: "Universidad",
  Laboratory: "Laboratorio",
  "Research institute": "Instituto de investigación",
  "Patient advocacy group": "Grupo de apoyo a pacientes",
  "Public health agency": "Agencia de salud pública",
  "Conference organizer": "Organizador de conferencias",
  Researcher: "Investigador",
  Clinician: "Clínico",
  "Genetic counselor": "Asesor genético",
  "Patient advocate": "Referente de pacientes",
  Bioinformatician: "Bioinformático",
  Educator: "Educador",
  Journalist: "Periodista",
  "Community leader": "Líder comunitario",
  Unspecified: "Sin especificar",
  "Genetic Testing Laboratory": "Laboratorio de pruebas genéticas",
  "Genomics Laboratory": "Laboratorio de genómica",
  "Molecular Diagnostics Laboratory": "Laboratorio de diagnóstico molecular",
  "Reproductive Genetics Laboratory": "Laboratorio de genética reproductiva",
  "Prenatal Genetics Laboratory": "Laboratorio de genética prenatal",
  "NIPT Provider": "Proveedor de NIPT",
  "Oncology Genetics Laboratory": "Laboratorio de genética oncológica",
  "Pharmacogenomics Provider": "Proveedor de farmacogenómica",
  "Nutrigenomics Provider": "Proveedor de nutrigenómica",
  "Bioinformatics Company": "Empresa de bioinformática",
  "Variant Interpretation Company": "Empresa de interpretación de variantes",
  "Genetic Testing Platform": "Plataforma de pruebas genéticas",
  "Clinical Genetics Center": "Centro de genética clínica",
  "Genetic Counseling Center": "Centro de asesoramiento genético",
  "Fertility Clinic": "Clínica de fertilidad",
  "Reproductive Medicine Center": "Centro de medicina reproductiva",
  "Gamete Bank": "Banco de gametos",
  "Maternal Medicine Center": "Centro de medicina materna",
  "Fetal Medicine Center": "Centro de medicina fetal",
  "Oncology Center": "Centro de oncología",
  "Neurogenetics Center": "Centro de neurogenética",
  "Cardiogenetics Center": "Centro de cardiogenética",
  "Pediatric Genetics Center": "Centro de genética pediátrica",
  "Metabolic Genetics Center": "Centro de genética metabólica",
  "Rare Disease Center": "Centro de enfermedades poco frecuentes",
  "Rare Disease Foundation": "Fundación de enfermedades poco frecuentes",
  "Patient Organization": "Organización de pacientes",
  "Disease Foundation": "Fundación de enfermedades",
  "Patient Advocacy Organization": "Organización de apoyo a pacientes",
  "Caregiver Organization": "Organización de cuidadores",
  "Family Support Organization": "Organización de apoyo familiar",
  "Rare Disease Network": "Red de enfermedades poco frecuentes",
  "Patient Community": "Comunidad de pacientes",
  "Disability Organization": "Organización de discapacidad",
  "Genetics Education Provider": "Proveedor de educación en genética",
  "Genomics Education Provider": "Proveedor de educación en genómica",
  "Bioinformatics Education Provider":
    "Proveedor de educación en bioinformática",
  "Medical Education Provider": "Proveedor de educación médica",
  "Teaching Hospital": "Hospital universitario",
  "Scientific Society": "Sociedad científica",
  "Medical Society": "Sociedad médica",
  "Professional Association": "Asociación profesional",
  "Genomics Research Institute": "Instituto de investigación genómica",
  "Genetics Research Institute": "Instituto de investigación genética",
  "Rare Disease Research Organization":
    "Organización de investigación en enfermedades poco frecuentes",
  "University Research Laboratory":
    "Laboratorio universitario de investigación",
  "Clinical Research Organization": "Organización de investigación clínica",
  "Clinical Trial Sponsor": "Patrocinador de ensayo clínico",
  "Clinical Trial Network": "Red de ensayos clínicos",
  Biobank: "Biobanco",
  "Genomic Database": "Base de datos genómica",
  "Precision Medicine Company": "Empresa de medicina de precisión",
  "Biotechnology Company": "Empresa de biotecnología",
  "Gene Therapy Company": "Empresa de terapia génica",
  "Cell Therapy Company": "Empresa de terapia celular",
  "Pharmaceutical Company": "Empresa farmacéutica",
  "Sequencing Company": "Empresa de secuenciación",
  "Healthcare Network": "Red de atención médica",
  "Public Health Organization": "Organización de salud pública",
  "Clinical Geneticist": "Genetista clínico",
  "Medical Geneticist": "Genetista médico",
  "Molecular Geneticist": "Genetista molecular",
  "Human Geneticist": "Genetista humano",
  Cytogeneticist: "Citogenetista",
  "Genetic Counselor": "Asesor genético",
  "Genomics Specialist": "Especialista en genómica",
  "Computational Biologist": "Biólogo computacional",
  "Molecular Biologist": "Biólogo molecular",
  "Cell Biologist": "Biólogo celular",
  Biotechnologist: "Biotecnólogo",
  Biochemist: "Bioquímico",
  Microbiologist: "Microbiólogo",
  "Biomedical Scientist": "Científico biomédico",
  "Laboratory Scientist": "Científico de laboratorio",
  "Laboratory Technician": "Técnico de laboratorio",
  "Genomic Analyst": "Analista genómico",
  "Variant Scientist": "Científico de variantes",
  "Variant Curator": "Curador de variantes",
  "Data Scientist": "Científico de datos",
  Biostatistician: "Bioestadístico",
  "Research Scientist": "Investigador científico",
  "Clinical Researcher": "Investigador clínico",
  "Principal Investigator": "Investigador principal",
  Physician: "Médico",
  Pediatrician: "Pediatra",
  Neurologist: "Neurólogo",
  Oncologist: "Oncólogo",
  Hematologist: "Hematólogo",
  Cardiologist: "Cardiólogo",
  Endocrinologist: "Endocrinólogo",
  Immunologist: "Inmunólogo",
  Pathologist: "Patólogo",
  "Reproductive Specialist": "Especialista en reproducción",
  "Fertility Specialist": "Especialista en fertilidad",
  Embryologist: "Embriólogo",
  Obstetrician: "Obstetra",
  Gynecologist: "Ginecólogo",
  "Maternal Medicine Specialist": "Especialista en medicina materna",
  "Fetal Medicine Specialist": "Especialista en medicina fetal",
  "Pediatric Genetics Specialist": "Especialista en genética pediátrica",
  "Metabolic Disease Specialist": "Especialista en enfermedades metabólicas",
  "Rare Disease Specialist": "Especialista en enfermedades poco frecuentes",
  "Pharmacogenomics Specialist": "Especialista en farmacogenómica",
  "Precision Medicine Specialist": "Especialista en medicina de precisión",
  "Genetic Epidemiologist": "Epidemiólogo genético",
  "Public Health Specialist": "Especialista en salud pública",
  "Clinical Trial Specialist": "Especialista en ensayos clínicos",
  "Research Coordinator": "Coordinador de investigación",
  "Patient Advocate": "Referente de pacientes",
  "Patient Navigator": "Navegador de pacientes",
  "Rare Disease Advocate": "Referente de enfermedades poco frecuentes",
  Caregiver: "Cuidador",
  Professor: "Profesor",
  "Science Communicator": "Comunicador científico",
  "Medical Writer": "Redactor médico",
  "Healthcare Executive": "Ejecutivo de salud",
  "Biotechnology Entrepreneur": "Emprendedor biotecnológico",
  Entrepreneur: "Emprendedor",
  "Startup Founder": "Fundador de startup",
  "Small Business Owner": "Dueño de pequeña empresa",
  "Software Engineer": "Ingeniero de software",
  "App Developer": "Desarrollador de apps",
  "Web Developer": "Desarrollador web",
  "Product Manager": "Product manager",
  "UX/UI Designer": "Diseñador UX/UI",
  "Data Engineer": "Ingeniero de datos",
  "AI Engineer": "Ingeniero de IA",
  "Machine Learning Engineer": "Ingeniero de aprendizaje automático",
  "AI Researcher": "Investigador en IA",
  "Content Creator": "Creador de contenido",
  Microinfluencer: "Microinfluenciador",
  Influencer: "Influenciador",
  "Social Media Manager": "Responsable de redes sociales",
  "Community Manager": "Gestor de comunidad",
  "Marketing Specialist": "Especialista en marketing",
  "Growth Marketer": "Especialista en growth marketing",
  "Brand Strategist": "Estratega de marca",
  "Communications Manager": "Responsable de comunicaciones",
  Editor: "Editor de contenido",
  "Podcast Host": "Conductor de podcast",
  "Video Producer": "Productor de video",
  "Public Speaker": "Orador",
  Leader: "Líder",
  "Project Manager": "Gerente de proyectos",
  Consultant: "Consultor",
  "Feed entries": "Entradas del feed",
  "Feed entry": "Entrada del feed",
  "New feed entry": "Nueva entrada del feed",
  "Create feed entry": "Crear entrada del feed",
  "Back to feed entries": "Volver a entradas del feed",
  Entry: "Entrada",
  Publisher: "Publicador",
  publisher: "publicador",
  "Publisher draft": "Borrador de publicador",
  "No publisher selected": "Sin publicador seleccionado",
  "Choose organization": "Elegir organización",
  "Choose publisher": "Elegir publicador",
  "Choose a publisher organization.": "Elegí una organización publicadora.",
  "Choose one publisher.": "Elegí un publicador.",
  "Select countries": "Seleccionar países",
  "Choose countries": "Elegir países",
  "Search countries": "Buscar países",
  "No countries match": "No hay países que coincidan",
  "No countries selected": "Sin países seleccionados",
  "countries selected": "países seleccionados",
  "Clear selected": "Limpiar selección",
  "Clear all": "Limpiar todo",
  Done: "Listo",
  "Load more publishers": "Cargar más publicadores",
  "All publishers": "Todos los publicadores",
  "All statuses": "Todos los estados",
  Reactivate: "Reactivar",
  "Unable to load more publishers.": "No se pudieron cargar más publicadores.",
  "No Discover feed entries match the loaded rows.":
    "Ninguna entrada de Discover coincide con las filas cargadas.",
  "Search title, publisher, body, or URL":
    "Buscar por título, publicador, cuerpo o URL",
  News: "Noticias",
  "Research update": "Actualización de investigación",
  "Upcoming event": "Próximo evento",
  Opportunity: "Oportunidad",
  Video: "Video",
  Article: "Artículo",
  "Podcast episode": "Episodio de podcast",
  Survey: "Encuesta",
  "Organization spotlight": "Organización destacada",
  "Professional spotlight": "Profesional destacado",
  "Community invitation": "Invitación a comunidad",
  "Bioinformatics tool": "Herramienta de bioinformática",
  "Genomic database": "Base de datos genómica",
  "Health guidance": "Guía de salud",
  "Educational explainer": "Explicación educativa",
  "Gene spotlight": "Gen destacado",
  "Condition spotlight": "Condición destacada",
  "Genetic test guide": "Guía de prueba genética",
  "Report explainer": "Explicación de reporte",
  "Clinical guideline": "Guía clínica",
  "Clinical trial": "Ensayo clínico",
  "Patient registry": "Registro de pacientes",
  "Research participation": "Participación en investigación",
  "Screening program": "Programa de detección",
  "Support service": "Servicio de apoyo",
  Course: "Curso",
  "Downloadable resource": "Recurso descargable",
  "Patient or caregiver story": "Historia de paciente o cuidador",
  "Expert Q&A": "Preguntas y respuestas con experto",
  "Advocacy campaign": "Campaña de acción comunitaria",
  Draft: "Borrador",
  "Needs content": "Falta contenido",
  Duplicate: "Duplicar",
  "Unable to duplicate the feed entry.":
    "No se pudo duplicar la entrada del feed.",
  "Unable to load more feed entries.":
    "No se pudieron cargar más entradas del feed.",
  "Unable to refresh feed entries.":
    "No se pudieron actualizar las entradas del feed.",
  "Unable to save the feed entry.": "No se pudo guardar la entrada del feed.",
  "Generic information": "Información general",
  "Feed setup": "Configuración del feed",
  Complete: "Completo",
  Name: "Nombre",
  Type: "Tipo",
  Language: "Idioma",
  Title: "Título",
  Subtitle: "Subtítulo",
  Body: "Cuerpo",
  "Source URL": "URL de origen",
  "Main button": "Botón principal",
  "Main note button customization":
    "Personalización del botón principal de la nota",
  "Main button link": "Enlace del botón principal",
  "Main button text": "Texto del botón principal",
  "Open organizer website": "Abrir sitio web del organizador",
  "Cover image URL": "URL de imagen de portada",
  "Use a public HTTPS image in PNG, JPG, JPEG, or WebP. Recommended size: 1024 x 500 px, up to 1 MB, high quality, with no important text or faces close to the edges.":
    "Usá una imagen pública HTTPS en PNG, JPG, JPEG o WebP. Tamaño recomendado: 1024 x 500 px, hasta 1 MB, calidad alta, sin texto importante ni caras cerca de los bordes.",
  "Write the note": "Escribir la nota",
  "Simple text": "Texto simple",
  "Rich text": "Texto enriquecido",
  Heading: "Encabezado",
  Bold: "Negrita",
  Italic: "Cursiva",
  "Bulleted list": "Lista con viñetas",
  Quote: "Cita",
  Link: "Enlace",
  characters: "caracteres",
  "HTML will be sanitized before storage.":
    "El HTML se sanitizará antes de guardarse.",
  "Plain body will be stored as body.":
    "El cuerpo simple se guardará como body.",
  "Specific type fields": "Campos específicos del tipo",
  Category: "Categoría",
  Region: "Región",
  "Research topic": "Tema de investigación",
  Journal: "Revista",
  Genes: "Genes",
  Conditions: "Condiciones",
  "Event date": "Fecha del evento",
  Location: "Ubicación",
  "Max attendance": "Asistencia máxima",
  "Virtual meeting link": "Link de reunión virtual",
  "Opportunity type": "Tipo de oportunidad",
  "Choose type": "Elegir tipo",
  Requirements: "Requisitos",
  Eligibility: "Elegibilidad",
  Provider: "Proveedor",
  "Duration seconds": "Duración en segundos",
  Presenters: "Presentadores",
  "Caption languages": "Idiomas de subtítulos",
  "Publication name": "Nombre de la publicación",
  Authors: "Autores",
  "Article date": "Fecha del artículo",
  Section: "Sección",
  "Podcast name": "Nombre del podcast",
  "Episode number": "Número de episodio",
  Hosts: "Conductores",
  Guests: "Invitados",
  "Estimated minutes": "Minutos estimados",
  "Closing date": "Fecha de cierre",
  "Target audience": "Audiencia objetivo",
  Anonymous: "Anónimo",
  "Featured organization ID": "ID de organización destacada",
  "Focus conditions": "Condiciones foco",
  Services: "Servicios",
  "Service regions": "Regiones de servicio",
  "Featured individual ID": "ID de profesional destacado",
  Specialties: "Especialidades",
  Languages: "Idiomas",
  "Community type": "Tipo de comunidad",
  "Access type": "Tipo de acceso",
  "Community languages": "Idiomas de la comunidad",
  Moderated: "Moderada",
  "Tool name": "Nombre de la herramienta",
  "Tool category": "Categoría de herramienta",
  "Input formats": "Formatos de entrada",
  "Technical level": "Nivel técnico",
  "License model": "Modelo de licencia",
  "Resource name": "Nombre del recurso",
  "Data scope": "Alcance de datos",
  "Supported species": "Especies soportadas",
  "Access model": "Modelo de acceso",
  "Update frequency": "Frecuencia de actualización",
  "Reviewed by": "Revisado por",
  "Reviewed at": "Fecha de revisión",
  "Evidence level": "Nivel de evidencia",
  "Urgency level": "Nivel de urgencia",
  Topic: "Tema",
  "Difficulty level": "Nivel de dificultad",
  "Learning objectives": "Objetivos de aprendizaje",
  "Gene symbol": "Símbolo del gen",
  "Gene name": "Nombre del gen",
  "Inheritance modes": "Modos de herencia",
  "Related conditions": "Condiciones relacionadas",
  "Condition name": "Nombre de la condición",
  "Ontology IDs": "IDs de ontología",
  "Related genes": "Genes relacionados",
  "Test type": "Tipo de prueba",
  "Sample types": "Tipos de muestra",
  "Intended use": "Uso previsto",
  "Turnaround time": "Tiempo de entrega",
  "Requires prescription": "Requiere prescripción",
  "Report section": "Sección del reporte",
  "Concepts covered": "Conceptos cubiertos",
  "Reading level": "Nivel de lectura",
  "Issuing body": "Entidad emisora",
  Version: "Versión",
  "Release date": "Fecha de publicación",
  "Target professions": "Profesiones objetivo",
  "Guideline status": "Estado de la guía",
  "Trial identifier": "Identificador del ensayo",
  Phase: "Fase",
  "Recruitment status": "Estado de reclutamiento",
  Countries: "Países",
  Sponsor: "Patrocinador",
  "Registry name": "Nombre del registro",
  "Enrollment status": "Estado de inscripción",
  "Eligible population": "Población elegible",
  "Study identifier": "Identificador del estudio",
  "Study type": "Tipo de estudio",
  "Eligibility summary": "Resumen de elegibilidad",
  "Participation mode": "Modalidad de participación",
  "End date": "Fecha de finalización",
  "Screening type": "Tipo de detección",
  "Start date": "Fecha de inicio",
  Locations: "Ubicaciones",
  "Cost note": "Nota sobre costo",
  "Service type": "Tipo de servicio",
  Availability: "Disponibilidad",
  "Delivery mode": "Modalidad",
  Regions: "Regiones",
  Duration: "Duración",
  "Certificate available": "Certificado disponible",
  "File type": "Tipo de archivo",
  "Page count": "Cantidad de páginas",
  "File size": "Tamaño de archivo",
  "Resource languages": "Idiomas del recurso",
  Perspective: "Perspectiva",
  "Life stage": "Etapa de vida",
  Topics: "Temas",
  "Content warning": "Advertencia de contenido",
  "Expert name": "Nombre del experto",
  Credentials: "Credenciales",
  "Questions count": "Cantidad de preguntas",
  "Recorded at": "Fecha de grabación",
  "Campaign type": "Tipo de campaña",
  Organizer: "Organizador",
  "Target region": "Región objetivo",
  Deadline: "Fecha límite",
  "Campaign goal": "Objetivo de campaña",
  "One per line or comma-separated": "Una por línea o separadas por coma",
  "Not specified": "Sin especificar",
  Fellowship: "Beca de investigación",
  Grant: "Subsidio",
  Scholarship: "Beca",
  "Clinical study": "Estudio clínico",
  "Research program": "Programa de investigación",
  Training: "Capacitación",
  "Patient program": "Programa para pacientes",
  Resource: "Recurso",
  Job: "Trabajo",
  Volunteer: "Voluntariado",
  Dataset: "Conjunto de datos",
  Challenge: "Desafío",
  Online: "En línea",
  Remote: "Remoto",
  Hybrid: "Híbrido",
  "United States": "Estados Unidos",
  Canada: "Canadá",
  "United Kingdom": "Reino Unido",
  "European Union": "Unión Europea",
  "Latin America": "América Latina",
  "Save draft": "Guardar borrador",
  "Draft saved.": "Borrador guardado.",
  "Publish to Discover": "Publicar en Discover",
  "View publication in the app": "Ver publicación en la app",
  "Publishing...": "Publicando...",
  "Published to Discover": "Publicado en Discover",
  "Publish needs attention": "La publicación necesita revisión",
  "Publishing Discover entry": "Publicando entrada de Discover",
  "Publishing in progress": "Publicación en curso",
  "Saving the entry and preparing it for the mobile feed.":
    "Guardando la entrada y preparándola para el feed móvil.",
  "Nothing was published": "No se publicó nada",
  "The item is saved with status published and will appear wherever the app reads the published Discover feed.":
    "El ítem quedó guardado con estado publicado y aparecerá donde la app lea el feed publicado de Discover.",
  "The entry stayed unchanged. Fix the form requirement and publish again.":
    "La entrada no cambió. Corregí el requisito del formulario y publicá de nuevo.",
  "Validating the publisher, content fields, and compact payload.":
    "Validando el publicador, los campos de contenido y el payload compacto.",
  "This entry is now published in Discover.":
    "Esta entrada ya está publicada en Discover.",
  "Publishing stopped. Review the highlighted requirement and try again.":
    "La publicación se detuvo. Revisá el requisito marcado e intentá de nuevo.",
  "Open entry": "Abrir entrada",
  "Untitled feed entry": "Entrada del feed sin título",
  "No subtitle": "Sin subtítulo",
  "No cover image": "Sin imagen de portada",
  "Enter a valid cover image URL to preview.":
    "Ingresá una URL válida de imagen de portada para ver la vista previa.",
  "Source URL must be a valid HTTPS URL.":
    "La URL de origen debe ser una URL HTTPS válida.",
  "Main button link must be a valid HTTPS URL.":
    "El enlace del botón principal debe ser una URL HTTPS válida.",
  "Cover image URL must be a valid HTTPS URL.":
    "La URL de imagen de portada debe ser una URL HTTPS válida.",
  "Virtual meeting link must be a valid HTTPS URL.":
    "El link de reunión virtual debe ser una URL HTTPS válida.",
  "Links must use a valid HTTPS URL.":
    "Los links deben usar una URL HTTPS válida.",
  "Paste a HTTPS URL": "Pegá una URL HTTPS",
  "Only active organizations can publish feed entries.":
    "Solo organizaciones activas pueden publicar entradas del feed.",
  "Only active publishers can publish feed entries.":
    "Solo publicadores activos pueden publicar entradas del feed.",
  "Title is required before publishing.":
    "El título es obligatorio antes de publicar.",
  "Subtitle is required before publishing.":
    "El subtítulo es obligatorio antes de publicar.",
  "Body is required before publishing.":
    "El cuerpo es obligatorio antes de publicar.",
  "Event date is required before publishing.":
    "La fecha del evento es obligatoria antes de publicar.",
  "Event location is required before publishing.":
    "La ubicación del evento es obligatoria antes de publicar.",
  "Opportunity type is required before publishing.":
    "El tipo de oportunidad es obligatorio antes de publicar.",
  "Opportunity requirements are required before publishing.":
    "Los requisitos de la oportunidad son obligatorios antes de publicar.",
  "Opportunity eligibility is required before publishing.":
    "La elegibilidad de la oportunidad es obligatoria antes de publicar.",
  "Opportunity location is required before publishing.":
    "La ubicación de la oportunidad es obligatoria antes de publicar.",
  "feed_organizations publishers": "Publicadores de feed_organizations",
  "feed_individuals publishers": "Editores",
  "feed_items mobile Discover entries":
    "Entradas móviles de Discover en feed_items",
  "Publishers stored in feed_organizations for Discover feed entries.":
    "Publicadores guardados en feed_organizations para entradas de Discover.",
  "Publishers stored in feed_individuals for Discover feed entries.":
    "Editores disponibles para entradas de Discover.",
  "Create a Discover publisher for mobile feed entries.":
    "Crear un publicador de Discover para entradas móviles del feed.",
  "Discover publisher detail.": "Detalle del publicador de Discover.",
  "Mobile Discover feed entries stored in feed_items.":
    "Entradas móviles de Discover guardadas en feed_items.",
  "Create a Discover feed item with a publisher snapshot.":
    "Crear una entrada del feed Discover con snapshot del publicador.",
  "Discover feed item detail with type-specific payload validation.":
    "Detalle de entrada Discover con validación de payload por tipo.",
  "Create a canonical feed_organizations publisher for Discover feed entries.":
    "Crear un publicador feed_organizations canónico para entradas de Discover.",
  "Create a canonical feed_individuals publisher for Discover feed entries.":
    "Crear un editor para entradas de Discover.",
  "Create a Discover individual publisher for mobile feed entries.":
    "Crear un editor para entradas móviles de Discover.",
  "Create a feed_items document with one type-specific payload and an automatic publisher snapshot.":
    "Crear un documento feed_items con payload específico por tipo y snapshot automático del publicador.",
  "Manage feed_items documents that the mobile apps read for Discover.":
    "Gestionar documentos feed_items que las apps móviles leen para Discover.",
  "Manage feed_organizations publishers used by Discover feed entries.":
    "Gestionar publicadores feed_organizations usados por las entradas de Discover.",
  "Manage feed_individuals publishers used by Discover feed entries.":
    "Gestionar editores usados por las entradas de Discover.",
  "Edit one feed_items document while preserving the mobile app field contract.":
    "Editar un documento feed_items conservando el contrato de campos de la app móvil.",
  "Edit the canonical publisher record used by Discover feed entries.":
    "Editar el registro canónico del publicador usado por las entradas de Discover.",
  "Edit the canonical individual publisher record used by Discover feed entries.":
    "Editar el registro del editor usado por las entradas de Discover.",
  "Discover individual publisher detail.": "Detalle del editor de Discover.",
  "Individual-scoped Discover publishing access for one feed_individuals publisher and its feed entries.":
    "Acceso de publicación en Discover limitado a un editor y sus entradas del feed.",
  "Can access only Discover individual publishers and feed entries for one linked individual publisher.":
    "Puede acceder sólo a editores de Discover y entradas del feed de un editor vinculado.",
  "Can create, edit, duplicate, and delete feed entries only for that individual publisher.":
    "Puede crear, editar, duplicar y eliminar entradas del feed sólo para ese editor.",
  "Auth user": "Usuario Auth",
  "Private profile": "Perfil privado",
  "Public profile": "Perfil público",
  "Community user": "Usuario de comunidad",
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
  "Institution operators stay scoped to one institution, its doctors, its patients, and local role assignments.":
    "Los operarios de institución permanecen limitados a una institución, sus médicos, sus pacientes y sus roles locales.",
  "Institution laboratory staff stay scoped to one institution and its laboratory workflow.":
    "El personal de laboratorio de institución permanece limitado a una institución y su flujo de laboratorio.",
  "Institution doctors stay scoped to one institution, their own doctor record, and their own patients.":
    "Los médicos de institución permanecen limitados a una institución, su propio registro médico y sus propios pacientes.",
  Mission: "Misión",
  Accounts: "Cuentas",
  Community: "Comunidad",
  Reports: "Reportes",
  Learning: "Aprendizaje",
  Areas: "Áreas",
  Access: "Acceso",
  "Access surface": "Tipo de acceso",
  "Backoffice access": "Acceso al backoffice",
  "Patient portal": "Portal de pacientes",
  "Patient portal data": "Mis datos",
  "Patient has accessed the patient portal":
    "El paciente ingresó al portal de pacientes",
  "Patient has uploaded an informed consent":
    "El paciente cargó un consentimiento informado",
  Home: "Inicio",
  "Active access": "Acceso activo",
  "Inactive access": "Acceso inactivo",
  "Verified email": "Email verificado",
  "Unverified email": "Email no verificado",
  Username: "Nombre de usuario",
  "Last sign-in": "Último inicio de sesión",
  "Profile Details": "Datos del perfil",
  "Save Profile": "Guardar perfil",
  "Optional name shown on this role assignment.":
    "Nombre opcional mostrado en tu perfil.",
  "Optional phone number for operational contact.":
    "Número de teléfono opcional de contacto.",
  "Email & Verification": "Email y verificación",
  "Email verified": "Email verificado",
  "Email not verified": "Email no verificado",
  "Account email": "Email de la cuenta",
  "Changing email also moves your role assignment record.":
    "Al cambiar el email también se actualiza tu acceso al portal.",
  "Email Verified": "Email verificado",
  "Send Verification": "Enviar verificación",
  "Validate Email": "Validar email",
  "Change Email": "Cambiar email",
  "Changing...": "Cambiando...",
  "Bootstrap account emails are read only here.":
    "El email de esta cuenta es de solo lectura.",
  "Upload consent": "Subir consentimiento",
  "Consent file": "Archivo de consentimiento",
  "Select one PDF or image file.": "Seleccioná un archivo PDF o una imagen.",
  "Select a PDF or supported image file.":
    "Seleccioná un archivo PDF o una imagen compatible.",
  "Unable to read the selected file.":
    "No se pudo leer el archivo seleccionado.",
  "Consent uploaded.": "Consentimiento subido.",
  "Unable to upload consent.": "No se pudo subir el consentimiento.",
  "Unable to load more consents.": "No se pudieron cargar más consentimientos.",
  "No consent files have been uploaded.":
    "No se subieron archivos de consentimiento.",
  "Open file": "Abrir archivo",
  "This account email is managed outside My account.":
    "El email de esta cuenta se administra fuera de Mis datos.",
  "Enter the email address before changing it.":
    "Ingresá el email antes de modificarlo.",
  "Use a valid email address.": "Ingresá un email válido.",
  "Email format is valid. You can change the account email.":
    "El formato del email es válido. Podés cambiar el email de la cuenta.",
  "Email format is valid and matches the current account email.":
    "El formato es válido y coincide con el email actual.",
  "This role assignment is not editable from My account.":
    "Este perfil no se puede editar desde Mis datos.",
  "Fix the highlighted fields before saving.":
    "Corregí los campos marcados antes de guardar.",
  "Profile details saved.": "Datos del perfil guardados.",
  "Unable to save your profile details.":
    "No se pudieron guardar los datos del perfil.",
  "Validate the email field before changing it.":
    "Validá el campo de email antes de modificarlo.",
  "This is already the current account email.":
    "Este ya es el email actual de la cuenta.",
  "Email change saved.": "Cambio de email guardado.",
  "Email changed. Sign out and sign back in with the new email to refresh this session.":
    "El email cambió. Cerrá sesión y volvé a ingresar con el nuevo email.",
  "The requested email is already active on this account.":
    "El email solicitado ya está activo en esta cuenta.",
  "Unable to change your email.": "No se pudo cambiar tu email.",
  "No Firebase browser session is available. Sign out and sign in again.":
    "No hay una sesión activa. Cerrá sesión y volvé a ingresar.",
  "The browser Firebase session email does not match this account. Sign out and sign in again before sending verification.":
    "El email de la sesión no coincide con esta cuenta. Cerrá sesión y volvé a ingresar antes de enviar la verificación.",
  "Unable to send the verification email.":
    "No se pudo enviar el email de verificación.",
  Saved: "Guardado",
  "Action failed": "La acción falló",
  Dismiss: "Cerrar",
  "View log": "Ver registro",
  "No role assignment record is linked to this session.":
    "No hay un perfil asociado a esta sesión.",
  "Use 100 characters or fewer.": "Usá 100 caracteres o menos.",
  "Use 30 characters or fewer.": "Usá 30 caracteres o menos.",
  "Use digits, spaces, +, parentheses, hyphens, or dots.":
    "Usá números, espacios, +, paréntesis, guiones o puntos.",
  "Portal access": "Acceso al portal",
  "No portal access": "Sin acceso al portal",
  "Temporary password": "Contraseña temporal",
  Reveal: "Revelar",
  Hide: "Ocultar",
  Copy: "Copiar",
  "Temporary password copied.": "Contraseña temporal copiada.",
  "Unable to copy the temporary password.":
    "No se pudo copiar la contraseña temporal.",
  "Send consent email": "Enviar mail de consentimiento",
  "Consent email sent.": "Mail de consentimiento enviado.",
  "Unable to send consent email.":
    "No se pudo enviar el mail de consentimiento.",
  "Create patient portal credentials":
    "Crear credenciales del portal de pacientes",
  "Unable to reveal the temporary password.":
    "No se pudo revelar la contraseña temporal.",
  "See all bookings": "Ver todas las reuniones",
  Plantillas: "Plantillas",
  Plantilla: "Plantilla",
  "Alta de plantilla": "Alta de plantilla",
  "CRUD system email templates for the CRM.":
    "CRUD de plantillas de email del sistema para el CRM.",
  "Create a CRM email template for the send modal.":
    "Crear una plantilla de email del CRM para el modal de envío.",
  "Edit a CRM email template used by the send modal.":
    "Editar una plantilla de email del CRM usada por el modal de envío.",
  "Search templates...": "Buscar plantillas...",
  "No templates found.": "No se encontraron plantillas.",
  "Failed to load templates.": "No se pudieron cargar las plantillas.",
  "Failed to load template.": "No se pudo cargar la plantilla.",
  "Recommended templates": "Plantillas recomendadas",
  "Other templates": "Otras plantillas",
  "Load more templates": "Cargar más plantillas",
  "Overwrite template": "Sobreescribir plantilla",
  "Mark as favorite": "Marcar como favorita",
  "Unmark as favorite": "Desmarcar como favorita",
  "Template overwritten.": "Plantilla sobreescrita.",
  "Unable to overwrite template.": "No se pudo sobreescribir la plantilla.",
  "Template marked as favorite.": "Plantilla marcada como favorita.",
  "Template removed from favorites.": "Plantilla desmarcada como favorita.",
  "Unable to mark template as favorite.":
    "No se pudo marcar la plantilla como favorita.",
  "Unable to unmark template as favorite.":
    "No se pudo desmarcar la plantilla como favorita.",
  "Template name": "Nombre de plantilla",
  "Template saved.": "Plantilla guardada.",
  "Unable to save template.": "No se pudo guardar la plantilla.",
  "Delete template": "Borrar plantilla",
  "Template deleted.": "Plantilla borrada.",
  "Unable to delete template.": "No se pudo eliminar la plantilla.",
  "This removes the template from the CRM send flow.":
    "Esto elimina la plantilla del flujo de envío del CRM.",
  "Template variables": "Variables de plantilla",
  "Applies to": "Aplica a",
  "Website sentence": "Frase del sitio web",
  "Template Active": "Activa",
  "Template Inactive": "Inactiva",
  "Template Archived": "Archivada",
  Favorite: "Favorito",
  "Not favorite": "No favorito",
  "Email sent": "Email enviado",
  "Reply received": "Respuesta recibida",
  "Import templates from CSV": "Importar plantillas desde CSV",
  "Review each template before creating it in plantillas.":
    "Revisá cada plantilla antes de crearla en plantillas.",
  "Sample template CSV": "CSV de ejemplo de plantilla",
  "Selected file": "Archivo seleccionado",
  "CSV parsed": "CSV parseado",
  "No CSV selected": "No hay CSV seleccionado",
  "Raw CSV contents are not rendered. The preview below is capped to protect the UI.":
    "El contenido crudo del CSV no se renderiza. La vista previa de abajo está limitada para proteger la UI.",
  "Showing first": "Mostrando primeras",
  "parsed rows": "filas parseadas",
  "Template import finished": "Importación de plantillas finalizada",
  "Templates were processed one by one and the plantillas list has been refreshed.":
    "Las plantillas se procesaron una por una y la lista de plantillas fue actualizada.",
  "Use sample": "Usar ejemplo",
  "No import rows found.": "No se encontraron filas para importar.",
  "Created templates": "Creadas",
  "Failed rows": "Fallidas",
  templates: "plantillas",
  "CSV needs name, subject, and body columns.":
    "El CSV necesita columnas name, subject y body.",
  "Template name is required.": "El nombre de la plantilla es obligatorio.",
  "Template subject is required.": "El asunto de la plantilla es obligatorio.",
  "Template body is required.": "El mensaje de la plantilla es obligatorio.",
  "Template name must be 180 characters or fewer.":
    "El nombre de la plantilla debe tener 180 caracteres o menos.",
  "Template subject must be 180 characters or fewer.":
    "El asunto de la plantilla debe tener 180 caracteres o menos.",
  "Template body must be 12000 characters or fewer.":
    "El mensaje de la plantilla debe tener 12000 caracteres o menos.",
  "Template notes must be 2000 characters or fewer.":
    "Las notas de la plantilla deben tener 2000 caracteres o menos.",
  "No active templates": "Sin plantillas activas",
  "Loading templates...": "Cargando plantillas...",
  "View preview": "Ver vista previa",
  "Rendered template preview.": "Vista previa renderizada de la plantilla.",
  "Preview sample": "Muestra de vista previa",
  "Volver a plantillas": "Volver a plantillas",
  "Pocket Genes partnership outreach CRM.":
    "CRM de alianzas y outreach de Pocket Genes.",
  "One organization, one primary contact, and the next action.":
    "Una organización, un contacto principal y la próxima acción.",
  "Add CRM organization": "Agregar organización al CRM",
  "Edit CRM organization": "Editar organización del CRM",
  "CRM organization saved.": "Organización del CRM guardada.",
  "Unable to save CRM organization.":
    "No se pudo guardar la organización del CRM.",
  "CRM organization deleted.": "Organización del CRM eliminada.",
  "Unable to delete CRM organization.":
    "No se pudo eliminar la organización del CRM.",
  "CRM organizations deleted.": "organizaciones del CRM eliminadas.",
  "Unable to delete selected CRM organizations.":
    "No se pudieron eliminar las organizaciones seleccionadas del CRM.",
  "One professional, one direct email, and the next action.":
    "Un profesional, un mail directo y la próxima acción.",
  "Add CRM professional": "Agregar profesional al CRM",
  "Edit CRM professional": "Editar profesional del CRM",
  "CRM professional saved.": "Profesional del CRM guardado.",
  "Unable to save CRM professional.":
    "No se pudo guardar el profesional del CRM.",
  "CRM professional deleted.": "Profesional del CRM eliminado.",
  "Unable to delete CRM professional.":
    "No se pudo eliminar el profesional del CRM.",
  "CRM professionals deleted.": "profesionales del CRM eliminados.",
  "Unable to delete selected CRM professionals.":
    "No se pudieron eliminar los profesionales seleccionados del CRM.",
  "No CRM organizations found.": "No se encontraron organizaciones en el CRM.",
  "No CRM professionals found.": "No se encontraron profesionales en el CRM.",
  "Failed to load CRM organizations.":
    "No se pudieron cargar las organizaciones del CRM.",
  "Failed to load CRM professionals.":
    "No se pudieron cargar los profesionales del CRM.",
  "Add Organization": "Agregar organización",
  "Add Professional": "Agregar profesional",
  "organization selected": "organización seleccionada",
  "organizations selected": "organizaciones seleccionadas",
  "professional selected": "profesional seleccionado",
  "professionals selected": "profesionales seleccionados",
  "Delete selected": "Eliminar seleccionados",
  "Select all visible CRM organizations":
    "Seleccionar todas las organizaciones visibles del CRM",
  "Select all visible CRM professionals":
    "Seleccionar todos los profesionales visibles del CRM",
  "Delete selected CRM organizations":
    "Eliminar organizaciones seleccionadas del CRM",
  "Delete selected CRM professionals":
    "Eliminar profesionales seleccionados del CRM",
  "This removes every selected organization from the partnership CRM.":
    "Esto elimina todas las organizaciones seleccionadas del CRM de alianzas.",
  "This removes every selected professional from the partnership CRM.":
    "Esto elimina todos los profesionales seleccionados del CRM de alianzas.",
  Professionals: "Profesionales",
  "CRM target": "Objetivo del CRM",
  "Import CSV": "Importar CSV",
  "Import rules": "Reglas de importación",
  "Rules for CRM organization CSV imports.":
    "Reglas para importar organizaciones del CRM desde CSV.",
  "Rules for CRM professional CSV imports.":
    "Reglas para importar profesionales del CRM desde CSV.",
  "Rules for CRM template CSV imports.":
    "Reglas para importar plantillas del CRM desde CSV.",
  "Optional. Use true/false, 1/0, yes/no, or favorito. True rows are shown with a yellow star and sorted first in CRM lists.":
    "Opcional. Usá true/false, 1/0, yes/no o favorito. Las filas true se muestran con una estrella amarilla y ordenan primero en las listas del CRM.",
  "Optional. Use true/false, 1/0, yes/no, or favorito. True templates are shown with a yellow star and sorted first in plantillas lists.":
    "Opcional. Usá true/false, 1/0, yes/no o favorito. Las plantillas true se muestran con una estrella amarilla y ordenan primero en las listas de plantillas.",
  "CSV structure": "Estructura del CSV",
  "Header row": "Fila de encabezados",
  "Example CSV": "CSV de ejemplo",
  Example: "Ejemplo",
  "First row must contain supported column headers.":
    "La primera fila debe contener encabezados soportados.",
  "Use comma-separated CSV and quote cells that contain commas, quotes, or line breaks.":
    "Usá CSV separado por comas y entrecomillá celdas con comas, comillas o saltos de línea.",
  "Escape quotes by doubling them.": "Escapá las comillas duplicándolas.",
  "Empty rows are ignored.": "Las filas vacías se ignoran.",
  "Required columns": "Columnas obligatorias",
  "Optional columns": "Columnas opcionales",
  "Field rules": "Reglas por campo",
  "Accepted statuses": "Estados aceptados",
  "Accepted categories": "Categorías aceptadas",
  "Accepted countries": "Países aceptados",
  "Use variables in subject or body as {{variable_name}}.":
    "Usá variables en el asunto o cuerpo como {{variable_name}}.",
  "Unknown variables render blank.":
    "Las variables desconocidas se renderizan en blanco.",
  "Common import mistakes to avoid": "Errores comunes de importación a evitar",
  "Use canonical org_* keys when possible.":
    "Usá claves canónicas org_* siempre que sea posible.",
  "Use canonical pro_* keys when possible.":
    "Usá claves canónicas pro_* siempre que sea posible.",
  "Use one normalized country code from the CRM country whitelist. GLOBAL is not accepted.":
    "Usá un código de país normalizado de la lista permitida del CRM. GLOBAL no está aceptado.",
  "Import behavior": "Comportamiento de importación",
  "Always review preview results before final import.":
    "Revisá siempre la vista previa antes de la importación final.",
  "Load a CSV first, then choose Start interactive download to review Add / Skip row by row, or Import all to accept every valid row.":
    "Cargá un CSV y elegí Start interactive download para revisar Agregar / Omitir fila por fila, o Importar todo para aceptar cada fila válida.",
  "CRM target imports preview and commit one row at a time with a browser checkpoint.":
    "Los objetivos del CRM se previsualizan y confirman una fila por vez con checkpoint en el navegador.",
  "If the import fails in the middle, completed rows are kept and the checkpoint can resume from the last saved point.":
    "Si la importación falla en el medio, las filas completadas se conservan y el checkpoint permite continuar desde el último punto guardado.",
  "Duplicates are surfaced on the row card. Add imports anyway; Skip leaves the existing CRM untouched.":
    "Los duplicados aparecen en la tarjeta de la fila. Agregar importa igual; Omitir deja el CRM existente sin cambios.",
  "Preview the parsed template rows before creating templates.":
    "Revisá las filas parseadas antes de crear plantillas.",
  "Template imports create valid rows one by one; invalid rows are skipped and completed rows are not reverted.":
    "La importación de plantillas crea filas válidas una por una; las filas inválidas se omiten y las completadas no se revierten.",
  "Literal \\n is converted to a line break in template body and notes.":
    "El texto literal \\n se convierte en salto de línea en el cuerpo y las notas de la plantilla.",
  "Use active templates for the CRM send flow; archived templates are kept out of normal sending.":
    "Usá plantillas activas para el flujo de envío del CRM; las archivadas quedan fuera del envío normal.",
  "Use the exact header row shown here when generating CSVs. Unsupported headers are ignored.":
    "Usá exactamente la fila de encabezados que se muestra acá al generar CSVs. Los encabezados no soportados se ignoran.",
  "If a cell contains commas, quotes, or line breaks, wrap the whole cell in double quotes.":
    "Si una celda contiene comas, comillas o saltos de línea, encerrá toda la celda entre comillas dobles.",
  'Escape a quote inside a cell by doubling it, for example He said ""hello"".':
    'Escapá una comilla dentro de una celda duplicándola, por ejemplo He said ""hello"".',
  "Template category accepts one value only. Multiple categories are not saved as a list.":
    "La categoría de plantilla acepta un solo valor. Múltiples categorías no se guardan como lista.",
  "Template body and notes can use literal \\n for line breaks. The importer converts literal \\n to real line breaks.":
    "El cuerpo y las notas de la plantilla pueden usar \\n literal para saltos de línea. El importador convierte \\n literal en saltos reales.",
  "Unknown template variables render blank, so use only variables listed in this modal.":
    "Las variables de plantilla desconocidas se renderizan en blanco, así que usá solo las variables listadas en este modal.",
  "Cells with multiple category or country keys must be quoted, otherwise the commas will shift later columns.":
    "Las celdas con múltiples claves de categoría o país deben estar entre comillas; si no, las comas desplazan las columnas siguientes.",
  "Use an explicit timezone for last_contact_at. Date-only values and datetimes without timezone are rejected.":
    "Usá una zona horaria explícita para last_contact_at. Los valores solo-fecha y las fechas-hora sin zona horaria se rechazan.",
  "GLOBAL, unknown countries, and unknown categories are ignored instead of being saved as custom free text.":
    "GLOBAL, países desconocidos y categorías desconocidas se ignoran en vez de guardarse como texto libre personalizado.",
  "Required. Trimmed before save. Maximum 180 characters. Blank names are invalid rows and must be fixed before import.":
    "Obligatorio. Se recorta antes de guardar. Máximo 180 caracteres. Los nombres vacíos son filas inválidas y deben corregirse antes de importar.",
  "Required. Trimmed before save. Maximum 180 characters. Blank professional names are invalid rows and must be fixed before import.":
    "Obligatorio. Se recorta antes de guardar. Máximo 180 caracteres. Los nombres de profesionales vacíos son filas inválidas y deben corregirse antes de importar.",
  "Optional. Use one or more canonical org_* category keys, or exact Discover organization labels. Multiple values must be comma-separated inside one quoted CSV cell. Unknown values are ignored; if every value is unknown, category is saved blank.":
    "Opcional. Usá una o más claves canónicas org_* o etiquetas exactas de organizaciones Discover. Múltiples valores deben ir separados por comas dentro de una única celda CSV entre comillas. Los valores desconocidos se ignoran; si todos son desconocidos, la categoría se guarda vacía.",
  "Optional. Use one or more canonical pro_* category keys, or exact professional category labels. Multiple values must be comma-separated inside one quoted CSV cell. Unknown values are ignored; if every value is unknown, category is saved blank.":
    "Opcional. Usá una o más claves canónicas pro_* o etiquetas exactas de categorías profesionales. Múltiples valores deben ir separados por comas dentro de una única celda CSV entre comillas. Los valores desconocidos se ignoran; si todos son desconocidos, la categoría se guarda vacía.",
  "Optional. Maximum 500 characters. Use a public organization website URL. Values without protocol are accepted and normalized with https:// when possible.":
    "Opcional. Máximo 500 caracteres. Usá una URL pública del sitio de la organización. Los valores sin protocolo se aceptan y se normalizan con https:// cuando es posible.",
  "Optional. Maximum 500 characters. Use a public website URL. Values without protocol are accepted and normalized with https:// when possible.":
    "Opcional. Máximo 500 caracteres. Usá una URL pública. Los valores sin protocolo se aceptan y se normalizan con https:// cuando es posible.",
  "Optional. Use one or more two-letter country codes from the CRM whitelist. Multiple values must be comma-separated inside one quoted CSV cell. GLOBAL and unknown countries are ignored; if every value is invalid, country is saved blank.":
    "Opcional. Usá uno o más códigos de país de dos letras de la lista permitida del CRM. Múltiples valores deben ir separados por comas dentro de una única celda CSV entre comillas. GLOBAL y países desconocidos se ignoran; si todos los valores son inválidos, el país se guarda vacío.",
  "Optional. Use one accepted CRM status key. Blank or unrecognized values default to new. Spanish aliases are normalized by the CSV parser before sending.":
    "Opcional. Usá una clave de estado CRM aceptada. Los valores vacíos o no reconocidos quedan como new. Los alias en español se normalizan en el parser CSV antes de enviarse.",
  "Optional. Maximum 140 characters. Store only the primary contact person's name, not the email or notes.":
    "Opcional. Máximo 140 caracteres. Guardá solo el nombre de la persona de contacto principal, no el email ni notas.",
  "Optional direct email. Maximum 180 characters. Lowercased before save. Missing email does not block import, but the row cannot send CRM email until an email is added.":
    "Email directo opcional. Máximo 180 caracteres. Se pasa a minúsculas antes de guardar. La falta de email no bloquea la importación, pero la fila no puede enviar email de CRM hasta que se agregue uno.",
  "Optional. Maximum 500 characters. Use the public LinkedIn URL for the primary contact or organization. Values without protocol are accepted and normalized with https:// when possible.":
    "Opcional. Máximo 500 caracteres. Usá la URL pública de LinkedIn del contacto principal o la organización. Los valores sin protocolo se aceptan y se normalizan con https:// cuando es posible.",
  "Optional. Maximum 500 characters. Use the public LinkedIn profile URL for this professional. Values without protocol are accepted and normalized with https:// when possible.":
    "Opcional. Máximo 500 caracteres. Usá la URL pública del perfil de LinkedIn de este profesional. Los valores sin protocolo se aceptan y se normalizan con https:// cuando es posible.",
  "Optional. Use a complete ISO datetime with an explicit timezone. Accepted: 2026-08-25T17:29:00.000Z or 2026-08-25T14:29:00-03:00. Rejected: 2026-08-25 and 2026-08-25T14:29:00 because they do not include timezone.":
    "Opcional. Usá una fecha-hora ISO completa con zona horaria explícita. Aceptado: 2026-08-25T17:29:00.000Z o 2026-08-25T14:29:00-03:00. Rechazado: 2026-08-25 y 2026-08-25T14:29:00 porque no incluyen zona horaria.",
  "Optional plain operational notes. Maximum 2000 characters. Do not paste long scraped pages or JSON blobs.":
    "Notas operativas opcionales. Máximo 2000 caracteres. No pegues páginas scrapeadas largas ni blobs JSON.",
  "Optional. Maximum 180 characters. Store only the professional role, title, specialty, or credential.":
    "Opcional. Máximo 180 caracteres. Guardá solo el rol, cargo, especialidad o credencial profesional.",
  "Optional. Maximum 180 characters. Store the main institution, company, lab, hospital, or professional affiliation as a plain name.":
    "Opcional. Máximo 180 caracteres. Guardá la institución, empresa, laboratorio, hospital o afiliación profesional principal como nombre plano.",
  "Optional. Maximum 2000 characters. Store why this professional could fit Pocket Genes editor work, such as clinical genetics, genetic testing, result interpretation, or patient education.":
    "Opcional. Máximo 2000 caracteres. Guardá por qué este profesional podría encajar como editor de Pocket Genes, por ejemplo genética clínica, pruebas genéticas, interpretación de resultados o educación de pacientes.",
  "Optional. Maximum 2000 characters. Store how the recipient email was found and what context should be verified before outreach. This is not the direct email field.":
    "Opcional. Máximo 2000 caracteres. Guardá cómo se encontró el email destinatario y qué contexto debe verificarse antes del outreach. Este no es el campo de email directo.",
  "Optional. Maximum 2000 characters. Store the LinkedIn route, such as the professional profile or official affiliated organization page. This is not the direct LinkedIn URL field.":
    "Opcional. Máximo 2000 caracteres. Guardá la ruta de LinkedIn, como el perfil profesional o la página oficial de la organización afiliada. Este no es el campo de URL directa de LinkedIn.",
  "Optional. Maximum 2000 characters. Store the source basis used to validate the lead, such as datasets, affiliation websites, LinkedIn records, or other verified references.":
    "Opcional. Máximo 2000 caracteres. Guardá la base de fuentes usada para validar el lead, como datasets, sitios de afiliación, registros de LinkedIn u otras referencias verificadas.",
  "Required. Trimmed before save. Maximum 180 characters. This is the internal template name shown in the template list.":
    "Obligatorio. Se recorta antes de guardar. Máximo 180 caracteres. Es el nombre interno que se muestra en la lista de plantillas.",
  "Required. Trimmed before save. Maximum 180 characters. Template variables such as {{organization_name}} or {{first_name}} are allowed. Unknown variables render blank.":
    "Obligatorio. Se recorta antes de guardar. Máximo 180 caracteres. Se permiten variables como {{organization_name}} o {{first_name}}. Las variables desconocidas se renderizan en blanco.",
  "Required. Maximum 12000 characters. Use quoted multiline cells or literal \\n for line breaks. Template variables are allowed and unknown variables render blank.":
    "Obligatorio. Máximo 12000 caracteres. Usá celdas multilinea entre comillas o \\n literal para saltos de línea. Se permiten variables y las variables desconocidas se renderizan en blanco.",
  "Optional. Use organizations or professionals. Aliases professional, individual, individuals, personas, and profesionales normalize to professionals. Blank uses the selected import audience.":
    "Opcional. Usá organizations o professionals. Los alias professional, individual, individuals, personas y profesionales se normalizan a professionals. Si queda vacío, se usa la audiencia seleccionada en la importación.",
  "Optional single value. Use one canonical category key for the selected audience, or an exact category label. Multiple categories are not supported for templates; if several are provided, only the first recognized category is saved. Unknown values become blank.":
    "Valor único opcional. Usá una clave canónica de categoría para la audiencia seleccionada o una etiqueta exacta. Las plantillas no soportan múltiples categorías; si se envían varias, solo se guarda la primera reconocida. Los valores desconocidos quedan en blanco.",
  "Optional. Use one accepted template status key. Blank or unrecognized values default to active. Active, inactive, and archived aliases are normalized.":
    "Opcional. Usá una clave de estado de plantilla aceptada. Los valores vacíos o no reconocidos quedan como active. Se normalizan alias de active, inactive y archived.",
  "Optional internal notes. Maximum 2000 characters. Literal \\n is converted to a line break.":
    "Notas internas opcionales. Máximo 2000 caracteres. El texto literal \\n se convierte en salto de línea.",
  "Required, trimmed, maximum 180 characters. Blank names are invalid rows.":
    "Obligatorio, recortado, máximo 180 caracteres. Los nombres vacíos son filas inválidas.",
  "Required, trimmed, maximum 180 characters. Blank professional names are invalid rows.":
    "Obligatorio, recortado, máximo 180 caracteres. Los nombres de profesionales vacíos son filas inválidas.",
  "Optional single value. Use one canonical org_* category key, or an exact Discover organization label. Unknown values become blank.":
    "Valor único opcional. Usá una clave canónica org_* o una etiqueta exacta de organización Discover. Los valores desconocidos quedan en blanco.",
  "Optional single value. Use one canonical pro_* category key, or an exact professional category label. Unknown values become blank.":
    "Valor único opcional. Usá una clave canónica pro_* o una etiqueta exacta de categoría profesional. Los valores desconocidos quedan en blanco.",
  "Optional single value. Use one canonical category key for the selected audience, or an exact category label. Unknown values become blank.":
    "Valor único opcional. Usá una clave canónica de categoría para la audiencia seleccionada o una etiqueta exacta. Los valores desconocidos quedan en blanco.",
  "Optional single value. Use one country from the CRM whitelist. GLOBAL is not accepted here.":
    "Valor único opcional. Usá un país de la lista permitida del CRM. GLOBAL no está aceptado acá.",
  "Optional. Defaults to new when blank. Spanish aliases are normalized by the CSV parser.":
    "Opcional. Si queda vacío, usa new. El parser CSV normaliza alias en español.",
  "Optional. Store only the primary contact person's name, not the email or notes.":
    "Opcional. Guardá solo el nombre de la persona de contacto principal, no el email ni notas.",
  "Optional. Store only the professional role, title, specialty, or credential.":
    "Opcional. Guardá solo el rol, cargo, especialidad o credencial profesional.",
  "Optional. Store the main institution, company, lab, hospital, or professional affiliation as a plain name.":
    "Opcional. Guardá la institución, empresa, laboratorio, hospital o afiliación profesional principal como nombre plano.",
  "Optional. Store the institution, company, lab, hospital, or professional affiliation as a plain name.":
    "Opcional. Guardá la institución, empresa, laboratorio, hospital o afiliación profesional como nombre plano.",
  "Optional. Store why this professional could fit Pocket Genes editor work, such as clinical genetics, genetic testing, result interpretation, or patient education.":
    "Opcional. Guardá por qué este profesional podría encajar como editor de Pocket Genes, por ejemplo genética clínica, pruebas genéticas, interpretación de resultados o educación de pacientes.",
  "Optional. Store how the recipient email was found and what context should be verified before outreach.":
    "Opcional. Guardá cómo se encontró el email destinatario y qué contexto debe verificarse antes del outreach.",
  "Optional. Store the LinkedIn route, such as the professional profile or official affiliated organization page.":
    "Opcional. Guardá la ruta de LinkedIn, como el perfil profesional o la página oficial de la organización afiliada.",
  "Optional. Store the source basis used to validate the lead, such as datasets, affiliation websites, LinkedIn records, or other verified references.":
    "Opcional. Guardá la base de fuentes usada para validar el lead, como datasets, sitios de afiliación, registros de LinkedIn u otras referencias verificadas.",
  "Optional. Missing email does not block import, but the row cannot send CRM email until an email is added.":
    "Opcional. La falta de email no bloquea la importación, pero la fila no puede enviar email de CRM hasta que se agregue uno.",
  "Optional public LinkedIn profile URL. This is used for duplicate detection and quick review.":
    "URL opcional del perfil público de LinkedIn. Se usa para detectar duplicados y revisar rápido.",
  "Optional. Use a full ISO datetime with timezone, or leave blank when there was no previous contact.":
    "Opcional. Usá una fecha ISO completa con zona horaria o dejalo vacío si no hubo contacto previo.",
  "Optional. Use a complete ISO datetime with an explicit timezone, for example 2026-08-25T17:29:00.000Z or 2026-08-25T14:29:00-03:00. Do not use a date-only value or a datetime without timezone.":
    "Opcional. Usá una fecha ISO completa con zona horaria explícita, por ejemplo 2026-08-25T17:29:00.000Z o 2026-08-25T14:29:00-03:00. No uses solo fecha ni fecha-hora sin zona horaria.",
  "Optional plain operational notes, maximum 2000 characters. Do not paste long scraped pages or JSON blobs.":
    "Notas operativas opcionales, máximo 2000 caracteres. No pegues páginas scrapeadas largas ni blobs JSON.",
  "Required, trimmed, maximum 180 characters. This is the internal template name.":
    "Obligatorio, recortado, máximo 180 caracteres. Es el nombre interno de la plantilla.",
  "Required, trimmed, maximum 180 characters. Variables such as {{organization_name}} are allowed.":
    "Obligatorio, recortado, máximo 180 caracteres. Se permiten variables como {{organization_name}}.",
  "Optional. Use organizations or professionals. When blank, the selected import audience is used.":
    "Opcional. Usá organizations o professionals. Si queda vacío, se usa la audiencia seleccionada en la importación.",
  "Required, maximum 12000 characters. Use quoted multiline cells or literal \\n for line breaks.":
    "Obligatorio, máximo 12000 caracteres. Usá celdas multilinea entre comillas o \\n literal para saltos de línea.",
  "Optional. Defaults to active when blank. Active, inactive, and archived aliases are normalized.":
    "Opcional. Si queda vacío, usa active. Se normalizan alias de active, inactive y archived.",
  "Optional internal notes, maximum 2000 characters. Literal \\n is converted to a line break.":
    "Notas internas opcionales, máximo 2000 caracteres. El texto literal \\n se convierte en salto de línea.",
  "Search organizations...": "Buscar organizaciones...",
  "Search professionals...": "Buscar profesionales...",
  "All emails": "Todos los emails",
  "Has Email": "Con email",
  "Missing Email": "Sin email",
  "Primary contact": "Contacto principal",
  Professional: "Profesional",
  "Professional name": "Nombre del profesional",
  "Role / specialty": "Rol / especialidad",
  "Primary affiliation": "Afiliación principal",
  "Potential Pocket Genes editor fit":
    "Fit potencial como editor de Pocket Genes",
  "Email route": "Ruta de email",
  "LinkedIn route": "Ruta de LinkedIn",
  "Research basis": "Base de investigación",
  Affiliation: "Afiliación",
  "Direct mail": "Mail directo",
  "Last Contact": "Último contacto",
  Mail: "Mail",
  Website: "Sitio web",
  LinkedIn: "LinkedIn",
  "No owner recorded": "Sin responsable registrado",
  "Open profile": "Abrir perfil",
  "No notes yet.": "Sin notas todavía.",
  "No category": "Sin categoría",
  Pipeline: "Pipeline",
  "Send Email": "Enviar email",
  "Send CRM email": "Enviar email del CRM",
  Recipient: "Destinatario",
  Template: "Plantilla",
  Subject: "Asunto",
  Message: "Mensaje",
  "Individual outreach only. Review the preview before sending.":
    "Outreach individual solamente. Revisá la vista previa antes de enviar.",
  "Sending updates last contact and records email activity.":
    "El envío actualiza el último contacto y registra la actividad de email.",
  "Preview email": "Vista previa del email",
  "Previous template": "Plantilla anterior",
  "Next template": "Plantilla siguiente",
  "Ready to send": "Listo para enviar",
  "No subject": "Sin asunto",
  "No message yet.": "Sin mensaje todavía.",
  "CRM email sent.": "Email del CRM enviado.",
  "Unable to send CRM email.": "No se pudo enviar el email del CRM.",
  "All emails sent": "Todos los emails enviados",
  "Every email recorded from the CRM send flow.":
    "Todos los emails registrados desde el flujo de envío del CRM.",
  "Failed to load sent emails.": "No se pudieron cargar los emails enviados.",
  "No CRM emails sent yet.": "Todavía no hay emails enviados desde el CRM.",
  Target: "Objetivo",
  "Sent by": "Enviado por",
  "Activity log": "Registro de actividad",
  "Hide details": "Ocultar detalles",
  "Latest organization activity.": "Última actividad de la organización.",
  "Expand to load the selected organization activity.":
    "Expandí para cargar la actividad de la organización seleccionada.",
  "Expand to load the selected professional activity.":
    "Expandí para cargar la actividad del profesional seleccionado.",
  "Not loaded": "Sin cargar",
  loaded: "cargados",
  "No organization selected": "Sin organización seleccionada",
  "No professional selected": "Sin profesional seleccionado",
  "Add an activity note...": "Agregar nota de actividad...",
  "Unable to add activity.": "No se pudo agregar la actividad.",
  "Failed to load activity log.": "No se pudo cargar el registro de actividad.",
  "No activity yet.": "Sin actividad todavía.",
  "Select an organization to see CRM details.":
    "Seleccioná una organización para ver el detalle del CRM.",
  "Select a professional to see CRM details.":
    "Seleccioná un profesional para ver el detalle del CRM.",
  Activity: "Actividad",
  created: "creados",
  updated: "actualizados",
  skipped: "omitidos",
  invalid: "inválidos",
  status: "estado",
  note: "nota",
  email: "email",
  import: "importación",
  "Import CRM CSV": "Importar CSV del CRM",
  "Missing contact details do not block import.":
    "Los datos de contacto faltantes no bloquean la importación.",
  "CSV file": "Archivo CSV",
  "CSV file is empty.": "El CSV está vacío.",
  "CSV needs a name column.": "El CSV necesita una columna name.",
  "CSV needs a professional name column.":
    "El CSV necesita una columna de nombre del profesional.",
  "Professional name is required.": "El nombre del profesional es obligatorio.",
  "CSV import progress": "Progreso de importación CSV",
  "Last saved": "Último guardado",
  "Previewing CSV": "Generando vista previa del CSV",
  "CSV loaded": "CSV cargado",
  "Waiting for next row": "Esperando siguiente fila",
  "Ready to import": "Listo para importar",
  "Importing CSV": "Importando CSV",
  "Import completed": "Importación completada",
  "Preview paused": "Vista previa pausada",
  "Import paused": "Importación pausada",
  "Preview checkpoint": "Checkpoint de vista previa",
  "Import checkpoint": "Checkpoint de importación",
  "Rows previewed": "Filas con vista previa",
  "Rows committed": "Filas confirmadas",
  "rows previewed": "filas con vista previa",
  "rows committed": "filas confirmadas",
  "Batch size": "Tamaño de lote",
  "Created / updated": "Creadas / actualizadas",
  "Last error": "Último error",
  "Import failed": "La importación falló",
  "Show log": "Ver log",
  "Hide log": "Ocultar log",
  "Copy log": "Copiar log",
  "Import error log": "Log de error de importación",
  File: "Archivo",
  professionals: "profesionales",
  "Failure point": "Punto de falla",
  Stage: "Etapa",
  Mode: "Modo",
  setup: "preparación",
  interactive: "interactiva",
  all: "todas",
  preview: "vista previa",
  Endpoint: "Endpoint",
  "HTTP status": "Estado HTTP",
  "Rows already committed": "Filas ya confirmadas",
  "Error message": "Mensaje de error",
  "Occurred at": "Ocurrió el",
  "What to fix": "Qué corregir",
  "Parsed CSV row": "Fila CSV parseada",
  "Preview row": "Fila de vista previa",
  "Request payload": "Payload enviado",
  "Backend response": "Respuesta del backend",
  "Backend response details": "Detalle de respuesta del backend",
  "CSV parse errors": "Errores de parseo del CSV",
  "Import results so far": "Resultados de importación hasta ahora",
  "Unknown row": "Fila desconocida",
  "Unknown import error.": "Error de importación desconocido.",
  "failed while": "falló durante",
  "previewing the row": "la vista previa de la fila",
  "committing the row": "la confirmación de la fila",
  "Rows before this checkpoint were kept. Fix the CSV row shown in the log and resume from the saved checkpoint.":
    "Las filas anteriores a este checkpoint se conservaron. Corregí la fila del CSV que figura en el log y retomá desde el checkpoint guardado.",
  "Continue ongoing import": "Continuar importación en proceso",
  "Discard checkpoint": "Descartar checkpoint",
  "Unable to save import checkpoint.":
    "No se pudo guardar el checkpoint de importación.",
  "Import checkpoint discarded.": "Checkpoint de importación descartado.",
  "CRM import preview ready.": "Vista previa de importación del CRM lista.",
  "CRM CSV loaded.": "CSV del CRM cargado.",
  "CRM import paused.":
    "La importación del CRM quedó pausada. Podés continuar desde el último checkpoint confirmado.",
  "Choose import mode": "Elegí modo de importación",
  "Review each CSV row as a card and decide whether to add or skip it.":
    "Revisá cada fila del CSV como una tarjeta y decidí si agregarla u omitirla.",
  "Import all": "Importar todo",
  "Import all previews and commits one row at a time while accepting every valid row.":
    "Importar todo genera vista previa y confirma una fila por vez aceptando cada fila válida.",
  "Automatic import": "Importación automática",
  "Automatic import paused.": "Importación automática pausada.",
  "Import remaining in sequence": "Importar restantes en secuencia",
  "Importing one row at a time": "Importando una fila por vez",
  "Every accepted row is saved before the next row starts.":
    "Cada fila aceptada se guarda antes de iniciar la siguiente.",
  "Current row": "Fila actual",
  of: "de",
  "Row processed": "Fila procesada",
  "Row imported": "Fila importada",
  "Row updated": "Fila actualizada",
  "Row skipped": "Fila omitida",
  "Row invalid": "Fila inválida",
  "Skip row": "Omitir fila",
  "Skipped during interactive review.":
    "Omitida durante la revisión interactiva.",
  "This row is invalid and cannot be added.":
    "Esta fila es inválida y no se puede agregar.",
  Pause: "Pausar",
  "Add imports this row anyway. Skip leaves the existing CRM untouched.":
    "Agregar importa esta fila igual. Omitir deja el CRM existente sin cambios.",
  "CRM import finished": "Importación del CRM finalizada",
  "The imported rows were committed one by one and the CRM list has been refreshed.":
    "Las filas importadas se confirmaron una por una y la lista del CRM fue actualizada.",
  "Import another CSV": "Importar otro CSV",
  "Previewing...": "Generando vista previa...",
  "Resume preview": "Continuar vista previa",
  "Resume import": "Continuar importación",
  rows: "filas",
  "will change": "cambian",
  Found: "Encontradas",
  Valid: "Válidas",
  "Missing email": "Sin email",
  "Possible duplicates": "Posibles duplicados",
  "Duplicate handling": "Gestión de duplicados",
  "Possible duplicate": "Posible duplicado",
  Skip: "Omitir",
  "Update existing": "Actualizar existente",
  "Import anyway": "Importar igual",
  Invalid: "Inválida",
  Import: "Importar",
  organizations: "organizaciones",
  "Importing...": "Importando...",
  "Import complete.": "Importación completa.",
  "Unable to preview CRM import.":
    "No se pudo generar la vista previa de importación.",
  "Unable to import CRM organizations.":
    "No se pudieron importar las organizaciones del CRM.",
  "Delete CRM organization": "Eliminar organización del CRM",
  "This removes the organization from the partnership CRM.":
    "Esto elimina la organización del CRM de alianzas.",
  "CRM New": "Nuevo",
  "CRM Contacted": "Contactado",
  "CRM Replied": "Respondió",
  "CRM Meeting": "Reunión",
  "CRM Partner": "Partner",
  "CRM No Response": "Sin respuesta",
  "CRM Not Interested": "Sin interés",
  "CRM Not a Fit": "No encaja",
  "Laboratory / Genomics": "Laboratorio / Genómica",
  Education: "Educación",
  "Umbrella Organization": "Organización paraguas",
  "Research Center": "Centro de investigación",
  "Client bookings": "Reuniones solicitadas",
  "Calendar and list review for consultation requests.":
    "Revisión en calendario y lista de solicitudes de reunión.",
  "All booking requests": "Todas las solicitudes de reunión",
  "New booking requests": "Solicitudes nuevas",
  "Archived booking requests": "Solicitudes archivadas",
  "Latest requests first.": "Solicitudes más recientes primero.",
  "Unacknowledged first, then latest.":
    "Sin acusar primero; después las más recientes.",
  "Unacknowledged requests only.": "Solo solicitudes sin acusar.",
  "Archived requests only.": "Solo solicitudes archivadas.",
  Calendar: "Calendario",
  List: "Lista",
  "New bookings": "Nuevos",
  "Previous month": "Mes anterior",
  "Next month": "Mes siguiente",
  Today: "Hoy",
  meetings: "reuniones",
  meeting: "reunión",
  "days with meetings": "días con reuniones",
  "Selected day": "Día seleccionado",
  "No meetings scheduled for this day.":
    "No hay reuniones agendadas para este día.",
  "No booking requests found.": "No se encontraron solicitudes de reunión.",
  "No new booking requests found.": "No se encontraron solicitudes nuevas.",
  "No archived booking requests found.":
    "No se encontraron solicitudes archivadas.",
  "Failed to load booking requests.":
    "No se pudieron cargar las solicitudes de reunión.",
  "Failed to update acknowledgment.": "No se pudo actualizar el acuse.",
  "Failed to update archive.": "No se pudo actualizar el archivo.",
  Ack: "Acuse",
  Acknowledged: "Acusada",
  "Not acknowledged": "Sin acusar",
  "Confirm ack": "Confirmar acuse",
  "Unnamed contact": "Contacto sin nombre",
  "No company provided": "Empresa no informada",
  "No email": "Sin email",
  "No WhatsApp": "Sin WhatsApp",
  Meeting: "Reunión",
  Company: "Empresa",
  Source: "Origen",
  visible: "visibles",
  Page: "Página",
  "Next page": "Siguiente página",
  "Access account": "Acceder",
  "Access requirement": "Requisito de acceso",
  Overview: "Resumen",
  "2PQ Dashboard": "Dashboard 2PQ",
  Contact: "Contacto",
  Forms: "Formularios",
  "+ New Institution": "Alta de institución",
  "+ New Doctor": "Alta de médico",
  "+ New Patient": "Alta de paciente",
  "+ New Administrative Operator": "Alta de operario",
  "+ New Laboratory Staff": "Alta de personal de labo",
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
  "Administrative operators": "Operarios administrativos",
  "Laboratory staff": "Personal de laboratorio",
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
  "Workflow map and role-aware CRUD shell for cases, samples, sequencing, reports, and clients.":
    "Mapa de flujo y consola CRUD sensible a roles para casos, muestras, secuenciación, reportes y clientes.",
  "Stored study request and sample form submissions.":
    "Formularios almacenados de solicitud de estudio, biopsias y retiro.",
  "Official 2PQ website, phone, and email contact channels.":
    "Canales oficiales de contacto de 2PQ: web, teléfono y email.",
  "Guided form flow stored in 2pq_forms.":
    "Flujo guiado de formulario almacenado en 2pq_forms.",
  "Study request": "Solicitud de estudio",
  "Withdrawal request": "Solicitud de retiro",
  Sample: "Formulario de biopsias",
  "Biopsy form": "Formulario de biopsias",
  "Withdrawal request form": "Formulario de solicitud de retiro",
  "Biopsy form preview": "Vista previa del formulario de biopsias",
  "Withdrawal request form preview":
    "Vista previa del formulario de solicitud de retiro",
  "Biopsy form information": "Información del formulario de biopsias",
  "Patient information": "Información del paciente",
  "Medical information": "Información médica",
  "Previous genetic tests": "Pruebas genéticas previas",
  "Requested test": "Test solicitado",
  Requested: "Solicitado",
  "Institution information": "Información de institución",
  "Preview and signature": "Vista previa y firma",
  "Pick linked study request form": "Elegir formulario de solicitud linkeado",
  "Pick linked 2PQ cases": "Elegir casos 2PQ vinculados",
  "Linked 2PQ cases": "Casos 2PQ vinculados",
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
  "Pending approval": "Pendiente de aprobación",
  Finished: "Finalizado",
  Inactive: "Inactivo",
  Intake: "Ingreso",
  Entered: "Ingresado",
  "Awaiting pick up": "Esperando retiro",
  "Samples received by 2PQ": "Muestras recibidas por 2PQ",
  "Processing sample in lab": "Procesando muestra en laboratorio",
  "Bioinformatics analysis": "Haciendo análisis bioinformático",
  "Report ready to download": "Informe listo para descargar",
  Blocked: "Bloqueado",
  Reporting: "Reporte",
  Delivered: "Entregado",
  Routine: "Rutina",
  Priority: "Prioridad",
  Urgent: "Urgente",
  "Awaiting reception": "Esperando recepción",
  Discarded: "Descartada",
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
  "Create the patient role, temporary password, and Firebase account for the new patient.":
    "Crear el rol de paciente, la contraseña temporal y la cuenta de Firebase para el nuevo paciente.",
  "Create the scoped patient from step 1 and link it to the stored form.":
    "Crear el paciente desde el paso 1 y vincularlo al formulario almacenado.",
  "Link selected institution": "Vincular institución seleccionada",
  "These fields are saved only on this withdrawal request and do not update the original institution record.":
    "Estos campos se guardan solo en esta solicitud de retiro y no actualizan el registro original de la institución.",
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
  "Link selected 2PQ cases": "Vincular casos 2PQ seleccionados",
  Use: "Usar",
  "selected cases for this withdrawal request.":
    "casos seleccionados para esta solicitud de retiro.",
  "Mark cases awaiting pick up": "Marcar casos esperando retiro",
  "Update every selected case from Intake to Awaiting pick up.":
    "Actualizar cada caso seleccionado de Ingreso a Esperando retiro.",
  "Update every selected case from Entered to Awaiting pick up.":
    "Actualizar cada caso seleccionado de Ingresado a Esperando retiro.",
  "Store withdrawal request form": "Guardar formulario de solicitud de retiro",
  "Persist the withdrawal request with its linked case snapshot.":
    "Persistir la solicitud de retiro con el snapshot de casos vinculados.",
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
  "after confirming it matches box code":
    "después de confirmar que coincide con código caja",
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
  "Select whether the form uses a pre-existing patient.":
    "Seleccioná si querés realizar este formulario con un paciente pre-existente.",
  "Select patient.": "Seleccioná un paciente.",
  "Doctor is required": "Médico requerido",
  "The patient must always belong to a doctor from the institution. The doctor signs the document and is responsible for the form, so this field cannot be empty.":
    "El paciente siempre debe pertenecer a un médico de la institución. El médico firma el documento y se hace responsable del formulario, por lo tanto este campo no puede estar vacío.",
  Understood: "Entendido",
  "Enter a valid patient email.": "Ingresá un email de paciente válido.",
  "Enter a valid patient reference email.":
    "Ingresá un mail de referencia del paciente válido.",
  "Patient full name is required.":
    "El nombre completo del paciente es requerido.",
  "Patient first name is required.": "El nombre del paciente es requerido.",
  "Patient last name is required.": "El apellido del paciente es requerido.",
  "Partner birth date must be a valid date.":
    "La fecha de nacimiento de la pareja debe ser una fecha válida.",
  "Sperm gamete source is not valid.": "El origen del esperma no es válido.",
  "Oocyte gamete source is not valid.":
    "El origen de los ovocitos no es válido.",
  "Select previous miscarriages.": "Seleccioná abortos previos.",
  "Previous miscarriages selection is not valid.":
    "La selección de abortos previos no es válida.",
  "Select male factor.": "Seleccioná factor masculino.",
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
  "Select PGT-A FAST reports sex.": "Seleccioná informa sexo para PGT-A FAST.",
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
  "Processing status is not valid.": "Estado de procesamiento no es válido.",
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
  "Cells visualized must be yes, no, or Not set.":
    "Células visualizadas debe ser sí, no o Not set.",
  "Biopsy table validation failed.":
    "Falló la validación de la tabla de biopsias.",
  "Biopsy table is missing required fields.":
    "Faltan completar campos en la tabla de biopsias.",
  "Complete every required cell and fix cells that do not match their validation criteria before opening preview.":
    "Completá todas las celdas obligatorias y corregí las que no cumplen con sus criterios antes de abrir la vista previa.",
  "Empty required biopsy cells can be filled with Not set before opening preview.":
    "Las celdas obligatorias vacías se pueden completar con Not set antes de abrir la vista previa.",
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
  "Requesting doctor is required.": "El médico solicitante es requerido.",
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
  "Unable to save the form draft.":
    "No se pudo guardar el borrador del formulario.",
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
  "Pick patient": "Elegir paciente",
  "Manual patient information": "Información manual de paciente",
  "Does this form use a pre-existing patient?":
    "¿Desea realizar este formulario con un paciente pre-existente?",
  Institution: "Institución",
  "Select institution": "Seleccionar institución",
  "No institution": "Sin institución",
  Doctor: "Médico",
  "Select doctor": "Seleccionar médico",
  "No doctor": "Sin médico",
  Email: "Email",
  "Study request form": "Formulario de solicitud",
  "Patient reference email": "Mail del paciente",
  "Patient email": "Mail del paciente",
  "IMPORTANT: THIS MUST BE CORRECT BECAUSE THE CREDENTIALS TO UPLOAD THE INFORMED CONSENT WILL BE SENT TO THIS EMAIL ADDRESS":
    "IMPORTANTE: DEBE SER EL CORRECTO YA QUE A ESTA DIRECCION DE CORREO ELECTRONICO SE ENVIARÁN LAS CREDENCIALES PARA SUBIR EL CONSENTIMIENTO INFORMADO",
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
  "Unable to read karyotype file.": "No se pudo leer el archivo de cariotipo.",
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
  Address: "Dirección",
  City: "Ciudad",
  "State / region": "Provincia / región",
  Country: "País",
  "Recommended countries": "Países recomendados",
  "All other countries": "Otros países",
  "All countries": "Todos los países",
  "Select country": "Seleccionar país",
  "No country": "Sin país",
  "Institution identifier": "Identificador dentro de la institución",
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
  "Processed by first name": "Procesado por nombre",
  "Processed by last name": "Procesado por apellido",
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
  "Continue anyway": "Continuar de todos modos",
  "Preview validation": "Validación para vista previa",
  "The form validates steps 1 to 5 before opening the read-only preview.":
    "El formulario valida los pasos 1 a 5 antes de abrir la vista previa de solo lectura.",
  "The form validates the completed steps before opening the read-only preview.":
    "El formulario valida los pasos completados antes de abrir la vista previa de solo lectura.",
  "Validating steps 1 to 5 before opening preview.":
    "Validando los pasos 1 a 5 antes de abrir la vista previa.",
  "Validating completed steps before opening preview.":
    "Validando pasos completados antes de abrir la vista previa.",
  "Steps 1 to 5 passed validation. Saving draft checkpoint.":
    "Los pasos 1 a 5 pasaron la validación. Guardando checkpoint de borrador.",
  "Completed steps passed validation. Saving draft checkpoint.":
    "Los pasos completados pasaron la validación. Guardando checkpoint de borrador.",
  "Steps 1 to 5 passed validation. Opening preview.":
    "Los pasos 1 a 5 pasaron la validación. Abriendo vista previa.",
  "Completed steps passed validation. Opening preview.":
    "Los pasos completados pasaron la validación. Abriendo vista previa.",
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
  "Go to 2PQ dashboard": "Ir al dashboard 2PQ",
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
  Add: "Agregar",
  Continue: "Continuar",
  "No stored forms yet.": "Todavía no hay formularios guardados.",
  "Add 2PQ case": "Agregar caso 2PQ",
  "Search by three-letter code, case label, or case ID.":
    "Buscar por código de tres letras, etiqueta de caso o ID de caso.",
  "No 2PQ cases match this search.":
    "No hay casos 2PQ que coincidan con esta búsqueda.",
  "Selected 2PQ cases": "Casos 2PQ seleccionados",
  "box requested for pick up": "caja solicitada para retirar",
  "boxes requested for pick up": "cajas solicitadas para retirar",
  "These are the 2PQ boxes included in this withdrawal request.":
    "Estas son las cajas 2PQ incluidas en este pedido de retiro.",
  "cases selected": "casos seleccionados",
  "Every selected case will be marked as Awaiting pick up when the form is signed.":
    "Cada caso seleccionado será marcado como Esperando retiro cuando se firme el formulario.",
  "No 2PQ cases selected yet.": "Todavía no hay casos 2PQ seleccionados.",
  "Current status": "Estado actual",
  "Next status": "Siguiente estado",
  "Final status": "Estado final",
  "New status": "Nuevo estado",
  "Withdrawal effect": "Efecto de la solicitud de retiro",
  "Case status update": "Actualización de estado del caso",
  "Case status updated.": "Estado del caso actualizado.",
  "Unable to update case status.": "No se pudo actualizar el estado del caso.",
  "The clinic completed the biopsy form and the case entered the workflow.":
    "La clínica completó el form de biopsias; el caso quedó ingresado.",
  "The clinic completed the pick-up form; the case is waiting for collection.":
    "La clínica completó el form de retiro; queda pendiente que retiren la caja.",
  "Transport picked up the box and it is on its way to 2PQ.":
    "El transporte ya se llevó la caja y está camino a 2PQ.",
  "2PQ received the samples and they are stored in the refrigerator.":
    "2PQ ya recibió las muestras y están en la heladera.",
  "The laboratory is processing the sample.":
    "Roman está procesando la muestra en laboratorio.",
  "The bioinformatics analysis is in progress.":
    "Nicolas está procesando el análisis bioinformático.",
  "The report is ready to download.": "El informe está listo para descargar.",
  "Select a case status to see what should be happening now.":
    "Seleccioná un estado del caso para ver qué debería estar pasando ahora.",
  "When this form is signed, every selected case will be marked as Awaiting pick up.":
    "Cuando se firme este formulario, cada caso seleccionado será marcado como Esperando retiro.",
  "Select at least one linked 2PQ case.":
    "Seleccioná al menos un caso 2PQ vinculado.",
  "All selected 2PQ cases must belong to the same institution.":
    "Todos los casos 2PQ seleccionados deben pertenecer a la misma institución.",
  "2PQ cases awaiting pick up": "Casos 2PQ esperando retiro",
  "These cases were linked to this withdrawal request form.":
    "Estos casos fueron vinculados a este formulario de solicitud de retiro.",
  "Previous status": "Estado anterior",
  "Case ID": "ID de caso",
  "Linked case count": "Cantidad de casos vinculados",
  "The withdrawal request form is ready and stored":
    "El formulario de solicitud de retiro está listo y guardado",
  "No forms match these filters.":
    "No hay formularios que coincidan con estos filtros.",
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
  "The newly selected test in this biopsy form will be used as the final decision to continue processing the sample.":
    "Se utilizará el nuevo valor seleccionado en este formulario como decisión final para avanzar con el procesamiento de la muestra.",
  "No changes from linked study request.":
    "Sin cambios respecto de la solicitud de estudio vinculada.",
  "Study creation date": "Fecha de creación del estudio",
  "Form creation date": "Fecha de creación del formulario",
  "Last update": "Última actualización",
  "Apply filters": "Aplicar filtros",
  "Clear filters": "Limpiar filtros",
  "Newest first": "Más nuevos primero",
  "Oldest first": "Más antiguos primero",
  "Show archived": "Mostrar archivados",
  "Hide archived": "Ocultar archivados",
  "Load more": "Cargar más",
  "Loading...": "Cargando...",
  "forms shown": "formularios mostrados",
  "Unable to load stored forms.":
    "No se pudieron cargar los formularios guardados.",
  Delete: "Eliminar",
  Archive: "Archivar",
  "Edit feed entry": "Editar entrada del feed",
  "Save changes": "Guardar cambios",
  "Changes saved.": "Cambios guardados.",
  "Delete feed entry?": "¿Eliminar entrada del feed?",
  "This permanently deletes the feed entry from Discover. It will be fully erased from the feed and cannot be restored.":
    "Esto elimina permanentemente la entrada del feed de Discover. Se borrará por completo del feed y no se podrá restaurar.",
  "Feed entry deleted.": "Entrada del feed eliminada.",
  "Unable to delete the feed entry.":
    "No se pudo eliminar la entrada del feed.",
  "Unable to load Discover data. Refresh the page or contact support if it repeats.":
    "No se pudieron cargar los datos de Discover. Actualizá la página o contactá a soporte si se repite.",
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
  "The 2PQ form is stored and ready": "El formulario 2PQ está guardado y listo",
  "The access email was sent to the patient":
    "El mail de acceso fue enviado al paciente",
  "An email with the access key was sent to the patient's email. The patient must review it to upload the file.":
    "Se envió un mail con la clave de acceso al correo del paciente. El paciente debe revisarlo para poder subir el archivo.",
  "Ask the patient to check the spam folder too; sometimes this email arrives there.":
    "Pedile al paciente que revise también la casilla de spam; a veces este mail llega ahí.",
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
  "2PQ Sampling": "Biopsia 2pq",
  "2PQ Sequencing": "Secuenciación 2PQ",
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
  "A role-by-role explainer for role assignment permissions, operating scope, and hard boundaries.":
    "Una explicación rol por rol de permisos de asignación, alcance operativo y límites estrictos.",
  "A stored file is already linked to this case.":
    "Ya hay un archivo almacenado vinculado a este caso.",
  "A unique three-letter shorthand for this 2PQ case. Use it as a quick visual identifier when operators need a short code instead of the full case label.":
    "Una abreviatura única de tres letras para este caso 2PQ. Usala como identificador visual rápido cuando el operador necesite un código corto en lugar de la etiqueta completa del caso.",
  "Administrative operators are institution-scoped staff records. Each operator belongs to one institution and does not own patient assignments.":
    "Los operarios administrativos son registros de staff con alcance institucional. Cada operario pertenece a una institución y no tiene pacientes asignados.",
  "Administrative operators attached to this institution":
    "Operarios administrativos asociados a esta institución",
  "Administrative operators sit beside doctors under an institution.":
    "Los operarios administrativos están al mismo nivel que los médicos debajo de una institución.",
  access: "acceso",
  "Access and communication": "Acceso y comunicación",
  "Access status": "Estado de acceso",
  "Action unavailable": "Acción no disponible",
  "Accounts and Community": "Cuentas y comunidad",
  Action: "Acción",
  "Add administrative operator": "Agregar operario administrativo",
  "Add doctor": "Agregar médico",
  "Add laboratory staff": "Agregar personal de laboratorio",
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
  and: "y",
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
  "Associated biopsies": "Biopsias asociadas",
  "associated biopsies were deleted together.":
    "biopsias asociadas fueron eliminadas juntas.",
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
  "Back to cases": "Volver a casos",
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
  "Bulk sampling update completed":
    "Actualización masiva de muestreos completada",
  Carrier: "Transportista",
  Case: "Caso",
  "Case deletion completed": "Eliminación de caso completada",
  "Case deletion error": "Error de eliminación del caso",
  "Case deletion progress": "Progreso de eliminación del caso",
  "Case identifier linked to sampling.":
    "Identificador de caso vinculado al muestreo.",
  "Case intake and orchestration records stored in Firebase under `2pq_case`.":
    "Registros de ingreso y orquestación de casos almacenados en Firebase bajo `2pq_case`.",
  "Case label must match the active three letter code. Expected value:":
    "La etiqueta del caso debe coincidir con el código activo de tres letras. Valor esperado:",
  "Case records are now live Firebase documents.":
    "Los registros de caso ahora son documentos activos de Firebase.",
  "Case state": "Estado del caso",
  "Change batch": "Cambiar lote",
  "Change case": "Cambiar caso",
  "Changing a role changes access boundaries.":
    "Cambiar un rol modifica los límites de acceso.",
  "Checked fields are being patched across the current case child samplings one by one.":
    "Los campos seleccionados se aplican uno por uno en los muestreos hijos del caso actual.",
  Checking: "Verificando",
  "Checking current publish state...":
    "Verificando estado actual de publicación...",
  "Checking the current report-code linkage...":
    "Verificando el vínculo actual del código de reporte...",
  "Checking permissions and every biopsy currently linked to this case.":
    "Verificando permisos y cada biopsia actualmente vinculada a este caso.",
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
  "Close auto sampling creation modal":
    "Cerrar modal de creación automática de muestreos",
  "Close case deletion progress": "Cerrar progreso de eliminación del caso",
  "Close error log": "Cerrar log de error",
  "Close multi sampling edit modal":
    "Cerrar modal de edición múltiple de muestreos",
  "Close multi sampling edit progress":
    "Cerrar progreso de edición múltiple de muestreos",
  "Close multiple sampling modal": "Cerrar modal de muestreo múltiple",
  "Close publish as report code modal":
    "Cerrar modal de publicación como código de reporte",
  "Close publish to file storage modal":
    "Cerrar modal de publicación en archivos",
  "Close three letter code modal": "Cerrar modal de código de tres letras",
  "Close update in file storage modal":
    "Cerrar modal de actualización en archivos",
  codes: "códigos",
  "Collection date": "Fecha de recolección",
  collection: "colección",
  "collection.": "colección.",
  comments: "comentarios",
  "Communication notes, consent status, or support context...":
    "Notas de comunicación, estado de consentimiento o contexto de soporte...",
  "Communication preference.": "Preferencia de comunicación.",
  "Communication state with the provider.":
    "Estado de comunicación con el prestador.",
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
  "Contacts used for run coordination.":
    "Contactos usados para coordinar la corrida.",
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
  "Create administrative operator": "Alta de operario administrativo",
  "Create laboratory staff": "Alta de personal de laboratorio",
  "Create a live Firestore document in":
    "Crear un documento activo de Firestore en",
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
  "Current role cannot delete this":
    "El rol actual no puede eliminar este registro",
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
  "Delete associated biopsies": "Eliminar biopsias asociadas",
  "Delete associated biopsies too": "Eliminar también las biopsias asociadas",
  "Delete case and biopsies": "Eliminar caso y biopsias",
  "Delete case record": "Eliminar registro de caso",
  "Delete failed. Please try again.":
    "La eliminación falló. Intentá nuevamente.",
  "Delete record": "Eliminar registro",
  "Delete record?": "¿Eliminar registro?",
  "Deleting...": "Eliminando...",
  "Deleting the case and the linked biopsy records selected in the confirmation.":
    "Eliminando el caso y los registros de biopsia vinculados seleccionados en la confirmación.",
  "If selected, every biopsy currently linked to this case will be removed instead of only being unlinked.":
    "Si se selecciona, cada biopsia actualmente vinculada a este caso será eliminada en vez de solo desvincularse.",
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
  "Doctor email": "Email del médico",
  "Doctor auth email is required and must be valid.":
    "El email del médico es requerido y debe ser válido.",
  "Doctor changes saved.": "Cambios del médico guardados.",
  "Doctor created.": "Médico creado.",
  "Doctor detail joins the editable doctor profile, linked institution, direct patient list, and role linkage in one operational screen.":
    "El detalle de médico une el perfil editable, la institución vinculada, la lista directa de pacientes y el vínculo de rol en una sola pantalla operativa.",
  "Doctor full name is required.":
    "El nombre completo del médico es requerido.",
  "Doctor lane that owns the case.": "Carril médico dueño del caso.",
  "Doctor link": "Vínculo de médico",
  "Doctor record": "Registro de médico",
  "Doctor scope": "Alcance del médico",
  "Doctor workbench": "Mesa de trabajo del médico",
  doctors: "médicos",
  "Doctors attached to this institution":
    "Médicos asociados a esta institución",
  "Doctors belong to exactly one institution.":
    "Los médicos pertenecen exactamente a una institución.",
  "Doctors can edit only their own patients.":
    "Los médicos solo pueden editar sus propios pacientes.",
  "Doctors can inspect peers, but edit only self.":
    "Los médicos pueden inspeccionar pares, pero solo editar su propio registro.",
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
  "Email-based role assignments with a clear hierarchy: full admin, institution admin, institution operator, institution doctor, and patient.":
    "Asignaciones de rol por email con una jerarquía clara: administrador total, administrador de institución, operario de institución, médico de institución y paciente.",
  "Email-based role assignments with a clear hierarchy: full admin, institution admin, institution operator, institution laboratory staff, institution doctor, and patient.":
    "Asignaciones de rol por email con una jerarquía clara: administrador total, administrador de institución, operario de institución, personal de laboratorio de institución, médico de institución y paciente.",
  "Email-scoped access control records with institution, doctor, and patient boundaries.":
    "Registros de control de acceso por email con límites de institución, médico y paciente.",
  "Email-scoped access tree for full admins, institution admins, doctors, and patients.":
    "Árbol de acceso por email para administradores totales, administradores de institución, médicos y pacientes.",
  "Email-scoped access tree for full admins, institution admins, institution operators, doctors, and patients.":
    "Árbol de acceso por email para administradores totales, administradores de institución, operarios de institución, médicos y pacientes.",
  "Email-scoped access tree for full admins, institution admins, institution operators, institution laboratory staff, doctors, and patients.":
    "Árbol de acceso por email para administradores totales, administradores de institución, operarios de institución, personal de laboratorio de institución, médicos y pacientes.",
  "Email-based access tree for full admins, institution admins, institution operators, doctors, and patients.":
    "Árbol de acceso por email para administradores totales, administradores de institución, operarios de institución, médicos y pacientes.",
  "Email-based access tree for full admins, institution admins, institution operators, institution laboratory staff, doctors, and patients.":
    "Árbol de acceso por email para administradores totales, administradores de institución, operarios de institución, personal de laboratorio de institución, médicos y pacientes.",
  "Entity Created": "Entidad creada",
  events: "eventos",
  "Every institution-scoped role, doctor, and patient record hangs off one institution. Full admins can create new institutions; institution admins and doctors stay inside their single institution boundary.":
    "Cada rol, médico y paciente con alcance institucional depende de una institución. Los administradores totales pueden crear instituciones; administradores de institución y médicos permanecen dentro de su límite institucional único.",
  "Every institution-scoped role, doctor, and patient record hangs off one institution. Full admins can create new institutions; institution admins, institution operators, and doctors stay inside their single institution boundary.":
    "Cada rol, médico y paciente con alcance institucional depende de una institución. Los administradores totales pueden crear instituciones; administradores de institución, operarios de institución y médicos permanecen dentro de su límite institucional único.",
  "Every institution-scoped role, doctor, and patient record hangs off one institution. Full admins can create new institutions; institution admins, institution operators, institution laboratory staff, and doctors stay inside their single institution boundary.":
    "Cada rol, médico y paciente con alcance institucional depende de una institución. Los administradores totales pueden crear instituciones; administradores de institución, operarios de institución, personal de laboratorio de institución y médicos permanecen dentro de su límite institucional único.",
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
  "External logistics tracking number.":
    "Número externo de seguimiento logístico.",
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
  "Generate random three letter code":
    "Generar código aleatorio de tres letras",
  "Generation paused on this item. Inspect the error log for details.":
    "La generación se pausó en este elemento. Revisá el log de error para ver detalles.",
  Global: "Global",
  "Global institution index with editable descriptors, doctor counts, patient totals, and local admin coverage.":
    "Índice global de instituciones con descriptores editables, cantidad de médicos, totales de pacientes y cobertura de administradores locales.",
  "Global scope": "Alcance global",
  "Grouped parent-child entities for the new flow: sequencing batches, cases, and sampling records.":
    "Entidades padre-hijo agrupadas para el nuevo flujo: lotes de secuenciación, casos y registros de muestreo.",
  "Cases and biopsy records stay grouped here for the medical workflow.":
    "Los casos y registros de biopsia quedan agrupados acá para el flujo médico.",
  "Human-readable case identifier.": "Identificador de caso legible.",
  "Human-readable sequencing batch label.":
    "Etiqueta legible del lote de secuenciación.",
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
  "Institution-scoped operations for institutions, doctors, administrative operators, laboratory staff, and patients.":
    "Operaciones con alcance institucional para instituciones, médicos, operarios administrativos, personal de laboratorio y pacientes.",
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
  "Institution-linked administrative operator records without patient assignments.":
    "Registros de operarios administrativos vinculados a institución, sin pacientes asignados.",
  "Institution-linked administrative operators":
    "Operarios administrativos vinculados a institución",
  "Institution-linked laboratory staff":
    "Personal de laboratorio vinculado a institución",
  "Institution-linked laboratory staff records without patient assignments.":
    "Registros de personal de laboratorio vinculados a institución, sin pacientes asignados.",
  "Institution-linked doctors with direct patient counts, role linkage, and a clear distinction between read-only peers and the doctor record you can actually edit.":
    "Médicos vinculados a institución con conteo directo de pacientes, vínculo de rol y una distinción clara entre pares de solo lectura y el registro médico que realmente podés editar.",
  "Institution-scoped roles require an institution.":
    "Los roles con alcance institucional requieren una institución.",
  "Institution staff role": "Rol de staff institucional",
  institutions: "instituciones",
  "Institutions / doctors / patients": "Instituciones / médicos / pacientes",
  "is active for this case.": "está activo para este caso.",
  "is live and ready in the full list.":
    "está activo y disponible en la lista completa.",
  "is staged for this new case.": "está preparado para este nuevo caso.",
  "Jump directly into the live 2PQ areas.":
    "Entrá directamente a las áreas 2PQ activas.",
  "Keep institution records direct and operational: one durable id, one readable descriptor set, and linked doctor operations from the same screen.":
    "Mantené los registros de institución directos y operativos: un ID durable, un conjunto de descriptores legible y operaciones de médicos vinculadas desde la misma pantalla.",
  "Keep these official 2PQ channels visible for form coordination, sample logistics, and operational follow-up.":
    "Mantené visibles estos canales oficiales de 2PQ para coordinar formularios, logística de muestras y seguimiento operativo.",
  "Laboratory staff are institution-scoped staff records. Each staff member belongs to one institution and does not own patient assignments.":
    "El personal de laboratorio son registros de staff con alcance institucional. Cada integrante pertenece a una institución y no tiene pacientes asignados.",
  "Laboratory staff attached to this institution":
    "Personal de laboratorio asociado a esta institución",
  "Laboratory staff sit beside doctors under an institution.":
    "El personal de laboratorio está al mismo nivel que los médicos debajo de una institución.",
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
  "Main sequencing batch metadata.":
    "Metadata principal del lote de secuenciación.",
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
  "New similar form": "Nuevo formulario similar",
  "New value": "Nuevo valor",
  No: "No",
  "No access": "Sin acceso",
  "No access to this surface": "Sin acceso a esta superficie",
  "No backoffice access": "Sin acceso al backoffice",
  "No role administration access": "Sin acceso a administración de roles",
  "No cases are linked to this batch yet.":
    "Todavía no hay casos vinculados a este lote.",
  "No doctors are attached to this institution yet.":
    "Todavía no hay médicos asociados a esta institución.",
  "No doctors match the current filter.":
    "Ningún médico coincide con el filtro actual.",
  "No administrative operators are attached to this institution yet.":
    "Todavía no hay operarios administrativos asociados a esta institución.",
  "No administrative operators match the current filter.":
    "Ningún operario administrativo coincide con el filtro actual.",
  "No fields selected.": "No hay campos seleccionados.",
  "No institutions match the current filter.":
    "Ninguna institución coincide con el filtro actual.",
  "No linked biopsies are currently attached to this case.":
    "No hay biopsias vinculadas actualmente a este caso.",
  "No laboratory staff are attached to this institution yet.":
    "Todavía no hay personal de laboratorio asociado a esta institución.",
  "No laboratory staff match the current filter.":
    "Ningún integrante del personal de laboratorio coincide con el filtro actual.",
  "No local cleanup was completed after the backend rejected the request.":
    "No se completó ninguna limpieza local después de que el backend rechazó la solicitud.",
  "No matching records available.":
    "No hay registros coincidentes disponibles.",
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
  "No unsaved changes": "Sin cambios sin guardar",
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
  "Only full admins, institution admins, and institution operators can create doctors.":
    "Solo administradores totales, administradores de institución y operarios de institución pueden dar de alta médicos.",
  "Only full admins, institution admins, institution operators, and institution laboratory staff can create doctors.":
    "Solo administradores totales, administradores de institución, operarios de institución y personal de laboratorio de institución pueden dar de alta médicos.",
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
  "Only full admins, institution admins, institution operators, and scoped institution doctors can create patients.":
    "Solo administradores totales, administradores de institución, operarios de institución y médicos de institución dentro de alcance pueden dar de alta pacientes.",
  "Only full admins, institution admins, institution operators, institution laboratory staff, and scoped institution doctors can create patients.":
    "Solo administradores totales, administradores de institución, operarios de institución, personal de laboratorio de institución y médicos de institución dentro de alcance pueden dar de alta pacientes.",
  "Open area": "Abrir área",
  "Open Administrative Operators": "Abrir operarios administrativos",
  "Open doctor": "Abrir médico",
  "Open Doctors": "Abrir médicos",
  "Open Forms": "Abrir formularios",
  "Open institution": "Abrir institución",
  "Open Institutions": "Abrir instituciones",
  "Open Laboratory Staff": "Abrir personal de laboratorio",
  "Open patient": "Abrir paciente",
  "Open Patients": "Abrir pacientes",
  "Open Roles": "Abrir roles",
  "Operational contact information.": "Información de contacto operativo.",
  "Optional batch or sequencing run pointer.":
    "Referencia opcional a lote o corrida de secuenciación.",
  "Optional collection date copied into every generated record.":
    "Fecha opcional de recolección copiada en cada registro generado.",
  "Optional patient linkage for the case.":
    "Vínculo opcional de paciente para el caso.",
  "Optional patient reference.": "Referencia opcional de paciente.",
  "Optional quality-control outcome shared by the generated set.":
    "Resultado opcional de control de calidad compartido por el conjunto generado.",
  "Optional reception date copied into every generated record.":
    "Fecha opcional de recepción copiada en cada registro generado.",
  "Optional sequencing run pointer.":
    "Referencia opcional a corrida de secuenciación.",
  "Optional external tracking reference.": "Referencia externa opcional.",
  "Operational timing": "Tiempos operativos",
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
  "Preparing the updated case list after deletion.":
    "Preparando la lista de casos actualizada después de la eliminación.",
  "Preparing the update preview": "Preparando vista previa de actualización",
  Preview: "Vista previa",
  "Primary case identifiers and status.":
    "Identificadores principales del caso y estado.",
  "Primary contact.": "Contacto principal.",
  "Primary provider contact fields.":
    "Campos principales de contacto del prestador.",
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
  "Provider format will be saved as":
    "El formato del prestador se guardará como",
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
  "Read-only completion": "Finalización solo lectura",
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
  "Refresh case list": "Actualizar lista de casos",
  Refreshing: "Actualizando",
  Regenerate: "Regenerar",
  Relations: "Relaciones",
  "Remove three letter code": "Quitar código de tres letras",
  "Removing it clears the staged value so the new case will be created without a three letter code.":
    "Al quitarlo se limpia el valor preparado, por lo que el nuevo caso se creará sin código de tres letras.",
  "Removing it frees the code so another case can use it later.":
    "Al quitarlo se libera el código para que otro caso pueda usarlo más adelante.",
  "Removing the biopsy records selected for full deletion.":
    "Eliminando los registros de biopsia seleccionados para eliminación completa.",
  "Removing the case document after the biopsy decision is applied.":
    "Eliminando el documento de caso después de aplicar la decisión sobre biopsias.",
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
  "Review your own role, permissions, and Firebase Auth details without opening another user's role assignment.":
    "Revisá tu propio rol, permisos y detalles de Firebase Auth sin abrir la asignación de rol de otro usuario.",
  "right now.": "ahora.",
  Role: "Rol",
  "Role active": "Rol activo",
  "Role assignment capabilities": "Capacidades de asignación de rol",
  "Current role assignment lane": "Carril de asignación de rol actual",
  "Only your current role lane is visible from this account.":
    "Desde esta cuenta solo se muestra el carril de tu rol actual.",
  "Role assignment lanes": "Carriles de asignación de rol",
  "Role assignment created.": "Asignación de rol creada.",
  "Role assignment operations": "Operaciones de asignación de rol",
  "Role assignment saved.": "Asignación de rol guardada.",
  "Individual publisher roles require an individual publisher.":
    "Los roles de editor requieren seleccionar un editor.",
  "Select individual publisher": "Seleccionar editor",
  "No individual publisher": "Sin editor",
  "Discover individual publisher scope": "Alcance del editor de Discover",
  "Open individual publisher": "Abrir editor",
  "Individual publisher id": "ID de editor",
  "These CRUD chips apply only to role assignment records, not to every 2PQ operational screen.":
    "Estos indicadores CRUD aplican solo a registros de asignación de rol, no a todas las pantallas operativas 2PQ.",
  "Role detail is where email-based access, institution scope, doctor scope, and patient scope all come together in one typed form.":
    "El detalle de rol reúne en un formulario tipado el acceso por email, alcance de institución, alcance de médico y alcance de paciente.",
  "Role email is required and must be valid.":
    "El email del rol es requerido y debe ser válido.",
  "Role email": "Email de rol",
  "Role inactive": "Rol inactivo",
  "Role records defining the active lane":
    "Registros de rol que definen el carril activo",
  "role records": "registros de rol",
  "administrative operators": "operarios administrativos",
  "laboratory staff": "personal de laboratorio",
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
  "Scope links for the sampling record.":
    "Vínculos de alcance para el registro de muestreo.",
  "Scheduling fields used by downstream processing and report steps.":
    "Campos de planificación usados por procesamiento y reportes.",
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
  "Search administrative operators by email, name, or institution...":
    "Buscar operarios administrativos por email, nombre o institución...",
  "Search institutions by id, code, name, email, or city...":
    "Buscar instituciones por ID, código, nombre, email o ciudad...",
  "Search laboratory staff by email, name, or institution...":
    "Buscar personal de laboratorio por email, nombre o institución...",
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
  "Searchable patient index with scoped visibility by institution and scoped edit rights by doctor ownership.":
    "Índice de pacientes buscable con visibilidad por institución y edición acotada por titularidad médica.",
  "Secondary workflow surfaces": "Otras áreas",
  Sent: "Enviado",
  "Select a doctor for this patient.":
    "Seleccioná un médico para este paciente.",
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
  "Sequencing platform or provider.":
    "Plataforma o prestador de secuenciación.",
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
    "Formularios 2PQ guardados de solicitud de estudio, biopsias y retiro.",
  "Stored 2PQ study request and biopsy forms.":
    "Formularios 2PQ guardados de solicitud de estudio, biopsias y retiro.",
  "Stored 2PQ study request, biopsy, and withdrawal forms.":
    "Formularios 2PQ guardados de solicitud de estudio, biopsias y retiro.",
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
  "The case and its associated biopsies are being deleted in a controlled backend operation.":
    "El caso y sus biopsias asociadas se están eliminando en una operación controlada de backend.",
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
  "The deletion stopped. Open the error log to inspect the backend response.":
    "La eliminación se detuvo. Abrí el log de error para inspeccionar la respuesta del backend.",
  "The current role cannot create role assignments.":
    "El rol actual no puede crear asignaciones de rol.",
  "The current role cannot create administrative operators on this screen.":
    "El rol actual no puede crear operarios administrativos en esta pantalla.",
  "The current role cannot create laboratory staff on this screen.":
    "El rol actual no puede crear personal de laboratorio en esta pantalla.",
  "The current role cannot create role assignments on this screen.":
    "El rol actual no puede crear asignaciones de rol en esta pantalla.",
  "Ask the institution administrator to add a new role.":
    "Solicitá al administrador de la institución que agregue un nuevo rol.",
  "The current role cannot create records on this screen.":
    "El rol actual no puede dar de alta registros en esta pantalla.",
  "These entities cannot be created directly. They must be requested through the corresponding form.":
    "Estas entidades no se pueden crear directamente. Deben solicitarse mediante el formulario correspondiente.",
  "Use the corresponding form": "Usá el formulario correspondiente",
  OK: "OK",
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
  "The list below separates allowed operational work from blocked role-administration actions.":
    "La lista separa el trabajo operativo permitido de las acciones bloqueadas de administración de roles.",
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
  "System access depends on role assignment. A user can enter only after an active role has been assigned to their email. Without an assigned role, or after that role is removed, the user can no longer access the system.":
    "El acceso al sistema depende de la asignación de rol. Un usuario solo puede entrar cuando su email tiene un rol activo asignado. Sin un rol asignado, o si ese rol se elimina, el usuario ya no puede acceder al sistema.",
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
  "This deletes the case. By default, linked biopsies are kept and only unlinked from this case.":
    "Esto elimina el caso. Por defecto, las biopsias vinculadas se conservan y solo se desvinculan de este caso.",
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
  "This area reads the institution operator role records and shows them as institution children without adding doctor or patient linkage.":
    "Esta área lee los registros de rol de operario de institución y los muestra como hijos de la institución, sin agregar vínculos de médico ni de paciente.",
  "This area reads institution laboratory staff role records and shows them as institution children without doctor or patient linkage.":
    "Esta área lee los registros de rol de personal de laboratorio de institución y los muestra como hijos de la institución, sin vínculos de médico ni de paciente.",
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
  "Turn on at least one checkbox before applying a bulk update.":
    "Activá al menos un checkbox antes de aplicar una actualización masiva.",
  "Type of sample collected.": "Tipo de muestra recolectada.",
  "Unable to copy the error log.": "No se pudo copiar el log de error.",
  "Unable to create the doctor.": "No se pudo crear el médico.",
  "Unable to create the institution.": "No se pudo crear la institución.",
  "Unable to create the patient.": "No se pudo crear el paciente.",
  "Unable to create the role assignment.":
    "No se pudo crear la asignación de rol.",
  "Unable to delete case and associated biopsies.":
    "No se pudo eliminar el caso y las biopsias asociadas.",
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
  "Unsaved changes": "Cambios sin guardar",
  "Use a clear name, keep the relational id durable, and only add doctors or institution-admin roles after the institution record exists.":
    "Usá un nombre claro, mantené durable el ID relacional y agregá médicos o roles de administrador de institución solo después de que exista el registro de institución.",
  "Use batch": "Usar lote",
  "Use create, replace, update, and delete to manage sequencing batch work items directly in Firebase.":
    "Usá crear, reemplazar, actualizar y eliminar para gestionar lotes de secuenciación directamente en Firebase.",
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
  "Validate case and linked biopsies": "Validar caso y biopsias vinculadas",
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
  "while the published stored file was last updated":
    "mientras que el archivo almacenado publicado se actualizó por última vez",
  "with explicit institution, doctor, and patient linkage.":
    "con vínculo explícito de institución, médico y paciente.",
  "with record id": "con ID de registro",
  workbench: "mesa de trabajo",
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
  "child sampling records updated.": "registros de muestreo hijo actualizados.",
  "Correct case label": "Corregir etiqueta del caso",
  "Final validation failed.": "Falló la validación final.",
  "Link batch to case": "Vincular lote al caso",
  "Link case to batch": "Vincular caso al lote",
  "Link case to sampling": "Vincular caso al muestreo",
  "Link sampling to case": "Vincular muestreo al caso",
  "linked biopsies will be unlinked unless you choose to delete them too.":
    "biopsias vinculadas se desvincularán salvo que elijas eliminarlas también.",
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
  "Can assign institution-admin, institution-operator, institution-doctor, and patient roles inside that institution only.":
    "Puede asignar roles de administrador de institución, operario de institución, médico de institución y paciente solo dentro de esa institución.",
  "Can assign institution-operator, institution-doctor, and patient roles inside that institution only.":
    "Puede asignar roles de operario de institución, médico de institución y paciente solo dentro de esa institución.",
  "Can assign institution-operator, institution-laboratory-staff, institution-doctor, and patient roles inside that institution only.":
    "Puede asignar roles de operario de institución, personal de laboratorio de institución, médico de institución y paciente solo dentro de esa institución.",
  "Can update existing institution-operator, institution-laboratory-staff, institution-doctor, and patient roles inside that institution only.":
    "Puede actualizar roles existentes de operario de institución, personal de laboratorio de institución, médico de institución y paciente solo dentro de esa institución.",
  "Cannot assign institution-admin roles.":
    "No puede asignar roles de administrador de institución.",
  "Can manage local role assignments":
    "Puede gestionar asignaciones locales de rol",
  "Can update local role assignments":
    "Puede actualizar asignaciones locales de rol",
  "Can update existing local role assignments":
    "Puede actualizar asignaciones locales existentes de rol",
  "Can manage institution doctors and patients":
    "Puede gestionar médicos y pacientes de la institución",
  "Cannot manage local role assignments":
    "No puede gestionar asignaciones locales de rol",
  "Can manage patient-facing role assignments":
    "Puede gestionar asignaciones de rol orientadas a pacientes",
  "Cannot create role assignments": "No puede crear asignaciones de rol",
  "Cannot staff their institution":
    "No puede administrar el equipo de su institución",
  "Cannot administer doctors or patients":
    "No puede administrar médicos ni pacientes",
  "Cannot inspect the local permission map":
    "No puede inspeccionar el mapa local de permisos",
  "Cannot create or update doctors, patients, or role assignments.":
    "No puede crear ni actualizar médicos, pacientes o asignaciones de rol.",
  "New role assignments must be requested from the institution administrator.":
    "Las nuevas asignaciones de rol deben solicitarse al administrador de la institución.",
  "Can operate across every lane": "Puede operar en todos los carriles",
  "Can operate 2PQ cases": "Puede operar casos 2PQ",
  "Can operate biopsy records": "Puede operar registros de biopsias",
  "Can operate sequencing batches": "Puede operar lotes de secuenciación",
  "Can operate 2PQ reports": "Puede operar reportes 2PQ",
  "Can use the 2PQ backoffice": "Puede usar el backoffice 2PQ",
  "Can inspect institution context":
    "Puede consultar el contexto institucional",
  "Can review the surrounding context": "Puede revisar el contexto circundante",
  "Can see and edit only one institution.":
    "Puede ver y editar solo una institución.",
  "Can create doctors and patients inside that institution.":
    "Puede crear médicos y pacientes dentro de esa institución.",
  "Can staff their institution":
    "Puede administrar el equipo de su institución",
  "Can stay inside one doctor lane":
    "Puede permanecer dentro de un carril médico",
  "Can unblock broader admin work":
    "Puede desbloquear trabajo administrativo más amplio",
  "Cannot create admin lanes": "No puede crear carriles administrativos",
  "Cannot create full admins": "No puede crear administradores totales",
  "Cannot create institution admins":
    "No puede crear administradores de institución",
  "Cannot create or modify institution admins":
    "No puede crear ni modificar administradores de institución",
  "Cannot cross institution boundaries":
    "No puede cruzar límites institucionales",
  "Cannot enter the backoffice": "No puede ingresar al backoffice",
  "Cannot grant permissions to others": "No puede otorgar permisos a otros",
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
  "Full admins can create and update full admin, institution admin, institution operator, institution doctor, and patient role assignments.":
    "Los administradores totales pueden crear y actualizar asignaciones de administrador total, administrador de institución, operario de institución, médico de institución y paciente.",
  "Full admins can create and update full admin, institution admin, institution operator, institution laboratory staff, institution doctor, and patient role assignments.":
    "Los administradores totales pueden crear y actualizar asignaciones de administrador total, administrador de institución, operario de institución, personal de laboratorio de institución, médico de institución y paciente.",
  "Global control over institutions, users, roles, and the legacy moderation tools.":
    "Control global sobre instituciones, usuarios, roles y herramientas históricas de moderación.",
  "Institution admins can create and update institution admin, institution doctor, and patient assignments inside their own institution.":
    "Los administradores de institución pueden crear y actualizar asignaciones de administrador de institución, médico de institución y paciente dentro de su propia institución.",
  "Institution admins can create and update institution admin, institution operator, institution doctor, and patient assignments inside their own institution.":
    "Los administradores de institución pueden crear y actualizar asignaciones de administrador de institución, operario de institución, médico de institución y paciente dentro de su propia institución.",
  "Institution admins can create and update institution admin, institution operator, institution laboratory staff, institution doctor, and patient assignments inside their own institution.":
    "Los administradores de institución pueden crear y actualizar asignaciones de administrador de institución, operario de institución, personal de laboratorio de institución, médico de institución y paciente dentro de su propia institución.",
  "Institution operators can create and update institution admin, institution operator, institution doctor, and patient assignments inside their own institution.":
    "Los operarios de institución pueden crear y actualizar asignaciones de administrador de institución, operario de institución, médico de institución y paciente dentro de su propia institución.",
  "Institution operators can create and update institution operator, institution doctor, and patient assignments inside their own institution.":
    "Los operarios de institución pueden crear y actualizar asignaciones de operario de institución, médico de institución y paciente dentro de su propia institución.",
  "Institution operators can create and update institution operator, institution laboratory staff, institution doctor, and patient assignments inside their own institution.":
    "Los operarios de institución pueden crear y actualizar asignaciones de operario de institución, personal de laboratorio de institución, médico de institución y paciente dentro de su propia institución.",
  "Institution laboratory staff cannot create, update, or promote role assignments inside their institution.":
    "El personal de laboratorio de institución no puede crear, actualizar ni promover asignaciones de rol dentro de su institución.",
  "Individual publishers cannot create role assignments.":
    "Los editores no pueden crear asignaciones de rol.",
  "Institution operators can update existing institution operator, institution laboratory staff, institution doctor, and patient assignments inside their own institution. They cannot create a new role assignment directly.":
    "Los operarios de institución pueden actualizar asignaciones existentes de operario de institución, personal de laboratorio de institución, médico de institución y paciente dentro de su propia institución. No pueden crear una asignación de rol nueva directamente.",
  "They can maintain doctor and patient records for their institution while keeping role creation reserved for the institution administrator.":
    "Pueden mantener registros de médicos y pacientes de su institución, mientras la creación de roles queda reservada al administrador de la institución.",
  "Institution laboratory staff can enter the backoffice and work inside the permitted 2PQ surfaces for their institution.":
    "El personal de laboratorio de institución puede ingresar al backoffice y trabajar dentro de las superficies 2PQ permitidas para su institución.",
  "Can manage one individual publisher": "Puede gestionar un editor",
  "Individual publishers can work only with the feed_individuals record linked to their role assignment.":
    "Los editores trabajan sólo con el registro vinculado a su asignación de rol.",
  "Can publish for that individual": "Puede publicar desde ese perfil",
  "They can create, update, duplicate, and delete Discover feed entries only when the individual publisher matches their scope.":
    "Puede crear, actualizar, duplicar y eliminar entradas de Discover sólo cuando corresponden al editor de su alcance.",
  "They can read their institution, doctor roster, and patient records as context for laboratory workflows, without administering those records.":
    "Puede leer su institución, el listado de médicos y los registros de pacientes como contexto para los flujos de laboratorio, sin administrar esos registros.",
  "Institution laboratory staff can create 2PQ cases through the corresponding form and update existing case records inside their institution.":
    "El personal de laboratorio de institución puede crear casos 2PQ mediante el formulario correspondiente y actualizar registros de casos existentes dentro de su institución.",
  "Institution laboratory staff can create biopsy records through the biopsy form and update existing biopsy records inside their institution.":
    "El personal de laboratorio de institución puede crear registros de biopsias mediante el formulario de biopsias y actualizar registros de biopsias existentes dentro de su institución.",
  "Institution laboratory staff can create sequencing batches through the corresponding workflow and update existing batch records inside their institution.":
    "El personal de laboratorio de institución puede crear lotes de secuenciación mediante el flujo correspondiente y actualizar registros de lotes existentes dentro de su institución.",
  "Institution laboratory staff can create and update 2PQ report records inside their institution.":
    "El personal de laboratorio de institución puede crear y actualizar registros de reportes 2PQ dentro de su institución.",
  "They cannot create, update, or delete doctor or patient records from the administrative area model.":
    "No puede crear, actualizar ni eliminar registros de médicos o pacientes desde el modelo administrativo de áreas.",
  "They cannot pair role changes with doctor or patient maintenance for their institution.":
    "No puede combinar cambios de rol con mantenimiento de médicos o pacientes de su institución.",
  "They cannot review the list of emails attached to their institution or inspect how role assignments map to doctors and patients.":
    "No puede revisar la lista de emails asociados a su institución ni inspeccionar cómo las asignaciones de rol se mapean a médicos y pacientes.",
  "Institution operators can inspect the full 2PQ map, but every linked action stays inside one institution.":
    "Los operarios de institución pueden revisar todo el mapa 2PQ, pero cada acción vinculada permanece dentro de una institución.",
  "Institution operators can run case operations inside one institution boundary.":
    "Los operarios de institución pueden operar casos dentro del límite de una institución.",
  "Institution operators can run sample operations for their institution end to end.":
    "Los operarios de institución pueden gestionar operaciones de biopsias de punta a punta para su institución.",
  "Institution operators can coordinate run state for their institution but should not own platform cleanup globally.":
    "Los operarios de institución pueden coordinar el estado de corridas para su institución, pero no deben asumir limpieza global de plataforma.",
  "Institution operators can understand report state from 2PQ, but the live reports module stays full-admin only today.":
    "Los operarios de institución pueden entender el estado de reportes desde 2PQ, pero el módulo vivo de reportes sigue reservado a administradores totales.",
  "Institution operators can manage client-facing records inside their institution.":
    "Los operarios de institución pueden gestionar registros orientados a clientes dentro de su institución.",
  "Institution operators can edit only their own institution root.":
    "Los operarios de institución pueden editar solo la raíz de su propia institución.",
  "Institution operators can manage and delete doctors inside their institution.":
    "Los operarios de institución pueden gestionar y eliminar médicos dentro de su institución.",
  "Institution laboratory staff can inspect doctors inside their institution but cannot create, update, or delete doctor records.":
    "El personal de laboratorio de institución puede inspeccionar médicos dentro de su institución, pero no puede crear, actualizar ni eliminar registros médicos.",
  "Institution operators can CRUD patients inside their institution.":
    "Los operarios de institución pueden hacer CRUD de pacientes dentro de su institución.",
  "Institution laboratory staff can inspect patients inside their institution but cannot create, update, or delete patient records.":
    "El personal de laboratorio de institución puede inspeccionar pacientes dentro de su institución, pero no puede crear, actualizar ni eliminar registros de pacientes.",
  "Institution operators can create and edit local institution admin, institution operator, institution doctor, and patient roles inside their own scope.":
    "Los operarios de institución pueden crear y editar roles locales de administrador de institución, operario de institución, médico de institución y paciente dentro de su propio alcance.",
  "Institution admins can create and edit local institution admin, institution operator, institution laboratory staff, institution doctor, and patient roles inside their own scope.":
    "Los administradores de institución pueden crear y editar roles locales de administrador de institución, operario de institución, personal de laboratorio de institución, médico de institución y paciente dentro de su propio alcance.",
  "Institution operators can create and edit local institution operator, institution doctor, and patient roles inside their own scope, but cannot assign institution admin roles.":
    "Los operarios de institución pueden crear y editar roles locales de operario de institución, médico de institución y paciente dentro de su propio alcance, pero no pueden asignar roles de administrador de institución.",
  "Institution operators can create and edit local institution operator, institution laboratory staff, institution doctor, and patient roles inside their own scope, but cannot assign institution admin roles.":
    "Los operarios de institución pueden crear y editar roles locales de operario de institución, personal de laboratorio de institución, médico de institución y paciente dentro de su propio alcance, pero no pueden asignar roles de administrador de institución.",
  "Institution operators can update existing institution operator, institution laboratory staff, institution doctor, and patient assignments inside their own institution.":
    "Los operarios de institución pueden actualizar asignaciones existentes de operario de institución, personal de laboratorio de institución, médico de institución y paciente dentro de su propia institución.",
  "Institution operators can update existing local institution operator, institution laboratory staff, institution doctor, and patient roles inside their own scope, but new role assignments must be requested from the institution administrator.":
    "Los operarios de institución pueden actualizar roles locales existentes de operario de institución, personal de laboratorio de institución, médico de institución y paciente dentro de su propio alcance, pero las nuevas asignaciones de rol deben solicitarse al administrador de la institución.",
  "Institution laboratory staff cannot manage, staff, or inspect local role assignments.":
    "El personal de laboratorio de institución no puede gestionar, administrar equipo ni inspeccionar asignaciones locales de rol.",
  "Institution laboratory staff can operate permitted 2PQ workflows inside their institution, but cannot create, update, or inspect role assignments.":
    "El personal de laboratorio de institución puede operar los flujos 2PQ permitidos dentro de su institución, pero no puede crear, actualizar ni inspeccionar asignaciones de rol.",
  "Institution operators can fully manage records inside one institution boundary.":
    "Los operarios de institución pueden gestionar completamente registros dentro del límite de una institución.",
  "Institution laboratory staff can fully manage records inside one institution boundary.":
    "El personal de laboratorio de institución puede gestionar completamente registros dentro del límite de una institución.",
  "Institution doctors can use the backoffice only for their own doctor profile and the patients attached to that doctor id.":
    "Los médicos de institución solo pueden usar el backoffice para su propio perfil médico y los pacientes asociados a ese ID de médico.",
  "Institution managers cannot modify full-admin role assignments.":
    "Los managers de institución no pueden modificar asignaciones de administrador total.",
  "Institution operators cannot modify institution-admin role assignments.":
    "Los operarios de institución no pueden modificar asignaciones de administrador de institución.",
  "Institution laboratory staff cannot modify institution-admin role assignments.":
    "El personal de laboratorio de institución no puede modificar asignaciones de administrador de institución.",
  "Institution operator accounts cannot create, update, or promote users into the institution admin lane.":
    "Las cuentas de operario de institución no pueden crear, actualizar ni promover usuarios al carril de administrador de institución.",
  "Institution laboratory staff accounts cannot create, update, or promote users into the institution admin lane.":
    "Las cuentas de personal de laboratorio de institución no pueden crear, actualizar ni promover usuarios al carril de administrador de institución.",
  "Institution-scoped control over one institution, its doctors, its patients, and local role assignments.":
    "Control con alcance institucional sobre una institución, sus médicos, sus pacientes y sus asignaciones locales de rol.",
  "Institution-scoped operations over one institution, its doctors, its patients, and local role assignments.":
    "Operación con alcance institucional sobre una institución, sus médicos, sus pacientes y sus asignaciones locales de rol.",
  "Institution-scoped administrative operations over one institution, its doctors, its patients, and existing local role assignments.":
    "Operación administrativa con alcance institucional sobre una institución, sus médicos, sus pacientes y sus asignaciones locales de rol existentes.",
  "Institution-scoped laboratory operations over one institution without local role administration.":
    "Operación de laboratorio con alcance institucional sobre una institución sin administración local de roles.",
  "Institution-scoped laboratory operations over one institution. It includes 2PQ operational work, but not local role administration.":
    "Operación de laboratorio con alcance institucional sobre una institución. Incluye trabajo operativo 2PQ, pero no administración local de roles.",
  "Institution laboratory staff cannot modify role assignments.":
    "El personal de laboratorio de institución no puede modificar asignaciones de rol.",
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
  "They can pair role changes with doctor and patient maintenance for the institution they operate.":
    "Pueden combinar cambios de rol con mantenimiento de médicos y pacientes de la institución que operan.",
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
  "Can use the permitted 2PQ backoffice surfaces for their institution, but cannot create, update, or inspect role assignments.":
    "Puede usar las superficies permitidas del backoffice 2PQ para su institución, pero no puede crear, actualizar ni inspeccionar asignaciones de rol.",
  "Patients do not use the backoffice. Their role assignment only anchors patient-specific boundaries.":
    "Los pacientes no usan el backoffice. Su asignación de rol solo fija límites específicos de paciente.",
  "This role cannot use this specific backoffice surface, even if it can access other permitted areas.":
    "Este rol no puede usar esta superficie específica del backoffice, aunque pueda acceder a otras áreas permitidas.",
  "When a scope link changes, they can follow through into the institution, doctor, or patient surfaces that support that assignment.":
    "Cuando cambia un vínculo de alcance, pueden continuar hacia las superficies de institución, médico o paciente que respaldan esa asignación.",
  "Pocket Genes Admin operations console.":
    "Consola operativa de administración Pocket Genes.",
};

export function appText(language: AppLanguage, text: string): string {
  return language === "es" ? (SPANISH_TEXT[text] ?? text) : text;
}
