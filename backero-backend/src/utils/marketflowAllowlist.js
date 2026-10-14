/**
 * Allowlist for the amazon-server proxy only (src/routes/marketflow.routes.js)
 * — Meesho/Snapdeal/Flipkart no longer run HTTP servers to proxy to (see
 * python-service/), so they have no allowlist here; their routes read
 * MongoDB directly instead. Deliberately excludes write/ops/ingest endpoints
 * the dashboard never touches (e.g. /v1/ingest, /v1/admin/*, /v1/backup/*,
 * /v1/connections/:source/heartbeat), even though those are harmless locally
 * now (loopback only), to keep this proxy's exposed surface matching its
 * actual UI.
 */

const v1Allowlist = [
  { method: 'GET',  pattern: /^\/dashboard\/(command|unified|keywords|competitors|recommendations|platform-comparison)$/ },
  { method: 'GET',  pattern: /^\/dashboard\/sku\/[^/]+$/ },
  { method: 'POST', pattern: /^\/dashboard\/recommendations\/[^/]+\/(apply|snooze|dismiss)$/ },
  { method: 'GET',  pattern: /^\/account\/overview$/ },
  { method: 'GET',  pattern: /^\/data-quality\/all$/ },
  { method: 'GET',  pattern: /^\/robot$/ },
  { method: 'GET',  pattern: /^\/connections$/ },
  { method: 'POST', pattern: /^\/connections\/[^/]+\/credentials$/ },
  { method: 'POST', pattern: /^\/connections\/[^/]+\/sync$/ },
  { method: 'GET',  pattern: /^\/products$/ },
  { method: 'POST', pattern: /^\/products\/cogs$/ },
  { method: 'POST', pattern: /^\/import\/business-report-sku$/ },
  { method: 'GET',  pattern: /^\/tracking$/ },
  { method: 'POST', pattern: /^\/tracking\/keywords$/ },
  { method: 'PUT',  pattern: /^\/tracking\/keywords\/[^/]+$/ },
  { method: 'DELETE', pattern: /^\/tracking\/keywords\/[^/]+$/ },
  { method: 'POST', pattern: /^\/tracking\/competitors$/ },
  { method: 'DELETE', pattern: /^\/tracking\/competitors\/[^/]+$/ },
  { method: 'GET',  pattern: /^\/alerts$/ },
  { method: 'GET',  pattern: /^\/alerts\/stats$/ },
  { method: 'PATCH', pattern: /^\/alerts\/[^/]+\/(acknowledge|resolve)$/ },
  { method: 'GET',  pattern: /^\/insights$/ },
  { method: 'GET',  pattern: /^\/insights\/(platform-analysis|summary)$/ },
  { method: 'GET',  pattern: /^\/profitability\/(summary|regional|customer-ltv|traffic)$/ },
  { method: 'GET',  pattern: /^\/trends\/compare\/all$/ },
  { method: 'GET',  pattern: /^\/trends\/[^/]+$/ },
  { method: 'GET',  pattern: /^\/recommendations\/action-plan$/ },
];

module.exports = { v1Allowlist };
