/*
 * Read the already authenticated local Seller Central browser through the
 * agent-browser session. This process never reads cookies or credentials: it
 * asks the browser for the same accessible listing dashboard a user sees and
 * persists only normalized seller facts for publish_mirror.py.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const capturePath = path.join(root, 'data', 'capture.json');
const session = process.env.AMAZON_BROWSER_SESSION || 'amazon-seller-connect';
const pollSeconds = Math.max(120, Number(process.env.AMAZON_BROWSER_POLL_SECONDS || 900));
const browserBinary = process.env.AGENT_BROWSER_BIN
  || (process.platform === 'win32'
    ? path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'agent-browser', 'bin', 'agent-browser-win32-x64.exe')
    : 'agent-browser');

function browser(...args) {
  // Use agent-browser's native executable rather than its .cmd launcher.
  // The launcher creates a second cmd process that can lose the local CDP
  // connection even while interactive PowerShell captures still work.
  // The local CDP daemon occasionally drops its first request while Chrome is
  // finishing a Seller Central navigation. A snapshot retry is read-only and
  // avoids turning a transient browser hiccup into a false "needs login" state.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return execFileSync(browserBinary, ['--session', session, ...args], {
        encoding: 'utf8', timeout: 90_000, windowsHide: true,
      });
    } catch (error) {
      if (args[0] !== 'snapshot' || attempt === 1) throw error;
    }
  }
  return '';
}

function now() { return new Date().toISOString(); }
function value(number) { return { value: number, capturedAt: now() }; }

function parseMoney(text) {
  const direct = String(text).match(/\u20b9\s*([\d,]+(?:\.\d+)?)/);
  if (direct) return Number(direct[1].replace(/,/g, ''));
  // agent-browser returns the real rupee glyph; older Windows snapshots
  // sometimes contain its mojibake representation, which the legacy parser
  // already recognizes. Normalize the glyph before parsing either form.
  text = String(text).replace(/\u20b9/g, '\u00e2\u201a\u00b9');
  const match = String(text).match(/₹([\d,]+(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function parseSnapshot(snapshot, capturedAt) {
  const metrics = { listing_status: {} };
  const labels = {
    Active: 'active', 'Search suppressed': 'search_suppressed', Inactive: 'inactive',
    'Out of stock': 'out_of_stock', Closed: 'closed',
    'Improve listing quality': 'improve_listing_quality',
    'At-risk of search suppression': 'at_risk_of_search_suppression',
    'Detail page removed': 'detail_page_removed',
    'Listing removed': 'listing_removed',
    'Missing offer': 'missing_offer', 'Pricing issue': 'pricing_issue',
    'Approval required': 'approval_required',
  };
  for (const [label, key] of Object.entries(labels)) {
    const match = snapshot.match(new RegExp(`${label}:\\s*(\\d+)`, 'i'));
    if (match) metrics.listing_status[key] = { value: Number(match[1]), capturedAt };
  }
  const cells = [...snapshot.matchAll(/^\s*- cell "([^"]*)"/gm)].map((match) => match[1]);
  const listings = [];
  for (let index = 0; index < cells.length; index += 1) {
    const identity = cells[index].match(/^(.*)\s+(B0[A-Z0-9]{8})\s+\|\s+([^\s]+)$/);
    if (!identity) continue;
    const [ , title, asin, sku ] = identity;
    const status = cells[index + 1] || null;
    const inventory = (cells[index + 4] || '').match(/^(\d+)\s+\((FBA|FBM)\)$/i);
    const price = parseMoney(cells[index + 5]);
    if (!status || !inventory || price == null) continue;
    listings.push({ title, asin, sku, status, price, stock: Number(inventory[1]), fulfillment: inventory[2].toUpperCase() });
  }
  return { metrics, listings };
}

function parseDashboard(snapshot, capturedAt) {
  const metrics = { sales: {}, orders: {}, finance: {}, inventory: {}, step: {} };
  const money = (pattern) => {
    const match = snapshot.match(pattern);
    return match ? parseMoney(match[1]) : null;
  };
  const count = (pattern) => {
    const match = snapshot.match(pattern);
    return match ? Number(match[1].replace(/,/g, '')) : null;
  };
  const percent = (pattern) => {
    const match = snapshot.match(pattern);
    return match ? Number(match[1]) : null;
  };
  const put = (group, key, amount) => { if (Number.isFinite(amount)) metrics[group][key] = value(amount); };
  put('sales', 'today_global_sales', money(/Today's Global Sales\s*([^\n]+)/i));
  put('sales', 'ordered_product_sales_today', money(/Ordered product sales:\s*([^\n"]+)/i));
  put('orders', 'units_ordered_today', count(/Units ordered:\s*([\d,]+)/i));
  put('orders', 'open_orders', count(/Open Orders\s*([\d,]+)/i));
  put('finance', 'total_balance', money(/Total balance\s*([^\n]+)/i));
  put('inventory', 'active_shipments', count(/Active Shipments\s*([\d,]+)/i));
  put('step', 'sqs_score', count(/SQS Score"[^\n]*\n\s*- cell "([\d,]+)/i));
  put('step', 'plqs_pct', percent(/PLQS"[^\n]*\n\s*- cell "([\d.]+)%/i));
  put('step', 'prime_gv_pct', percent(/Prime GV%"[^\n]*\n\s*- cell "([\d.]+)%/i));
  put('step', 'lis_pct', percent(/LIS"[^\n]*\n\s*- cell "([\d.]+)%/i));
  put('step', 'net_sales', money(/Net Sales"[^\n]*\n\s*- cell "([^\n"]+)/i));
  const listing = snapshot.match(/Products\s*Active\s*([\d,]+)\/([\d,]+)/i);
  if (listing) {
    metrics.inventory.active_listings = value(Number(listing[1].replace(/,/g, '')));
    metrics.inventory.total_listings = value(Number(listing[2].replace(/,/g, '')));
  }
  return Object.fromEntries(Object.entries(metrics).filter(([, entries]) => Object.keys(entries).length));
}

function capture() {
  const capturedAt = now();
  try {
    // Reuse the active managed Seller Central tab. Reopening it each cycle can
    // interrupt a human handling Amazon's occasional verification prompt.
    let snapshot = browser('snapshot', '-i');
    const dashboardMetrics = parseDashboard(snapshot, capturedAt);
    // A Seller Central news card can contain the phrase "Sign in" even when
    // the browser session is authenticated, so only recognize actual login UI.
    const atLoginScreen = /^\s*- (?:link|button|heading) "(?:Log in|Sign in)"/mi.test(snapshot);
    if (atLoginScreen || !/Seller Central|Backero India|Listing Status/i.test(snapshot)) {
      throw new Error('Seller Central browser session is not authenticated');
    }
    // Seller Central keeps its business tabs behind the dashboard shell until
    // its menu is opened. This only expands UI; it never changes seller data.
    let productsRef = (snapshot.match(/tab "Products[^"\n]*"[^\n]*\[ref=(e\d+)\]/) || [])[1];
    if (!productsRef) {
      const menuRef = (snapshot.match(/button "Menu"[^\n]*\[ref=(e\d+)\]/) || [])[1];
      if (menuRef) {
        browser('click', `@${menuRef}`);
        browser('wait', '700');
        snapshot = browser('snapshot', '-i');
        productsRef = (snapshot.match(/tab "Products[^"\n]*"[^\n]*\[ref=(e\d+)\]/) || [])[1];
      }
    }
    // The Products dashboard exposes current listing status and visible product
    // rows. Opening it is read-only and does not change Seller Central data.
    if (productsRef) {
      browser('click', `@${productsRef}`);
      browser('wait', '1500');
    }
    const parsed = parseSnapshot(browser('snapshot', '-i'), capturedAt);
    parsed.metrics = { ...dashboardMetrics, ...parsed.metrics };
    if (!parsed.listings.length && !Object.keys(parsed.metrics.listing_status).length) {
      throw new Error('Seller Central Products dashboard returned no visible listing data');
    }
    return {
      source: 'seller_central_browser', mode: 'browser',
      marketplace: { id: 'A21TJRUUN4KGV', name: 'Amazon India' }, lastScrapedAt: capturedAt,
      status: { state: 'ok', detail: 'Authenticated Seller Central browser read completed.', at: capturedAt },
      metrics: parsed.metrics, listings: parsed.listings, orders: [],
      coverage: {
        listings: { capturedAt, count: parsed.listings.length, status: 'partial', detail: 'Visible Seller Central Product Performance rows; listing-status totals are captured separately.' },
        orders: { capturedAt: null, count: 0, status: 'unavailable', detail: 'Orders browser reader is not enabled yet.' },
      },
      limitations: [
        'Read-only data from the authenticated local Seller Central browser; no cookies or credentials are copied.',
        'Visible listing rows and listing-status counters are captured automatically. Orders, settlements, returns, ads and search terms will be added as separate readers.',
      ],
    };
  } catch (error) {
    // Keep operational detail in the local process log; the mirror only gets a
    // generic state so browser/session internals never reach the web app.
    console.error(`amazon browser capture failed: ${error.message}`);
    return {
      source: 'seller_central_browser', mode: 'browser', lastScrapedAt: null,
      status: { state: 'needs_you', detail: `Amazon Seller Central login needs attention: ${error.name}.`, at: capturedAt },
      metrics: {}, listings: [], orders: [], coverage: {},
      limitations: ['Sign in in the existing local Amazon Seller Central collector browser; saved data remains visible until the next read.'],
    };
  }
}

function writeCapture() {
  const data = capture();
  fs.mkdirSync(path.dirname(capturePath), { recursive: true });
  const temporary = `${capturePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data), 'utf8');
  fs.renameSync(temporary, capturePath);
  console.log(`amazon browser capture: ${data.status.state}`);
  return data;
}

if (process.argv.includes('--watch')) {
  writeCapture();
  setInterval(writeCapture, pollSeconds * 1000);
} else {
  writeCapture();
}
