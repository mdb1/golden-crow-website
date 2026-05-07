const state = {
  data: null,
  listener: { observations: [] },
  view: "overview",
  query: "",
  activeTable: "daily_business_metrics",
  eventCategory: "all",
  expanded: new Set()
};

const $ = (selector) => document.querySelector(selector);
const content = $("#content");
const title = $("#pageTitle");

const accents = ["#c9982a", "#117f77", "#436ea9", "#c8634b", "#3c7f4c"];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function matches(text) {
  if (!state.query) return true;
  return String(text ?? "").toLowerCase().includes(state.query.toLowerCase());
}

function hash(value) {
  let h = 0;
  const text = String(value ?? "");
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function keyFor(kind, value) {
  return `${kind}-${hash(value)}`;
}

function truncated(text, limit) {
  const clean = cleanText(text);
  if (clean.length <= limit) return clean;
  const slice = clean.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 80 ? lastSpace : limit).trim()}...`;
}

function expandableText(text, key, limit = 210, extraClass = "") {
  const clean = cleanText(text || "Not recorded.");
  const expanded = state.expanded.has(key);
  const body = expanded ? clean : truncated(clean, limit);
  const button = clean.length > limit
    ? `<button type="button" class="text-link" data-expand-key="${esc(key)}">${expanded ? "Show less" : "Show more"}</button>`
    : "";
  return `<div class="card-flow"><p class="copy ${extraClass}">${esc(body)}</p>${button}</div>`;
}

function scoreClass(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "warn";
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

function statusClass(value) {
  const text = String(value || "").toLowerCase();
  if (/healthy|completed|ready|sent|synced|yes|success/.test(text)) return "good";
  if (/failed|blocked|missing|error|bad|no/.test(text)) return "bad";
  return "warn";
}

function normalizeActor(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function employees() {
  return state.data?.employees || [];
}

function actorEmployee(actor) {
  const actorNorm = normalizeActor(actor);
  return employees().find((employee) => {
    const folder = normalizeActor(employee.folder);
    const displayRole = normalizeActor(`${employee.display_name} - ${employee.role}`);
    const display = normalizeActor(employee.display_name);
    return actorNorm === folder || actorNorm === displayRole || actorNorm === display || actorNorm.includes(folder) || folder.includes(actorNorm);
  });
}

function initials(value) {
  const words = cleanText(value).split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0] || "").join("").toUpperCase() || "GC";
}

function avatar(actor, className = "event-avatar") {
  const employee = actorEmployee(actor);
  const label = employee ? employee.display_name : actor || "Golden Crow";
  if (employee?.portrait) {
    return `<img class="${className}" src="${esc(employee.portrait)}" alt="${esc(label)} portrait">`;
  }
  return `<div class="${className} avatar-fallback" aria-label="${esc(label)}">${esc(initials(label))}</div>`;
}

function metricCard(label, value, index = 0) {
  return `
    <article class="metric-card fade-in" style="--accent: ${accents[index % accents.length]}">
      <div class="label">${esc(label)}</div>
      <div class="value">${esc(value)}</div>
    </article>
  `;
}

function navButton(label, view, className = "tool-button") {
  return `<button type="button" class="${className}" data-view-target="${esc(view)}">${esc(label)}</button>`;
}

function searchButton(label, view, query, className = "tool-button") {
  return `<button type="button" class="${className}" data-search-view="${esc(view)}" data-search-query="${esc(query)}">${esc(label)}</button>`;
}

async function loadData() {
  const response = await fetch(`data.json?ts=${Date.now()}`);
  state.data = await response.json();
  try {
    const listenerResponse = await fetch(`live_observer.json?ts=${Date.now()}`);
    state.listener = await listenerResponse.json();
  } catch (_) {
    state.listener = { observations: [] };
  }
  $("#generatedAt").textContent = `Updated ${state.data.generated_at}`;
  render();
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  render();
}

function pageIntro(copy) {
  return `<p>${esc(copy)}</p>`;
}

function renderOverview() {
  const m = state.data.metrics;
  const openTickets = state.data.tables.tickets?.rows?.filter((row) => row.status !== "closed") || [];
  const topEmployees = employees().slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 5);
  title.textContent = "Overview";
  content.innerHTML = `
    <section class="overview-hero fade-in">
      <div class="hero-copy">
        <p class="eyebrow">Botfarm command view</p>
        <h3>Daily operating signal, organized for decisions.</h3>
        <p>Generated from employee folders, company database tables, ads_shared artifacts, live observations, tickets, and Emma's report files.</p>
      </div>
      <div class="hero-panel">
        <span>Current run</span>
        <strong>${esc(state.data.run_id || "manual dashboard")}</strong>
        <span>${esc(state.data.generated_at || "generation time unavailable")}</span>
        <div class="button-row">
          ${navButton("Events", "events")}
          ${navButton("Tickets", "tickets")}
        </div>
      </div>
    </section>

    <div class="grid metric-grid">
      ${metricCard("Employees", m.employees, 0)}
      ${metricCard("Qualified leads", m.qualified_leads, 1)}
      ${metricCard("Open tickets", m.open_tickets, 2)}
      ${metricCard("Meta spend", m.meta_spend, 3)}
      ${metricCard("Revenue USD", m.revenue, 4)}
      ${metricCard("Resource warning", m.resource_warning, 5)}
    </div>

    <section class="section">
      <div class="section-title">
        <div>
          <h3>Priority Cards</h3>
          ${pageIntro("The top operational surfaces are separated into cards instead of raw table dumps.")}
        </div>
        ${navButton("Open all tickets", "tickets")}
      </div>
      <div class="grid focus-grid">
        ${ticketCards(openTickets.slice(0, 3))}
      </div>
    </section>

    <section class="section">
      <div class="section-title">
        <div>
          <h3>Ads Cycle</h3>
          ${pageIntro("Olivia text, Nora design directives, and Sam final output are shown as distinct handoff stages.")}
        </div>
        ${navButton("Open ads cycle", "ads")}
      </div>
      <div class="grid artifact-grid">
        ${adsArtifactCard("text_content", "Olivia Text", 0)}
        ${adsArtifactCard("visual_design_directives", "Nora Design", 1)}
        ${adsArtifactCard("final_ad_output", "Sam Output", 2)}
      </div>
    </section>

    <section class="section">
      <div class="section-title">
        <div>
          <h3>Top Employees</h3>
          ${pageIntro("A compact view of the strongest current employee signals.")}
        </div>
        ${navButton("All employees", "employees")}
      </div>
      <div class="grid employee-grid">
        ${topEmployees.map(employeeCard).join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-title">
        <div>
          <h3>Recent Activity</h3>
          ${pageIntro("Events include employee portraits so the feed is easier to scan.")}
        </div>
        ${navButton("Open event feed", "events")}
      </div>
      ${eventList(state.data.events.slice(0, 6), "overview-event")}
    </section>
  `;
}

function scoreBadge(employee) {
  return `<span class="badge ${scoreClass(employee.score)}">score ${esc(employee.score || "unknown")}</span>`;
}

function employeeCard(employee) {
  const keyBase = employee.folder || employee.display_name;
  const missionKey = keyFor("mission", keyBase);
  const problemsKey = keyFor("problems", keyBase);
  const nextKey = keyFor("next", keyBase);
  const history = (employee.recent_history || []).slice(0, 3).map((event) => (
    `<li>${esc(event.time)} - ${esc(event.title)}</li>`
  )).join("");

  return `
    <article class="card employee-card fade-in">
      <div class="employee-head">
        ${employee.portrait ? `<img class="portrait" src="${esc(employee.portrait)}" alt="${esc(employee.display_name)} portrait">` : avatar(employee.display_name, "portrait")}
        <div>
          <h3>${esc(employee.display_name)}</h3>
          <div class="role">${esc(employee.role)}</div>
          <div class="badges">
            ${scoreBadge(employee)}
            <span class="badge ${statusClass(employee.performance_state)}">${esc(employee.performance_state || "unknown")}</span>
            <span class="badge ${statusClass(employee.goals_achieved)}">goals ${esc(employee.goals_achieved || "unknown")}</span>
          </div>
        </div>
      </div>
      <div class="field-stack">
        <div class="field">
          <span class="field-label">Mission</span>
          ${expandableText(employee.mission, missionKey, 150)}
        </div>
        <div class="field">
          <span class="field-label">Difficulties</span>
          ${expandableText(employee.problems || employee.lows || "None recorded.", problemsKey, 130, employee.problems ? "" : "muted")}
        </div>
        <div class="field">
          <span class="field-label">Next</span>
          ${expandableText(employee.next_action || "Not recorded.", nextKey, 130)}
        </div>
      </div>
      <ul class="mini-list">${history || "<li>No recent history found.</li>"}</ul>
      <div class="button-row">
        ${searchButton("View activity", "events", employee.folder || employee.display_name)}
        ${searchButton("Search data", "database", employee.display_name)}
      </div>
    </article>
  `;
}

function renderEmployees() {
  title.textContent = "Employees";
  const rows = employees().filter((employee) => matches(`${employee.display_name} ${employee.role} ${employee.mission} ${employee.problems} ${employee.next_action}`));
  content.innerHTML = `
    <section class="section">
      <div class="section-title">
        <div>
          <h3>${rows.length} Employee Profiles</h3>
          ${pageIntro("Each profile keeps the summary visible first and hides long context behind Show more.")}
        </div>
        ${navButton("Recent events", "events")}
      </div>
      <div class="grid employee-grid">
        ${rows.map(employeeCard).join("") || `<div class="empty">No employees matched.</div>`}
      </div>
    </section>
  `;
}

function tableTabs() {
  return Object.keys(state.data.tables).map((name) => (
    `<button type="button" class="${state.activeTable === name ? "active" : ""}" data-table-target="${esc(name)}">${esc(name)}</button>`
  )).join("");
}

function csvDownload(tableName) {
  const table = state.data.tables[tableName];
  const rows = table.rows || [];
  const fields = table.fields || [];
  const csv = [fields.join(",")].concat(rows.map((row) => fields.map((field) => `"${String(row[field] ?? "").replace(/"/g, '""')}"`).join(","))).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${tableName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderTable(tableName, maxRows = 250) {
  const table = state.data.tables[tableName];
  if (!table) return `<div class="empty">Missing table.</div>`;
  const fields = table.fields || [];
  const rows = (table.rows || []).filter((row) => matches(Object.values(row).join(" "))).slice(0, maxRows);
  if (!fields.length) return `<div class="empty">No fields found.</div>`;
  return `
    <section class="section">
      <div class="section-title">
        <div>
          <h3>${esc(tableName)}</h3>
          ${pageIntro(`${rows.length} visible rows from ${table.path || "company database"}.`)}
        </div>
        <button type="button" class="tool-button" data-csv-target="${esc(tableName)}">Export CSV</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${fields.map((field) => `<th>${esc(field)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${fields.map((field) => `<td>${esc(row[field])}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDatabase() {
  title.textContent = "Company Database";
  content.innerHTML = `<div class="tabs">${tableTabs()}</div>${renderTable(state.activeTable)}`;
}

function adsArtifactCard(key, label, index = 0) {
  const artifact = state.data.ads_shared?.latest?.[key] || {};
  const ok = artifact.exists === "yes";
  const bodyKey = keyFor("ads-artifact", `${key}-${artifact.path || ""}`);
  return `
    <article class="artifact-card fade-in" style="--accent: ${accents[index % accents.length]}">
      <div class="section-title">
        <h3>${esc(label)}</h3>
        <span class="badge ${ok ? "good" : "bad"}">${ok ? "ready" : "missing"}</span>
      </div>
      <div class="path">${esc(artifact.path || "ads_shared")}</div>
      ${expandableText(artifact.summary || artifact.body || "No artifact found.", bodyKey, 180)}
    </article>
  `;
}

function artifactBody(label, artifact, key) {
  const expanded = state.expanded.has(key);
  const body = artifact?.body || `Missing ${label}.`;
  const tooLong = cleanText(body).length > 900;
  return `
    <article class="section-card">
      <div class="section-title">
        <h3>${esc(label)}</h3>
        <span class="badge ${statusClass(artifact?.exists)}">${esc(artifact?.exists || "missing")}</span>
      </div>
      <div class="path">${esc(artifact?.path || "ads_shared")}</div>
      <pre class="code-box ${expanded ? "" : "is-collapsed"}">${esc(body)}</pre>
      ${tooLong ? `<button type="button" class="text-link" data-expand-key="${esc(key)}">${expanded ? "Show less" : "Show more"}</button>` : ""}
    </article>
  `;
}

function renderAdsCycle() {
  title.textContent = "Ads Cycle";
  const ads = state.data.ads_shared || {};
  const rows = (ads.cycle_index || []).filter((row) => matches(Object.values(row).join(" "))).slice().reverse();
  const recent = (ads.recent_files || []).filter((row) => matches(`${row.stage} ${row.path} ${row.summary}`));
  content.innerHTML = `
    <section class="section">
      <div class="section-title">
        <div>
          <h3>Canonical Handoff</h3>
          ${pageIntro("The daily ads workflow is split by owner so it is clear what came from Olivia, Nora, and Sam.")}
        </div>
      </div>
      <div class="grid artifact-grid">
        ${adsArtifactCard("text_content", "Olivia Text Content", 0)}
        ${adsArtifactCard("visual_design_directives", "Nora Design Directives", 1)}
        ${adsArtifactCard("final_ad_output", "Sam Final Output", 2)}
      </div>
    </section>

    <section class="section">
      <div class="section-title">
        <div>
          <h3>Latest Files</h3>
          ${pageIntro("Long files stay readable inside expandable cards.")}
        </div>
      </div>
      <div class="grid artifact-grid">
        ${artifactBody("Olivia Text", ads.latest?.text_content, keyFor("ads-body", "olivia"))}
        ${artifactBody("Nora DESIGN_AI_DIRECTIVES", ads.latest?.visual_design_directives, keyFor("ads-body", "nora"))}
        ${artifactBody("Sam Final Ad Output", ads.latest?.final_ad_output, keyFor("ads-body", "sam"))}
      </div>
    </section>

    <section class="section">
      <div class="section-title">
        <div>
          <h3>Cycle Index</h3>
          ${pageIntro(ads.root || "ads_shared")}
        </div>
      </div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Run</th><th>Stage</th><th>Owner</th><th>Status</th><th>Next action</th><th>Artifact</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.date)}</td><td>${esc(row.run_id)}</td><td>${esc(row.stage)}</td><td>${esc(row.owner)}</td><td>${esc(row.status)}</td><td>${esc(row.next_action)}</td><td>${esc(row.primary_artifact)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No ads_shared cycle rows yet.</div>`}
    </section>

    <section class="section">
      <div class="section-title">
        <div>
          <h3>Recent Ads Files</h3>
          ${pageIntro("Recent shared artifacts rendered as a compact activity feed.")}
        </div>
      </div>
      ${eventList(recent.map((row) => ({
        time: row.time,
        category: row.stage,
        actor: "ads_shared",
        title: row.path,
        snippet: row.summary,
        path: row.path
      })), "ads-file")}
    </section>
  `;
}

function eventFilters() {
  const cats = ["all", ...new Set(state.data.events.map((event) => event.category))].sort();
  return cats.map((cat) => (
    `<button type="button" class="${state.eventCategory === cat ? "active" : ""}" data-event-category="${esc(cat)}">${esc(cat)}</button>`
  )).join("");
}

function eventList(rows, prefix = "event") {
  if (!rows.length) return `<div class="empty">No events matched.</div>`;
  return `
    <div class="timeline">
      ${rows.map((event, index) => eventCard(event, keyFor(prefix, `${event.time}-${event.actor}-${event.path}-${index}`), index)).join("")}
    </div>
  `;
}

function eventCard(event, key, index) {
  const actor = event.actor || "Golden Crow";
  const expanded = state.expanded.has(key);
  const snippet = cleanText(event.snippet || event.summary || "No summary recorded.");
  const tooLong = snippet.length > 220;
  return `
    <article class="event fade-in" style="--accent: ${accents[index % accents.length]}">
      <div class="event-rail">
        ${avatar(actor)}
        <span class="event-dot"></span>
      </div>
      <div class="event-meta">
        <strong>${esc(actor)}</strong>
        <span class="badge ${statusClass(event.category || event.status)}">${esc(event.category || event.status || "activity")}</span>
        <time>${esc(event.time || event.observed_at || "")}</time>
      </div>
      <div class="event-main">
        <h4>${esc(event.title || `${event.category || event.status} update`)}</h4>
        <p class="copy">${esc(expanded ? snippet : truncated(snippet, 220))}</p>
        ${tooLong ? `<button type="button" class="text-link" data-expand-key="${esc(key)}">${expanded ? "Show less" : "Show more"}</button>` : ""}
        <div class="path">${esc(event.path || "")}</div>
        ${actorEmployee(actor) ? `<div class="button-row">${searchButton("Employee profile", "employees", actorEmployee(actor).display_name)}</div>` : ""}
      </div>
    </article>
  `;
}

function renderEvents() {
  title.textContent = "Events";
  const rows = state.data.events.filter((event) => (
    (state.eventCategory === "all" || event.category === state.eventCategory) &&
    matches(`${event.actor} ${event.category} ${event.title} ${event.snippet} ${event.path}`)
  ));
  content.innerHTML = `
    <section class="section">
      <div class="section-title">
        <div>
          <h3>${rows.length} Events</h3>
          ${pageIntro("A portrait-led activity feed for faster scanning.")}
        </div>
      </div>
      <div class="tabs">${eventFilters()}</div>
      ${eventList(rows, "event")}
    </section>
  `;
}

function listenerList(limit = 80) {
  const rows = (state.listener.observations || [])
    .filter((row) => matches(`${row.actor} ${row.category} ${row.status} ${row.path} ${row.summary}`))
    .slice(0, limit)
    .map((row) => ({
      time: row.observed_at,
      category: row.status,
      actor: row.actor,
      title: `${row.category} - ${row.path}`,
      snippet: row.summary,
      path: row.path
    }));
  return eventList(rows, "listener");
}

function renderListener() {
  title.textContent = "Live Listener";
  content.innerHTML = `
    <section class="section">
      <div class="section-title">
        <div>
          <h3>${(state.listener.observations || []).length} Recent Observations</h3>
          ${pageIntro(state.listener.generated_at || "Pending listener timestamp.")}
        </div>
      </div>
      ${listenerList(120)}
    </section>
  `;
}

function renderEmails() {
  title.textContent = "Emma Emails";
  const rows = state.data.emails.filter((email) => matches(`${email.subject} ${email.body} ${email.path}`));
  content.innerHTML = `
    <section class="section">
      <div class="section-title">
        <div>
          <h3>${rows.length} Email Files</h3>
          ${pageIntro("Email bodies are collapsed by default so the page stays navigable.")}
        </div>
      </div>
      <div class="grid">
        ${rows.map((email, index) => emailCard(email, index)).join("") || `<div class="empty">No emails matched.</div>`}
      </div>
    </section>
  `;
}

function emailCard(email, index) {
  const key = keyFor("email", `${email.path}-${index}`);
  const expanded = state.expanded.has(key);
  const body = email.body || "No email body found.";
  return `
    <article class="email-card fade-in">
      <div class="section-title">
        <h3>${esc(email.subject || "Untitled email")}</h3>
        <span class="badge">${esc(email.time || "unknown time")}</span>
      </div>
      <div class="path">${esc(email.path || "")}</div>
      <pre class="${expanded ? "" : "is-collapsed"}">${esc(body)}</pre>
      ${cleanText(body).length > 600 ? `<button type="button" class="text-link" data-expand-key="${esc(key)}">${expanded ? "Show less" : "Show more"}</button>` : ""}
    </article>
  `;
}

function ticketCards(rows) {
  if (!rows.length) return `<div class="empty">No tickets found.</div>`;
  return rows.map((row, index) => {
    const key = keyFor("ticket", `${row.id || ""}-${row.title || ""}-${index}`);
    return `
      <article class="ticket-card fade-in">
        <div class="section-title">
          <h3>${esc(row.title || "Untitled ticket")}</h3>
          <span class="badge ${statusClass(row.priority)}">${esc(row.priority || "priority")}</span>
        </div>
        <div class="badges">
          <span class="badge ${statusClass(row.status)}">${esc(row.status || "unknown")}</span>
          <span class="badge">${esc(row.owner_employee || "unowned")}</span>
        </div>
        <div class="field">
          <span class="field-label">Next action</span>
          ${expandableText(row.next_action || "Not recorded.", key, 170)}
        </div>
        ${row.owner_employee ? searchButton("Owner profile", "employees", row.owner_employee) : ""}
      </article>
    `;
  }).join("");
}

function ticketList(rows) {
  if (!rows.length) return `<div class="empty">No tickets found.</div>`;
  return `
    <div class="grid focus-grid">
      ${ticketCards(rows)}
    </div>
  `;
}

function renderTickets() {
  title.textContent = "Tickets";
  const rows = (state.data.tables.tickets?.rows || []).filter((row) => matches(Object.values(row).join(" ")));
  content.innerHTML = `
    <section class="section">
      <div class="section-title">
        <div>
          <h3>${rows.length} Tickets</h3>
          ${pageIntro("Open work shown as action cards instead of a flat row dump.")}
        </div>
        ${navButton("Company database", "database")}
      </div>
      ${ticketList(rows)}
    </section>
  `;
}

function renderOperations() {
  title.textContent = "Operations";
  content.innerHTML = `
    <section class="section">
      <div class="section-title">
        <div>
          <h3>Runtime Surface</h3>
          ${pageIntro("Cron and raw payload access remain available, but isolated from the primary operating views.")}
        </div>
      </div>
      <div class="split">
        <article class="section-card">
          <div class="section-title"><h3>Crontab</h3><span class="badge">macOS</span></div>
          <pre class="code-box">${esc(state.data.crontab || "not available")}</pre>
        </article>
        <article class="section-card">
          <div class="section-title"><h3>Data Tools</h3></div>
          <div class="field">
            <span class="field-label">Source path</span>
            <p class="copy">${esc(state.data.root)}</p>
          </div>
          <button type="button" class="tool-button" data-copy-json="1">Copy current JSON</button>
        </article>
      </div>
    </section>
  `;
}

function render() {
  if (!state.data) return;
  const map = {
    overview: renderOverview,
    employees: renderEmployees,
    database: renderDatabase,
    ads: renderAdsCycle,
    events: renderEvents,
    listener: renderListener,
    emails: renderEmails,
    tickets: renderTickets,
    operations: renderOperations
  };
  (map[state.view] || renderOverview)();
}

document.querySelectorAll(".nav button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

$("#globalSearch").addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

$("#reloadData").addEventListener("click", loadData);

$("#downloadJson").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "golden-crow-dashboard-data.json";
  a.click();
  URL.revokeObjectURL(url);
});

content.addEventListener("click", (event) => {
  const expand = event.target.closest("[data-expand-key]");
  if (expand) {
    const key = expand.dataset.expandKey;
    if (state.expanded.has(key)) state.expanded.delete(key);
    else state.expanded.add(key);
    render();
    return;
  }

  const nav = event.target.closest("[data-view-target]");
  if (nav) {
    setView(nav.dataset.viewTarget);
    return;
  }

  const searchNav = event.target.closest("[data-search-view]");
  if (searchNav) {
    state.query = searchNav.dataset.searchQuery || "";
    $("#globalSearch").value = state.query;
    setView(searchNav.dataset.searchView);
    return;
  }

  const table = event.target.closest("[data-table-target]");
  if (table) {
    state.activeTable = table.dataset.tableTarget;
    renderDatabase();
    return;
  }

  const category = event.target.closest("[data-event-category]");
  if (category) {
    state.eventCategory = category.dataset.eventCategory;
    renderEvents();
    return;
  }

  const csv = event.target.closest("[data-csv-target]");
  if (csv) {
    csvDownload(csv.dataset.csvTarget);
    return;
  }

  const copyJson = event.target.closest("[data-copy-json]");
  if (copyJson && navigator.clipboard) {
    navigator.clipboard.writeText(JSON.stringify(state.data, null, 2));
  }
});

loadData().catch((error) => {
  content.innerHTML = `<div class="empty">Could not load dashboard data: ${esc(error.message)}</div>`;
});
