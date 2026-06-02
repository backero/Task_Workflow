import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CheckCircleIcon, ArrowPathIcon, ExclamationTriangleIcon,
  DevicePhoneMobileIcon, BellAlertIcon, ClockIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { clsx } from 'clsx';

const STATUS_CONFIG = {
  connected:    { label: 'Connected',     color: 'green',  icon: CheckCircleIcon },
  qr_ready:     { label: 'Scan QR Code',  color: 'blue',   icon: DevicePhoneMobileIcon },
  connecting:   { label: 'Connecting…',   color: 'yellow', icon: ArrowPathIcon },
  disconnected: { label: 'Disconnected',  color: 'red',    icon: ExclamationTriangleIcon },
  unavailable:  { label: 'Unavailable',   color: 'gray',   icon: ExclamationTriangleIcon },
};

export default function WhatsAppSetup() {
  const qc = useQueryClient();
  const [pollActive, setPollActive] = useState(true);

  // Poll status every 3s while not connected
  const { data: statusData } = useQuery({
    queryKey: ['wa-status'],
    queryFn: () => api.get('/whatsapp/status').then((r) => r.data),
    refetchInterval: pollActive ? 3000 : false,
  });

  // Fetch QR image
  const { data: qrData, refetch: refetchQR } = useQuery({
    queryKey: ['wa-qr'],
    queryFn: () => api.get('/whatsapp/qr').then((r) => r.data),
    refetchInterval: pollActive ? 4000 : false,
    enabled: !statusData?.connected,
  });

  // Stop polling when connected
  useEffect(() => {
    if (statusData?.connected) {
      setPollActive(false);
      qc.invalidateQueries(['wa-qr']);
    } else {
      setPollActive(true);
    }
  }, [statusData?.connected]);

  // Manual trigger daily report
  const testReport = useMutation({
    mutationFn: () => api.post('/whatsapp/test-report'),
  });

  // Force reconnect (clears stale session, generates new QR)
  const reconnect = useMutation({
    mutationFn: () => api.post('/whatsapp/reconnect'),
    onSuccess: () => {
      setPollActive(true);
      qc.invalidateQueries(['wa-status']);
      qc.invalidateQueries(['wa-qr']);
    },
  });

  const status = statusData?.status || 'disconnected';
  const isConnected = statusData?.connected;
  const qrImage = qrData?.qrImage;
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;
  const StatusIcon = cfg.icon;

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="page-title">WhatsApp Notifications</h1>
        <p className="text-gray-500 text-sm mt-1">
          Connect your WhatsApp number to receive task alerts and daily reports
        </p>
      </div>

      {/* Connection Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-12 h-12 rounded-xl bg-${cfg.color}-100 dark:bg-${cfg.color}-900/30 flex items-center justify-center`}>
            <StatusIcon className={`w-6 h-6 text-${cfg.color}-600 dark:text-${cfg.color}-400 ${status === 'connecting' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              WhatsApp Status
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full bg-${cfg.color}-500 ${isConnected ? 'animate-pulse' : ''}`} />
              <span className={`text-sm font-medium text-${cfg.color}-600 dark:text-${cfg.color}-400`}>
                {cfg.label}
              </span>
            </div>
          </div>
        </div>

        {/* QR Code Section */}
        {!isConnected && (
          <div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-5">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2 flex items-center gap-2">
                <DevicePhoneMobileIcon className="w-5 h-5" />
                How to connect
              </h3>
              <ol className="text-sm text-blue-800 dark:text-blue-400 space-y-1 list-decimal list-inside">
                <li>Open WhatsApp on your phone</li>
                <li>Tap <strong>⋮ Menu → Linked Devices</strong></li>
                <li>Tap <strong>Link a Device</strong></li>
                <li>Scan the QR code below</li>
              </ol>
            </div>

            {qrImage ? (
              <div className="flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-md border-2 border-gray-200">
                  <img
                    src={qrImage}
                    alt="WhatsApp QR Code"
                    className="w-64 h-64"
                  />
                </div>
                <p className="text-sm text-gray-500 text-center">
                  QR code expires in ~60 seconds. It auto-refreshes.
                </p>
                <button
                  onClick={() => { refetchQR(); qc.invalidateQueries(['wa-status']); }}
                  className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  <ArrowPathIcon className="w-4 h-4" /> Refresh QR
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <ArrowPathIcon className="w-8 h-8 animate-spin mb-3" />
                <p className="text-sm">
                  {status === 'unavailable'
                    ? 'WhatsApp package not installed — run: npm install @whiskeysockets/baileys'
                    : 'Generating QR code… (server is starting up)'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Connected state */}
        {isConnected && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircleIcon className="w-10 h-10 text-green-600" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-white">WhatsApp Connected!</p>
              <p className="text-sm text-gray-500 mt-1">All notifications will be sent via WhatsApp</p>
            </div>
            <button
              onClick={() => reconnect.mutate()}
              disabled={reconnect.isPending}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium border border-red-200 hover:border-red-300 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 ${reconnect.isPending ? 'animate-spin' : ''}`} />
              {reconnect.isPending ? 'Reconnecting…' : 'Reconnect WhatsApp'}
            </button>
            {reconnect.isSuccess && (
              <p className="text-xs text-orange-600">Session reset — scan the new QR code below in a few seconds</p>
            )}
          </div>
        )}
      </motion.div>

      {/* What gets notified */}
      <div className="card p-6">
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">Notification Events</h3>
        <div className="space-y-3">
          {[
            {
              icon: '📌',
              title: 'Task Assigned',
              desc: 'Employee gets a WhatsApp immediately when a task is assigned to them',
              always: true,
            },
            {
              icon: '⚠️',
              title: 'Task Overdue — Employee',
              desc: 'Employee gets WhatsApp when their task passes the due date, then every 24h',
              always: true,
            },
            {
              icon: '🚨',
              title: 'Task Overdue — Manager',
              desc: 'Manager who assigned the task gets alerted when it goes overdue',
              always: true,
            },
            {
              icon: '📊',
              title: 'Daily Report — 9 PM IST',
              desc: 'All admins & founders get a full daily summary every night at 9 PM',
              always: true,
            },
            {
              icon: '📦',
              title: 'Low Stock Alerts',
              desc: 'Admins notified when product stock drops to zero',
              always: false,
            },
            {
              icon: '📞',
              title: 'Lead Follow-up Reminders',
              desc: 'Sales staff reminded when a lead hasn\'t been contacted in 48 hours',
              always: false,
            },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-[#0f1a2e]/50">
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
              <span className={clsx('text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium', item.always ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                {item.always ? 'Active' : 'Conditional'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Test Actions */}
      {isConnected && (
        <div className="card p-6">
          <h3 className="font-bold text-gray-900 dark:text-white mb-1">Test Notifications</h3>
          <p className="text-xs text-gray-500 mb-4">Manually trigger to verify WhatsApp delivery</p>
          <button
            onClick={() => testReport.mutate()}
            disabled={testReport.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <BellAlertIcon className="w-4 h-4" />
            {testReport.isPending ? 'Sending…' : 'Send Test Daily Report Now'}
          </button>
          {testReport.isSuccess && (
            <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
              <CheckCircleIcon className="w-4 h-4" /> Report sent! Check your WhatsApp.
            </p>
          )}
        </div>
      )}

      {/* Schedule info */}
      <div className="card p-5">
        <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <ClockIcon className="w-4 h-4" /> Automation Schedule
        </h3>
        <div className="space-y-2 text-sm">
          {[
            { time: 'Every 30 min',  event: 'Check for newly overdue tasks' },
            { time: 'Every hour',    event: 'Check stale CRM leads (48h no contact)' },
            { time: '9:00 PM IST',   event: 'Daily report WhatsApp to all admins' },
            { time: '8:00 AM IST',   event: 'Follow-up reminders for CRM leads' },
            { time: 'Every 6 hours', event: 'Low stock inventory check' },
          ].map((row) => (
            <div key={row.time} className="flex items-center gap-3">
              <span className="text-xs font-mono bg-gray-100 dark:bg-[#0f1a2e] px-2 py-0.5 rounded text-gray-600 dark:text-gray-400 w-28 text-center flex-shrink-0">
                {row.time}
              </span>
              <span className="text-gray-600 dark:text-gray-400">{row.event}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
