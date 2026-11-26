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
  const metrics = { listing_status: {}, product_performance: {} };
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
  let visibleProductSales = 0;
  for (let index = 0; index < cells.length; index += 1) {
    const identity = cells[index].match(/^(.*)\s+(B0[A-Z0-9]{8})\s+\|\s+([^\s]+)$/);
    if (!identity) continue;
    const [ , title, asin, sku ] = identity;
    const status = cells[index + 1] || null;
    const inventory = (cells[index + 4] || '').match(/^(\d+)\s+\((FBA|FBM)\)$/i);
    const price = parseMoney(cells[index + 5]);
    const sales = parseMoney(cells[index + 2]);
    const pageViews = /^\d[\d,]*$/.test(cells[index + 3] || '') ? Number(cells[index + 3].replace(/,/g, '')) : null;
    if (!status || !inventory || price == null) continue;
    if (sales != null) visibleProductSales += sales;
    listings.push({ title, asin, sku, status, price, stock: Number(inventory[1]), fulfillment: inventory[2].toUpperCase(), sales, pageViews });
  }
  if (listings.length) {
    metrics.product_performance.visible_products = value(listings.length);
    metrics.product_performance.visible_product_sales = value(visibleProductSales);
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

function numberFromReport(text) {
  const clean = String(text).replace(/[₹,]/g, '').replace(/%$/, '').trim();
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function reportDateToIso(text) {
  const match = String(text).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function parseSalesTrafficReport(text) {
  // The accessible report is a sequence of daily cells rather than a semantic
  // table.  Each date row starts with dd/mm/yyyy and currently exposes the
  // first eight Sales & Traffic columns.  Keep only fully parsed facts.
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const date = reportDateToIso(lines[index]);
    if (!date) continue;
    const cells = [];
    let cursor = index + 1;
    while (cursor < lines.length && !reportDateToIso(lines[cursor]) && lines[cursor] !== 'Total') {
      cells.push(lines[cursor]);
      cursor += 1;
    }
    // Ordered sales, B2B sales, units, B2B units, order items, B2B order
    // items, average sales/order item, B2B average sales/order item.
    if (cells.length >= 8) {
      const values = cells.slice(0, 8).map(numberFromReport);
      if (values.every((entry) => entry !== null)) {
        rows.push({
          date,
          orderedProductSales: values[0], orderedProductSalesB2b: values[1],
          unitsOrdered: values[2], unitsOrderedB2b: values[3],
          totalOrderItems: values[4], totalOrderItemsB2b: values[5],
          averageSalesPerOrderItem: values[6], averageSalesPerOrderItemB2b: values[7],
        });
      }
    }
    index = cursor - 1;
  }
  return rows;
}

function parseBrowserJson(output) {
  // `agent-browser eval` prints a JSON string when an expression returns
  // JSON.stringify(...). Unwrap both the CLI envelope and the payload so a
  // browser rendering hiccup simply results in no ASIN rows, never guessed
  // figures.
  try {
    let parsed = JSON.parse(String(output).trim());
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return parsed;
  } catch {
    return null;
  }
}

function parseReportNumber(text) {
  const clean = String(text || '').replace(/[₹,]/g, '').replace(/%$/, '').trim();
  return /^-?\d+(?:\.\d+)?$/.test(clean) ? Number(clean) : null;
}

function visualRows(cells) {
  const rows = [];
  for (const cell of (cells || []).filter((entry) => entry && entry.text)) {
    let row = rows.find((entry) => Math.abs(entry.y - cell.y) <= 12);
    if (!row) {
      row = { y: cell.y, cells: [] };
      rows.push(row);
    }
    row.cells.push(cell);
  }
  return rows.sort((left, right) => left.y - right.y);
}

function asinTableSlice(scrollLeft) {
  const script = `(() => {
    const labels = new Set([
      'Parent) ASIN', '(Parent) ASIN', '(Child) ASIN', 'Title', 'SKU',
      'Sessions - Total', 'Sessions - Total - B2B',
      'Session Percentage - Total', 'Session Percentage - Total - B2B',
      'Page Views - Total', 'Page Views - Total - B2B',
      'Page Views Percentage - Total', 'Page Views Percentage - Total - B2B',
      'Featured Offer Percentage', 'Featured Offer Percentage - B2B',
      'Units Ordered', 'Units Ordered - B2B',
      'Unit Session Percentage', 'Unit Session Percentage - B2B',
      'Ordered Product Sales', 'Ordered Product Sales - B2B',
      'Total Order Items', 'Total Order Items - B2B'
    ]);
    const container = Array.from(document.querySelectorAll('div')).find((element) =>
      element.children.length === 2
      && element.innerText.includes('(Parent) ASIN')
      && element.innerText.includes('Total Order Items'));
    if (!container) return JSON.stringify({ headers: [], cells: [], range: [] });
    const scroller = Array.from(document.querySelectorAll('div')).find((element) =>
      element.scrollWidth > element.clientWidth + 200
      && element.innerText.includes('(Parent) ASIN')
      && element.innerText.includes('Total Order Items'));
    if (scroller) scroller.scrollLeft = ${Number(scrollLeft) || 0};
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.y > 500 && rect.y < window.innerHeight + 80;
    };
    const textOf = (element) => element.innerText.replace(/\\s+/g, ' ').trim();
    const nodes = Array.from(container.querySelectorAll('a, div')).filter((element) =>
      visible(element) && element.children.length === 0 && textOf(element)
      && !textOf(element).startsWith('What is this?'));
    const cells = nodes.map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: textOf(element), x: Math.round(rect.x), y: Math.round(rect.y) };
    });
    // Header cells are rendered in a sibling virtual layer, rather than below
    // the data container, so find their exact visible labels document-wide.
    const headers = Array.from(document.querySelectorAll('*')).filter((element) => {
      const text = textOf(element);
      return visible(element) && labels.has(text);
    }).map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: textOf(element), x: Math.round(rect.x) };
    });
    const range = Array.from(document.querySelectorAll('input')).map((input) => input.value)
      .filter((value) => /^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(value));
    return JSON.stringify({ headers, cells, range });
  })()`;
  const parsed = parseBrowserJson(browser('eval', script));
  return parsed && Array.isArray(parsed.cells) ? parsed : { headers: [], cells: [], range: [] };
}

function collectAsinPerformance(capturedAt) {
  let snapshot = browser('snapshot', '-i');
  let body = browser('eval', 'document.body.innerText');
  if (!/Business Reports\s*\|\s*Detail Page Sales and Traffic/i.test(body)) {
    const candidates = [...snapshot.matchAll(/generic "Detail Page Sales and Traffic"[^\n]*\[ref=(e\d+)\]/gi)]
      .map((match) => match[1]);
    const byAsinRef = candidates.at(-1);
    if (!byAsinRef) return { range: [], rows: [] };
    browser('click', `@${byAsinRef}`);
    browser('wait', '1200');
    snapshot = browser('snapshot', '-i');
  }
  const applyRef = refFor(snapshot, 'Apply');
  if (applyRef) {
    browser('click', `@${applyRef}`);
    browser('wait', '900');
  }

  // Seller Central virtualises horizontal columns. Read the identity cells
  // and the performance cells in two browser-visible positions, then join
  // them by their displayed row. Nothing is inferred when a cell is absent.
  const identitySlice = asinTableSlice(0);
  browser('wait', '250');
  const metricsSlice = asinTableSlice(1600);
  const identities = visualRows(identitySlice.cells);
  const measurements = visualRows(metricsSlice.cells);
  const metricHeaders = [...new Map((metricsSlice.headers || []).map((header) => [header.x, header])).values()]
    .filter((header) => /Percentage|Units Ordered|Ordered Product Sales|Total Order Items|Sessions|Page Views/i.test(header.text));
  const fieldNames = {
    'Sessions - Total': 'sessions',
    'Sessions - Total - B2B': 'sessionsB2b',
    'Page Views - Total': 'pageViews',
    'Page Views - Total - B2B': 'pageViewsB2b',
    'Featured Offer Percentage': 'featuredOfferPercentage',
    'Featured Offer Percentage - B2B': 'featuredOfferPercentageB2b',
    'Units Ordered': 'unitsOrdered',
    'Units Ordered - B2B': 'unitsOrderedB2b',
    'Unit Session Percentage': 'unitSessionPercentage',
    'Unit Session Percentage - B2B': 'unitSessionPercentageB2b',
    'Ordered Product Sales': 'orderedProductSales',
    'Ordered Product Sales - B2B': 'orderedProductSalesB2b',
    'Total Order Items': 'totalOrderItems',
    'Total Order Items - B2B': 'totalOrderItemsB2b',
  };
  const metricFields = new Set(Object.values(fieldNames));
  const rows = [];
  for (let index = 0; index < Math.min(identities.length, measurements.length); index += 1) {
    const identity = identities[index].cells;
    const sku = identity.find((cell) => /^[A-Z0-9][A-Z0-9_-]{3,}$/i.test(cell.text))?.text;
    const asins = identity.filter((cell) => /^B0[A-Z0-9]{8}$/i.test(cell.text)).map((cell) => cell.text);
    const title = identity.find((cell) => cell.text.length > 12 && !/^B0[A-Z0-9]{8}$/i.test(cell.text)
      && cell.text !== sku)?.text;
    if (!sku && !asins.length) continue;
    const row = { parentAsin: asins[0] || null, childAsin: asins.at(-1) || null, sku: sku || null, title: title || null };
    for (const cell of measurements[index].cells) {
      const header = metricHeaders.reduce((closest, candidate) =>
        (!closest || Math.abs(candidate.x - cell.x) < Math.abs(closest.x - cell.x) ? candidate : closest), null);
      const field = header && fieldNames[header.text];
      const amount = parseReportNumber(cell.text);
      if (field && amount !== null) row[field] = amount;
    }
    // A product row must contain at least one actual performance number.
    if (Object.keys(row).some((key) => metricFields.has(key))) rows.push(row);
  }
  const unique = new Map(rows.map((row) => [row.childAsin || row.sku || row.title, row]));
  return { range: identitySlice.range || metricsSlice.range || [], rows: [...unique.values()], capturedAt };
}

function refFor(snapshot, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (snapshot.match(new RegExp(`(?:link|button|generic) "${escaped}"[^\\n]*\\[ref=(e\\d+)\\]`, 'i')) || [])[1];
}

function collectSalesTrafficReport(capturedAt) {
  let snapshot = browser('snapshot', '-i');
  let body = browser('get', 'text', 'body');
  if (!/Business Reports\s*\|\s*Sales and Traffic/i.test(body)) {
    let salesTrafficRef = refFor(snapshot, 'Sales and Traffic');
    if (!salesTrafficRef) {
      const reportsRef = refFor(snapshot, 'Business reports');
      if (!reportsRef) return [];
      browser('click', `@${reportsRef}`);
      browser('wait', '1200');
      snapshot = browser('snapshot', '-i');
      salesTrafficRef = refFor(snapshot, 'Sales and Traffic');
    }
    if (!salesTrafficRef) return [];
    browser('click', `@${salesTrafficRef}`);
    browser('wait', '1500');
    body = browser('get', 'text', 'body');
  }
  return parseSalesTrafficReport(body).map((row) => ({ ...row, capturedAt }));
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
    const dailySalesTraffic = collectSalesTrafficReport(capturedAt);
    const asinPerformance = collectAsinPerformance(capturedAt);
    if (!parsed.listings.length && !Object.keys(parsed.metrics.listing_status).length && !dailySalesTraffic.length) {
      throw new Error('Seller Central returned no visible product or Business Reports data');
    }
    return {
      source: 'seller_central_browser', mode: 'browser',
      marketplace: { id: 'A21TJRUUN4KGV', name: 'Amazon India' }, lastScrapedAt: capturedAt,
      status: { state: 'ok', detail: 'Authenticated Seller Central browser read completed.', at: capturedAt },
      metrics: parsed.metrics, listings: parsed.listings, orders: [],
      salesTrafficByDate: dailySalesTraffic,
      asinPerformance,
      coverage: {
        listings: { capturedAt, count: parsed.listings.length, status: 'partial', detail: 'Visible Seller Central Product Performance rows; listing-status totals are captured separately.' },
        orders: { capturedAt: null, count: 0, status: 'unavailable', detail: 'Orders browser reader is not enabled yet.' },
      },
      limitations: [
        'Read-only data from the authenticated local Seller Central browser; no cookies or credentials are copied.',
        'Business Reports Sales and Traffic rows are captured read-only from the authenticated Seller Central browser. Sessions and conversion are included when Amazon exposes those columns in the selected report view.',
        'ASIN performance is saved only for visible report cells; the selected date range is retained with the captured rows so a reporting-period total is never shown as a daily total.',
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
  let data = capture();
  fs.mkdirSync(path.dirname(capturePath), { recursive: true });
  // A transient CDP disconnect must not erase the most recent authenticated
  // Seller Central reading. Preserve its timestamp and figures, but expose the
  // failed attempt as a status so the dashboard never represents it as fresh.
  if (data.status.state !== 'ok' && fs.existsSync(capturePath)) {
    try {
      const previous = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
      if (previous?.status?.state === 'ok' && previous?.lastScrapedAt) {
        data = {
          ...previous,
          status: { ...data.status, previousCaptureAt: previous.lastScrapedAt },
          lastAttemptAt: now(),
        };
      }
    } catch {
      // An invalid previous local file is not safe to reuse.
    }
  }
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
