import React from 'react';
import RndOverheadsTab from './RndOverheadsTab';
import CostingPackagingTab from './CostingPackagingTab';

export default function ProductOverheadsTab({ product, form, setForm, onSaveProductionOverheads, onSavePackaging, onSaveVariants, onSaveCosting, isPending }) {
  return (
    <div className="space-y-8">
      <div>
        <RndOverheadsTab
          product={product}
          form={form}
          setForm={setForm}
          onSave={onSaveProductionOverheads}
          isPending={isPending}
        />
      </div>

      <hr className="border-gray-100 dark:border-[#1b2e4a]" />

      <div>
        <CostingPackagingTab
          product={product}
          form={form}
          setForm={setForm}
          isPending={isPending}
          onSavePackaging={onSavePackaging}
          onSaveVariants={onSaveVariants}
          onSaveCosting={onSaveCosting}
        />
      </div>
    </div>
  );
}
