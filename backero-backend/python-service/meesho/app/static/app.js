/* Meesho Seller Command Center — frontend helpers + page logic.
 * All data comes from /api/*; pages are shells rendered by Flask. */
"use strict";

const App = (() => {

  // ---------------- fetch helpers ----------------

  async function getJSON(url) {
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    return r.json();
  }

  async function postJSON(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body || {}),
    });
    return r.json();
  }

  async function postForm(url, formData) {
    const r = await fetch(url, { method: "POST", body: formData });
    return r.json();
  }

  // ---------------- small utils ----------------

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const fmt = (n) => (n == null || isNaN(n)) ? "–" : Number(n).toLocaleString("en-IN");

  const el = (id) => document.getElementById(id);

  function ragChip(rag) {
    const r = (rag || "green").toLowerCase();
    return `<span class="chip chip-${esc(r)}">${esc(r)}</span>`;
  }

  function prioTag(p) {
    return `<span class="prio prio-${esc(p || "")}">${esc(p || "")}</span>`;
  }

  function sevTag(s) {
    return `<span class="sev sev-${esc(s || "")}">${esc(s || "")}</span>`;
  }

  function setMsg(id, text, ok) {
    const m = el(id);
    if (!m) return;
    m.textContent = text || "";
    m.className = "form-msg" + (ok === true ? " ok" : ok === false ? " err" : "");
  }

  // ---------------- chart builders ----------------

  const PALETTE = {
    accent: "#570D48",
    brown: "#8a5a44",
    green: "#1B8A5A",
    amber: "#D9A400",
    red: "#C0392B",
    grid: "#e8ddd1",
    ink: "#6f615c",
  };

  function lineChart(canvasId, labels, datasets, opts) {
    const c = el(canvasId);
    if (!c || typeof Chart === "undefined") return null;
    return new Chart(c.getContext("2d"), {
      type: "line",
      data: { labels, datasets },
      options: Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { ticks: { maxTicksLimit: 10, color: PALETTE.ink }, grid: { color: PALETTE.grid } },
          y: { beginAtZero: true, ticks: { color: PALETTE.ink }, grid: { color: PALETTE.grid } },
        },
      }, opts || {}),
    });
  }

  function ds(label, data, color, extra) {
    return Object.assign({
      label, data,
      borderColor: color,
      backgroundColor: color,
      tension: 0.25,
      pointRadius: 1.5,
      borderWidth: 2,
      spanGaps: true,
    }, extra || {});
  }

  function thresholdLine(label, value, color) {
    return {
      label,
      data: null, // filled by caller via fillConst
      borderColor: color,
      borderDash: [6, 5],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
    };
  }

  function fillConst(n, v) { return Array(n).fill(v); }

  // ---------------- alert ping (badge + WebAudio beep) ----------------

  let lastPingCount = null;
  let soundEnabled = true;
  let audioCtx = null;

  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.setValueAtTime(660, t + 0.18);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.75);
    } catch (e) { /* audio unavailable — ignore */ }
  }

  async function refreshSettingsCache() {
    try {
      const d = await getJSON("/api/settings");
      const s = (d && d.settings) || {};
      const alerts = s.alerts || {};
      soundEnabled = alerts.sound !== false;
    } catch (e) { /* keep last known */ }
  }

  async function alertPing() {
    let d;
    try {
      d = await getJSON("/api/alert_ping");
    } catch (e) { return; }
    if (!d || d.ok === false) return;
    const n = Number(d.unacked_critical) || 0;
    const badge = el("alert-badge");
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = n;
    }
    if (lastPingCount !== null && n > lastPingCount && soundEnabled) beep();
    lastPingCount = n;
  }

  function startAlertPing() {
    refreshSettingsCache();
    alertPing();
    setInterval(alertPing, 30000);
    setInterval(refreshSettingsCache, 5 * 60000);
  }

  // ---------------- dashboard ----------------

  async function initDashboard() {
    let d;
    try {
      d = await getJSON("/api/overview");
    } catch (e) {
      d = { ok: false, error: String(e) };
    }
    if (!d || d.ok === false) {
      el("top-issues").innerHTML =
        `<li class="muted">Could not load overview: ${esc(d && d.error || "network error")}</li>`;
      return;
    }
    const k = d.kpis || {};
    el("kpi-listings").textContent = fmt(k.listings);
    el("kpi-live").textContent = fmt(k.live);
    el("kpi-blocked").textContent = fmt(k.blocked);
    el("kpi-orders").textContent = fmt(k.orders_7d);
    el("kpi-impressions").textContent = fmt(k.impressions_7d);
    el("kpi-qs").textContent = k.avg_quality_score != null ? k.avg_quality_score : "–";
    el("kpi-rating").textContent = k.avg_rating != null ? k.avg_rating : "–";
    el("kpi-critical").textContent = fmt(k.open_critical_alerts);
    el("open-recs-note").textContent =
      `· ${fmt(k.open_recs)} open recommendations overall`;

    const t = d.trends || { dates: [], impressions: [], orders: [], quality_score: [] };
    lineChart("chart-traffic", t.dates, [
      ds("Impressions", t.impressions, PALETTE.accent),
      ds("Orders", t.orders, PALETTE.brown),
    ]);
    const qsWarn = thresholdLine("warn 15", null, PALETTE.amber);
    qsWarn.data = fillConst(t.dates.length, 15);
    const qsBlock = thresholdLine("block 25", null, PALETTE.red);
    qsBlock.data = fillConst(t.dates.length, 25);
    lineChart("chart-qs", t.dates, [
      ds("Avg quality score", t.quality_score, PALETTE.accent),
      qsWarn, qsBlock,
    ]);

    const issues = d.top_issues || [];
    el("top-issues").innerHTML = issues.length
      ? issues.map(a =>
          `<li>${sevTag(a.severity)} <strong>${esc(a.code || "")}</strong> ${esc(a.message || "")}
             <span class="muted">· ${esc((a.ts || "").slice(0, 16))}</span></li>`).join("")
      : `<li class="muted">No recent alerts — all clear.</li>`;
  }

  // ---------------- listings ----------------

  let listingsData = [];
  let sortKey = "rag";
  let sortDir = 1;
  const RAG_ORDER = { red: 0, amber: 1, green: 2 };

  function renderListings() {
    const tbody = el("listings-body");
    if (!listingsData.length) {
      tbody.innerHTML = `<tr><td colspan="14" class="muted">No listings yet — check the Sources page.</td></tr>`;
      return;
    }
    const rows = listingsData.slice().sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === "rag") { va = RAG_ORDER[va] ?? 3; vb = RAG_ORDER[vb] ?? 3; }
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string") return sortDir * va.localeCompare(String(vb));
      return sortDir * ((va || 0) - (vb || 0));
    });
    tbody.innerHTML = rows.map(l => `
      <tr onclick="location.href='/listing/${l.id}'">
        <td>${ragChip(l.rag)}</td>
        <td>${esc(l.name)}</td>
        <td>${esc(l.catalog_id)}</td>
        <td>${esc(l.category)}</td>
        <td>${l.price != null ? "₹" + fmt(l.price) : "–"}</td>
        <td>${esc(l.status)}</td>
        <td>${l.rating != null ? l.rating : "–"}</td>
        <td>${l.quality_score != null ? l.quality_score : "–"}</td>
        <td>${l.stock != null ? fmt(l.stock) : "–"}</td>
        <td>${fmt(l.impressions_7d)}</td>
        <td>${fmt(l.orders_7d)}</td>
        <td>${l.ctr}</td>
        <td>${l.cvr}</td>
        <td>${fmt(l.open_recs)}</td>
      </tr>`).join("");
  }

  async function initListings() {
    document.querySelectorAll("#listings-table th[data-key]").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (sortKey === key) { sortDir *= -1; } else { sortKey = key; sortDir = 1; }
        renderListings();
      });
    });
    let d;
    try {
      d = await getJSON("/api/listings");
    } catch (e) {
      d = { ok: false, error: String(e) };
    }
    if (!Array.isArray(d)) {
      el("listings-body").innerHTML =
        `<tr><td colspan="14" class="muted">Could not load listings: ${esc(d && d.error || "error")}</td></tr>`;
      return;
    }
    listingsData = d;
    renderListings();
  }

  // ---------------- listing detail ----------------

  async function initListing(id) {
    let d;
    try {
      d = await getJSON(`/api/listings/${id}`);
    } catch (e) {
      d = { ok: false, error: String(e) };
    }
    if (!d || d.ok === false) {
      el("listing-title").textContent = `Listing #${id}`;
      el("listing-sub").textContent = "Could not load: " + (d && d.error || "error");
      el("listing-recs").innerHTML = "";
      el("listing-alerts").innerHTML = "";
      return;
    }
    const l = d.listing || {};
    el("listing-title").textContent = l.name || `Listing #${id}`;
    el("listing-sub").textContent =
      `Catalog ${l.catalog_id || "–"} · ${l.category || "–"} · ₹${fmt(l.price)} · ` +
      `status: ${l.status || "–"} · rating ${l.rating != null ? l.rating : "–"} · ` +
      `QS ${l.quality_score != null ? l.quality_score : "–"} · stock ${l.stock != null ? l.stock : "–"}` +
      (l.ndd ? " · NDD" : "") + (l.is_ad ? " · ads on" : "");

    const s = d.series || {};
    lineChart("chart-l-traffic", s.dates || [], [
      ds("Impressions", s.impressions || [], PALETTE.accent),
      ds("Views", s.views || [], PALETTE.brown),
      ds("Orders", s.orders || [], PALETTE.green),
    ]);
    const n = (s.dates || []).length;
    const w = thresholdLine("warn 15", null, PALETTE.amber); w.data = fillConst(n, 15);
    const b = thresholdLine("block 25", null, PALETTE.red); b.data = fillConst(n, 25);
    lineChart("chart-l-qs", s.dates || [], [
      ds("Quality score", s.quality_score || [], PALETTE.accent), w, b,
    ]);
    lineChart("chart-l-price", s.dates || [], [
      ds("Price", s.price || [], PALETTE.accent),
      ds("Recommended price", s.recommended_price || [], PALETTE.green,
         { borderDash: [5, 4] }),
    ]);

    const recs = d.recommendations || [];
    el("listing-recs").innerHTML = recs.length
      ? recs.map(r => recCard(r, true)).join("")
      : `<p class="muted">No open recommendations for this listing.</p>`;
    bindDoneButtons(el("listing-recs"));

    const alerts = d.alerts || [];
    el("listing-alerts").innerHTML = alerts.length
      ? alerts.map(a =>
          `<li class="${a.acknowledged ? "alert-ack" : ""}">${sevTag(a.severity)}
             <strong>${esc(a.code || "")}</strong> ${esc(a.message || "")}
             <span class="muted">· ${esc((a.ts || "").slice(0, 16))}</span></li>`).join("")
      : `<li class="muted">No alerts for this listing.</li>`;
  }

  // ---------------- recommendations ----------------

  function recCard(r, compact) {
    const link = r.listing_id ? `/listing/${r.listing_id}` : null;
    return `
      <div class="rec-card prio-border-${esc(r.priority || "low")}" data-rec-id="${r.id}">
        <h3>${prioTag(r.priority)} ${esc(r.title || r.code || "")}</h3>
        <div class="rec-meta">
          ${link ? `<a href="${link}">${esc(r.listing_name || "listing #" + r.listing_id)}</a> · ` : ""}
          rule <code>${esc(r.code || "")}</code> · source: ${esc(r.source || "–")}
          · ${esc((r.ts || "").slice(0, 16))}
        </div>
        <p><strong>Why:</strong> ${esc(r.reason || "")}</p>
        <p><strong>Do:</strong> ${esc(r.action || "")}</p>
        <p><button class="btn btn-small rec-done" data-id="${r.id}">Mark done</button></p>
      </div>`;
  }

  function bindDoneButtons(root) {
    root.querySelectorAll(".rec-done").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const d = await postJSON(`/api/recommendations/${btn.dataset.id}/done`);
        if (d && d.ok !== false) {
          const card = btn.closest(".rec-card");
          if (card) card.remove();
        } else {
          btn.disabled = false;
          btn.textContent = "Failed — retry";
        }
      });
    });
  }

  async function initRecommendations() {
    let d;
    try {
      d = await getJSON("/api/recommendations");
    } catch (e) {
      d = { ok: false, error: String(e) };
    }
    const root = el("rec-groups");
    if (!Array.isArray(d)) {
      root.innerHTML = `<p class="muted">Could not load: ${esc(d && d.error || "error")}</p>`;
      return;
    }
    if (!d.length) {
      root.innerHTML = `<p class="muted">No open recommendations. Run the engine from the Sources page.</p>`;
      return;
    }
    const order = ["critical", "high", "medium", "low"];
    const groups = {};
    d.forEach(r => { (groups[r.priority || "low"] = groups[r.priority || "low"] || []).push(r); });
    root.innerHTML = order.filter(p => groups[p]).map(p => `
      <section class="rec-group">
        <h2>${prioTag(p)} <span class="muted">(${groups[p].length})</span></h2>
        ${groups[p].map(r => recCard(r)).join("")}
      </section>`).join("");
    bindDoneButtons(root);
  }

  // ---------------- alerts ----------------

  async function initAlerts() {
    let d;
    try {
      d = await getJSON("/api/alerts");
    } catch (e) {
      d = { ok: false, error: String(e) };
    }
    const root = el("alert-list");
    if (!Array.isArray(d)) {
      root.innerHTML = `<li class="muted">Could not load: ${esc(d && d.error || "error")}</li>`;
      return;
    }
    if (!d.length) {
      root.innerHTML = `<li class="muted">No alerts yet.</li>`;
      return;
    }
    root.innerHTML = d.map(a => `
      <li class="${a.acknowledged ? "alert-ack" : ""}">
        ${sevTag(a.severity)} <strong>${esc(a.code || "")}</strong> ${esc(a.message || "")}
        <span class="muted">· ${esc((a.ts || "").slice(0, 16))}${a.listing_id ?
          ` · <a href="/listing/${a.listing_id}">listing #${a.listing_id}</a>` : ""}</span>
        ${a.acknowledged ? "" :
          `<button class="btn btn-small ack-btn" data-id="${a.id}">Acknowledge</button>`}
      </li>`).join("");
    root.querySelectorAll(".ack-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const r = await postJSON(`/api/alerts/${btn.dataset.id}/ack`);
        if (r && r.ok !== false) {
          btn.closest("li").classList.add("alert-ack");
          btn.remove();
          alertPing();
        } else {
          btn.disabled = false;
          btn.textContent = "Failed — retry";
        }
      });
    });
  }

  // ---------------- sources ----------------

  let connectTimer = null;

  async function pollConnectStatus() {
    let d;
    try {
      d = await getJSON("/api/sources/connect/status");
    } catch (e) {
      setMsg("connect-status", "status check failed: " + e, false);
      stopConnectPolling();
      return;
    }
    if (!d || d.ok === false) {
      setMsg("connect-status", "status unavailable: " + (d && d.error || "error"), false);
      stopConnectPolling();
      return;
    }
    if (d.logged_in) {
      setMsg("connect-status", "Connected — session saved. Auto pulls can now run.", true);
      stopConnectPolling();
      loadSourcesStatus();
    } else if (d.running) {
      setMsg("connect-status",
        "Waiting for login… " + (d.message || "finish the OTP login in the opened browser window."), null);
    } else {
      setMsg("connect-status", d.message || "Login window closed before completion.", false);
      stopConnectPolling();
    }
  }

  function stopConnectPolling() {
    if (connectTimer) { clearInterval(connectTimer); connectTimer = null; }
  }

  async function loadSourcesStatus() {
    let d;
    try {
      d = await getJSON("/api/sources/status");
    } catch (e) {
      d = { ok: false, error: String(e) };
    }
    if (!d || d.ok === false) {
      el("event-feed").innerHTML =
        `<li class="muted">Could not load status: ${esc(d && d.error || "error")}</li>`;
      return;
    }
    const radio = document.querySelector(`#mode-form input[name="mode"][value="${d.mode}"]`);
    if (radio) radio.checked = true;
    el("session-exists").textContent = d.session_exists ? "yes" : "no";
    const events = d.last_events || [];
    el("event-feed").innerHTML = events.length
      ? events.map(ev =>
          `<li><strong>${esc(ev.source || "")}</strong> — ${esc(ev.status || "")}
             <span class="muted">${esc(ev.detail || "")} · ${esc((ev.ts || "").slice(0, 19))}</span></li>`).join("")
      : `<li class="muted">No events logged yet.</li>`;
  }

  function initSources() {
    loadSourcesStatus();

    el("mode-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const mode = document.querySelector('#mode-form input[name="mode"]:checked');
      if (!mode) { setMsg("mode-msg", "pick a mode first", false); return; }
      const d = await postJSON("/api/sources/mode", { mode: mode.value });
      setMsg("mode-msg", d && d.ok ? `mode set to ${mode.value}` : "failed: " + (d && d.error || "error"),
             !!(d && d.ok));
    });

    el("demo-btn").addEventListener("click", async () => {
      const btn = el("demo-btn");
      btn.disabled = true;
      setMsg("demo-msg", "seeding…", null);
      const d = await postJSON("/api/sources/demo");
      btn.disabled = false;
      setMsg("demo-msg", d && d.ok ? "demo data regenerated" : "failed: " + (d && d.error || "error"),
             !!(d && d.ok));
      loadSourcesStatus();
    });

    el("upload-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const file = el("upload-file").files[0];
      if (!file) { setMsg("upload-result", "", null); return; }
      const fd = new FormData();
      fd.append("file", file);
      const box = el("upload-result");
      box.hidden = false;
      box.textContent = "Uploading…";
      try {
        const d = await postForm("/api/sources/upload", fd);
        box.textContent = JSON.stringify(d, null, 2);
      } catch (e) {
        box.textContent = "Upload failed: " + e;
      }
      loadSourcesStatus();
    });

    el("connect-btn").addEventListener("click", async () => {
      const btn = el("connect-btn");
      btn.disabled = true;
      setMsg("connect-status", "opening browser window on this computer…", null);
      const d = await postJSON("/api/sources/connect");
      btn.disabled = false;
      if (!d || d.ok === false) {
        setMsg("connect-status", "could not start login: " + (d && d.error || "error"), false);
        return;
      }
      stopConnectPolling();
      connectTimer = setInterval(pollConnectStatus, 3000);
      pollConnectStatus();
    });

    el("refresh-btn").addEventListener("click", async () => {
      const btn = el("refresh-btn");
      btn.disabled = true;
      setMsg("refresh-msg", "running…", null);
      const d = await postJSON("/api/refresh");
      btn.disabled = false;
      setMsg("refresh-msg",
        d && d.ok ? `done — ${fmt(d.new)} new recs/alerts, ${fmt(d.sent)} alerts dispatched`
                  : "finished with errors: " + (d && d.error || "error"),
        !!(d && d.ok));
      loadSourcesStatus();
    });
  }

  // ---------------- settings ----------------

  function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof o[keys[i]] !== "object" || o[keys[i]] === null) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }

  async function initSettings() {
    let d;
    try {
      d = await getJSON("/api/settings");
    } catch (e) {
      d = { ok: false, error: String(e) };
    }
    const form = el("settings-form");
    const cfg = (d && d.settings) || {};
    if (!d || d.ok === false) setMsg("settings-msg", "load warning: " + (d && d.error || "error"), false);

    form.querySelectorAll("[name]").forEach(input => {
      const v = getPath(cfg, input.name);
      if (input.type === "checkbox") input.checked = !!v;
      else if (v != null) input.value = v;
    });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const out = JSON.parse(JSON.stringify(cfg)); // preserve keys we don't show
      form.querySelectorAll("[name]").forEach(input => {
        if (input.type === "checkbox") setPath(out, input.name, input.checked);
        else if (input.type === "number") setPath(out, input.name, parseFloat(input.value) || 0);
        else setPath(out, input.name, input.value);
      });
      const r = await postJSON("/api/settings", out);
      setMsg("settings-msg", r && r.ok ? "saved" : "save failed: " + (r && r.error || "error"),
             !!(r && r.ok));
      refreshSettingsCache();
    });

    el("test-alert-btn").addEventListener("click", async () => {
      const btn = el("test-alert-btn");
      btn.disabled = true;
      setMsg("test-alert-msg", "sending…", null);
      const d = await postJSON("/api/alerts/test");
      btn.disabled = false;
      if (d && d.ok) {
        setMsg("test-alert-msg", "sent: " + JSON.stringify(d.results), true);
      } else {
        setMsg("test-alert-msg", "failed: " + (d && d.error || "error"), false);
      }
    });
  }

  // ---------------- boot ----------------

  document.addEventListener("DOMContentLoaded", startAlertPing);

  return {
    getJSON, postJSON, postForm,
    initDashboard, initListings, initListing,
    initRecommendations, initAlerts, initSources, initSettings,
  };
})();
