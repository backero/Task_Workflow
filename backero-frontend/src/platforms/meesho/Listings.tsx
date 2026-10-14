import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import { PackageSearch, Star, TriangleAlert } from 'lucide-react';

type Kpis = {
  listings?: number; live?: number; blocked?: number;
  orders_7d?: number; impressions_7d?: number;
  avg_quality_score?: number; avg_rating?: number;
  open_critical_alerts?: number; open_recs?: number;
};

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

export default function MeeshoListings() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/marketflow/meesho/overview')
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

  const kpis: Kpis = data?.kpis || {};
  const topIssues: any[] = Array.isArray(data?.top_issues) ? data.top_issues : [];
  // The scraper hasn't completed its first real sign-in yet (manual login still
  // pending), so every KPI reads a literal zero — distinguish that from a
  // genuinely-synced "zero issues, all good" state rather than show a wall of 0s.
  const hasAnyRealData = Object.values(kpis).some((v) => Number(v) > 0) || topIssues.length > 0;

  if (!hasAnyRealData) {
    return (
      <div className="text-center py-10 text-gray-400">
        <TriangleAlert className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-medium text-gray-500">No Meesho data synced yet</p>
        <p className="text-xs mt-1">The scraper needs a completed manual sign-in before this fills in</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Listings</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Total Listings" value={kpis.listings ?? '—'} />
          <Tile label="Live" value={kpis.live ?? '—'} />
          <Tile label="Blocked" value={kpis.blocked ?? '—'} />
          <Tile label="Avg Quality Score" value={kpis.avg_quality_score ?? '—'} />
          <Tile label="Avg Rating" value={kpis.avg_rating != null ? <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />{kpis.avg_rating}</span> : '—'} />
          <Tile label="Orders (7d)" value={kpis.orders_7d ?? '—'} />
          <Tile label="Impressions (7d)" value={kpis.impressions_7d ?? '—'} />
          <Tile label="Open Critical Alerts" value={kpis.open_critical_alerts ?? '—'} />
        </div>
      </div>

      {topIssues.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Top Issues</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {topIssues.slice(0, 10).map((it, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50/60 border border-red-100">
                <PackageSearch className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-600 truncate">{it.title || it.message || it.type || JSON.stringify(it)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
