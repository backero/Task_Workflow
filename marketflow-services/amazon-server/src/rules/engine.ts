import { nanoid } from 'nanoid'
import { sqlite, withTransaction } from '../db/client.js'
import { acos, organicCvr, organicSalesShare, pctChange, unitEconomics } from '../metrics.js'
import { sendAlertEmail } from '../notifications/email.js'
import { analyzeAndStoreAlerts } from '../ai/analyze.js'

type Product = {
  asin: string
  sku: string
  name: string
  category: string
  price: number | null
  cogs: number | null
  watches_asin: string | null
  is_hero: number
  is_own: number
  fee_per_unit: number | null
}

function latestDate(table: string, dateCol = 'date'): string | null {
  const row = sqlite.prepare(`SELECT MAX(${dateCol}) as d FROM ${table}`).get() as { d: string | null }
  return row?.d ?? null
}

function daysBefore(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function sumWindow(asin: string, table: string, col: string, endDate: string, days: number): number {
  const start = daysBefore(endDate, days - 1)
  const row = sqlite
    .prepare(`SELECT COALESCE(SUM(${col}), 0) as total FROM ${table} WHERE asin = ? AND date BETWEEN ? AND ?`)
    .get(asin, start, endDate) as { total: number }
  return row.total
}

/**
 * True when any listing row in the window is an approximation (e.g. a date-range CSV import
 * spread evenly across days). Week-over-week comparisons against those would report
 * "changes" that are just the shape of the estimate, so the rules skip them.
 */
function windowHasEstimates(asin: string, startDate: string, endDate: string): boolean {
  const row = sqlite
    .prepare("SELECT COUNT(*) as n FROM fact_listing_daily WHERE asin = ? AND date BETWEEN ? AND ? AND data_quality = 'estimate'")
    .get(asin, startDate, endDate) as { n: number }
  return row.n > 0
}

type NewAlert = {
  ruleId: string
  scopeType: 'asin' | 'sku' | 'keyword' | 'account'
  scopeId: string
  title: string
  message: string
  suggestedAction: string
  evidence: Record<string, unknown>
  severity: 'red' | 'amber'
}


export function runRulesEngine() {
  const products = sqlite.prepare('SELECT * FROM dim_product WHERE is_own = 1').all() as Product[]
  const allProducts = sqlite.prepare('SELECT * FROM dim_product').all() as Product[]
  const listingDate = latestDate('fact_listing_daily')
  const priceDate = latestDate('fact_price_snapshot', 'captured_at')
  const rankDate = latestDate('fact_keyword_rank_daily')
  const invDate = latestDate('fact_inventory_daily')
  const adsDate = latestDate('fact_ads_daily')

  const newAlerts: NewAlert[] = []

  // Our own seller name as the storefront prints it: SELLER_NAME if set, otherwise the name shown most often on our listings.
  const ownSeller: string | null =
    process.env.SELLER_NAME?.trim() ||
    ((sqlite.prepare(`
      SELECT s.buy_box_seller AS name FROM fact_price_snapshot s JOIN dim_product p ON p.asin = s.asin
      WHERE p.is_own = 1 AND s.data_quality = 'observed' AND s.buy_box_seller IS NOT NULL
      GROUP BY s.buy_box_seller ORDER BY COUNT(*) DESC LIMIT 1
    `).get() as { name: string } | undefined)?.name ?? null)

  for (const p of products) {
    // --- Rule 1: Buy Box Guard ---
    if (listingDate) {
      const row = sqlite
        .prepare('SELECT buy_box_pct, sessions, page_views, data_quality FROM fact_listing_daily WHERE asin = ? AND date = ?')
        .get(p.asin, listingDate) as { buy_box_pct: number; sessions: number; page_views: number; data_quality: string } | undefined
      // Buy Box % is a share of page views — with none it's undefined, not 0%.
      if (row && row.page_views > 0 && row.data_quality !== 'estimate' && row.buy_box_pct < 95) {
        newAlerts.push({
          ruleId: 'buy_box_guard', scopeType: 'asin', scopeId: p.asin, severity: 'red',
          title: `Buy Box slipping — ${p.name}`,
          message: `Buy Box held only ${row.buy_box_pct.toFixed(1)}% of the time on ${listingDate} (guard threshold: 95%).`,
          suggestedAction: 'Check for a hijacker or price-parity issue and fix pricing within 4 hours.',
          evidence: { date: listingDate, buy_box_pct: row.buy_box_pct },
        })
      }
    }

    // --- Rule 2: Visitors Guard (sessions WoW) + Rule 4: Conversion Guard ---
    if (listingDate && !windowHasEstimates(p.asin, daysBefore(listingDate, 13), listingDate)) {
      const thisWeek = sumWindow(p.asin, 'fact_listing_daily', 'sessions', listingDate, 7)
      const prevWeekEnd = daysBefore(listingDate, 7)
      const prevWeek = sumWindow(p.asin, 'fact_listing_daily', 'sessions', prevWeekEnd, 7)
      const sessionsDelta = pctChange(thisWeek, prevWeek)

      if (sessionsDelta != null && sessionsDelta < -0.25) {
        newAlerts.push({
          ruleId: 'visitors_guard', scopeType: 'asin', scopeId: p.asin, severity: 'amber',
          title: `Traffic down — ${p.name}`,
          message: `Sessions fell ${(Math.abs(sessionsDelta) * 100).toFixed(0)}% week-over-week (${prevWeek} → ${thisWeek}).`,
          suggestedAction: 'Check for listing suppression or a policy flag.',
          evidence: { this_week_sessions: thisWeek, prev_week_sessions: prevWeek, pct_change: sessionsDelta },
        })
      }

      const unitsThis = sumWindow(p.asin, 'fact_listing_daily', 'units_ordered', listingDate, 7)
      const unitsPrev = sumWindow(p.asin, 'fact_listing_daily', 'units_ordered', prevWeekEnd, 7)
      const cvrThis = organicCvr(unitsThis, thisWeek)
      const cvrPrev = organicCvr(unitsPrev, prevWeek)
      const cvrDelta = cvrThis != null && cvrPrev != null ? pctChange(cvrThis, cvrPrev) : null
      const trafficStable = sessionsDelta == null || sessionsDelta > -0.1

      if (cvrDelta != null && cvrDelta < -0.2 && trafficStable) {
        newAlerts.push({
          ruleId: 'conversion_guard', scopeType: 'asin', scopeId: p.asin, severity: 'amber',
          title: `Conversion leak — ${p.name}`,
          message: `Organic CVR fell ${(Math.abs(cvrDelta) * 100).toFixed(0)}% week-over-week while traffic held steady.`,
          suggestedAction: 'Check price, reviews, and recent listing changes.',
          evidence: { cvr_this_week: cvrThis, cvr_prev_week: cvrPrev, pct_change: cvrDelta },
        })
      }
    }

    // --- Rule 5: Ad Bleed Guard (ACOS > breakeven for 3 days) ---
    // Needs a real COGS: with none, breakeven ACOS was computed as if the product cost ₹0,
    // so the guard stayed quiet while ads were actually losing money.
    if (adsDate && p.price && p.cogs != null) {
      const days = [0, 1, 2].map((n) => daysBefore(adsDate, n))
      const rows = days.map((d) =>
        sqlite.prepare('SELECT COALESCE(SUM(spend),0) spend, COALESCE(SUM(ad_sales),0) sales FROM fact_ads_daily WHERE asin = ? AND date = ?')
          .get(p.asin, d) as { spend: number; sales: number }
      )
      // Seller Central's own per-unit fee estimate when we have it (FBA); otherwise the flat-rate guess.
      const breakeven = unitEconomics(p.price, p.fee_per_unit, p.cogs)?.breakeven_acos ?? null
      const bleeding = breakeven != null && rows.every((r) => r.sales > 0 && (acos(r.spend, r.sales) ?? 0) > breakeven)
      if (bleeding && breakeven != null) {
        const totalSpend = rows.reduce((s, r) => s + r.spend, 0)
        const totalSales = rows.reduce((s, r) => s + r.sales, 0)
        newAlerts.push({
          ruleId: 'ad_bleed_guard', scopeType: 'asin', scopeId: p.asin, severity: 'red',
          title: `Ads bleeding — ${p.name}`,
          message: `ACOS has exceeded breakeven (${(breakeven * 100).toFixed(1)}%) for 3 straight days — spent ₹${totalSpend.toFixed(0)} to earn ₹${totalSales.toFixed(0)}.`,
          suggestedAction: 'Cut bids ~20% on the worst-performing keywords/targets.',
          evidence: { days, breakeven_acos: breakeven, total_spend: totalSpend, total_ad_sales: totalSales },
        })
      }
    }

    // --- Rule 6: Ad Dependence Guard ---
    if (listingDate && adsDate) {
      const orderedSales = sumWindow(p.asin, 'fact_listing_daily', 'ordered_product_sales', listingDate, 7)
      const adSales = sumWindow(p.asin, 'fact_ads_daily', 'ad_sales', adsDate, 7)
      const share = organicSalesShare(orderedSales, adSales)
      if (share != null && share < 0.4 && orderedSales > 0) {
        newAlerts.push({
          ruleId: 'ad_dependence_guard', scopeType: 'asin', scopeId: p.asin, severity: 'amber',
          title: `Over-reliant on ads — ${p.name}`,
          message: `Only ${(share * 100).toFixed(0)}% of sales are organic this week (target ≥40%).`,
          suggestedAction: 'Invest in listing/SEO before scaling ad spend further.',
          evidence: { ordered_product_sales_7d: orderedSales, ad_sales_7d: adSales, organic_sales_share: share },
        })
      }
    }

    // --- Rule 8: Stars Guard ---
    if (priceDate) {
      const snaps = sqlite
        .prepare('SELECT captured_at, rating, review_count FROM fact_price_snapshot WHERE asin = ? ORDER BY captured_at DESC LIMIT 2')
        .all(p.asin) as { captured_at: string; rating: number | null; review_count: number | null }[]
      if (snaps.length === 2 && snaps[0].rating != null && snaps[1].rating != null) {
        const drop = snaps[1].rating - snaps[0].rating
        if (drop >= 0.1) {
          newAlerts.push({
            ruleId: 'stars_guard', scopeType: 'asin', scopeId: p.asin, severity: 'red',
            title: `Rating erosion — ${p.name}`,
            message: `Rating dropped from ${snaps[1].rating.toFixed(1)} to ${snaps[0].rating.toFixed(1)}.`,
            suggestedAction: 'Audit new reviews — check for a quality issue or bad batch.',
            evidence: { previous_rating: snaps[1].rating, current_rating: snaps[0].rating, drop },
          })
        }
      }
    }

    // --- Rule 9: Stock Guard ---
    if (invDate) {
      const inv = sqlite
        .prepare('SELECT days_of_cover FROM fact_inventory_daily WHERE sku = ? AND date = ?')
        .get(p.sku, invDate) as { days_of_cover: number | null } | undefined
      const recentAdSpend = adsDate ? sumWindow(p.asin, 'fact_ads_daily', 'spend', adsDate, 3) : 0
      if (inv && inv.days_of_cover != null && inv.days_of_cover < 14 && recentAdSpend > 0) {
        newAlerts.push({
          ruleId: 'stock_guard', scopeType: 'sku', scopeId: p.sku, severity: 'red',
          title: `Stock-out risk — ${p.name}`,
          message: `Only ${inv.days_of_cover.toFixed(1)} days of cover left while ads are still running.`,
          suggestedAction: 'Throttle ads and raise a replenishment order now.',
          evidence: { days_of_cover: inv.days_of_cover, recent_3d_ad_spend: recentAdSpend },
        })
      }
    }

    // --- Rule 12: Buy Box seller — the storefront shows someone else as the seller of our listing (hijacker / reseller) ---
    // Complements the Buy Box % rule: this is the early, visible sign, before the Business Report's percentage falls.
    if (ownSeller) {
      const seen = sqlite
        .prepare("SELECT buy_box_seller, captured_at FROM fact_price_snapshot WHERE asin = ? AND data_quality = 'observed' AND buy_box_seller IS NOT NULL ORDER BY captured_at DESC LIMIT 1")
        .get(p.asin) as { buy_box_seller: string; captured_at: string } | undefined
      if (seen && seen.buy_box_seller.trim().toLowerCase() !== ownSeller.toLowerCase()) {
        newAlerts.push({
          ruleId: 'buy_box_seller_guard', scopeType: 'asin', scopeId: p.asin, severity: 'red',
          title: `Someone else holds the Buy Box — ${p.name}`,
          message: `The storefront shows "${seen.buy_box_seller}" as the seller of this listing, not ${ownSeller} (seen ${seen.captured_at.slice(0, 16).replace('T', ' ')}).`,
          suggestedAction: 'Open the listing, check the "Other sellers" panel, and report a hijacker through Brand Registry; check your own price and stock too.',
          evidence: { seller_seen: seen.buy_box_seller, our_seller: ownSeller, captured_at: seen.captured_at },
        })
      }
    }

    // --- Rule 7: Price Guard & Rule 10: Deal Guard (vs explicitly watchlisted competitors) ---
    if (priceDate) {
      const ownSnap = sqlite
        .prepare('SELECT price, coupon_deal_flag FROM fact_price_snapshot WHERE asin = ? ORDER BY captured_at DESC LIMIT 1')
        .get(p.asin) as { price: number; coupon_deal_flag: number } | undefined
      const competitors = allProducts.filter((c) => !c.is_own && c.watches_asin === p.asin)
      for (const comp of competitors) {
        const compSnap = sqlite
          .prepare('SELECT price, coupon_deal_flag FROM fact_price_snapshot WHERE asin = ? ORDER BY captured_at DESC LIMIT 1')
          .get(comp.asin) as { price: number; coupon_deal_flag: number } | undefined
        if (!ownSnap || !compSnap) continue

        if (compSnap.price < ownSnap.price) {
          newAlerts.push({
            ruleId: 'price_guard', scopeType: 'asin', scopeId: p.asin, severity: 'amber',
            title: `Undercut by ${comp.name} — ${p.name}`,
            message: `${comp.name} is priced ₹${compSnap.price.toFixed(0)} vs your ₹${ownSnap.price.toFixed(0)}.`,
            suggestedAction: 'Decide on a counter-price today.',
            evidence: { your_price: ownSnap.price, competitor_asin: comp.asin, competitor_price: compSnap.price },
          })
        }
        if (compSnap.coupon_deal_flag && !ownSnap.coupon_deal_flag) {
          newAlerts.push({
            ruleId: 'deal_guard', scopeType: 'asin', scopeId: p.asin, severity: 'amber',
            title: `Rival deal live — ${p.name}`,
            message: `${comp.name} has an active coupon/deal; you don't.`,
            suggestedAction: 'Decide on a counter-promotion, especially in festive windows.',
            evidence: { competitor_asin: comp.asin, competitor_has_deal: true, you_have_deal: false },
          })
        }
      }
    }
  }

  // --- Rule 3: Search Rank Guard — a keyword we ranked top-5 for is now worse than position 10 ---
  // "Top-5" is read from our own rank history (best organic position in the previous 14 days), so it needs no manual
  // flag; a keyword marked hero is also guarded. A product that has dropped off the results entirely counts as
  // "worse than 10" — that is the worst case, and it leaves no row at all, so absence on a swept keyword is the signal.
  if (rankDate) {
    const keywords = sqlite.prepare('SELECT keyword, is_hero_target FROM dim_keyword').all() as { keyword: string; is_hero_target: number }[]
    for (const { keyword, is_hero_target } of keywords) {
      const swept =
        (sqlite.prepare('SELECT MAX(date) d FROM fact_search_share WHERE keyword = ?').get(keyword) as { d: string | null }).d ??
        (sqlite.prepare('SELECT MAX(date) d FROM fact_keyword_rank_daily WHERE keyword = ?').get(keyword) as { d: string | null }).d
      if (!swept) continue
      for (const p of products) {
        const now = (sqlite.prepare('SELECT organic_rank FROM fact_keyword_rank_daily WHERE keyword = ? AND asin = ? AND date = ?').get(keyword, p.asin, swept) as { organic_rank: number | null } | undefined)?.organic_rank ?? null
        const best = (sqlite.prepare('SELECT MIN(organic_rank) b FROM fact_keyword_rank_daily WHERE keyword = ? AND asin = ? AND date < ? AND date >= ? AND organic_rank IS NOT NULL')
          .get(keyword, p.asin, swept, daysBefore(swept, 14)) as { b: number | null }).b
        const wasTop5 = best != null && best <= 5
        const fell = now != null ? now > 10 : best != null && best <= 10   // never seen in the top 10 before: nothing to "fall" from
        if (!fell || !(wasTop5 || (is_hero_target === 1 && now != null))) continue
        newAlerts.push({
          ruleId: 'search_rank_guard', scopeType: 'keyword', scopeId: keyword, severity: 'amber',
          title: `Fell out of top 10 for "${keyword}"`,
          message: `${p.name} ${now == null ? 'no longer appears in the top results' : `is now ranked #${now}`} for "${keyword}"${best != null ? ` (its best position in the last 2 weeks was #${best})` : ''}.`,
          suggestedAction: 'Increase bids or push a coupon to climb back; check the listing still contains the keyword.',
          evidence: { keyword, asin: p.asin, organic_rank: now, best_recent_rank: best, swept_on: swept },
        })
      }
    }
  }

  // --- Rule 11: Account Health Guard (Seller Central "Account Health") ---
  // Not in the founder's list, but a deactivated seller-fulfilled offer means no sales at all.
  const health = sqlite
    .prepare("SELECT * FROM fact_account_health WHERE captured_at > datetime('now', '-7 days') ORDER BY captured_at DESC LIMIT 1")
    .get() as
    | {
        captured_at: string; at_risk: number; banner: string | null; ahr: number | null
        odr_fbm_pct: number | null; odr_fbm_defects: number | null; odr_fbm_orders: number | null; odr_target_pct: number | null
        late_dispatch_pct: number | null; late_dispatch_late: number | null; late_dispatch_orders: number | null; late_dispatch_target_pct: number | null
        cancel_pct: number | null; cancel_count: number | null; cancel_orders: number | null; cancel_target_pct: number | null
        emergency_contact_verified: number | null
      }
    | undefined
  if (health) {
    const over = (v: number | null, target: number | null) => v != null && target != null && v > target
    const breaches = [
      over(health.odr_fbm_pct, health.odr_target_pct) &&
        `Order Defect Rate ${health.odr_fbm_pct}% (target ${health.odr_target_pct}%, ${health.odr_fbm_defects} of ${health.odr_fbm_orders} orders)`,
      over(health.late_dispatch_pct, health.late_dispatch_target_pct) &&
        `Late Dispatch Rate ${health.late_dispatch_pct}% (target ${health.late_dispatch_target_pct}%, ${health.late_dispatch_late} of ${health.late_dispatch_orders} orders)`,
      over(health.cancel_pct, health.cancel_target_pct) &&
        `Cancellation Rate ${health.cancel_pct}% (target ${health.cancel_target_pct}%, ${health.cancel_count} of ${health.cancel_orders} orders)`,
    ].filter(Boolean) as string[]
    if (health.at_risk || breaches.length > 0) {
      newAlerts.push({
        ruleId: 'account_health_guard', scopeType: 'account', scopeId: 'seller_central', severity: 'red',
        title: 'Account health — seller-fulfilled offers at risk of deactivation',
        message: `${breaches.join('; ') || health.banner || 'Amazon flags this account as at risk'}. Amazon can deactivate self-fulfilled offers that stay above these limits.`,
        suggestedAction:
          'Ship every self-fulfilled order inside the handling time (check the handling-time setting on those listings), stop cancelling orders (keep quantities accurate, or move fast sellers to FBA), and open Customer Service Performance to see which order caused the negative feedback. With only ~11–21 orders in the window, each single order moves these rates a lot.',
        evidence: { as_of: health.captured_at, ahr: health.ahr, banner: health.banner, breaches },
      })
    }
    if (health.emergency_contact_verified === 0) {
      newAlerts.push({
        ruleId: 'account_contact_guard', scopeType: 'account', scopeId: 'seller_central', severity: 'amber',
        title: 'Verify your emergency contact number',
        message: 'Amazon shows the emergency contact as not verified, so the Account Health team cannot reach you quickly if something critical happens.',
        suggestedAction: 'Seller Central → Account Health → "Complete verification" (about a minute).',
        evidence: { as_of: health.captured_at },
      })
    }
  }

  // --- Rules 12 & 13: Listing Status and Low Stock, from the latest Manage All Inventory read ---
  const latestListingRead = sqlite
    .prepare("SELECT MAX(captured_at) as t FROM fact_listing_snapshot WHERE captured_at > datetime('now', '-7 days')")
    .get() as { t: string | null }
  if (latestListingRead.t) {
    const rows = sqlite
      .prepare('SELECT asin, available, units_sold_30d, fulfilment FROM fact_listing_snapshot WHERE captured_at = ?')
      .all(latestListingRead.t) as { asin: string; available: number | null; units_sold_30d: number | null; fulfilment: string | null }[]
    const activeAsins = new Set(rows.map((r) => r.asin))

    // Only judge "not active" from a read that plainly wasn't cut short.
    if (rows.length >= 5) {
      for (const p of products) {
        if (activeAsins.has(p.asin)) continue
        const recentTraffic = sqlite
          .prepare("SELECT COUNT(*) as n FROM fact_listing_daily WHERE asin = ? AND data_quality != 'estimate' AND date >= date('now', '-14 days')")
          .get(p.asin) as { n: number }
        if (!p.is_hero && recentTraffic.n === 0) continue
        newAlerts.push({
          ruleId: 'listing_status_guard', scopeType: 'asin', scopeId: p.asin, severity: p.is_hero ? 'red' : 'amber',
          title: `Listing not active — ${p.name}`,
          message: `${p.name} is missing from Seller Central's list of Active listings (${rows.length} active as of ${latestListingRead.t.slice(0, 10)}).`,
          suggestedAction: 'Manage All Inventory → "Activate listings": look for the reason (out of stock, missing attribute, price issue, or a suppression) and fix it.',
          evidence: { active_listings: rows.length, as_of: latestListingRead.t },
        })
      }
    }

    // Low stock uses Amazon's own 30-day units sold, so it works from day one (no history of ours needed).
    for (const r of rows) {
      const p = products.find((x) => x.asin === r.asin)
      if (!p || r.available == null || !r.units_sold_30d || r.units_sold_30d <= 0) continue
      const dailyRate = r.units_sold_30d / 30
      const cover = r.available / dailyRate
      if (r.available === 0) {
        newAlerts.push({
          ruleId: 'low_stock_guard', scopeType: 'asin', scopeId: p.asin, severity: 'red',
          title: `Out of stock while selling — ${p.name}`,
          message: `Zero units available (${r.fulfilment ?? 'stock'}) but it sold ${r.units_sold_30d} in the last 30 days.`,
          suggestedAction: r.fulfilment === 'FBA' ? 'Send an inbound shipment to Amazon now; check inbound status.' : 'Update the quantity on this listing as soon as stock is available — an empty listing loses its Buy Box and ranking.',
          evidence: { available: r.available, units_sold_30d: r.units_sold_30d },
        })
      } else if (cover < 7) {
        newAlerts.push({
          ruleId: 'low_stock_guard', scopeType: 'asin', scopeId: p.asin, severity: 'amber',
          title: `Low stock — ${p.name}`,
          message: `${r.available} units left ≈ ${cover.toFixed(1)} days at the recent pace (${r.units_sold_30d} sold in 30 days).`,
          suggestedAction: 'Replenish now — running out drops the listing\'s ranking and can cost the Buy Box.',
          evidence: { available: r.available, days_of_cover: Number(cover.toFixed(1)), units_sold_30d: r.units_sold_30d },
        })
      }
    }
  }

  // --- Rule 14: Ads started running (the ads sentinel saw activity we don't collect in detail) ---
  const adsSeen = sqlite
    .prepare("SELECT * FROM fact_ads_summary WHERE captured_at > datetime('now', '-7 days') ORDER BY captured_at DESC LIMIT 1")
    .get() as { range_label: string | null; impressions: number; clicks: number; sales: number; captured_at: string } | undefined
  if (adsSeen && (adsSeen.impressions > 0 || adsSeen.clicks > 0 || adsSeen.sales > 0)) {
    newAlerts.push({
      ruleId: 'ads_uncollected', scopeType: 'account', scopeId: 'ads_console', severity: 'amber',
      title: 'Ads are running but their performance is not being measured',
      message: `The Ads console shows ${adsSeen.impressions} impressions, ${adsSeen.clicks} clicks and ₹${adsSeen.sales} sales for ${adsSeen.range_label ?? 'the recent range'}, but ACOS, TACOS and the ad-bleed guard have no per-product ad data.`,
      suggestedAction: 'Ad spend now needs a per-product report collector — ask to have it built before scaling budgets.',
      evidence: { range: adsSeen.range_label, impressions: adsSeen.impressions, clicks: adsSeen.clicks, sales: adsSeen.sales },
    })
  }

  // Replace all currently-open auto-generated alerts with a fresh evaluation.
  // Snoozed / dismissed / applied alerts are left untouched as a historical record.
  // Alerts are re-derived from scratch every run (ids change), so "genuinely new"
  // is tracked by (rule_id, scope_id) against what was open just before this pass —
  // that's what the email notifier below uses to avoid re-mailing an alert that's
  // simply still ongoing.
  const justFired: (NewAlert & { id: string })[] = withTransaction(() => {
    const previouslyOpenKeys = new Set(
      (sqlite.prepare("SELECT rule_id, scope_id FROM alerts WHERE status = 'open'").all() as { rule_id: string; scope_id: string }[])
        .map((r) => `${r.rule_id}::${r.scope_id}`),
    )

    sqlite.prepare("DELETE FROM alerts WHERE status = 'open'").run()
    const insert = sqlite.prepare(`
      INSERT INTO alerts (id, rule_id, scope_type, scope_id, title, message, suggested_action, evidence_json, severity, fired_at, status)
      VALUES (@id, @ruleId, @scopeType, @scopeId, @title, @message, @suggestedAction, @evidenceJson, @severity, @firedAt, 'open')
    `)
    const fresh: (NewAlert & { id: string })[] = []
    for (const a of newAlerts) {
      const id = nanoid()
      insert.run({
        id,
        ruleId: a.ruleId,
        scopeType: a.scopeType,
        scopeId: a.scopeId,
        title: a.title,
        message: a.message,
        suggestedAction: a.suggestedAction,
        evidenceJson: JSON.stringify(a.evidence),
        severity: a.severity,
        firedAt: new Date().toISOString(),
      })
      if (!previouslyOpenKeys.has(`${a.ruleId}::${a.scopeId}`)) fresh.push({ ...a, id })
    }
    return fresh
  })

  if (justFired.length > 0) {
    sendAlertEmail(
      justFired.map((a) => ({ title: a.title, message: a.message, suggestedAction: a.suggestedAction, severity: a.severity })),
    ).catch((err) => console.error('[rules-engine] alert email failed:', err))

    analyzeAndStoreAlerts(
      justFired.map((a) => ({ id: a.id, scopeType: a.scopeType, scopeId: a.scopeId, title: a.title, message: a.message, evidence: a.evidence })),
    ).catch((err) => console.error('[rules-engine] AI analysis failed:', err))
  }

  return newAlerts.length
}
