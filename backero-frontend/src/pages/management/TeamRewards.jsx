import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrophyIcon, GiftIcon, ClockIcon, SparklesIcon, XMarkIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const REWARD_TYPES = [
  { value: 'congrats_game', label: 'Congrats note + game outing', icon: SparklesIcon },
  { value: 'refreshments', label: 'Refreshments', icon: GiftIcon },
  { value: 'early_leave', label: '1 hour paid early leave', icon: ClockIcon },
];

const STATUS_TABS = [
  { value: 'pending', label: 'Pending Review' },
  { value: 'granted', label: 'Granted' },
  { value: 'skipped', label: 'Skipped' },
];

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rewardLabel(type) {
  return REWARD_TYPES.find((r) => r.value === type)?.label || type;
}

function GrantModal({ open, reward, onClose }) {
  const qc = useQueryClient();
  const [rewardType, setRewardType] = useState('congrats_game');
  const [note, setNote] = useState('');

  React.useEffect(() => {
    if (open) { setRewardType('congrats_game'); setNote(''); }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => api.post(`/team-rewards/${reward._id}/grant`, { rewardType, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-rewards'] });
      toast.success(`Reward granted to ${reward.department}!`);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to grant reward'),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-[#070c17] rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-[#1b2e4a]">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Grant Reward — {reward.department}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#17263d]">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="label">Reward Type *</label>
            <div className="space-y-2 mt-1.5">
              {REWARD_TYPES.map((r) => (
                <label
                  key={r.value}
                  className={clsx(
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    rewardType === r.value
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                      : 'border-gray-200 dark:border-[#1b2e4a] hover:border-gray-300'
                  )}
                >
                  <input
                    type="radio"
                    name="rewardType"
                    value={r.value}
                    checked={rewardType === r.value}
                    onChange={() => setRewardType(r.value)}
                    className="accent-brand-600"
                  />
                  <r.icon className="w-4 h-4 text-brand-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Note to the team <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input"
              rows={3}
              maxLength={500}
              placeholder="Great work this week, team!"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2.5">Cancel</button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="btn-primary flex-1 justify-center py-2.5"
            >
              {mutation.isPending ? 'Granting...' : 'Grant Reward'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamRewards() {
  const [statusTab, setStatusTab] = useState('pending');
  const [grantTarget, setGrantTarget] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['team-rewards', statusTab],
    queryFn: () => api.get(`/team-rewards?status=${statusTab}&limit=50`).then((r) => r.data),
  });

  const rewards = data?.data || [];

  const skipMutation = useMutation({
    mutationFn: (id) => api.post(`/team-rewards/${id}/skip`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-rewards'] });
      toast.success('Reward dismissed');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to dismiss'),
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <TrophyIcon className="w-6 h-6 text-amber-500" />
            Team Rewards
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Teams that hit every task and daily update on time, all week — one missed update or late task cancels it for everyone.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-[#1b2e4a]">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusTab(tab.value)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              statusTab === tab.value
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-gray-400">Loading...</div>
      ) : rewards.length === 0 ? (
        <div className="card p-12 text-center">
          <TrophyIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400">
            {statusTab === 'pending' ? 'No teams are awaiting review right now.' : `No ${statusTab} rewards yet.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rewards.map((r) => (
            <div key={r._id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{r.department}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Week of {fmtDate(r.weekStart)} – {fmtDate(r.weekEnd)}
                  </p>
                </div>
                <span className={clsx('badge', {
                  'badge-orange': r.status === 'pending',
                  'badge-green': r.status === 'granted',
                  'badge-gray': r.status === 'skipped',
                })}>
                  {r.status === 'pending' ? 'Pending' : r.status === 'granted' ? 'Granted' : 'Skipped'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(r.memberIds || []).map((m) => (
                  <span key={m._id} className="badge badge-blue">
                    {m.firstName} {m.lastName}
                  </span>
                ))}
              </div>

              {r.status === 'granted' && (
                <div className="text-sm text-gray-600 dark:text-gray-400 bg-green-50 dark:bg-green-900/10 rounded-lg p-3">
                  <p className="font-medium text-green-700 dark:text-green-400">{rewardLabel(r.rewardType)}</p>
                  {r.note && <p className="mt-1 italic">&ldquo;{r.note}&rdquo;</p>}
                  {r.grantedBy && (
                    <p className="text-xs text-gray-400 mt-1.5">
                      Granted by {r.grantedBy.firstName} {r.grantedBy.lastName} on {fmtDate(r.grantedAt)}
                    </p>
                  )}
                </div>
              )}

              {r.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setGrantTarget(r)}
                    className="btn-primary flex-1 justify-center py-2 gap-1.5"
                  >
                    <CheckCircleIcon className="w-4 h-4" /> Grant Reward
                  </button>
                  <button
                    onClick={() => skipMutation.mutate(r._id)}
                    disabled={skipMutation.isPending}
                    className="btn-secondary py-2 px-3"
                    title="Dismiss without granting"
                  >
                    <XCircleIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <GrantModal open={!!grantTarget} reward={grantTarget || {}} onClose={() => setGrantTarget(null)} />
    </div>
  );
}
