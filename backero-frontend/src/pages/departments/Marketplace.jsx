import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useSocketStore } from '../../store/useSocketStore';
import {
  ExclamationTriangleIcon, CheckCircleIcon, ChartBarIcon,
  ArrowDownTrayIcon, BoltIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORMS = ['Amazon', 'Flipkart', 'Meesho', 'Myntra', 'JioMart', 'Snapdeal'];
const PLATFORM_META = {
  Amazon:   { color: '#FF9900', bg: '#fff7ed', text: '#b45309', initial: 'A' },
  Flipkart: { color: '#2874f0', bg: '#eff6ff', text: '#1d4ed8', initial: 'F' },
  Meesho:   { color: '#f43397', bg: '#fdf2f8', text: '#be185d', initial: 'M' },
  Myntra:   { color: '#ff3f6c', bg: '#fff1f2', text: '#be123c', initial: 'My' },
  JioMart:  { color: '#0077B6', bg: '#eff6ff', text: '#1e40af', initial: 'J' },
  Snapdeal: { color: '#e40046', bg: '#fff1f2', text: '#9f1239', initial: 'S' },
};
const STATUS_COLORS = {
  'Completed':        { dot: '#22c55e', badge: 'bg-green-100 text-green-700' },
  'In Progress':      { dot: '#eab308', badge: 'bg-yellow-100 text-yellow-800' },
  'Assigned':         { dot: '#3b82f6', badge: 'bg-blue-100 text-blue-700' },
  'Pending':          { dot: '#94a3b8', badge: 'bg-gray-100 text-gray-600' },
  'Approval Pending': { dot: '#6366f1', badge: 'bg-indigo-100 text-indigo-700' },
  'Reopened':         { dot: '#ef4444', badge: 'bg-red-100 text-red-700' },
};
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EMPTY_KPI = { units: '', sessions: '', ctr: '', cvr: '', acos: '', adSpend: '', adRevenue: '', reviews: '', fbaStock: '', cumPnl: '' };

// ── Base tasks per weekday (same every week) ──────────────────────────────────

const BASE_TASKS = {
  Mon: [
    { id: 'b1', text: 'Read full strategy document for this week', note: '' },
    { id: 'b2', text: 'Send agency weekly review brief', note: '' },
    { id: 'b3', text: 'Set ad path: P&L < −₹500 → Conservative | −₹500 to +₹2,000 → Base | >+₹2,000 → Aggressive', note: '' },
    { id: 'b4', text: 'Confirm all 3 hero ASINs: live, in stock, Buy Box 100%', note: '' },
    { id: 'b5', text: 'Pull last week data: Sessions, Unit Session %, ACOS per campaign', note: '' },
  ],
  Tue: [
    { id: 'b1', text: 'Listing quality scan on all hero ASINs (title, image, bullets, backend keywords, A+)', note: 'Flag any issues for immediate fix' },
  ],
  Wed: [
    { id: 'b1', text: 'Search-term harvest: Auto campaigns — 1+ conversion → add to Manual EXACT', note: '' },
    { id: 'b2', text: 'Negative keyword cleanup: 15+ impressions, 0 clicks → add as negative', note: '' },
    { id: 'b3', text: 'Bid adjustments: CVR ≥15% → raise +10–15% | ACOS >70% for 3+ weeks → pause', note: '' },
  ],
  Thu: [
    { id: 'b1', text: 'Answer every new buyer Q&A within 24 hours', note: '' },
    { id: 'b2', text: 'Reply publicly to all new 1–3 star reviews', note: '' },
    { id: 'b3', text: 'Customer message audit — repeated complaints = listing fix needed', note: '' },
  ],
  Fri: [
    { id: 'b1', text: 'Competitor tracking sheet update (5 ASINs: price, reviews, images, badges, BSR)', note: '' },
    { id: 'b2', text: 'Keyword rank check — 6 priority keywords in incognito browser', note: '' },
    { id: 'b3', text: 'Pull weekly KPI snapshot → enter in Numbers panel on the right', note: '' },
  ],
  Sat: [
    { id: 'b1', text: 'Spillover buffer — finish any Mon–Fri tasks not completed', note: '' },
    { id: 'b2', text: 'Pre-fill weekly scorecard (units, spend, revenue, P&L, reviews, rank, wins, misses)', note: '' },
    { id: 'b3', text: 'Monday prep note — what must be ready before Monday begins', note: '' },
  ],
};

// ── Must-complete checklist per weekday ───────────────────────────────────────

const MUST_COMPLETE = {
  Mon: ['Agency review brief sent', 'Ad path decided and set', 'All 3 hero ASINs confirmed live, in stock, Buy Box 100%', "This week's #1 task STARTED (not just planned)"],
  Tue: ['All catalog changes LIVE in Seller Central (not draft)', 'Backend keywords updated on hero listing (all 250 chars)', 'FBA inventory checked — below 14 days → replenishment triggered'],
  Wed: ['Negative keyword cleanup done', 'Search-term harvest done — converting terms added to Manual EXACT', 'All ad changes LIVE in Ad Console (not planned)'],
  Thu: ['Zero unanswered Q&A on all 3 hero pages', 'Every new 1–3 star review has a public reply', 'Vine ship-outs done if any Vine reviewer requested'],
  Fri: ['Competitor tracking sheet updated', 'Keyword rank logged for all 6 priority keywords (incognito)', 'Weekly KPI snapshot pulled and ready for Sunday scorecard'],
  Sat: ['Sunday scorecard data pre-filled', 'Zero tasks carrying over to next week', 'Monday prep note written'],
};

// ── Hero & Watch SKUs ─────────────────────────────────────────────────────────

const HEROES_DATA = [
  { asin: 'B0F2JD3RC1', name: 'Neem Anti-Dandruff Shampoo 100ml',     label: 'Hero #1',  type: 'hero',   note: 'CTR target ≥1.25% · Manual EXACT since W1' },
  { asin: 'B0F66J4RPQ', name: 'Coconut Curry Leaves Hair Oil 200ml',   label: 'Hero #2',  type: 'hero',   note: 'Page-1 push from W5' },
  { asin: '(TBD)',       name: 'Coconut Curry Leaves Hair Oil 100ml',   label: 'Hero #3',  type: 'hero',   note: 'Dedicated campaign from W9' },
  { asin: 'B0F4XXC6ZG', name: 'Choco Coffee Face Wash 100ml',          label: 'Watch #1', type: 'watch',  note: '1.52% CTR — promote if CVR ≥12% by W5' },
  { asin: '(TBD)',       name: 'Hibiscus Chamomile Shampoo 100ml',      label: 'Watch #2', type: 'watch',  note: 'Promotion decision by W8' },
  { asin: 'B0F5BVYW3X', name: 'Neem Vitamin C Face Wash 150ml',        label: 'Watch #3', type: 'watch',  note: '33% CVR sleeper — decision by W11' },
  { asin: '(Bundle)',    name: 'Hero #1 + Hero #2',                     label: 'Bundle',   type: 'bundle', note: '₹340 · Created W2 · 1 review/week from W7' },
];

// ── Triggered conditions ──────────────────────────────────────────────────────

const TRIGGERED_CONDITIONS = [
  { id: 1,  level: 'red',   text: 'FBA stock <7 days → Create replenishment TODAY (last 30-day velocity × 21 days)' },
  { id: 2,  level: 'amber', text: 'FBA stock <14 days → Schedule replenishment for next Tuesday' },
  { id: 3,  level: 'red',   text: 'Any campaign ACOS >70% for 3+ weeks → PAUSE immediately, reallocate budget' },
  { id: 4,  level: 'amber', text: 'Competitor drops price >10% → Decide: match / undercut ₹5–10 / hold within 48 hours' },
  { id: 5,  level: 'red',   text: 'Account-health warning → STOP all work, respond within 24 hours' },
  { id: 6,  level: 'red',   text: 'Hero listing suppressed → Find reason same day, fix and resubmit' },
  { id: 7,  level: 'amber', text: 'Negative review posted → Reply publicly within 24 hours' },
  { id: 8,  level: 'red',   text: 'Cumulative Net P&L crosses −₹15,000 → FORCED Conservative for 2 weeks' },
  { id: 9,  level: 'green', text: 'Cumulative Net P&L crosses +₹5,000 by Week 6 → Eligible for Aggressive path' },
  { id: 10, level: 'green', text: 'Any hero crosses 30 reviews → Apply Sponsored Brands + raise Manual EXACT bids +15%' },
  { id: 11, level: 'green', text: "Any hero crosses 50 reviews → Check Amazon's Choice eligibility + raise bids +10%" },
  { id: 12, level: 'green', text: 'Vine reviews start posting → Integrate review language into A+ and bullets within 48 hours' },
  { id: 13, level: 'amber', text: 'Bundle attach rate <10% for 2 weeks → Refresh bundle listing and reconsider price' },
  { id: 14, level: 'amber', text: 'Brand Store not approved after 7 business days → Open Seller Support case' },
  { id: 15, level: 'amber', text: 'FBA receiving discrepancy → File reimbursement claim within 60 days' },
];

// ── Saturday scorecard fields ─────────────────────────────────────────────────

const SCORECARD_FIELDS = [
  { key: 'units',       label: 'Units Sold',              ph: '0' },
  { key: 'target',      label: 'Target',                  ph: '0' },
  { key: 'bestHero',    label: 'Best Hero',               ph: 'Hero #1' },
  { key: 'worstHero',   label: 'Weakest Hero',            ph: 'Hero #3' },
  { key: 'adSpend',     label: 'Total Ad Spend (₹)',      ph: '0' },
  { key: 'adRevenue',   label: 'Total Ad Revenue (₹)',    ph: '0' },
  { key: 'acos',        label: 'Overall ACOS (%)',         ph: '0' },
  { key: 'reviews',     label: 'Agency Reviews Published', ph: '0' },
  { key: 'netPnl',      label: 'Net P&L (₹)',             ph: '0' },
  { key: 'fbaStatus',   label: 'FBA Stock Status',         ph: 'OK / Low / Critical' },
  { key: 'adPath',      label: 'Ad Path Next Week',        ph: 'Conservative / Base / Aggressive' },
  { key: 'ctrHero1',    label: 'Hero #1 CTR (%)',          ph: '0.00' },
  { key: 'ctrHero2',    label: 'Hero #2 CTR (%)',          ph: '0.00' },
  { key: 'rankHero1',   label: 'Keyword Rank Hero #1',     ph: 'Page X, Position Y' },
  { key: 'rankHero2',   label: 'Keyword Rank Hero #2',     ph: 'Page X, Position Y' },
  { key: 'wins',        label: 'Top 3 Wins',               ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'misses',      label: 'Top 3 Misses',             ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'decision',    label: 'Decision Needed From Founder', ph: '...', ml: true },
  { key: 'stopLossFired', label: 'Stop-Loss Rule Triggered?', ph: 'None / Rule #X' },
];

// ── Treyfa Amazon 12-Week Operations Plan ─────────────────────────────────────

const WEEK_DATA = [
  {
    n: 1, title: 'FOUNDATION', desc: 'Clean catalog, declare 3 heroes, launch first ads',
    nonNeg: '6 combo ASINs CLOSED by Tuesday',
    budgets: { conservative: 1400, base: 2000, aggressive: 2500 },
    ws: {
      Mon: [{ id: 1, text: 'List all 6 combo + 7 Tier-2 ASINs, mark Close/Pause/Keep', note: 'Decision criteria: CVR <3% for 4+ weeks → Close' }],
      Tue: [
        { id: 1, text: 'CLOSE ASINs: B0FR5B2W1C, B0FR5DF4QZ, B0FR99VWLK, B0FR9SLHJZ, B0FRNCN6TN, B0FRSMH5TH', note: 'NON-NEGOTIABLE — must be closed today, not archived' },
        { id: 2, text: 'Close Tier-2: B0F5QLFC18, B0F66DJHZG, B0F5BTTL34, B0F6D5PT1W · Pause: B0F5W5FXRM + B0F6D77CQ7', note: 'Pause = suppress ads only; keep listing live' },
        { id: 3, text: 'Backend keyword fill (250 chars): misspellings, Hindi/Tamil words, long-tails', note: 'Do for each hero ASIN today' },
      ],
      Wed: [
        { id: 1, text: 'Submit Brand Store for review', note: 'Approval takes 3–7 business days' },
        { id: 2, text: 'Launch Tier 1 brand awareness campaign ₹500/wk', note: 'Broad match, low bids, discovery mode' },
        { id: 3, text: "Launch Tier 2 Manual EXACT Hero #1 ₹600/wk — 'neem shampoo', 'anti dandruff shampoo'", note: '' },
        { id: 4, text: 'Launch Tier 3 SP Auto for all heroes ₹900/wk total', note: 'Auto catches long-tail and new search terms' },
      ],
      Thu: [
        { id: 1, text: 'Q&A seeding round 1 — 5 questions per hero from friends/family', note: 'Focus on: ingredients, size, smell, results' },
        { id: 2, text: 'Set up WhatsApp Business Catalog — add all 3 hero ASINs', note: 'Enables product sharing and order tracking via WhatsApp' },
      ],
      Fri: [{ id: 1, text: 'Build competitor tracking sheet from scratch', note: 'Columns: ASIN, Price, Reviews, Stars, Image, Prime, BSR — 5 competitors per hero' }],
      Sat: [{ id: 1, text: 'Design packaging insert: QR code → ₹50 voucher + review request', note: 'Simple: 1 QR, 1 ask, 1 benefit. Print-ready PDF.' }],
    },
  },
  {
    n: 2, title: 'FBA PREP', desc: 'FBA shipment, virtual bundle, expand ads',
    nonNeg: 'FBA shipment dispatched by Thursday',
    budgets: { conservative: 1400, base: 2000, aggressive: 2800 },
    ws: {
      Mon: [{ id: 1, text: 'Write FBA shipment plan: 85 units across 3 heroes', note: 'Hero #1: 35 units · Hero #2: 30 units · Hero #3: 20 units' }],
      Tue: [
        { id: 1, text: 'Create FBA shipment in Seller Central (85 units, 3 heroes)', note: 'Use Inventory → Send to Amazon' },
        { id: 2, text: 'Print FNSKU labels for all units', note: 'Each unit needs a barcode — print on A4 sticker sheets' },
        { id: 3, text: 'Create Virtual Product Bundle: Hero #1 + Hero #2 at ₹340', note: 'Saves ₹30 vs buying separately — highlight in listing' },
      ],
      Wed: [{ id: 1, text: "Launch Manual EXACT campaign for Hero #2 ₹600/wk", note: "Keywords: 'curry leaves hair oil', 'coconut hair oil', 'curry leaves oil for hair'" }],
      Thu: [
        { id: 1, text: 'Dispatch FBA shipment to Amazon warehouse — NON-NEGOTIABLE', note: 'Use Amazon-partnered carrier for auto-tracking' },
        { id: 2, text: 'Check Vine eligibility for Hero #1', note: 'Need: enrolled in Brand Registry, FBA, eligible category' },
      ],
      Fri: [],
      Sat: [
        { id: 1, text: 'Confirm inserts are printed and in every FBM order', note: 'Check last 10 FBM orders — were inserts included?' },
        { id: 2, text: 'Set up Vine readiness checklist for Hero #1', note: 'Confirm: FBA active, Brand Registry enrolled, Vine criteria met' },
      ],
    },
  },
  {
    n: 3, title: 'COUPON #1', desc: 'Coupon live, Turmeric rescue, FBA in transit',
    nonNeg: 'Coupon live on Hero #1 & #2 · Vine enrollment submitted',
    budgets: { conservative: 1800, base: 2500, aggressive: 3500 },
    ws: {
      Mon: [],
      Tue: [
        { id: 1, text: 'Refresh A+ content on Hero #1 and Hero #2', note: 'Update with any Vine/review language if available' },
        { id: 2, text: 'Configure 10% coupon on Hero #1 + Hero #2, ₹2000 cap, 7 days', note: 'Coupon badge in search results boosts CTR ~15%' },
        { id: 3, text: 'Add packaging insert to every FBM order going out this week', note: 'Track fulfilment — confirm with warehouse' },
      ],
      Wed: [{ id: 1, text: 'Pause all keywords with ACOS >70% for 2+ weeks', note: 'Data threshold: 14+ days and ACOS consistently >70%' }],
      Thu: [
        { id: 1, text: 'Enroll Hero #1 in Amazon Vine (₹2,000–3,000 fee)', note: 'Vine generates 3–8 verified reviews within 30 days' },
        { id: 2, text: 'Confirm Turmeric agency reviews are being posted on schedule', note: 'Track: how many reviews this week vs plan?' },
      ],
      Fri: [],
      Sat: [{ id: 1, text: 'Q&A seeding round 2 — 3 more questions per hero', note: 'Different questions from round 1 — focus on use-case scenarios' }],
    },
  },
  {
    n: 4, title: 'FBA GOES LIVE', desc: 'Prime badge confirmed, CTR lift, Manual EXACT bids up',
    nonNeg: 'Prime badge confirmed + Manual EXACT bids raised +20% same day',
    budgets: { conservative: 1800, base: 2500, aggressive: 3800 },
    ws: {
      Mon: [
        { id: 1, text: 'Confirm Prime badge live on all 3 hero ASINs in incognito browser', note: 'Prime badge must show — if not, check FBA receiving status' },
        { id: 2, text: 'Raise Manual EXACT bids +20% immediately upon Prime confirmation', note: 'Prime dramatically improves CVR — capitalize immediately' },
      ],
      Tue: [
        { id: 1, text: 'Verify FBA received count vs shipped count', note: 'Go to Shipment details → check received vs expected' },
        { id: 2, text: 'File reimbursement claim if any units are short', note: 'Inventory → FBA → Lost & Damaged → file within 60 days' },
      ],
      Wed: [{ id: 1, text: 'Launch WhatsApp Wave 1 broadcast + Sponsored Display retargeting Hero #1 ₹400/wk', note: 'Wave 1: 10% off, time-limited, existing contacts' }],
      Thu: [
        { id: 1, text: 'Vine product ship-outs — confirm all Vine reviewer requests fulfilled', note: 'Delay in Vine fulfillment = delayed reviews' },
        { id: 2, text: 'Check Turmeric star rating — is it approaching 4.0?', note: 'Below 4.0 at Week 4 = extend rescue plan' },
      ],
      Fri: [{ id: 1, text: 'FBA DECISION GATE — CTR improved ≥5% vs FBM baseline?', note: 'YES → FBA Phase 2 is GO. Document decision clearly.' }],
      Sat: [{ id: 1, text: 'If FBA Phase 2 GO → generate Watch #1 + Watch #2 shipment (20 units each)', note: 'Print FNSKU labels, arrange collection with carrier' }],
    },
  },
  {
    n: 5, title: 'CVR CEILING PUSH', desc: 'CVR push, Coupon #2, Watch SKU promotion decisions',
    nonNeg: 'A/B image test LIVE on Hero #1',
    budgets: { conservative: 2200, base: 3000, aggressive: 4500 },
    ws: {
      Mon: [{ id: 1, text: 'Watch #1 promotion decision — CVR ≥12% for 3+ weeks?', note: 'YES → promote to Hero #4 with dedicated campaign' }],
      Tue: [
        { id: 1, text: 'Dispatch FBA Phase 2 shipment (Watch #1 + Watch #2, 20 units each)', note: 'Only if FBA Phase 2 decision was GO in Week 4' },
        { id: 2, text: 'Launch A/B image test on Hero #1 in Manage Your Experiments', note: 'Test: current main image vs lifestyle/angle variant' },
      ],
      Wed: [
        { id: 1, text: 'Launch Coupon #2 (8% off) on Hero #2', note: 'Time it with the page-1 bid push for maximum visibility' },
        { id: 2, text: "Hero #2 page-1 bid push +20% on top keywords", note: "Targets: 'curry leaves hair oil', 'coconut hair oil'" },
      ],
      Thu: [{ id: 1, text: 'CRITICAL — Turmeric crossed 4.0 stars?', note: 'YES → schedule relaunch for Week 6 Tuesday. NO → extend rescue 2 more weeks.' }],
      Fri: [{ id: 1, text: 'ACOS audit prep — list every campaign with 4-week average ACOS', note: 'Prepare for full audit next week' }],
      Sat: [{ id: 1, text: 'FBT engineering — create 2–3 more paired orders (Hero #1 + Hero #3)', note: 'Target: 10–12 total FBT paired orders this week' }],
    },
  },
  {
    n: 6, title: 'FULL ACOS AUDIT', desc: 'ACOS audit, Turmeric verdict, Hero #2 locked',
    nonNeg: 'Every campaign categorised: Scale / Hold / Pause',
    budgets: { conservative: 2200, base: 3000, aggressive: 4800 },
    ws: {
      Mon: [{ id: 1, text: 'Mid-plan reflection — 6-week data review across all heroes', note: 'Compare Week 1 vs Week 6: Sessions, CVR, ACOS, Reviews, BSR' }],
      Tue: [{ id: 1, text: 'Turmeric relaunch if star rating ≥4.0 stars', note: 'Relaunch: refresh listing, coupon, reset ads to base budget' }],
      Wed: [{ id: 1, text: 'FULL ACOS AUDIT — categorise every campaign', note: '<40% ACOS → Scale +25% | 40–70% → Hold | >70% → Pause immediately' }],
      Thu: [],
      Fri: [{ id: 1, text: 'Hero #2 rank check — confirm page 1 on "curry leaves hair oil"', note: 'Check in incognito browser from 3 different search terms' }],
      Sat: [
        { id: 1, text: 'FBT final round — push to 15–18 total paired orders', note: 'After 15+ paired orders, Amazon algorithm picks up the FBT carousel' },
        { id: 2, text: 'Write mid-plan course correction document', note: 'What is working? What is not? 3 changes for Weeks 7–12' },
      ],
    },
  },
  {
    n: 7, title: 'SPONSORED BRANDS', desc: 'SB launch, bundle scaling, WhatsApp Wave 1',
    nonNeg: 'Sponsored Brands campaign LIVE by Wednesday',
    budgets: { conservative: 2500, base: 3500, aggressive: 5500 },
    ws: {
      Mon: [
        { id: 1, text: 'Confirm Brand Store is LIVE (approved by now)', note: 'Check Store → Manage Store → Published status' },
        { id: 2, text: 'Pull buyer list for WhatsApp Wave 1 from last 90-day orders', note: 'Export from Business Reports → Orders → contact list' },
      ],
      Tue: [{ id: 1, text: 'Refresh bundle A+ content — deploy A/B test winner from Week 5', note: 'Use winning image in bundle carousel too' }],
      Wed: [
        { id: 1, text: 'Launch Sponsored Brands campaign ₹800/wk', note: 'Creative: brand logo + 3 hero ASINs + "Natural Hair Care" headline' },
        { id: 2, text: 'Launch bundle ad campaign ₹400/wk', note: 'Target bundle searchers: "shampoo and oil combo", "hair care set"' },
      ],
      Thu: [
        { id: 1, text: 'WhatsApp Wave 1 broadcast — 10% off, time-limited', note: 'Send at 10am or 7pm for highest open rates' },
        { id: 2, text: 'Submit Hero #2 for Vine enrollment', note: 'Only if Hero #2 has FBA + Brand Registry' },
      ],
      Fri: [],
      Sat: [{ id: 1, text: 'FBT carousel check — is Hero #1 showing engineered pairings?', note: 'Check Hero #1 product page → scroll to "Frequently Bought Together"' }],
    },
  },
  {
    n: 8, title: 'SB VIDEO LAUNCH', desc: 'SB Video live, Hero #2 aggressive rank push',
    nonNeg: 'SB Video uploaded and LIVE by Wednesday',
    budgets: { conservative: 2500, base: 3500, aggressive: 5800 },
    ws: {
      Mon: [],
      Tue: [{ id: 1, text: 'Film 15-second SB Video: 2s brand logo + 10s product story + 3s end card', note: 'Format: MP4, 1920×1080, no text within 14px of edges' }],
      Wed: [
        { id: 1, text: 'Upload SB Video to Ad Console, launch SB Video campaign ₹400/wk', note: 'Approval takes 1–2 business days after upload' },
        { id: 2, text: "Hero #2 top 3 keywords bid raise +30%", note: "Targets: 'curry leaves hair oil', 'curry leaves oil for hair', 'coconut curry hair oil'" },
      ],
      Thu: [],
      Fri: [{ id: 1, text: 'Watch #2 promotion verdict — review 4-week CVR data', note: 'CVR ≥12% for 3 consecutive weeks → promote to Hero #4' }],
      Sat: [{ id: 1, text: 'If Watch #2 promoted → prepare listing rewrite + campaign plan for Week 9 Monday', note: 'Have everything ready so Week 9 starts with execution' }],
    },
  },
  {
    n: 9, title: 'PAGE-1 CONSOLIDATION', desc: 'Page-1 lock, Wave 2, portfolio prune',
    nonNeg: 'All campaigns with 12-week ACOS >70% paused today',
    budgets: { conservative: 2800, base: 4000, aggressive: 6200 },
    ws: {
      Mon: [],
      Tue: [{ id: 1, text: 'Full listing refresh on Watch #2 if promoted', note: 'Update title, bullets, images, backend terms for new status' }],
      Wed: [
        { id: 1, text: 'Pause ALL campaigns with 12-week ACOS >70% — NON-NEGOTIABLE', note: 'Pull campaign report filtered by date range Week 1–9' },
        { id: 2, text: 'Reallocate paused budget to campaigns with ACOS <40%', note: 'Budget goes to winners, not average performers' },
      ],
      Thu: [{ id: 1, text: 'WhatsApp Wave 2 broadcast — 10% off, different message (lead with results)', note: 'Show review quotes, units sold — different from Wave 1' }],
      Fri: [{ id: 1, text: 'Full portfolio CVR review — week-over-week trend analysis', note: 'Flag any hero with declining CVR for emergency listing audit' }],
      Sat: [],
    },
  },
  {
    n: 10, title: 'CATEGORY DOMINANCE', desc: 'Coupon #3, Hero #3 page-1, category lock',
    nonNeg: 'Hero #3 aggressive bid push launched',
    budgets: { conservative: 2800, base: 4000, aggressive: 6500 },
    ws: {
      Mon: [{ id: 1, text: 'Identify FBA Phase 3 candidates — 2+ units/week for 3 consecutive weeks', note: 'Phase 3 candidates get FBA stock in advance for scale-up' }],
      Tue: [{ id: 1, text: 'Refresh Hero #3 listing with customer review language', note: 'Copy exact phrases buyers use in reviews into bullets and title' }],
      Wed: [
        { id: 1, text: 'Launch Coupon #3 (7% off) on Hero #3', note: 'Combine with bid push for maximum page-1 impact' },
        { id: 2, text: "Hero #3 bid push +30% across all match types", note: "Target: 'coconut curry hair oil 100ml', 'small hair oil bottle'" },
      ],
      Thu: [{ id: 1, text: 'Draft WhatsApp Wave 3 broadcast (12% off) for Week 11', note: 'Write the message now, schedule for Week 11 Thursday' }],
      Fri: [{ id: 1, text: 'Identify any sleeper SKU showing surprise traction', note: 'Look for any Watch SKU with CVR >15% in last 2 weeks' }],
      Sat: [{ id: 1, text: 'Dispatch FBA Phase 3 shipment if any SKU qualifies', note: 'Only dispatch if 2+ units/week confirmed for 3 weeks' }],
    },
  },
  {
    n: 11, title: 'ORGANIC RATIO CHECK', desc: 'Organic vs paid ratio, Wave 3, listing refresh',
    nonNeg: 'WhatsApp Wave 3 broadcast sent (12% off) on Thursday',
    budgets: { conservative: 3000, base: 4500, aggressive: 6500 },
    ws: {
      Mon: [{ id: 1, text: 'Check organic vs paid revenue ratio — target: organic >50%', note: 'Business Reports: Sessions × CVR = organic units. Compare to SP attributed units.' }],
      Tue: [{ id: 1, text: 'Bullet refresh on ALL 3 hero listings', note: 'Incorporate best-performing review phrases, benefit-led language' }],
      Wed: [{ id: 1, text: 'Pause all keywords averaging ACOS >50% over last 4 weeks', note: 'Use 4-week date range in campaign reports' }],
      Thu: [{ id: 1, text: 'WhatsApp Wave 3 broadcast — 12% off, maximum reach — NON-NEGOTIABLE', note: 'Send at 10am, follow up at 7pm. Highest discount so far.' }],
      Fri: [{ id: 1, text: 'Pre-mortem: list 3 risks for Week 12 + planned responses', note: 'Think: stock-out, budget exhaustion, review removal, competitor surge' }],
      Sat: [],
    },
  },
  {
    n: 12, title: 'HARVEST', desc: '12-week audit, maintenance protocol, next launch brief',
    nonNeg: '12-week financial audit complete by Friday',
    budgets: { conservative: 3000, base: 4500, aggressive: 6500 },
    ws: {
      Mon: [{ id: 1, text: 'Plan Week 12 audit structure — assign who pulls which report', note: 'Audit: P&L, Ad ROI, Organic Growth, Review Count, BSR Delta' }],
      Tue: [{ id: 1, text: 'FBA inventory final check — zero stock-outs across all heroes', note: 'If any hero <14 days stock, create emergency shipment today' }],
      Wed: [{ id: 1, text: 'Hold ad portfolio — minor raises only on CVR ≥25% confirmed performers', note: 'No new campaigns, no experiments this week — stabilise' }],
      Thu: [{ id: 1, text: 'WhatsApp Wave 4 broadcast — 15% Founding Customer, first 100 only', note: 'Scarcity angle: "Founding Customer offer closes at midnight". Track redemptions.' }],
      Fri: [{ id: 1, text: '12-WEEK AUDIT — full P&L, FBA vs FBM, strategy review, final keyword rank', note: 'NON-NEGOTIABLE: audit document delivered by EOD Friday' }],
      Sat: [
        { id: 1, text: 'Write Maintenance Protocol — steady-state daily and weekly tasks going forward', note: "What does Week 13+ look like? Document the routine." },
        { id: 2, text: 'Write Next Launch Brief — which Watch SKU or new product launches next?', note: 'Include: ASIN, launch budget, target keywords, timeline' },
      ],
    },
  },
];

// ── Daily constants (shown every day, every week) ─────────────────────────────

const RECURRING_TASKS = [
  { id: 'r1', text: 'Morning Health Check (10 mins @ 10:00 AM)', note: 'Account health warnings, Buy Box 100%, ad spend pace' },
  { id: 'r2', text: 'Q&A and Review Replies (15 mins)', note: 'Answer every new Q&A, reply to 1–3 star reviews' },
  { id: 'r3', text: 'Stop-Loss Glance (5 mins)', note: 'Look at 5 stop-loss cards, act immediately on RED items' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function lsKey(plat, w, d, id) { return `mkt_${plat}_w${w}_d${d}_t${id}`; }
function lsNotes(plat, w, d)   { return `mkt_${plat}_w${w}_d${d}_notes`; }
function lsKpi(plat, w, d)     { return `mkt_${plat}_w${w}_d${d}_kpi`; }
function lsBudget(plat, w)     { return `mkt_${plat}_w${w}_budget`; }
function lsScorecard(plat, w)  { return `mkt_${plat}_w${w}_scorecard`; }

// ── Flipkart Plan Data ────────────────────────────────────────────────────────

const FLIPKART_RECURRING = [
  { id: 'fr1', text: 'Flipkart Seller Hub: check account health, quality score, policy violations', note: '' },
  { id: 'fr2', text: 'Monitor inventory — flag any SKU dropping below 15 units', note: '' },
  { id: 'fr3', text: 'Process pending returns and buyer queries within 24h SLA', note: '' },
];
const FLIPKART_BASE = {
  Mon: [
    { id: 'fb1', text: 'Pull last week analytics: Impressions, CTR, CVR, ROAS from Flipkart Ads Manager', note: '' },
    { id: 'fb2', text: 'Send agency weekly brief with platform targets for the week', note: '' },
    { id: 'fb3', text: 'Set ad budget path based on last week P&L', note: 'P&L < −₹2k → Starter | −₹2k to +₹3k → Growth | >+₹3k → Scale' },
    { id: 'fb4', text: 'Confirm all hero SKUs: live, in stock, F-Assured eligibility check', note: '' },
  ],
  Tue: [
    { id: 'fb1', text: 'Catalog quality audit: white-bg images (1000×1000), title length, spec completeness', note: 'Target quality score ≥80% for all hero SKUs' },
    { id: 'fb2', text: 'Fill all mandatory backend attributes: size, colour, material, brand', note: '' },
  ],
  Wed: [
    { id: 'fb1', text: 'PLA campaign review: pause keywords with 0 clicks after 1,000+ impressions', note: '' },
    { id: 'fb2', text: 'Bid adjustments: CVR ≥10% → raise +15% | ROAS <2× → reduce -10%', note: '' },
    { id: 'fb3', text: 'Smart ROI review — campaigns below 3× Smart ROI get budget cut', note: '' },
  ],
  Thu: [
    { id: 'fb1', text: 'Reply to all new 1–3 star ratings with public response', note: '' },
    { id: 'fb2', text: 'Process all return requests: approve valid, dispute invalid with evidence', note: '' },
    { id: 'fb3', text: 'Answer all new buyer Q&As within 24 hours', note: '' },
  ],
  Fri: [
    { id: 'fb1', text: 'Competitor tracking: 5 rivals — price, ratings, F-Assured status, images', note: '' },
    { id: 'fb2', text: 'Keyword rank check on Flipkart search for 6 priority keywords', note: '' },
    { id: 'fb3', text: 'Pull weekly KPI snapshot → enter in scorecard panel', note: '' },
  ],
  Sat: [
    { id: 'fb1', text: 'Pre-fill weekly scorecard: units, spend, revenue, P&L, return rate, rating', note: '' },
    { id: 'fb2', text: 'Spillover buffer — complete any remaining Mon–Fri tasks', note: '' },
    { id: 'fb3', text: 'Monday prep note: what must be ready before Monday begins', note: '' },
  ],
};
const FLIPKART_MUST = {
  Mon: ['Weekly brief sent to agency', 'Ad budget path decided and set', 'All hero SKUs confirmed live and in stock'],
  Tue: ['Catalog quality score ≥80% for all heroes', 'All mandatory product attributes filled'],
  Wed: ['PLA bid adjustments live in Ads Manager', 'Smart ROI reviewed for all active campaigns'],
  Thu: ['Zero unanswered Q&As on hero pages', 'All return requests processed within SLA'],
  Fri: ['Competitor sheet updated with this week\'s data', 'Weekly KPI snapshot saved'],
  Sat: ['Weekly scorecard pre-filled', 'Zero tasks carrying over to next week'],
};
const FLIPKART_SCORECARD = [
  { key: 'units',        label: 'Units Sold',              ph: '0' },
  { key: 'target',       label: 'Target Units',            ph: '0' },
  { key: 'bestSku',      label: 'Best Performing SKU',     ph: 'SKU name' },
  { key: 'worstSku',     label: 'Weakest SKU',             ph: 'SKU name' },
  { key: 'adSpend',      label: 'Total Ad Spend (₹)',      ph: '0' },
  { key: 'adRevenue',    label: 'Total Ad Revenue (₹)',    ph: '0' },
  { key: 'roas',         label: 'Overall ROAS (×)',        ph: '0.00' },
  { key: 'returnRate',   label: 'Return Rate (%)',         ph: '0.00' },
  { key: 'sellerRating', label: 'Seller Rating',           ph: '0.0 / 5.0' },
  { key: 'fAssured',     label: 'F-Assured Badge Status',  ph: 'Active / Pending / Not Eligible' },
  { key: 'netPnl',       label: 'Net P&L (₹)',            ph: '0' },
  { key: 'adPath',       label: 'Ad Path Next Week',       ph: 'Starter / Growth / Scale' },
  { key: 'wins',         label: 'Top 3 Wins',             ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'misses',       label: 'Top 3 Misses',           ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'decision',     label: 'Decision Needed From Founder', ph: '...', ml: true },
];
const FLIPKART_TRIGGERED = [
  { id: 1,  level: 'red',   text: 'Stock <10 units on any hero → Create replenishment order TODAY' },
  { id: 2,  level: 'amber', text: 'Stock <20 units → Schedule replenishment for next Tuesday' },
  { id: 3,  level: 'red',   text: 'ROAS <2× for 2+ weeks → PAUSE campaign, reallocate budget' },
  { id: 4,  level: 'amber', text: 'Return rate >15% → Review listing for misleading claims or sizing issues' },
  { id: 5,  level: 'red',   text: 'Account health warning → STOP all other work, respond within 24 hours' },
  { id: 6,  level: 'red',   text: 'Listing suppressed → Find reason same day, fix and resubmit' },
  { id: 7,  level: 'amber', text: 'New 1–3 star rating → Reply publicly within 24 hours' },
  { id: 8,  level: 'red',   text: 'Seller rating drops <3.5 → Emergency audit of all returns and responses' },
  { id: 9,  level: 'green', text: 'ROAS >5× → Scale budget +25% on that campaign immediately' },
  { id: 10, level: 'green', text: 'F-Assured badge earned → Raise PLA bids +20% on all hero SKUs' },
  { id: 11, level: 'amber', text: 'Competitor drops price >10% → Decide: match / undercut ₹5–10 / hold within 48h' },
];
const FLIPKART_WEEK_DATA = [
  { n:1,  title:'FOUNDATION',      desc:'Catalog audit, F-Assured eligibility check, first PLA launch',        nonNeg:'All mandatory product attributes filled by Tuesday',           budgets:{starter:1500,growth:2500,scale:4000}, ws:{ Mon:[{id:1,text:'Audit all SKUs: identify top 3 heroes by CVR and margin',note:'Use Seller Hub → Business Analytics → Product Performance'}], Tue:[{id:1,text:'Fix top quality issues: missing images, incomplete spec, wrong category',note:'Incomplete attributes = suppressed search visibility'},{id:2,text:'Image quality: white background, 1000×1000px minimum, no watermarks',note:''}], Wed:[{id:1,text:'Launch first PLA campaign on hero SKU — ₹1,000/wk Manual CPC',note:'Start at ₹5–8/click for broad reach'}], Thu:[{id:1,text:'Check F-Assured eligibility: seller rating ≥4.0, return rate <10%, SLA 100%',note:''}], Fri:[{id:1,text:'Build competitor tracker: 5 rivals — price, rating, F-Assured, images',note:''}], Sat:[{id:1,text:'Set up weekly KPI dashboard — bookmark Flipkart Analytics pages',note:''}] }},
  { n:2,  title:'ADS LAUNCH',      desc:'PLA fully live on all heroes, Smart ROI activated',                   nonNeg:'PLA campaigns live on all 3 hero SKUs',                        budgets:{starter:1500,growth:2500,scale:4500}, ws:{ Mon:[{id:1,text:'Review Week 1 PLA data: CTR, CVR, CPC — note top and bottom keywords',note:''}], Tue:[{id:1,text:'Launch PLA campaigns on Hero #2 and Hero #3',note:'Separate campaigns per SKU for cleaner optimization'}], Wed:[{id:1,text:'Enable Smart ROI bidding on Hero #1 if 7+ days of data exists',note:'Smart ROI target: 4× minimum'}], Thu:[{id:1,text:'Q&A seeding: 3 buyer-style questions per hero from different accounts',note:'Focus: size/fit, ingredients, delivery time'}], Fri:[], Sat:[{id:1,text:'First weekly scorecard — benchmark starting metrics',note:''}] }},
  { n:3,  title:'FIRST OPTIMIZE',  desc:'Pause losers, boost winners, CVR improvement focus',                  nonNeg:'All keywords with 0 conversions after 500+ clicks paused',     budgets:{starter:2000,growth:3000,scale:5000}, ws:{ Mon:[{id:1,text:'Pause all keywords with CTR <0.3% after 1,000 impressions',note:''}], Tue:[], Wed:[{id:1,text:'Raise bids +20% on any keyword with ROAS >4× consistently',note:''},{id:2,text:'Expand to phrase-match on top converting exact keywords',note:''}], Thu:[{id:1,text:'Return rate analysis: which SKUs have >10% returns? Investigate cause',note:''}], Fri:[], Sat:[] }},
  { n:4,  title:'CONTENT UPGRADE', desc:'Enhanced images, A+ listing content, description refresh',            nonNeg:'Hero #1 enhanced content submitted and pending approval',        budgets:{starter:2000,growth:3000,scale:5000}, ws:{ Mon:[], Tue:[{id:1,text:'Upgrade Hero #1: lifestyle images, 360° view, product video if possible',note:''},{id:2,text:'Rewrite product description: benefit-led, keyword-rich, 500+ words',note:''}], Wed:[], Thu:[{id:1,text:'Submit enhanced content on all 3 hero listings',note:''}], Fri:[], Sat:[] }},
  { n:5,  title:'RATING PUSH',     desc:'Review generation strategy, rating improvement',                      nonNeg:'All hero SKUs at 10+ reviews',                                 budgets:{starter:2000,growth:3500,scale:5500}, ws:{ Mon:[{id:1,text:'Check current rating and review count per hero — identify gaps',note:''}], Tue:[{id:1,text:'Set up post-delivery follow-up for review requests (WhatsApp/email)',note:''}], Wed:[], Thu:[{id:1,text:'Respond to every 1–3 star review with solution offer',note:''}], Fri:[], Sat:[] }},
  { n:6,  title:'RETURN AUDIT',    desc:'Deep return analysis, listing corrections to reduce rate <12%',       nonNeg:'Return rate under 12% on all hero SKUs',                       budgets:{starter:2000,growth:3500,scale:5500}, ws:{ Mon:[{id:1,text:'Pull return reason report — categorize top 3 return reasons',note:''}], Tue:[{id:1,text:'Fix listing misleading claims: size charts, material, colour accuracy',note:''},{id:2,text:'Add FAQ section addressing top return reasons in listing',note:''}], Wed:[], Thu:[], Fri:[], Sat:[] }},
  { n:7,  title:'SCALE WINNERS',   desc:'Double down on top performers, expand to new keywords',               nonNeg:'Top 3 performing keywords get +30% bid increase this week',     budgets:{starter:2500,growth:4000,scale:6000}, ws:{ Mon:[{id:1,text:'Identify top 3 converting keywords across all campaigns',note:''}], Wed:[{id:1,text:'Raise bids +30% on top keywords',note:''},{id:2,text:'Launch phrase-match campaign on high-volume category keywords',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:8,  title:'COMPETITION',     desc:'Competitor gap analysis, pricing strategy review',                    nonNeg:'Competitor analysis document completed by Friday',              budgets:{starter:2500,growth:4000,scale:6000}, ws:{ Mon:[{id:1,text:'Expand competitor tracker to 10 rivals — add search rank equivalents',note:''}], Fri:[{id:1,text:'Write competitor gap doc: price, content, ratings, F-Assured — where losing?',note:''},{id:2,text:'Decide: 3 changes to close the gap with top competitor',note:''}], Tue:[], Wed:[], Thu:[], Sat:[] }},
  { n:9,  title:'F-ASSURED PUSH',  desc:'Complete all F-Assured requirements, badge activation',               nonNeg:'F-Assured eligibility confirmed for at least 1 hero SKU',      budgets:{starter:2500,growth:4000,scale:6500}, ws:{ Mon:[{id:1,text:'F-Assured checklist: seller rating, return rate, SLA, policy compliance',note:''}], Tue:[{id:1,text:'Apply for F-Assured on Hero #1 if all criteria met',note:'F-Assured boosts CTR up to 25% in search results'}], Thu:[{id:1,text:'If not eligible: create action plan — which criteria to fix first?',note:''}], Wed:[], Fri:[], Sat:[] }},
  { n:10, title:'BRAND BUILD',     desc:'Flipkart Brand Store launch, brand campaign setup',                   nonNeg:'Brand store application submitted this week',                  budgets:{starter:3000,growth:4500,scale:7000}, ws:{ Mon:[{id:1,text:'Apply for Flipkart Brand Store access if not already done',note:''}], Tue:[{id:1,text:'Design brand store: hero banner, category pages, featured products',note:''}], Wed:[{id:1,text:'Launch brand awareness PLA targeting category browser keywords',note:''}], Thu:[], Fri:[], Sat:[] }},
  { n:11, title:'PEAK PREP',       desc:'Big Billion Days / sale event preparation, inventory pre-position',  nonNeg:'Inventory pre-positioned — minimum 60 days stock on all heroes', budgets:{starter:3500,growth:5000,scale:8000}, ws:{ Mon:[{id:1,text:'Forecast peak demand — 60-day inventory need per hero',note:''},{id:2,text:'Submit deals and offers for upcoming sale events',note:''}], Wed:[{id:1,text:'Pre-load ad budgets for sale week — 3× normal daily budget cap',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:12, title:'HARVEST',         desc:'12-week audit, maintenance protocol, next quarter plan',              nonNeg:'12-week P&L audit delivered by Friday',                        budgets:{starter:3500,growth:5000,scale:8000}, ws:{ Mon:[{id:1,text:'Plan audit structure: P&L, Ad ROI, Organic growth, Return rate delta',note:''}], Fri:[{id:1,text:'12-WEEK AUDIT — full P&L, ROAS, return rate, seller rating review',note:'NON-NEGOTIABLE: audit document delivered by EOD Friday'},{id:2,text:'Write maintenance protocol — steady-state weekly routine going forward',note:''}], Sat:[{id:1,text:'Write Next Quarter Brief — top 3 objectives, budget plan, key experiments',note:''}], Tue:[], Wed:[], Thu:[] }},
];

// ── Meesho Plan Data ──────────────────────────────────────────────────────────

const MEESHO_RECURRING = [
  { id: 'mr1', text: 'Meesho Supplier Hub: check account health, supplier score, policy alerts', note: '' },
  { id: 'mr2', text: 'Dispatch all pending orders within 24-hour SLA — non-negotiable', note: '' },
  { id: 'mr3', text: 'Review return requests and buyer disputes — process within 48 hours', note: '' },
];
const MEESHO_BASE = {
  Mon: [
    { id: 'mb1', text: 'Pull last week performance: catalog score, ROAS, return rate, supplier rating', note: '' },
    { id: 'mb2', text: 'Review top-selling products — flag any stock shortages', note: '' },
    { id: 'mb3', text: 'Set weekly ad budget based on last week ROAS', note: 'ROAS <2× → reduce 20% | 2–4× → maintain | >4× → scale +25%' },
  ],
  Tue: [
    { id: 'mb1', text: 'Catalog quality audit: images, description, size chart, weight, dimensions', note: 'Target: catalog quality score >80 for all active products' },
    { id: 'mb2', text: 'Update size charts for all fashion products — #1 driver of returns', note: '' },
  ],
  Wed: [
    { id: 'mb1', text: 'Meesho Ads review: pause products with ROAS <1.5× after ₹500+ spend', note: '' },
    { id: 'mb2', text: 'Bid adjustment: products with ROAS >4× → raise bid +15%', note: '' },
  ],
  Thu: [
    { id: 'mb1', text: 'Reply to all new buyer queries and complaints', note: '' },
    { id: 'mb2', text: 'Dispute wrong return requests with product condition photos', note: '' },
  ],
  Fri: [
    { id: 'mb1', text: 'Competitor catalog check: 5 rivals — price, listing quality, ad visibility', note: '' },
    { id: 'mb2', text: 'Pull weekly KPI snapshot and enter in scorecard', note: '' },
  ],
  Sat: [
    { id: 'mb1', text: 'Pre-fill weekly scorecard: orders, returns, ROAS, supplier score', note: '' },
    { id: 'mb2', text: 'Plan next week: which products to boost, which to pause', note: '' },
  ],
};
const MEESHO_MUST = {
  Mon: ['All orders dispatched on time', 'Ad budget reviewed and set for the week'],
  Tue: ['Catalog quality score >80 on all active products', 'Size charts accurate and complete'],
  Wed: ['Meesho Ads bids adjusted based on ROAS data', 'Poor-performing products paused or repriced'],
  Thu: ['Zero unanswered buyer queries', 'All pending returns processed'],
  Fri: ['Weekly KPI snapshot completed', 'Competitor price check done'],
  Sat: ['Scorecard pre-filled', 'Next week ad plan decided'],
};
const MEESHO_SCORECARD = [
  { key: 'orders',        label: 'Orders Placed',              ph: '0' },
  { key: 'dispatched',    label: 'Orders Dispatched on Time',  ph: '0' },
  { key: 'returns',       label: 'Returns Received',           ph: '0' },
  { key: 'returnRate',    label: 'Return Rate (%)',            ph: '0.00' },
  { key: 'adSpend',       label: 'Total Ad Spend (₹)',         ph: '0' },
  { key: 'adRevenue',     label: 'Total Ad Revenue (₹)',       ph: '0' },
  { key: 'roas',          label: 'Overall ROAS (×)',           ph: '0.00' },
  { key: 'catalogScore',  label: 'Catalog Quality Score',      ph: '0 / 100' },
  { key: 'supplierScore', label: 'Supplier Score',             ph: '0 / 10' },
  { key: 'netPnl',        label: 'Net P&L (₹)',               ph: '0' },
  { key: 'bestProduct',   label: 'Best Selling Product',       ph: 'Product name' },
  { key: 'wins',          label: 'Top 3 Wins',                ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'misses',        label: 'Top 3 Misses',              ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'decision',      label: 'Decision Needed From Founder', ph: '...', ml: true },
];
const MEESHO_TRIGGERED = [
  { id: 1, level: 'red',   text: 'Supplier score drops <5 → Emergency: resolve all open disputes and quality flags today' },
  { id: 2, level: 'red',   text: 'Return rate >20% → Pause ads, review listing accuracy and size charts immediately' },
  { id: 3, level: 'amber', text: 'Return rate 15–20% → Audit top return reasons, fix within 48 hours' },
  { id: 4, level: 'red',   text: 'Order dispatch SLA breach → Fix supply chain immediately — policy violation risk' },
  { id: 5, level: 'amber', text: 'Catalog quality score <60 → Priority fix: images, size chart, description' },
  { id: 6, level: 'red',   text: 'Account suspension warning → Stop all work, contact Meesho support immediately' },
  { id: 7, level: 'green', text: 'ROAS >4× on a product → Scale ad budget by +25% on that product this week' },
  { id: 8, level: 'green', text: 'Catalog score >90 → Apply for Meesho Boost program for additional visibility' },
  { id: 9, level: 'amber', text: 'New negative buyer review → Respond with resolution within 24 hours' },
];
const MEESHO_WEEK_DATA = [
  { n:1,  title:'CATALOG SETUP',   desc:'Product listing optimization, quality score baseline',             nonNeg:'Catalog quality score >70 for all active products',           budgets:{starter:1000,growth:2000,scale:3500}, ws:{ Mon:[{id:1,text:'Audit all listings: check quality score for each product',note:''}], Tue:[{id:1,text:'Fix top 3 quality issues: missing size chart, poor images, incomplete desc',note:''},{id:2,text:'Upload size charts for all fashion/apparel products',note:''}], Wed:[], Thu:[{id:1,text:'Set up dispatch process: packaging, shipping partner, label printing',note:''}], Fri:[], Sat:[] }},
  { n:2,  title:'FIRST ADS',       desc:'Meesho Ads launch, initial budget and bidding setup',             nonNeg:'Ads live on top 5 products by Wednesday',                     budgets:{starter:1000,growth:2000,scale:4000}, ws:{ Mon:[], Tue:[], Wed:[{id:1,text:'Launch Meesho Ads on top 5 products by sales volume',note:'Start ₹50–80/day per product, Smart Ads enabled'}], Thu:[], Fri:[], Sat:[{id:1,text:'Record all KPIs as Week 2 baseline for future comparison',note:''}] }},
  { n:3,  title:'CATALOG BOOST',   desc:'Improve catalog quality to >80 on all products',                 nonNeg:'Catalog quality >80 on all active listings',                  budgets:{starter:1500,growth:2500,scale:4500}, ws:{ Mon:[], Tue:[{id:1,text:'Image upgrade: white-background shots, minimum 4 images per product',note:''}], Wed:[], Thu:[], Fri:[], Sat:[] }},
  { n:4,  title:'RETURN MANAGE',   desc:'Understand and reduce return rate below 15%',                     nonNeg:'Return root cause analysis completed this week',               budgets:{starter:1500,growth:2500,scale:4500}, ws:{ Mon:[{id:1,text:'Pull return reason breakdown — top 5 return reasons by category',note:''}], Tue:[{id:1,text:'Fix top 2 return causes: update listing, size chart, or product description',note:''}], Wed:[], Thu:[], Fri:[], Sat:[] }},
  { n:5,  title:'RATING PUSH',     desc:'Improve supplier rating and product buyer ratings',               nonNeg:'Supplier rating ≥7 and improving week-on-week',               budgets:{starter:1500,growth:3000,scale:5000}, ws:{ Mon:[], Tue:[], Wed:[], Thu:[{id:1,text:'Send post-delivery follow-up messages requesting ratings for top products',note:''}], Fri:[], Sat:[] }},
  { n:6,  title:'AD OPTIMIZE',     desc:'Full ad campaign optimization, pause losers, scale winners',     nonNeg:'All products with ROAS <1× paused this week',                 budgets:{starter:2000,growth:3000,scale:5500}, ws:{ Mon:[{id:1,text:'Full ad audit: ROAS by product, pause anything <1× after ₹500 spend',note:''}], Wed:[{id:1,text:'Scale top 3 products by ROAS — raise daily budget +30%',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:7,  title:'SCALE UP',        desc:'Scale winning products, expand catalog with similar items',       nonNeg:'Top 5 products at 2× their Week 1 ad budget',                 budgets:{starter:2000,growth:3500,scale:6000}, ws:{ Mon:[{id:1,text:'Identify top 5 products by profit — plan expansion with similar items',note:''}], Wed:[{id:1,text:'Add 10–15 new product variations or complementary products',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:8,  title:'CATALOG EXPAND',  desc:'Add more products, test new categories',                         nonNeg:'10+ new products listed this week with full quality compliance', budgets:{starter:2500,growth:4000,scale:6500}, ws:{ Tue:[{id:1,text:'List 10+ new products with full catalog quality compliance from day one',note:''}], Thu:[{id:1,text:'Launch Meesho Ads on new products immediately after listing',note:''}], Mon:[], Wed:[], Fri:[], Sat:[] }},
  { n:9,  title:'MEESHO BOOST',    desc:'Apply for Meesho Boost program for additional visibility',       nonNeg:'Meesho Boost application submitted if eligible',               budgets:{starter:2500,growth:4000,scale:7000}, ws:{ Mon:[{id:1,text:'Check eligibility: supplier score >7, catalog score >80, return rate <10%',note:''}], Tue:[{id:1,text:'Apply for Meesho Boost if eligible — additional search visibility and badges',note:''}], Wed:[], Thu:[], Fri:[], Sat:[] }},
  { n:10, title:'PRICING',         desc:'Price competitiveness, margin analysis, discount strategy',      nonNeg:'Price competitive within 5% of top 3 rivals on all heroes',   budgets:{starter:2500,growth:4500,scale:7000}, ws:{ Mon:[{id:1,text:'Run competitor price analysis on all hero products',note:''}], Wed:[{id:1,text:'Adjust pricing on heroes where competitor has >20% price advantage',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:11, title:'SEASONAL PREP',   desc:'Festive season inventory, ad budget scaling, offer creation',   nonNeg:'Festive inventory pre-positioned — 60 days stock on top sellers', budgets:{starter:3000,growth:5000,scale:8000}, ws:{ Mon:[{id:1,text:'Calculate festive demand: 3–5× normal volume expected',note:''},{id:2,text:'Pre-position 60-day inventory for all top products',note:''}], Wed:[{id:1,text:'Create seasonal offers: bundle deals, combo packs, first-order discounts',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:12, title:'AUDIT & PLAN',    desc:'Full quarter review, maintenance protocol, next quarter plan',  nonNeg:'12-week audit document delivered by Friday',                   budgets:{starter:3000,growth:5000,scale:8000}, ws:{ Mon:[], Fri:[{id:1,text:'12-WEEK AUDIT: orders, returns, ROAS, supplier score, net P&L',note:''},{id:2,text:'Write maintenance protocol — steady-state weekly routine',note:''}], Sat:[{id:1,text:'Write Next Quarter Plan: top products, budget, new catalog additions',note:''}], Tue:[], Wed:[], Thu:[] }},
];

// ── Myntra Plan Data ──────────────────────────────────────────────────────────

const MYNTRA_RECURRING = [
  { id: 'myr1', text: 'Myntra Seller Portal (MSP): check account health, style quotient, policy alerts', note: '' },
  { id: 'myr2', text: 'Monitor inventory — flag any SKU dropping below 20 units', note: '' },
  { id: 'myr3', text: 'Process returns and customer queries — fashion returns are high, respond fast', note: '' },
];
const MYNTRA_BASE = {
  Mon: [
    { id: 'myb1', text: 'Pull last week MSP analytics: impressions, CTR, CVR, return rate, style quotient', note: '' },
    { id: 'myb2', text: 'Set ad budget based on last week performance', note: 'CVR <5% → reduce | 5–10% → maintain | >10% → scale +20%' },
    { id: 'myb3', text: 'Check trending styles in your category — align product push accordingly', note: '' },
  ],
  Tue: [
    { id: 'myb1', text: 'Style quotient audit: model shots, lifestyle images, white-bg product images, size chart accuracy', note: 'Style quotient <70 = suppressed visibility' },
    { id: 'myb2', text: 'Size chart validation: measure actual product, ensure chart is accurate to ±1cm', note: 'Size inaccuracy = #1 return driver in fashion' },
  ],
  Wed: [
    { id: 'myb1', text: 'Myntra Ads review: pause SKUs with CTR <0.5% after 2,000 impressions', note: '' },
    { id: 'myb2', text: 'Bid adjustments: CVR ≥10% → raise +15% | return rate >30% on SKU → pause ads', note: '' },
  ],
  Thu: [
    { id: 'myb1', text: 'Reply to all new 1–3 star ratings publicly within 24 hours', note: '' },
    { id: 'myb2', text: 'Process return requests — approve, dispute, or exchange as applicable', note: '' },
  ],
  Fri: [
    { id: 'myb1', text: 'Competitor analysis: 5 top brands — price, style quotient, images, ratings', note: '' },
    { id: 'myb2', text: 'Pull weekly KPI snapshot and enter in scorecard', note: '' },
  ],
  Sat: [
    { id: 'myb1', text: 'Pre-fill weekly scorecard: units, return rate, style quotient, ad metrics', note: '' },
    { id: 'myb2', text: 'Monday prep note: which styles to push next week', note: '' },
  ],
};
const MYNTRA_MUST = {
  Mon: ['Weekly ad budget set', 'Trending styles reviewed and plan aligned'],
  Tue: ['Style quotient ≥70 for all hero SKUs', 'Size charts validated and accurate'],
  Wed: ['Ad bids adjusted based on CVR data', 'High-return SKUs flagged and ad paused'],
  Thu: ['All new ratings replied to publicly', 'Pending return requests processed'],
  Fri: ['Weekly KPI snapshot completed', 'Competitor analysis done'],
  Sat: ['Scorecard pre-filled', 'Next week style push plan ready'],
};
const MYNTRA_SCORECARD = [
  { key: 'units',        label: 'Units Sold',              ph: '0' },
  { key: 'target',       label: 'Target Units',            ph: '0' },
  { key: 'bestStyle',    label: 'Best Performing Style',   ph: 'Style/SKU name' },
  { key: 'returnRate',   label: 'Return Rate (%)',         ph: '0.00' },
  { key: 'styleQuotient',label: 'Avg Style Quotient',      ph: '0 / 100' },
  { key: 'adSpend',      label: 'Total Ad Spend (₹)',      ph: '0' },
  { key: 'adRevenue',    label: 'Total Ad Revenue (₹)',    ph: '0' },
  { key: 'roas',         label: 'Overall ROAS (×)',        ph: '0.00' },
  { key: 'netPnl',       label: 'Net P&L (₹)',            ph: '0' },
  { key: 'brandStore',   label: 'Brand Store Status',      ph: 'Live / Pending / Not Applied' },
  { key: 'wins',         label: 'Top 3 Wins',             ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'misses',       label: 'Top 3 Misses',           ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'decision',     label: 'Decision Needed From Founder', ph: '...', ml: true },
];
const MYNTRA_TRIGGERED = [
  { id: 1, level: 'red',   text: 'Style quotient <60 on any hero → Emergency listing upgrade: images, size chart, description' },
  { id: 2, level: 'red',   text: 'Return rate >35% on a SKU → Pause ads immediately, investigate root cause' },
  { id: 3, level: 'amber', text: 'Return rate >25% → Review size chart accuracy and product claims' },
  { id: 4, level: 'red',   text: 'Account health warning → STOP all work, contact Myntra support within 24 hours' },
  { id: 5, level: 'amber', text: 'Rating drops <3.5 → Reply to all negative reviews publicly, consider exchange policy' },
  { id: 6, level: 'green', text: 'Style quotient >85 → Apply for Myntra editorial or curated collection feature' },
  { id: 7, level: 'green', text: 'CVR >12% on a style → Scale ad budget +25% on that style immediately' },
  { id: 8, level: 'amber', text: 'Competitor drops price >15% → Review pricing strategy within 48 hours' },
];
const MYNTRA_WEEK_DATA = [
  { n:1,  title:'BRAND SETUP',     desc:'Brand registration, catalog standards, first SKU launch',           nonNeg:'Style quotient ≥70 on all initial SKU listings',              budgets:{starter:2000,growth:3500,scale:5000}, ws:{ Mon:[{id:1,text:'Complete brand registration on Myntra Seller Portal',note:''}], Tue:[{id:1,text:'Upload first batch of SKUs: 4+ images per style, accurate size chart, model shots',note:''},{id:2,text:'Ensure style quotient ≥70 before going live',note:''}], Wed:[], Thu:[], Fri:[], Sat:[] }},
  { n:2,  title:'LISTING LAUNCH',  desc:'Style quotient optimization, Myntra Ads first launch',              nonNeg:'Myntra Ads live on top 5 styles by Wednesday',                budgets:{starter:2000,growth:3500,scale:5500}, ws:{ Mon:[], Tue:[], Wed:[{id:1,text:'Launch Myntra Ads on top 5 styles — Manual CPC, ₹8–12/click starting bid',note:''}], Thu:[{id:1,text:'Q&A: 3 style/fit questions seeded per hero style',note:''}], Fri:[], Sat:[] }},
  { n:3,  title:'SIZE & FIT',      desc:'Size chart accuracy deep audit, fit notes, return reason analysis', nonNeg:'Return rate under 25% — fix size inaccuracies first',          budgets:{starter:2500,growth:4000,scale:6000}, ws:{ Mon:[{id:1,text:'Pull return reason report — is "size issue" in top 3 reasons?',note:''}], Tue:[{id:1,text:'Physically measure products and re-do size charts with ±0.5cm accuracy',note:''},{id:2,text:'Add fit notes in description: "runs small/large, model is 5\'7\" wearing size M"',note:''}], Wed:[], Thu:[], Fri:[], Sat:[] }},
  { n:4,  title:'RETURN REDUCE',   desc:'Fashion returns deep dive — bring rate under 30%',                  nonNeg:'Identify and fix top 3 return causes this week',               budgets:{starter:2500,growth:4000,scale:6000}, ws:{ Mon:[{id:1,text:'Analyze return feedback: collect top 10 return comments per hero style',note:''}], Tue:[{id:1,text:'Update product description: add fabric care, stretch factor, exact dimensions',note:''}], Wed:[], Thu:[], Fri:[], Sat:[] }},
  { n:5,  title:'AD OPTIMIZE',     desc:'Myntra Ads CTR/CVR optimization, pause high-return styles\' ads',  nonNeg:'All styles with ROAS <2× and return rate >30% ads paused',     budgets:{starter:2500,growth:4000,scale:6500}, ws:{ Mon:[{id:1,text:'Full ad audit: CTR, CVR, return rate, ROAS per style — 4-week view',note:''}], Wed:[{id:1,text:'Scale top 3 styles by CVR — raise budget +30%',note:''},{id:2,text:'Pause ads on all styles with return rate >30%',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:6,  title:'TREND ALIGN',     desc:'Align product push with current fashion trends on Myntra',         nonNeg:'Top 5 trending styles in your category actively promoted',      budgets:{starter:3000,growth:4500,scale:7000}, ws:{ Mon:[{id:1,text:'Research top 5 trending styles in your category this week on Myntra',note:''}], Wed:[{id:1,text:'Boost ad budget on styles matching current trends by +50%',note:''},{id:2,text:'Add trend-relevant keywords in product description',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:7,  title:'RATING PUSH',     desc:'Improve product ratings and buyer satisfaction',                    nonNeg:'All hero styles at average rating ≥4.0',                      budgets:{starter:3000,growth:4500,scale:7000}, ws:{ Mon:[], Thu:[{id:1,text:'Post-purchase follow-up: request ratings for all recently delivered orders',note:''}], Fri:[{id:1,text:'Reply to every rating below 4 stars publicly with resolution',note:''}], Tue:[], Wed:[], Sat:[] }},
  { n:8,  title:'SCALE',           desc:'Scale winning styles, expand catalog with new designs',             nonNeg:'Top 3 styles at 2× Week 1 ad budget with ROAS >3×',            budgets:{starter:3000,growth:5000,scale:8000}, ws:{ Mon:[{id:1,text:'Identify top 3 styles by CVR and margin — plan color/size expansion',note:''}], Tue:[{id:1,text:'List new design variants of top-performing styles',note:''}], Wed:[{id:1,text:'Launch ads on new variants immediately — use top style\'s bids as starting point',note:''}], Thu:[], Fri:[], Sat:[] }},
  { n:9,  title:'BRAND STORE',     desc:'Complete Myntra brand store setup, editorial content',              nonNeg:'Brand store live and published this week',                    budgets:{starter:3500,growth:5000,scale:8000}, ws:{ Mon:[{id:1,text:'Apply for Myntra Brand Store if not done yet',note:'Needs Brand Registry approval + 10+ live styles'}], Tue:[{id:1,text:'Design brand store: hero banner, curated lookbooks, featured styles',note:''}], Thu:[{id:1,text:'Submit brand store for approval',note:''}], Wed:[], Fri:[], Sat:[] }},
  { n:10, title:'CONTENT UPGRADE', desc:'Editorial quality images, lookbooks, lifestyle photography',        nonNeg:'Hero styles updated with lifestyle + editorial photography',    budgets:{starter:3500,growth:5000,scale:8000}, ws:{ Tue:[{id:1,text:'Shoot lifestyle images: model on location, natural light, aspirational styling',note:''}], Thu:[{id:1,text:'Update all hero styles with new editorial images — replace studio shots',note:''}], Mon:[], Wed:[], Fri:[], Sat:[] }},
  { n:11, title:'FESTIVE PREP',    desc:'Festive/wedding season inventory, offers, ad budget scaling',      nonNeg:'Festive inventory pre-positioned — 60 days stock on top styles', budgets:{starter:4000,growth:6000,scale:9000}, ws:{ Mon:[{id:1,text:'Forecast festive demand: 5–8× normal volume during festive window',note:''},{id:2,text:'Pre-position 60-day inventory for all hero styles',note:''}], Wed:[{id:1,text:'Create festive offers: bundle deals, gift-ready packaging, limited editions',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:12, title:'HARVEST',         desc:'12-week audit, maintenance protocol, next season plan',             nonNeg:'12-week audit document delivered by Friday',                   budgets:{starter:4000,growth:6000,scale:9000}, ws:{ Mon:[], Fri:[{id:1,text:'12-WEEK AUDIT: units, return rate, style quotient trend, ROAS, net P&L',note:'NON-NEGOTIABLE: audit delivered by EOD Friday'},{id:2,text:'Write maintenance protocol — steady-state weekly routine',note:''}], Sat:[{id:1,text:'Write Next Season Plan: top styles, new designs, budget, catalog targets',note:''}], Tue:[], Wed:[], Thu:[] }},
];

// ── JioMart Plan Data ─────────────────────────────────────────────────────────

const JIOMART_RECURRING = [
  { id: 'jr1', text: 'JioMart Seller Hub: check order queue, delivery SLA alerts, account health', note: '' },
  { id: 'jr2', text: 'Dispatch all orders same-day (JioMart SLA requirement — critical)', note: '' },
  { id: 'jr3', text: 'Monitor store rating and respond to customer feedback within 24 hours', note: '' },
];
const JIOMART_BASE = {
  Mon: [
    { id: 'jb1', text: 'Pull last week analytics: orders, on-time delivery %, store rating, return rate', note: '' },
    { id: 'jb2', text: 'Review top-selling products — flag stock shortages before they become issues', note: '' },
    { id: 'jb3', text: 'Check JioMart promotional calendar — any upcoming sale events to participate in?', note: '' },
  ],
  Tue: [
    { id: 'jb1', text: 'Product listing quality audit: images, description, weight, price accuracy', note: '' },
    { id: 'jb2', text: 'Update pricing to stay within 5% of JioMart recommended price (if applicable)', note: '' },
  ],
  Wed: [
    { id: 'jb1', text: 'Review JioMart promotions dashboard — opt into relevant deals and offers', note: '' },
    { id: 'jb2', text: 'Catalog expansion check — are there new subcategories to list products in?', note: '' },
  ],
  Thu: [
    { id: 'jb1', text: 'Customer feedback review: respond to all new queries and complaints', note: '' },
    { id: 'jb2', text: 'Process all return and refund requests within SLA', note: '' },
  ],
  Fri: [
    { id: 'jb1', text: 'Competitor price check on JioMart for top 5 products', note: '' },
    { id: 'jb2', text: 'Pull weekly KPI snapshot — orders, SLA %, store rating, return rate', note: '' },
  ],
  Sat: [
    { id: 'jb1', text: 'Pre-fill weekly scorecard', note: '' },
    { id: 'jb2', text: 'Inventory pre-check for next week — ensure adequate stock for 7 days', note: '' },
  ],
};
const JIOMART_MUST = {
  Mon: ['All pending orders dispatched', 'Promotional calendar checked for the week'],
  Tue: ['All product listings have accurate weight/price/images', 'Pricing within JioMart guidelines'],
  Wed: ['Promotional deals opted into for the week', 'Catalog fully updated'],
  Thu: ['Zero unanswered customer queries', 'All return requests processed'],
  Fri: ['Weekly KPI snapshot completed', 'Competitor price parity checked'],
  Sat: ['Scorecard pre-filled', 'Next week inventory confirmed'],
};
const JIOMART_SCORECARD = [
  { key: 'orders',       label: 'Orders Received',            ph: '0' },
  { key: 'dispatched',   label: 'Orders Dispatched On-Time',  ph: '0' },
  { key: 'sla',          label: 'Delivery SLA (%)',           ph: '0.00' },
  { key: 'storeRating',  label: 'Store Rating',               ph: '0.0 / 5.0' },
  { key: 'returnRate',   label: 'Return Rate (%)',            ph: '0.00' },
  { key: 'revenue',      label: 'Total Revenue (₹)',          ph: '0' },
  { key: 'netPnl',       label: 'Net P&L (₹)',               ph: '0' },
  { key: 'bestProduct',  label: 'Best Selling Product',       ph: 'Product name' },
  { key: 'promoRevenue', label: 'Revenue from Promotions (₹)', ph: '0' },
  { key: 'wins',         label: 'Top 3 Wins',                ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'misses',       label: 'Top 3 Misses',              ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'decision',     label: 'Decision Needed From Founder', ph: '...', ml: true },
];
const JIOMART_TRIGGERED = [
  { id: 1, level: 'red',   text: 'SLA breach (on-time delivery <90%) → Emergency: fix dispatch process today' },
  { id: 2, level: 'red',   text: 'Store rating drops <3.5 → Stop ads, fix root cause (delivery, quality, or packaging)' },
  { id: 3, level: 'amber', text: 'Return rate >10% → Audit packaging quality and product description accuracy' },
  { id: 4, level: 'red',   text: 'Account suspension warning → Stop all work, respond to JioMart support immediately' },
  { id: 5, level: 'amber', text: 'Stock below 3 days → Emergency restock — JioMart penalises stock-outs heavily' },
  { id: 6, level: 'green', text: 'SLA >99% for 4+ weeks → Apply for JioMart Priority Seller badge' },
  { id: 7, level: 'green', text: 'Store rating ≥4.5 → Eligible for JioMart featured slot — apply this week' },
  { id: 8, level: 'amber', text: 'New negative review → Respond with resolution and partial refund offer within 12 hours' },
];
const JIOMART_WEEK_DATA = [
  { n:1,  title:'SELLER SETUP',    desc:'Complete seller profile, catalog setup, SLA process definition',    nonNeg:'All products live with correct weight, price, and images',    budgets:{starter:500,growth:1000,scale:2000},  ws:{ Mon:[{id:1,text:'Complete seller profile: GSTIN, bank details, pickup address',note:''}], Tue:[{id:1,text:'List first batch of products: accurate weight, dimensions, MRP, selling price',note:''},{id:2,text:'Set up packaging: sturdy box/bag, branded if possible, fragile labels',note:''}], Wed:[], Thu:[{id:1,text:'Define dispatch process: who packs, who hands to delivery partner, cutoff time',note:''}], Fri:[], Sat:[] }},
  { n:2,  title:'SLA MASTER',      desc:'Perfect delivery SLA — 100% on-time dispatch every single order',   nonNeg:'100% on-time dispatch this week — zero SLA breaches',          budgets:{starter:500,growth:1000,scale:2000},  ws:{ Mon:[{id:1,text:'Audit Week 1 dispatch times — any orders dispatched late?',note:''}], Tue:[{id:1,text:'If any SLA breach: identify cause and fix process (cutoff time, packaging speed)',note:''}], Wed:[], Thu:[], Fri:[], Sat:[] }},
  { n:3,  title:'CATALOG EXPAND',  desc:'Add more products, optimize pricing, fill category gaps',           nonNeg:'20+ products live with complete listing quality',              budgets:{starter:800,growth:1500,scale:2500},  ws:{ Tue:[{id:1,text:'Add 10+ new products in top categories: groceries, household, personal care',note:''}], Thu:[{id:1,text:'Price check all products vs physical retail and other online channels',note:''}], Mon:[], Wed:[], Fri:[], Sat:[] }},
  { n:4,  title:'RATING PUSH',     desc:'Improve store rating — target ≥4.2 by end of this week',            nonNeg:'Store rating ≥4.0 this week',                                 budgets:{starter:800,growth:1500,scale:2500},  ws:{ Mon:[{id:1,text:'Analyze all <4-star reviews: what is the top complaint?',note:''}], Thu:[{id:1,text:'Reply to every low rating with solution + discount on next order',note:''}], Fri:[{id:1,text:'Improve packaging for top complaint items (damaged in transit, poor quality)',note:''}], Tue:[], Wed:[], Sat:[] }},
  { n:5,  title:'PROMOTIONS',      desc:'JioMart promotional deal participation, flash sale setup',          nonNeg:'At least 3 products in active JioMart promotional deals',      budgets:{starter:1000,growth:2000,scale:3500}, ws:{ Mon:[{id:1,text:'Check JioMart Deals Dashboard — opt in to relevant weekly deals',note:''}], Wed:[{id:1,text:'Set up flash sale on top 3 products for weekend — apply via seller hub',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:6,  title:'QUALITY AUDIT',   desc:'Packaging quality, product quality, listing accuracy deep check',  nonNeg:'Return rate under 8% across all products',                    budgets:{starter:1000,growth:2000,scale:3500}, ws:{ Mon:[{id:1,text:'Audit return reasons: packaging damage, quality mismatch, wrong item',note:''}], Tue:[{id:1,text:'Fix top 2 return causes: better packaging, accurate listing images',note:''}], Wed:[], Thu:[], Fri:[], Sat:[] }},
  { n:7,  title:'LOCAL STRATEGY',  desc:'Hyperlocal focus — which nearby pincodes to target for faster SLA', nonNeg:'SLA >98% sustained — eligible for hyperlocal priority badge',  budgets:{starter:1000,growth:2000,scale:4000}, ws:{ Mon:[{id:1,text:'Analyze orders by pincode — identify top 10 delivery locations',note:''}], Wed:[{id:1,text:'Negotiate with local delivery partner for same-day in top pincodes',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:8,  title:'SCALE UP',        desc:'Scale top products, add bulk-buy packs, combos',                   nonNeg:'Top 5 products have bundle/pack variants live',               budgets:{starter:1200,growth:2500,scale:4500}, ws:{ Tue:[{id:1,text:'Create value packs for top 5 products: 2-pack, 3-pack at discounted bundle price',note:''}], Thu:[{id:1,text:'List bundle packs as separate products on JioMart',note:''}], Mon:[], Wed:[], Fri:[], Sat:[] }},
  { n:9,  title:'PROMO POWER',     desc:'Participate in all major JioMart promotional events',               nonNeg:'All eligible products enrolled in JioMart sale events',        budgets:{starter:1200,growth:2500,scale:5000}, ws:{ Mon:[{id:1,text:'Check upcoming JioMart sale events for next 30 days — plan participation',note:''}], Wed:[{id:1,text:'Submit products for JioMart Flash Deals and Weekend Specials',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:10, title:'CONTENT UPGRADE', desc:'Better product images, videos, and descriptions',                   nonNeg:'All hero products have 5+ images including lifestyle shots',  budgets:{starter:1500,growth:3000,scale:5000}, ws:{ Tue:[{id:1,text:'Photograph top 10 products: product-in-use shots, white-bg, pack shots',note:''}], Thu:[{id:1,text:'Update listings with new images — remove any blurry or dark images',note:''}], Mon:[], Wed:[], Fri:[], Sat:[] }},
  { n:11, title:'FESTIVE PREP',    desc:'Festival season inventory, offers, and delivery readiness',         nonNeg:'60-day stock pre-positioned for all top products',             budgets:{starter:2000,growth:3500,scale:6000}, ws:{ Mon:[{id:1,text:'Calculate festive demand: 4–6× normal volume expected',note:''},{id:2,text:'Pre-stock 60 days inventory of top 20 products',note:''}], Wed:[{id:1,text:'Submit festival deals: discounts, free gifts, bundle offers',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:12, title:'HARVEST',         desc:'12-week audit, maintenance protocol, next quarter growth plan',     nonNeg:'12-week audit document delivered by Friday',                   budgets:{starter:2000,growth:3500,scale:6000}, ws:{ Mon:[], Fri:[{id:1,text:'12-WEEK AUDIT: orders, SLA %, store rating, return rate, net P&L',note:'NON-NEGOTIABLE: delivered by EOD Friday'},{id:2,text:'Write maintenance protocol — steady-state weekly routine',note:''}], Sat:[{id:1,text:'Write Next Quarter Plan: top categories, budget, new product additions',note:''}], Tue:[], Wed:[], Thu:[] }},
];

// ── Snapdeal Plan Data ────────────────────────────────────────────────────────

const SNAPDEAL_RECURRING = [
  { id: 'sr1', text: 'Snapdeal Seller Hub: check account health, buyer rating, policy flags', note: '' },
  { id: 'sr2', text: 'Dispatch all orders within 24-hour SLA — critical for seller score', note: '' },
  { id: 'sr3', text: 'Monitor returns and buyer disputes — resolve within 48 hours', note: '' },
];
const SNAPDEAL_BASE = {
  Mon: [
    { id: 'sb1', text: 'Pull last week performance: catalog index, CPC ROAS, buyer rating, return rate', note: '' },
    { id: 'sb2', text: 'Set weekly ad budget based on CPC performance', note: 'ROAS <2× → reduce 20% | 2–4× → maintain | >4× → scale +20%' },
    { id: 'sb3', text: 'Check Snapdeal seller score — flag any drops for investigation', note: '' },
  ],
  Tue: [
    { id: 'sb1', text: 'Catalog Quality Index audit: images, title, description, specifications, keywords', note: 'Target CQI >75% for all active products' },
    { id: 'sb2', text: 'Keyword optimization: add high-search-volume keywords to title and description', note: '' },
  ],
  Wed: [
    { id: 'sb1', text: 'Snapdeal Ads (CPC) review: pause keywords with 0 conversions after 1,000 clicks', note: '' },
    { id: 'sb2', text: 'Bid adjustments: CVR ≥8% → raise +15% | CPC >₹15 with <5% CVR → reduce -20%', note: '' },
  ],
  Thu: [
    { id: 'sb1', text: 'Reply to all new buyer queries within 24 hours', note: '' },
    { id: 'sb2', text: 'Process all return requests — approve valid, dispute invalid with evidence', note: '' },
  ],
  Fri: [
    { id: 'sb1', text: 'Competitor price check on Snapdeal for top 10 products', note: '' },
    { id: 'sb2', text: 'Pull weekly KPI snapshot and enter in scorecard', note: '' },
  ],
  Sat: [
    { id: 'sb1', text: 'Pre-fill weekly scorecard: units, buyer rating, CQI, CPC metrics, net P&L', note: '' },
    { id: 'sb2', text: 'Next week plan: which products to boost, which keywords to expand', note: '' },
  ],
};
const SNAPDEAL_MUST = {
  Mon: ['All orders dispatched on time', 'Ad budget set for the week', 'Seller score checked'],
  Tue: ['CQI >75% on all active products', 'Keywords updated and accurate'],
  Wed: ['CPC bids adjusted based on performance data', 'Low-performing keywords paused'],
  Thu: ['Zero unanswered buyer queries', 'All return requests processed'],
  Fri: ['Competitor price parity checked', 'Weekly KPI snapshot completed'],
  Sat: ['Scorecard pre-filled', 'Next week priorities identified'],
};
const SNAPDEAL_SCORECARD = [
  { key: 'units',       label: 'Units Sold',                 ph: '0' },
  { key: 'target',      label: 'Target Units',               ph: '0' },
  { key: 'buyerRating', label: 'Buyer Rating',               ph: '0.0 / 5.0' },
  { key: 'cqi',         label: 'Catalog Quality Index (%)',  ph: '0.00' },
  { key: 'returnRate',  label: 'Return Rate (%)',            ph: '0.00' },
  { key: 'adSpend',     label: 'Total Ad Spend (₹)',         ph: '0' },
  { key: 'adRevenue',   label: 'Total Ad Revenue (₹)',       ph: '0' },
  { key: 'roas',        label: 'Overall ROAS (×)',           ph: '0.00' },
  { key: 'netPnl',      label: 'Net P&L (₹)',               ph: '0' },
  { key: 'bestProduct', label: 'Best Performing Product',    ph: 'Product name' },
  { key: 'wins',        label: 'Top 3 Wins',                ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'misses',      label: 'Top 3 Misses',              ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'decision',    label: 'Decision Needed From Founder', ph: '...', ml: true },
];
const SNAPDEAL_TRIGGERED = [
  { id: 1, level: 'red',   text: 'Buyer rating drops <3.0 → Emergency: audit all returns, queries, and dispatch SLA' },
  { id: 2, level: 'amber', text: 'Buyer rating <4.0 → Review top negative feedback and fix root causes' },
  { id: 3, level: 'red',   text: 'ROAS <1.5× for 2+ weeks → PAUSE all CPC ads, fix listings first' },
  { id: 4, level: 'amber', text: 'Return rate >12% → Review listing accuracy: images, description, sizing' },
  { id: 5, level: 'red',   text: 'Account health warning → Stop all work, respond to Snapdeal support within 24 hours' },
  { id: 6, level: 'red',   text: 'CQI <50% → Emergency listing quality fix — risk of delist' },
  { id: 7, level: 'green', text: 'ROAS >4× → Scale CPC budget +25% on winning keywords this week' },
  { id: 8, level: 'green', text: 'CQI >85% + Buyer Rating >4.5 → Apply for Snapdeal Premium Seller badge' },
  { id: 9, level: 'amber', text: 'Competitor drops price >10% → Match or undercut by ₹5 within 48 hours' },
];
const SNAPDEAL_WEEK_DATA = [
  { n:1,  title:'FOUNDATION',      desc:'Catalog setup, CQI optimization, account quality baseline',         nonNeg:'CQI >70% on all active products by Thursday',                 budgets:{starter:1000,growth:2000,scale:3500}, ws:{ Mon:[{id:1,text:'Audit all listings: check CQI score per product',note:'Use Seller Hub → Catalog Quality → Product Report'}], Tue:[{id:1,text:'Fix top CQI issues: missing specs, poor images, incomplete description',note:''},{id:2,text:'Add 5+ high-search keywords in title and description for each hero product',note:''}], Wed:[], Thu:[{id:1,text:'Confirm buyer rating above 4.0 — reply to any unanswered queries from past 30 days',note:''}], Fri:[], Sat:[] }},
  { n:2,  title:'ADS LAUNCH',      desc:'Snapdeal CPC campaign launch, keyword bidding strategy',            nonNeg:'CPC ads live on top 5 products by Wednesday',                 budgets:{starter:1000,growth:2000,scale:4000}, ws:{ Mon:[], Tue:[], Wed:[{id:1,text:'Launch Snapdeal CPC campaigns on top 5 products',note:'Start at ₹8–12/click, Broad match, daily budget ₹100/product'}], Thu:[{id:1,text:'Q&A seeding: 2 buyer-style questions per hero product',note:''}], Fri:[], Sat:[{id:1,text:'Record baseline metrics for Week 2 comparison',note:''}] }},
  { n:3,  title:'CPC OPTIMIZE',    desc:'First CPC optimization — pause losers, expand winners',             nonNeg:'All keywords with 0 sales after 500 clicks paused',            budgets:{starter:1500,growth:2500,scale:4500}, ws:{ Mon:[{id:1,text:'Review Week 2 CPC data: CPC, CTR, CVR, ROAS by keyword',note:''}], Wed:[{id:1,text:'Pause keywords with 0 conversions after 500+ clicks',note:''},{id:2,text:'Raise bids +20% on keywords with CVR >8%',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:4,  title:'BUYER RATING',    desc:'Buyer rating improvement — target ≥4.2 by end of week',             nonNeg:'Buyer rating ≥4.0 this week',                                 budgets:{starter:1500,growth:2500,scale:4500}, ws:{ Mon:[{id:1,text:'Analyze all negative reviews — identify top 3 complaint themes',note:''}], Thu:[{id:1,text:'Reply to all <4-star buyer reviews publicly with solution',note:''},{id:2,text:'Improve packaging for products with damage-related complaints',note:''}], Tue:[], Wed:[], Fri:[], Sat:[] }},
  { n:5,  title:'CATALOG BOOST',   desc:'Improve CQI to >80%, rich content, better images',                 nonNeg:'CQI >80% across all active products',                         budgets:{starter:2000,growth:3000,scale:5000}, ws:{ Tue:[{id:1,text:'Image upgrade: minimum 4 images per product, white bg, 1000×1000px',note:''},{id:2,text:'Add product videos for top 3 products if possible',note:''}], Thu:[{id:1,text:'Rewrite descriptions: benefit-led, keyword-rich, 300+ words',note:''}], Mon:[], Wed:[], Fri:[], Sat:[] }},
  { n:6,  title:'RETURN MANAGE',   desc:'Return rate analysis, listing accuracy fixes',                      nonNeg:'Return rate under 10% on all hero products',                  budgets:{starter:2000,growth:3000,scale:5000}, ws:{ Mon:[{id:1,text:'Pull return reason report — top 5 return reasons by product',note:''}], Tue:[{id:1,text:'Fix top 2 return causes: listing inaccuracy, size issue, or quality claim',note:''}], Wed:[], Thu:[], Fri:[], Sat:[] }},
  { n:7,  title:'SCALE WINNERS',   desc:'Scale top converting products and keywords',                        nonNeg:'Top 3 keywords at +30% bid vs Week 1',                        budgets:{starter:2000,growth:3500,scale:6000}, ws:{ Mon:[{id:1,text:'Identify top 3 products by ROAS and CVR for scaling',note:''}], Wed:[{id:1,text:'Raise CPC bids +30% on top converting keywords',note:''},{id:2,text:'Expand to phrase match on high-volume exact-match winners',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:8,  title:'COMPETITION',     desc:'Competitor analysis, pricing adjustment, gap identification',       nonNeg:'Competitive price analysis completed and adjustments made',    budgets:{starter:2500,growth:4000,scale:6000}, ws:{ Mon:[{id:1,text:'Expand competitor tracker to 10 rivals: price, rating, CQI equivalent, keywords',note:''}], Fri:[{id:1,text:'Write competitor gap analysis: where are you losing on price, content, rating?',note:''},{id:2,text:'Make 3 pricing adjustments based on competitive gaps',note:''}], Tue:[], Wed:[], Thu:[], Sat:[] }},
  { n:9,  title:'PREMIUM PUSH',    desc:'Apply for Snapdeal Premium Seller, unlock higher visibility',       nonNeg:'Premium Seller application submitted if eligible',            budgets:{starter:2500,growth:4000,scale:6500}, ws:{ Mon:[{id:1,text:'Check Premium Seller eligibility: buyer rating, CQI, order volume, SLA',note:''}], Tue:[{id:1,text:'Apply for Snapdeal Premium Seller badge if all criteria met',note:'Premium badge = priority placement in search results'}], Thu:[{id:1,text:'If not eligible: action plan to meet criteria within 4 weeks',note:''}], Wed:[], Fri:[], Sat:[] }},
  { n:10, title:'DEAL POWER',      desc:'Snapdeal deal participation, flash sales, promotional events',      nonNeg:'3+ products in active Snapdeal promotional deals',            budgets:{starter:2500,growth:4500,scale:7000}, ws:{ Mon:[{id:1,text:'Check Snapdeal Deal Dashboard — opt into relevant flash deals',note:''}], Wed:[{id:1,text:'Submit products for Snapdeal Weekend Super Sale',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:11, title:'PEAK PREP',       desc:'Sale season preparation, inventory, budget scaling',               nonNeg:'Inventory pre-positioned — 60 days stock on all top products', budgets:{starter:3000,growth:5000,scale:8000}, ws:{ Mon:[{id:1,text:'Forecast peak demand: 4–6× normal volume expected during sale window',note:''},{id:2,text:'Pre-stock 60 days inventory for all top 10 products',note:''}], Wed:[{id:1,text:'Pre-load CPC budgets for sale week: 3× normal daily caps',note:''}], Tue:[], Thu:[], Fri:[], Sat:[] }},
  { n:12, title:'HARVEST',         desc:'12-week audit, maintenance protocol, next quarter plan',            nonNeg:'12-week audit document delivered by Friday',                   budgets:{starter:3000,growth:5000,scale:8000}, ws:{ Mon:[], Fri:[{id:1,text:'12-WEEK AUDIT: units, buyer rating, CQI, ROAS, return rate, net P&L',note:'NON-NEGOTIABLE: delivered by EOD Friday'},{id:2,text:'Write maintenance protocol — steady-state weekly routine',note:''}], Sat:[{id:1,text:'Write Next Quarter Plan: top products, budget, CPC keywords, catalog targets',note:''}], Tue:[], Wed:[], Thu:[] }},
];

// ── Platform Plan Config ──────────────────────────────────────────────────────

const PLATFORM_PLAN_CONFIG = {
  Amazon: {
    color: '#FF9900',
    budgetLabels: ['conservative', 'base', 'aggressive'],
    emptyKpi: { units: '', sessions: '', ctr: '', cvr: '', acos: '', adSpend: '', adRevenue: '', reviews: '', fbaStock: '', cumPnl: '' },
    getKpiFields: (week, budget) => [
      { key: 'units',     label: 'Units Sold',      hint: 'Target varies by week',             placeholder: '0' },
      { key: 'sessions',  label: 'Sessions',         hint: 'Total visits today',                placeholder: '0' },
      { key: 'ctr',       label: 'CTR Hero #1 (%)',  hint: 'SAFE ≥1.25%',                      placeholder: '0.00' },
      { key: 'cvr',       label: 'CVR Overall (%)',  hint: 'SAFE ≥10%',                        placeholder: '0.00' },
      { key: 'acos',      label: 'ACOS Worst (%)',   hint: 'DANGER >70%',                      placeholder: '0.00' },
      { key: 'adSpend',   label: 'Ad Spend ₹',      hint: `Budget: ₹${week?.budgets?.[budget]?.toLocaleString?.() || '—'}`, placeholder: '0' },
      { key: 'adRevenue', label: 'Ad Revenue ₹',    hint: 'From Sponsored Products',           placeholder: '0' },
      { key: 'reviews',   label: 'Reviews Posted',   hint: 'This week total',                  placeholder: '0' },
      { key: 'fbaStock',  label: 'FBA Stock Days',   hint: 'DANGER <7 days',                   placeholder: '0' },
      { key: 'cumPnl',    label: 'Cum. Net P&L ₹',  hint: 'DANGER < −₹15,000',               placeholder: '0' },
    ],
    scorecardFields: SCORECARD_FIELDS,
    baseTasks: BASE_TASKS,
    mustComplete: MUST_COMPLETE,
    recurringTasks: RECURRING_TASKS,
    weekData: WEEK_DATA,
    triggeredConditions: TRIGGERED_CONDITIONS,
    heroes: HEROES_DATA,
    evalAlerts: evalStopLoss,
    evalGood: evalTriggers,
    inputColor: (key, kpi) => {
      if (key === 'acos'    && parseFloat(kpi[key]) > 70)               return 'border-red-300 bg-red-50';
      if (key === 'acos'    && parseFloat(kpi[key]) >= 40)              return 'border-amber-300 bg-amber-50';
      if (key === 'cvr'     && parseFloat(kpi[key]) < 7  && kpi[key])  return 'border-red-300 bg-red-50';
      if (key === 'cvr'     && parseFloat(kpi[key]) < 10 && kpi[key])  return 'border-amber-300 bg-amber-50';
      if (key === 'ctr'     && parseFloat(kpi[key]) < 1.0 && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'ctr'     && parseFloat(kpi[key]) < 1.25 && kpi[key])return 'border-amber-300 bg-amber-50';
      if (key === 'fbaStock'&& parseFloat(kpi[key]) < 7  && kpi[key])  return 'border-red-300 bg-red-50';
      if (key === 'fbaStock'&& parseFloat(kpi[key]) < 14 && kpi[key])  return 'border-amber-300 bg-amber-50';
      if (key === 'cumPnl'  && parseFloat(kpi[key]) < -15000)          return 'border-red-300 bg-red-50';
      if (key === 'cumPnl'  && parseFloat(kpi[key]) < -5000)           return 'border-amber-300 bg-amber-50';
      return 'border-gray-200';
    },
  },
  Flipkart: {
    color: '#2874f0',
    budgetLabels: ['starter', 'growth', 'scale'],
    emptyKpi: { units: '', impressions: '', ctr: '', cvr: '', roas: '', adSpend: '', adRevenue: '', returnRate: '', rating: '', cumPnl: '' },
    getKpiFields: (week, budget) => [
      { key: 'units',      label: 'Units Sold',     hint: 'Target varies by week',              placeholder: '0' },
      { key: 'impressions',label: 'Impressions',     hint: 'Total ad impressions',              placeholder: '0' },
      { key: 'ctr',        label: 'CTR (%)',         hint: 'SAFE ≥1.0%',                        placeholder: '0.00' },
      { key: 'cvr',        label: 'CVR (%)',         hint: 'SAFE ≥8%',                          placeholder: '0.00' },
      { key: 'roas',       label: 'ROAS (×)',        hint: 'SAFE ≥3×',                          placeholder: '0.00' },
      { key: 'adSpend',    label: 'Ad Spend ₹',     hint: `Budget: ₹${week?.budgets?.[budget]?.toLocaleString?.() || '—'}`, placeholder: '0' },
      { key: 'adRevenue',  label: 'Ad Revenue ₹',   hint: 'From PLA campaigns',                placeholder: '0' },
      { key: 'returnRate', label: 'Return Rate (%)', hint: 'DANGER >15%',                      placeholder: '0.00' },
      { key: 'rating',     label: 'Seller Rating',  hint: 'SAFE ≥4.0',                         placeholder: '0.0' },
      { key: 'cumPnl',     label: 'Cum. Net P&L ₹', hint: 'Track weekly',                     placeholder: '0' },
    ],
    scorecardFields: FLIPKART_SCORECARD,
    baseTasks: FLIPKART_BASE,
    mustComplete: FLIPKART_MUST,
    recurringTasks: FLIPKART_RECURRING,
    weekData: FLIPKART_WEEK_DATA,
    triggeredConditions: FLIPKART_TRIGGERED,
    heroes: null,
    evalAlerts: (kpi) => {
      const a = [];
      const roas = parseFloat(kpi.roas), ret = parseFloat(kpi.returnRate), rat = parseFloat(kpi.rating), pnl = parseFloat(kpi.cumPnl);
      if (!isNaN(roas) && roas < 2   && kpi.roas)       a.push({ level: 'red',   text: `⛔ ROAS DANGER ${roas}×: Below 2×. Pause campaign and review bids immediately.` });
      if (!isNaN(ret)  && ret > 15   && kpi.returnRate) a.push({ level: 'red',   text: `⛔ RETURN DANGER ${ret}%: Review listing claims and size charts immediately.` });
      if (!isNaN(ret)  && ret > 10   && ret <= 15 && kpi.returnRate) a.push({ level: 'amber', text: `⚠️ RETURN WARNING ${ret}%: Approaching 15% threshold — investigate now.` });
      if (!isNaN(rat)  && rat < 3.5  && kpi.rating)     a.push({ level: 'red',   text: `⛔ RATING DANGER ${rat}: Emergency audit — review all returns and responses.` });
      if (!isNaN(pnl)  && pnl < -10000)                 a.push({ level: 'red',   text: `⛔ P&L DANGER ₹${pnl.toLocaleString()}: Switch to Starter budget for 2 weeks.` });
      return a;
    },
    evalGood: (kpi) => {
      const g = [];
      const roas = parseFloat(kpi.roas), rat = parseFloat(kpi.rating);
      if (!isNaN(roas) && roas >= 5)  g.push(`🚀 ROAS ${roas}× — Scale budget +25% on winning campaigns!`);
      if (!isNaN(rat)  && rat >= 4.5) g.push(`⭐ Seller Rating ${rat} — F-Assured eligibility zone!`);
      return g;
    },
    inputColor: (key, kpi) => {
      if (key === 'roas'       && parseFloat(kpi[key]) < 2  && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'roas'       && parseFloat(kpi[key]) < 3  && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'returnRate' && parseFloat(kpi[key]) > 15 && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'returnRate' && parseFloat(kpi[key]) > 10 && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'rating'     && parseFloat(kpi[key]) < 3.5 && kpi[key])return 'border-red-300 bg-red-50';
      if (key === 'cumPnl'     && parseFloat(kpi[key]) < -10000)         return 'border-red-300 bg-red-50';
      return 'border-gray-200';
    },
  },
  Meesho: {
    color: '#f43397',
    budgetLabels: ['starter', 'growth', 'scale'],
    emptyKpi: { units: '', orders: '', roas: '', adSpend: '', adRevenue: '', returnRate: '', catalogScore: '', supplierScore: '', cumPnl: '' },
    getKpiFields: (week, budget) => [
      { key: 'units',        label: 'Units Sold',         hint: 'Target varies by week',         placeholder: '0' },
      { key: 'orders',       label: 'Orders Dispatched',  hint: '100% on-time SLA target',       placeholder: '0' },
      { key: 'roas',         label: 'ROAS (×)',           hint: 'SAFE ≥2×',                      placeholder: '0.00' },
      { key: 'adSpend',      label: 'Ad Spend ₹',        hint: `Budget: ₹${week?.budgets?.[budget]?.toLocaleString?.() || '—'}`, placeholder: '0' },
      { key: 'adRevenue',    label: 'Ad Revenue ₹',      hint: 'From Meesho Ads',               placeholder: '0' },
      { key: 'returnRate',   label: 'Return Rate (%)',    hint: 'DANGER >20%',                   placeholder: '0.00' },
      { key: 'catalogScore', label: 'Catalog Score',      hint: 'SAFE ≥80',                      placeholder: '0' },
      { key: 'supplierScore',label: 'Supplier Score',     hint: 'DANGER <5',                     placeholder: '0.0' },
      { key: 'cumPnl',       label: 'Cum. Net P&L ₹',   hint: 'Track weekly',                  placeholder: '0' },
    ],
    scorecardFields: MEESHO_SCORECARD,
    baseTasks: MEESHO_BASE,
    mustComplete: MEESHO_MUST,
    recurringTasks: MEESHO_RECURRING,
    weekData: MEESHO_WEEK_DATA,
    triggeredConditions: MEESHO_TRIGGERED,
    heroes: null,
    evalAlerts: (kpi) => {
      const a = [];
      const ret = parseFloat(kpi.returnRate), sup = parseFloat(kpi.supplierScore), cat = parseFloat(kpi.catalogScore);
      if (!isNaN(ret) && ret > 20  && kpi.returnRate)    a.push({ level: 'red',   text: `⛔ RETURN DANGER ${ret}%: Pause ads, review listing accuracy and size charts NOW.` });
      if (!isNaN(ret) && ret > 15  && ret <= 20 && kpi.returnRate) a.push({ level: 'amber', text: `⚠️ RETURN WARNING ${ret}%: Audit return reasons, fix within 48 hours.` });
      if (!isNaN(sup) && sup < 5   && kpi.supplierScore) a.push({ level: 'red',   text: `⛔ SUPPLIER SCORE DANGER ${sup}: Emergency — resolve all disputes and quality flags.` });
      if (!isNaN(cat) && cat < 60  && kpi.catalogScore)  a.push({ level: 'red',   text: `⛔ CATALOG SCORE DANGER ${cat}: Fix images, size chart, and description immediately.` });
      return a;
    },
    evalGood: (kpi) => {
      const g = [];
      const roas = parseFloat(kpi.roas), cat = parseFloat(kpi.catalogScore);
      if (!isNaN(roas) && roas >= 4) g.push(`🚀 ROAS ${roas}× — Scale budget +25% on this product!`);
      if (!isNaN(cat)  && cat >= 90) g.push(`📦 Catalog Score ${cat} — Apply for Meesho Boost program!`);
      return g;
    },
    inputColor: (key, kpi) => {
      if (key === 'returnRate'   && parseFloat(kpi[key]) > 20 && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'returnRate'   && parseFloat(kpi[key]) > 15 && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'supplierScore'&& parseFloat(kpi[key]) < 5  && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'catalogScore' && parseFloat(kpi[key]) < 60 && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'catalogScore' && parseFloat(kpi[key]) < 80 && kpi[key]) return 'border-amber-300 bg-amber-50';
      return 'border-gray-200';
    },
  },
  Myntra: {
    color: '#ff3f6c',
    budgetLabels: ['starter', 'growth', 'scale'],
    emptyKpi: { units: '', styleQuotient: '', ctr: '', cvr: '', roas: '', adSpend: '', adRevenue: '', returnRate: '', rating: '', cumPnl: '' },
    getKpiFields: (week, budget) => [
      { key: 'units',        label: 'Units Sold',         hint: 'Target varies by week',         placeholder: '0' },
      { key: 'styleQuotient',label: 'Style Quotient',     hint: 'SAFE ≥70',                      placeholder: '0' },
      { key: 'ctr',          label: 'CTR (%)',            hint: 'SAFE ≥0.8%',                    placeholder: '0.00' },
      { key: 'cvr',          label: 'CVR (%)',            hint: 'SAFE ≥6%',                      placeholder: '0.00' },
      { key: 'roas',         label: 'ROAS (×)',           hint: 'SAFE ≥2.5×',                    placeholder: '0.00' },
      { key: 'adSpend',      label: 'Ad Spend ₹',        hint: `Budget: ₹${week?.budgets?.[budget]?.toLocaleString?.() || '—'}`, placeholder: '0' },
      { key: 'adRevenue',    label: 'Ad Revenue ₹',      hint: 'From Myntra Ads',               placeholder: '0' },
      { key: 'returnRate',   label: 'Return Rate (%)',    hint: 'DANGER >35% (fashion avg 25%)', placeholder: '0.00' },
      { key: 'rating',       label: 'Product Rating',    hint: 'SAFE ≥4.0',                     placeholder: '0.0' },
      { key: 'cumPnl',       label: 'Cum. Net P&L ₹',   hint: 'Track weekly',                  placeholder: '0' },
    ],
    scorecardFields: MYNTRA_SCORECARD,
    baseTasks: MYNTRA_BASE,
    mustComplete: MYNTRA_MUST,
    recurringTasks: MYNTRA_RECURRING,
    weekData: MYNTRA_WEEK_DATA,
    triggeredConditions: MYNTRA_TRIGGERED,
    heroes: null,
    evalAlerts: (kpi) => {
      const a = [];
      const sq = parseFloat(kpi.styleQuotient), ret = parseFloat(kpi.returnRate), rat = parseFloat(kpi.rating);
      if (!isNaN(sq)  && sq < 60   && kpi.styleQuotient) a.push({ level: 'red',   text: `⛔ STYLE QUOTIENT DANGER ${sq}: Emergency listing upgrade required.` });
      if (!isNaN(sq)  && sq < 70   && kpi.styleQuotient) a.push({ level: 'amber', text: `⚠️ STYLE QUOTIENT WARNING ${sq}: Below 70 — add model shots and lifestyle images.` });
      if (!isNaN(ret) && ret > 35  && kpi.returnRate)    a.push({ level: 'red',   text: `⛔ RETURN DANGER ${ret}%: Pause ads on this style, fix size chart immediately.` });
      if (!isNaN(ret) && ret > 25  && ret <= 35 && kpi.returnRate) a.push({ level: 'amber', text: `⚠️ RETURN WARNING ${ret}%: Review size accuracy and product claims.` });
      if (!isNaN(rat) && rat < 3.5 && kpi.rating)        a.push({ level: 'amber', text: `⚠️ RATING WARNING ${rat}: Reply to all negative reviews with resolution.` });
      return a;
    },
    evalGood: (kpi) => {
      const g = [];
      const sq = parseFloat(kpi.styleQuotient), cvr = parseFloat(kpi.cvr);
      if (!isNaN(sq)  && sq >= 85)  g.push(`✨ Style Quotient ${sq} — Apply for Myntra editorial feature!`);
      if (!isNaN(cvr) && cvr >= 12) g.push(`🚀 CVR ${cvr}% — Scale ad budget +25% on this style!`);
      return g;
    },
    inputColor: (key, kpi) => {
      if (key === 'styleQuotient'&& parseFloat(kpi[key]) < 60 && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'styleQuotient'&& parseFloat(kpi[key]) < 70 && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'returnRate'   && parseFloat(kpi[key]) > 35 && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'returnRate'   && parseFloat(kpi[key]) > 25 && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'rating'       && parseFloat(kpi[key]) < 3.5 && kpi[key])return 'border-amber-300 bg-amber-50';
      return 'border-gray-200';
    },
  },
  JioMart: {
    color: '#0077B6',
    budgetLabels: ['starter', 'growth', 'scale'],
    emptyKpi: { orders: '', sla: '', storeRating: '', returnRate: '', revenue: '', cumPnl: '' },
    getKpiFields: (week, budget) => [
      { key: 'orders',      label: 'Orders Received',    hint: 'Target varies by week',         placeholder: '0' },
      { key: 'sla',         label: 'Delivery SLA (%)',   hint: 'SAFE ≥98%',                     placeholder: '0.00' },
      { key: 'storeRating', label: 'Store Rating',       hint: 'DANGER <3.5',                   placeholder: '0.0' },
      { key: 'returnRate',  label: 'Return Rate (%)',    hint: 'SAFE <8%',                      placeholder: '0.00' },
      { key: 'revenue',     label: 'Revenue ₹',         hint: 'Total revenue this week',       placeholder: '0' },
      { key: 'promoRevenue',label: 'Promo Revenue ₹',   hint: 'Revenue from deals & offers',  placeholder: '0' },
      { key: 'cumPnl',      label: 'Cum. Net P&L ₹',   hint: 'Track weekly',                  placeholder: '0' },
    ],
    scorecardFields: JIOMART_SCORECARD,
    baseTasks: JIOMART_BASE,
    mustComplete: JIOMART_MUST,
    recurringTasks: JIOMART_RECURRING,
    weekData: JIOMART_WEEK_DATA,
    triggeredConditions: JIOMART_TRIGGERED,
    heroes: null,
    evalAlerts: (kpi) => {
      const a = [];
      const sla = parseFloat(kpi.sla), rat = parseFloat(kpi.storeRating), ret = parseFloat(kpi.returnRate);
      if (!isNaN(sla) && sla < 90  && kpi.sla)         a.push({ level: 'red',   text: `⛔ SLA DANGER ${sla}%: Fix dispatch process immediately — account at risk.` });
      if (!isNaN(rat) && rat < 3.5 && kpi.storeRating) a.push({ level: 'red',   text: `⛔ STORE RATING DANGER ${rat}: Emergency review — audit delivery and quality.` });
      if (!isNaN(ret) && ret > 10  && kpi.returnRate)  a.push({ level: 'amber', text: `⚠️ RETURN WARNING ${ret}%: Audit packaging quality and listing accuracy.` });
      return a;
    },
    evalGood: (kpi) => {
      const g = [];
      const sla = parseFloat(kpi.sla), rat = parseFloat(kpi.storeRating);
      if (!isNaN(sla) && sla >= 99) g.push(`🚀 SLA ${sla}% — Eligible for JioMart Priority Seller badge!`);
      if (!isNaN(rat) && rat >= 4.5)g.push(`⭐ Store Rating ${rat} — Apply for JioMart Featured Slot!`);
      return g;
    },
    inputColor: (key, kpi) => {
      if (key === 'sla'        && parseFloat(kpi[key]) < 90  && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'sla'        && parseFloat(kpi[key]) < 97  && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'storeRating'&& parseFloat(kpi[key]) < 3.5 && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'storeRating'&& parseFloat(kpi[key]) < 4.0 && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'returnRate' && parseFloat(kpi[key]) > 10  && kpi[key]) return 'border-red-300 bg-red-50';
      return 'border-gray-200';
    },
  },
  Snapdeal: {
    color: '#e40046',
    budgetLabels: ['starter', 'growth', 'scale'],
    emptyKpi: { units: '', buyerRating: '', cqi: '', ctr: '', cvr: '', roas: '', adSpend: '', adRevenue: '', returnRate: '', cumPnl: '' },
    getKpiFields: (week, budget) => [
      { key: 'units',      label: 'Units Sold',         hint: 'Target varies by week',          placeholder: '0' },
      { key: 'buyerRating',label: 'Buyer Rating',       hint: 'DANGER <3.0',                    placeholder: '0.0' },
      { key: 'cqi',        label: 'Catalog QI (%)',     hint: 'SAFE ≥75%',                      placeholder: '0.00' },
      { key: 'ctr',        label: 'CTR (%)',            hint: 'SAFE ≥0.8%',                     placeholder: '0.00' },
      { key: 'cvr',        label: 'CVR (%)',            hint: 'SAFE ≥8%',                       placeholder: '0.00' },
      { key: 'adSpend',    label: 'Ad Spend ₹',        hint: `Budget: ₹${week?.budgets?.[budget]?.toLocaleString?.() || '—'}`, placeholder: '0' },
      { key: 'adRevenue',  label: 'Ad Revenue ₹',      hint: 'From CPC campaigns',             placeholder: '0' },
      { key: 'returnRate', label: 'Return Rate (%)',    hint: 'SAFE <10%',                      placeholder: '0.00' },
      { key: 'cumPnl',     label: 'Cum. Net P&L ₹',   hint: 'Track weekly',                   placeholder: '0' },
    ],
    scorecardFields: SNAPDEAL_SCORECARD,
    baseTasks: SNAPDEAL_BASE,
    mustComplete: SNAPDEAL_MUST,
    recurringTasks: SNAPDEAL_RECURRING,
    weekData: SNAPDEAL_WEEK_DATA,
    triggeredConditions: SNAPDEAL_TRIGGERED,
    heroes: null,
    evalAlerts: (kpi) => {
      const a = [];
      const rat = parseFloat(kpi.buyerRating), cqi = parseFloat(kpi.cqi), ret = parseFloat(kpi.returnRate);
      if (!isNaN(rat) && rat < 3.0  && kpi.buyerRating) a.push({ level: 'red',   text: `⛔ BUYER RATING DANGER ${rat}: Emergency — audit all returns, queries, SLA.` });
      if (!isNaN(rat) && rat < 4.0  && kpi.buyerRating) a.push({ level: 'amber', text: `⚠️ BUYER RATING WARNING ${rat}: Review top negative feedback and fix causes.` });
      if (!isNaN(cqi) && cqi < 50   && kpi.cqi)         a.push({ level: 'red',   text: `⛔ CQI DANGER ${cqi}%: Risk of delist — emergency listing quality fix needed.` });
      if (!isNaN(ret) && ret > 12   && kpi.returnRate)  a.push({ level: 'amber', text: `⚠️ RETURN WARNING ${ret}%: Review listing accuracy: images, description, sizing.` });
      return a;
    },
    evalGood: (kpi) => {
      const g = [];
      const roas = parseFloat(kpi.roas), rat = parseFloat(kpi.buyerRating), cqi = parseFloat(kpi.cqi);
      if (!isNaN(roas) && roas >= 4)  g.push(`🚀 ROAS ${roas}× — Scale CPC budget +25% on winning keywords!`);
      if (!isNaN(rat)  && rat >= 4.5 && !isNaN(cqi) && cqi >= 85) g.push(`⭐ Rating ${rat} + CQI ${cqi}% — Apply for Snapdeal Premium Seller!`);
      return g;
    },
    inputColor: (key, kpi) => {
      if (key === 'buyerRating'&& parseFloat(kpi[key]) < 3.0 && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'buyerRating'&& parseFloat(kpi[key]) < 4.0 && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'cqi'        && parseFloat(kpi[key]) < 50  && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'cqi'        && parseFloat(kpi[key]) < 75  && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'returnRate' && parseFloat(kpi[key]) > 12  && kpi[key]) return 'border-red-300 bg-red-50';
      return 'border-gray-200';
    },
  },
};

function groupByPlatform(tasks) {
  const map = {};
  PLATFORMS.forEach(p => { map[p] = []; });
  tasks.forEach(t => { if (t.platform && map[t.platform]) map[t.platform].push(t); });
  return map;
}

function evalStopLoss(kpi) {
  const alerts = [];
  const pnl  = parseFloat(kpi.cumPnl);
  const acos = parseFloat(kpi.acos);
  const fba  = parseFloat(kpi.fbaStock);
  const ctr  = parseFloat(kpi.ctr);
  const cvr  = parseFloat(kpi.cvr);
  if (!isNaN(pnl)) {
    if (pnl < -15000)   alerts.push({ level: 'red',   text: `⛔ P&L DANGER ₹${pnl.toLocaleString()}: Forced Conservative for 2 weeks. Pause all ACOS >70% campaigns.` });
    else if (pnl < -5000) alerts.push({ level: 'amber', text: `⚠️ P&L WARNING ₹${pnl.toLocaleString()}: Approaching −₹15,000 stop-loss. Review spend urgently.` });
  }
  if (!isNaN(acos)) {
    if (acos > 70)      alerts.push({ level: 'red',   text: `⛔ ACOS DANGER ${acos}%: Pause this campaign immediately and reallocate budget.` });
    else if (acos >= 40)  alerts.push({ level: 'amber', text: `⚠️ ACOS WARNING ${acos}%: 40–70% zone — hold and monitor closely.` });
  }
  if (!isNaN(fba)) {
    if (fba < 7)        alerts.push({ level: 'red',   text: `⛔ FBA DANGER ${fba} days: Emergency reorder today — last 30-day velocity × 21 days.` });
    else if (fba < 14)  alerts.push({ level: 'amber', text: `⚠️ FBA WARNING ${fba} days: Schedule replenishment by next Tuesday.` });
  }
  if (!isNaN(ctr)) {
    if (ctr < 1.0)      alerts.push({ level: 'red',   text: `⛔ CTR DANGER ${ctr}%: Hero #1 below 1.0%. Check main image immediately.` });
    else if (ctr < 1.25)  alerts.push({ level: 'amber', text: `⚠️ CTR WARNING ${ctr}%: Below 1.25% target for Hero #1.` });
  }
  if (!isNaN(cvr)) {
    if (cvr < 7)        alerts.push({ level: 'red',   text: `⛔ CVR DANGER ${cvr}%: Below 7%. Check listing quality, reviews, and price.` });
    else if (cvr < 10)  alerts.push({ level: 'amber', text: `⚠️ CVR WARNING ${cvr}%: 7–9.9% zone — below 10% target.` });
  }
  return alerts;
}

function evalTriggers(kpi) {
  const good = [];
  const cvr  = parseFloat(kpi.cvr);
  const acos = parseFloat(kpi.acos);
  const ctr  = parseFloat(kpi.ctr);
  const pnl  = parseFloat(kpi.cumPnl);
  if (!isNaN(cvr)  && cvr >= 10)   good.push(`🚀 CVR ${cvr}% — at or above target! Scale budget on winning campaigns.`);
  if (!isNaN(acos) && acos < 40)   good.push(`💰 ACOS ${acos}% — efficient zone. Scale budget +25% on this campaign.`);
  if (!isNaN(ctr)  && ctr >= 1.25) good.push(`🎯 CTR ${ctr}% — Hero #1 hitting target. Maintain current image and title.`);
  if (!isNaN(pnl)  && pnl > 5000)  good.push(`🏆 P&L +₹${pnl.toLocaleString()} — above ₹5,000! Eligible for Aggressive path acceleration.`);
  return good;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlatformCard({ name, tasks, onSelect, active }) {
  const meta = PLATFORM_META[name];
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'Completed').length;
  const overdue = tasks.filter(t => t.isOverdue && t.status !== 'Completed').length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const members = [...new Map(tasks.filter(t => t.assignedTo).map(t => [t.assignedTo._id, t.assignedTo])).values()];
  return (
    <button onClick={() => onSelect(name)}
      className={clsx('text-left w-full rounded-2xl border-2 p-3.5 transition-all hover:shadow-md', active ? 'shadow-md' : 'bg-white border-gray-200')}
      style={active ? { borderColor: meta.color, background: meta.bg } : {}}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0" style={{ background: meta.color }}>{meta.initial}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-gray-900">{name}</p>
          <p className="text-[10px] text-gray-400">{total} task{total !== 1 ? 's' : ''}</p>
        </div>
        {overdue > 0 && <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">{overdue} ⚠</span>}
      </div>
      {members.length > 0 && (
        <div className="flex gap-1 mb-2 flex-wrap">
          {members.map(m => (
            <span key={m._id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: meta.color + '22', color: meta.text }}>
              {m.firstName[0]}{m.lastName[0]}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: progress === 100 ? '#22c55e' : meta.color }} />
        </div>
        <span className="text-[10px] font-bold text-gray-600">{progress}%</span>
      </div>
    </button>
  );
}

function TaskRow({ task, navigate }) {
  const meta = PLATFORM_META[task.platform] || PLATFORM_META.Amazon;
  const statusMeta = STATUS_COLORS[task.status] || { dot: '#94a3b8', badge: 'bg-gray-100 text-gray-600' };
  const subs = task.subTasks || [];
  const completedSubs = subs.filter(s => s.status === 'Completed').length;
  const pct = subs.length > 0 ? Math.round((completedSubs / subs.length) * 100) : 0;
  return (
    <div onClick={() => navigate(`/workflow/${task._id}`)}
      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 cursor-pointer transition-all group">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusMeta.dot }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-orange-700">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', statusMeta.badge)}>{task.status}</span>
          {task.assignedTo && <span className="text-[10px] text-gray-400">→ {task.assignedTo.firstName} {task.assignedTo.lastName}</span>}
          {task.dueDate && <span className={clsx('text-[10px] font-medium', task.isOverdue && task.status !== 'Completed' ? 'text-red-500' : 'text-gray-400')}>{task.isOverdue && task.status !== 'Completed' ? 'OVERDUE · ' : ''}{format(new Date(task.dueDate), 'dd MMM')}</span>}
        </div>
      </div>
      {subs.length > 0 && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-12 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : meta.color }} />
          </div>
          <span className="text-[10px] font-bold text-gray-500">{pct}%</span>
        </div>
      )}
    </div>
  );
}


// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ allTasks, tasksLoading, navigate }) {
  const [activePlatform, setActivePlatform] = useState(null);

  const byPlatform   = useMemo(() => groupByPlatform(allTasks), [allTasks]);
  const displayTasks = activePlatform ? byPlatform[activePlatform] || [] : allTasks;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setActivePlatform(null)} className={clsx('px-3 py-2 rounded-xl text-xs font-bold border transition-all', !activePlatform ? 'bg-gray-900 text-white border-gray-900 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')}>All</button>
        {PLATFORMS.map(p => {
          const meta = PLATFORM_META[p];
          const active = activePlatform === p;
          return (
            <button key={p} onClick={() => setActivePlatform(active ? null : p)}
              className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all', active ? 'text-white shadow-md border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:shadow-sm')}
              style={active ? { background: meta.color } : {}}>
              <span className="w-4 h-4 rounded flex items-center justify-center text-white text-[9px] font-black" style={{ background: meta.color }}>{meta.initial}</span>
              {p}
              <span className={clsx('text-[10px] font-bold rounded-full px-1 py-0.5', active ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-500')}>{byPlatform[p]?.length || 0}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {PLATFORMS.map(p => <PlatformCard key={p} name={p} tasks={byPlatform[p]} active={activePlatform === p} onSelect={setActivePlatform} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Task list */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BoltIcon className="w-4 h-4 text-orange-500" />
              <h3 className="font-bold text-gray-900 text-sm">{activePlatform ? `${activePlatform} Tasks` : 'All Marketplace Tasks'}</h3>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{displayTasks.length}</span>
            </div>
            <span className="flex items-center gap-1 text-[10px] text-green-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Live</span>
          </div>
          {tasksLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : displayTasks.length === 0 ? (
            <div className="text-center py-10 text-gray-400"><ChartBarIcon className="w-10 h-10 mx-auto mb-3 opacity-20" /><p className="text-sm font-medium text-gray-500">No {activePlatform ? `${activePlatform} ` : ''}tasks yet</p><p className="text-xs mt-1">Create tasks in Workflow Builder → assign to Marketplace</p></div>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">{displayTasks.map(task => <TaskRow key={task._id} task={task} navigate={navigate} />)}</div>
          )}
        </div>

        {/* Platform task breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ChartBarIcon className="w-4 h-4 text-orange-500" />
              <h3 className="font-bold text-gray-900 text-sm">Platform Task Breakdown</h3>
            </div>
            <button
              onClick={() => navigate('/workflow')}
              className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700 px-2.5 py-1.5 rounded-lg hover:bg-orange-50 transition-colors border border-orange-200"
            >
              <BoltIcon className="w-3.5 h-3.5" />
              Assign in Workflow Builder
            </button>
          </div>
          <div className="space-y-2.5">
            {PLATFORMS.map(p => {
              const tasks    = byPlatform[p] || [];
              const total    = tasks.length;
              const done     = tasks.filter(t => t.status === 'Completed').length;
              const active   = tasks.filter(t => t.status === 'In Progress').length;
              const overdue  = tasks.filter(t => t.isOverdue && t.status !== 'Completed').length;
              const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
              const meta     = PLATFORM_META[p];
              const selected = activePlatform === p;
              return (
                <div key={p}
                  onClick={() => setActivePlatform(selected ? null : p)}
                  className={clsx('p-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm', selected ? 'border-2' : 'border-gray-100 hover:border-gray-200 bg-gray-50/60')}
                  style={selected ? { borderColor: meta.color, background: meta.bg } : {}}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black flex-shrink-0" style={{ background: meta.color }}>{meta.initial}</div>
                    <span className="text-xs font-bold text-gray-800 flex-1">{p}</span>
                    {overdue > 0
                      ? <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">{overdue} overdue</span>
                      : <span className="text-[9px] text-gray-400 font-medium">{total} task{total !== 1 ? 's' : ''}</span>}
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : meta.color }} />
                    </div>
                    <span className="text-xs font-bold w-8 text-right" style={{ color: pct === 100 ? '#16a34a' : meta.text }}>{pct}%</span>
                  </div>
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-green-600 font-semibold">✓ {done} done</span>
                    {active > 0 && <span className="text-yellow-600 font-semibold">↻ {active} active</span>}
                    {total === 0 && <span className="text-gray-400">No tasks assigned yet</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calendar helpers ──────────────────────────────────────────────────────────

// Returns ISO YYYY-MM-DD of Monday of the week containing `date`
function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

// ISO week number of the year (1-53)
function getISOWeekNum(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function getWeekDateRange(planStartDate, weekNum) {
  const start = new Date(planStartDate);
  start.setDate(start.getDate() + (weekNum - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

function fmtShort(date) {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getCurrentPlanWeek(planStartDate, totalWeeks) {
  const today    = new Date();
  const start    = new Date(planStartDate);
  const diffDays = Math.floor((today - start) / 86400000);
  const week     = Math.floor(diffDays / 7) + 1;
  if (week < 1 || week > totalWeeks) return null;
  return week;
}

// ── Plan Tab ──────────────────────────────────────────────────────────────────

function PlanTab({ platform = 'Amazon' }) {
  const cfg = PLATFORM_PLAN_CONFIG[platform] || PLATFORM_PLAN_CONFIG.Amazon;
  const platColor = cfg.color;
  const queryClient = useQueryClient();
  const [activeWeek, setActiveWeek] = useState(1);
  const [activeDay,  setActiveDay]  = useState('Mon');
  const [showTriggers, setShowTriggers] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const saveTimer = useRef(null);

  // Plan start date — auto-set to Monday of current week on first use, then remembered
  const [planStartDate] = useState(() => {
    const key    = `mkt_start_${platform}`;
    const saved  = localStorage.getItem(key);
    if (saved) return saved;
    const monday = getMondayOf(new Date());
    localStorage.setItem(key, monday);
    return monday;
  });

  // All progress from the backend — keyed by week number
  const [allProgress, setAllProgress] = useState({});

  // Fetch imported plan from DB (overrides hardcoded data if present)
  const { data: importedPlan } = useQuery({
    queryKey: ['mkt-plan', platform],
    queryFn: () => api.get(`/marketplace/plans/${platform}`).then(r => r.data.plan),
    staleTime: 60000,
  });

  // Fetch all saved progress from DB
  const { data: progressData } = useQuery({
    queryKey: ['mkt-progress', platform],
    queryFn: () => api.get(`/marketplace/progress/${platform}`).then(r => r.data.progress),
    staleTime: 30000,
  });

  // Hydrate allProgress when API data arrives
  useEffect(() => {
    if (!progressData) return;
    const map = {};
    progressData.forEach(doc => { map[doc.week] = doc; });
    setAllProgress(map);
  }, [progressData]);

  // Save mutation (debounced via saveTimer)
  const saveMutation = useMutation({
    mutationFn: ({ week, data }) => api.put(`/marketplace/progress/${platform}/${week}`, data),
  });

  const scheduleSync = useCallback((week, data) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveMutation.mutate({ week, data });
    }, 1200);
  }, [saveMutation]);

  // Helpers to read current day/week data from allProgress
  const weekDoc    = allProgress[activeWeek] || {};
  const dayDoc     = weekDoc.days?.[activeDay] || {};
  const checked    = useMemo(() => {
    const s = {};
    (dayDoc.checked || []).forEach(id => { s[id] = true; });
    return s;
  }, [dayDoc.checked]);
  const kpi        = dayDoc.kpi   || { ...cfg.emptyKpi };
  const notes      = dayDoc.notes || '';
  const budget     = weekDoc.budget || cfg.budgetLabels[1];
  const scorecard  = weekDoc.scorecard || {};

  // Convert DB plan → same shape as cfg.weekData
  const weekData = useMemo(() => {
    if (importedPlan?.weeks?.length > 0) {
      return importedPlan.weeks.map(w => ({
        n:       w.week,
        title:   w.name,
        desc:    w.focus,
        nonNeg:  w.mustNonNeg,
        budgets: cfg.weekData[w.week - 1]?.budgets || {},
        ws:      w.specific,
      }));
    }
    return cfg.weekData;
  }, [importedPlan, cfg.weekData]);

  const isImported = importedPlan?.weeks?.length > 0;

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.name.match(/\.html?$/i)) { toast.error('Please upload the .html template file'); return; }
    setImporting(true);
    try {
      const text = await file.text();
      const doc  = new DOMParser().parseFromString(text, 'text/html');
      const VALID_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat'];
      const weeksMap = {};
      doc.querySelectorAll('tr[data-week][data-day]').forEach(row => {
        const wn  = parseInt(row.getAttribute('data-week'));
        const day = row.getAttribute('data-day');
        if (!VALID_DAYS.includes(day)) return;
        const taskText = row.querySelector('[data-field="task"]')?.textContent?.trim() || '';
        const noteText = row.querySelector('[data-field="note"]')?.textContent?.trim() || '';
        if (!taskText) return;
        if (!weeksMap[wn]) {
          weeksMap[wn] = {
            week: wn,
            name: (doc.querySelector(`[data-week-name="${wn}"]`)?.textContent?.trim() || '').toUpperCase(),
            focus: doc.querySelector(`[data-week-focus="${wn}"]`)?.textContent?.trim() || '',
            mustNonNeg: doc.querySelector(`[data-week-nonneg="${wn}"]`)?.textContent?.trim() || '',
            specific: { Mon:[], Tue:[], Wed:[], Thu:[], Fri:[], Sat:[] },
          };
        }
        const list = weeksMap[wn].specific[day];
        list.push({ id: `imp_${wn}_${day}_${list.length + 1}`, text: taskText, note: noteText });
      });
      const weeks = Object.values(weeksMap).sort((a, b) => a.week - b.week);
      if (!weeks.length) { toast.error('No tasks found. Make sure you used the downloaded template.'); return; }
      await api.post(`/marketplace/plans/${platform}/import-json`, { weeks });
      await queryClient.invalidateQueries(['mkt-plan', platform]);
      toast.success(`${platform} plan imported — ${weeks.length} weeks loaded`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat'];
    const color = platColor;
    const weeks = weekData;
    let tableRows = '';
    weeks.forEach(w => {
      tableRows += `
        <tr style="background:${color};color:#fff">
          <td colspan="3" style="padding:10px 12px;font-size:14px;font-weight:bold">
            Week ${w.n} — <span contenteditable="true" data-week-name="${w.n}" style="background:rgba(255,255,255,0.15);padding:1px 6px;border-radius:4px">${w.title}</span>
          </td>
        </tr>
        <tr style="background:#fef9c3">
          <td colspan="3" style="padding:6px 12px;font-size:11px;color:#854d0e">
            Focus: <span contenteditable="true" data-week-focus="${w.n}" style="background:rgba(0,0,0,0.04);padding:1px 4px;border-radius:3px">${w.desc || ''}</span>
          </td>
        </tr>
        <tr style="background:#fef2f2">
          <td colspan="3" style="padding:6px 12px;font-size:11px;color:#991b1b">
            ⚡ Non-Negotiable: <span contenteditable="true" data-week-nonneg="${w.n}" style="background:rgba(0,0,0,0.04);padding:1px 4px;border-radius:3px">${w.nonNeg || ''}</span>
          </td>
        </tr>
        <tr style="background:#f9fafb">
          <th style="width:52px;padding:6px 10px;border:1px solid #d1d5db;font-size:11px">Day</th>
          <th style="padding:6px 10px;border:1px solid #d1d5db;font-size:11px;width:60%">Task <span style="font-weight:normal;color:#9ca3af">(click to edit)</span></th>
          <th style="padding:6px 10px;border:1px solid #d1d5db;font-size:11px">Note</th>
        </tr>`;
      DAYS.forEach(day => {
        const tasks = w.ws?.[day] || [];
        const rows = [...tasks, { text: '', note: '' }, { text: '', note: '' }];
        rows.forEach(t => {
          tableRows += `
        <tr data-week="${w.n}" data-day="${day}">
          <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;font-size:11px;color:#6b7280;background:#fafafa">${day}</td>
          <td contenteditable="true" data-field="task" data-placeholder="Enter task…" style="padding:6px 10px;border:1px solid #e5e7eb;font-size:12px;min-width:280px;outline:none" onfocus="this.style.background='#eff6ff'" onblur="this.style.background=''">${t.text || ''}</td>
          <td contenteditable="true" data-field="note" style="padding:6px 10px;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;outline:none" onfocus="this.style.background='#eff6ff'" onblur="this.style.background=''">${t.note || ''}</td>
        </tr>`;
        });
      });
      tableRows += `<tr><td colspan="3" style="padding:8px"></td></tr>`;
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${platform} 12-Week Plan Template</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 24px; background: #f8fafc; color: #1e293b; }
    h1 { margin: 0 0 4px; font-size: 20px; color: ${color}; }
    .sub { color: #64748b; font-size: 13px; margin-bottom: 16px; }
    .info { background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; font-size: 12px; line-height: 1.6; color: #0c4a6e; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-radius: 8px; overflow: hidden; }
    [contenteditable]:empty:before { content: attr(data-placeholder); color: #cbd5e1; }
  </style>
</head>
<body>
  <h1>${platform} 12-Week Operations Plan</h1>
  <p class="sub">Backero Marketplace — Edit &amp; re-upload to update your plan</p>
  <div class="info">
    <b>How to use:</b><br>
    1. Click any editable cell (highlighted in blue when focused) and type your tasks.<br>
    2. The Day column is fixed — do <b>not</b> edit it.<br>
    3. Each day has 2 empty rows — add tasks there. Do not delete existing rows.<br>
    4. When done, save this file (<b>Ctrl+S</b> / <b>Cmd+S</b>) and upload it using <b>Import Plan</b> in the app.
  </div>
  <table>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${platform.toLowerCase()}-plan-template.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const week        = weekData[activeWeek - 1];
  const baseTasks   = cfg.baseTasks[activeDay] || [];
  const wsTasks     = week?.ws[activeDay] || [];
  const allDayTasks = [...baseTasks, ...wsTasks];
  const mustItems   = cfg.mustComplete[activeDay] || [];

  // Helper: update allProgress and schedule sync to backend
  const updateDay = useCallback((updater) => {
    setAllProgress(prev => {
      const prevWeek  = prev[activeWeek] || {};
      const prevDays  = prevWeek.days || {};
      const prevDay   = prevDays[activeDay] || { checked: [], kpi: {}, notes: '' };
      const newDay    = typeof updater === 'function' ? updater(prevDay) : { ...prevDay, ...updater };
      const newWeek   = { ...prevWeek, days: { ...prevDays, [activeDay]: newDay } };
      const next      = { ...prev, [activeWeek]: newWeek };
      scheduleSync(activeWeek, { budget: newWeek.budget || cfg.budgetLabels[1], scorecard: newWeek.scorecard || {}, days: newWeek.days });
      return next;
    });
  }, [activeWeek, activeDay, cfg.budgetLabels, scheduleSync]);

  const updateWeek = useCallback((updater) => {
    setAllProgress(prev => {
      const prevWeek = prev[activeWeek] || {};
      const newWeek  = typeof updater === 'function' ? updater(prevWeek) : { ...prevWeek, ...updater };
      const next     = { ...prev, [activeWeek]: newWeek };
      scheduleSync(activeWeek, { budget: newWeek.budget || cfg.budgetLabels[1], scorecard: newWeek.scorecard || {}, days: newWeek.days || {} });
      return next;
    });
  }, [activeWeek, cfg.budgetLabels, scheduleSync]);

  const toggleTask = (id) => {
    updateDay(prev => {
      const arr     = prev.checked || [];
      const newArr  = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
      return { ...prev, checked: newArr };
    });
  };
  const saveKpi       = (newKpi) => updateDay(prev => ({ ...prev, kpi: newKpi }));
  const saveNotes     = (v)      => updateDay(prev => ({ ...prev, notes: v }));
  const selectBudget  = (t)      => updateWeek(prev => ({ ...prev, budget: t }));
  const saveScorecard = (s)      => updateWeek(prev => ({ ...prev, scorecard: s }));

  const resetDay = () => {
    updateDay(() => ({ checked: [], kpi: { ...cfg.emptyKpi }, notes: '' }));
  };

  const exportDay = () => {
    const lines = [
      `TREYFA × ${platform.toUpperCase()} — Week ${activeWeek}: ${week.title} — ${activeDay}`,
      `NON-NEGOTIABLE: ${week.nonNeg}`, '',
      '── BASE TASKS ──', ...baseTasks.map(t => `[${checked[t.id] ? '✓' : ' '}] ${t.text}`), '',
      '── WEEK-SPECIFIC TASKS ──', ...wsTasks.map(t => `[${checked[t.id] ? '✓' : ' '}] ${t.text}`), '',
      '── DAILY CONSTANTS ──', ...cfg.recurringTasks.map(t => `[${checked[t.id] ? '✓' : ' '}] ${t.text}`), '',
      '── NOTES ──', notes || '(none)',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `treyfa-${platform.toLowerCase()}-w${activeWeek}-${activeDay.toLowerCase()}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportScorecard = () => {
    const lines = [`TREYFA × ${platform.toUpperCase()} — WEEK ${activeWeek} SCORECARD`, `Week Theme: ${week.title}`, '', ...cfg.scorecardFields.map(f => `${f.label}: ${scorecard[f.key] || '—'}`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `treyfa-${platform.toLowerCase()}-scorecard-w${activeWeek}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const allIds     = [...allDayTasks.map(t => t.id), ...cfg.recurringTasks.map(t => t.id)];
  const doneCount  = allIds.filter(id => checked[id]).length;
  const totalCount = allIds.length;
  const pctDone    = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const stopLoss   = cfg.evalAlerts(kpi);
  const triggers   = cfg.evalGood(kpi);
  const kpiFields  = cfg.getKpiFields(week, budget);

  const currentPlanWeek = useMemo(
    () => getCurrentPlanWeek(planStartDate, weekData.length),
    [planStartDate, weekData.length]
  );

  return (
    <div className="space-y-4">

      {/* Week selector + import controls */}
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-2xl border border-gray-200 px-4 py-3">
        <select
          value={activeWeek}
          onChange={e => { setActiveWeek(Number(e.target.value)); setActiveDay('Mon'); }}
          className="flex-1 min-w-[200px] text-sm font-bold border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white cursor-pointer"
          style={{ color: platColor }}
        >
          {weekData.map(w => {
            const range = getWeekDateRange(planStartDate, w.n);
            const dateLabel = `${fmtShort(range.start)} – ${fmtShort(range.end)}`;
            const isoWk = getISOWeekNum(range.start);
            return (
              <option key={w.n} value={w.n}>Week {w.n} · {dateLabel} (Yr Wk {isoWk}) · {w.title}</option>
            );
          })}
        </select>
        {isImported && <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-full whitespace-nowrap">Imported</span>}
        {saveMutation.isPending && <span className="text-[10px] text-gray-400 whitespace-nowrap">Saving…</span>}
        {saveMutation.isSuccess && <span className="text-[10px] text-green-600 whitespace-nowrap">✓ Saved</span>}
        <button onClick={downloadTemplate}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-gray-200 bg-white text-gray-600 rounded-xl hover:bg-gray-50 whitespace-nowrap transition-colors">
          <ArrowDownTrayIcon className="w-3.5 h-3.5" /> HTML Template
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={importing}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-xl whitespace-nowrap transition-colors disabled:opacity-50"
          style={{ background: platColor }}>
          {importing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownTrayIcon className="w-3.5 h-3.5 rotate-180" />}
          {importing ? 'Importing…' : 'Import Plan'}
        </button>
        <input ref={fileInputRef} type="file" accept=".html,.htm" className="hidden" onChange={handleImport} />
      </div>

      {/* Main content */}
      <div className="space-y-4">

        {/* Stop-loss alerts */}
        {(stopLoss.length > 0 || triggers.length > 0) && (
          <div className="space-y-2">
            {stopLoss.map((a, i) => (
              <div key={i} className={clsx('rounded-xl px-4 py-2.5 text-sm font-semibold flex items-start gap-2', a.level === 'red' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-700')}>
                <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />{a.text}
              </div>
            ))}
            {triggers.map((t, i) => (
              <div key={i} className="rounded-xl px-4 py-2.5 text-sm font-semibold flex items-start gap-2 bg-green-50 border border-green-200 text-green-700">
                <CheckCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />{t}
              </div>
            ))}
          </div>
        )}

        {/* Week header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full border" style={{ color: platColor, background: platColor + '15', borderColor: platColor + '40' }}>Week {week.n}</span>
                <h2 className="text-lg font-black text-gray-900">{week.title}</h2>
              </div>
              <p className="text-sm text-gray-500 mb-2">{week.desc}</p>
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <span className="text-red-500 text-xs font-black mt-0.5 flex-shrink-0">⚡ NON-NEGOTIABLE:</span>
                <span className="text-xs font-semibold text-red-700">{week.nonNeg}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-500 mb-1.5">Ad Budget</p>
              <div className="flex gap-1.5">
                {cfg.budgetLabels.map(type => (
                  <button key={type} onClick={() => selectBudget(type)}
                    className={clsx('px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all capitalize', budget === type ? 'text-white border-transparent' : 'bg-gray-50 text-gray-600 border-gray-200')}
                    style={budget === type ? { background: platColor } : {}}>
                    <p>{type}</p>
                    <p style={budget !== type ? { color: platColor } : { color: 'rgba(255,255,255,0.7)' }}>₹{week.budgets[type]?.toLocaleString?.()}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Day tabs */}
        <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl w-fit">
          {DAYS.map(d => {
            const dTasks   = [...(cfg.baseTasks[d] || []), ...(week.ws[d] || [])];
            const dIds     = [...dTasks.map(t => t.id), ...cfg.recurringTasks.map(t => t.id)];
            const savedDay = allProgress[activeWeek]?.days?.[d] || {};
            const dChecked = new Set(savedDay.checked || []);
            const dDone    = dIds.filter(id => dChecked.has(id)).length;
            const allDone  = dIds.length > 0 && dDone === dIds.length;
            return (
              <button key={d} onClick={() => setActiveDay(d)}
                className={clsx('flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all', activeDay === d ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                style={activeDay === d ? { color: platColor } : {}}>
                {d}{allDone && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
              </button>
            );
          })}
        </div>

        {/* Day content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT COLUMN */}
          <div className="space-y-4">

            {/* Progress + tasks */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-900">{activeDay} — Task Checklist</p>
                <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', pctDone === 100 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>{doneCount}/{totalCount}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-4 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctDone}%`, background: pctDone === 100 ? '#22c55e' : platColor }} />
              </div>

              {/* Base tasks */}
              {baseTasks.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Every Week</p>
                  <div className="space-y-1.5">
                    {baseTasks.map(t => (
                      <div key={t.id} onClick={() => toggleTask(t.id)}
                        className={clsx('flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all', checked[t.id] ? 'bg-green-50 border-green-200' : 'border-gray-100 hover:border-orange-200 hover:bg-orange-50/30')}>
                        <div className={clsx('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all', checked[t.id] ? 'bg-green-500 border-green-500' : 'border-gray-300')}>
                          {checked[t.id] && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={clsx('text-xs font-semibold text-gray-900 leading-relaxed', checked[t.id] && 'line-through text-gray-400')}>{t.text}</p>
                          {t.note && <p className="text-[10px] text-gray-400 italic mt-0.5">{t.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Week-specific tasks */}
              {wsTasks.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide mb-2">Week {activeWeek} Specific</p>
                  <div className="space-y-1.5">
                    {wsTasks.map(t => (
                      <div key={t.id} onClick={() => toggleTask(t.id)}
                        className={clsx('flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all', checked[t.id] ? 'bg-green-50 border-green-200' : 'border-indigo-100 bg-indigo-50/30 hover:border-indigo-300')}>
                        <div className={clsx('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all', checked[t.id] ? 'bg-green-500 border-green-500' : 'border-indigo-300')}>
                          {checked[t.id] && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={clsx('text-xs font-semibold text-gray-900 leading-relaxed', checked[t.id] && 'line-through text-gray-400')}>{t.text}</p>
                          {t.note && <p className="text-[10px] text-indigo-400 italic mt-0.5">{t.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {wsTasks.length === 0 && baseTasks.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No specific tasks for {activeDay} this week — focus on base tasks and daily constants.</p>
              )}
            </div>

            {/* Daily constants */}
            <div className="rounded-2xl p-4 border" style={{ background: platColor + '0d', borderColor: platColor + '30' }}>
              <p className="text-xs font-bold mb-3" style={{ color: platColor }}>🔄 Daily Constants (Every Day)</p>
              <div className="space-y-2">
                {cfg.recurringTasks.map(t => (
                  <div key={t.id} onClick={() => toggleTask(t.id)}
                    className={clsx('flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all', checked[t.id] ? 'border-green-200' : 'bg-white border-gray-100 hover:border-gray-300')}
                    style={checked[t.id] ? { background: platColor + '18' } : {}}>
                    <div className={clsx('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5', checked[t.id] ? 'bg-green-500 border-green-500' : '')}
                      style={!checked[t.id] ? { borderColor: platColor + '80' } : {}}>
                      {checked[t.id] && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div>
                      <p className={clsx('text-xs font-semibold text-gray-800', checked[t.id] && 'line-through text-gray-400')}>{t.text}</p>
                      <p className="text-[10px] text-gray-400 italic mt-0.5">{t.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Must complete */}
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
              <p className="text-xs font-bold text-orange-700 mb-3">✅ Must Complete Before EOD</p>
              <div className="space-y-1.5">
                {mustItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-orange-800">
                    <span className="mt-0.5 text-orange-500 font-black flex-shrink-0">→</span>
                    <span className="font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-700 mb-2">📝 Day Notes</p>
              <textarea value={notes} onChange={e => saveNotes(e.target.value)} rows={4} placeholder="Observations, anomalies, decisions, numbers to remember…"
                className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-4">

            {/* KPI entry */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-bold text-gray-900 mb-1">📊 Numbers Entry</p>
              <p className="text-[10px] text-gray-400 mb-4">Enter today's numbers — stop-loss alerts trigger automatically</p>
              <div className="space-y-2.5">
                {kpiFields.map(({ key, label, hint, placeholder }) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-32 flex-shrink-0">
                      <p className="text-[10px] font-bold text-gray-700">{label}</p>
                      <p className="text-[9px] font-semibold" style={{ color: platColor }}>{hint}</p>
                    </div>
                    <input type="number" step="0.01" placeholder={placeholder} value={kpi[key] || ''}
                      onChange={e => saveKpi({ ...kpi, [key]: e.target.value })}
                      className={clsx('flex-1 text-sm border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300', cfg.inputColor(key, kpi))} />
                  </div>
                ))}
              </div>
              {kpi.adSpend && kpi.adRevenue && parseFloat(kpi.adSpend) > 0 && (
                <div className="mt-4 p-3 rounded-xl flex gap-4 text-xs" style={{ background: platColor + '12' }}>
                  <div className="flex-1 text-center">
                    <p className="text-gray-500">ROAS</p>
                    <p className="text-base font-black" style={{ color: platColor }}>{(parseFloat(kpi.adRevenue) / parseFloat(kpi.adSpend)).toFixed(2)}×</p>
                  </div>
                  <div className="flex-1 text-center border-l border-gray-200">
                    <p className="text-gray-500">Net Ad P&L</p>
                    <p className={clsx('text-base font-black', parseFloat(kpi.adRevenue) - parseFloat(kpi.adSpend) >= 0 ? 'text-green-600' : 'text-red-600')}>
                      ₹{Math.abs(parseFloat(kpi.adRevenue) - parseFloat(kpi.adSpend)).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Hero & Watch SKUs — Amazon only */}
            {cfg.heroes && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-900 mb-3">🎯 Hero & Watch SKUs</p>
              <div className="space-y-2">
                {cfg.heroes.map(h => (
                  <div key={h.asin} className={clsx('flex items-start gap-2 p-2 rounded-xl border text-xs', h.type === 'hero' ? 'bg-orange-50 border-orange-100' : h.type === 'watch' ? 'bg-blue-50 border-blue-100' : 'bg-purple-50 border-purple-100')}>
                    <span className={clsx('font-black text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0', h.type === 'hero' ? 'bg-orange-200 text-orange-800' : h.type === 'watch' ? 'bg-blue-200 text-blue-800' : 'bg-purple-200 text-purple-800')}>{h.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 text-[11px]">{h.name}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">{h.asin} · {h.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Triggered conditions */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <button onClick={() => setShowTriggers(s => !s)} className="w-full flex items-center justify-between text-xs font-bold text-gray-900 mb-0">
                <span>⚡ Triggered Conditions ({cfg.triggeredConditions.length} Rules)</span>
                <span className="text-gray-400">{showTriggers ? '▲' : '▼'}</span>
              </button>
              {showTriggers && (
                <div className="mt-3 space-y-1.5">
                  {cfg.triggeredConditions.map(c => (
                    <div key={c.id} className={clsx('flex items-start gap-2 p-2 rounded-lg text-[10px] font-medium', c.level === 'red' ? 'bg-red-50 border border-red-100 text-red-700' : c.level === 'amber' ? 'bg-amber-50 border border-amber-100 text-amber-700' : 'bg-green-50 border border-green-100 text-green-700')}>
                      <span className="font-black flex-shrink-0">#{c.id}</span>
                      <span>{c.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex gap-2">
              <button onClick={resetDay}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-200 hover:border-red-200 hover:bg-red-50 text-gray-500 hover:text-red-500 text-xs font-bold rounded-xl transition-colors">
                <ArrowPathIcon className="w-3.5 h-3.5" /> Reset Day
              </button>
              <button onClick={exportDay}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
                style={{ background: platColor }}>
                <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Export Report
              </button>
            </div>
          </div>
        </div>

        {/* Saturday Scorecard */}
        {activeDay === 'Sat' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-gray-900">📋 Week {activeWeek} Scorecard</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Pre-fill for Sunday founder review</p>
              </div>
              <button onClick={exportScorecard}
                className="flex items-center gap-1.5 px-3 py-2 text-white text-xs font-bold rounded-xl transition-colors"
                style={{ background: platColor }}>
                <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Generate Scorecard
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cfg.scorecardFields.map(f => (
                <div key={f.key} className={f.ml ? 'sm:col-span-2' : ''}>
                  <label className="text-[10px] font-bold text-gray-600 block mb-1">{f.label}</label>
                  {f.ml ? (
                    <textarea rows={3} placeholder={f.ph} value={scorecard[f.key] || ''}
                      onChange={e => saveScorecard({ ...scorecard, [f.key]: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  ) : (
                    <input type="text" placeholder={f.ph} value={scorecard[f.key] || ''}
                      onChange={e => saveScorecard({ ...scorecard, [f.key]: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function MarketplaceDept() {
  const [activeTab, setActiveTab]       = useState('overview');
  const [activePlan, setActivePlan]     = useState('Amazon');
  const [showPlanDropdown, setShowPlanDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const { socket }   = useSocketStore();

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowPlanDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const refreshTasks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['marketplace', 'tasks'] });
  }, [queryClient]);

  useEffect(() => {
    if (!socket) return;
    socket.on('task_created', refreshTasks);
    socket.on('task_updated', refreshTasks);
    return () => { socket.off('task_created', refreshTasks); socket.off('task_updated', refreshTasks); };
  }, [socket, refreshTasks]);

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['marketplace', 'tasks', 'all'],
    queryFn: () => api.get('/marketplace/tasks?limit=200').then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  });
  const allTasks = useMemo(() => tasksData?.data || [], [tasksData]);

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#070c17] rounded-2xl border border-gray-200 shadow-sm px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#f97316' }}>Marketplace Operations</h1>
            <p className="text-sm text-gray-500">Platform-wise performance · {allTasks.length} active tasks</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium mr-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />{format(new Date(), 'EEE, dd MMM yyyy')}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button onClick={() => setActiveTab('overview')}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-bold transition-all', activeTab === 'overview' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700')}>
                  📊 Overview
                </button>
              </div>
              <div className="relative" ref={dropdownRef}>
                <button onClick={() => setShowPlanDropdown(s => !s)}
                  className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all', activeTab === 'plan' ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')}
                  style={activeTab === 'plan' ? { background: PLATFORM_PLAN_CONFIG[activePlan]?.color || '#f97316' } : {}}>
                  🗓️ {activeTab === 'plan' ? `${activePlan} Plan` : 'Platform Plans'} <span className="text-[10px] opacity-70">▾</span>
                </button>
                {showPlanDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 min-w-[170px]">
                    {PLATFORMS.map(p => {
                      const meta = PLATFORM_META[p];
                      const isActive = activePlan === p && activeTab === 'plan';
                      return (
                        <button key={p} onClick={() => { setActivePlan(p); setActiveTab('plan'); setShowPlanDropdown(false); }}
                          className={clsx('w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-gray-50 transition-colors', isActive ? 'bg-gray-50' : 'text-gray-600')}>
                          <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[9px] font-black flex-shrink-0" style={{ background: meta.color }}>{meta.initial}</span>
                          <span style={isActive ? { color: meta.color } : {}}>{p} Plan</span>
                          {isActive && <span className="ml-auto text-green-500 text-[10px] font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {activeTab === 'overview'
        ? <OverviewTab allTasks={allTasks} tasksLoading={tasksLoading} navigate={navigate} />
        : <PlanTab platform={activePlan} />
      }
    </div>
  );
}
