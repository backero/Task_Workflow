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
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DASH_KEY_PARSERS = {
  Amazon:   /^ta_w(\d+)_([A-Za-z]+)_numbers$/,
  Flipkart: /^treyfa_w(\d+)_([A-Za-z]+)_numbers$/,
  Meesho:   /^meesho_w(\d+)_([A-Za-z]+)_numbers$/,
  Myntra:   /^tm_w(\d+)_([A-Za-z]+)_numbers$/,
  Snapdeal: /^snapdeal_numbers_(\d+)_([A-Za-z]+)$/,
  JioMart:  /^v32_w(\d+)_([A-Za-z]+)_numbers$/,
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
const EMPTY_KPI = { units: '', sessions: '', unitSession: '', adSpend: '', adRevenue: '', acos: '', returns: '' };

// ── Base tasks per weekday (same every week) ──────────────────────────────────

const BASE_TASKS = {
  Mon: [
    { id: 'b1', text: 'Pull all weekend data (Sat+Sun): sessions, CVR, ad spend, ACOS, return count for all active SKUs — write in log', note: '' },
    { id: 'b2', text: '15-min founder call before 11:30 AM — lock the week\'s 5 priorities in writing', note: '' },
    { id: 'b3', text: 'Deep work on Hero-1: ship ONE live listing change (title, bullets, A+ content, or main image) — must be live by 7 PM', note: '' },
    { id: 'b4', text: 'Run Search Term Report from last week — identify top 3 converting keywords and worst 3 ACOS keywords', note: '' },
    { id: 'b5', text: '(Week 3+) Pause any keyword that spent ₹100+ over the weekend with zero conversions', note: '' },
    { id: 'b6', text: 'Review any A-to-Z claims or SAFE-T claims opened since Friday — respond within 24 hours', note: '' },
  ],
  Tue: [
    { id: 'b1', text: 'Deep work on Hero-2: ship this week\'s live listing change', note: '' },
    { id: 'b2', text: '(Week 1-2) Merge or suppress duplicate ASINs; check brand registry hijacker alerts', note: '' },
    { id: 'b3', text: '(Week 3+) Fix ONE Watch-6 SKU — rewrite title, all 5 bullets, and at least 1 image', note: '' },
    { id: 'b4', text: 'Launch this week\'s A/B test via Manage Your Experiments — write hypothesis in log', note: '' },
    { id: 'b5', text: '(Week 3+) Bid adjustments: add negative keywords from STR; adjust keyword bids on Hero-2 SP campaign', note: '' },
    { id: 'b6', text: '(Week 4+) Virtual bundle check: verify bundle ASIN has correct components, images, and pricing reflects saving', note: '' },
  ],
  Wed: [
    { id: 'b1', text: 'Deep work on Hero-3: ship live listing change', note: '' },
    { id: 'b2', text: 'Brief review agency (30-45 min): which ASINs, Vine/Early Reviewer enrollments, 3 writing angles — DO NOT brief on content (Amazon ToS violation risk)', note: '' },
    { id: 'b3', text: '(Week 2+) Check Vine enrollment status', note: '' },
    { id: 'b4', text: '(Week 4+) Cross-ASIN linking: confirm Frequently Bought Together and SP cross-targeting set up correctly', note: '' },
    { id: 'b5', text: '(Week 3+) Check SP and SB campaign performance Mon-Tue. Flag ACOS >40%. Consider budget increase if ACOS <20% and CVR strong.', note: '' },
    { id: 'b6', text: 'Backend keyword refresh on today\'s Hero ASIN: Search Terms, Subject Matter, Other Attributes — 250-byte maximum', note: '' },
    { id: 'b7', text: '(Week 2+) FBA inventory check: all Hero and Gem ASINs must have 21-day cover. Raise restock alert to founder if any is under.', note: '' },
  ],
  Thu: [
    { id: 'b1', text: '(Week 3+) ACOS deep dive: open every active SP, SB, SD campaign. List top 3 converting placements and 3 worst ACOS placements.', note: '' },
    { id: 'b2', text: '(Week 3+) Bid adjustments: push budget to top converters. Throttle/pause worst ACOS placements.', note: '' },
    { id: 'b3', text: '(Week 5+) Gems CVR review: check unit session % trend for all Gem ASINs over past 4 days. Flag weakening CVR for Watch-6 demotion.', note: '' },
    { id: 'b4', text: 'Bundle price check: saving vs single items must be visible and at least 10-15%. Verify on desktop and mobile.', note: '' },
    { id: 'b5', text: 'Watch-6 SKU 4-day check: did Tuesday\'s fix move the needle? Improved → shortlist. Flat → return to Cold Rest.', note: '' },
    { id: 'b6', text: 'Returns audit: read all return reasons from past 7 days. Route patterns (packaging damage, wrong item, quality issues) to Friday\'s fix queue.', note: '' },
    { id: 'b7', text: 'Q&A second sweep — Thursday pre-weekend buyers are high-intent', note: '' },
  ],
  Fri: [
    { id: 'b1', text: 'Competitor scan (45 min, formal): top 5 competitors — price changes, BSR rank, badge status, review count change vs last Friday, new A+/listing updates. Write dated log.', note: '' },
    { id: 'b2', text: 'Special deep scan: highest-impression ASIN — check top 10 competitors on exact search query driving most sessions. Update surgery notes.', note: '' },
    { id: 'b3', text: 'FBA stock check: BOTH inbound shipment status AND current sellable inventory. Flag any ASIN below 14 days to founder TODAY.', note: '' },
    { id: 'b4', text: 'Deploy ALL listing changes prepared this week. Nothing stays in draft after 7 PM.', note: '' },
    { id: 'b5', text: '(Week 2+) Reviews check: confirm weekly review velocity on track. Check Request-a-Review send rate. Follow up with agency if behind.', note: '' },
    { id: 'b6', text: '(Week 3+) Weekend ad bid boost: increase bids on Hero ASINs with strong CVR. Set daily budget caps on underperformers.', note: '' },
    { id: 'b7', text: 'Check brand storefront on mobile and desktop. Verify any deal or coupon badge is showing correctly.', note: '' },
  ],
  Sat: [
    { id: 'b1', text: 'Operations check: FBA — verify all orders dispatched on time. Check IPI score in Seller Central. Self-ship SKUs: 1-in-10 physical QC.', note: '' },
    { id: 'b2', text: 'Inventory verification: cross-check FBA sellable units in Seller Central with restock tracker spreadsheet', note: '' },
    { id: 'b3', text: '(Week 4+) Virtual bundle audit: all bundle ASINs rendering correctly, pricing accurate, cross-link from individual PDPs is live', note: '' },
    { id: 'b4', text: 'Write weekly scoreboard and send to founder BEFORE 6 PM: units sold vs target, ACOS by campaign type, BSR movement on Hero ASINs, review count delta, returns, top 3 wins, top 3 misses, one founder decision needed', note: '' },
    { id: 'b5', text: 'Archive weekly log. Write Monday prep note.', note: '' },
    { id: 'b6', text: '(Every other Saturday) Review account health dashboard in Seller Central: late shipment rate, cancellation rate, policy warning changes', note: '' },
  ],
};

// ── Must-complete checklist per weekday ───────────────────────────────────────

const MUST_COMPLETE = {
  Mon: ['Written week priorities shared with founder', 'One live change on Hero-1', 'Search Term Report reviewed — top/bottom 3 identified', '(Week 3+) Underperforming keywords paused'],
  Tue: ['Hero-2 has one live change', 'Catalog deduplication / Watch-6 fix done', 'A/B test running (or documented if not enrolled)', '(Week 3+) Negative keywords added'],
  Wed: ['Hero-3 has one live change', 'Review process triggered correctly (no ToS risk)', 'Backend keywords refreshed on today\'s Hero ASIN', '(Week 2+) FBA inventory check done'],
  Thu: ['(Week 3+) ACOS deep dive with top/bottom 3 documented', 'Bids adjusted', 'Bundle prices and savings verified', '(Week 5+) Gems CVR trajectory documented', 'Watch-6 4-day decision made', 'Return patterns routed'],
  Fri: ['Dated competitor log written', 'High-impression ASIN competitor scan done', 'FBA stock confirmed — founder alerted if any ASIN under 14 days', 'ALL listing changes live', '(Week 2+) Review velocity confirmed', '(Week 3+) Weekend bids locked', 'Storefront verified on mobile'],
  Sat: ['FBA dispatch verification done', 'IPI score checked', 'FBA stock cross-verified', '(Week 4+) Bundle audit complete', 'Scoreboard sent before 6 PM', 'Log archived', '(Every other Saturday) Account health dashboard checked'],
};

// ── Hero & Watch SKUs ─────────────────────────────────────────────────────────

const HEROES_DATA = [
  { asin: 'B0F2JD3RC1', name: 'Neem Anti-Dandruff Shampoo 100ml',     label: 'Hero #1',  type: 'hero',   note: 'Unit Session % target ≥4% · Stop-Loss Rule 1 applies' },
  { asin: 'B0F66J4RPQ', name: 'Coconut Curry Leaves Hair Oil 200ml',   label: 'Hero #2',  type: 'hero',   note: 'Page-1 push from W5' },
  { asin: '(TBD)',       name: 'Coconut Curry Leaves Hair Oil 100ml',   label: 'Hero #3',  type: 'hero',   note: 'Dedicated campaign from W9' },
  { asin: 'B0F4XXC6ZG', name: 'Choco Coffee Face Wash 100ml',          label: 'Watch #1', type: 'watch',  note: 'Promote to Gem if CVR ≥12% by W5' },
  { asin: '(TBD)',       name: 'Hibiscus Chamomile Shampoo 100ml',      label: 'Watch #2', type: 'watch',  note: 'Promotion decision by W8' },
  { asin: 'B0F5BVYW3X', name: 'Neem Vitamin C Face Wash 150ml',        label: 'Watch #3', type: 'watch',  note: 'CVR sleeper — decision by W11' },
  { asin: '(Bundle)',    name: 'Hero #1 + Hero #2',                     label: 'Bundle',   type: 'bundle', note: '10-15% saving vs individual · Live from W4' },
];

// ── Triggered conditions ──────────────────────────────────────────────────────

const TRIGGERED_CONDITIONS = [
  { id: 1,  level: 'red',   text: 'STOP-LOSS RULE 1: Any Hero/Gem SKU unit session % drops below 4% for 2 consecutive days → STOP all image and ad changes. Fix listing content FIRST.' },
  { id: 2,  level: 'red',   text: 'STOP-LOSS RULE 2: Any ad campaign ACOS exceeds 40% for 5 consecutive days → PAUSE the campaign immediately. No exceptions.' },
  { id: 3,  level: 'red',   text: 'STOP-LOSS RULE 3: Any FBA SKU inventory cover drops below 21 days → raise restock alert to founder TODAY. FBA stockouts trigger 30-60 day ranking penalties.' },
  { id: 4,  level: 'red',   text: 'AMAZON ALERT: Seller Health score drops OR Amazon policy warning received → escalate to founder within 1 HOUR. Do not wait for end of day.' },
  { id: 5,  level: 'red',   text: 'Hero/Gem listing suppressed → find reason same day, fix and resubmit. Do not wait.' },
  { id: 6,  level: 'amber', text: 'FBA stock below 14 days on any ASIN → alert founder TODAY. Target minimum 21-day cover.' },
  { id: 7,  level: 'amber', text: 'Unit session % below 4% (day 1) → monitor closely. If day 2 also below 4% → Stop-Loss Rule 1 fires.' },
  { id: 8,  level: 'amber', text: 'ACOS above 40% (days 1-4) → flag campaign. If day 5 still >40% → Stop-Loss Rule 2 fires — pause immediately.' },
  { id: 9,  level: 'amber', text: 'A-to-Z claim or SAFE-T claim opened → respond within 24 hours. Respond to every new review (1-3 star: try private resolution first).' },
  { id: 10, level: 'green', text: 'ACOS below 20% AND CVR is strong → eligible for budget increase on this campaign. Consider scaling.' },
  { id: 11, level: 'green', text: 'Any Hero crosses 30 reviews → apply Sponsored Brands + raise Manual EXACT bids +15%' },
  { id: 12, level: 'green', text: 'Vine reviews start posting → integrate review language into A+ content and bullets within 48 hours' },
  { id: 13, level: 'green', text: 'Any Hero crosses 50 reviews → check Amazon\'s Choice eligibility + raise bids +10%' },
];

// ── Saturday scorecard fields ─────────────────────────────────────────────────

const SCORECARD_FIELDS = [
  { key: 'units',       label: 'Units Sold',                  ph: '0' },
  { key: 'target',      label: 'Weekly Target',               ph: '0' },
  { key: 'sessions',    label: 'Sessions (Week Total)',        ph: '0' },
  { key: 'unitSession', label: 'Avg Unit Session % (CVR)',    ph: '0.00' },
  { key: 'adSpend',     label: 'Total Ad Spend (₹)',          ph: '0' },
  { key: 'adRevenue',   label: 'Total Ad Revenue (₹)',        ph: '0' },
  { key: 'acosSp',      label: 'ACOS — SP Campaigns (%)',     ph: '0.00' },
  { key: 'acosSb',      label: 'ACOS — SB Campaigns (%)',     ph: '0.00' },
  { key: 'bsrHero1',    label: 'BSR Movement — Hero #1',      ph: 'e.g. 1200 → 850' },
  { key: 'bsrHero2',    label: 'BSR Movement — Hero #2',      ph: 'e.g. 2500 → 2100' },
  { key: 'reviewDelta', label: 'Review Count Delta',          ph: '+ or − reviews this week' },
  { key: 'returns',     label: 'Returns This Week',           ph: '0' },
  { key: 'fbaStatus',   label: 'FBA Stock Status',            ph: 'OK / Low / Critical' },
  { key: 'adPath',      label: 'Ad Path Next Week',           ph: 'Conservative / Base / Aggressive' },
  { key: 'wins',        label: 'Top 3 Wins',                  ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'misses',      label: 'Top 3 Misses',                ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'decision',    label: 'Founder Decision Needed',     ph: '...', ml: true },
  { key: 'stopLoss',    label: 'Stop-Loss Rule Triggered?',   ph: 'None / Rule #1 / Rule #2 / Rule #3' },
];

// ── Treyfa Amazon 12-Week Operations Plan ─────────────────────────────────────

const WEEK_DATA = [
  {
    n: 1, title: 'ACCOUNT & CATALOG SETUP', desc: 'Launch account, declare Hero/Gem/Watch-6 tiers, catalog audit and cleanup',
    nonNeg: 'All Hero ASINs live, indexed, and Buy Box 100% by Thursday',
    budgets: { conservative: 0, base: 0, aggressive: 0 },
    ws: {
      Mon: [
        { id: 1, text: 'Audit all active ASINs: declare Hero, Gem, Watch-6 tiers. Decision: CVR ≥8% + good images + 10+ reviews target = Hero', note: '' },
        { id: 2, text: 'Confirm all Hero ASINs: live, in stock, Buy Box 100%', note: '' },
      ],
      Tue: [
        { id: 1, text: 'Catalog cleanup: merge duplicate ASINs, check brand registry hijacker alerts', note: 'Week 1-2 task' },
        { id: 2, text: 'Backend keyword fill (250 chars): misspellings, Hindi/Tamil words, long-tails for each Hero ASIN', note: '' },
      ],
      Wed: [
        { id: 1, text: 'Brand Registry enrollment if not done — required for A+, Vine, Sponsored Brands', note: '' },
        { id: 2, text: 'Submit Brand Store for review', note: 'Approval takes 3-7 business days' },
      ],
      Thu: [
        { id: 1, text: 'Q&A seeding round 1: 3-5 questions per Hero ASIN from friends/family', note: 'Focus: ingredients, size, smell, results' },
        { id: 2, text: 'Set up packaging insert: QR → review request (1 QR, 1 ask, 1 benefit)', note: '' },
      ],
      Fri: [{ id: 1, text: 'Build competitor tracking sheet: 5 rivals per Hero — ASIN, price, reviews, BSR, badges, Prime status', note: '' }],
      Sat: [{ id: 1, text: 'Bookmark key Seller Central reports: Business Reports, Campaign Manager, FBA Dashboard, Account Health', note: '' }],
    },
  },
  {
    n: 2, title: 'LISTING QUALITY LOCK', desc: 'All hero listings at maximum quality before ad spend begins',
    nonNeg: 'All 3 Hero listings: 7+ images, A+ content submitted, backend keywords 250 chars filled',
    budgets: { conservative: 0, base: 0, aggressive: 0 },
    ws: {
      Mon: [{ id: 1, text: 'Listing quality audit: title (200 chars max), 5 bullets (200+ chars each), 7+ images, A+ content status', note: '' }],
      Tue: [
        { id: 1, text: 'Upgrade Hero-1 main image: white background, product fills 85% of frame, readable text at thumbnail size', note: '' },
        { id: 2, text: 'Create virtual bundle: Hero #1 + Hero #2 with 10-15% saving clearly shown', note: '' },
      ],
      Wed: [
        { id: 1, text: 'Check Vine enrollment eligibility for Hero-1: Brand Registry enrolled, FBA active, eligible category', note: '' },
        { id: 2, text: 'FBA inventory check: all Hero and Gem ASINs must have 21-day cover', note: '' },
      ],
      Thu: [{ id: 1, text: 'Q&A seeding round 2: 3 more questions per Hero — different angles from round 1', note: '' }],
      Fri: [{ id: 1, text: 'Confirm all listing changes live in Seller Central — no pending edits going into Week 3', note: '' }],
      Sat: [{ id: 1, text: 'Quality gate: all 3 Heroes meet quality bar before ads go live Week 3. If not, flag what\'s missing.', note: '' }],
    },
  },
  {
    n: 3, title: 'LAUNCH ADS — CONSERVATIVE', desc: 'First ad campaigns live on Conservative budget, establish baseline ACOS',
    nonNeg: 'SP Auto + Manual EXACT campaigns live on all 3 Hero ASINs by Wednesday',
    budgets: { conservative: 1500, base: 2500, aggressive: 4000 },
    ws: {
      Mon: [
        { id: 1, text: 'Pause any keyword that spent ₹100+ over weekend with zero conversions — this rule applies every Monday from Week 3', note: '' },
        { id: 2, text: 'Fix first Watch-6 SKU: rewrite title, all 5 bullets, upgrade at least 1 image', note: '' },
      ],
      Tue: [
        { id: 1, text: 'Add negative keywords from Search Term Report to all active campaigns', note: '' },
      ],
      Wed: [
        { id: 1, text: 'Launch SP Auto campaigns for all 3 Hero ASINs', note: 'Conservative path: lower daily caps. Auto catches long-tail terms.' },
        { id: 2, text: 'Launch Manual EXACT campaigns for Hero-1 and Hero-2 with 5-8 exact match keywords per hero', note: '' },
        { id: 3, text: 'Check SP campaign ACOS Mon-Tue. Flag if above 40%.', note: '' },
      ],
      Thu: [{ id: 1, text: 'First ACOS deep dive: list top 3 converting placements and 3 worst ACOS placements — establish Week 3 baseline', note: '' }],
      Fri: [{ id: 1, text: 'Weekend ad bid boost on Hero ASINs with strong CVR — applies every Friday from Week 3 onwards', note: '' }],
      Sat: [{ id: 1, text: 'First ad campaign scoreboard: record baseline ACOS, CTR, unit session % for each campaign', note: '' }],
    },
  },
  {
    n: 4, title: 'FIRST REVIEWS + BUNDLE GROUNDWORK', desc: 'Vine enrollment, review agency in motion, bundle ASIN live and verified',
    nonNeg: 'Vine enrollment submitted for Hero-1 + review agency briefed + bundle ASIN live',
    budgets: { conservative: 1800, base: 3000, aggressive: 5000 },
    ws: {
      Mon: [{ id: 1, text: 'Pause any keyword that spent ₹100+ over weekend with zero conversions', note: '' }],
      Tue: [
        { id: 1, text: 'Virtual bundle check: verify bundle ASIN has correct components, images, and pricing reflects 10-15% saving', note: '' },
        { id: 2, text: 'Bid adjustments: add negative keywords from STR, adjust Hero-2 SP campaign bids based on data', note: '' },
      ],
      Wed: [
        { id: 1, text: 'Enroll Hero-1 in Amazon Vine', note: '' },
        { id: 2, text: 'Cross-ASIN linking: confirm Frequently Bought Together and SP cross-targeting set up', note: '' },
      ],
      Thu: [{ id: 1, text: 'Bundle price check: saving must be visible and at least 10-15% vs individual — verify on mobile and desktop', note: '' }],
      Fri: [
        { id: 1, text: 'Reviews check: confirm weekly review velocity on track. Check Request-a-Review send rate.', note: '' },
        { id: 2, text: 'FBA stock check: flag any ASIN below 14 days to founder TODAY', note: '' },
      ],
      Sat: [{ id: 1, text: 'Virtual bundle audit: bundle ASIN rendering correctly, pricing accurate, cross-link from PDPs live', note: '' }],
    },
  },
  {
    n: 5, title: 'SCALE TO BASE AD PATH', desc: 'Move from Conservative to Base budget, Gems CVR tracking begins',
    nonNeg: 'Base ad path active — budgets increased. Gems CVR 4-day review done.',
    budgets: { conservative: 2200, base: 3500, aggressive: 5500 },
    ws: {
      Mon: [{ id: 1, text: 'Pause any keyword that spent ₹100+ over weekend with zero conversions', note: '' }],
      Tue: [{ id: 1, text: 'Fix second Watch-6 SKU this week: rewrite title, bullets, upgrade image', note: '' }],
      Wed: [
        { id: 1, text: 'Scale Manual EXACT campaigns to Base budget level', note: '' },
        { id: 2, text: 'Cross-ASIN linking: confirm FBT and SP cross-targeting is live and tracking', note: '' },
      ],
      Thu: [{ id: 1, text: 'FIRST mandatory Gems CVR review: check unit session % trend for all Gem ASINs over past 4 days. Flag weakening CVR for possible Watch-6 demotion.', note: '' }],
      Fri: [{ id: 1, text: 'Weekend bid boost: Base path Hero ASINs get stronger bid increase for weekend traffic', note: '' }],
      Sat: [{ id: 1, text: 'Scoreboard: compare Week 5 vs Week 3 (first ad baseline). Are Gems trending up or down?', note: '' }],
    },
  },
  {
    n: 6, title: 'BUNDLE LIVE + CROSS-LINK', desc: 'Bundle fully live, cross-links on all PDPs, SP cross-targeting active',
    nonNeg: 'Bundle ASIN live and cross-linked from all 3 Hero PDPs',
    budgets: { conservative: 2500, base: 4000, aggressive: 6000 },
    ws: {
      Mon: [{ id: 1, text: '6-week mid-plan review: sessions trend, unit session % trend, ACOS trend, review count, BSR', note: '' }],
      Tue: [{ id: 1, text: 'Bundle listing quality check: 7+ images, A+ content, correct pricing savings badge visible', note: '' }],
      Wed: [
        { id: 1, text: 'SP cross-targeting: add Hero-1, Hero-2, Hero-3 ASINs to each other\'s campaigns as ASIN targeting', note: '' },
        { id: 2, text: 'FBT engineering: create paired purchases between Hero-1 and Hero-2', note: '' },
      ],
      Thu: [{ id: 1, text: 'Bundle price check: saving 10-15% minimum vs singles. Visible on mobile?', note: '' }],
      Fri: [{ id: 1, text: 'Deploy all pending listing changes — nothing in draft after 7 PM', note: '' }],
      Sat: [{ id: 1, text: 'Confirm cross-links live on all 3 Hero PDPs. Write mid-plan course correction: 3 changes for Weeks 7-12.', note: '' }],
    },
  },
  {
    n: 7, title: 'REVIEW DEPTH + A+ CONTENT', desc: 'Vine reviews posting, A+ content upgraded with review language, SB campaign live',
    nonNeg: 'A+ content upgraded on Hero-1 using Vine review language',
    budgets: { conservative: 2800, base: 4500, aggressive: 7000 },
    ws: {
      Mon: [{ id: 1, text: 'Check Vine reviews: are they posting? Integrate best review language into A+ content and bullets within 48 hours', note: '' }],
      Tue: [
        { id: 1, text: 'Upgrade A+ content on Hero-1: new module with review-sourced language and benefit focus', note: '' },
        { id: 2, text: 'Enroll Hero-2 in Vine if eligible', note: '' },
      ],
      Wed: [
        { id: 1, text: 'Launch Sponsored Brands campaign if any Hero has 30+ reviews', note: 'Trigger: any Hero crossing 30 reviews → SB campaign + raise Manual EXACT bids +15%' },
      ],
      Thu: [{ id: 1, text: 'Gems CVR review: 4-day trend. Flag any Gem weakening under paid traffic for Watch-6 demotion.', note: '' }],
      Fri: [{ id: 1, text: 'Review velocity check: track pace toward 50+ reviews on Hero-1 by Week 12', note: '' }],
      Sat: [{ id: 1, text: 'Bundle has 1+ review? Feature it in Hero PDP cross-links and A+ content', note: '' }],
    },
  },
  {
    n: 8, title: 'MID-QUARTER ACOS REVIEW', desc: 'Full ACOS audit across all campaigns — scale winners, pause losers',
    nonNeg: 'Every campaign categorised: Scale / Hold / Pause',
    budgets: { conservative: 3000, base: 5000, aggressive: 7500 },
    ws: {
      Mon: [{ id: 1, text: '8-week data review: sessions, unit session %, ACOS per campaign, reviews, BSR changes', note: '' }],
      Tue: [{ id: 1, text: 'Upgrade A+ content on Hero-2 and Hero-3', note: '' }],
      Wed: [{ id: 1, text: 'FULL ACOS AUDIT: ACOS <40% → Scale +25% | 40-70% → Hold | >70% → Pause immediately — NON-NEGOTIABLE', note: '' }],
      Thu: [{ id: 1, text: 'Watch-2 promotion verdict: review 4-week CVR data. CVR ≥12% for 3 consecutive weeks → promote.', note: '' }],
      Fri: [
        { id: 1, text: 'Keyword rank check: 3 top keywords for each Hero in incognito browser', note: '' },
        { id: 2, text: 'FBA stock full audit: all Heroes and Gems must have 21-day cover minimum', note: '' },
      ],
      Sat: [{ id: 1, text: 'Write mid-plan course correction: what is working? what is not? 3 changes for Weeks 9-12.', note: '' }],
    },
  },
  {
    n: 9, title: 'SMART SCALING', desc: 'Scale proven campaigns, pause 9-week losers, organic ratio check',
    nonNeg: 'All campaigns with 9-week ACOS >70% paused today',
    budgets: { conservative: 3000, base: 5500, aggressive: 8000 },
    ws: {
      Mon: [{ id: 1, text: 'Check organic vs paid session ratio: target organic >40% by Week 9', note: '' }],
      Tue: [{ id: 1, text: 'Full listing refresh on any Watch-6 promoted to Gem this week', note: '' }],
      Wed: [
        { id: 1, text: 'Pause ALL campaigns with 9-week ACOS >70% — NON-NEGOTIABLE', note: '' },
        { id: 2, text: 'Reallocate paused budget to campaigns with ACOS <40%', note: '' },
      ],
      Thu: [{ id: 1, text: 'Gems CVR full review: 9-week trend. Any Gem weakened → demote to Watch-6.', note: '' }],
      Fri: [{ id: 1, text: 'FBA restock audit: which Heroes need replenishment to maintain 21-day cover through Week 12?', note: '' }],
      Sat: [],
    },
  },
  {
    n: 10, title: 'VELOCITY + RANKING PUSH', desc: 'Bid push for page-1 ranking, coupon launch, BSR consolidation',
    nonNeg: 'Hero-3 aggressive bid push launched — page-1 ranking target active',
    budgets: { conservative: 3200, base: 6000, aggressive: 9000 },
    ws: {
      Mon: [{ id: 1, text: 'Identify ranking opportunity: which Hero is closest to page-1 for its top keyword?', note: '' }],
      Tue: [{ id: 1, text: 'Bullet refresh on all 3 Hero listings with best-performing review phrases', note: '' }],
      Wed: [
        { id: 1, text: 'Launch coupon (8% off) on Hero-3 to combine with bid push', note: '' },
        { id: 2, text: 'Velocity bid push: +30% bids on all exact-match keywords for ranking push target', note: '' },
      ],
      Thu: [{ id: 1, text: 'Draft founder decision for Week 11: which Hero gets the final ranking push?', note: '' }],
      Fri: [{ id: 1, text: 'Check organic rank for 3 top keywords on each Hero — incognito browser, 3 different search terms', note: '' }],
      Sat: [{ id: 1, text: 'Scoreboard: note BSR movement this week. Is velocity push working?', note: '' }],
    },
  },
  {
    n: 11, title: 'AOV & BUNDLE EXPAND', desc: 'Average order value optimization, bundle expansion, WhatsApp Wave',
    nonNeg: 'AOV-boosting bundle or upsell mechanism live by Wednesday',
    budgets: { conservative: 3200, base: 6000, aggressive: 9000 },
    ws: {
      Mon: [{ id: 1, text: 'Check organic vs paid revenue ratio: target organic >50% by Week 11', note: '' }],
      Tue: [{ id: 1, text: 'AOV audit: average units per order? Is bundle pricing optimized for maximum attach rate?', note: '' }],
      Wed: [
        { id: 1, text: 'Pause all keywords with 4-week average ACOS >50%', note: '' },
        { id: 2, text: 'Launch new bundle variant or upgrade existing bundle with higher savings', note: '' },
      ],
      Thu: [{ id: 1, text: 'WhatsApp Wave broadcast: 12% off, maximum reach — send to order history contacts', note: '' }],
      Fri: [{ id: 1, text: 'Pre-mortem: list 3 risks for Week 12 + planned responses', note: 'Think: stock-out, budget exhaustion, review removal, competitor surge' }],
      Sat: [],
    },
  },
  {
    n: 12, title: 'LOCK THE FLOOR', desc: '12-week audit, maintenance protocol, lock rankings and BSR floor',
    nonNeg: '12-week financial audit complete by Friday',
    budgets: { conservative: 3200, base: 6000, aggressive: 9000 },
    ws: {
      Mon: [{ id: 1, text: 'Plan Week 12 audit: P&L, Ad ROI, Organic growth, Review count, BSR floor, Keyword rank', note: '' }],
      Tue: [{ id: 1, text: 'FBA inventory final check: zero stock-outs across all Heroes going into next quarter', note: '' }],
      Wed: [{ id: 1, text: 'Hold ad portfolio: minor raises only on confirmed performers with unit session % ≥10%', note: '' }],
      Thu: [{ id: 1, text: 'WhatsApp Wave: 15% Founding Customer offer, first 100 only — scarcity angle', note: '' }],
      Fri: [{ id: 1, text: '12-WEEK AUDIT — full P&L, campaign ROI, organic vs paid, review count, BSR floor, keyword rank', note: 'NON-NEGOTIABLE: audit document delivered by EOD Friday' }],
      Sat: [
        { id: 1, text: 'Write Maintenance Protocol: steady-state daily and weekly tasks for Week 13+', note: '' },
        { id: 2, text: 'Write Next Launch Brief: which Watch SKU or new product launches next?', note: '' },
      ],
    },
  },
];

// ── Daily constants (shown every day, every week) ─────────────────────────────

const RECURRING_TASKS = [
  { id: 'r1', text: 'Morning Pull — check all active SKU metrics: sessions, unit session % (CVR), organic rank for 3 top keywords, ad spend, ACOS, returns', note: 'Do this first, every day. Flag anything that moved >20% vs yesterday.' },
  { id: 'r2', text: 'Q&A and Review Reply — respond to all buyer questions within 24 hours; respond to every new review; for 1-3 star reviews, attempt private resolution before public reply', note: '' },
  { id: 'r3', text: 'Stop-Loss Watch — check all 3 rules. Act IMMEDIATELY if triggered. No exceptions.', note: 'Rule 1: Unit session % <4% for 2 days → stop changes, fix listing. Rule 2: ACOS >40% for 5 days → pause campaign. Rule 3: FBA cover <21 days → alert founder.' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function lsKey(plat, w, d, id) { return `mkt_${plat}_w${w}_d${d}_t${id}`; }
function lsNotes(plat, w, d)   { return `mkt_${plat}_w${w}_d${d}_notes`; }
function lsKpi(plat, w, d)     { return `mkt_${plat}_w${w}_d${d}_kpi`; }
function lsBudget(plat, w)     { return `mkt_${plat}_w${w}_budget`; }
function lsScorecard(plat, w)  { return `mkt_${plat}_w${w}_scorecard`; }

// ── Flipkart Plan Data ────────────────────────────────────────────────────────

const FLIPKART_RECURRING = [
  { id: 'fr1', text: 'Morning Pull — check all active SKU metrics: sessions, CVR, organic rank for 3 top keywords, ad spend, ACOS, returns', note: 'Do this first, every day. Flag anything that moved >20% vs yesterday.' },
  { id: 'fr2', text: 'Q&A and Review Reply — respond to all buyer questions within 24 hours; respond to every new review; for 1-3 star reviews, attempt private resolution before public reply', note: '' },
  { id: 'fr3', text: 'Stop-Loss Watch — check all 3 rules. Act IMMEDIATELY if triggered. No exceptions.', note: 'Rule 1: CVR <4% for 2 days → stop changes, fix listing. Rule 2: ACOS >40% for 5 days → pause campaign. Rule 3: Stock cover <21 days → alert founder.' },
];
const FLIPKART_BASE = {
  Mon: [
    { id: 'fb1', text: 'Pull all weekend data (Sat+Sun): sessions, CVR, ad spend, ACOS, return count for all active SKUs — write in log', note: '' },
    { id: 'fb2', text: '15-min founder call before 11:30 AM — lock the week\'s 5 priorities in writing', note: '' },
    { id: 'fb3', text: 'Deep work on Hero-1: ship ONE live listing change (title, bullets, enhanced content, or main image) — must be live by 7 PM', note: '' },
    { id: 'fb4', text: 'Run PLA Search Term Report from last week — identify top 3 converting keywords and worst 3 ACOS keywords', note: '' },
    { id: 'fb5', text: '(Week 3+) Pause any keyword that spent ₹100+ over the weekend with zero conversions', note: '' },
    { id: 'fb6', text: 'Review any seller disputes or policy notices opened since Friday — respond within 24 hours', note: '' },
  ],
  Tue: [
    { id: 'fb1', text: 'Deep work on Hero-2: ship this week\'s live listing change', note: '' },
    { id: 'fb2', text: '(Week 1-2) Merge or suppress duplicate listings; check brand registry hijacker alerts', note: '' },
    { id: 'fb3', text: '(Week 3+) Fix ONE Watch-6 SKU — rewrite title, all 5 bullets, and at least 1 image', note: '' },
    { id: 'fb4', text: 'Launch this week\'s A/B test — write hypothesis in log', note: '' },
    { id: 'fb5', text: '(Week 3+) Bid adjustments: add negative keywords from STR; adjust keyword bids on Hero-2 PLA campaign', note: '' },
    { id: 'fb6', text: '(Week 4+) Bundle check: verify bundle listing has correct components, images, and pricing reflects saving', note: '' },
  ],
  Wed: [
    { id: 'fb1', text: 'Deep work on Hero-3: ship live listing change', note: '' },
    { id: 'fb2', text: 'Brief review agency (30-45 min): which SKUs, how many review requests, 3 writing angles — DO NOT brief on content (ToS risk)', note: '' },
    { id: 'fb3', text: '(Week 2+) Check F-Assured eligibility status for all Hero SKUs', note: '' },
    { id: 'fb4', text: '(Week 4+) Cross-SKU linking: confirm Frequently Bought Together and PLA cross-targeting set up correctly', note: '' },
    { id: 'fb5', text: '(Week 3+) Check PLA campaign performance Mon-Tue. Flag ACOS >40%. Consider budget increase if ACOS <20% and CVR strong.', note: '' },
    { id: 'fb6', text: 'Backend attribute refresh on today\'s Hero SKU: fill all mandatory + optional attributes completely', note: '' },
    { id: 'fb7', text: '(Week 2+) Inventory check: all Hero and Watch SKUs must have 21-day stock cover. Raise restock alert to founder if any is under.', note: '' },
  ],
  Thu: [
    { id: 'fb1', text: '(Week 3+) ACOS deep dive: open every active PLA campaign. List top 3 converting ad groups and 3 worst ACOS ad groups.', note: '' },
    { id: 'fb2', text: '(Week 3+) Bid adjustments: push budget to top converters. Throttle/pause worst ACOS ad groups.', note: '' },
    { id: 'fb3', text: '(Week 5+) Gems CVR review: check CVR trend for all Gem SKUs over past 4 days. Flag weakening CVR for Watch-6 demotion.', note: '' },
    { id: 'fb4', text: 'Bundle price check: saving vs single items must be visible and at least 10-15%. Verify on desktop and mobile.', note: '' },
    { id: 'fb5', text: 'Watch-6 SKU 4-day check: did Tuesday\'s fix move the needle? Improved → shortlist. Flat → return to Cold Rest.', note: '' },
    { id: 'fb6', text: 'Returns audit: read all return reasons from past 7 days. Route patterns to Friday\'s fix queue.', note: '' },
    { id: 'fb7', text: 'Q&A second sweep — Thursday pre-weekend buyers are high-intent', note: '' },
  ],
  Fri: [
    { id: 'fb1', text: 'Competitor scan (45 min, formal): top 5 competitors — price changes, BSR rank, F-Assured status, review count change vs last Friday, new content or listing updates. Write dated log.', note: '' },
    { id: 'fb2', text: 'Special deep scan: highest-impression SKU — check top 10 competitors on exact search query driving most sessions', note: '' },
    { id: 'fb3', text: 'Stock check: BOTH inbound shipment status AND current sellable inventory. Flag any SKU below 14 days to founder TODAY.', note: '' },
    { id: 'fb4', text: 'Deploy ALL listing changes prepared this week. Nothing stays in draft after 7 PM.', note: '' },
    { id: 'fb5', text: '(Week 2+) Reviews check: confirm weekly review velocity on track. Follow up with agency if behind.', note: '' },
    { id: 'fb6', text: '(Week 3+) Weekend ad bid boost: increase bids on Hero SKUs with strong CVR. Set daily budget caps on underperformers.', note: '' },
    { id: 'fb7', text: 'Check brand storefront on mobile and desktop. Verify any deal or coupon badge is showing correctly.', note: '' },
  ],
  Sat: [
    { id: 'fb1', text: 'Operations check: verify all orders dispatched on time. Check seller score in Flipkart Seller Hub. 1-in-10 physical QC check.', note: '' },
    { id: 'fb2', text: 'Inventory verification: cross-check sellable units in Seller Hub with restock tracker spreadsheet', note: '' },
    { id: 'fb3', text: '(Week 4+) Bundle audit: all bundle listings rendering correctly, pricing accurate, cross-link from individual PDPs is live', note: '' },
    { id: 'fb4', text: 'Write weekly scoreboard and send to founder BEFORE 6 PM: units sold vs target, ACOS by campaign, BSR movement on Hero SKUs, review count delta, returns, top 3 wins, top 3 misses, one founder decision needed', note: '' },
    { id: 'fb5', text: 'Archive weekly log. Write Monday prep note.', note: '' },
    { id: 'fb6', text: '(Every other Saturday) Review account health dashboard: late shipment rate, cancellation rate, policy warning changes', note: '' },
  ],
};
const FLIPKART_MUST = {
  Mon: ['Written week priorities shared with founder', 'One live change on Hero-1', 'PLA Search Term Report reviewed — top/bottom 3 identified', '(Week 3+) Underperforming keywords paused'],
  Tue: ['Hero-2 has one live change', 'Catalog deduplication / Watch-6 fix done', 'A/B test running or documented', '(Week 3+) Negative keywords added'],
  Wed: ['Hero-3 has one live change', 'Review process triggered correctly (no ToS risk)', 'Backend attributes refreshed on today\'s Hero SKU', '(Week 2+) Inventory check done'],
  Thu: ['(Week 3+) ACOS deep dive with top/bottom 3 documented', 'Bids adjusted', 'Bundle prices and savings verified', '(Week 5+) Gems CVR trajectory documented', 'Watch-6 4-day decision made', 'Return patterns routed'],
  Fri: ['Dated competitor log written', 'High-impression SKU competitor scan done', 'Stock confirmed — founder alerted if any SKU under 14 days', 'ALL listing changes live', '(Week 2+) Review velocity confirmed', '(Week 3+) Weekend bids locked', 'Storefront verified on mobile'],
  Sat: ['Dispatch verification done', 'Seller score checked', 'Stock cross-verified', '(Week 4+) Bundle audit complete', 'Scoreboard sent before 6 PM', 'Log archived', '(Every other Saturday) Account health dashboard checked'],
};
const FLIPKART_SCORECARD = [
  { key: 'units',       label: 'Units Sold',                  ph: '0' },
  { key: 'target',      label: 'Weekly Target',               ph: '0' },
  { key: 'sessions',    label: 'Sessions (Week Total)',        ph: '0' },
  { key: 'cvr',         label: 'Avg CVR (%)',                 ph: '0.00' },
  { key: 'adSpend',     label: 'Total Ad Spend (₹)',          ph: '0' },
  { key: 'adRevenue',   label: 'Total Ad Revenue (₹)',        ph: '0' },
  { key: 'acosPla',     label: 'ACOS — PLA Campaigns (%)',    ph: '0.00' },
  { key: 'bsrHero1',    label: 'BSR Movement — Hero #1',      ph: 'e.g. 1200 → 850' },
  { key: 'bsrHero2',    label: 'BSR Movement — Hero #2',      ph: 'e.g. 2500 → 2100' },
  { key: 'reviewDelta', label: 'Review Count Delta',          ph: '+ or − reviews this week' },
  { key: 'returns',     label: 'Returns This Week',           ph: '0' },
  { key: 'fAssured',    label: 'F-Assured Badge Status',      ph: 'Active / Pending / Not Eligible' },
  { key: 'adPath',      label: 'Ad Path Next Week',           ph: 'Conservative / Base / Aggressive' },
  { key: 'wins',        label: 'Top 3 Wins',                  ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'misses',      label: 'Top 3 Misses',                ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'decision',    label: 'Founder Decision Needed',     ph: '...', ml: true },
  { key: 'stopLoss',    label: 'Stop-Loss Rule Triggered?',   ph: 'None / Rule #1 / Rule #2 / Rule #3' },
];
const FLIPKART_TRIGGERED = [
  { id: 1,  level: 'red',   text: 'STOP-LOSS RULE 1: Any Hero/Gem SKU CVR drops below 4% for 2 consecutive days → STOP all listing and ad changes. Fix content FIRST.' },
  { id: 2,  level: 'red',   text: 'STOP-LOSS RULE 2: Any PLA campaign ACOS exceeds 40% for 5 consecutive days → PAUSE the campaign immediately. No exceptions.' },
  { id: 3,  level: 'red',   text: 'STOP-LOSS RULE 3: Any SKU stock cover drops below 21 days → raise restock alert to founder TODAY. Stockouts trigger ranking penalties.' },
  { id: 4,  level: 'red',   text: 'FLIPKART ALERT: Seller Health score drops OR policy warning received → escalate to founder within 1 HOUR. Do not wait for end of day.' },
  { id: 5,  level: 'red',   text: 'Hero listing suppressed → find reason same day, fix and resubmit. Do not wait.' },
  { id: 6,  level: 'amber', text: 'Stock below 14 days on any SKU → alert founder TODAY. Target minimum 21-day cover.' },
  { id: 7,  level: 'amber', text: 'CVR below 4% (day 1) → monitor closely. If day 2 also below 4% → Stop-Loss Rule 1 fires.' },
  { id: 8,  level: 'amber', text: 'ACOS above 40% (days 1-4) → flag campaign. If day 5 still >40% → Stop-Loss Rule 2 fires — pause immediately.' },
  { id: 9,  level: 'green', text: 'ACOS below 20% AND CVR strong → eligible for budget increase on this campaign' },
  { id: 10, level: 'green', text: 'F-Assured badge earned → raise PLA bids +20% on all Hero SKUs immediately' },
  { id: 11, level: 'green', text: 'Any Hero crosses 30 reviews → launch brand awareness PLA + raise top keyword bids +15%' },
];
const FLIPKART_WEEK_DATA = [
  { n:1,  title:'ACCOUNT & CATALOG SETUP', desc:'Declare Hero/Gem/Watch-6 tiers, catalog audit, attribute fill', nonNeg:'All Hero SKUs live, in stock, and attributes 100% filled by Thursday', budgets:{conservative:0,base:0,aggressive:0}, ws:{ Mon:[{id:1,text:'Audit all active SKUs: declare Hero, Gem, Watch-6 tiers by CVR and margin',note:''}], Tue:[{id:1,text:'Catalog cleanup: merge duplicate listings, check for hijacker alerts',note:''},{id:2,text:'Backend attribute fill: all mandatory + optional attributes for each Hero SKU',note:''}], Wed:[{id:1,text:'Submit brand store application if not done',note:''},{id:2,text:'Verify all Hero SKUs: live, in stock, correct category',note:''}], Thu:[{id:1,text:'Q&A seeding round 1: 3-5 questions per Hero from friends/family',note:''}], Fri:[{id:1,text:'Build competitor tracker: 5 rivals per Hero — price, rating, F-Assured, images',note:''}], Sat:[{id:1,text:'Bookmark key Flipkart analytics pages: Business Analytics, Ads Manager, Account Health',note:''}] }},
  { n:2,  title:'LISTING QUALITY LOCK', desc:'All Hero listings at maximum quality before ad spend begins', nonNeg:'All 3 Hero listings: 7+ images, attributes complete, enhanced content submitted', budgets:{conservative:0,base:0,aggressive:0}, ws:{ Mon:[{id:1,text:'Listing quality audit: title (80 chars max), 5 bullets, 7+ images, description, F-Assured readiness',note:''}], Tue:[{id:1,text:'Upgrade Hero-1 main image: white background, product prominent, readable text at thumbnail size',note:''},{id:2,text:'Create virtual bundle: Hero #1 + Hero #2 with 10-15% saving shown clearly',note:''}], Wed:[{id:1,text:'Check F-Assured eligibility: seller rating ≥4.0, return rate <10%, SLA 100%',note:''},{id:2,text:'Inventory check: all Hero SKUs must have 21-day stock cover',note:''}], Thu:[{id:1,text:'Q&A seeding round 2: 3 more questions per Hero — different angles',note:''}], Fri:[{id:1,text:'Confirm all listing changes live in Seller Hub — no pending edits',note:''}], Sat:[{id:1,text:'Quality gate: all 3 Heroes meet quality bar before ads go live Week 3',note:''}] }},
  { n:3,  title:'LAUNCH ADS — CONSERVATIVE', desc:'First PLA campaigns live on Conservative budget, establish baseline ACOS', nonNeg:'PLA campaigns live on all 3 Hero SKUs by Wednesday', budgets:{conservative:1500,base:2500,aggressive:4000}, ws:{ Mon:[{id:1,text:'Pause any keyword that spent ₹100+ over weekend with zero conversions',note:''},{id:2,text:'Fix first Watch-6 SKU: rewrite title, all 5 bullets, upgrade at least 1 image',note:''}], Tue:[{id:1,text:'Add negative keywords from PLA Search Term Report',note:''}], Wed:[{id:1,text:'Launch PLA Auto + Manual EXACT campaigns for all 3 Hero SKUs — Conservative budget',note:''},{id:2,text:'Check ACOS Mon-Tue on any existing campaigns. Flag if above 40%.',note:''}], Thu:[{id:1,text:'First ACOS deep dive: top 3 converting ad groups and 3 worst ACOS ad groups — establish Week 3 baseline',note:''}], Fri:[{id:1,text:'Weekend ad bid boost on Hero SKUs with strong CVR — applies every Friday from Week 3',note:''}], Sat:[{id:1,text:'First ad scoreboard: record baseline ACOS, CTR, CVR for each campaign',note:''}] }},
  { n:4,  title:'FIRST REVIEWS + BUNDLE GROUNDWORK', desc:'Review agency in motion, bundle listing live and verified', nonNeg:'Review agency briefed + bundle listing live', budgets:{conservative:1800,base:3000,aggressive:5000}, ws:{ Mon:[{id:1,text:'Pause any keyword that spent ₹100+ over weekend with zero conversions',note:''}], Tue:[{id:1,text:'Bundle check: verify bundle listing has correct components, images, 10-15% saving',note:''},{id:2,text:'Bid adjustments: add negative keywords from STR, adjust Hero-2 PLA campaign bids',note:''}], Wed:[{id:1,text:'Cross-SKU linking: confirm PLA cross-targeting and Frequently Bought Together set up',note:''}], Thu:[{id:1,text:'Bundle price check: saving must be visible 10-15% vs individual — verify on mobile and desktop',note:''}], Fri:[{id:1,text:'Reviews check: confirm weekly review velocity on track',note:''},{id:2,text:'Stock check: flag any SKU below 14 days to founder TODAY',note:''}], Sat:[{id:1,text:'Bundle audit: rendering correctly, pricing accurate, cross-link from PDPs live',note:''}] }},
  { n:5,  title:'SCALE TO BASE AD PATH', desc:'Move to Base budget, Gems CVR tracking begins', nonNeg:'Base ad path active. Gems CVR 4-day review done.', budgets:{conservative:2200,base:3500,aggressive:5500}, ws:{ Mon:[{id:1,text:'Pause any keyword that spent ₹100+ over weekend with zero conversions',note:''}], Tue:[{id:1,text:'Fix second Watch-6 SKU this week: rewrite title, bullets, upgrade image',note:''}], Wed:[{id:1,text:'Scale PLA campaigns to Base budget level',note:''},{id:2,text:'Confirm cross-SKU linking is live and tracking',note:''}], Thu:[{id:1,text:'FIRST mandatory Gems CVR review: check CVR trend for all Gem SKUs over past 4 days. Flag weakening.',note:''}], Fri:[{id:1,text:'Weekend bid boost: Base path Hero SKUs get stronger bid increase for weekend traffic',note:''}], Sat:[{id:1,text:'Scoreboard: compare Week 5 vs Week 3. Are Gems trending up or down?',note:''}] }},
  { n:6,  title:'BUNDLE LIVE + CROSS-LINK', desc:'Bundle fully live, cross-links on all PDPs, PLA cross-targeting active', nonNeg:'Bundle listing live and cross-linked from all 3 Hero PDPs', budgets:{conservative:2500,base:4000,aggressive:6000}, ws:{ Mon:[{id:1,text:'6-week mid-plan review: sessions trend, CVR trend, ACOS trend, review count, BSR',note:''}], Tue:[{id:1,text:'Bundle listing quality check: 7+ images, enhanced content, correct savings badge visible',note:''}], Wed:[{id:1,text:'PLA cross-targeting: add Hero-1, Hero-2, Hero-3 SKUs to each other\'s campaigns as ASIN targeting',note:''}], Thu:[{id:1,text:'Bundle price check: saving 10-15% minimum vs singles. Visible on mobile?',note:''}], Fri:[{id:1,text:'Deploy all pending listing changes — nothing in draft after 7 PM',note:''}], Sat:[{id:1,text:'Confirm cross-links live on all 3 Hero PDPs. Write mid-plan course correction: 3 changes for Weeks 7-12.',note:''}] }},
  { n:7,  title:'REVIEW DEPTH + ENHANCED CONTENT', desc:'Reviews building, enhanced content upgraded, brand PLA campaign live', nonNeg:'Enhanced content upgraded on Hero-1 using review language', budgets:{conservative:2800,base:4500,aggressive:7000}, ws:{ Mon:[{id:1,text:'Check review velocity: are reviews posting? Integrate best review language into enhanced content within 48h',note:''}], Tue:[{id:1,text:'Upgrade enhanced content on Hero-1: new module with review-sourced language',note:''},{id:2,text:'Enroll Hero-2 in F-Assured if eligible',note:''}], Wed:[{id:1,text:'Launch brand awareness PLA campaign if any Hero has 30+ reviews',note:''}], Thu:[{id:1,text:'Gems CVR review: 4-day trend. Flag any Gem weakening under paid traffic.',note:''}], Fri:[{id:1,text:'Review velocity check: track pace toward 50+ reviews on Hero-1 by Week 12',note:''}], Sat:[{id:1,text:'Bundle has 1+ review? Feature it in Hero PDP cross-links and enhanced content',note:''}] }},
  { n:8,  title:'MID-QUARTER ACOS REVIEW', desc:'Full ACOS audit across all campaigns — scale winners, pause losers', nonNeg:'Every campaign categorised: Scale / Hold / Pause', budgets:{conservative:3000,base:5000,aggressive:7500}, ws:{ Mon:[{id:1,text:'8-week data review: sessions, CVR, ACOS per campaign, reviews, BSR changes',note:''}], Tue:[{id:1,text:'Upgrade enhanced content on Hero-2 and Hero-3',note:''}], Wed:[{id:1,text:'FULL ACOS AUDIT: ACOS <40% → Scale +25% | 40-70% → Hold | >70% → Pause immediately — NON-NEGOTIABLE',note:''}], Thu:[{id:1,text:'Watch-2 promotion verdict: review 4-week CVR data. CVR ≥12% for 3 consecutive weeks → promote.',note:''}], Fri:[{id:1,text:'Keyword rank check: 3 top keywords for each Hero',note:''},{id:2,text:'Full stock audit: all Heroes and Gems must have 21-day cover minimum',note:''}], Sat:[{id:1,text:'Write mid-plan course correction: what is working, what is not, 3 changes for Weeks 9-12',note:''}] }},
  { n:9,  title:'SMART SCALING', desc:'Scale proven campaigns, pause 9-week losers, organic ratio check', nonNeg:'All campaigns with 9-week ACOS >70% paused today', budgets:{conservative:3000,base:5500,aggressive:8000}, ws:{ Mon:[{id:1,text:'Check organic vs paid session ratio: target organic >40% by Week 9',note:''}], Tue:[{id:1,text:'Full listing refresh on any Watch-6 promoted to Gem this week',note:''}], Wed:[{id:1,text:'Pause ALL campaigns with 9-week ACOS >70% — NON-NEGOTIABLE',note:''},{id:2,text:'Reallocate paused budget to campaigns with ACOS <40%',note:''}], Thu:[{id:1,text:'Gems CVR full review: 9-week trend. Any Gem weakened → demote to Watch-6.',note:''}], Fri:[{id:1,text:'Restock audit: which Heroes need replenishment to maintain 21-day cover through Week 12?',note:''}], Sat:[] }},
  { n:10, title:'VELOCITY + RANKING PUSH', desc:'Bid push for top ranking, coupon launch, BSR consolidation', nonNeg:'Hero-3 aggressive bid push launched — top ranking target active', budgets:{conservative:3200,base:6000,aggressive:9000}, ws:{ Mon:[{id:1,text:'Identify ranking opportunity: which Hero is closest to page-1 for its top keyword?',note:''}], Tue:[{id:1,text:'Bullet refresh on all 3 Hero listings with best-performing review phrases',note:''}], Wed:[{id:1,text:'Launch coupon (8% off) on Hero-3 to combine with bid push',note:''},{id:2,text:'Velocity bid push: +30% bids on all exact-match keywords for ranking push target',note:''}], Thu:[{id:1,text:'Draft founder decision for Week 11: which Hero gets the final ranking push?',note:''}], Fri:[{id:1,text:'Check organic rank for 3 top keywords on each Hero',note:''}], Sat:[{id:1,text:'Scoreboard: note BSR movement this week. Is velocity push working?',note:''}] }},
  { n:11, title:'AOV & BUNDLE EXPAND', desc:'Average order value optimization, bundle expansion', nonNeg:'AOV-boosting bundle or upsell mechanism live by Wednesday', budgets:{conservative:3200,base:6000,aggressive:9000}, ws:{ Mon:[{id:1,text:'Check organic vs paid revenue ratio: target organic >50% by Week 11',note:''}], Tue:[{id:1,text:'AOV audit: average units per order? Is bundle pricing optimized?',note:''}], Wed:[{id:1,text:'Pause all keywords with 4-week average ACOS >50%',note:''},{id:2,text:'Launch new bundle variant or upgrade existing bundle with higher savings',note:''}], Thu:[{id:1,text:'Pre-mortem: list 3 risks for Week 12 + planned responses',note:''}], Fri:[], Sat:[] }},
  { n:12, title:'LOCK THE FLOOR', desc:'12-week audit, maintenance protocol, lock rankings and BSR floor', nonNeg:'12-week financial audit complete by Friday', budgets:{conservative:3200,base:6000,aggressive:9000}, ws:{ Mon:[{id:1,text:'Plan Week 12 audit: P&L, Ad ROI, Organic growth, Review count, BSR floor, Keyword rank',note:''}], Tue:[{id:1,text:'Inventory final check: zero stock-outs across all Heroes going into next quarter',note:''}], Wed:[{id:1,text:'Hold ad portfolio: minor raises only on confirmed performers',note:''}], Thu:[], Fri:[{id:1,text:'12-WEEK AUDIT — full P&L, campaign ROI, organic vs paid, review count, BSR floor',note:'NON-NEGOTIABLE: audit delivered by EOD Friday'}], Sat:[{id:1,text:'Write Maintenance Protocol: steady-state daily and weekly tasks for Week 13+',note:''},{id:2,text:'Write Next Launch Brief: which Watch SKU or new product launches next?',note:''}] }},
];

// ── Meesho Plan Data ──────────────────────────────────────────────────────────

const MEESHO_RECURRING = [
  { id: 'mr1', text: 'Morning Data Check (30 min): open Meesho Seller Hub. Write yesterday\'s numbers for all active SKUs — orders, CTR, CVR, ad spend, return count. Mark anomalies in RED.', note: 'NON-NEGOTIABLE. Skip it and Meesho algorithm forgets you exist.' },
  { id: 'mr2', text: 'Freshness Edit — 3 SKUs (30 min): edit minimum 3 SKUs. Change price by ₹1-5, OR swap one word in title, OR add/rotate tags, OR swap main image. Log what you changed.', note: 'NON-NEGOTIABLE every day.' },
  { id: 'mr3', text: 'Reply to Buyer Questions + Reviews (30-45 min): reply to every buyer question within 24 hours. For 3-star or below, try private resolution first.', note: '' },
  { id: 'mr4', text: 'Stop-Loss Check (5 min): check all 6 stop-loss rules. If any rule is RED, act IMMEDIATELY. Do NOT wait.', note: 'Rule 1: ACOS >35% for 3d → pause. Rule 2: CVR <1.5% for 2d → stop changes. Rule 3: Return >20% → delist. Rule 4: 0 sales for 3d → check. Rule 5: Stock <14d → alert. Rule 6: Ad spend >15% weekly revenue → cut.' },
];
const MEESHO_BASE = {
  Mon: [
    { id: 'mb1', text: 'Pull Sat+Sun numbers: orders, CTR, CVR, returns, ad spend vs sales for all active SKUs. Flag anything that moved >20% vs last week.', note: '' },
    { id: 'mb2', text: 'Update Hero/Support/Zero SKU list using 6 Hero rules and 3+ Zero failure rules. Move any product that crossed a threshold.', note: '' },
    { id: 'mb3', text: 'Write this week\'s price and image plan: specific SKU + specific change + reason. Minimum 3 price actions + 2 image actions.', note: '' },
    { id: 'mb4', text: 'Check last week\'s review status. Confirm all 12 reviews went live. Draft this week\'s review plan: 6 Hero + 4 High-CTR Zero + 2 New.', note: '' },
    { id: 'mb5', text: '(Week 5+) Check weekend ad data: export impressions, clicks, spend, orders, ACOS for each active ad. Flag any approaching Stop-Loss.', note: '' },
    { id: 'mb6', text: 'QC check: physically look at 1 in every 20 dispatched packages. Check seal, label, condition. Write 1-line report.', note: '' },
  ],
  Tue: [
    { id: 'mb1', text: 'Replace main images on 2-3 Zero/Support SKUs with CTR below 0.8%. New images must have: clean background + benefit text overlay.', note: '' },
    { id: 'mb2', text: 'Check text overlay readability: shrink to 120×120. If text isn\'t readable at thumbnail size, it doesn\'t exist.', note: '' },
    { id: 'mb3', text: 'Rewrite descriptions for 3 Hero SKUs. Lead with BENEFIT not feature: "Reduces hair fall in 3 weeks" NOT "Contains coconut oil". Add "Suitable for" clarity.', note: '' },
    { id: 'mb4', text: 'Check competitor prices on top 10 listings for "hair oil 100ml". Flag any competitor undercutting Hero SKUs by more than ₹10.', note: '' },
    { id: 'mb5', text: '(Week 1-2) Create ₹149 variant for top 5 hair oils. Launch 100ml "starter" size at ₹149.', note: '' },
    { id: 'mb6', text: '(Week 3+) Pick ONE Watch/Zero SKU. Fix its title, rewrite 5 bullets, upgrade at least one image. Only that one SKU.', note: '' },
  ],
  Wed: [
    { id: 'mb1', text: 'Check competitor pricing on ALL Hero SKUs. Search each Hero\'s main keyword. Record top 8 competitor prices. Decide: match, undercut by ₹5, or hold. Write reasoning.', note: '' },
    { id: 'mb2', text: '(Week 5+) Review ad performance: ACOS, CTR, spend vs orders for last 7 days. Calculate ACOS = (Ad Spend / Ad Sales) × 100. Flag any approaching Stop-Loss.', note: '' },
    { id: 'mb3', text: '(Week 5+) Ad optimization: PAUSE any Stop-Loss-hit ad. Increase bid 10-15% on top 2 performing ads. Add negative keywords that burned money with no sales.', note: '' },
    { id: 'mb4', text: '30-45 min briefing call with review agency. WRITTEN brief: which SKUs, how many reviews, 3 angles, target cities. Max 1 review per SKU per day.', note: '' },
    { id: 'mb5', text: 'Brief friends/family pool individually via WhatsApp: which SKU, which city, which angle. Geographic spread: TN max 30%, min 4 cities, min 3 states across any 7-review window.', note: '' },
    { id: 'mb6', text: '(Week 2+) Stock check: is stock cover 21+ days on all Hero SKUs? Raise restock ticket TODAY if any is low.', note: '' },
  ],
  Thu: [
    { id: 'mb1', text: '(Week 4+) Create or optimize bundle listings. Build 2-pack oil bundles at ₹199-249. Ensure clear bundle images showing both bottles. Add "Save ₹X" text overlay.', note: '' },
    { id: 'mb2', text: '(Week 4+) Design bundle-specific images. "BEST VALUE" or "SAVE ₹49" headline. Add lifestyle context (family hair oiling scene).', note: '' },
    { id: 'mb3', text: '(Week 4+) Cross-link bundles to single units. Bundle description → "Also available as single". Single description → "Save more with 2-pack bundle".', note: '' },
    { id: 'mb4', text: 'Mid-week Stop-Loss check: review Mon-Tue-Wed numbers. Has any Hero CVR dropped below 1.5% for 2+ days? ACOS above 35% for 2+ days? Act NOW.', note: '' },
    { id: 'mb5', text: 'Review placement: coordinate 1-2 reviews for top Hero SKU (TRCB100 — Coconut Basil Hair Oil). Brief agency on quality praise + usage experience angle.', note: '' },
    { id: 'mb6', text: '(Week 5+) Ad mid-week tune: check Mon-Wed ad data. Any keyword spent ₹50+ with zero sales? PAUSE it. Any keyword with ROAS above 3×? Increase bid 10%.', note: '' },
  ],
  Fri: [
    { id: 'mb1', text: 'Analyze return reasons from last week. Export return data. Categorize: wrong expectation, damaged product, changed mind, quality issue. Update descriptions for flagged SKUs.', note: '' },
    { id: 'mb2', text: 'QC check: compare Meesho product images to actual physical product. Check color, texture, packaging, size. Add "Product colour may vary due to natural ingredients" to every description.', note: '' },
    { id: 'mb3', text: 'Confirm all 12 this-week reviews are placed or scheduled. 6 on Hero SKUs, 4 on High-CTR Zero SKUs, 2 on New/bundles. Max 2 per SKU per week. Never consecutive days for same SKU.', note: '' },
    { id: 'mb4', text: 'Stock check: confirm 14-day minimum stock cover on ALL Hero SKUs and bundles. Alert founder TODAY if any below 14 days.', note: '' },
    { id: 'mb5', text: '(Week 5+) Final weekend ad tune-up: Heroes with high CVR get bid boost for Saturday. Risky SKUs get spend cap. Lock all changes before 7 PM.', note: '' },
    { id: 'mb6', text: 'Deploy all image and listing changes prepared this week — NOTHING stays in draft after 7 PM.', note: '' },
  ],
  Sat: [
    { id: 'mb1', text: 'Physical inventory count: match system stock to actual stock on all Hero SKUs.', note: '' },
    { id: 'mb2', text: 'Operations check: 1-in-10 physical QC sample on dispatched orders. Bundle audit: all bundle listings rendering correctly, prices accurate, cross-links working.', note: '' },
    { id: 'mb3', text: 'Full week performance vs targets: orders, CTR, CVR, return rate, ad spend. Write actual vs target numbers. Compare to weekly targets from the 12-week plan.', note: '' },
    { id: 'mb4', text: 'Plan next week priorities: which SKUs get attention, price changes, ad budget adjustments. Write them down — not mental notes.', note: '' },
    { id: 'mb5', text: 'Archive daily log. Write Monday prep note.', note: '' },
  ],
};
const MEESHO_MUST = {
  Mon: ['Week Tracker spreadsheet fully filled', 'Hero/Support/Zero list updated — all 5 Heroes confirmed', 'Written price + image plan (3+ price, 2+ image actions)', 'Review plan drafted', '(Week 5+) Weekend ad data checked'],
  Tue: ['2-3 Zero/Support SKUs have new main images LIVE', 'All new image text overlays readable at 120×120', '3 Hero descriptions rewritten benefit-first', 'Competitor price sheet updated'],
  Wed: ['Competitor price matrix complete for all Hero SKUs with decisions documented', '(Week 5+) ACOS calculated and Stop-Loss flags identified', 'Agency has WRITTEN brief', 'F&F pool briefed individually', '(Week 2+) Stock check done'],
  Thu: ['1-2 bundles created/optimized with value proposition images (Week 4+)', 'Mid-week Stop-Loss check complete', 'Reviews coordinated for Hero SKU'],
  Fri: ['Return reasons categorized and descriptions updated', 'Image-product QC check complete', 'All 12 reviews confirmed or follow-up sent', 'Stock cover confirmed on all Hero + bundles', 'ALL listing changes LIVE'],
  Sat: ['Physical inventory count done — system vs actual reconciled', '1-in-10 QC sample done', 'Full week analysis written with actual vs target', 'Next week priorities documented', 'Log archived'],
};
const MEESHO_SCORECARD = [
  { key: 'orders',      label: 'Orders This Week',           ph: '0' },
  { key: 'target',      label: 'Weekly Target',              ph: '0' },
  { key: 'ctr',         label: 'Avg CTR (%)',                ph: '0.00' },
  { key: 'cvr',         label: 'Avg CVR (%)',                ph: '0.00' },
  { key: 'adSpend',     label: 'Total Ad Spend (₹)',         ph: '0 (Wk5+ only)' },
  { key: 'adRevenue',   label: 'Total Ad Revenue (₹)',       ph: '0 (Wk5+ only)' },
  { key: 'acos',        label: 'ACOS (%)',                   ph: '0.00 (Wk5+ only)' },
  { key: 'returns',     label: 'Returns This Week',          ph: '0' },
  { key: 'hero1',       label: 'TRCB100 CVR (%)',            ph: '0.00' },
  { key: 'hero2',       label: 'TRCC100 CVR (%)',            ph: '0.00' },
  { key: 'reviewsLive', label: 'Reviews Placed This Week',   ph: '0 / 12' },
  { key: 'wins',        label: 'Top 3 Wins',                 ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'misses',      label: 'Top 3 Misses',               ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'decision',    label: 'Founder Decision Needed',    ph: '...', ml: true },
  { key: 'stopLoss',    label: 'Stop-Loss Rule Triggered?',  ph: 'None / Rule #1-6' },
];
const MEESHO_TRIGGERED = [
  { id: 1, level: 'red',   text: 'STOP-LOSS RULE 1: ACOS above 35% for 3 consecutive days → PAUSE the ad immediately. No exceptions.' },
  { id: 2, level: 'red',   text: 'STOP-LOSS RULE 2: CVR below 1.5% on any Hero SKU for 2 consecutive days → stop all image/ad changes. Fix listing content FIRST.' },
  { id: 3, level: 'red',   text: 'STOP-LOSS RULE 3: Return rate above 20% → delist or fix immediately. Meesho suppresses listing above 20% return rate.' },
  { id: 4, level: 'red',   text: 'STOP-LOSS RULE 4: Zero sales on Hero SKU for 3 consecutive days → check price vs competitors, category mapping, and listing active status.' },
  { id: 5, level: 'red',   text: 'STOP-LOSS RULE 5: Stock below 14 days cover → alert founder TODAY. Weekend stock-out triggers 45-60 day ranking penalty.' },
  { id: 6, level: 'red',   text: 'STOP-LOSS RULE 6: Ad spend exceeds 15% of weekly revenue → scale back ad budget immediately to stay profitable.' },
  { id: 7, level: 'amber', text: 'CVR below 1.5% (day 1) → monitor closely. If day 2 also below 1.5% → Stop-Loss Rule 2 fires.' },
  { id: 8, level: 'amber', text: 'ACOS above 35% (days 1-2) → flag. If day 3 still >35% → Stop-Loss Rule 1 fires — pause immediately.' },
  { id: 9, level: 'green', text: 'ACOS below 20% for 2+ weeks → increase ad budget 25% on that SKU' },
  { id: 10, level: 'green', text: 'Hero SKU CVR above 10% → this SKU can handle more ad spend. Increase bid 10-15%.' },
];
const MEESHO_WEEK_DATA = [
  { n:1,  title:'FOUNDATION — PRICE & IMAGE FIX', desc:'Phase 1: Fix prices + images, no ads. Hero hair oils to ₹149. Fix all 7 sold product images.', nonNeg:'All Hero hair oils priced at ₹149. Main images fixed on all 7 sold products.', budgets:{starter:0,growth:0,scale:0}, ws:{ Mon:[{id:1,text:'Set all 5 Hero hair oils to ₹149. Fix main images on all 7 previously sold products.',note:''},{id:2,text:'Correct categories for all active SKUs',note:''}], Tue:[{id:1,text:'Freshness edit all 34 listings: price tweak, title swap, or tag rotation on every single listing',note:''},{id:2,text:'Reviews only on Hero SKUs this week: TRCB100 gets 2 reviews',note:''}], Wed:[{id:1,text:'Check and correct categories for all active SKUs: hair oils must be in Hair Care > Hair Oil',note:''}], Thu:[{id:1,text:'Add "Suitable for all hair types" or specific type to every Hero description',note:''}], Fri:[{id:1,text:'Image QC: shrink each Hero image to 120×120. Is benefit text readable?',note:''}], Sat:[{id:1,text:'Week 1 scoreboard: orders vs 5-8 target. CTR target 0.5%.',note:''}] }},
  { n:2,  title:'FOUNDATION — TAGS & HERO LOCK', desc:'Phase 1: Add 15-20 tags per SKU, confirm final 5 Hero SKUs, start probation list.', nonNeg:'All 34 SKUs have 15-20 tags. Final 5 Hero SKUs confirmed.', budgets:{starter:0,growth:0,scale:0}, ws:{ Mon:[{id:1,text:'Add 15-20 tags per SKU: benefit tags, ingredient tags, hair type tags, use-case tags',note:''}], Tue:[{id:1,text:'Confirm final 5 Hero SKUs using 6 Hero criteria. Any SKU not meeting 4 of 6 → Support tier.',note:''}], Wed:[{id:1,text:'Replace images on any SKU with CTR below 1% — new image must have benefit text overlay',note:''}], Thu:[{id:1,text:'Start probation list: SKUs with 0 clicks in 14 days = dead. 20+ clicks no sale = broken.',note:''}], Fri:[{id:1,text:'Stock check: all Hero SKUs must have 21-day cover',note:''}], Sat:[{id:1,text:'Week 2 scoreboard: orders vs 8-12 target. CTR target 0.7%.',note:''}] }},
  { n:3,  title:'OPTIMIZATION — PRICE TEST', desc:'Phase 2: Test ₹149 vs ₹175 on Hero SKUs. Check return reasons.', nonNeg:'Price A/B test running on at least 3 Hero SKUs', budgets:{starter:0,growth:0,scale:0}, ws:{ Mon:[{id:1,text:'Test ₹149 vs ₹175 on Hero SKUs: ₹149 for Days 1-3, ₹175 for Days 4-6',note:''}], Tue:[{id:1,text:'Check return reasons from last 2 weeks. Any pattern? Fix descriptions.',note:''}], Wed:[{id:1,text:'Add usage clarity to descriptions: "How to use", step-by-step, expected results',note:''}], Thu:[{id:1,text:'Review agency briefing: written brief with SKUs, angles, city spread',note:''}], Fri:[{id:1,text:'Stock check: all Hero SKUs 21-day cover minimum',note:''}], Sat:[{id:1,text:'Week 3 scoreboard: orders vs 12-18 target. CVR target 1.2%, CTR 0.8%.',note:''}] }},
  { n:4,  title:'OPTIMIZATION — BUNDLE LAUNCH', desc:'Phase 2: Create 3 bundles. Bundle images must show what\'s inside.', nonNeg:'3 bundles live: Buy 2 Save ₹50 at ₹249, Complete Hair Care at ₹349, Family Pack 3pc at ₹349', budgets:{starter:0,growth:0,scale:0}, ws:{ Mon:[{id:1,text:'Create bundle 1: "Buy 2 Save ₹50" — 2 Hero hair oils at ₹249',note:''}], Tue:[{id:1,text:'Create bundle 2: "Complete Hair Care" — 3 complementary products at ₹349',note:''}], Wed:[{id:1,text:'Create bundle 3: "Family Pack 3pc" — 3 units at ₹349',note:''}], Thu:[{id:1,text:'Bundle images: show all products clearly. Add "Save ₹X vs buying separately" overlay.',note:''}], Fri:[{id:1,text:'Cross-link all bundles: bundle descriptions link to singles, single descriptions link to bundles',note:''}], Sat:[{id:1,text:'Week 4 scoreboard: orders vs 18-25 target. CVR target 1.5%.',note:''}] }},
  { n:5,  title:'FIRE — FIRST ADS', desc:'Phase 3: First ads live at ₹50/day on top 2 Heroes only. STOP-LOSS sacred.', nonNeg:'Ads live on TRCB100 + TRCC100 only. ACOS monitored daily.', budgets:{starter:300,growth:300,scale:300}, ws:{ Mon:[{id:1,text:'Launch Meesho Ads on TRCB100 (Coconut Basil Hair Oil) at ₹50/day',note:'STOP-LOSS: ACOS >35% for 3 days = PAUSE immediately'},{id:2,text:'Launch Meesho Ads on TRCC100 (Coconut Curry Leaves) at ₹50/day second',note:'Never advertise a SKU that hasn\'t sold 3+ times organically'}], Tue:[{id:1,text:'Ad spend check: must never exceed 15% of weekly revenue',note:''}], Wed:[{id:1,text:'First ad ACOS check: Mon-Tue data. Any approaching 35%? Flag it.',note:''}], Thu:[{id:1,text:'Use best A/B test image from Week 3 as the ad creative',note:''}], Fri:[{id:1,text:'Weekend ad tune: Heroes with strong CVR get bid boost for Saturday',note:''}], Sat:[{id:1,text:'Week 5 scoreboard: orders vs 25-35 target. ACOS ≤35%.',note:''}] }},
  { n:6,  title:'FIRE — SCALE IF PROFITABLE', desc:'Phase 3: If both SKUs profitable (ACOS <30%) → scale top to ₹75/day.', nonNeg:'Ad scaling decision made: scale winner, kill loser, or both paused.', budgets:{starter:300,growth:525,scale:750}, ws:{ Mon:[{id:1,text:'Decision: if both SKUs ACOS <30% → scale top to ₹75/day. If one → kill loser, scale winner. If both bad → PAUSE and fix listing first.',note:''}], Wed:[{id:1,text:'If scaling: verify ACOS stays below 30% at higher budget',note:''}], Fri:[{id:1,text:'Weekend ad performance review',note:''}], Sat:[{id:1,text:'Week 6 scoreboard: orders vs 35-50 target. ACOS ≤30%.',note:''}], Tue:[], Thu:[] }},
  { n:7,  title:'VOLUME — BUNDLE PUSH', desc:'Phase 4: Bundle push. Ad budget ₹100/day: ₹50 top Hero + ₹30 second Hero + ₹20 best bundle.', nonNeg:'Bundle CVR should be 2× single-unit CVR. Refresh bundle images with lifestyle photos.', budgets:{starter:600,growth:600,scale:600}, ws:{ Mon:[{id:1,text:'Split ad budget: ₹50 TRCB100 + ₹30 TRCC100 + ₹20 best bundle',note:''}], Tue:[{id:1,text:'Refresh bundle images with lifestyle photos: family hair oiling scene, before/after',note:''}], Wed:[{id:1,text:'Bundle CVR check: is bundle CVR 2× single-unit CVR? If not, refresh bundle image and price.',note:''}], Fri:[{id:1,text:'Catalog hygiene: review bottom 10% SKUs by sales velocity — candidates for retirement',note:''}], Sat:[{id:1,text:'Week 7 scoreboard: orders vs 50-70 target. ACOS ≤28%.',note:''}], Thu:[] }},
  { n:8,  title:'VOLUME — LOCK FINAL PRICES', desc:'Phase 4: Lock final prices. Edit ALL 34 listings this week. Retire bottom 5 non-performers.', nonNeg:'ALL 34 listings edited this week (5/day). Bottom 5 non-performers retired.', budgets:{starter:600,growth:900,scale:900}, ws:{ Mon:[{id:1,text:'Lock final prices for all Hero SKUs and bundles — no more price testing after this',note:''}], Tue:[{id:1,text:'Edit listings Days 1-5: 5 listings/day for all 34 active listings',note:''}], Wed:[{id:1,text:'Clean ad keywords: pause any keyword that spent ₹200+ with ACOS >40%',note:''}], Thu:[{id:1,text:'Retire bottom 5 non-performers: 0 sales in 4 weeks + <200 impressions = kill list',note:''}], Fri:[{id:1,text:'Review all 34 listings edited this week — confirm quality',note:''}], Sat:[{id:1,text:'Week 8 scoreboard: orders vs 70-90 target. ACOS ≤25%.',note:''}] }},
  { n:9,  title:'SCALING — ₹200/DAY ADS', desc:'Phase 5: Hero 1 gets ₹100/day, Hero 2 gets ₹60/day, Bundle gets ₹40/day. Daily ad check mandatory.', nonNeg:'Daily ad check mandatory at this spend level. Any ACOS >30% for 3 days → pause.', budgets:{starter:900,growth:1200,scale:1200}, ws:{ Mon:[{id:1,text:'Scale to ₹200/day: TRCB100 ₹100 + TRCC100 ₹60 + best bundle ₹40',note:''},{id:2,text:'ACOS >30% for 3 days → pause immediately',note:''}], Wed:[{id:1,text:'Daily ad check: ACOS, spend vs orders for each active ad campaign',note:''}], Thu:[{id:1,text:'Push Hero SKU 1 (TRCB100) to 15+ reviews',note:''}], Fri:[{id:1,text:'Zero bundle sales in 14 days = retire. Return rate above 20% = delist.',note:''}], Sat:[{id:1,text:'Week 9 scoreboard: orders vs 90-120 target. ACOS ≤25%.',note:''}], Tue:[] }},
  { n:10, title:'SCALING — PRICE DROP SPIKE', desc:'Phase 5: 48-hour price drop on Hero 1 to spike orders. Test ₹149 vs ₹159 vs ₹169 on Hero 2.', nonNeg:'48-hour price drop executed on TRCB100. Price test running on TRCC100.', budgets:{starter:1200,growth:1200,scale:1200}, ws:{ Mon:[{id:1,text:'Execute 48-hour price drop on TRCB100 to spike orders and boost ranking',note:''}], Wed:[{id:1,text:'Test ₹149 vs ₹159 vs ₹169 on TRCC100 — 2 days each',note:''}], Fri:[{id:1,text:'5-image upgrade for top 5-6 money-maker SKUs',note:''}], Sat:[{id:1,text:'Week 10 scoreboard: orders vs 120-150 target. ACOS ≤22%.',note:''}], Tue:[], Thu:[] }},
  { n:11, title:'MAX — MARGIN OPTIMIZATION', desc:'Phase 6: Calculate true profit per SKU. Cut return rate. Shift budget to highest-margin SKU.', nonNeg:'True profit calculated for every Hero SKU. Budget shifted to highest-margin.', budgets:{starter:1500,growth:1800,scale:1800}, ws:{ Mon:[{id:1,text:'Calculate true profit per SKU: revenue - COGS - ad spend - return cost - platform fee',note:''}], Wed:[{id:1,text:'Shift ₹50/day from lowest-margin to highest-margin SKU',note:''}], Thu:[{id:1,text:'Rank Blitz: pick 1 keyword, push flash pricing + extra freshness + review push for page 1',note:''}], Fri:[{id:1,text:'Launch "Premium" Choco Coffee / Neem variant at +25% price to anchor regular as a deal',note:''}], Sat:[{id:1,text:'Week 11 scoreboard: orders vs 150-180 target. ACOS ≤20%.',note:''}], Tue:[] }},
  { n:12, title:'MAX — LOCK & AUDIT', desc:'Phase 6: Run full 12-week audit. Plan next quarter: 3-5 new variants, new bundles, explore hair serums category.', nonNeg:'12-week audit document complete. Q2 plan written.', budgets:{starter:1800,growth:1800,scale:1800}, ws:{ Mon:[{id:1,text:'Run full 12-week audit: orders by week, CVR trend, ACOS trend, review count, return rate',note:''}], Tue:[{id:1,text:'Finalize kill list: SKUs with 0 sales in 4 weeks + <200 impressions = archive',note:''}], Wed:[{id:1,text:'Lock prices for Q2. No more price experiments until Q2 review.',note:''}], Fri:[{id:1,text:'Write Q2 plan: 3-5 new variants, new bundles, explore hair serums category',note:''},{id:2,text:'Write maintenance protocol: steady-state weekly routine for Month 4+',note:''}], Sat:[{id:1,text:'Week 12 scoreboard: orders vs 150-180 target. ACOS ≤20%.',note:''}], Thu:[] }},
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
  { id: 'sr1', text: 'Order Processing (10 min, 4:00 PM): check new orders. Print labels. Confirm dispatch.', note: '' },
  { id: 'sr2', text: 'Freshness Edit (15 min, 4:10 PM): ONE small edit on 3 active listings. Change price by ₹1-5, OR update stock quantity by 1 unit (Friday), OR swap one tag/word.', note: 'NON-NEGOTIABLE. Do at 4:10 PM every day.' },
  { id: 'sr3', text: 'Buyer Message Check (5 min, 4:25 PM): answer all buyer questions. Zero unanswered messages.', note: '' },
  { id: 'sr4', text: 'Numbers Glance (5 min, 4:30 PM): check yesterday\'s sales, CTR, impressions. Flag any Stop-Loss condition.', note: '' },
];
const SNAPDEAL_BASE = {
  Mon: [
    { id: 'sb1', text: 'Pull Sat+Sun numbers: orders, CTR, returns, ad spend vs sales. Write in log.', note: '[MUST]' },
    { id: 'sb2', text: 'Competitor price scan on "face wash" keywords. Position Hero SKU at rank 3-5 cheapest: if already in top 3, raise ₹10-15; if outside top 10, lower ₹15-20.', note: '[MUST][STOP-LOSS]' },
    { id: 'sb3', text: 'Refresh main image on 3 SKUs (Hero + 2 others) with gradient + overlay. Shrink to 120×120 — can you still read text?', note: '[MUST]' },
    { id: 'sb4', text: 'Audit + update tags on same 3 SKUs — fill all 15-20 slots.', note: '[MUST]' },
    { id: 'sb5', text: 'Update Hero/Support/Zero SKU list using 6 Hero rules and 3+ Zero failure rules.', note: '' },
    { id: 'sb6', text: 'Write this week\'s price and image plan.', note: '' },
  ],
  Tue: [
    { id: 'sb1', text: 'Refresh Variety Bundle + combo images. Add value overlays: "Buy separately: ₹350 | Bundle: ₹299 | Save: ₹51".', note: '[MUST]' },
    { id: 'sb2', text: 'Edit 3 more listings (different SKUs from Monday). Tuesday freshness = swap order of 2 tags.', note: '[MUST]' },
    { id: 'sb3', text: 'Inventory check: confirm 14-day minimum stock cover on ALL Hero SKUs and bundles.', note: '[MUST]' },
    { id: 'sb4', text: 'Order pipeline review + return reasons audit. Categorize return reasons. Identify patterns.', note: '' },
    { id: 'sb5', text: 'If combo sales below 20% of total: make bundles visible in main images, add "Save ₹X" badge, mention combo in first bullet.', note: '[WARNING]' },
  ],
  Wed: [
    { id: 'sb1', text: 'Apply ALL 3 Snapdeal stop-loss rules to every active campaign. ₹200 spent + 0 sales = PAUSE. ROAS <1.5× for 5 days = PAUSE. CTR <0.4% for 3 days = reduce bid 20%.', note: '[MUST][DANGER]' },
    { id: 'sb2', text: 'Adjust bids: ROAS >3× = scale | 2-3× = hold | 1.5-2× = reduce | <1.5× = pause.', note: '[MUST]' },
    { id: 'sb3', text: 'Export 7-day ad data. CTR analysis — winners vs losers. Add worst keywords to negative list.', note: '[MUST]' },
    { id: 'sb4', text: 'Check text overlay readability at 120×120.', note: '' },
    { id: 'sb5', text: 'Document learnings in strategy log. What worked? What didn\'t?', note: '' },
  ],
  Thu: [
    { id: 'sb1', text: 'Identify products with genuine organic sales in past 7 days. Reviews ONLY go to products that have actually sold organically.', note: '[MUST][RULE]' },
    { id: 'sb2', text: 'Allocate this week\'s 12 reviews using priority table: Choco Coffee 4, Neem 3, Variety Bundle 2, Rotating 3. NEVER more than 12/week.', note: '[MUST][STOP-LOSS]' },
    { id: 'sb3', text: 'Send written brief to agency + brief friends/family pool individually. Each person gets: which SKU, which city, which angle.', note: '[MUST]' },
    { id: 'sb4', text: 'Trust badges, description polish, answer all pending Q&A. Add disclaimers if return rate above 12%.', note: '' },
    { id: 'sb5', text: 'Plan weekend bundle promotions — Friday freshness peaks Sat-Sun.', note: '' },
  ],
  Fri: [
    { id: 'sb1', text: 'Mass refresh 5+ SKUs: titles, descriptions, tags. Friday freshness = update stock quantity by 1 unit.', note: '[MUST]' },
    { id: 'sb2', text: 'Trending/seasonal tags + category mapping verify. Face Wash MUST be in Beauty > Skin Care > Face Wash. Wrong category = total invisibility.', note: '[MUST][STOP-LOSS]' },
    { id: 'sb3', text: 'Set weekend ad budgets (Sat-Sun coverage). Confirm Snapdeal wallet has enough balance.', note: '[MUST]' },
    { id: 'sb4', text: 'Inventory surge check: confirm Hero + bundle stock for weekend. Do NOT stock out.', note: '[MUST]' },
    { id: 'sb5', text: 'Do NOT edit 10+ listings. Five quality edits beat ten sloppy ones.', note: '[WARNING]' },
  ],
  Sat: [
    { id: 'sb1', text: 'Full week performance vs targets: CTR, AOV, ROAS, sales. Compare to week targets. Write actual vs target numbers.', note: '[MUST]' },
    { id: 'sb2', text: 'Update 12-week tracker. Identify next week\'s top 3 priorities — write them down, not mental notes.', note: '[MUST]' },
    { id: 'sb3', text: 'Plan next week\'s creatives and combos: which images to refresh, which bundles to push, which prices to test.', note: '[MUST]' },
    { id: 'sb4', text: 'Review "If This Then That" decision matrix — check all 11 conditions, take action on any that fired.', note: '[MUST][RULE]' },
    { id: 'sb5', text: 'Apply kill list scoring to all SKUs: Score 0-2 = kill | 3-4 = last chance | 8-10 = double down.', note: '' },
    { id: 'sb6', text: 'Archive this week\'s daily log. Write Monday prep note.', note: '' },
  ],
};
const SNAPDEAL_MUST = {
  Mon: ['Price check complete — Hero positioned 3rd to 5th cheapest', '3 SKU images refreshed', 'All 3 SKUs have 15-20 tags filled'],
  Tue: ['Bundle images refreshed with value overlay', '3 SKUs freshness edited (tag swap)', 'Inventory confirmed 14+ days on Hero + bundles'],
  Wed: ['All 3 stop-loss rules checked and applied', 'Bids adjusted based on ROAS', '7-day ad data exported and analyzed'],
  Thu: ['Organic-sale products identified for review allocation', 'All 12 reviews allocated and briefs sent', 'No review placed on a product with zero genuine sales'],
  Fri: ['5+ SKUs mass refreshed', 'Category mapping verified — all in correct category', 'Weekend ad budgets set and wallet topped up', 'Hero + bundle stock confirmed for weekend surge'],
  Sat: ['Full week analysis written with actual vs target numbers', 'Top 3 priorities for next week identified in writing', 'All 11 "If This Then That" conditions checked', 'Kill list scores updated for all SKUs'],
};
const SNAPDEAL_SCORECARD = [
  { key: 'orders',     label: 'Orders This Week',           ph: '0' },
  { key: 'target',     label: 'Weekly Target',              ph: '0' },
  { key: 'ctr',        label: 'Avg CTR (%)',                ph: '0.00' },
  { key: 'adSpend',    label: 'Total Ad Spend (₹)',         ph: '0' },
  { key: 'adRevenue',  label: 'Total Ad Revenue (₹)',       ph: '0' },
  { key: 'roas',       label: 'ROAS (×)',                   ph: '0.00' },
  { key: 'returnRate', label: 'Return Rate (%)',            ph: '0.00' },
  { key: 'aov',        label: 'Avg Order Value (₹)',        ph: '0' },
  { key: 'heroSales',  label: 'Choco Coffee Units Sold',    ph: '0' },
  { key: 'bundleSales',label: 'Variety Bundle Units Sold',  ph: '0' },
  { key: 'reviewsLive',label: 'Reviews Placed This Week',   ph: '0 / 12' },
  { key: 'wins',       label: 'Top 3 Wins',                 ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'misses',     label: 'Top 3 Misses',               ph: '1. ...\n2. ...\n3. ...', ml: true },
  { key: 'decision',   label: 'Founder Decision Needed',    ph: '...', ml: true },
  { key: 'stopLoss',   label: 'Stop-Loss Rule Triggered?',  ph: 'None / Rule #1-6' },
];
const SNAPDEAL_TRIGGERED = [
  { id: 1, level: 'red',   text: 'STOP-LOSS RULE 1: ₹200 spent + 0 sales → PAUSE immediately. Listing is broken.' },
  { id: 2, level: 'red',   text: 'STOP-LOSS RULE 2: ROAS below 1.5× for 5 consecutive days → PAUSE and fix conversion. Losing money.' },
  { id: 3, level: 'red',   text: 'STOP-LOSS RULE 3: CTR below 0.4% for 3 consecutive days → reduce bid 20% AND change main image.' },
  { id: 4, level: 'red',   text: 'STOP-LOSS RULE 4: 0 sales for 3 consecutive days → check price, category, listing active status immediately.' },
  { id: 5, level: 'red',   text: 'STOP-LOSS RULE 5: Return rate above 15% → check reasons. Fix images/packaging/description.' },
  { id: 6, level: 'red',   text: 'STOP-LOSS RULE 6: Ad spend above 3× daily budget → PAUSE ALL ads. Fix cause. Restart tomorrow.' },
  { id: 7, level: 'amber', text: 'CTR in yellow zone (0.4-0.8%) → improve main image. Target ≥0.8%.' },
  { id: 8, level: 'amber', text: 'ROAS in yellow zone (1.5-2.5×) → reduce bid, do not scale yet. Target ≥2.5×.' },
  { id: 9, level: 'amber', text: 'Return rate in yellow zone (12-15%) → audit return reasons, fix within 48h.' },
  { id: 10, level: 'green', text: 'Category rank < 50: scale ad budget 20% → execute Monday.' },
  { id: 11, level: 'green', text: 'ROAS > 3× for 5+ days: increase ad budget 25% → execute Wednesday.' },
];
const SNAPDEAL_WEEK_DATA = [
  { n:1,  title:'PHASE 1 — FOUNDATION: LOCK HERO SKU', desc:'No ads. Lock Choco Coffee as Hero SKU. Create Variety Power Pack bundle at ₹299. Freshness 3 SKUs/day at 4:30 PM.', nonNeg:'Choco Coffee locked as Hero. Variety Power Pack (₹299) listed. All 20 tag slots filled.', budgets:{starter:0,growth:0,scale:0}, ws:{ Mon:[{id:1,text:'Lock Choco Coffee Face Wash 150ml as Hero SKU. Update main image with gradient + overlay.',note:''},{id:2,text:'Fill all 20 tag slots for Hero SKU',note:''}], Tue:[{id:1,text:'Create Variety Power Pack bundle: Choco Coffee + Neem at ₹299',note:''}], Wed:[{id:1,text:'Verify category: Beauty > Skin Care > Face Wash for Hero SKU',note:'Wrong category = total invisibility'}], Thu:[], Fri:[{id:1,text:'Freshness check: 3 SKUs/day edited at 4:30 PM this week. All confirmed?',note:''}], Sat:[{id:1,text:'Week 1 scoreboard: orders vs 8-12 target. No ads this week.',note:''}] }},
  { n:2,  title:'PHASE 1 — FOUNDATION: IMAGE A/B TEST', desc:'No ads. Launch Variety Bundle. A/B test Hero main image. Optimize titles.', nonNeg:'Variety Bundle live. A/B test started. Hero title follows formula: [Brand]+[Benefit]+[Product]+[Ingredient]+[Size].', budgets:{starter:0,growth:0,scale:0}, ws:{ Mon:[{id:1,text:'Launch Variety Power Pack bundle in Snapdeal catalog',note:''}], Tue:[{id:1,text:'A/B test Hero main image: ingredient focus vs results focus',note:''}], Wed:[{id:1,text:'Optimize Hero title: Treyfa + [Benefit] + Face Wash + [Key Ingredient] + 150ml',note:''}], Thu:[{id:1,text:'15-min competitor price check on "face wash" — position Hero 3rd-5th cheapest',note:''}], Fri:[], Sat:[{id:1,text:'Week 2 scoreboard: orders vs 10-15 target.',note:''}] }},
  { n:3,  title:'PHASE 1 — FOUNDATION: FIRST AD (₹67/DAY)', desc:'First Sponsored Product ad for Hero SKU only at ₹67/day. Launch 3-Pack Family Saver at ₹399.', nonNeg:'Hero SKU ad live at ₹67/day. 3-Pack Family Saver (₹399) listed. Daily ad check at 4:15 PM.', budgets:{starter:469,growth:469,scale:469}, ws:{ Mon:[{id:1,text:'Launch first Sponsored Product ad for Choco Coffee Face Wash only at ₹67/day',note:'Daily 4:15 PM check: ₹200 spent with 0 sales = PAUSE immediately'}], Tue:[{id:1,text:'Write SEO descriptions — benefit-led, keywords 2-3 times naturally',note:''}], Wed:[{id:1,text:'Launch 3-Pack "Family Saver" at ₹399',note:''}], Thu:[], Fri:[], Sat:[{id:1,text:'Week 3 scoreboard: orders vs 12-18 target. Ad spend ₹469.',note:''}] }},
  { n:4,  title:'PHASE 1 — FOUNDATION: TRUST BADGES', desc:'Add trust-badge images. Push all 3 review slots on best-sellers. Phase 1 audit on Day 6.', nonNeg:'Trust badge images uploaded. 8-10 Hero reviews live. Phase 1 audit written.', budgets:{starter:469,growth:469,scale:469}, ws:{ Mon:[{id:1,text:'Add trust-badge images: ingredient source, before/after, usage infographic',note:''}], Tue:[{id:1,text:'Push all 3 review slots on Hero SKU — target 8-10 Choco Coffee reviews',note:''}], Wed:[{id:1,text:'Optimize bundle image: show "Buy separately: ₹350 | Bundle: ₹299 | Save: ₹51"',note:''}], Thu:[], Fri:[], Sat:[{id:1,text:'PHASE 1 AUDIT: CTR, conversion rate, ROAS, sales actual vs targets. Write findings.',note:''},{id:2,text:'Week 4 scoreboard: orders vs 15-22 target.',note:''}] }},
  { n:5,  title:'PHASE 2 — IGNITION: SCALE ADS', desc:'Use best A/B test image as ad creative. Price test Days 3-4 vs Days 5-6.', nonNeg:'Best A/B test image deployed as ad creative. Price test running.', budgets:{starter:469,growth:469,scale:469}, ws:{ Mon:[{id:1,text:'Deploy best A/B test image as ad creative for Hero SKU',note:''}], Wed:[{id:1,text:'Price test: Days 1-2 at current price, Days 3-4 at current+₹10. Track conversion.',note:''}], Fri:[], Sat:[{id:1,text:'Week 5 scoreboard: orders vs 18-25 target.',note:''}], Tue:[], Thu:[] }},
  { n:6,  title:'PHASE 2 — IGNITION: BUNDLE ADS (₹134/DAY)', desc:'Add Variety Bundle to ad campaign. Build negative keyword list. Refresh images for 500+ impression SKUs with 0 clicks.', nonNeg:'Variety Bundle in ad campaign. Negative keyword list built.', budgets:{starter:938,growth:938,scale:938}, ws:{ Mon:[{id:1,text:'Add Variety Bundle to ad campaign — budget split: Hero ₹100/day + Bundle ₹34/day',note:''}], Wed:[{id:1,text:'Build negative keyword list from ad reports: keywords with 200+ impressions and 0 clicks',note:''}], Thu:[{id:1,text:'Refresh image for any SKU with 500+ impressions and 0 clicks',note:''}], Fri:[], Sat:[{id:1,text:'Week 6 scoreboard: orders vs 22-30 target.',note:''}], Tue:[] }},
  { n:7,  title:'PHASE 2 — IGNITION: SCALE IF ROAS >2.0×', desc:'Scale ad budget ONLY if Week 6 ROAS >2.0×. Track category rank every 2 days — goal is page 3.', nonNeg:'Ad scale decision made based on Week 6 ROAS. Category rank tracked.', budgets:{starter:938,growth:938,scale:938}, ws:{ Mon:[{id:1,text:'Decision: if Week 6 ROAS >2.0× → scale ad budget 20%. If not → hold.',note:''}], Tue:[{id:1,text:'Track category rank every 2 days — goal is page 3 for "face wash"',note:''}], Thu:[{id:1,text:'If any SKU sold 3+ in 7 days, add social proof to title: "1000+ sold"',note:''}], Fri:[], Sat:[{id:1,text:'Week 7 scoreboard: orders vs 25-35 target.',note:''}], Wed:[] }},
  { n:8,  title:'PHASE 2 — IGNITION: AUDIT (ROAS >2.5× = PHASE 3)', desc:'Ad creative refresh. Keyword harvesting. Lock winning price. Phase 2 audit: blended ROAS >2.5× = move to Phase 3.', nonNeg:'Ad creative refreshed. Phase 2 audit complete. Phase 3 decision made.', budgets:{starter:938,growth:938,scale:938}, ws:{ Mon:[{id:1,text:'Ad creative refresh: new image/headline for Hero ad',note:''}], Tue:[{id:1,text:'Keyword harvesting: mine ad reports, add converting keywords to organic titles and tags',note:''}], Wed:[{id:1,text:'Lock winning price from Week 5 test',note:''}], Fri:[], Sat:[{id:1,text:'PHASE 2 AUDIT: blended ROAS >2.5× = advance to Phase 3. Write audit findings.',note:''},{id:2,text:'Week 8 scoreboard: orders vs 30-40 target.',note:''}], Thu:[] }},
  { n:9,  title:'PHASE 3 — SCALE: CROSS-SELL BUNDLE', desc:'Cross-sell bundle: if face wash + hair oil sell together, create Skin+Hair Care Starter. Push Hero to 15+ reviews.', nonNeg:'Skin+Hair Care Starter bundle created. Hero at 15+ reviews.', budgets:{starter:700,growth:700,scale:700}, ws:{ Mon:[{id:1,text:'If face wash + hair oil sell together → create "Skin + Hair Care Starter" bundle',note:''}], Wed:[{id:1,text:'Push Hero Choco Coffee Face Wash to 15+ reviews',note:''}], Thu:[{id:1,text:'Draft kill list: SKUs with 0 sales in 4 weeks + <200 impressions = watch list',note:''}], Fri:[], Sat:[{id:1,text:'Week 9 scoreboard: orders vs 35-45 target.',note:''}], Tue:[] }},
  { n:10, title:'PHASE 3 — SCALE: BUNDLE-FIRST ADS', desc:'Bundle-first ads. Price leadership test: drop Hero ₹5-10 for 72 hours as "Limited Offer". 5-image upgrade for top SKUs.', nonNeg:'Bundle-first ad running. 72-hour price drop test executed. 5-image upgrade done on top 5 SKUs.', budgets:{starter:700,growth:700,scale:700}, ws:{ Mon:[{id:1,text:'Switch to bundle-first ads: Variety Bundle as primary ad, Hero as secondary',note:''}], Tue:[{id:1,text:'Price leadership test: drop Hero ₹5-10 for 72 hours as "Limited Offer"',note:''}], Thu:[{id:1,text:'5-image upgrade for top 5-6 money-maker SKUs',note:''}], Fri:[], Sat:[{id:1,text:'Week 10 scoreboard: orders vs 40-55 target.',note:''}], Wed:[] }},
  { n:11, title:'PHASE 3 — SCALE: RANK BLITZ', desc:'Rank Blitz: pick 1 keyword, push flash pricing + extra freshness + review push. Launch Premium variant.', nonNeg:'Rank Blitz executed for 1 keyword. Premium Choco Coffee variant listed.', budgets:{starter:700,growth:700,scale:700}, ws:{ Mon:[{id:1,text:'Rank Blitz: pick 1 keyword. Push flash pricing + extra freshness + review push simultaneously for page 1.',note:''}], Wed:[{id:1,text:'Launch "Premium" Choco Coffee variant at +25% price to anchor regular as a deal',note:''}], Fri:[], Sat:[{id:1,text:'Week 11 scoreboard: orders vs 45-60 target.',note:''}], Tue:[], Thu:[] }},
  { n:12, title:'PHASE 3 — SCALE: LOCK PRICES & AUDIT', desc:'Lock prices for Q2. Finalize kill list. Write Q2 plan. Full account audit.', nonNeg:'Q2 prices locked. Kill list finalized. Q2 plan written. Full audit complete.', budgets:{starter:700,growth:700,scale:700}, ws:{ Mon:[{id:1,text:'Lock prices for Q2 — no more price experiments until Q2 review',note:''}], Tue:[{id:1,text:'Finalize kill list: archive all SKUs with 0 sales in 4+ weeks',note:''}], Wed:[{id:1,text:'Full account audit: CTR, ROAS, return rate, AOV, revenue by SKU',note:''}], Fri:[{id:1,text:'Write Q2 plan: target orders, budget, new SKUs to test, bundle strategy',note:''}], Sat:[{id:1,text:'Week 12 scoreboard: orders vs 50-65 target.',note:''}], Thu:[] }},
];

// ── Platform Plan Config ──────────────────────────────────────────────────────

const PLATFORM_PLAN_CONFIG = {
  Amazon: {
    color: '#FF9900',
    budgetLabels: ['conservative', 'base', 'aggressive'],
    emptyKpi: { units: '', sessions: '', unitSession: '', adSpend: '', adRevenue: '', acos: '', returns: '' },
    getKpiFields: (week, budget) => [
      { key: 'units',       label: 'Units Sold',           hint: 'Daily units sold',                   placeholder: '0' },
      { key: 'sessions',    label: 'Sessions',              hint: 'Total visits today',                 placeholder: '0' },
      { key: 'unitSession', label: 'Unit Session % (CVR)',  hint: 'DANGER <4% for 2 days (Rule 1)',    placeholder: '0.00' },
      { key: 'acos',        label: 'ACOS (%)',              hint: 'DANGER >40% for 5 days (Rule 2)',   placeholder: '0.00' },
      { key: 'adSpend',     label: 'Ad Spend (₹)',          hint: `Budget: ₹${week?.budgets?.[budget]?.toLocaleString?.() || '—'}`, placeholder: '0' },
      { key: 'adRevenue',   label: 'Ad Revenue (₹)',        hint: 'From Sponsored Products',            placeholder: '0' },
      { key: 'returns',     label: 'Returns Today',         hint: 'Count of returns received',          placeholder: '0' },
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
      if (key === 'unitSession' && parseFloat(kpi[key]) < 4   && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'unitSession' && parseFloat(kpi[key]) < 8   && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'acos'        && parseFloat(kpi[key]) > 40  && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'acos'        && parseFloat(kpi[key]) >= 30 && kpi[key]) return 'border-amber-300 bg-amber-50';
      return 'border-gray-200';
    },
  },
  Flipkart: {
    color: '#2874f0',
    budgetLabels: ['conservative', 'base', 'aggressive'],
    emptyKpi: { units: '', sessions: '', cvr: '', adSpend: '', adRevenue: '', acos: '', returns: '' },
    getKpiFields: (week, budget) => [
      { key: 'units',   label: 'Units Sold',           hint: 'Daily units sold',                   placeholder: '0' },
      { key: 'sessions',label: 'Sessions',              hint: 'Total visits today',                 placeholder: '0' },
      { key: 'cvr',     label: 'CVR (%)',               hint: 'DANGER <4% for 2 days (Rule 1)',    placeholder: '0.00' },
      { key: 'acos',    label: 'ACOS (%)',              hint: 'DANGER >40% for 5 days (Rule 2)',   placeholder: '0.00' },
      { key: 'adSpend', label: 'Ad Spend (₹)',          hint: `Budget: ₹${week?.budgets?.[budget]?.toLocaleString?.() || '—'}`, placeholder: '0' },
      { key: 'adRevenue',label: 'Ad Revenue (₹)',       hint: 'From PLA campaigns',                 placeholder: '0' },
      { key: 'returns', label: 'Returns Today',         hint: 'Count of returns received',          placeholder: '0' },
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
      const cvr = parseFloat(kpi.cvr), acos = parseFloat(kpi.acos);
      if (!isNaN(cvr)  && cvr < 4  && kpi.cvr)  a.push({ level: 'red',   text: `⛔ STOP-LOSS RULE 1: CVR ${cvr}% — below 4%. Stop all listing/ad changes. Fix content FIRST.` });
      if (!isNaN(acos) && acos > 40 && kpi.acos) a.push({ level: 'red',   text: `⛔ STOP-LOSS RULE 2: ACOS ${acos}% — above 40%. If 5 consecutive days → pause campaign immediately.` });
      if (!isNaN(cvr)  && cvr < 8  && cvr >= 4 && kpi.cvr) a.push({ level: 'amber', text: `⚠️ CVR WARNING ${cvr}%: Below 8% — monitor closely. If drops below 4% for 2 days → Stop-Loss Rule 1 fires.` });
      if (!isNaN(acos) && acos >= 30 && acos <= 40 && kpi.acos) a.push({ level: 'amber', text: `⚠️ ACOS WARNING ${acos}%: Approaching 40% danger zone. Monitor closely.` });
      return a;
    },
    evalGood: (kpi) => {
      const g = [];
      const acos = parseFloat(kpi.acos), cvr = parseFloat(kpi.cvr);
      if (!isNaN(acos) && acos < 20 && kpi.acos) g.push(`💰 ACOS ${acos}% — excellent! Eligible for budget increase on this campaign.`);
      if (!isNaN(cvr)  && cvr >= 10 && kpi.cvr)  g.push(`🚀 CVR ${cvr}% — strong! Scale budget on winning campaigns.`);
      return g;
    },
    inputColor: (key, kpi) => {
      if (key === 'cvr'  && parseFloat(kpi[key]) < 4  && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'cvr'  && parseFloat(kpi[key]) < 8  && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'acos' && parseFloat(kpi[key]) > 40 && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'acos' && parseFloat(kpi[key]) >= 30 && kpi[key])return 'border-amber-300 bg-amber-50';
      return 'border-gray-200';
    },
  },
  Meesho: {
    color: '#f43397',
    budgetLabels: ['starter', 'growth', 'scale'],
    emptyKpi: { orders: '', ctr: '', cvr: '', adSpend: '', acos: '', returns: '' },
    getKpiFields: (week, budget) => [
      { key: 'orders',  label: 'Orders Today',     hint: 'Daily orders received',              placeholder: '0' },
      { key: 'ctr',     label: 'CTR (%)',           hint: 'Target ≥0.5% (Wk1), ≥0.8% (Wk3+)', placeholder: '0.00' },
      { key: 'cvr',     label: 'CVR (%)',           hint: 'DANGER <1.5% for 2 days (Rule 2)',   placeholder: '0.00' },
      { key: 'adSpend', label: 'Ad Spend (₹)',      hint: `Budget: ₹${week?.budgets?.[budget]?.toLocaleString?.() || 'No ads yet (Wk1-4)'}`, placeholder: '0' },
      { key: 'acos',    label: 'ACOS (%)',          hint: 'DANGER >35% for 3 days (Rule 1) — Wk5+ only', placeholder: '0.00' },
      { key: 'returns', label: 'Returns Today',     hint: 'DANGER >20% return rate (Rule 3)',   placeholder: '0' },
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
      const cvr = parseFloat(kpi.cvr), acos = parseFloat(kpi.acos);
      if (!isNaN(cvr)  && cvr < 1.5 && kpi.cvr)  a.push({ level: 'red',   text: `⛔ STOP-LOSS RULE 2: CVR ${cvr}% — below 1.5%. Stop all image/ad changes. Fix listing content FIRST.` });
      if (!isNaN(acos) && acos > 35 && kpi.acos)  a.push({ level: 'red',   text: `⛔ STOP-LOSS RULE 1: ACOS ${acos}% — above 35%. If 3 consecutive days → PAUSE immediately.` });
      if (!isNaN(cvr)  && cvr < 3   && cvr >= 1.5 && kpi.cvr) a.push({ level: 'amber', text: `⚠️ CVR WARNING ${cvr}%: Below 3% — below target. Monitor closely.` });
      if (!isNaN(acos) && acos > 25 && acos <= 35 && kpi.acos) a.push({ level: 'amber', text: `⚠️ ACOS WARNING ${acos}%: Approaching 35% danger zone. Monitor closely.` });
      return a;
    },
    evalGood: (kpi) => {
      const g = [];
      const acos = parseFloat(kpi.acos), cvr = parseFloat(kpi.cvr);
      if (!isNaN(acos) && acos < 20 && kpi.acos) g.push(`💰 ACOS ${acos}% — efficient! Eligible to increase ad budget 25%.`);
      if (!isNaN(cvr)  && cvr >= 10 && kpi.cvr)  g.push(`🚀 CVR ${cvr}% — Hero SKU strong! Scale bid +10-15%.`);
      return g;
    },
    inputColor: (key, kpi) => {
      if (key === 'cvr'  && parseFloat(kpi[key]) < 1.5 && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'cvr'  && parseFloat(kpi[key]) < 3   && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'acos' && parseFloat(kpi[key]) > 35  && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'acos' && parseFloat(kpi[key]) > 25  && kpi[key]) return 'border-amber-300 bg-amber-50';
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
    emptyKpi: { orders: '', ctr: '', adSpend: '', adRevenue: '', returnRate: '', aov: '' },
    getKpiFields: (week, budget) => [
      { key: 'orders',     label: 'Orders Today',        hint: 'Daily orders received',                          placeholder: '0' },
      { key: 'ctr',        label: 'CTR (%)',              hint: 'GREEN ≥0.8% | YELLOW 0.4-0.8% | RED <0.4%',    placeholder: '0.00' },
      { key: 'adSpend',    label: 'Ad Spend (₹)',         hint: `Budget: ₹${week?.budgets?.[budget]?.toLocaleString?.() || 'No ads Wk1-2'}`, placeholder: '0' },
      { key: 'adRevenue',  label: 'Ad Revenue (₹)',       hint: 'ROAS = Ad Revenue ÷ Ad Spend',                  placeholder: '0' },
      { key: 'returnRate', label: 'Return Rate (%)',      hint: 'GREEN ≤12% | YELLOW 12-15% | RED >15%',         placeholder: '0.00' },
      { key: 'aov',        label: 'Avg Order Value (₹)',  hint: 'GREEN ≥₹250 | YELLOW ₹175-250 | RED <₹175',    placeholder: '0' },
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
      const ctr = parseFloat(kpi.ctr), ret = parseFloat(kpi.returnRate), aov = parseFloat(kpi.aov);
      const spend = parseFloat(kpi.adSpend), rev = parseFloat(kpi.adRevenue);
      const roas = (!isNaN(spend) && !isNaN(rev) && spend > 0) ? rev / spend : NaN;
      if (!isNaN(ctr) && ctr < 0.4  && kpi.ctr)        a.push({ level: 'red',   text: `⛔ STOP-LOSS RULE 3: CTR ${ctr}% — below 0.4% for 3 days → reduce bid 20% AND change main image.` });
      if (!isNaN(ret) && ret > 15   && kpi.returnRate)  a.push({ level: 'red',   text: `⛔ STOP-LOSS RULE 5: Return rate ${ret}% — above 15%. Check reasons. Fix images/packaging/description.` });
      if (!isNaN(roas) && roas < 1.5 && kpi.adSpend)   a.push({ level: 'red',   text: `⛔ STOP-LOSS RULE 2: ROAS ${roas.toFixed(2)}× — below 1.5×. If 5 consecutive days → PAUSE immediately.` });
      if (!isNaN(ctr) && ctr < 0.8  && ctr >= 0.4 && kpi.ctr) a.push({ level: 'amber', text: `⚠️ CTR YELLOW ZONE ${ctr}%: 0.4-0.8% — improve main image. Target ≥0.8%.` });
      if (!isNaN(ret) && ret > 12   && ret <= 15 && kpi.returnRate) a.push({ level: 'amber', text: `⚠️ RETURN YELLOW ZONE ${ret}%: 12-15% — audit return reasons, fix within 48h.` });
      if (!isNaN(aov) && aov < 175  && kpi.aov)        a.push({ level: 'amber', text: `⚠️ AOV LOW ₹${aov}: Below ₹175. Push bundles in main images. Mention combo in first bullet.` });
      return a;
    },
    evalGood: (kpi) => {
      const g = [];
      const ctr = parseFloat(kpi.ctr), aov = parseFloat(kpi.aov);
      const spend = parseFloat(kpi.adSpend), rev = parseFloat(kpi.adRevenue);
      const roas = (!isNaN(spend) && !isNaN(rev) && spend > 0) ? rev / spend : NaN;
      if (!isNaN(roas) && roas >= 3)  g.push(`🚀 ROAS ${roas.toFixed(2)}× — increase ad budget 25%! Execute Wednesday.`);
      if (!isNaN(ctr)  && ctr >= 0.8) g.push(`🎯 CTR ${ctr}% — green zone! Maintain current image and keep ad running.`);
      if (!isNaN(aov)  && aov >= 250) g.push(`💰 AOV ₹${aov} — green zone! Bundles are working.`);
      return g;
    },
    inputColor: (key, kpi) => {
      if (key === 'ctr'        && parseFloat(kpi[key]) < 0.4  && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'ctr'        && parseFloat(kpi[key]) < 0.8  && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'returnRate' && parseFloat(kpi[key]) > 15   && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'returnRate' && parseFloat(kpi[key]) > 12   && kpi[key]) return 'border-amber-300 bg-amber-50';
      if (key === 'aov'        && parseFloat(kpi[key]) < 175  && kpi[key]) return 'border-red-300 bg-red-50';
      if (key === 'aov'        && parseFloat(kpi[key]) < 250  && kpi[key]) return 'border-amber-300 bg-amber-50';
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
  const us   = parseFloat(kpi.unitSession);
  const acos = parseFloat(kpi.acos);
  if (!isNaN(us) && us < 4 && kpi.unitSession) {
    alerts.push({ level: 'red', text: `⛔ STOP-LOSS RULE 1: Unit Session % ${us}% — below 4%. STOP all image and ad changes. Fix listing content FIRST. (2 consecutive days triggers Rule 1)` });
  } else if (!isNaN(us) && us < 8 && kpi.unitSession) {
    alerts.push({ level: 'amber', text: `⚠️ Unit Session % ${us}%: Below 8% — watch closely. If it drops below 4% for 2 days, Stop-Loss Rule 1 fires.` });
  }
  if (!isNaN(acos) && acos > 40 && kpi.acos) {
    alerts.push({ level: 'red', text: `⛔ STOP-LOSS RULE 2: ACOS ${acos}% — above 40%. If this continues for 5 consecutive days → PAUSE the campaign immediately. No exceptions.` });
  } else if (!isNaN(acos) && acos >= 30 && kpi.acos) {
    alerts.push({ level: 'amber', text: `⚠️ ACOS ${acos}%: Approaching 40% danger zone. Monitor closely.` });
  }
  return alerts;
}

function evalTriggers(kpi) {
  const good = [];
  const us   = parseFloat(kpi.unitSession);
  const acos = parseFloat(kpi.acos);
  if (!isNaN(us)   && us >= 10 && kpi.unitSession) good.push(`🚀 Unit Session % ${us}% — strong CVR! Scale budget on winning campaigns.`);
  if (!isNaN(acos) && acos < 20 && kpi.acos)       good.push(`💰 ACOS ${acos}% — excellent efficiency! Eligible for budget increase on this campaign.`);
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
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteHtml, setPasteHtml] = useState('');
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

  const handlePasteImport = async () => {
    const text = pasteHtml.trim();
    if (!text) { toast.error('Paste your HTML content first'); return; }
    setImporting(true);
    try {
      let weeks;
      const VALID_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat'];

      // ── Format 1: Standalone Amazon-style dashboard (has WEEK_THEMES + TASKS JS objects) ──
      const isAmzDashboard = text.includes('const WEEK_THEMES') && text.includes('const TASKS =');
      if (isAmzDashboard) {
        // Safely extract a JS object literal string by bracket-matching (handles strings correctly)
        const extractObjStr = (src, varName) => {
          const re = new RegExp(`(?:const|let|var)\\s+${varName}\\s*=\\s*\\{`);
          const from = src.search(re);
          if (from === -1) return null;
          const startBrace = src.indexOf('{', from);
          let depth = 0, inStr = false, strCh = '', esc = false;
          for (let i = startBrace; i < src.length; i++) {
            const c = src[i];
            if (esc)              { esc = false; continue; }
            if (c === '\\' && inStr) { esc = true;  continue; }
            if (inStr)            { if (c === strCh) inStr = false; continue; }
            if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
            if (c === '{') depth++;
            else if (c === '}') { depth--; if (depth === 0) return src.slice(startBrace, i + 1); }
          }
          return null;
        };

        const wtStr = extractObjStr(text, 'WEEK_THEMES');
        const tStr  = extractObjStr(text, 'TASKS');
        if (!wtStr || !tStr) throw new Error('Could not find WEEK_THEMES or TASKS in pasted HTML');

        // eslint-disable-next-line no-new-func
        const WEEK_THEMES = (new Function(`return ${wtStr}`))();
        // eslint-disable-next-line no-new-func
        const TASKS       = (new Function(`return ${tStr}`))();

        const DAY_MAP = { MON:'Mon', TUE:'Tue', WED:'Wed', THU:'Thu', FRI:'Fri', SAT:'Sat' };

        weeks = [];
        for (let w = 1; w <= 12; w++) {
          const theme    = WEEK_THEMES[w] || {};
          const specific = {};
          VALID_DAYS.forEach(d => { specific[d] = []; });

          Object.entries(TASKS).forEach(([dk, dv]) => {
            const day = DAY_MAP[dk];
            if (!day) return;
            (dv.tasks || [])
              .filter(t => !t.wOnly || t.wOnly === w)   // base tasks + this week's specific tasks
              .forEach((t, i) => {
                specific[day].push({
                  id:   `amz_w${w}_${day}_${t.id || i}`,
                  text: t.text  || '',
                  note: t.note  || '',
                });
              });
          });

          weeks.push({
            week:      w,
            name:      (theme.name || `Week ${w}`).toUpperCase(),
            focus:     theme.desc    || '',
            mustNonNeg: theme.special || '',
            specific,
          });
        }

      // ── Format 2: Backero HTML template (has tr[data-week][data-day] rows) ──
      } else {
        const doc = new DOMParser().parseFromString(text, 'text/html');
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
        weeks = Object.values(weeksMap).sort((a, b) => a.week - b.week);
        if (!weeks.length) { toast.error('No tasks found. Try pasting the Backero HTML template, or the standalone dashboard HTML.'); return; }
      }

      await api.post(`/marketplace/plans/${platform}/import-json`, { weeks });
      await queryClient.invalidateQueries(['mkt-plan', platform]);
      toast.success(`${platform} plan imported — ${weeks.length} weeks loaded`);
      setShowPasteModal(false);
      setPasteHtml('');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Import failed');
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
  const wsTasks     = week?.ws?.[activeDay] || [];
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
          {importing ? 'Importing…' : 'Import File'}
        </button>
        <button onClick={() => setShowPasteModal(true)} disabled={importing}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-2 rounded-xl whitespace-nowrap transition-colors disabled:opacity-50"
          style={{ borderColor: platColor, color: platColor }}>
          📋 Paste HTML
        </button>
        <input ref={fileInputRef} type="file" accept=".html,.htm" className="hidden" onChange={handleImport} />
      </div>

      {/* Paste HTML Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="text-sm font-bold text-gray-900">📋 Paste HTML Plan</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Open your downloaded HTML template, select all (Ctrl+A), copy (Ctrl+C), then paste below</p>
              </div>
              <button onClick={() => { setShowPasteModal(false); setPasteHtml(''); }}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold leading-none">✕</button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <textarea
                value={pasteHtml}
                onChange={e => setPasteHtml(e.target.value)}
                placeholder="Paste the full HTML content of your plan template here…"
                className="w-full h-64 text-xs border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 font-mono"
                style={{ focusRingColor: platColor }}
                autoFocus
              />
              {pasteHtml && (
                <p className="text-[10px] text-gray-400 mt-1">{pasteHtml.length.toLocaleString()} characters pasted</p>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => { setShowPasteModal(false); setPasteHtml(''); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handlePasteImport} disabled={importing || !pasteHtml.trim()}
                className="flex-1 px-4 py-2.5 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                style={{ background: platColor }}>
                {importing ? <span className="flex items-center justify-center gap-1.5"><ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Importing…</span> : 'Import from Paste'}
              </button>
            </div>
          </div>
        </div>
      )}

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
            const dTasks   = [...(cfg.baseTasks[d] || []), ...(week?.ws?.[d] || [])];
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

// ── Dashboard Numbers Report ──────────────────────────────────────────────────

function DashboardReport({ platform }) {
  const cfg      = PLATFORM_PLAN_CONFIG[platform] || PLATFORM_PLAN_CONFIG.Amazon;
  const re       = DASH_KEY_PARSERS[platform];
  const meta     = PLATFORM_META[platform] || {};
  const color    = meta.color || '#f97316';

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['dash-report', platform],
    queryFn:  () => api.get(`/marketplace/dashboard/${platform}`).then(r => r.data?.data || {}),
    staleTime: 15000,
  });

  const entries = useMemo(() => {
    if (!rawData || !re) return [];
    const rows = [];
    Object.entries(rawData).forEach(([key, val]) => {
      const m = re.exec(key);
      if (!m) return;
      try { rows.push({ week: parseInt(m[1]), day: m[2], nums: JSON.parse(val) }); } catch {}
    });
    return rows.sort((a, b) => a.week - b.week || DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  }, [rawData, re]);

  const kpiFields = useMemo(() => cfg.getKpiFields(null, cfg.budgetLabels[1] || 'base'), [cfg]);

  const byWeek = useMemo(() => {
    const map = {};
    entries.forEach(e => { (map[e.week] = map[e.week] || []).push(e); });
    return map;
  }, [entries]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <ArrowPathIcon className="w-5 h-5 animate-spin mr-2" /> Loading report…
    </div>
  );

  if (!entries.length) return (
    <div className="text-center py-16 text-gray-400">
      <ChartBarIcon className="w-10 h-10 mx-auto mb-3 opacity-20" />
      <p className="text-sm font-medium text-gray-500">No numbers saved yet for {platform}</p>
      <p className="text-xs mt-1 text-gray-400">Open the {platform} dashboard, enter today's numbers, and click "Save Today's Numbers"</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {Object.entries(byWeek).map(([week, rows]) => (
        <div key={week} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: color + '18', borderBottom: `2px solid ${color}30` }}>
            <span className="text-xs font-black" style={{ color }}>WEEK {week}</span>
            <span className="text-[10px] text-gray-400 font-medium">{rows.length} day{rows.length > 1 ? 's' : ''} recorded</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-bold text-gray-500 w-16">Day</th>
                  {kpiFields.map(f => (
                    <th key={f.key} className="text-right px-3 py-2 font-bold text-gray-500 whitespace-nowrap">{f.label}</th>
                  ))}
                  {rows[0]?.nums?.notes !== undefined && (
                    <th className="text-left px-3 py-2 font-bold text-gray-500">Notes</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ day, nums }) => {
                  const alerts = cfg.evalAlerts ? cfg.evalAlerts(nums) : [];
                  const hasAlert = alerts.some(a => a.level === 'red');
                  const hasWarn  = !hasAlert && alerts.some(a => a.level === 'amber');
                  return (
                    <tr key={day} className={clsx('border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors',
                      hasAlert ? 'bg-red-50' : hasWarn ? 'bg-amber-50' : '')}>
                      <td className="px-4 py-2.5 font-bold text-gray-700">
                        {day}
                        {hasAlert && <span className="ml-1 text-red-500 text-[9px]">⛔</span>}
                        {hasWarn  && <span className="ml-1 text-amber-500 text-[9px]">⚠️</span>}
                      </td>
                      {kpiFields.map(f => {
                        const v = nums[f.key] ?? nums[f.key === 'adRevenue' ? 'adRev' : f.key];
                        const hasVal = v !== undefined && v !== '' && v !== null;
                        return (
                          <td key={f.key} className={clsx('px-3 py-2.5 text-right font-mono',
                            hasVal ? 'text-gray-800 font-semibold' : 'text-gray-300')}>
                            {hasVal ? v : '—'}
                          </td>
                        );
                      })}
                      {nums.notes !== undefined && (
                        <td className="px-3 py-2.5 text-gray-500 max-w-[200px] truncate">{nums.notes || '—'}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function MarketplaceDept() {
  const [activeTab, setActiveTab]       = useState('overview');
  const [activePlan, setActivePlan]     = useState('Amazon');
  const [showPlanDropdown, setShowPlanDropdown] = useState(false);
  const [showReport, setShowReport]     = useState(false);
  const [dashboardFiles, setDashboardFiles] = useState({});
  const [dashSavedAt, setDashSavedAt]   = useState(null);
  const dropdownRef = useRef(null);
  const iframeRef   = useRef(null);

  useEffect(() => {
    fetch('/dashboards/manifest.json')
      .then(r => r.ok ? r.json() : {})
      .then(setDashboardFiles)
      .catch(() => {});
  }, []);

  // postMessage bridge — save/load dashboard localStorage data via backend
  useEffect(() => {
    const handler = async (e) => {
      if (!e.data?.type) return;
      if (e.data.type === 'DASH_SAVE' && e.data.platform && e.data.data) {
        api.put(`/marketplace/dashboard/${e.data.platform}`, { data: e.data.data })
          .then(() => {
            setDashSavedAt(new Date());
            toast.success(`✓ ${e.data.platform} data saved to cloud`, { duration: 2000, id: 'dash-save' });
          })
          .catch(() => {});
      }
      if (e.data.type === 'DASH_LOAD' && e.data.platform) {
        try {
          const res = await api.get(`/marketplace/dashboard/${e.data.platform}`);
          const data = res.data?.data || {};
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'DASH_DATA', platform: e.data.platform, data }, '*'
          );
        } catch { /* silent */ }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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
                        <button key={p} onClick={() => { setActivePlan(p); setActiveTab('plan'); setShowPlanDropdown(false); setShowReport(false); }}
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
              {activeTab === 'plan' && (
                <button
                  onClick={() => setShowReport(s => !s)}
                  className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
                    showReport ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')}
                  style={showReport ? { background: PLATFORM_PLAN_CONFIG[activePlan]?.color || '#f97316' } : {}}>
                  📊 {showReport ? 'Hide Report' : 'Numbers Report'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {activeTab === 'overview'
        ? <OverviewTab allTasks={allTasks} tasksLoading={tasksLoading} navigate={navigate} />
        : showReport
            ? <div className="space-y-3">
                <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-gray-800">
                      📊 {activePlan} — Daily Numbers Report
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">All saved numbers from the {activePlan} dashboard</p>
                  </div>
                  <button onClick={() => setShowReport(false)}
                    className="text-xs font-bold text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                    ← Back to Dashboard
                  </button>
                </div>
                <DashboardReport platform={activePlan} />
              </div>
            : dashboardFiles[activePlan]
                ? <div className="relative">
                    {dashSavedAt && (
                      <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm pointer-events-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Saved to cloud · {dashSavedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    <iframe
                      key={activePlan}
                      ref={iframeRef}
                      src={dashboardFiles[activePlan]}
                      className="w-full rounded-2xl border border-gray-200"
                      style={{ height: 'calc(100vh - 160px)', display: 'block' }}
                      title={`${activePlan} Dashboard`}
                    />
                  </div>
                : <PlanTab key={activePlan} platform={activePlan} />
      }
    </div>
  );
}
