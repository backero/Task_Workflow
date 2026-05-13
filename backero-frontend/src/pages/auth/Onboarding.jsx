import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const features = [
  { icon: '📋', title: 'Task Management', desc: 'Assign, track, and approve tasks with strict accountability.' },
  { icon: '👤', title: 'CRM & Sales', desc: 'Full lead pipeline with automated follow-up reminders.' },
  { icon: '📦', title: 'Inventory Control', desc: 'Real-time stock tracking with low-stock alerts.' },
  { icon: '🏭', title: 'Production Orders', desc: 'BOM management, quality control, and batch tracking.' },
  { icon: '💰', title: 'Finance & Invoicing', desc: 'Ledger, invoices, and GST-ready financial reporting.' },
  { icon: '📊', title: 'Department Dashboards', desc: 'Separate analytics and KPIs per department.' },
];

export default function Onboarding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-purple-50 dark:from-gray-900 dark:to-gray-950 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex w-20 h-20 rounded-3xl gradient-brand items-center justify-center mb-4 shadow-lg">
            <CheckCircleIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome to Backero!</h1>
          <p className="text-gray-500 mt-2">Your enterprise operations platform is ready.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {features.map((f) => (
            <div key={f.title} className="card p-4">
              <span className="text-2xl">{f.icon}</span>
              <h3 className="font-semibold text-gray-900 dark:text-white mt-2">{f.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button onClick={() => navigate('/')} className="btn-primary px-8 py-3 text-base">
            Go to Dashboard →
          </button>
        </div>
      </motion.div>
    </div>
  );
}
