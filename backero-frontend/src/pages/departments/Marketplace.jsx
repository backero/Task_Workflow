import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, addDays } from 'date-fns';
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

function lsKey(w, d, id)  { return `mkt_w${w}_d${d}_t${id}`; }
function lsNotes(w, d)    { return `mkt_w${w}_d${d}_notes`; }
function lsKpi(w, d)      { return `mkt_w${w}_d${d}_kpi`; }
function lsBudget(w)      { return `mkt_w${w}_budget`; }
function lsScorecard(w)   { return `mkt_w${w}_scorecard`; }

function getWeekDays() {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { label: format(d, 'EEE'), date: format(d, 'yyyy-MM-dd') };
  });
}

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

function WeekBar({ label, value, maxVal, isToday }) {
  const pct = maxVal > 0 ? Math.min((value / maxVal) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={clsx('text-xs font-semibold w-8 flex-shrink-0', isToday ? 'text-orange-600' : 'text-gray-500')}>{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden relative">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#f97316,#fb923c)' }} />
        {value > 0 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-700">{value}%</span>}
      </div>
      <span className={clsx('text-xs font-bold w-8 text-right', value > 0 ? 'text-orange-600' : 'text-gray-300')}>{value}%</span>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ allTasks, tasksLoading, navigate }) {
  const [activePlatform, setActivePlatform] = useState(null);
  const [form, setForm]     = useState({ totalSales: '', ctr: '', cvr: '', adSpend: '', adRevenue: '', returns: '', worstSkuCvr: '', notes: '' });
  const [formSaved, setFormSaved] = useState(false);
  const queryClient = useQueryClient();

  const { data: todayEntry } = useQuery({ queryKey: ['marketplace', 'daily', 'today'], queryFn: () => api.get('/marketplace/daily/today').then(r => r.data.entry) });
  const { data: weekData }   = useQuery({ queryKey: ['marketplace', 'daily', 'week'],  queryFn: () => api.get('/marketplace/daily/week').then(r => r.data), refetchInterval: 5 * 60 * 1000 });

  useEffect(() => {
    if (todayEntry) {
      setForm({ totalSales: todayEntry.totalSales ?? '', ctr: todayEntry.ctr ?? '', cvr: todayEntry.cvr ?? '', adSpend: todayEntry.adSpend ?? '', adRevenue: todayEntry.adRevenue ?? '', returns: todayEntry.returns ?? '', worstSkuCvr: todayEntry.worstSkuCvr ?? '', notes: todayEntry.notes || '' });
      setFormSaved(true);
    }
  }, [todayEntry]);

  const saveMutation = useMutation({
    mutationFn: (data) => api.post('/marketplace/daily', data).then(r => r.data),
    onSuccess: () => {
      toast.success('Numbers saved!');
      setFormSaved(true);
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'daily'] });
      queryClient.refetchQueries({ queryKey: ['marketplace', 'daily', 'week'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  const byPlatform   = useMemo(() => groupByPlatform(allTasks), [allTasks]);
  const displayTasks = activePlatform ? byPlatform[activePlatform] || [] : allTasks;
  const weekDays     = getWeekDays();
  const weekEntries  = weekData?.entries || [];
  const entryByDate  = Object.fromEntries(weekEntries.map(e => [format(new Date(e.date), 'yyyy-MM-dd'), e]));
  const weekBars     = weekDays.map(d => ({ label: d.label, value: entryByDate[d.date] ? Number(entryByDate[d.date].cvr) : 0, isToday: d.date === format(new Date(), 'yyyy-MM-dd') }));
  const maxCvr       = Math.max(...weekBars.map(b => b.value), 1);
  const roas         = form.adSpend > 0 ? (Number(form.adRevenue) / Number(form.adSpend)).toFixed(2) : null;
  const netRev       = (form.adRevenue && form.adSpend) ? Number(form.adRevenue) - Number(form.adSpend) : null;

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
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📊</span>
              <h3 className="font-bold text-gray-900 text-sm">Today's Numbers</h3>
              {formSaved && <span className="ml-auto text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircleIcon className="w-3.5 h-3.5" /> Saved</span>}
            </div>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'totalSales', label: 'Sales Today',   placeholder: '5' },
                  { key: 'ctr',        label: 'CTR %',         placeholder: '1.12' },
                  { key: 'cvr',        label: 'CVR %',         placeholder: '3.90' },
                  { key: 'returns',    label: 'Returns',       placeholder: '0' },
                  { key: 'adSpend',    label: 'Ad Spend ₹',   placeholder: '100' },
                  { key: 'adRevenue',  label: 'Ad Revenue ₹', placeholder: '350' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">{label}</label>
                    <input type="number" min="0" step="0.01" placeholder={placeholder} value={form[key]}
                      onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setFormSaved(false); }}
                      className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                ))}
              </div>
              {(roas || netRev !== null) && (
                <div className="flex gap-3 p-2.5 bg-orange-50 rounded-xl text-xs">
                  {roas && <div className="flex-1 text-center"><p className="text-gray-500">ROAS</p><p className="font-bold text-orange-700 text-base">{roas}×</p></div>}
                  {netRev !== null && <div className="flex-1 text-center border-l border-orange-100"><p className="text-gray-500">Net Revenue</p><p className={clsx('font-bold text-base', netRev >= 0 ? 'text-green-600' : 'text-red-600')}>₹{Math.abs(netRev).toLocaleString()}</p></div>}
                </div>
              )}
              <button type="submit" disabled={saveMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: saveMutation.isPending ? '#fdba74' : '#f97316' }}>
                {saveMutation.isPending ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : '💾'}
                {saveMutation.isPending ? 'Saving…' : 'Save Numbers'}
              </button>
            </form>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📈</span>
              <h3 className="font-bold text-gray-900 text-sm">This Week's CVR</h3>
            </div>
            <div className="space-y-2.5">{weekBars.map(b => <WeekBar key={b.label} label={b.label} value={b.value} maxVal={maxCvr} isToday={b.isToday} />)}</div>
            {weekEntries.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[10px] text-gray-400">Avg CVR</p><p className="text-sm font-bold text-orange-600">{(weekEntries.reduce((s, e) => s + e.cvr, 0) / weekEntries.length).toFixed(2)}%</p></div>
                <div><p className="text-[10px] text-gray-400">Total Sales</p><p className="text-sm font-bold text-gray-800">{weekEntries.reduce((s, e) => s + e.totalSales, 0)}</p></div>
                <div><p className="text-[10px] text-gray-400">Returns</p><p className="text-sm font-bold text-red-600">{weekEntries.reduce((s, e) => s + e.returns, 0)}</p></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 12-Week Plan Tab ──────────────────────────────────────────────────────────

function PlanTab() {
  const [activeWeek, setActiveWeek] = useState(1);
  const [activeDay,  setActiveDay]  = useState('Mon');
  const [budget,     setBudget]     = useState('base');
  const [checked,    setChecked]    = useState({});
  const [kpi,        setKpi]        = useState(EMPTY_KPI);
  const [notes,      setNotes]      = useState('');
  const [scorecard,  setScorecard]  = useState({});
  const [showTriggers, setShowTriggers] = useState(false);
  const [, forceUpdate] = useState(0);

  const week       = WEEK_DATA[activeWeek - 1];
  const baseTasks  = BASE_TASKS[activeDay] || [];
  const wsTasks    = week?.ws[activeDay] || [];
  const allDayTasks = [...baseTasks, ...wsTasks];
  const mustItems  = MUST_COMPLETE[activeDay] || [];

  useEffect(() => {
    const newChecked = {};
    allDayTasks.forEach(t => { newChecked[t.id] = localStorage.getItem(lsKey(activeWeek, activeDay, t.id)) === '1'; });
    RECURRING_TASKS.forEach(t => { newChecked[t.id] = localStorage.getItem(lsKey(activeWeek, activeDay, t.id)) === '1'; });
    setChecked(newChecked);
    const savedKpi = localStorage.getItem(lsKpi(activeWeek, activeDay));
    setKpi(savedKpi ? JSON.parse(savedKpi) : EMPTY_KPI);
    setNotes(localStorage.getItem(lsNotes(activeWeek, activeDay)) || '');
    const savedBudget = localStorage.getItem(lsBudget(activeWeek));
    if (savedBudget) setBudget(savedBudget);
    const savedSC = localStorage.getItem(lsScorecard(activeWeek));
    if (savedSC) setScorecard(JSON.parse(savedSC));
  }, [activeWeek, activeDay]);

  const toggleTask = (id) => {
    const newVal = !checked[id];
    setChecked(p => ({ ...p, [id]: newVal }));
    localStorage.setItem(lsKey(activeWeek, activeDay, id), newVal ? '1' : '0');
  };

  const saveKpi = (newKpi) => {
    setKpi(newKpi);
    localStorage.setItem(lsKpi(activeWeek, activeDay), JSON.stringify(newKpi));
  };

  const saveNotes = (v) => {
    setNotes(v);
    localStorage.setItem(lsNotes(activeWeek, activeDay), v);
  };

  const selectBudget = (type) => {
    setBudget(type);
    localStorage.setItem(lsBudget(activeWeek), type);
  };

  const saveScorecard = (newSC) => {
    setScorecard(newSC);
    localStorage.setItem(lsScorecard(activeWeek), JSON.stringify(newSC));
  };

  const resetDay = () => {
    allDayTasks.forEach(t => localStorage.removeItem(lsKey(activeWeek, activeDay, t.id)));
    RECURRING_TASKS.forEach(t => localStorage.removeItem(lsKey(activeWeek, activeDay, t.id)));
    localStorage.removeItem(lsKpi(activeWeek, activeDay));
    localStorage.removeItem(lsNotes(activeWeek, activeDay));
    setChecked({}); setKpi(EMPTY_KPI); setNotes('');
    forceUpdate(n => n + 1);
  };

  const exportDay = () => {
    const lines = [
      `TREYFA × AMAZON — Week ${activeWeek}: ${week.title} — ${activeDay}`,
      `NON-NEGOTIABLE: ${week.nonNeg}`,
      '',
      '── BASE TASKS ──',
      ...baseTasks.map(t => `[${checked[t.id] ? '✓' : ' '}] ${t.text}`),
      '',
      '── WEEK-SPECIFIC TASKS ──',
      ...wsTasks.map(t => `[${checked[t.id] ? '✓' : ' '}] ${t.text}`),
      '',
      '── DAILY CONSTANTS ──',
      ...RECURRING_TASKS.map(t => `[${checked[t.id] ? '✓' : ' '}] ${t.text}`),
      '',
      '── KPIs ──',
      `Units: ${kpi.units}   Sessions: ${kpi.sessions}   CTR: ${kpi.ctr}%   CVR: ${kpi.cvr}%`,
      `ACOS: ${kpi.acos}%   Reviews: ${kpi.reviews}   Ad Spend: ₹${kpi.adSpend}   Ad Revenue: ₹${kpi.adRevenue}`,
      `FBA Stock: ${kpi.fbaStock} days   Cum P&L: ₹${kpi.cumPnl}`,
      '',
      '── NOTES ──',
      notes || '(none)',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `treyfa-amazon-w${activeWeek}-${activeDay.toLowerCase()}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportScorecard = () => {
    const lines = [
      `TREYFA × AMAZON — WEEK ${activeWeek} SCORECARD`,
      `Week Theme: ${week.title}`,
      '',
      ...SCORECARD_FIELDS.map(f => `${f.label}: ${scorecard[f.key] || '—'}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `treyfa-scorecard-w${activeWeek}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const allIds    = [...allDayTasks.map(t => t.id), ...RECURRING_TASKS.map(t => t.id)];
  const doneCount = allIds.filter(id => checked[id]).length;
  const totalCount= allIds.length;
  const pctDone   = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const stopLoss  = evalStopLoss(kpi);
  const triggers  = evalTriggers(kpi);

  const KPI_FIELDS = [
    { key: 'units',    label: 'Units Sold',       hint: 'Target varies by week', placeholder: '0' },
    { key: 'sessions', label: 'Sessions',          hint: 'Total visits today',    placeholder: '0' },
    { key: 'ctr',      label: 'CTR Hero #1 (%)',   hint: 'SAFE ≥1.25%',          placeholder: '0.00' },
    { key: 'cvr',      label: 'CVR Overall (%)',   hint: 'SAFE ≥10%',            placeholder: '0.00' },
    { key: 'acos',     label: 'ACOS Worst (%)',    hint: 'DANGER >70%',          placeholder: '0.00' },
    { key: 'adSpend',  label: 'Ad Spend ₹',       hint: `Budget: ₹${week?.budgets[budget]?.toLocaleString()}`, placeholder: '0' },
    { key: 'adRevenue',label: 'Ad Revenue ₹',     hint: 'From Sponsored Products', placeholder: '0' },
    { key: 'reviews',  label: 'Reviews Posted',    hint: 'This week total',      placeholder: '0' },
    { key: 'fbaStock', label: 'FBA Stock Days',    hint: 'DANGER <7 days',       placeholder: '0' },
    { key: 'cumPnl',   label: 'Cum. Net P&L ₹',  hint: 'DANGER < −₹15,000',    placeholder: '0' },
  ];

  const inputColor = (key) => {
    if (key === 'acos'     && parseFloat(kpi[key]) > 70)    return 'border-red-300 bg-red-50';
    if (key === 'acos'     && parseFloat(kpi[key]) >= 40)   return 'border-amber-300 bg-amber-50';
    if (key === 'cvr'      && parseFloat(kpi[key]) < 7  && kpi[key]) return 'border-red-300 bg-red-50';
    if (key === 'cvr'      && parseFloat(kpi[key]) < 10 && kpi[key]) return 'border-amber-300 bg-amber-50';
    if (key === 'ctr'      && parseFloat(kpi[key]) < 1.0 && kpi[key]) return 'border-red-300 bg-red-50';
    if (key === 'ctr'      && parseFloat(kpi[key]) < 1.25 && kpi[key]) return 'border-amber-300 bg-amber-50';
    if (key === 'fbaStock' && parseFloat(kpi[key]) < 7  && kpi[key]) return 'border-red-300 bg-red-50';
    if (key === 'fbaStock' && parseFloat(kpi[key]) < 14 && kpi[key]) return 'border-amber-300 bg-amber-50';
    if (key === 'cumPnl'   && parseFloat(kpi[key]) < -15000) return 'border-red-300 bg-red-50';
    if (key === 'cumPnl'   && parseFloat(kpi[key]) < -5000)  return 'border-amber-300 bg-amber-50';
    return 'border-gray-200';
  };

  return (
    <div className="flex gap-4 min-h-screen items-start">
      {/* Week sidebar */}
      <div className="w-44 flex-shrink-0 space-y-1 sticky top-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">12-Week Plan</p>
        {WEEK_DATA.map(w => {
          const isActive = w.n === activeWeek;
          return (
            <button key={w.n} onClick={() => { setActiveWeek(w.n); setActiveDay('Mon'); }}
              className={clsx('w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all border', isActive ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:bg-orange-50')}>
              <span className={clsx('text-[10px]', isActive ? 'text-orange-200' : 'text-gray-400')}>W{w.n}</span>
              <p className="truncate">{w.title}</p>
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">

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
                <span className="text-xs font-bold text-orange-500 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">Week {week.n}</span>
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
                {['conservative', 'base', 'aggressive'].map(type => (
                  <button key={type} onClick={() => selectBudget(type)}
                    className={clsx('px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all', budget === type ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-orange-300')}>
                    <p className="capitalize">{type}</p>
                    <p className={budget === type ? 'text-orange-100' : 'text-orange-500'}>₹{week.budgets[type].toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Day tabs */}
        <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl w-fit">
          {DAYS.map(d => {
            const dTasks = [...(BASE_TASKS[d] || []), ...(week.ws[d] || [])];
            const dIds   = [...dTasks.map(t => t.id), ...RECURRING_TASKS.map(t => t.id)];
            const dDone  = dIds.filter(id => localStorage.getItem(lsKey(activeWeek, d, id)) === '1').length;
            const allDone = dIds.length > 0 && dDone === dIds.length;
            return (
              <button key={d} onClick={() => setActiveDay(d)}
                className={clsx('flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all', activeDay === d ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
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
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctDone}%`, background: pctDone === 100 ? '#22c55e' : '#f97316' }} />
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
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-xs font-bold text-blue-700 mb-3">🔄 Daily Constants (Every Day)</p>
              <div className="space-y-2">
                {RECURRING_TASKS.map(t => (
                  <div key={t.id} onClick={() => toggleTask(t.id)}
                    className={clsx('flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all', checked[t.id] ? 'bg-blue-100 border-blue-200' : 'bg-white border-blue-100 hover:border-blue-300')}>
                    <div className={clsx('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5', checked[t.id] ? 'bg-blue-500 border-blue-500' : 'border-blue-300')}>
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
                {KPI_FIELDS.map(({ key, label, hint, placeholder }) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-32 flex-shrink-0">
                      <p className="text-[10px] font-bold text-gray-700">{label}</p>
                      <p className="text-[9px] text-orange-500 font-semibold">{hint}</p>
                    </div>
                    <input type="number" step="0.01" placeholder={placeholder} value={kpi[key]}
                      onChange={e => saveKpi({ ...kpi, [key]: e.target.value })}
                      className={clsx('flex-1 text-sm border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400', inputColor(key))} />
                  </div>
                ))}
              </div>
              {kpi.adSpend && kpi.adRevenue && parseFloat(kpi.adSpend) > 0 && (
                <div className="mt-4 p-3 bg-orange-50 rounded-xl flex gap-4 text-xs">
                  <div className="flex-1 text-center">
                    <p className="text-gray-500">ROAS</p>
                    <p className="text-base font-black text-orange-700">{(parseFloat(kpi.adRevenue) / parseFloat(kpi.adSpend)).toFixed(2)}×</p>
                  </div>
                  <div className="flex-1 text-center border-l border-orange-100">
                    <p className="text-gray-500">Net Ad P&L</p>
                    <p className={clsx('text-base font-black', parseFloat(kpi.adRevenue) - parseFloat(kpi.adSpend) >= 0 ? 'text-green-600' : 'text-red-600')}>
                      ₹{Math.abs(parseFloat(kpi.adRevenue) - parseFloat(kpi.adSpend)).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Hero & Watch SKUs */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-900 mb-3">🎯 Hero & Watch SKUs</p>
              <div className="space-y-2">
                {HEROES_DATA.map(h => (
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

            {/* Triggered conditions */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <button onClick={() => setShowTriggers(s => !s)} className="w-full flex items-center justify-between text-xs font-bold text-gray-900 mb-0">
                <span>⚡ Triggered Conditions (15 Rules)</span>
                <span className="text-gray-400">{showTriggers ? '▲' : '▼'}</span>
              </button>
              {showTriggers && (
                <div className="mt-3 space-y-1.5">
                  {TRIGGERED_CONDITIONS.map(c => (
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
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
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
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl transition-colors">
                <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Generate Scorecard
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SCORECARD_FIELDS.map(f => (
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
  const [activeTab, setActiveTab] = useState('overview');
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const { socket }   = useSocketStore();

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
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 shadow-sm px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#f97316' }}>Marketplace Operations</h1>
            <p className="text-sm text-gray-500">Platform-wise performance · {allTasks.length} active tasks</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium mr-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />{format(new Date(), 'EEE, dd MMM yyyy')}
            </span>
            <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
              {[{ id: 'overview', label: '📊 Overview' }, { id: 'plan', label: '🗓️ Amazon Plan' }].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-bold transition-all', activeTab === tab.id ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700')}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {activeTab === 'overview'
        ? <OverviewTab allTasks={allTasks} tasksLoading={tasksLoading} navigate={navigate} />
        : <PlanTab />
      }
    </div>
  );
}
