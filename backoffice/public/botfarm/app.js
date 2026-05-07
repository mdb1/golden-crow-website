
const state = {
  data: null,
  listener: { observations: [] },
  view: "overview",
  query: "",
  activeTable: "daily_business_metrics",
  eventCategory: "all"
};

const $ = (selector) => document.querySelector(selector);
const content = $("#content");
const title = $("#pageTitle");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function matches(text) {
  if (!state.query) return true;
  return String(text ?? "").toLowerCase().includes(state.query.toLowerCase());
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
  document.querySelectorAll(".nav button").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  render();
}

function metricCard(label, value, cls = "") {
  return `<div class="card metric ${cls}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;
}

function adsArtifactCard(key, label) {
  const artifact = state.data.ads_shared?.latest?.[key] || {};
  const ok = artifact.exists === "yes";
  return `
    <article class="card">
      <div class="section-title"><h3>${esc(label)}</h3><span class="badge ${ok ? "good" : "bad"}">${ok ? "ready" : "missing"}</span></div>
      <p class="eyebrow">${esc(artifact.path || "ads_shared")}</p>
      <p>${esc(artifact.summary || "No artifact found.")}</p>
    </article>
  `;
}

function renderOverview() {
  const m = state.data.metrics;
  title.textContent = "Overview";
  content.innerHTML = `
    <div class="grid metric-grid">
      ${metricCard("Employees", m.employees)}
      ${metricCard("Pipeline rows", m.pipeline_rows)}
      ${metricCard("Open tickets", m.open_tickets)}
      ${metricCard("Qualified leads", m.qualified_leads)}
      ${metricCard("Revenue USD", m.revenue)}
      ${metricCard("Resource warning", m.resource_warning)}
    </div>
    <div class="split">
      <section class="panel card">
        <div class="section-title"><h3>Business Funnel</h3><span class="badge">Today</span></div>
        <div class="grid metric-grid">
          ${metricCard("Outreach sent", m.outreach_sent)}
          ${metricCard("Replies", m.replies)}
          ${metricCard("Meetings", m.meetings)}
          ${metricCard("Clients closed", m.clients_closed)}
          ${metricCard("Meta spend", m.meta_spend)}
          ${metricCard("Improvement bench", m.improvement_bench)}
        </div>
      </section>
      <section class="panel card">
        <div class="section-title"><h3>What Needs Attention</h3><button class="tool-button" onclick="setView('tickets')">Open tickets</button></div>
        ${ticketList(state.data.tables.tickets?.rows?.slice(0, 5) || [])}
      </section>
    </div>
    <section>
      <div class="section-title"><h3>Ads Daily Cycle</h3><button class="tool-button" onclick="setView('ads')">Open ads cycle</button></div>
      <div class="grid employee-grid">
        ${adsArtifactCard("text_content", "Olivia Text")}
        ${adsArtifactCard("visual_design_directives", "Nora Design")}
        ${adsArtifactCard("final_ad_output", "Sam Final Output")}
      </div>
    </section>
    <section>
      <div class="section-title"><h3>Live Listener</h3><button class="tool-button" onclick="setView('listener')">Open feed</button></div>
      ${listenerList(5)}
    </section>
    <section>
      <div class="section-title"><h3>Top Employee Snapshot</h3><button class="tool-button" onclick="setView('employees')">All employees</button></div>
      <div class="grid employee-grid">
        ${state.data.employees.slice().sort((a,b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 6).map(employeeCard).join("")}
      </div>
    </section>
  `;
}

function scoreBadge(employee) {
  const score = Number(employee.score);
  const cls = Number.isFinite(score) ? (score >= 80 ? "good" : score >= 50 ? "warn" : "bad") : "warn";
  return `<span class="badge ${cls}">score ${esc(employee.score)}</span>`;
}

function employeeCard(employee) {
  const history = (employee.recent_history || []).slice(0, 3).map(event => `<li>${esc(event.time)} - ${esc(event.title)}</li>`).join("");
  return `
    <article class="card employee-card">
      <div class="employee-head">
        ${employee.portrait ? `<img class="portrait" src="${esc(employee.portrait)}" alt="${esc(employee.display_name)} portrait">` : `<div class="portrait"></div>`}
        <div>
          <h3>${esc(employee.display_name)}</h3>
          <div class="role">${esc(employee.role)}</div>
          <div class="badges">
            ${scoreBadge(employee)}
            <span class="badge">${esc(employee.performance_state || "unknown")}</span>
            <span class="badge">${esc(employee.goals_achieved || "unknown")}</span>
          </div>
        </div>
      </div>
      <div class="employee-body">
        <strong>Mission:</strong> ${esc(employee.mission || "not recorded")}
        <br><strong>Difficulties:</strong> ${esc(employee.problems || employee.lows || "none recorded")}
        <br><strong>Next:</strong> ${esc(employee.next_action || "not recorded")}
        <ul class="mini-list">${history || "<li>No recent history found.</li>"}</ul>
      </div>
    </article>
  `;
}

function renderEmployees() {
  title.textContent = "Employees";
  const employees = state.data.employees.filter(e => matches(`${e.display_name} ${e.role} ${e.mission} ${e.problems} ${e.next_action}`));
  content.innerHTML = `
    <div class="section-title"><h3>${employees.length} employee profiles</h3><span class="badge">Riley + Clara + company database</span></div>
    <div class="grid employee-grid">${employees.map(employeeCard).join("") || `<div class="empty">No employees matched.</div>`}</div>
  `;
}

function tableTabs() {
  return Object.keys(state.data.tables).map(name => `<button class="${state.activeTable === name ? "active" : ""}" onclick="state.activeTable='${name}'; renderDatabase();">${esc(name)}</button>`).join("");
}

function csvDownload(tableName) {
  const table = state.data.tables[tableName];
  const rows = table.rows || [];
  const fields = table.fields || [];
  const csv = [fields.join(",")].concat(rows.map(row => fields.map(field => `"${String(row[field] ?? "").replace(/"/g, '""')}"`).join(","))).join("\n");
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
  const rows = (table.rows || []).filter(row => matches(Object.values(row).join(" "))).slice(0, maxRows);
  if (!fields.length) return `<div class="empty">No fields found.</div>`;
  return `
    <div class="section-title">
      <h3>${esc(tableName)}</h3>
      <button class="tool-button" onclick="csvDownload('${tableName}')">Export CSV</button>
    </div>
    <p class="eyebrow">${esc(table.path)} - ${rows.length} visible rows</p>
    <div class="table-wrap">
      <table>
        <thead><tr>${fields.map(field => `<th>${esc(field)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(row => `<tr>${fields.map(field => `<td>${esc(row[field])}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderDatabase() {
  title.textContent = "Company Database";
  content.innerHTML = `<div class="tabs">${tableTabs()}</div>${renderTable(state.activeTable)}`;
}

function renderAdsCycle() {
  title.textContent = "Ads Cycle";
  const ads = state.data.ads_shared || {};
  const rows = (ads.cycle_index || []).filter(row => matches(Object.values(row).join(" "))).slice().reverse();
  const recent = (ads.recent_files || []).filter(row => matches(`${row.stage} ${row.path} ${row.summary}`));
  content.innerHTML = `
    <div class="grid employee-grid">
      ${adsArtifactCard("text_content", "Olivia Text Content")}
      ${adsArtifactCard("visual_design_directives", "Nora DESIGN_AI_DIRECTIVES")}
      ${adsArtifactCard("final_ad_output", "Sam Final Ad Output")}
    </div>
    <section class="card">
      <div class="section-title"><h3>Cycle Index</h3><span class="badge">${esc(ads.root || "ads_shared")}</span></div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Run</th><th>Stage</th><th>Owner</th><th>Status</th><th>Next action</th><th>Artifact</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.date)}</td><td>${esc(row.run_id)}</td><td>${esc(row.stage)}</td><td>${esc(row.owner)}</td><td>${esc(row.status)}</td><td>${esc(row.next_action)}</td><td>${esc(row.primary_artifact)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No ads_shared cycle rows yet.</div>`}
    </section>
    <section class="card">
      <div class="section-title"><h3>Latest Canonical Files</h3><span class="badge">read-only</span></div>
      <div class="split">
        <pre class="code-box">${esc(ads.latest?.text_content?.body || "Missing Olivia text content.")}</pre>
        <pre class="code-box">${esc(ads.latest?.visual_design_directives?.body || "Missing Nora design directives.")}</pre>
      </div>
      <pre class="code-box">${esc(ads.latest?.final_ad_output?.body || "Missing Sam final ad output.")}</pre>
    </section>
    <section>
      <div class="section-title"><h3>Recent Ads Shared Files</h3></div>
      <div class="timeline">
        ${recent.map(row => `<article class="event"><div><div class="time">${esc(row.time)}</div><div class="category">${esc(row.stage)}</div></div><div class="actor">ads_shared</div><div><h4>${esc(row.path)}</h4><p>${esc(row.summary)}</p></div></article>`).join("") || `<div class="empty">No recent ads_shared files.</div>`}
      </div>
    </section>
  `;
}

function eventFilters() {
  const cats = ["all", ...new Set(state.data.events.map(event => event.category))].sort();
  return cats.map(cat => `<button class="${state.eventCategory === cat ? "active" : ""}" onclick="state.eventCategory='${cat}'; renderEvents();">${esc(cat)}</button>`).join("");
}

function renderEvents() {
  title.textContent = "Events";
  const events = state.data.events.filter(event => (state.eventCategory === "all" || event.category === state.eventCategory) && matches(`${event.actor} ${event.category} ${event.title} ${event.snippet}`));
  content.innerHTML = `
    <div class="tabs">${eventFilters()}</div>
    <div class="timeline">
      ${events.map(event => `
        <article class="event">
          <div><div class="time">${esc(event.time)}</div><div class="category">${esc(event.category)}</div></div>
          <div class="actor">${esc(event.actor)}</div>
          <div><h4>${esc(event.title)}</h4><p>${esc(event.snippet)}</p><p class="eyebrow">${esc(event.path)}</p></div>
        </article>
      `).join("") || `<div class="empty">No events matched.</div>`}
    </div>
  `;
}

function listenerList(limit = 80) {
  const rows = (state.listener.observations || []).filter(row => matches(`${row.actor} ${row.category} ${row.status} ${row.path} ${row.summary}`)).slice(0, limit);
  return `
    <div class="timeline">
      ${rows.map(row => `
        <article class="event">
          <div><div class="time">${esc(row.observed_at)}</div><div class="category">${esc(row.status)}</div></div>
          <div class="actor">${esc(row.actor)}</div>
          <div><h4>${esc(row.category)} - ${esc(row.path)}</h4><p>${esc(row.summary)}</p></div>
        </article>
      `).join("") || `<div class="empty">No live observations yet.</div>`}
    </div>
  `;
}

function renderListener() {
  title.textContent = "Live Listener";
  content.innerHTML = `
    <div class="section-title"><h3>${(state.listener.observations || []).length} recent observations</h3><span class="badge">${esc(state.listener.generated_at || "pending")}</span></div>
    ${listenerList(120)}
  `;
}

function renderEmails() {
  title.textContent = "Emma Emails";
  const emails = state.data.emails.filter(email => matches(`${email.subject} ${email.body}`));
  content.innerHTML = emails.map(email => `
    <article class="card email-card">
      <div class="section-title"><h3>${esc(email.subject)}</h3><span class="badge">${esc(email.time)}</span></div>
      <p class="eyebrow">${esc(email.path)}</p>
      <pre>${esc(email.body)}</pre>
    </article>
  `).join("") || `<div class="empty">No emails matched.</div>`;
}

function ticketList(rows) {
  if (!rows.length) return `<div class="empty">No tickets found.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Owner</th><th>Title</th><th>Status</th><th>Priority</th><th>Next action</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.owner_employee)}</td><td>${esc(row.title)}</td><td>${esc(row.status)}</td><td>${esc(row.priority)}</td><td>${esc(row.next_action)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderTickets() {
  title.textContent = "Tickets";
  const rows = (state.data.tables.tickets?.rows || []).filter(row => matches(Object.values(row).join(" ")));
  content.innerHTML = `<div class="section-title"><h3>${rows.length} tickets</h3><span class="badge">company_database/tickets.tsv</span></div>${ticketList(rows)}`;
}

function renderOperations() {
  title.textContent = "Operations";
  content.innerHTML = `
    <div class="split">
      <section class="card">
        <div class="section-title"><h3>Crontab</h3><span class="badge">macOS</span></div>
        <pre class="code-box">${esc(state.data.crontab || "not available")}</pre>
      </section>
      <section class="card">
        <div class="section-title"><h3>Data Tools</h3></div>
        <p>Use this local page to inspect current files. Source path:</p>
        <pre class="code-box">${esc(state.data.root)}</pre>
        <button class="tool-button" onclick="navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(state.data, null, 2))">Copy current JSON</button>
      </section>
    </div>
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

document.querySelectorAll(".nav button").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
$("#globalSearch").addEventListener("input", event => { state.query = event.target.value; render(); });
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

loadData().catch(error => {
  content.innerHTML = `<div class="empty">Could not load dashboard data: ${esc(error.message)}</div>`;
});
