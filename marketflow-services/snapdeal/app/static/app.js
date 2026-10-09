/* SD Pulse dashboard logic — polls the FastAPI backend every 60s. */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let charts = {};

async function api(path, opts) {
  const r = await fetch(path, opts);
  return r.json();
}
function fmt(n) { return n === null || n === undefined ? "—" : Number(n).toLocaleString("en-IN"); }

/* ---------- tabs ---------- */
$$("#tabs button").forEach(b => b.onclick = () => {
  $$("#tabs button").forEach(x => x.classList.remove("active"));
  $$("main .tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  $("#tab-" + b.dataset.tab).classList.add("active");
});

/* ---------- header/status ---------- */
async function loadStatus() {
  const s = await api("/api/status");
  $("#connBadge").textContent = "connector: " + s.connector;
  $("#demoBadge").classList.toggle("hidden", !s.demo);
  $("#clock").textContent = s.time.replace("T", " ");
  const log = $("#syncLog");
  log.innerHTML = s.last_syncs.map(x =>
    `<div>[${x.ts}] <b>${x.connector}</b> — ${x.status} — ${x.detail || ""}</div>`).join("");
}

/* ---------- overview ---------- */
async function loadOverview() {
  const [o, p, ls] = await Promise.all([api("/api/overview"), api("/api/panel"), api("/api/listings")]);
  const A = p.areas || {}, g = (a, k) => (A[a] && A[a][k]) ? A[a][k].value : null, t = (a, k) => (A[a] && A[a][k]) ? A[a][k].text : null;
  const live = ls.filter(l => l.status === "live").length, notLive = ls.filter(l => l.status === "not_live").length;
  const oos = ls.filter(l => l.status === "out_of_stock").length;
  const health = t("health", "order_processing_health");
  const cards = [
    ["Live listings", fmt(live), "ok"], ["Not live (disabled)", fmt(notLive), notLive ? "warn" : "ok"],
    ["Out of stock (live)", fmt(oos), oos ? "bad" : "ok"],
    ["Sales completed 30d ₹", fmt(g("dashboard", "sales_completed")), ""], ["Orders booked 30d", fmt(g("dashboard", "orders_booked")), ""],
    ["Orders returned 30d", fmt(g("dashboard", "orders_returned")), ""], ["Avg seller rating ★", g("dashboard", "avg_seller_rating") ?? "—", ""],
    ["Order processing health", health || "—", health === "Excellent" ? "ok" : "warn"],
    ["Ads spend ₹ / ROI", fmt(g("ads", "spend")) + " / " + (g("ads", "roi") ?? "—"), ""],
    ["Paid this month ₹", fmt(g("payments", "month_credited")), ""],
  ];
  $("#ovCards").innerHTML = cards.map(c =>
    `<div class="card ${c[2]}"><div class="k">${c[0]}</div><div class="v">${c[1]}</div></div>`).join("");
  draw("funnelChart", {
    type: "bar",
    data: { labels: ["Booked", "Processed", "Returned"],
      datasets: [{ data: [g("dashboard", "orders_booked"), g("dashboard", "orders_processed"), g("dashboard", "orders_returned")],
        backgroundColor: ["#8A8F98", "#0E7C7B", "#E40046"] }] },
    options: { plugins: { legend: { display: false } } }
  });
  if (g("health", "manifest_pct_3_day_lag") !== null) draw("scChart", {
    type: "bar",
    data: { labels: ["Manifest %", "Shipped %", "Bad rating %"],
      datasets: [
        { label: "Actual", data: [g("health", "manifest_pct_3_day_lag"), g("health", "shipped_pct_3_day_lag"), g("health", "bad_rating_pct")], backgroundColor: "#E40046" },
        { label: "Snapdeal limit (min 90, 90 / max 20)", data: [90, 90, 20], backgroundColor: "#8A8F98" }]},
    options: { scales: { y: { beginAtZero: true, max: 100 } } }
  });
  const a = o.open_alerts || {};
  $("#ovAlerts").innerHTML =
    `<p><b style="color:var(--red)">${a.critical || 0} critical</b> ·
     <b style="color:var(--amber)">${a.warning || 0} warnings</b> ·
     <b style="color:var(--teal)">${a.info || 0} info</b> — see Recommendations tab.</p>`;
}

/* ---------- listings ---------- */
const STATUS_LABEL = {live: "Live", not_live: "Not live", out_of_stock: "Out of stock"};
async function loadListings() {
  const rows = await api("/api/listings");
  const tb = $("#listingTable tbody");
  tb.innerHTML = rows.map(l => {
    const cls = l.audit_score >= 75 ? "s-good" : l.audit_score >= 50 ? "s-mid" : "s-bad";
    const p = l.panel || {}, dash = v => v === null || v === undefined ? "—" : fmt(v);
    return `<tr>
      <td><span class="score ${cls}">${l.audit_score}</span></td>
      <td><b>${l.sku}</b><br><span class="muted">${l.title}</span></td>
      <td>${STATUS_LABEL[l.status] || l.status}</td>
      <td>₹${fmt(l.price)} <span class="muted">(${l.discount_pct}% off, MRP ${fmt(l.mrp)})</span></td>
      <td>${l.stock === 0 ? '<b style="color:var(--red)">OOS</b>' : fmt(l.stock)}</td>
      <td>${dash(p.msp)} / ${dash(p.gross_payable)}</td>
      <td>${p.product_rating_pct === null || p.product_rating_pct === undefined ? "—" : p.product_rating_pct + "%"}</td>
      <td>${dash(p.orders_30d)}</td><td>${dash(p.sales_30d)}</td>
      <td>${p.bad_pct === null || p.bad_pct === undefined ? "—" : p.bad_pct + "%"}</td></tr>`;
  }).join("");
  const sel = $("#trendSku");
  if (!sel.options.length) {
    sel.innerHTML = rows.map(l => `<option>${l.sku}</option>`).join("");
    sel.onchange = () => loadTrend(sel.value);
  }
  if (rows.length) loadTrend(sel.value || rows[0].sku);
}

async function loadTrend(sku) {
  const s = await api("/api/listing/" + sku + "/series");
  draw("trendChart", {
    type: "line",
    data: { labels: s.map(r => r.day.slice(5)),
      datasets: [
        { label: "Impressions", data: s.map(r => r.impressions), borderColor: "#8A8F98", yAxisID: "y" },
        { label: "Orders", data: s.map(r => r.orders), borderColor: "#E40046", yAxisID: "y1" }]},
    options: { scales: { y: { position: "left" }, y1: { position: "right", grid: { drawOnChartArea: false } } } }
  });
}

/* ---------- health ---------- */
async function loadHealth() {
  const p = await api("/api/panel");
  const A = p.areas || {}, g = (a, k) => (A[a] && A[a][k]) ? A[a][k].value : null, t = (a, k) => (A[a] && A[a][k]) ? A[a][k].text : null;
  const card = (k, v, target, bad) =>
    `<div class="card ${bad ? "bad" : "ok"}"><div class="k">${k}</div>
     <div class="v">${v ?? "—"}</div><div class="muted">${target}</div></div>`;
  const ret = g("dashboard", "sales_completed") ? (g("dashboard", "sales_returned") / g("dashboard", "sales_completed") * 100).toFixed(1) : null;
  $("#healthCards").innerHTML =
    card("Account health", t("dashboard", "account_health"), "Snapdeal's own rating of your account", t("dashboard", "account_health") !== "Good") +
    card("Order Processing health", t("health", "order_processing_health"), "Snapdeal restricts orders if this turns Poor", t("health", "order_processing_health") !== "Excellent") +
    card("Manifest % (3-day lag)", g("health", "manifest_pct_3_day_lag"), "required: > 90%", g("health", "manifest_pct_3_day_lag") < 90) +
    card("Shipped % (3-day lag)", g("health", "shipped_pct_3_day_lag"), "required: > 90%", g("health", "shipped_pct_3_day_lag") < 90) +
    card("Manifested / shipped, last 3 days", (g("health", "manifested_last_3_days") ?? "—") + " / " + (g("health", "shipped_last_3_days") ?? "—"), "required: > 0", false) +
    card("Total ratings", g("health", "total_rating_count"), "required: at least 20", g("health", "total_rating_count") < 20) +
    card("Bad rating %", g("health", "bad_rating_pct"), "required: at most 20%", g("health", "bad_rating_pct") > 20) +
    card("Avg seller rating ★", g("dashboard", "avg_seller_rating"), "Snapdeal wants above 3.9", g("dashboard", "avg_seller_rating") < 3.9) +
    card("Returned sales / completed sales %", ret, "value of returns vs completed sales, 30 days", ret > 15);
  $("#healthExplain").innerHTML = `<p class="muted">All figures are read live from your Snapdeal Seller Panel
    (Performance 2.0 &rarr; Order Processing, and the Dashboard)${p.captured_at ? ", last read " + p.captured_at.replace("T", " ") : ""}.
    The limits shown are the ones Snapdeal prints next to each figure.</p>`;
}

/* ---------- payments ---------- */
async function loadPayments() {
  const [p, r] = await Promise.all([api("/api/panel"), api("/api/payments")]);
  const A = p.areas || {}, g = (a, k) => (A[a] && A[a][k]) ? A[a][k].value : null;
  const cards = [["Paid this month ₹", fmt(g("payments", "month_credited"))], ["vs last month %", g("payments", "month_credited_change_pct") ?? "—"],
    ["Last payment ₹", fmt(g("payments", "last_payment"))],
    ["Unsettled COD ₹", fmt(g("dashboard", "unsettled_cod"))], ["Unsettled prepaid ₹", fmt(g("dashboard", "unsettled_ncod"))]];
  $("#payCards").innerHTML = cards.map(c => `<div class="card"><div class="k">${c[0]}</div><div class="v">${c[1]}</div></div>`).join("");
  $("#payTable tbody").innerHTML = r.settlements.length ? r.settlements.map(x =>
    `<tr><td>${x.date}</td><td>${fmt(x.amount)}</td><td>${x.transactions}</td><td class="muted">${x.ref}</td></tr>`).join("")
    : `<tr><td colspan="4" class="muted">No settlements read yet.</td></tr>`;
}

/* ---------- ranks ---------- */
async function loadRanks() {
  const rows = await api("/api/ranks");
  $("#rankTable tbody").innerHTML = rows.length ? rows.map(r =>
    `<tr><td>${r.keyword}</td><td>${r.listing_sku}</td><td class="muted">${r.title || ""}</td>
     <td><b>#${r.position}</b></td><td>${r.day}</td></tr>`).join("")
    : `<tr><td colspan="5" class="muted">No placements recorded yet - click "Track now" (reads Snapdeal's public search for
       your tracked keywords; no login needed).</td></tr>`;
}
$("#rankSyncBtn").onclick = async () => {
  $("#rankSyncBtn").textContent = "Tracking…";
  await api("/api/rank-sync", { method: "POST" });
  $("#rankSyncBtn").textContent = "Track now";
  loadRanks(); loadStatus();
};

/* ---------- ads ---------- */
async function loadAds() {
  const a = await api("/api/ads");
  const s = a.summary;
  const wallet = (((await api("/api/panel")).areas || {}).ads || {}).wallet_balance;
  const cards = [["Wallet balance ₹", fmt(wallet ? wallet.value : null)],
    ["Spend ₹", fmt(s.spend)], ["Revenue ₹", fmt(s.revenue)],
    ["Clicks", fmt(s.clicks)], ["CPC ₹", s.cpc], ["CTR %", s.ctr], ["CVR %", s.cvr],
    ["ACOS %", s.acos], ["ROAS", s.roas]];
  $("#adsCards").innerHTML = cards.map(c =>
    `<div class="card"><div class="k">${c[0]}</div><div class="v">${c[1]}</div></div>`).join("");
  $("#adsTable tbody").innerHTML = a.campaigns.map(c =>
    `<tr><td>${c.campaign}</td><td>${c.sku}</td><td>${fmt(c.spend)}</td><td>${fmt(c.clicks)}</td>
     <td>${c.cpc}</td><td>${fmt(c.orders)}</td><td>${fmt(c.revenue)}</td>
     <td style="color:${c.acos > 40 ? "var(--red)" : "inherit"}">${c.acos}</td><td>${c.roas}</td></tr>`).join("");
  draw("adsChart", {
    data: { labels: a.daily.map(r => r.day.slice(5)),
      datasets: [
        { type: "bar", label: "Spend ₹", data: a.daily.map(r => r.spend), backgroundColor: "#8A8F98" },
        { type: "line", label: "Revenue ₹", data: a.daily.map(r => r.revenue), borderColor: "#E40046" }]}
  });
}

/* ---------- recommendations ---------- */
async function loadReco() {
  const rows = await api("/api/alerts");
  $("#recoCount").textContent = rows.length || "";
  $("#recoList").innerHTML = rows.length ? rows.map(a =>
    `<div class="alert ${a.severity}">
       <button class="resolve" onclick="resolveAlert(${a.id})">mark done</button>
       <h4>${a.title}</h4>
       <div class="meta">${a.module} · ${a.entity} · ${a.ts.replace("T", " ")} · ${a.severity.toUpperCase()}</div>
       <p><span class="lbl">Why:</span> ${a.reason}</p>
       <p><span class="lbl">Do this:</span> ${a.fix}</p>
       <p class="src">Evidence: ${a.source}</p>
     </div>`).join("")
    : `<p class="muted">No open alerts — every monitored marker is inside thresholds. ✔</p>`;
}
window.resolveAlert = async id => {
  await api("/api/alerts/" + id + "/resolve", { method: "POST" });
  loadReco(); loadOverview();
};

/* ---------- sync ---------- */
$("#syncBtn").onclick = async () => {
  $("#syncResult").textContent = " syncing…";
  const r = await api("/api/sync", { method: "POST" });
  $("#syncResult").textContent = " done: " + JSON.stringify(r.parts);
  refreshAll();
};
$$(".uploads input").forEach(inp => inp.onchange = async () => {
  if (!inp.files.length) return;
  const fd = new FormData();
  fd.append("file", inp.files[0]);
  const r = await api("/api/upload/" + inp.dataset.kind, { method: "POST", body: fd });
  $("#syncResult").textContent = " uploaded " + r.saved;
  loadStatus();
});

/* ---------- AI strategic analysis ---------- */
function mdToHtml(md) {
  // Minimal, dependency-free markdown for the handful of things Claude's replies actually use: headers, bold,
  // horizontal rules and numbered/bulleted lines. esc() first, so nothing in the AI's own text can inject markup.
  const lines = esc(md).split("\n");
  let html = "", inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (let line of lines) {
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (/^---+$/.test(line.trim())) { closeList(); html += "<hr>"; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) { closeList(); html += `<h${h[1].length + 2}>${h[2]}</h${h[1].length + 2}>`; continue; }
    const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (li) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${li[1]}</li>`; continue; }
    closeList();
    html += line.trim() ? `<p>${line}</p>` : "";
  }
  closeList();
  return html;
}
async function loadAiInsights() {
  try {
    const rows = await api("/api/ai_insights");
    if (!rows.length) { document.getElementById("aiPanelNote").textContent += " No analysis yet - it runs after the next real data read."; return; }
    document.getElementById("aiPanelAt").textContent = "(" + rows[0].ts.replace("T", " ") + ")";
    document.getElementById("aiPanelBody").innerHTML = mdToHtml(rows[0].summary);
  } catch (e) { document.getElementById("aiPanelNote").textContent = "Could not load AI analysis: " + e; }
}

/* ---------- helpers ---------- */
function draw(id, cfg) {
  if (charts[id]) charts[id].destroy();
  const el = document.getElementById(id);
  if (el) charts[id] = new Chart(el, cfg);
}
async function refreshAll() {
  await Promise.all([loadStatus(), loadOverview(), loadListings(), loadHealth(),
                     loadRanks(), loadAds(), loadReco(), loadRobot(), loadPayments(), loadAiInsights()]);
}
refreshAll();
setInterval(refreshAll, 60000);

/* ---------- SD Robo ---------- */
const ROBOT_STATE_LABEL = {healthy: "Healthy", attention: "Partly working", needs_you: "Needs you", error: "Problem", demo: "Demo data"};
const ROBOT_OUTCOME_LABEL = {ok: "OK", partial: "Partly done", skipped: "Skipped", needs_you: "Needs you", failed: "Failed"};
function agoText(iso) {
  if (!iso) return "never";
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 1) return "just now";
  if (m < 120) return Math.round(m) + " min ago";
  if (m < 2880) return Math.round(m / 60) + " h ago";
  return Math.round(m / 1440) + " days ago";
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c])); }
async function loadRobot() {
  const box = $("#robotBox");
  try {
    const r = await api("/api/robot");
    const bad = r.state === "error", warn = ["needs_you", "attention"].includes(r.state);
    let html = `<h3>${esc(ROBOT_STATE_LABEL[r.state] || r.state)}</h3>`;
    html += `<p class="${bad ? 'danger' : warn ? 'warn' : 'muted'}">${esc(r.message)}</p>`;
    html += `<p class="muted">Alive: last heartbeat ${esc(agoText(r.beat))} &middot; running since ${esc((r.started_at || "-").replace("T", " ").slice(0, 16))} &middot; connector: ${esc(r.connector)}</p>`;
    html += `<h4>What it does</h4><ul>`;
    for (const j of r.jobs) {
      const out = j.last_status ? (ROBOT_OUTCOME_LABEL[j.last_status] || j.last_status) + " · " + agoText(j.last_run) : "no run yet";
      html += `<li><b>${esc(j.label)}</b> — ${out}<br><span class="muted">${esc(j.what)} Runs every ${j.every_minutes >= 120 ? (j.every_minutes / 60) + " h" : j.every_minutes + " min"}.${j.detail ? " " + esc(j.detail) : ""}</span></li>`;
    }
    html += `</ul><h4>Recent runs</h4>`;
    if (r.runs.length) {
      html += `<table><tbody>` + r.runs.slice(0, 15).map(x =>
        `<tr><td>${esc(agoText(x.finished_at))}</td><td>${esc(x.job)}</td><td>${esc(ROBOT_OUTCOME_LABEL[x.status] || x.status)}</td><td class="muted">${esc(x.detail)}</td></tr>`).join("") + `</tbody></table>`;
    } else {
      html += `<p class="muted">No runs recorded yet.</p>`;
    }
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = `<p class="danger">Could not load SD Robo: ${esc(e)}</p>`;
  }
}
