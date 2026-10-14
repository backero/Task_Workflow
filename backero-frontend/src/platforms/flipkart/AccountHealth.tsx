import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import { HeartPulse, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { clsx } from 'clsx';

type HomeMetrics = {
  impressions_latest?: number; impressions_previous_day?: number;
  units_today?: number; units_yesterday?: number;
  sales_today?: number; sales_yesterday?: number;
  new_orders?: number; pending_rtd?: number; returns_today?: number; upcoming_payment?: number;
};

type BusinessHealth = {
  impressions_7d?: number; impressions_prev_7d?: number;
  conversion_7d_pct?: number; conversion_prev_7d_pct?: number;
  units_7d?: number; sales_7d?: number; units_prev_7d?: number;
  buyer_returns_pct?: number; pre_dispatch_cancel_pct?: number; rto_pct?: number; seller_cancel_pct?: number;
  dbd_breach_pct?: number; low_quality_listings?: number; listings_scored?: number;
  f_assured_units_pct?: number; out_of_stock_listings?: number; low_stock_listings?: number;
};

function Delta({ current, previous, lowerIsBetter = false }: { current?: number; previous?: number; lowerIsBetter?: boolean }) {
  if (current == null || previous == null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const positive = lowerIsBetter ? pct < 0 : pct > 0;
  if (Math.abs(pct) < 0.1) return <span className="text-[10px] text-gray-400">flat</span>;
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-[10px] font-semibold', positive ? 'text-green-600' : 'text-red-500')}>
      {pct > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function Tile({ label, value, delta }: { label: string; value: React.ReactNode; delta?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      <div className="flex items-end gap-2 mt-1">
        <span className="text-lg font-bold text-gray-900">{value}</span>
        {delta}
      </div>
    </div>
  );
}

function pct(v?: number) { return v == null ? '—' : `${v}%`; }

export default function FlipkartAccountHealth() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/marketflow/flipkart/overview')
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  const home: HomeMetrics = data?.account_metrics?.home || {};
  const health: BusinessHealth = data?.account_metrics?.business_health || {};
  const hasData = Object.keys(home).length > 0 || Object.keys(health).length > 0;

  if (!hasData) {
    return (
      <div className="text-center py-10 text-gray-400">
        <HeartPulse className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-medium text-gray-500">No account health data synced yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Today vs Yesterday</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Impressions" value={home.impressions_latest ?? '—'} delta={<Delta current={home.impressions_latest} previous={home.impressions_previous_day} />} />
          <Tile label="Units" value={home.units_today ?? '—'} delta={<Delta current={home.units_today} previous={home.units_yesterday} />} />
          <Tile label="Sales" value={home.sales_today != null ? `₹${home.sales_today}` : '—'} delta={<Delta current={home.sales_today} previous={home.sales_yesterday} />} />
          <Tile label="New Orders" value={home.new_orders ?? '—'} />
          <Tile label="Pending RTD" value={home.pending_rtd ?? '—'} />
          <Tile label="Returns Today" value={home.returns_today ?? '—'} />
          <Tile label="Upcoming Payment" value={home.upcoming_payment != null ? <span className="inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5 text-orange-500" />₹{home.upcoming_payment}</span> : '—'} />
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">7-Day Business Health</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Impressions" value={health.impressions_7d ?? '—'} delta={<Delta current={health.impressions_7d} previous={health.impressions_prev_7d} />} />
          <Tile label="Conversion" value={pct(health.conversion_7d_pct)} delta={<Delta current={health.conversion_7d_pct} previous={health.conversion_prev_7d_pct} />} />
          <Tile label="Units Sold" value={health.units_7d ?? '—'} delta={<Delta current={health.units_7d} previous={health.units_prev_7d} />} />
          <Tile label="Sales" value={health.sales_7d != null ? `₹${health.sales_7d}` : '—'} />
          <Tile label="Buyer Returns" value={pct(health.buyer_returns_pct)} delta={<Delta current={health.buyer_returns_pct} previous={0} lowerIsBetter />} />
          <Tile label="Pre-Dispatch Cancel" value={pct(health.pre_dispatch_cancel_pct)} />
          <Tile label="RTO" value={pct(health.rto_pct)} />
          <Tile label="DBD Breach" value={pct(health.dbd_breach_pct)} />
          <Tile label="F-Assured Units" value={pct(health.f_assured_units_pct)} />
          <Tile label="Low Quality Listings" value={health.low_quality_listings ?? '—'} />
          <Tile label="Out of Stock" value={health.out_of_stock_listings ?? '—'} />
          <Tile label="Low Stock" value={health.low_stock_listings ?? '—'} />
        </div>
      </div>
    </div>
  );
}
