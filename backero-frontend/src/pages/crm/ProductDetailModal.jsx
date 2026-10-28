import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import RDPriceCalculator from '../production/RDPriceCalculator';

export default function ProductDetailModal({ productId, onClose, refetchLead }) {
  const qc = useQueryClient();
  const { data: productData, isLoading, refetch } = useQuery({
    queryKey: ['catalog-detail', productId],
    queryFn: () => api.get(`/catalog/products/${productId}`).then(r => r.data),
    enabled: !!productId,
  });
  const product = productData?.product;
  const [activeTab, setActiveTab] = useState('Overview');
  const [editingFormulation, setEditingFormulation] = useState(false);
  const [formulation, setFormulation] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (product?.formulation) {
      setFormulation(JSON.parse(JSON.stringify(product.formulation)));
    }
  }, [product]);

  const updateFormulationMutation = useMutation({
    mutationFn: (data) => api.put(`/catalog/products/${productId}`, { formulation: data }),
    onSuccess: () => {
      refetch();
      setEditingFormulation(false);
      toast.success('Formulation saved successfully');
    },
    onError: () => toast.error('Failed to save formulation'),
  });

  // Detect product updates from ProductCatalog
  useEffect(() => {
    if (sessionStorage.getItem('productUpdated') === 'true') {
      refetch();
      if (refetchLead) refetchLead();
      sessionStorage.removeItem('productUpdated');
    }
  }, [refetch, refetchLead]);

  if (isLoading) return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8">Loading product details...</div>
    </div>
  );
  if (!product) return null;

  const TABS = ['Overview', 'Formulation & Procedure', 'R&D Price Calculator', 'R&D & Overheads', 'Costing', 'Marketplace', 'QR Code', 'Documents'];

  return (
    <div className={`fixed bg-black/40 flex items-center justify-center z-50 p-2 ${isMaximized ? 'inset-0' : 'inset-0'}`}>
      <div className={`bg-white rounded-2xl shadow-2xl flex flex-col transition-all ${isMaximized ? 'w-full h-full max-h-screen' : 'w-full max-w-5xl max-h-[95vh]'}`}>
        {/* Header */}
        <div className="border-b border-[#e7e2d6] p-6 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-[#1c1917]">{product.name}</h2>
            <p className="text-sm text-[#8a8171]">{product.code} • {product.category} {product.type && `• ${product.type}`}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Minimize' : 'Maximize'}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#f1ede4] font-bold text-lg"
            >
              {isMaximized ? '−' : '+'}
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#f1ede4] font-bold text-xl"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[#e7e2d6] px-6 flex gap-1 overflow-x-auto flex-shrink-0">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab
                  ? 'text-[#669c2c] border-[#669c2c]'
                  : 'text-[#8a8171] border-transparent hover:text-[#1c1917]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'Overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">SKU / Code</label>
                  <p className="text-sm text-[#1c1917] font-mono mt-1">{product.code}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Status</label>
                  <p className="mt-1">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                      product.status === 'Active' ? 'bg-[#d1fae5] text-[#065f46]' :
                      product.status === 'Inactive' ? 'bg-[#fee2e2] text-[#991b1b]' :
                      'bg-[#fef3c7] text-[#92400e]'
                    }`}>
                      {product.status}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Category</label>
                  <p className="text-sm text-[#1c1917] mt-1">{product.category}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Type</label>
                  <p className="text-sm text-[#1c1917] mt-1">{product.type || '—'}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Base Unit</label>
                  <p className="text-sm text-[#1c1917] mt-1">{product.unit}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Reference Weight</label>
                  <p className="text-sm text-[#1c1917] mt-1">{product.weight || '—'}</p>
                </div>
              </div>
              {product.description && (
                <div>
                  <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Description</label>
                  <p className="text-sm text-[#1c1917] mt-2 leading-relaxed">{product.description}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Formulation & Procedure' && (
            <div className="space-y-4">
              {formulation?.rows && formulation.rows.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Ref Weight / Volume</label>
                      {editingFormulation ? (
                        <input
                          type="number"
                          value={formulation.refWeight || 100}
                          onChange={(e) => setFormulation({...formulation, refWeight: e.target.value})}
                          className="mt-1 px-2 py-1 border border-[#ddd6c4] rounded text-sm"
                        />
                      ) : (
                        <p className="text-sm text-[#1c1917] mt-1">{formulation.refWeight || 100} {product.unit}</p>
                      )}
                    </div>
                    <button
                      onClick={() => editingFormulation ? updateFormulationMutation.mutate(formulation) : setEditingFormulation(true)}
                      disabled={updateFormulationMutation.isPending}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                        editingFormulation
                          ? 'bg-[#669c2c] text-white hover:brightness-95'
                          : 'bg-[#f1ede4] text-[#6b6155] hover:bg-[#e7e2d6]'
                      }`}
                    >
                      {editingFormulation ? (updateFormulationMutation.isPending ? 'Saving...' : 'Save') : 'Edit'}
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-[#e7e2d6]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#f1ede4] border-b border-[#e7e2d6]">
                          <th className="px-3 py-2 text-left text-xs font-bold text-[#6b6155]">Ingredient</th>
                          <th className="px-3 py-2 text-left text-xs font-bold text-[#6b6155]">%</th>
                          <th className="px-3 py-2 text-left text-xs font-bold text-[#6b6155]">Qty</th>
                          <th className="px-3 py-2 text-left text-xs font-bold text-[#6b6155]">Unit</th>
                          <th className="px-3 py-2 text-left text-xs font-bold text-[#6b6155]">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formulation.rows.map((row, i) => (
                          <tr key={i} className="border-b border-[#e7e2d6]">
                            <td className="px-3 py-2">
                              {editingFormulation ? (
                                <input
                                  value={row.ingredient || ''}
                                  onChange={(e) => {
                                    const newRows = [...formulation.rows];
                                    newRows[i].ingredient = e.target.value;
                                    setFormulation({...formulation, rows: newRows});
                                  }}
                                  className="w-full px-2 py-1 border border-[#ddd6c4] rounded text-sm"
                                />
                              ) : (
                                <span className="text-[#1c1917]">{row.ingredient}</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {editingFormulation ? (
                                <input
                                  type="number"
                                  value={row.percentage || ''}
                                  onChange={(e) => {
                                    const newRows = [...formulation.rows];
                                    newRows[i].percentage = e.target.value;
                                    setFormulation({...formulation, rows: newRows});
                                  }}
                                  className="w-20 px-2 py-1 border border-[#ddd6c4] rounded text-sm"
                                />
                              ) : (
                                <span className="text-[#6b6155]">{row.percentage || '—'}%</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {editingFormulation ? (
                                <input
                                  type="number"
                                  value={row.quantity || ''}
                                  onChange={(e) => {
                                    const newRows = [...formulation.rows];
                                    newRows[i].quantity = e.target.value;
                                    setFormulation({...formulation, rows: newRows});
                                  }}
                                  className="w-20 px-2 py-1 border border-[#ddd6c4] rounded text-sm"
                                />
                              ) : (
                                <span className="text-[#6b6155]">{row.quantity || '—'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[#6b6155]">{row.unit || '—'}</td>
                            <td className="px-3 py-2 text-[#669c2c] font-semibold">₹{(row.costPerUnit || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-center py-8 text-[#8a8171]">No formulation added yet</p>
              )}
            </div>
          )}

          {activeTab === 'R&D Price Calculator' && product && (
            <div className="-mx-6 -mb-6">
              <RDPriceCalculator productId={productId} productName={product.name} />
            </div>
          )}

          {activeTab === 'Costing' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                {product.costing?.rawMaterialCost !== undefined && (
                  <div>
                    <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Raw Material Cost</label>
                    <p className="text-lg font-semibold text-[#1c1917] mt-2">₹{(product.costing.rawMaterialCost || 0).toFixed(2)}</p>
                  </div>
                )}
                {product.costing?.packagingCost !== undefined && (
                  <div>
                    <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Packaging Cost</label>
                    <p className="text-lg font-semibold text-[#1c1917] mt-2">₹{(product.costing.packagingCost || 0).toFixed(2)}</p>
                  </div>
                )}
                {product.costPerUnit && (
                  <div>
                    <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Formulation Cost / Unit</label>
                    <p className="text-lg font-bold text-[#669c2c] mt-2">₹{(product.costPerUnit || 0).toFixed(2)}</p>
                  </div>
                )}
                {product.costing?.totalCostPerUnit && (
                  <div>
                    <label className="text-xs font-bold text-[#6b6155] uppercase tracking-wide">Total Cost / Unit</label>
                    <p className="text-lg font-bold text-[#669c2c] mt-2">₹{(product.costing.totalCostPerUnit || 0).toFixed(2)}</p>
                  </div>
                )}
              </div>
              {!product.costing && !product.costPerUnit && (
                <p className="text-center py-8 text-[#8a8171]">No costing information available yet</p>
              )}
            </div>
          )}

          {activeTab === 'Marketplace' && (
            <div className="space-y-4">
              {product.marketplace && Object.keys(product.marketplace).length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {Object.entries(product.marketplace).map(([platform, data]) => (
                    <div key={platform} className="border border-[#e7e2d6] rounded-lg p-4">
                      <h4 className="font-bold text-[#1c1917] capitalize mb-2">{platform}</h4>
                      <p className="text-sm text-[#6b6155]">Status: {data.status || 'Inactive'}</p>
                      {data.link && <p className="text-sm text-[#669c2c] mt-1"><a href={data.link} target="_blank" rel="noopener noreferrer">View on {platform}</a></p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-[#8a8171]">No marketplace listings</p>
              )}
            </div>
          )}

          {activeTab === 'QR Code' && (
            <div className="text-center py-8">
              <p className="text-[#8a8171] mb-4">QR Code - Click Edit to generate</p>
              {product.qrCode && <img src={product.qrCode} alt="QR Code" className="w-32 h-32 mx-auto" />}
            </div>
          )}

          {activeTab === 'Documents' && (
            <div className="text-center py-8">
              <p className="text-[#8a8171]">Documents - {product.documents?.length || 0} file(s)</p>
            </div>
          )}

          {activeTab === 'R&D & Overheads' && (
            <div className="text-center py-8">
              <p className="text-[#8a8171]">R&D & Overheads details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
