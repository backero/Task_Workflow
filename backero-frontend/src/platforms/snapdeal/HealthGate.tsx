import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import { HeartPulse, TrendingUp, TrendingDown, Star, IndianRupee } from 'lucide-react';
import { clsx } from 'clsx';

type Panel = {
  account_health?: string;
  avg_seller_rating?: number;
  order_processing_health?: string;
  orders_booked?: number; orders_booked_change_abs_pct?: number;
  orders_processed?: number; orders_processed_change_abs_pct?: number;
  orders_returned?: number; orders_returned_change_abs_pct?: number;
  sales_completed?: number; sales_completed_change_abs_pct?: number;
  sales_returned?: number; sales_returned_change_abs_pct?: number;
  unsettled_cod?: number; unsettled_ncod?: number;
  last_settled_cod?: number; last_settled_ncod?: number;
  captured_at?: string;
};

const HEALTH_TONE: Record<string, string> = {
  good: 'bg-green-50 border-green-200 text-green-700',
  fair: 'bg-amber-50 border-amber-200 text-amber-700',
  poor: 'bg-red-50 border-red-200 text-red-700',
};

function healthTone(label?: string) {
  return HEALTH_TONE[(label || '').toLowerCase()] || 'bg-gray-50 border-gray-200 text-gray-600';
}

function ChangeBadge({ pct }: { pct?: number }) {
  if (pct == null) return null;
  const positive = pct >= 0;
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-[10px] font-semibold', positive ? 'text-green-600' : 'text-red-500')}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct)}%
    </span>
  );
}

function Tile({ label, value, change }: { label: string; value: React.ReactNode; change?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      <div className="flex items-end gap-2 mt-1">
        <span className="text-lg font-bold text-gray-900">{value}</span>
        {change}
      </div>
    </div>
  );
}

export default function SnapdealHealthGate() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/marketflow/snapdeal/overview')
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

  const panel: Panel = data?.panel || {};
  const hasData = Object.keys(panel).length > 0;

  if (!hasData) {
    return (
      <div className="text-center py-10 text-gray-400">
        <HeartPulse className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-medium text-gray-500">No health panel data synced yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className={clsx('flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-bold', healthTone(panel.account_health))}>
          <HeartPulse className="w-4 h-4" />Account Health: {panel.account_health || '—'}
        </div>
        <div className={clsx('flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-bold', healthTone(panel.order_processing_health))}>
          Order Processing: {panel.order_processing_health || '—'}
        </div>
        <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700">
          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />{panel.avg_seller_rating ?? '—'}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Orders & Sales</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Orders Booked" value={panel.orders_booked ?? '—'} change={<ChangeBadge pct={panel.orders_booked_change_abs_pct} />} />
          <Tile label="Orders Processed" value={panel.orders_processed ?? '—'} change={<ChangeBadge pct={panel.orders_processed_change_abs_pct} />} />
          <Tile label="Orders Returned" value={panel.orders_returned ?? '—'} change={<ChangeBadge pct={panel.orders_returned_change_abs_pct} />} />
          <Tile label="Sales Completed" value={panel.sales_completed != null ? `₹${panel.sales_completed}` : '—'} change={<ChangeBadge pct={panel.sales_completed_change_abs_pct} />} />
          <Tile label="Sales Returned" value={panel.sales_returned != null ? `₹${panel.sales_returned}` : '—'} change={<ChangeBadge pct={panel.sales_returned_change_abs_pct} />} />
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Settlements</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Unsettled COD" value={<span className="inline-flex items-center gap-0.5"><IndianRupee className="w-3.5 h-3.5" />{panel.unsettled_cod ?? '—'}</span>} />
          <Tile label="Unsettled Non-COD" value={<span className="inline-flex items-center gap-0.5"><IndianRupee className="w-3.5 h-3.5" />{panel.unsettled_ncod ?? '—'}</span>} />
          <Tile label="Last Settled COD" value={<span className="inline-flex items-center gap-0.5"><IndianRupee className="w-3.5 h-3.5" />{panel.last_settled_cod ?? '—'}</span>} />
          <Tile label="Last Settled Non-COD" value={<span className="inline-flex items-center gap-0.5"><IndianRupee className="w-3.5 h-3.5" />{panel.last_settled_ncod ?? '—'}</span>} />
        </div>
      </div>

      {panel.captured_at && (
        <p className="text-[10px] text-gray-400">As of {new Date(panel.captured_at).toLocaleString('en-IN')}</p>
      )}
    </div>
  );
}
