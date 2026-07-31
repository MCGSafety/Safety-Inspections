/* The Safety Inspector — Safety Inspections app (vanilla JS, no build step) */

const contentEl = document.getElementById("app-content");
let seedChecked = false;

/* ---------------- helpers ---------------- */

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function showToast(msg, ms = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, ms);
}

function confirmDialog({ title, message, confirmText = "Delete", danger = true, onConfirm }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button class="btn" id="modalCancel">Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="modalConfirm">${escapeHtml(confirmText)}</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("#modalCancel").onclick = () => backdrop.remove();
  backdrop.querySelector("#modalConfirm").onclick = () => { backdrop.remove(); onConfirm(); };
}

function statusBadge(status) {
  if (status === "completed") return `<span class="badge badge-success">Completed</span>`;
  if (status === "in-progress") return `<span class="badge badge-warning">In Progress</span>`;
  return `<span class="badge badge-neutral">${escapeHtml(status)}</span>`;
}

function resultBadge(result) {
  if (result === "pass") return `<span class="badge badge-success">Pass</span>`;
  if (result === "fail") return `<span class="badge badge-danger">Fail</span>`;
  if (result === "na") return `<span class="badge badge-neutral">N/A</span>`;
  return `<span class="badge badge-neutral">Unanswered</span>`;
}

function severityBadge(sev) {
  if (sev === "high") return `<span class="badge badge-danger">High</span>`;
  if (sev === "low") return `<span class="badge badge-neutral">Low</span>`;
  return `<span class="badge badge-warning">Medium</span>`;
}

function scoreFor(items) {
  let pass = 0, fail = 0;
  items.forEach((it) => { if (it.result === "pass") pass++; else if (it.result === "fail") fail++; });
  const scored = pass + fail;
  return scored > 0 ? Math.round((pass / scored) * 100) : null;
}

/* ---------------- lightweight SVG charts (no library — themed via CSS vars) ---------------- */

function monthlyInspectionCounts(inspections, months = 6, completedTarget = null) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inMonth = inspections.filter((insp) => {
      const d = new Date(insp.date || insp.createdAt);
      return d >= monthStart && d < monthEnd;
    });
    const completed = inMonth.filter((insp) => insp.status === "completed").length;
    const underTarget = completedTarget !== null && completed < completedTarget;
    buckets.push({
      label: monthStart.toLocaleDateString(undefined, { month: "short" }),
      value: inMonth.length,
      color: underTarget ? "var(--danger)" : "var(--primary)",
    });
  }
  return buckets;
}

function monthlyPassRateTrend(completed, months = 6) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inMonth = completed.filter((insp) => {
      const d = new Date(insp.date || insp.createdAt);
      return d >= monthStart && d < monthEnd;
    });
    let pass = 0, fail = 0;
    inMonth.forEach((insp) => insp.items.forEach((it) => {
      if (it.result === "pass") pass++; else if (it.result === "fail") fail++;
    }));
    const scored = pass + fail;
    buckets.push({
      label: monthStart.toLocaleDateString(undefined, { month: "short" }),
      value: scored > 0 ? Math.round((pass / scored) * 100) : 0,
    });
  }
  return buckets;
}

function severityCounts(openIssues) {
  const counts = { low: 0, medium: 0, high: 0 };
  openIssues.forEach((i) => { counts[i.severity] = (counts[i.severity] || 0) + 1; });
  return [
    { label: "Low", value: counts.low, color: "var(--text-muted)" },
    { label: "Medium", value: counts.medium, color: "var(--warning)" },
    { label: "High", value: counts.high, color: "var(--danger)" },
  ];
}

function svgBarChart({ items, height = 160, barColor = "var(--primary)", suffix = "" }) {
  const width = 400;
  const padding = { top: 22, right: 8, bottom: 24, left: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...items.map((d) => d.value));
  const n = items.length;
  const gap = 8;
  const barW = Math.min(24, (chartW - gap * (n - 1)) / n);
  const usedW = barW * n + gap * (n - 1);
  const startX = padding.left + (chartW - usedW) / 2;
  const baselineY = padding.top + chartH;
  const bars = items.map((d, i) => {
    const x = startX + i * (barW + gap);
    const h = d.value > 0 ? (d.value / max) * chartH : 0;
    const y = baselineY - h;
    return `
      <g>
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="4" fill="${d.color || barColor}">
          <title>${escapeHtml(d.label)}: ${d.value}${suffix}</title>
        </rect>
        ${d.value > 0 ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${d.value}${suffix}</text>` : ""}
        <text x="${(x + barW / 2).toFixed(1)}" y="${height - 7}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${escapeHtml(d.label)}</text>
      </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="bar chart">
    <line x1="${padding.left}" y1="${baselineY}" x2="${width - padding.right}" y2="${baselineY}" stroke="var(--border)" stroke-width="1" />
    ${bars}
  </svg>`;
}

function svgLineChart({ items, height = 160, color = "var(--primary)", suffix = "" }) {
  const width = 400;
  const padding = { top: 20, right: 14, bottom: 24, left: 14 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const n = items.length;
  const max = Math.max(...items.map((d) => d.value), 1);
  const min = Math.min(...items.map((d) => d.value), 0);
  const range = Math.max(max - min, 1);
  const stepX = n > 1 ? chartW / (n - 1) : 0;
  const points = items.map((d, i) => ({
    x: padding.left + stepX * i,
    y: padding.top + chartH - ((d.value - min) / range) * chartH,
    d,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const dots = points.map((p) => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2">
      <title>${escapeHtml(p.d.label)}: ${p.d.value}${suffix}</title>
    </circle>`).join("");
  const baselineY = padding.top + chartH;
  const labelIdxs = n <= 5 ? points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const xLabels = labelIdxs.map((i) => `<text x="${points[i].x.toFixed(1)}" y="${height - 7}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${escapeHtml(points[i].d.label)}</text>`).join("");
  const last = points[points.length - 1];
  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="line chart">
    <line x1="${padding.left}" y1="${baselineY}" x2="${width - padding.right}" y2="${baselineY}" stroke="var(--border)" stroke-width="1" />
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}
    <text x="${last.x.toFixed(1)}" y="${Math.max(10, last.y - 10).toFixed(1)}" text-anchor="end" font-size="11" font-weight="700" fill="var(--text)">${last.d.value}${suffix}</text>
    ${xLabels}
  </svg>`;
}

function resultsBreakdownChart({ pass, fail, na }) {
  const total = pass + fail + na;
  if (total === 0) return `<div class="empty-state" style="padding:24px 14px;"><p style="margin:0">No completed inspections yet</p></div>`;
  const segs = [
    { label: "Pass", value: pass, color: "var(--success)" },
    { label: "Fail", value: fail, color: "var(--danger)" },
    { label: "N/A", value: na, color: "var(--text-muted)" },
  ];
  const bars = segs.filter((s) => s.value > 0).map((s) => {
    const w = (s.value / total) * 100;
    return `<div style="width:${w}%; background:${s.color};" title="${s.label}: ${s.value} (${Math.round(w)}%)"></div>`;
  }).join("");
  const legend = segs.map((s) => `
    <div style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-muted);">
      <span style="width:10px; height:10px; border-radius:3px; background:${s.color}; display:inline-block;"></span>
      ${s.label} <strong style="color:var(--text);">${s.value}</strong>
    </div>`).join("");
  return `
    <div class="stacked-bar">${bars}</div>
    <div style="display:flex; gap:16px; margin-top:12px; flex-wrap:wrap;">${legend}</div>
  `;
}

function compressImageToBlob(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))), "image/jpeg", quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function goto(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

/* ---------------- reusable "pick or add" dropdowns (inspector/location) ---------------- */

function selectOptionsHtml(items, currentValue) {
  const names = items.map((i) => i.name);
  let html = `<option value="">— Select —</option>`;
  if (currentValue && !names.includes(currentValue)) {
    html += `<option value="${escapeHtml(currentValue)}" selected>${escapeHtml(currentValue)}</option>`;
  }
  html += items.map((i) => `<option value="${escapeHtml(i.name)}" ${i.name === currentValue ? "selected" : ""}>${escapeHtml(i.name)}</option>`).join("");
  html += `<option value="__new__">+ Add new…</option>`;
  return html;
}

function wirePickOrAddSelect(selectEl, promptLabel, addFn, onValue) {
  let lastValue = selectEl.value;
  selectEl.addEventListener("change", async () => {
    if (selectEl.value === "__new__") {
      const name = (window.prompt(promptLabel) || "").trim();
      if (!name) { selectEl.value = lastValue; return; }
      const existingOpt = Array.from(selectEl.options).find((o) => o.value !== "__new__" && o.value.toLowerCase() === name.toLowerCase());
      if (existingOpt) {
        selectEl.value = existingOpt.value;
      } else {
        try {
          await addFn(name);
        } catch (err) {
          console.error(err);
          showToast("Could not save — check your connection");
        }
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        selectEl.insertBefore(opt, selectEl.querySelector('option[value="__new__"]'));
        selectEl.value = name;
      }
    }
    lastValue = selectEl.value;
    onValue(selectEl.value);
  });
}

/* ---------------- setup / settings screens ---------------- */

function renderSetupScreen(errorMsg) {
  contentEl.innerHTML = `
    <div class="card card-pad" style="max-width:520px; margin: 40px auto;">
      <h1 style="margin-top:0;">Connect to Airtable</h1>
      <p class="hint">The Safety Inspector stores its data in a shared Airtable base so every device sees the same inspections. Paste a Personal Access Token to connect this device.</p>
      ${errorMsg ? `<p class="hint" style="color:var(--danger)">${escapeHtml(errorMsg)}</p>` : ""}
      <div class="form-group">
        <label for="setupToken">Personal Access Token</label>
        <input type="text" id="setupToken" placeholder="patXXXXXXXXXXXXXX.xxxxxxxx..." autocomplete="off" spellcheck="false" />
      </div>
      <button class="btn btn-primary" id="setupConnectBtn">Connect</button>
      <p class="hint" style="margin-top:14px;">
        No token yet? Go to <strong>airtable.com/create/tokens</strong>, create one with scopes
        <strong>data.records:read</strong> and <strong>data.records:write</strong>, grant it access to the
        <strong>The Safety Inspector</strong> base, then paste it here. Everyone on your team uses the same base — either
        share this token or have each person create their own with access to it.
      </p>
    </div>
  `;
  document.getElementById("setupConnectBtn").addEventListener("click", async () => {
    const token = document.getElementById("setupToken").value.trim();
    if (!token) { showToast("Enter your Personal Access Token"); return; }
    const btn = document.getElementById("setupConnectBtn");
    btn.disabled = true;
    setAirtableToken(token);
    initAirtableClient();
    try {
      await atListAll("Templates", { pageSize: "1", maxRecords: "1" });
      location.reload();
    } catch (e) {
      clearAirtableToken();
      const detail = e.message || "Could not connect.";
      renderSetupScreen(`${detail} — double-check you copied the whole token with no extra spaces, and that it was granted access to The Safety Inspector base.`);
    }
  });
}

async function renderSettings() {
  contentEl.innerHTML = `
    <div class="page-header"><div><h1>Settings</h1></div></div>
    <div class="card card-pad" style="max-width:480px;">
      <div class="form-group" style="margin-bottom:0;">
        <label>Connected base</label>
        <div>The Safety Inspector — <a href="https://airtable.com/${AIRTABLE_BASE_ID}" target="_blank" rel="noopener">open in Airtable ↗</a></div>
      </div>
      <div class="modal-actions" style="justify-content:flex-start; margin-top:20px;">
        <button class="btn btn-ghost" id="changeTokenBtn" style="color:var(--danger)">Disconnect This Device</button>
      </div>
    </div>
  `;
  document.getElementById("changeTokenBtn").addEventListener("click", () => {
    confirmDialog({
      title: "Disconnect this device?",
      message: "This clears the saved token on this device only. Your data stays in Airtable.",
      confirmText: "Disconnect",
      onConfirm: () => { clearAirtableToken(); location.reload(); },
    });
  });
}

/* ---------------- boot + router ---------------- */

function updateActiveNav(routeKey) {
  document.querySelectorAll(".topnav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === routeKey);
  });
}

function closeMobileNav() {
  document.querySelector(".topnav").classList.remove("open");
}

function boot() {
  document.getElementById("navToggle").addEventListener("click", () => {
    document.querySelector(".topnav").classList.toggle("open");
  });
  document.querySelectorAll(".topnav a").forEach((a) => a.addEventListener("click", () => closeMobileNav()));
  window.addEventListener("hashchange", render);

  if (!initAirtableClient()) { renderSetupScreen(); return; }
  render();
}

async function render() {
  if (!airtableToken) { renderSetupScreen(); return; }

  if (!seedChecked) {
    seedChecked = true;
    try { await Store.ensureSeeded(); } catch (e) { console.error(e); showToast("Could not load starter templates"); }
  }

  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [seg0, seg1, seg2] = parts;
  closeMobileNav();
  try {
    if (!seg0 || seg0 === "dashboard") { updateActiveNav("dashboard"); await renderDashboard(); }
    else if (seg0 === "templates") {
      if (seg1 === "new") { updateActiveNav("templates"); await renderTemplateEditor(null); }
      else if (seg1) { updateActiveNav("templates"); await renderTemplateEditor(seg1); }
      else { updateActiveNav("templates"); await renderTemplatesList(); }
    } else if (seg0 === "inspections") {
      if (seg1 === "new") { updateActiveNav("new-inspection"); await renderNewInspection(); }
      else if (seg1 && seg2 === "run") { updateActiveNav("new-inspection"); await renderInspectionRun(seg1); }
      else if (seg1) { updateActiveNav("inspections"); await renderInspectionReport(seg1); }
      else { updateActiveNav("inspections"); await renderInspectionsHistory(); }
    } else if (seg0 === "issues") {
      updateActiveNav("issues");
      if (seg1 === "open" || seg1 === "resolved" || seg1 === "all") issuesTab = seg1;
      issuesLocationFilter = seg2 ? decodeURIComponent(seg2) : null;
      await renderIssues();
    }
    else if (seg0 === "locations") {
      updateActiveNav("locations");
      if (seg1) { await renderLocationDashboard(decodeURIComponent(seg1)); }
      else { await renderLocationsList(); }
    }
    else if (seg0 === "settings") { updateActiveNav("settings"); await renderSettings(); }
    else { contentEl.innerHTML = `<div class="empty-state"><h3>Page not found</h3><p><a href="#/dashboard">Go to dashboard</a></p></div>`; }
  } catch (e) {
    console.error(e);
    contentEl.innerHTML = `<div class="empty-state"><h3>Something went wrong</h3><p>${escapeHtml(e.message || String(e))}</p></div>`;
  }
  window.scrollTo(0, 0);
}

/* ---------------- Dashboard ---------------- */

function renderInspectionListItem(insp) {
  const score = insp.status === "completed" ? scoreFor(insp.items) : null;
  return `
    <a class="list-item" href="#/inspections/${insp.id}${insp.status === "in-progress" ? "/run" : ""}">
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(insp.title)}</div>
        <div class="list-item-sub">${escapeHtml(insp.templateName)} · ${escapeHtml(insp.inspector || "Unassigned")} · ${formatDate(insp.date)}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-shrink:0;">
        ${score !== null ? `<span class="badge ${score >= 90 ? "badge-success" : score >= 70 ? "badge-warning" : "badge-danger"}">${score}%</span>` : ""}
        ${statusBadge(insp.status)}
      </div>
    </a>`;
}

function buildDashboardBody({ inspections, issues, completedTarget = null, locationFilter = null }) {
  const issuesPath = (tab) => `#/issues/${tab}${locationFilter ? "/" + encodeURIComponent(locationFilter) : ""}`;
  const completed = inspections.filter((i) => i.status === "completed");
  let pass = 0, fail = 0;
  completed.forEach((i) => i.items.forEach((it) => {
    if (it.result === "pass") pass++; else if (it.result === "fail") fail++;
  }));
  const scored = pass + fail;
  const passRate = scored > 0 ? Math.round((pass / scored) * 100) : null;
  const openIssues = issues.filter((i) => i.status === "open");
  const resolvedIssues = issues.filter((i) => i.status === "resolved");
  const totalIssues = openIssues.length + resolvedIssues.length;
  const resolutionRate = totalIssues > 0 ? Math.round((resolvedIssues.length / totalIssues) * 100) : null;
  const recentResolved = resolvedIssues.slice()
    .sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt))
    .slice(0, 5);
  const now = new Date();
  const thisMonth = inspections.filter((i) => {
    const d = new Date(i.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const recentInspections = inspections.slice(0, 5);
  const topIssues = openIssues.slice().sort((a, b) => (b.severity === "high") - (a.severity === "high")).slice(0, 5);

  const monthlyChart = monthlyInspectionCounts(inspections, 6, completedTarget);
  const hasMonthlyActivity = monthlyChart.some((d) => d.value > 0);
  const trendChart = monthlyPassRateTrend(completed, 6);
  const na = completed.reduce((sum, i) => sum + i.items.filter((it) => it.result === "na").length, 0);
  const severityChart = severityCounts(openIssues);
  const hasSeverityData = severityChart.some((d) => d.value > 0);

  return `
    <div class="grid-stats">
      <a class="card stat-card" href="${issuesPath("open")}">
        <div class="stat-label">Open Issues</div>
        <div class="stat-value" style="color:${openIssues.length ? "var(--danger)" : "var(--text)"}">${openIssues.length}</div>
        <div class="stat-sub">Needing follow-up</div>
      </a>
      <a class="card stat-card" href="${issuesPath("resolved")}">
        <div class="stat-label">Issues Resolved</div>
        <div class="stat-value" style="color:var(--success)">${resolvedIssues.length}</div>
        <div class="stat-sub">${resolutionRate === null ? "No issues yet" : resolutionRate + "% resolution rate"}</div>
      </a>
      <a class="card stat-card" href="#/inspections">
        <div class="stat-label">Pass Rate</div>
        <div class="stat-value">${passRate === null ? "—" : passRate + "%"}</div>
        <div class="stat-sub">Across completed inspections</div>
      </a>
      <a class="card stat-card" href="#/inspections">
        <div class="stat-label">Inspections This Month</div>
        <div class="stat-value">${thisMonth.length}</div>
        <div class="stat-sub">${inspections.length} total</div>
      </a>
    </div>

    <div class="section-title" style="margin-top:8px;">Trends</div>
    <div class="chart-grid">
      <div class="card card-pad">
        <div class="chart-title">Inspections per Month</div>
        ${hasMonthlyActivity ? svgBarChart({ items: monthlyChart, barColor: "var(--primary)" })
          : `<div class="empty-state" style="padding:24px 14px;"><p style="margin:0">No inspections in the last 6 months</p></div>`}
      </div>
      <div class="card card-pad">
        <div class="chart-title">Pass Rate Trend</div>
        ${trendChart.length ? svgLineChart({ items: trendChart, color: "var(--primary)", suffix: "%" })
          : `<div class="empty-state" style="padding:24px 14px;"><p style="margin:0">No completed inspections yet</p></div>`}
      </div>
      <div class="card card-pad">
        <div class="chart-title">Checklist Results</div>
        ${resultsBreakdownChart({ pass, fail, na })}
      </div>
      <div class="card card-pad">
        <div class="chart-title">Open Issues by Severity</div>
        ${hasSeverityData ? svgBarChart({ items: severityChart, suffix: "" })
          : `<div class="empty-state" style="padding:24px 14px;"><p style="margin:0">No open issues 🎉</p></div>`}
      </div>
    </div>

    <div class="two-col">
      <div>
        <div class="section-title">Recent Inspections</div>
        ${recentInspections.length ? `<div class="list">${recentInspections.map(renderInspectionListItem).join("")}</div>`
          : `<div class="empty-state"><h3>No inspections yet</h3><p>Start your first inspection to see it here.</p><a class="btn btn-primary" style="margin-top:10px" href="#/inspections/new">+ New Inspection</a></div>`}
      </div>
      <div class="sticky-side">
        <div class="section-title" style="margin-top:0">Open Issues</div>
        ${topIssues.length ? `<div class="list">${topIssues.map((iss) => `
          <a class="list-item issue-open" href="${issuesPath("open")}" style="cursor:pointer">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(iss.itemText)}</div>
              <div class="list-item-sub">${escapeHtml(iss.inspectionTitle)} · ${formatDate(iss.createdAt)}</div>
            </div>
            ${severityBadge(iss.severity)}
          </a>`).join("")}</div>`
          : `<div class="empty-state" style="padding:24px 14px;"><p style="margin:0">No open issues 🎉</p></div>`}

        <div class="section-title">Recently Resolved</div>
        ${recentResolved.length ? `<div class="list">${recentResolved.map((iss) => `
          <a class="list-item issue-resolved" href="${issuesPath("resolved")}" style="cursor:pointer">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(iss.itemText)}</div>
              <div class="list-item-sub">${escapeHtml(iss.inspectionTitle)} · Resolved ${formatDate(iss.resolvedAt)}</div>
              ${iss.resolutionNotes ? `<div class="hint" style="margin-top:4px; color:var(--success);">${escapeHtml(iss.resolutionNotes)}</div>` : ""}
            </div>
          </a>`).join("")}</div>`
          : `<div class="empty-state" style="padding:24px 14px;"><p style="margin:0">Nothing resolved yet</p></div>`}
      </div>
    </div>
  `;
}

async function renderDashboard() {
  const [inspections, issues] = await Promise.all([Store.getInspections(), Store.getIssues()]);

  contentEl.innerHTML = `
    <div class="print-header">
      <img src="logo.jpg" alt="Mission Critical Group" />
      <div>
        <div class="print-header-title">Safety Inspection Dashboard</div>
        <div class="print-header-sub">Generated ${formatDate(nowIso())}</div>
      </div>
    </div>
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p>Overview of your safety inspection program.</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn" id="dashShareBtn">🔗 Share</button>
        <button class="btn" id="dashPrintBtn">🖨 Print</button>
        <a class="btn" href="#/templates/new">+ New Template</a>
        <a class="btn btn-primary" href="#/inspections/new">+ New Inspection</a>
      </div>
    </div>

    ${buildDashboardBody({ inspections, issues, completedTarget: 12 })}
  `;

  document.getElementById("dashShareBtn").addEventListener("click", () => {
    shareLink(buildAppUrl("#/dashboard"), "Safety Inspection Dashboard", "Safety inspection dashboard");
  });
  document.getElementById("dashPrintBtn").addEventListener("click", () => window.print());
}

/* ---------------- Location dashboards ---------------- */

async function renderLocationsList() {
  const [locations, inspections, issues] = await Promise.all([Store.getLocations(), Store.getInspections(), Store.getIssues()]);
  contentEl.innerHTML = `
    <div class="page-header">
      <div><h1>Sites</h1><p>A dashboard for each site.</p></div>
    </div>
    ${locations.length ? `<div class="list">${locations.map((loc) => {
      const locInsp = inspections.filter((i) => i.location === loc.name);
      const locOpenIssues = issues.filter((i) => i.location === loc.name && i.status === "open");
      return `
        <a class="list-item ${locOpenIssues.length ? "issue-open" : ""}" href="#/locations/${encodeURIComponent(loc.name)}">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(loc.name)}</div>
            <div class="list-item-sub">${locInsp.length} inspection${locInsp.length === 1 ? "" : "s"}</div>
          </div>
          ${locOpenIssues.length ? `<span class="badge badge-danger">${locOpenIssues.length} open issue${locOpenIssues.length === 1 ? "" : "s"}</span>` : `<span class="badge badge-success">All clear</span>`}
        </a>`;
    }).join("")}</div>`
      : `<div class="empty-state"><h3>No sites yet</h3><p>Sites are added from the Site dropdown when starting an inspection.</p></div>`}
  `;
}

async function renderLocationDashboard(name) {
  const [inspectionsAll, issuesAll] = await Promise.all([Store.getInspections(), Store.getIssues()]);
  const inspections = inspectionsAll.filter((i) => i.location === name);
  const issues = issuesAll.filter((i) => i.location === name);

  contentEl.innerHTML = `
    <div class="print-header">
      <img src="logo.jpg" alt="Mission Critical Group" />
      <div>
        <div class="print-header-title">${escapeHtml(name)} — Site Dashboard</div>
        <div class="print-header-sub">Generated ${formatDate(nowIso())}</div>
      </div>
    </div>
    <div class="page-header">
      <div>
        <h1>${escapeHtml(name)}</h1>
        <p><a href="#/locations">← All Sites</a></p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn" id="locShareBtn">🔗 Share</button>
        <button class="btn" id="locPrintBtn">🖨 Print</button>
      </div>
    </div>

    ${buildDashboardBody({ inspections, issues, completedTarget: 4, locationFilter: name })}
  `;

  document.getElementById("locShareBtn").addEventListener("click", () => {
    shareLink(buildAppUrl(`#/locations/${encodeURIComponent(name)}`), `${name} Dashboard`, `Safety inspection dashboard for ${name}`);
  });
  document.getElementById("locPrintBtn").addEventListener("click", () => window.print());
}

/* ---------------- Templates List ---------------- */

async function renderTemplatesList() {
  const templates = await Store.getTemplates();
  contentEl.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Templates</h1>
        <p>Checklist templates used to run inspections.</p>
      </div>
      <a class="btn btn-primary" href="#/templates/new">+ New Template</a>
    </div>
    ${templates.length ? `<div class="list">${templates.map((t) => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(t.name)}</div>
          <div class="list-item-sub">${escapeHtml(t.description || "No description")} · ${t.items.length} item${t.items.length === 1 ? "" : "s"}</div>
        </div>
        <div class="list-item-actions">
          <a class="btn btn-sm btn-primary" href="#/inspections/new" data-start-tpl="${t.id}">Start</a>
          <a class="btn btn-sm" href="#/templates/${t.id}">Edit</a>
        </div>
      </div>`).join("")}</div>`
      : `<div class="empty-state"><h3>No templates yet</h3><p>Create a checklist template to start running inspections.</p><a class="btn btn-primary" style="margin-top:10px" href="#/templates/new">+ New Template</a></div>`}
  `;

  contentEl.querySelectorAll("[data-start-tpl]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      sessionStorage.setItem("preselectTpl", a.dataset.startTpl);
      goto("#/inspections/new");
    });
  });
}

/* ---------------- Template Editor ---------------- */

let templateDraft = null;

function freshTemplateItem(text = "", guidance = "") {
  return { id: uid("item"), text, guidance };
}

async function renderTemplateEditor(id) {
  let existing = null;
  if (id) {
    existing = await Store.getTemplate(id);
    if (!existing) {
      contentEl.innerHTML = `<div class="empty-state"><h3>Template not found</h3><a href="#/templates">Back to templates</a></div>`;
      return;
    }
  }
  templateDraft = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: null, name: "", description: "", items: [freshTemplateItem()] };

  contentEl.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${existing ? "Edit Template" : "New Template"}</h1>
        <p>Define the checklist items inspectors will go through.</p>
      </div>
    </div>
    <div class="card card-pad" style="max-width:680px">
      <div class="form-group">
        <label for="tplName">Template name</label>
        <input type="text" id="tplName" placeholder="e.g. Fire Safety Equipment Check" value="${escapeHtml(templateDraft.name)}" />
      </div>
      <div class="form-group">
        <label for="tplDesc">Description</label>
        <textarea id="tplDesc" placeholder="What does this checklist cover?">${escapeHtml(templateDraft.description)}</textarea>
      </div>
      <div class="form-group">
        <label>Checklist items</label>
        <div id="templateItemsList"></div>
        <button class="btn btn-sm" id="addItemBtn" type="button">+ Add Item</button>
      </div>
      <div class="modal-actions" style="justify-content:flex-start; margin-top:22px;">
        <button class="btn btn-primary" id="saveTplBtn">Save Template</button>
        <a class="btn" href="#/templates">Cancel</a>
      </div>
    </div>
  `;

  renderTemplateItemsRows();
  document.getElementById("tplName").addEventListener("input", (e) => { templateDraft.name = e.target.value; });
  document.getElementById("tplDesc").addEventListener("input", (e) => { templateDraft.description = e.target.value; });
  document.getElementById("addItemBtn").addEventListener("click", () => {
    templateDraft.items.push(freshTemplateItem());
    renderTemplateItemsRows();
  });
  document.getElementById("saveTplBtn").addEventListener("click", async () => {
    const name = templateDraft.name.trim();
    if (!name) { showToast("Please enter a template name"); document.getElementById("tplName").focus(); return; }
    templateDraft.items = templateDraft.items.map((it) => ({ ...it, text: it.text.trim(), guidance: (it.guidance || "").trim() })).filter((it) => it.text);
    if (!templateDraft.items.length) { showToast("Add at least one checklist item"); return; }
    templateDraft.name = name;
    templateDraft.description = templateDraft.description.trim();
    const btn = document.getElementById("saveTplBtn");
    btn.disabled = true;
    try {
      await Store.saveTemplate(templateDraft);
      showToast("Template saved");
      goto("#/templates");
    } catch (err) {
      console.error(err);
      showToast("Save failed — check your connection");
      btn.disabled = false;
    }
  });
}

function renderTemplateItemsRows() {
  const container = document.getElementById("templateItemsList");
  if (!container) return;
  container.innerHTML = templateDraft.items.map((it, idx) => `
    <div class="item-row" data-idx="${idx}">
      <div style="display:flex; flex-direction:column; gap:2px; padding-top:2px;">
        <button class="btn btn-sm btn-ghost" data-move="up" data-idx="${idx}" ${idx === 0 ? "disabled" : ""} title="Move up" style="padding:2px 6px;">↑</button>
        <button class="btn btn-sm btn-ghost" data-move="down" data-idx="${idx}" ${idx === templateDraft.items.length - 1 ? "disabled" : ""} title="Move down" style="padding:2px 6px;">↓</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
        <input type="text" data-item-text data-idx="${idx}" value="${escapeHtml(it.text)}" placeholder="Checklist item text" />
        <input type="text" data-item-guidance data-idx="${idx}" value="${escapeHtml(it.guidance || "")}" placeholder="Guidance for inspectors (optional) — what to check, how to verify" style="font-size:12.5px; color:var(--text-muted);" />
      </div>
      <button class="btn btn-sm btn-ghost" data-remove-idx="${idx}" title="Remove item" style="color:var(--danger)">✕</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-item-text]").forEach((input) => {
    input.addEventListener("input", () => {
      templateDraft.items[+input.dataset.idx].text = input.value;
    });
  });
  container.querySelectorAll("[data-item-guidance]").forEach((input) => {
    input.addEventListener("input", () => {
      templateDraft.items[+input.dataset.idx].guidance = input.value;
    });
  });
  container.querySelectorAll("[data-remove-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      templateDraft.items.splice(+btn.dataset.removeIdx, 1);
      renderTemplateItemsRows();
    });
  });
  container.querySelectorAll("[data-move]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = +btn.dataset.idx;
      const dir = btn.dataset.move === "up" ? -1 : 1;
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= templateDraft.items.length) return;
      [templateDraft.items[idx], templateDraft.items[swapWith]] = [templateDraft.items[swapWith], templateDraft.items[idx]];
      renderTemplateItemsRows();
    });
  });
}

/* ---------------- New Inspection picker ---------------- */

async function renderNewInspection() {
  const [templates, inspectors, locations, workAreas] = await Promise.all([Store.getTemplates(), Store.getInspectors(), Store.getLocations(), Store.getWorkAreas()]);
  if (!templates.length) {
    contentEl.innerHTML = `<div class="page-header"><div><h1>New Inspection</h1></div></div>
      <div class="empty-state"><h3>No templates yet</h3><p>Create a checklist template first.</p><a class="btn btn-primary" style="margin-top:10px" href="#/templates/new">+ New Template</a></div>`;
    return;
  }
  const preselect = sessionStorage.getItem("preselectTpl") || templates[0].id;
  const today = new Date().toISOString().slice(0, 10);
  contentEl.innerHTML = `
    <div class="page-header"><div><h1>New Inspection</h1><p>Choose a checklist and enter the inspection details.</p></div></div>
    <div class="card card-pad" style="max-width:560px">
      <div class="form-group">
        <label for="niTemplate">Checklist template</label>
        <select id="niTemplate">
          ${templates.map((t) => `<option value="${t.id}" ${t.id === preselect ? "selected" : ""}>${escapeHtml(t.name)} (${t.items.length} items)</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label for="niTitle">Inspection title</label>
        <input type="text" id="niTitle" placeholder="e.g. Warehouse A — July Fire Check" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="niInspector">Inspector name</label>
          <select id="niInspector">${selectOptionsHtml(inspectors, "")}</select>
        </div>
        <div class="form-group">
          <label for="niDate">Date</label>
          <input type="date" id="niDate" value="${today}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="niLocation">Site</label>
          <select id="niLocation">${selectOptionsHtml(locations, "")}</select>
        </div>
        <div class="form-group">
          <label for="niWorkArea">Work Area</label>
          <select id="niWorkArea">${selectOptionsHtml(workAreas, "")}</select>
        </div>
      </div>
      <div class="modal-actions" style="justify-content:flex-start; margin-top:22px;">
        <button class="btn btn-primary" id="startInspectionBtn">Start Inspection</button>
        <a class="btn" href="#/dashboard">Cancel</a>
      </div>
    </div>
  `;
  sessionStorage.removeItem("preselectTpl");

  const templateSelect = document.getElementById("niTemplate");
  const titleInput = document.getElementById("niTitle");
  function suggestTitle() {
    const tpl = templates.find((t) => t.id === templateSelect.value);
    if (tpl && !titleInput.dataset.touched) titleInput.value = `${tpl.name} — ${formatDate(new Date().toISOString())}`;
  }
  suggestTitle();
  templateSelect.addEventListener("change", suggestTitle);
  titleInput.addEventListener("input", () => { titleInput.dataset.touched = "1"; });
  wirePickOrAddSelect(document.getElementById("niInspector"), "New inspector name:", Store.addInspector, () => {});
  wirePickOrAddSelect(document.getElementById("niLocation"), "New site:", Store.addLocation, () => {});
  wirePickOrAddSelect(document.getElementById("niWorkArea"), "New work area:", Store.addWorkArea, () => {});

  document.getElementById("startInspectionBtn").addEventListener("click", async () => {
    const tpl = templates.find((t) => t.id === templateSelect.value);
    if (!tpl) { showToast("Please choose a template"); return; }
    const title = titleInput.value.trim() || tpl.name;
    const inspector = document.getElementById("niInspector").value.trim();
    const location_ = document.getElementById("niLocation").value.trim();
    const workArea = document.getElementById("niWorkArea").value.trim();
    const date = document.getElementById("niDate").value || new Date().toISOString().slice(0, 10);

    const insp = {
      id: null,
      templateId: tpl.id,
      templateName: tpl.name,
      title,
      inspector,
      location: location_,
      workArea,
      date,
      status: "in-progress",
      items: tpl.items.map((it) => ({ id: it.id, text: it.text, guidance: it.guidance || "", result: null, notes: "", photos: [] })),
      createdAt: nowIso(),
      completedAt: null,
    };
    const btn = document.getElementById("startInspectionBtn");
    btn.disabled = true;
    try {
      await Store.saveInspection(insp);
      showToast("Inspection started");
      goto(`#/inspections/${insp.id}/run`);
    } catch (err) {
      console.error(err);
      showToast("Could not start inspection — check your connection");
      btn.disabled = false;
    }
  });
}

/* ---------------- Inspection Run (fill out checklist) ---------------- */

let saveTimer = null;

function scheduleInspectionSave(insp) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    Store.saveInspection(insp).catch((err) => { console.error(err); showToast("Save failed — check your connection"); });
  }, 700);
}

async function flushInspectionSave(insp) {
  clearTimeout(saveTimer);
  saveTimer = null;
  await Store.saveInspection(insp);
}

async function renderInspectionRun(id) {
  const [insp, inspectors, locations, workAreas] = await Promise.all([Store.getInspection(id), Store.getInspectors(), Store.getLocations(), Store.getWorkAreas()]);
  if (!insp) { contentEl.innerHTML = `<div class="empty-state"><h3>Inspection not found</h3><a href="#/inspections">Back to history</a></div>`; return; }
  const answered = insp.items.filter((it) => it.result).length;
  const pct = insp.items.length ? Math.round((answered / insp.items.length) * 100) : 0;

  contentEl.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${escapeHtml(insp.title)}</h1>
        <p>${escapeHtml(insp.templateName)} · ${statusBadge(insp.status)}</p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn" id="saveExitBtn">Save &amp; Exit</button>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:20px;">
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0">
          <label for="riInspector">Inspector</label>
          <select id="riInspector">${selectOptionsHtml(inspectors, insp.inspector)}</select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label for="riLocation">Site</label>
          <select id="riLocation">${selectOptionsHtml(locations, insp.location)}</select>
        </div>
      </div>
      <div class="form-row" style="margin-top:14px;">
        <div class="form-group" style="margin-bottom:0">
          <label for="riWorkArea">Work Area</label>
          <select id="riWorkArea">${selectOptionsHtml(workAreas, insp.workArea)}</select>
        </div>
        <div class="form-group" style="margin-bottom:0; max-width:220px;">
          <label for="riDate">Date</label>
          <input type="date" id="riDate" value="${escapeHtml(insp.date)}" />
        </div>
      </div>
    </div>

    <div class="progress-bar"><div class="progress-bar-fill" id="progressFill" style="width:${pct}%"></div></div>
    <p class="hint" id="progressLabel" style="margin-top:-14px; margin-bottom:16px;">${answered} of ${insp.items.length} items answered</p>

    <div id="checklistItems"></div>

    <div class="modal-actions" style="justify-content:flex-end; margin-top:8px;">
      <button class="btn" id="saveExitBtn2">Save &amp; Exit</button>
      <button class="btn btn-primary" id="completeBtn">Complete Inspection</button>
    </div>

    <input type="file" id="photoInput" accept="image/*" capture="environment" multiple hidden />
  `;

  renderChecklistItems(insp);

  wirePickOrAddSelect(document.getElementById("riInspector"), "New inspector name:", Store.addInspector, (val) => { insp.inspector = val; scheduleInspectionSave(insp); });
  wirePickOrAddSelect(document.getElementById("riLocation"), "New site:", Store.addLocation, (val) => { insp.location = val; scheduleInspectionSave(insp); });
  wirePickOrAddSelect(document.getElementById("riWorkArea"), "New work area:", Store.addWorkArea, (val) => { insp.workArea = val; scheduleInspectionSave(insp); });
  document.getElementById("riDate").addEventListener("input", (e) => { insp.date = e.target.value; scheduleInspectionSave(insp); });

  document.getElementById("photoInput").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    const itemId = e.target.dataset.forItem;
    const item = insp.items.find((i) => i.id === itemId);
    if (!item || !files.length) return;
    for (const file of files) {
      try {
        showToast("Uploading photo…", 1500);
        const blob = await compressImageToBlob(file);
        const photo = await Store.uploadPhoto(insp.id, itemId, blob);
        item.photos.push(photo);
      } catch (err) {
        console.error(err);
        showToast("Photo upload failed");
      }
    }
    renderChecklistItems(insp);
  });

  const saveExitBtns = [document.getElementById("saveExitBtn"), document.getElementById("saveExitBtn2")];
  saveExitBtns.forEach((btn) => btn.addEventListener("click", async () => {
    saveExitBtns.forEach((b) => { b.disabled = true; });
    try {
      await flushInspectionSave(insp);
      showToast("Progress saved");
      goto("#/inspections");
    } catch (err) {
      console.error(err);
      showToast("Save failed — check your connection");
      saveExitBtns.forEach((b) => { b.disabled = false; });
    }
  }));

  document.getElementById("completeBtn").addEventListener("click", async () => {
    const unanswered = insp.items.filter((it) => !it.result).length;
    if (unanswered > 0) {
      showToast(`${unanswered} item${unanswered === 1 ? "" : "s"} still need${unanswered === 1 ? "s" : ""} a response`);
      return;
    }
    const missingNotes = insp.items.filter((it) => it.result === "fail" && !it.notes.trim());
    if (missingNotes.length > 0) {
      showToast(`${missingNotes.length} failed item${missingNotes.length === 1 ? "" : "s"} need${missingNotes.length === 1 ? "s" : ""} a note explaining the issue`);
      const badTextarea = document.querySelector(`textarea[data-item="${missingNotes[0].id}"]`);
      if (badTextarea) {
        badTextarea.classList.add("input-required");
        badTextarea.scrollIntoView({ behavior: "smooth", block: "center" });
        badTextarea.focus();
      }
      return;
    }
    const btn = document.getElementById("completeBtn");
    btn.disabled = true;
    insp.status = "completed";
    insp.completedAt = nowIso();
    try {
      await flushInspectionSave(insp);
      await Store.syncIssuesFromInspection(insp);
      const failCount = insp.items.filter((it) => it.result === "fail").length;
      showToast(failCount ? `Inspection completed — ${failCount} issue${failCount === 1 ? "" : "s"} logged` : "Inspection completed — all clear");
      goto(`#/inspections/${insp.id}`);
    } catch (err) {
      console.error(err);
      showToast("Could not complete inspection — check your connection");
      insp.status = "in-progress";
      insp.completedAt = null;
      btn.disabled = false;
    }
  });
}

function renderChecklistItems(insp) {
  const container = document.getElementById("checklistItems");
  if (!container) return;
  container.innerHTML = insp.items.map((it) => `
    <div class="checklist-item">
      <div class="checklist-item-head">
        <div class="checklist-item-text">${escapeHtml(it.text)}</div>
      </div>
      ${it.guidance ? `<div class="checklist-item-guidance">💡 ${escapeHtml(it.guidance)}</div>` : ""}
      <div class="result-toggles">
        <button class="toggle-btn pass ${it.result === "pass" ? "active" : ""}" data-result="pass" data-item="${it.id}">✓ Pass</button>
        <button class="toggle-btn fail ${it.result === "fail" ? "active" : ""}" data-result="fail" data-item="${it.id}">✕ Fail</button>
        <button class="toggle-btn na ${it.result === "na" ? "active" : ""}" data-result="na" data-item="${it.id}">— N/A</button>
      </div>
      <textarea data-notes data-item="${it.id}" placeholder="${it.result === "fail" ? "Describe the issue (required)" : "Notes (optional)"}" class="${it.result === "fail" && !it.notes.trim() ? "input-required" : ""}">${escapeHtml(it.notes)}</textarea>
      <div class="photo-row" data-photo-row="${it.id}">
        ${it.photos.map((p) => `
          <div class="photo-thumb">
            <img src="${p.url}" data-photo-view="${it.id}" />
            <button data-photo-remove="${it.id}" data-photo-id="${p.photoId}" title="Remove photo">✕</button>
          </div>`).join("")}
        <div class="photo-add" data-photo-add="${it.id}" title="Add photo">📷</div>
      </div>
    </div>
  `).join("");

  const progressFill = document.getElementById("progressFill");
  const progressLabel = document.getElementById("progressLabel");
  const answered = insp.items.filter((it) => it.result).length;
  if (progressFill) progressFill.style.width = `${insp.items.length ? Math.round((answered / insp.items.length) * 100) : 0}%`;
  if (progressLabel) progressLabel.textContent = `${answered} of ${insp.items.length} items answered`;

  container.querySelectorAll("[data-result]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = insp.items.find((i) => i.id === btn.dataset.item);
      item.result = item.result === btn.dataset.result ? null : btn.dataset.result;
      renderChecklistItems(insp);
      try { await Store.saveInspection(insp); } catch (err) { console.error(err); showToast("Save failed — check your connection"); }
    });
  });
  container.querySelectorAll("[data-notes]").forEach((ta) => {
    ta.addEventListener("input", () => {
      const item = insp.items.find((i) => i.id === ta.dataset.item);
      item.notes = ta.value;
      if (item.result === "fail") ta.classList.toggle("input-required", !ta.value.trim());
      scheduleInspectionSave(insp);
    });
  });
  container.querySelectorAll("[data-photo-add]").forEach((el) => {
    el.addEventListener("click", () => {
      const input = document.getElementById("photoInput");
      input.dataset.forItem = el.dataset.photoAdd;
      input.value = "";
      input.click();
    });
  });
  container.querySelectorAll("[data-photo-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = insp.items.find((i) => i.id === btn.dataset.photoRemove);
      const photoId = btn.dataset.photoId;
      item.photos = item.photos.filter((p) => p.photoId !== photoId);
      renderChecklistItems(insp);
      try { await Store.deletePhoto(photoId); } catch (err) { console.error(err); showToast("Could not remove photo"); }
    });
  });
  container.querySelectorAll("[data-photo-view]").forEach((img) => {
    img.addEventListener("click", () => window.open(img.src, "_blank"));
  });
}

/* ---------------- Inspection Report (read-only) ---------------- */

function buildAppUrl(hash) {
  return `${location.origin}${location.pathname}${hash}`;
}

function buildInspectionUrl(id) {
  return buildAppUrl(`#/inspections/${id}`);
}

async function shareLink(url, title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); }
    catch (e) { /* user cancelled the share sheet */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast("Link copied — recipient will need access to connect");
  } catch (e) {
    window.prompt("Copy this link:", url);
  }
}

async function shareInspection(insp) {
  await shareLink(buildInspectionUrl(insp.id), insp.title, `Safety inspection: ${insp.title}`);
}

async function renderInspectionReport(id) {
  const insp = await Store.getInspection(id);
  if (!insp) { contentEl.innerHTML = `<div class="empty-state"><h3>Inspection not found</h3><a href="#/inspections">Back to history</a></div>`; return; }

  if (insp.status === "in-progress") {
    contentEl.innerHTML = `
      <div class="page-header">
        <div><h1>${escapeHtml(insp.title)}</h1><p>${escapeHtml(insp.templateName)} · ${statusBadge(insp.status)}</p></div>
        <div style="display:flex; gap:8px;">
          <button class="btn" id="shareBtn">🔗 Share</button>
          <a class="btn btn-primary" href="#/inspections/${insp.id}/run">Continue Inspection</a>
        </div>
      </div>
      <div class="empty-state"><h3>Still in progress</h3><p>This inspection hasn't been completed yet.</p></div>
    `;
    document.getElementById("shareBtn").addEventListener("click", () => shareInspection(insp));
    return;
  }

  const pass = insp.items.filter((it) => it.result === "pass").length;
  const fail = insp.items.filter((it) => it.result === "fail").length;
  const na = insp.items.filter((it) => it.result === "na").length;
  const score = scoreFor(insp.items);

  contentEl.innerHTML = `
    <div class="print-header">
      <img src="logo.jpg" alt="Mission Critical Group" />
      <div>
        <div class="print-header-title">${escapeHtml(insp.title)}</div>
        <div class="print-header-sub">${escapeHtml(insp.templateName)} · ${escapeHtml(insp.inspector || "Unassigned")} · ${escapeHtml(insp.location || "No site")}${insp.workArea ? " · " + escapeHtml(insp.workArea) : ""} · ${formatDate(insp.date)}</div>
      </div>
    </div>
    <div class="page-header">
      <div>
        <h1>${escapeHtml(insp.title)}</h1>
        <p>${escapeHtml(insp.templateName)} · ${escapeHtml(insp.inspector || "Unassigned")} · ${escapeHtml(insp.location || "No site")}${insp.workArea ? " · " + escapeHtml(insp.workArea) : ""} · ${formatDate(insp.date)}</p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn" id="shareBtn">🔗 Share</button>
        <button class="btn" id="printBtn">🖨 Print / Save PDF</button>
        <button class="btn btn-ghost" id="deleteInspBtn" style="color:var(--danger)">Delete</button>
      </div>
    </div>

    <div class="grid-stats">
      <div class="card stat-card"><div class="stat-label">Score</div><div class="stat-value">${score === null ? "—" : score + "%"}</div></div>
      <div class="card stat-card"><div class="stat-label">Passed</div><div class="stat-value" style="color:var(--success)">${pass}</div></div>
      <div class="card stat-card"><div class="stat-label">Failed</div><div class="stat-value" style="color:var(--danger)">${fail}</div></div>
      <div class="card stat-card"><div class="stat-label">N/A</div><div class="stat-value">${na}</div></div>
    </div>

    <div class="card card-pad">
      ${insp.items.map((it) => `
        <div class="report-item">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
            <div style="font-weight:600; font-size:14.5px;">${escapeHtml(it.text)}</div>
            ${resultBadge(it.result)}
          </div>
          ${it.notes ? `<div class="hint" style="margin-top:6px;">${escapeHtml(it.notes)}</div>` : ""}
          ${it.photos && it.photos.length ? `<div class="photo-row">${it.photos.map((p) => `<div class="photo-thumb"><img src="${p.url}" /></div>`).join("")}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;

  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) shareBtn.addEventListener("click", () => shareInspection(insp));
  const printBtn = document.getElementById("printBtn");
  if (printBtn) printBtn.addEventListener("click", () => window.print());
  const delBtn = document.getElementById("deleteInspBtn");
  if (delBtn) {
    delBtn.addEventListener("click", () => {
      confirmDialog({
        title: "Delete inspection?",
        message: "This will also remove any issues logged from this inspection.",
        onConfirm: async () => {
          try { await Store.deleteInspection(id); showToast("Inspection deleted"); goto("#/inspections"); }
          catch (err) { console.error(err); showToast("Delete failed — check your connection"); }
        },
      });
    });
  }
}

/* ---------------- Inspections History ---------------- */

let historyFilters = { search: "", status: "all", template: "all", location: "all" };

async function renderInspectionsHistory() {
  const [all, templates, locations] = await Promise.all([Store.getInspections(), Store.getTemplates(), Store.getLocations()]);
  const q = historyFilters.search.trim().toLowerCase();
  const filtered = all.filter((i) => {
    if (historyFilters.status !== "all" && i.status !== historyFilters.status) return false;
    if (historyFilters.template !== "all" && i.templateId !== historyFilters.template) return false;
    if (historyFilters.location !== "all" && i.location !== historyFilters.location) return false;
    if (q && !(`${i.title} ${i.inspector} ${i.location}`.toLowerCase().includes(q))) return false;
    return true;
  });

  contentEl.innerHTML = `
    <div class="page-header">
      <div><h1>Inspection History</h1><p>${all.length} total inspection${all.length === 1 ? "" : "s"}</p></div>
      <a class="btn btn-primary" href="#/inspections/new">+ New Inspection</a>
    </div>
    <div class="toolbar">
      <input type="search" id="histSearch" placeholder="Search by title, inspector, site…" value="${escapeHtml(historyFilters.search)}" style="max-width:260px" />
      <select id="histStatus" style="max-width:160px">
        <option value="all" ${historyFilters.status === "all" ? "selected" : ""}>All statuses</option>
        <option value="completed" ${historyFilters.status === "completed" ? "selected" : ""}>Completed</option>
        <option value="in-progress" ${historyFilters.status === "in-progress" ? "selected" : ""}>In Progress</option>
      </select>
      <select id="histTemplate" style="max-width:220px">
        <option value="all">All templates</option>
        ${templates.map((t) => `<option value="${t.id}" ${historyFilters.template === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}
      </select>
      <select id="histLocation" style="max-width:180px">
        <option value="all">All sites</option>
        ${locations.map((l) => `<option value="${escapeHtml(l.name)}" ${historyFilters.location === l.name ? "selected" : ""}>${escapeHtml(l.name)}</option>`).join("")}
      </select>
    </div>
    ${filtered.length ? `<div class="list">${filtered.map(renderInspectionListItem).join("")}</div>`
      : `<div class="empty-state"><h3>No inspections match</h3><p>Try adjusting your filters.</p></div>`}
  `;

  document.getElementById("histSearch").addEventListener("input", (e) => { historyFilters.search = e.target.value; render(); });
  document.getElementById("histStatus").addEventListener("change", (e) => { historyFilters.status = e.target.value; render(); });
  document.getElementById("histTemplate").addEventListener("change", (e) => { historyFilters.template = e.target.value; render(); });
  document.getElementById("histLocation").addEventListener("change", (e) => { historyFilters.location = e.target.value; render(); });
}

/* ---------------- Issues ---------------- */

let issuesTab = "open";
let issuesLocationFilter = null;

async function renderIssues() {
  const allSites = await Store.getIssues();
  const all = issuesLocationFilter ? allSites.filter((i) => i.location === issuesLocationFilter) : allSites;
  const open = all.filter((i) => i.status === "open");
  const resolved = all.filter((i) => i.status === "resolved");
  const shown = issuesTab === "open" ? open : issuesTab === "resolved" ? resolved : all;

  contentEl.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Issues</h1>
        <p>${issuesLocationFilter
          ? `Failed items at <strong>${escapeHtml(issuesLocationFilter)}</strong>. <a href="#/issues/${issuesTab}">Show all sites</a>`
          : "Failed items from inspections, tracked until resolved."}</p>
      </div>
    </div>
    <div class="tabs">
      <button class="tab-btn ${issuesTab === "open" ? "active" : ""}" data-tab="open">Open (${open.length})</button>
      <button class="tab-btn ${issuesTab === "resolved" ? "active" : ""}" data-tab="resolved">Resolved (${resolved.length})</button>
      <button class="tab-btn ${issuesTab === "all" ? "active" : ""}" data-tab="all">All (${all.length})</button>
    </div>
    ${shown.length ? `<div class="list">${shown.map((iss) => `
      <div class="card card-pad ${iss.status === "open" ? "card-issue-open" : ""}">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div style="min-width:0;">
            <div class="list-item-title">${escapeHtml(iss.itemText)}</div>
            <div class="list-item-sub">
              <a href="#/inspections/${iss.inspectionId}">${escapeHtml(iss.inspectionTitle)}</a>
              ${iss.location ? " · " + escapeHtml(iss.location) : ""} · ${formatDate(iss.createdAt)}
            </div>
            ${iss.description ? `<div class="hint" style="margin-top:6px;">${escapeHtml(iss.description)}</div>` : ""}
            ${iss.photo ? `<div class="photo-row"><div class="photo-thumb"><img src="${iss.photo}"/></div></div>` : ""}
            ${iss.status === "resolved" && iss.resolutionNotes ? `<div class="hint" style="margin-top:6px; color:var(--success)">Resolution: ${escapeHtml(iss.resolutionNotes)}</div>` : ""}
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end; flex-shrink:0;">
            <select data-severity="${iss.id}" style="width:auto; padding:5px 8px; font-size:12.5px;">
              <option value="low" ${iss.severity === "low" ? "selected" : ""}>Low</option>
              <option value="medium" ${iss.severity === "medium" ? "selected" : ""}>Medium</option>
              <option value="high" ${iss.severity === "high" ? "selected" : ""}>High</option>
            </select>
            ${iss.status === "open"
              ? `<button class="btn btn-sm btn-primary" data-resolve="${iss.id}">Mark Resolved</button>`
              : `<button class="btn btn-sm" data-reopen="${iss.id}">Reopen</button>`}
          </div>
        </div>
      </div>`).join("")}</div>`
      : `<div class="empty-state"><h3>Nothing here</h3><p>${issuesTab === "open" ? "No open issues right now." : "No issues in this view."}</p></div>`}
  `;

  contentEl.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      goto(`#/issues/${btn.dataset.tab}${issuesLocationFilter ? "/" + encodeURIComponent(issuesLocationFilter) : ""}`);
    });
  });
  contentEl.querySelectorAll("[data-severity]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const issue = all.find((i) => i.id === sel.dataset.severity);
      issue.severity = sel.value;
      try { await Store.saveIssue(issue); } catch (err) { console.error(err); showToast("Save failed — check your connection"); }
    });
  });
  contentEl.querySelectorAll("[data-resolve]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const issue = all.find((i) => i.id === btn.dataset.resolve);
      openResolveModal(issue);
    });
  });
  contentEl.querySelectorAll("[data-reopen]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const issue = all.find((i) => i.id === btn.dataset.reopen);
      issue.status = "open";
      issue.resolvedAt = null;
      try { await Store.saveIssue(issue); showToast("Issue reopened"); render(); }
      catch (err) { console.error(err); showToast("Update failed — check your connection"); }
    });
  });
}

function openResolveModal(issue) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Resolve issue</h3>
      <p class="hint" style="margin-top:-6px;">${escapeHtml(issue.itemText)}</p>
      <div class="form-group">
        <label for="resolveNotes">Resolution notes</label>
        <textarea id="resolveNotes" placeholder="What was done to fix this?"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn" id="resolveCancel">Cancel</button>
        <button class="btn btn-primary" id="resolveConfirm">Mark Resolved</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("#resolveCancel").onclick = () => backdrop.remove();
  backdrop.querySelector("#resolveConfirm").onclick = async () => {
    issue.status = "resolved";
    issue.resolvedAt = nowIso();
    issue.resolutionNotes = backdrop.querySelector("#resolveNotes").value.trim();
    try {
      await Store.saveIssue(issue);
      backdrop.remove();
      showToast("Issue resolved");
      render();
    } catch (err) {
      console.error(err);
      showToast("Update failed — check your connection");
    }
  };
}

/* ---------------- init ---------------- */

document.addEventListener("DOMContentLoaded", boot);
