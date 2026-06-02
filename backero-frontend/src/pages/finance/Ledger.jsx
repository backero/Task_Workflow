import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const INCOME_CATEGORIES = ['Sales', 'Invoice Payment', 'Marketplace Revenue', 'Other Income'];
const EXPENSE_CATEGORIES = ['Salary', 'Raw Material', 'Rent', 'Utilities', 'Marketing', 'Logistics', 'Vendor Payment', 'Other Expense'];

function TransactionModal({ onClose, onSuccess }) {
  const { register, handleSubmit, watch } = useForm({ defaultValues: { type: 'income' } });
  const [loading, setLoading] = useState(false);
  const type = watch('type');

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await api.post('/finance/transactions', data);
      toast.success('Transaction recorded');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60" onClick={onClose} />
      <div className="relative card w-full max-w-md shadow-modal p-6 space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white">Record Transaction</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex gap-2">
            <label className={clsx('flex-1 py-2 text-center rounded-lg cursor-pointer border-2 text-sm font-medium', type === 'income' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600')}>
              <input {...register('type')} type="radio" value="income" className="hidden" />Income
            </label>
            <label className={clsx('flex-1 py-2 text-center rounded-lg cursor-pointer border-2 text-sm font-medium', type === 'expense' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600')}>
              <input {...register('type')} type="radio" value="expense" className="hidden" />Expense
            </label>
          </div>
          <div>
            <label className="label">Category</label>
            <select {...register('category', { required: true })} className="input">
              {(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount (₹) *</label>
            <input {...register('amount', { required: true })} type="number" min="0" step="0.01" className="input" />
          </div>
          <div>
            <label className="label">Description *</label>
            <input {...register('description', { required: true })} className="input" placeholder="Payment description..." />
          </div>
          <div>
            <label className="label">Date</label>
            <input {...register('date')} type="date" className="input" defaultValue={new Date().toISOString().split('T')[0]} />
          </div>
          <div>
            <label className="label">Payment Method</label>
            <select {...register('paymentMethod')} className="input">
              {['bank_transfer', 'upi', 'cash', 'cheque', 'card'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">{loading ? 'Saving...' : 'Record'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Ledger() {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('');
  const qc = useQueryClient();

  const { data: summaryData } = useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: () => api.get('/finance/summary?period=month').then((r) => r.data.summary),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'transactions', type],
    queryFn: () => api.get('/finance/transactions', { params: { limit: 50, type: type || undefined } }).then((r) => r.data),
  });

  const transactions = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Financial Ledger</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary"><PlusIcon className="w-4 h-4" /> Record Transaction</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5 border-t-4 border-green-500">
          <ArrowUpIcon className="w-5 h-5 text-green-500 mb-2" />
          <p className="text-2xl font-bold text-green-600">₹{(summaryData?.totalIncome || 0).toLocaleString('en-IN')}</p>
          <p className="text-sm text-gray-500">Income (This Month)</p>
        </div>
        <div className="card p-5 border-t-4 border-red-500">
          <ArrowDownIcon className="w-5 h-5 text-red-500 mb-2" />
          <p className="text-2xl font-bold text-red-600">₹{(summaryData?.totalExpense || 0).toLocaleString('en-IN')}</p>
          <p className="text-sm text-gray-500">Expense (This Month)</p>
        </div>
        <div className={clsx('card p-5 border-t-4', (summaryData?.netProfit || 0) >= 0 ? 'border-brand-500' : 'border-red-500')}>
          <p className={clsx('text-2xl font-bold', (summaryData?.netProfit || 0) >= 0 ? 'text-brand-600' : 'text-red-600')}>
            ₹{Math.abs(summaryData?.netProfit || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-sm text-gray-500">Net {(summaryData?.netProfit || 0) >= 0 ? 'Profit' : 'Loss'} (This Month)</p>
        </div>
      </div>

      <div className="flex gap-3">
        {['', 'income', 'expense'].map((t) => (
          <button key={t} onClick={() => setType(t)} className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition-colors', type === t ? 'bg-brand-600 text-white' : 'bg-white dark:bg-[#0f1a2e] text-gray-600 border border-gray-200 dark:border-[#1b2e4a]')}>
            {t === '' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
              <tr>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Date</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Description</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Category</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">Method</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#1b2e4a]">
              {transactions.map((tx) => (
                <tr key={tx._id} className="hover:bg-gray-50 dark:hover:bg-[#17263d]/50">
                  <td className="py-3 px-4 text-gray-500">{format(new Date(tx.date), 'dd MMM yy')}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-900 dark:text-white">{tx.description}</p>
                    {tx.reference && <p className="text-xs text-gray-400">Ref: {tx.reference}</p>}
                  </td>
                  <td className="py-3 px-4 text-gray-500">{tx.category}</td>
                  <td className="py-3 px-4 text-center text-gray-400 text-xs">{tx.paymentMethod?.replace('_', ' ')}</td>
                  <td className={clsx('py-3 px-4 text-right font-semibold', tx.type === 'income' ? 'text-green-600' : 'text-red-600')}>
                    {tx.type === 'income' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && <div className="text-center py-12 text-gray-400">No transactions found</div>}
        </div>
      )}

      {showForm && <TransactionModal onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['finance'] }); }} />}
    </div>
  );
}
