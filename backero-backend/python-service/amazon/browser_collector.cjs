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
  || (process.platform === 'win32' ? path.join(process.env.APPDATA || '', 'npm', 'agent-browser.cmd') : 'agent-browser');

function browser(...args) {
  // Windows cannot exec a .cmd file directly. All values passed here are
  // collector-owned constants/element refs, never page content or credentials.
  // The npm launcher path has no spaces under the managed Windows profile;
  // these collector-owned arguments contain no spaces, so passing them bare
  // matches the interactive command and avoids cmd.exe re-quoting them.
  const command = [browserBinary, '--session', session, ...args].join(' ');
  return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', command], {
    encoding: 'utf8', timeout: 90_000, windowsHide: true,
  });
}

function now() { return new Date().toISOString(); }
function value(number) { return { value: number, capturedAt: now() }; }

function parseMoney(text) {
  const match = String(text).match(/₹([\d,]+(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function parseSnapshot(snapshot, capturedAt) {
  const metrics = { listing_status: {} };
  const labels = {
    Active: 'active', 'Search suppressed': 'search_suppressed', Inactive: 'inactive',
    'Out of stock': 'out_of_stock', Closed: 'closed',
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

function capture() {
  const capturedAt = now();
  try {
    // Reuse the active managed Seller Central tab. Reopening it each cycle can
    // interrupt a human handling Amazon's occasional verification prompt.
    const snapshot = browser('snapshot', '-i');
    // A Seller Central news card can contain the phrase "Sign in" even when
    // the browser session is authenticated, so only recognize actual login UI.
    const atLoginScreen = /^\s*- (?:link|button|heading) "(?:Log in|Sign in)"/mi.test(snapshot);
    if (atLoginScreen || !/Seller Central|Backero India|Listing Status/i.test(snapshot)) {
      throw new Error('Seller Central browser session is not authenticated');
    }
    // The Products dashboard exposes current listing status and visible product
    // rows. Opening it is read-only and does not change Seller Central data.
    const productsRef = (snapshot.match(/tab "Products[^"\n]*"[^\n]*\[ref=(e\d+)\]/) || [])[1];
    if (productsRef) {
      browser('click', `@${productsRef}`);
      browser('wait', '1500');
    }
    const parsed = parseSnapshot(browser('snapshot', '-i'), capturedAt);
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
