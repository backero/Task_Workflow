import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { format } from 'date-fns';
import {
  CheckCircleIcon, ClockIcon, TruckIcon, CubeIcon,
  ExclamationCircleIcon, SparklesIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const STAGES = [
  { key: 'Order Confirmed', label: 'Order Confirmed',   icon: CheckCircleIcon,  color: 'blue'   },
  { key: 'In Production',   label: 'In Production',     icon: CubeIcon,         color: 'orange' },
  { key: 'Ready',           label: 'Ready to Dispatch', icon: SparklesIcon,     color: 'violet' },
  { key: 'Delivered',       label: 'Delivered',         icon: TruckIcon,        color: 'green'  },
];

function StageBar({ current }) {
  const idx = STAGES.findIndex((s) => s.key === current);
  const activeIdx = idx === -1 ? 0 : idx;

  return (
    <div className="flex items-center gap-0 w-full">
      {STAGES.map((stage, i) => {
        const Icon = stage.icon;
        const done = i <= activeIdx;
        const active = i === activeIdx;
        return (
          <React.Fragment key={stage.key}>
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                done
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-300'
              } ${active ? 'ring-4 ring-blue-100 scale-110' : ''}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className={`text-xs mt-1.5 font-medium text-center max-w-[72px] leading-tight ${
                done ? 'text-blue-700' : 'text-gray-400'
              }`}>{stage.label}</p>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-5 rounded-full transition-all ${
                i < activeIdx ? 'bg-blue-600' : 'bg-gray-200'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function OrderTracking() {
  const { token } = useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['track', token],
    queryFn: () => axios.get(`${API_BASE}/public/track/${token}`).then((r) => r.data.data?.order || r.data.order),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading your order…</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <ExclamationCircleIcon className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Order Not Found</h2>
          <p className="text-gray-500 text-sm">This tracking link is invalid or has expired. Please contact us directly.</p>
        </div>
      </div>
    );
  }

  const isComplete = data.isCompleted;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">B</span>
            </div>
            <span className="font-bold text-gray-900">Backero</span>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
            isComplete
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {isComplete ? '✅ Completed' : '🔄 In Progress'}
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Order Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Your Order</p>
          <h1 className="text-xl font-bold text-gray-900">{data.orderTitle}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {data.clientName}{data.company ? ` · ${data.company}` : ''}
          </p>

          <div className="flex gap-4 mt-4 text-sm flex-wrap">
            <div>
              <p className="text-xs text-gray-400">Order Date</p>
              <p className="font-medium text-gray-700">{format(new Date(data.createdAt), 'dd MMM yyyy')}</p>
            </div>
            {data.dueDate && (
              <div>
                <p className="text-xs text-gray-400">Estimated Delivery</p>
                <p className="font-medium text-orange-600">{format(new Date(data.dueDate), 'dd MMM yyyy')}</p>
              </div>
            )}
            {data.completedAt && (
              <div>
                <p className="text-xs text-gray-400">Completed On</p>
                <p className="font-medium text-green-600">{format(new Date(data.completedAt), 'dd MMM yyyy')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Order Progress</p>
          <StageBar current={data.stage} />
        </div>

        {/* Updates Timeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Updates</p>

          {data.updates?.length === 0 ? (
            <div className="text-center py-6">
              <ClockIcon className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No updates yet — we'll notify you via WhatsApp as work progresses.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.updates.map((u, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                      <CheckCircleIcon className="w-4 h-4 text-blue-500" />
                    </div>
                    {i < data.updates.length - 1 && (
                      <div className="w-0.5 h-4 bg-blue-100 mx-auto mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <p className="text-sm font-medium text-gray-800">{u.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(u.date), 'dd MMM yyyy, h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completed Banner */}
        {isComplete && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
            <CheckCircleIcon className="w-10 h-10 text-green-500 mx-auto mb-2" />
            <h3 className="font-bold text-green-800">Your order is complete!</h3>
            <p className="text-sm text-green-600 mt-1">Thank you for choosing Backero. We hope to serve you again.</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          Powered by <span className="font-semibold text-blue-600">Backero</span> · For queries, contact us directly
        </p>
      </div>
    </div>
  );
}
