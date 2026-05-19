const state = {
  data: null,
  listener: { observations: [] },
  requests: { requests: [], counts: {} },
  view: "overview",
  query: "",
  activeTable: "daily_business_metrics",
  eventCategory: "all",
  incidentSeverity: "active",
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
  if (/critical|high|urgent/.test(text)) return "bad";
  if (/medium|warning|monitor|current|pending|running|waiting/.test(text)) return "warn";
  if (/healthy|completed|ready|sent|synced|yes|success|done|passed|approved|active/.test(text)) return "good";
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

function incidents() {
  return state.data?.incidents || state.data?.tables?.incidents?.rows || [];
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
  await loadRequests();
  $("#generatedAt").textContent = `Updated ${state.data.generated_at}`;
  render();
}

async function loadRequests() {
  try {
    const response = await fetch(`api/stakeholder-requests?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`api ${response.status}`);
    state.requests = await response.json();
  } catch (_) {
    try {
      const fallback = await fetch(`stakeholder_requests.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!fallback.ok) throw new Error(`fallback ${fallback.status}`);
      state.requests = await fallback.json();
    } catch (__) {
      state.requests = state.data?.stakeholder_requests || { requests: [], counts: {} };
    }
  }
  updateRequestSignal();
}

function updateRequestSignal() {
  const signal = $("#requestSignal");
  if (!signal) return;
  const counts = state.requests?.counts || {};
  const pending = Number(counts.pending || 0);
  const running = Number(counts.running || 0);
  const total = (state.requests?.requests || []).length;
  signal.textContent = `Requests: ${pending + running}/${total}`;
  signal.classList.toggle("hot", pending + running > 0);
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  render();
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function pageIntro(copy) {
  return `<p>${esc(copy)}</p>`;
}

function businessFunnelCard(label, value, detail, index = 0) {
  return `
    <article class="funnel-step fade-in" style="--accent: ${accents[index % accents.length]}">
      <div class="funnel-index">${String(index + 1).padStart(2, "0")}</div>
      <div>
        <h4>${esc(label)}</h4>
        <strong>${esc(value)}</strong>
        <p>${esc(detail)}</p>
      </div>
    </article>
  `;
}

function businessFunnel(m) {
  const steps = [
    ["Pipeline", m.pipeline_rows, "Total rows in the active business pipeline."],
    ["Qualified", m.qualified_leads, "Prospects that passed the current qualification filter."],
    ["Outreach", m.outreach_sent, "Messages actually moved from draft to sent."],
    ["Replies", m.replies, "Responses received from the market."],
    ["Meetings", m.meetings, "Booked conversations or next-step calls."],
    ["Closed", m.clients_closed, `Clients closed. Revenue USD ${m.revenue}.`],
  ];
  return `
    <section class="section funnel-section">
      <div class="section-title">
        <div>
          <h3>Business Funnel</h3>
          ${pageIntro("Sales progress is shown as one horizontal flow on desktop and a clean vertical flow on mobile.")}
        </div>
        ${navButton("Open database", "database")}
      </div>
      <div class="funnel-track">
        ${steps.map((step, index) => businessFunnelCard(step[0], step[1], step[2], index)).join("")}
      </div>
    </section>
  `;
}

function coreResultRows() {
  const payload = state.data?.core_results || {};
  const current = payload.current_rows || [];
  const currentHasDueResult = current.some((row) => ["pass", "fail"].includes(row.status));
  return currentHasDueResult ? current : (payload.latest_due_rows || current);
}

function allCoreResultRows() {
  return state.data?.core_results?.rows || [];
}

function coreStatusClass(status) {
  const text = String(status || "").toLowerCase();
  if (text === "pass") return "good";
  if (text === "fail") return "bad";
  if (text === "pending") return "warn";
  return "neutral";
}

function coreResultCard(row, index) {
  const key = keyFor("core-result", `${row.date}-${row.employee_name}-${row.status}`);
  return `
    <article class="core-card fade-in ${coreStatusClass(row.status)}" style="--accent: ${accents[index % accents.length]}">
      <div class="core-check">
        <span class="check-symbol">${row.status === "pass" ? "✓" : row.status === "fail" ? "!" : "…"}</span>
        <div>
          <h4>${esc(row.employee_name)}</h4>
          <span class="badge ${coreStatusClass(row.status)}">${esc(row.status || "unknown")}</span>
        </div>
      </div>
      <p class="copy strong">${esc(row.required_result || "Required result missing.")}</p>
      <div class="field">
        <span class="field-label">How it worked</span>
        ${expandableText(row.how_it_worked || "Not recorded.", `${key}-how`, 180)}
      </div>
      <div class="field">
        <span class="field-label">Evidence</span>
        ${expandableText(row.evidence_file || row.evidence_summary || "No same-day evidence.", `${key}-evidence`, 180)}
      </div>
      <div class="field">
        <span class="field-label">Next action</span>
        ${expandableText(row.next_action || "Not recorded.", `${key}-next`, 170)}
      </div>
    </article>
  `;
}

function coreResultSummary() {
  const payload = state.data?.core_results || {};
  const rows = coreResultRows();
  const failures = rows.filter((row) => row.status === "fail").length;
  const passes = rows.filter((row) => row.status === "pass").length;
  const pending = rows.filter((row) => row.status === "pending").length;
  return `
    <section class="section core-results">
      <div class="section-title">
        <div>
          <h3>Core Result Checklist</h3>
          ${pageIntro(`Daily hard check for Mateo, Mia, and Sam. Showing ${rows[0]?.date || payload.current_date || "today"}; current date is ${payload.current_date || "unknown"}. Passes=${passes}; failures=${failures}; pending=${pending}.`)}
        </div>
        ${navButton("Open day-by-day", "results")}
      </div>
      <div class="grid core-grid">
        ${rows.map(coreResultCard).join("") || `<div class="empty">Core result checklist is unavailable.</div>`}
      </div>
    </section>
  `;
}

function renderCoreResults() {
  title.textContent = "Core Results";
  const payload = state.data?.core_results || {};
  const rows = allCoreResultRows().filter((row) => matches(Object.values(row).join(" ")));
  content.innerHTML = `
    ${coreResultSummary()}
    <section class="section">
      <div class="section-title">
        <div>
          <h3>Day-by-day Validation</h3>
          ${pageIntro("Only three rows matter here: Mateo sent LinkedIn outreach, Mia uploaded Instagram posts, and Sam created/staged Meta ads. Drafts, local images, and reports do not pass.")}
        </div>
        <span class="badge ${payload.current_failures?.length ? "bad" : "good"}">${esc(payload.current_failures?.length || 0)} current failures</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Required result</th>
              <th>How it worked</th>
              <th>Evidence</th>
              <th>Next action</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${esc(row.date)}</td>
                <td>${esc(row.employee_name)}</td>
                <td><span class="badge ${coreStatusClass(row.status)}">${esc(row.status)}</span></td>
                <td>${esc(row.required_result)}</td>
                <td>${esc(row.how_it_worked)}</td>
                <td>${esc(row.evidence_file || row.evidence_summary)}</td>
                <td>${esc(row.next_action)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function requestCounts() {
  const counts = state.requests?.counts || {};
  return {
    pending: Number(counts.pending || 0),
    running: Number(counts.running || 0),
    completed: Number(counts.completed || 0),
    failed: Number(counts.failed || 0) + Number(counts.blocked || 0),
  };
}

function incidentCounts() {
  const rows = incidents();
  const active = rows.filter((row) => ["open", "monitor"].includes(String(row.status || "").toLowerCase()));
  const high = active.filter((row) => ["critical", "high"].includes(String(row.severity || "").toLowerCase()));
  const comms = active.filter((row) => String(row.affected_workflows || "").toLowerCase().includes("communication"));
  return { total: rows.length, active: active.length, high: high.length, comms: comms.length };
}

function incidentRank(row) {
  const statusOrder = { open: 0, monitor: 1, historical: 2, resolved: 3, closed: 4 };
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return [
    statusOrder[String(row.status || "").toLowerCase()] ?? 5,
    severityOrder[String(row.severity || "").toLowerCase()] ?? 5,
    String(row.detected_at || row.date || "")
  ];
}

function sortedIncidents(rows) {
  return rows.slice().sort((a, b) => {
    const ar = incidentRank(a);
    const br = incidentRank(b);
    if (ar[0] !== br[0]) return ar[0] - br[0];
    if (ar[1] !== br[1]) return ar[1] - br[1];
    return String(br[2]).localeCompare(String(ar[2]));
  });
}

function renderOverview() {
  const m = state.data.metrics;
  const requestStats = requestCounts();
  const incidentStats = incidentCounts();
  const activeIncidents = sortedIncidents(incidents()).filter((row) => ["open", "monitor"].includes(String(row.status || "").toLowerCase()));
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
          ${navButton("Incidents", "incidents")}
          ${navButton("Events", "events")}
          ${navButton("Tickets", "tickets")}
        </div>
      </div>
    </section>

    <div class="grid metric-grid">
      ${metricCard("Employees", m.employees, 0)}
      ${metricCard("Qualified leads", m.qualified_leads, 1)}
      ${metricCard("Open tickets", m.open_tickets, 2)}
      ${metricCard("Active incidents", `${incidentStats.active} (${incidentStats.high} high)`, 3)}
      ${metricCard("Meta spend", m.meta_spend, 4)}
      ${metricCard("Revenue USD", m.revenue, 5)}
      ${metricCard("Stakeholder queue", `${requestStats.pending + requestStats.running} active`, 6)}
    </div>

    ${businessFunnel(m)}

    ${coreResultSummary()}

    <section class="section">
      <div class="section-title">
        <div>
          <h3>Active Incidents</h3>
          ${pageIntro("Role failures are tracked with reason, consequence, affected workflows, and recovery owner.")}
        </div>
        ${navButton("Open incidents", "incidents")}
      </div>
      <div class="grid incident-grid">
        ${activeIncidents.slice(0, 4).map(incidentCard).join("") || `<div class="empty">No active incidents detected.</div>`}
      </div>
    </section>

    <section class="section">
      <div class="section-title">
        <div>
          <h3>Priority Cards</h3>
          ${pageIntro("The top operational surfaces are separated into cards instead of raw table dumps.")}
        </div>
        <div class="button-row">${navButton("Stakeholder hub", "stakeholders")}${navButton("Open all tickets", "tickets")}</div>
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

function employeeOptions() {
  return employees().map((employee) => (
    `<option value="${esc(employee.folder)}">${esc(employee.display_name)} - ${esc(employee.role)}</option>`
  )).join("");
}

function requestStatusClass(status) {
  const text = String(status || "").toLowerCase();
  if (/completed/.test(text)) return "good";
  if (/failed|blocked/.test(text)) return "bad";
  if (/running|pending/.test(text)) return "warn";
  return statusClass(status);
}

function requestCard(request, index) {
  const messages = request.messages || [];
  const thread = messages.map((message) => `
    <div class="message-bubble ${esc(message.author_type || "system")}">
      <div class="message-meta">
        <strong>${esc(message.author || "unknown")}</strong>
        <span>${esc(message.channel || "dashboard")}</span>
        <time>${esc(message.time || "")}</time>
      </div>
      <p>${esc(message.body || "")}</p>
    </div>
  `).join("");
  return `
    <article class="request-card fade-in" style="--accent: ${accents[index % accents.length]}">
      <div class="section-title">
        <div>
          <h3>${esc(request.employee_display || request.employee_folder || "Employee")}</h3>
          <div class="path">${esc(request.request_id || "")}</div>
        </div>
        <span class="badge ${requestStatusClass(request.status)}">${esc(request.status || "unknown")}</span>
      </div>
      <div class="request-status-row">
        <span>${esc(request.stakeholder || "unknown stakeholder")}</span>
        <span>${esc(request.priority || "normal")}</span>
        <span>${esc(request.current_stage || "queued")}</span>
        <span>${esc(request.updated_at || request.created_at || "")}</span>
      </div>
      <div class="field">
        <span class="field-label">Desired outcome</span>
        <p class="copy">${esc(request.desired_outcome || "Not recorded.")}</p>
      </div>
      <div class="message-feed">${thread || `<div class="empty">No messages recorded.</div>`}</div>
      <div class="button-row">
        ${request.report_dir ? searchButton("Employee evidence", "events", request.report_dir) : ""}
        ${searchButton("Employee profile", "employees", request.employee_folder || request.employee_display)}
      </div>
    </article>
  `;
}

function renderStakeholderHub() {
  title.textContent = "Stakeholder Hub";
  const stats = requestCounts();
  const rows = (state.requests?.requests || []).filter((request) => (
    matches(`${request.request_id} ${request.stakeholder} ${request.employee_folder} ${request.employee_display} ${request.message_preview} ${request.status} ${(request.messages || []).map((message) => message.body).join(" ")}`)
  ));
  content.innerHTML = `
    <section class="section request-layout">
      <form class="terminal-card" data-stakeholder-form="1">
        <div class="section-title">
          <div>
            <h3>Command Input</h3>
            ${pageIntro("Stakeholder instructions become queued local employee runs with visible thread history.")}
          </div>
          <span class="badge ${stats.pending + stats.running ? "warn" : "good"}">${stats.pending + stats.running} active</span>
        </div>
        <div class="form-grid">
          <label>
            <span class="field-label">Stakeholder</span>
            <input name="stakeholder" class="search" placeholder="Federico" required>
          </label>
          <label>
            <span class="field-label">Employee</span>
            <select name="employee_folder" class="search" required>${employeeOptions()}</select>
          </label>
          <label>
            <span class="field-label">Priority</span>
            <select name="priority" class="search">
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </label>
        </div>
        <label>
          <span class="field-label">Desired outcome</span>
          <input name="desired_outcome" class="search" placeholder="meeting booked, campaign improved, reliability fixed">
        </label>
        <label>
          <span class="field-label">Terminal message</span>
          <textarea name="message" class="terminal-input" rows="7" placeholder="$ tell the employee what should change" required></textarea>
        </label>
        <div class="button-row">
          <button type="submit" class="tool-button primary">Queue employee run</button>
          <button type="button" class="tool-button" data-refresh-requests="1">Refresh requests</button>
        </div>
        <div id="hubNotice" class="hub-notice" aria-live="polite"></div>
      </form>

      <div class="request-summary">
        ${metricCard("Pending", stats.pending, 0)}
        ${metricCard("Running", stats.running, 1)}
        ${metricCard("Completed", stats.completed, 2)}
        ${metricCard("Blocked/failed", stats.failed, 3)}
      </div>
    </section>

    <section class="section">
      <div class="section-title">
        <div>
          <h3>${rows.length} Request Threads</h3>
          ${pageIntro(state.requests?.generated_at || "Waiting for local request feed.")}
        </div>
      </div>
      <div class="grid request-grid">
        ${rows.map(requestCard).join("") || `<div class="empty">No stakeholder requests matched.</div>`}
      </div>
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

function samPipelineChecklist(foreman) {
  const checklist = foreman.pipeline_checklist || {};
  const steps = Array.isArray(checklist.steps) ? checklist.steps : [];
  if (!steps.length) {
    return `
      <article class="section-card sam-pipeline-card">
        <div class="section-title">
          <h3>Sam Run Pipeline</h3>
          <span class="badge warn">not recorded</span>
        </div>
        <p class="copy">No Sam pipeline checklist has been written yet.</p>
      </article>
    `;
  }
  const rows = steps.map((step, index) => {
    const status = step.status || "pending";
    const done = status === "done";
    const evidence = step.evidence ? `<div class="path">${esc(step.evidence)}</div>` : "";
    const detail = step.detail ? `<p class="copy muted">${esc(truncated(step.detail, 180))}</p>` : "";
    const blocker = step.blocker ? `<p class="copy bad-text">${esc(truncated(step.blocker, 220))}</p>` : "";
    return `
      <li class="pipeline-step ${esc(status)}">
        <input type="checkbox" disabled ${done ? "checked" : ""} aria-label="${esc(step.label || `Step ${index + 1}`)}">
        <div class="pipeline-step-main">
          <strong>${esc(step.label || `Step ${index + 1}`)}</strong>
          ${detail}
          ${blocker}
          ${evidence}
        </div>
        <span class="badge ${statusClass(status)}">${esc(status)}</span>
      </li>
    `;
  }).join("");
  return `
    <article class="section-card sam-pipeline-card">
      <div class="section-title">
        <div>
          <h3>Sam Run Pipeline</h3>
          <p class="copy muted">${esc(checklist.completed_steps || 0)} of ${esc(checklist.total_steps || steps.length)} checkpoints complete. Current step: ${esc(checklist.current_step || "not recorded")}.</p>
        </div>
        <span class="badge ${statusClass(checklist.overall_status)}">${esc(checklist.overall_status || "unknown")}</span>
      </div>
      ${foreman.pipeline_checklist_path ? `<div class="path">${esc(foreman.pipeline_checklist_path)}</div>` : ""}
      <ol class="pipeline-checklist">${rows}</ol>
    </article>
  `;
}

function sammyForemanCard() {
  const foreman = state.data?.sammy_foreman || {};
  const exists = foreman.exists === "yes";
  const result = foreman.final_result || (exists ? "running" : "missing");
  const staleCount = (foreman.stale_markers_superseded || []).length;
  const liveCount = (foreman.live_ui_evidence || []).length;
  return `
    <section class="section">
      <div class="section-title">
        <div>
          <h3>Sammy Foreman</h3>
          ${pageIntro("Sam's scheduled Meta flow now runs through Sammy, which resumes failed phases and writes the authoritative final result.")}
        </div>
        <span class="badge ${statusClass(result)}">${esc(result)}</span>
      </div>
      <div class="grid focus-grid">
        <article class="section-card">
          <div class="section-title">
            <h3>${esc(foreman.current_phase || "No phase")}</h3>
            <span class="badge ${statusClass(foreman.current_phase)}">${esc(foreman.recovery_attempt_count || "0")} attempts</span>
          </div>
          <p class="copy">${esc(foreman.next_action || "No next action recorded.")}</p>
          ${foreman.current_blocker ? `<p class="copy bad-text">${esc(foreman.current_blocker)}</p>` : ""}
          <ul class="mini-list">
            <li>Run: ${esc(foreman.run_id || "not recorded")}</li>
            <li>Last progress: ${esc(foreman.last_progress_at || foreman.updated_at || "not recorded")}</li>
            <li>Last marker: ${esc(foreman.last_marker_seen || "not recorded")}</li>
            <li>Superseded stale markers: ${esc(staleCount)}</li>
            <li>Live UI evidence notes: ${esc(liveCount)}</li>
          </ul>
        </article>
        <article class="section-card">
          <div class="section-title">
            <h3>Proof Files</h3>
          </div>
          <div class="path">${esc(foreman.state_path || "sammy - sam_foreman/runs")}</div>
          ${foreman.final_path ? `<div class="path">${esc(foreman.final_path)}</div>` : ""}
          <p class="copy">${esc(foreman.final_summary || "No final marker yet.")}</p>
        </article>
      </div>
      ${samPipelineChecklist(foreman)}
    </section>
  `;
}

function renderAdsCycle() {
  title.textContent = "Ads Cycle";
  const ads = state.data.ads_shared || {};
  const rows = (ads.cycle_index || []).filter((row) => matches(Object.values(row).join(" "))).slice().reverse();
  const recent = (ads.recent_files || []).filter((row) => matches(`${row.stage} ${row.path} ${row.summary}`));
  content.innerHTML = `
    ${sammyForemanCard()}

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

function incidentFilters() {
  const filters = [
    ["active", "active"],
    ["open", "open"],
    ["monitor", "monitor"],
    ["historical", "historical"],
    ["all", "all"],
  ];
  return filters.map(([value, label]) => (
    `<button type="button" class="${state.incidentSeverity === value ? "active" : ""}" data-incident-filter="${esc(value)}">${esc(label)}</button>`
  )).join("");
}

function incidentCard(row, index = 0) {
  const key = keyFor("incident", `${row.incident_id || ""}-${row.source_path || ""}-${index}`);
  const active = ["open", "monitor"].includes(String(row.status || "").toLowerCase());
  return `
    <article class="incident-card fade-in ${active ? "active-incident" : ""}" style="--accent: ${accents[index % accents.length]}">
      <div class="incident-head">
        ${avatar(row.employee_folder || row.employee_name || "Golden Crow", "event-avatar")}
        <div>
          <h3>${esc(row.employee_name || row.employee_folder || "Unknown employee")}</h3>
          <div class="role">${esc(row.role || "role not recorded")}</div>
          <div class="badges">
            <span class="badge ${statusClass(row.severity)}">${esc(row.severity || "medium")}</span>
            <span class="badge ${statusClass(row.status)}">${esc(row.status || "open")}</span>
            <span class="badge">${esc(row.source_type || "source")}</span>
          </div>
        </div>
      </div>
      <div class="incident-body">
        <div class="field">
          <span class="field-label">Duty expected</span>
          ${expandableText(row.duty_expected || "Not recorded.", `${key}-duty`, 150)}
        </div>
        <div class="field">
          <span class="field-label">Why it failed</span>
          ${expandableText(row.failure_reason || "Failure reason not recorded.", `${key}-reason`, 170)}
        </div>
        <div class="field">
          <span class="field-label">Potential consequence</span>
          ${expandableText(row.potential_consequence || "Consequence not recorded.", `${key}-impact`, 170)}
        </div>
        <div class="incident-impact">
          <div>
            <span class="field-label">Affected</span>
            <p class="copy">${esc(row.affected_employees || "Not recorded.")}</p>
          </div>
          <div>
            <span class="field-label">Workflows</span>
            <p class="copy">${esc(row.affected_workflows || "Not recorded.")}</p>
          </div>
        </div>
        <div class="field">
          <span class="field-label">Recovery</span>
          ${expandableText(row.recovery_action || "Not recorded.", `${key}-recovery`, 170)}
        </div>
      </div>
      <div class="incident-foot">
        <time>${esc(row.detected_at || row.date || "")}</time>
        <div class="path">${esc(row.source_path || "")}</div>
      </div>
      <div class="button-row">
        ${searchButton("Employee profile", "employees", row.employee_folder || row.employee_name || "")}
        ${row.source_path ? searchButton("Evidence", "events", row.source_path) : ""}
      </div>
    </article>
  `;
}

function renderIncidents() {
  title.textContent = "Incidents";
  const stats = incidentCounts();
  const rows = sortedIncidents(incidents()).filter((row) => {
    const status = String(row.status || "").toLowerCase();
    const filter = state.incidentSeverity;
    const filterMatch = filter === "all" || (filter === "active" ? ["open", "monitor"].includes(status) : status === filter);
    return filterMatch && matches(`${row.employee_folder} ${row.employee_name} ${row.role} ${row.failure_reason} ${row.evidence} ${row.potential_consequence} ${row.affected_employees} ${row.affected_workflows} ${row.recovery_action} ${row.source_path}`);
  });
  content.innerHTML = `
    <section class="section">
      <div class="section-title">
        <div>
          <h3>Incident Register</h3>
          ${pageIntro("An incident is any evidence-backed reason an employee failed to comply with the day's duty, with consequences and downstream effects recorded.")}
        </div>
        <div class="button-row">${navButton("Company database", "database")}${navButton("Events", "events")}</div>
      </div>
      <div class="grid metric-grid">
        ${metricCard("Active", stats.active, 0)}
        ${metricCard("High severity", stats.high, 1)}
        ${metricCard("Communication-linked", stats.comms, 2)}
        ${metricCard("Total tracked", stats.total, 3)}
      </div>
      <div class="tabs">${incidentFilters()}</div>
      <div class="grid incident-grid">
        ${rows.map(incidentCard).join("") || `<div class="empty">No incidents matched.</div>`}
      </div>
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
    results: renderCoreResults,
    employees: renderEmployees,
    incidents: renderIncidents,
    stakeholders: renderStakeholderHub,
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

  const incidentFilter = event.target.closest("[data-incident-filter]");
  if (incidentFilter) {
    state.incidentSeverity = incidentFilter.dataset.incidentFilter;
    renderIncidents();
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

  const refreshRequests = event.target.closest("[data-refresh-requests]");
  if (refreshRequests) {
    loadRequests().then(render);
  }
});

content.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-stakeholder-form]");
  if (!form) return;
  event.preventDefault();
  const notice = $("#hubNotice");
  const submitButton = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  submitButton.disabled = true;
  if (notice) notice.textContent = "Queueing...";
  try {
    const response = await fetch("api/stakeholder-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `request failed ${response.status}`);
    }
    form.reset();
    await loadRequests();
    if (notice) notice.textContent = `Queued ${result.request?.request_id || "request"}.`;
    renderStakeholderHub();
  } catch (error) {
    if (notice) notice.textContent = `Could not queue request: ${error.message}`;
  } finally {
    submitButton.disabled = false;
  }
});

setInterval(() => {
  loadRequests().then(() => {
    if (state.view === "stakeholders" || state.view === "overview") render();
  });
}, 10000);

loadData().catch((error) => {
  content.innerHTML = `<div class="empty">Could not load dashboard data: ${esc(error.message)}</div>`;
});
