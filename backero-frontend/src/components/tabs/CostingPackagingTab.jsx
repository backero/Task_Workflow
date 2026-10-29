import React from 'react';
import { Package, BarChart3 } from 'lucide-react';
import PackagingTab from './shared/PackagingTab';
import CostingTab from './shared/CostingTab';

export default function CostingPackagingTab({ product, form, setForm, isPending, onSavePackaging, onSaveCosting }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-1.5"><Package size={14} />Packaging & Labeling</p>
        <PackagingTab product={product} form={form} setForm={setForm} onSave={onSavePackaging} isPending={isPending} />
      </div>
      <hr className="border-gray-100 dark:border-[#1b2e4a]" />
      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-1.5"><BarChart3 size={14} />Costing &amp; Variant Pricing</p>
        <CostingTab product={product} form={form} setForm={setForm} onSave={onSaveCosting} isPending={isPending} />
      </div>
    </div>
  );
}
