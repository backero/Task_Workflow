import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert, Search, QrCode, Trash2, Package, CheckCircle2, IndianRupee, Plus } from 'lucide-react';
import ImportButton from '../../components/common/ImportButton';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../../store/useAuthStore';
import QRLabelModal from '../../components/inventory/QRLabelModal';
import QRScannerModal from '../../components/inventory/QRScannerModal';
import { Avatar, Button, Card, Col, Drawer, Input, Modal, Row, Select, Space, Spin, Table, Tabs, Tag, Typography } from 'antd';

const { Title, Text } = Typography;

const CATEGORIES = [
  'Hair Care','Skin Care','Face Care','Body Care','Oral Care',
  "Men's Care",'Baby Care','Sun Care','Makeup','Fragrance',
  'Wellness','Professional','Electronics','Apparel','Other',
];

const PRODUCT_TYPES = [
  'Shampoo','Conditioner','Hair Oil','Serum','Cream','Lotion',
  'Face Wash','Mask','Scrub','Toner','Moisturizer','Cleanser',
  'Soap','Body Wash','Sunscreen','Lip Balm','Deodorant','Perfume',
  'Toothpaste','Hair Spray','Other',
];

function Field({ label, required, children, span = 8 }) {
  return (
    <Col span={span}>
      <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>{label}{required && <Text type="danger"> *</Text>}</Text>
      {children}
    </Col>
  );
}

// ── Add / Edit Drawer ───────────────────────────────────────────────────────

function ProductFormDrawer({ open, onClose, onSuccess, initial }) {
  const [activeTab, setActiveTab] = useState('basic');
  const [loading, setLoading] = useState(false);
  const [purchaseAmt, setPurchaseAmt] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');

  const { register, handleSubmit, watch, setValue, reset } = useForm();

  React.useEffect(() => {
    if (open) {
      reset({
        name: initial?.name || '', sku: initial?.sku || '', category: initial?.category || '',
        subCategory: initial?.subCategory || '', productType: initial?.productType || '', unit: initial?.unit || 'pcs',
        description: initial?.description || '', hsnCode: initial?.hsnCode || '', batchNumber: initial?.batchNumber || '',
        gstRate: initial?.gstRate ?? 18, costPrice: initial?.costPrice || '', sellingPrice: initial?.sellingPrice || '',
        mrp: initial?.mrp || '', minStockLevel: initial?.minStockLevel || 0, currentStock: initial?.currentStock || 0,
        warehouseLocation: initial?.warehouseLocation || '', certifications: initial?.certifications || '',
        storageConditions: initial?.storageConditions || '', barcode: initial?.barcode || '', shelfLife: initial?.shelfLife || '',
        imageUrl: initial?.images?.[0] || '',
      });
      setActiveTab('basic');
      setPurchaseAmt(''); setPurchaseQty('');
    }
  }, [open, initial, reset]);

  const watchedUnit = watch('unit');
  const watchedImageUrl = watch('imageUrl');
  const isWeightUnit = ['g', 'kg', 'ml', 'litre', 'L'].includes(watchedUnit);
  const calcPerUnit = purchaseAmt && purchaseQty && Number(purchaseQty) > 0 ? Number(purchaseAmt) / Number(purchaseQty) : null;

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const { imageUrl, ...rest } = data;
      const payload = { ...rest, isRawMaterial: false, isFinishedGood: true, isSellable: true, images: imageUrl ? [imageUrl] : (initial?.images || []) };
      if (initial?._id) {
        await api.put(`/inventory/products/${initial._id}`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/inventory/products', payload);
        toast.success('Product added');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const items = [
    {
      key: 'basic', label: 'Basic Info',
      children: (
        <Row gutter={[12, 16]}>
          <Field label="Product Name" required span={12}><Input {...register('name', { required: true })} placeholder="e.g. Turmeric Shampoo" /></Field>
          {!initial ? (
            <Field label="SKU" required span={12}><Input {...register('sku', { required: true })} placeholder="e.g. FG-HC-001" /></Field>
          ) : (
            <Field label="SKU" span={12}><Input value={initial.sku} readOnly disabled /></Field>
          )}
          <Field label="Category" required><Select style={{ width: '100%' }} defaultValue={initial?.category || undefined} onChange={(v) => setValue('category', v, { shouldValidate: true })} placeholder="Select" options={CATEGORIES.map((c) => ({ label: c, value: c }))} /></Field>
          <Field label="Sub-Category"><Input {...register('subCategory')} placeholder="e.g. Shampoo" /></Field>
          <Field label="Product Type"><Select style={{ width: '100%' }} defaultValue={initial?.productType || undefined} onChange={(v) => setValue('productType', v)} placeholder="Select" options={PRODUCT_TYPES.map((t) => ({ label: t, value: t }))} /></Field>
          <Field label="Unit" required span={12}><Select style={{ width: '100%' }} defaultValue={initial?.unit || 'pcs'} onChange={(v) => setValue('unit', v)} options={['pcs', 'kg', 'g', 'litre', 'ml', 'L', 'box', 'pack', 'set', 'pair'].map((u) => ({ label: u, value: u }))} /></Field>
          <Field label="Shelf Life (months)" span={12}><Input {...register('shelfLife')} type="number" min="0" placeholder="e.g. 36" /></Field>
          <Field label="Description" span={24}><Input.TextArea {...register('description')} rows={2} placeholder="Key claims, benefits..." /></Field>
          <Field label="Product Image URL" span={24}>
            <Input {...register('imageUrl')} placeholder="https://example.com/product.jpg" />
            {watchedImageUrl && (
              <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', background: '#fafafa', height: 128, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={watchedImageUrl} alt="Preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
            )}
          </Field>
        </Row>
      ),
    },
    {
      key: 'pricing', label: 'Pricing',
      children: (
        <Row gutter={[12, 16]}>
          <Field label="HSN Code" span={12}><Input {...register('hsnCode')} placeholder="e.g. 33049910" /></Field>
          <Field label="GST Rate (%)" span={12}><Select style={{ width: '100%' }} defaultValue={initial?.gstRate ?? 18} onChange={(v) => setValue('gstRate', v)} options={[0, 5, 12, 18, 28].map((r) => ({ label: `${r}%`, value: r }))} /></Field>

          {isWeightUnit && (
            <Col span={24}>
              <Card size="small" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
                <Text strong style={{ fontSize: 11, color: '#1d4ed8', textTransform: 'uppercase' }}>Purchase Price Calculator</Text>
                <Row gutter={12} style={{ marginTop: 8 }}>
                  <Col span={12}>
                    <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Total Amount Paid (₹)</Text>
                    <Input type="number" min="0" placeholder="e.g. 500" value={purchaseAmt} onChange={(e) => setPurchaseAmt(e.target.value)} />
                  </Col>
                  <Col span={12}>
                    <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Total Quantity ({watchedUnit})</Text>
                    <Input type="number" min="0" placeholder="e.g. 1000" value={purchaseQty} onChange={(e) => setPurchaseQty(e.target.value)} />
                  </Col>
                </Row>
                {calcPerUnit !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <Text strong style={{ color: '#1d4ed8' }}>= ₹{calcPerUnit.toFixed(4)} per {watchedUnit}</Text>
                    <Button size="small" type="primary" onClick={() => setValue('costPrice', parseFloat(calcPerUnit.toFixed(4)))}>Apply as Cost Price</Button>
                  </div>
                )}
              </Card>
            </Col>
          )}

          <Field label="Cost Price (₹)"><Input {...register('costPrice')} type="number" min="0" step="0.0001" /></Field>
          <Field label="Selling Price (₹)"><Input {...register('sellingPrice')} type="number" min="0" step="0.01" /></Field>
          <Field label="MRP (₹)"><Input {...register('mrp')} type="number" min="0" step="0.01" /></Field>
          <Field label="Barcode" span={24}><Input {...register('barcode')} placeholder="e.g. 8901234567890" /></Field>
        </Row>
      ),
    },
    {
      key: 'stock', label: 'Stock',
      children: (
        <Row gutter={[12, 16]}>
          <Field label="Min Stock Level" span={12}><Input {...register('minStockLevel')} type="number" min="0" /></Field>
          {!initial && <Field label="Opening Stock" span={12}><Input {...register('currentStock')} type="number" min="0" /></Field>}
          <Field label="Warehouse Location" span={24}><Input {...register('warehouseLocation')} placeholder="e.g. Shelf A-3" /></Field>
          <Field label="Batch Number" span={24}><Input {...register('batchNumber')} placeholder="e.g. BATCH-2026-01" /></Field>
          <Field label="Certifications" span={24}><Input {...register('certifications')} placeholder="e.g. Organic, GMP, Cruelty-Free" /></Field>
          <Field label="Storage Conditions" span={24}><Input {...register('storageConditions')} placeholder="e.g. Store in cool, dry place" /></Field>
        </Row>
      ),
    },
  ];

  return (
    <Drawer
      open={open} onClose={onClose} width={560}
      title={initial ? `Edit — ${initial.name}` : 'Add New Product'}
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={loading} onClick={handleSubmit(onSubmit)}>{initial ? 'Update Product' : 'Add Product'}</Button>
        </Space>
      }
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={items} />
    </Drawer>
  );
}

// ── Stock Adjust Drawer ─────────────────────────────────────────────────────

function StockAdjustDrawer({ product, onClose, onSuccess }) {
  const [qty, setQty] = useState('');
  const [type, setType] = useState('IN');
  const [notes, setNotes] = useState('');
  const [batch, setBatch] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!qty || isNaN(qty) || Number(qty) <= 0) return toast.error('Enter valid quantity');
    setLoading(true);
    try {
      if (type === 'IN') {
        await api.post('/inventory/stock-in', { productId: product._id, quantity: Number(qty), notes, batch: batch || undefined });
      } else {
        await api.post('/inventory/stock-out', { productId: product._id, quantity: Number(qty), notes });
      }
      toast.success(`Stock ${type === 'IN' ? 'added' : 'deducted'}`);
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      open={!!product} onClose={onClose} width={400}
      title="Stock Movement"
      footer={
        product && (
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
            <Button type="primary" style={{ flex: 1 }} loading={loading} onClick={handleSubmit}>Confirm</Button>
          </Space>
        )
      }
    >
      {product && (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Text type="secondary">{product.name} · <Text strong>{product.currentStock} {product.unit}</Text> current</Text>
          <Space.Compact style={{ width: '100%' }}>
            <Button type={type === 'IN' ? 'primary' : 'default'} style={{ flex: 1, background: type === 'IN' ? '#059669' : undefined, borderColor: type === 'IN' ? '#059669' : undefined }} onClick={() => setType('IN')}>Stock In</Button>
            <Button danger type={type === 'OUT' ? 'primary' : 'default'} style={{ flex: 1 }} onClick={() => setType('OUT')}>Stock Out</Button>
          </Space.Compact>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Quantity ({product.unit})</Text>
            <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Enter quantity" />
          </div>
          {type === 'IN' && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Batch Number</Text>
              <Input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="e.g. BATCH-2026-01" />
            </div>
          )}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Notes</Text>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason..." />
          </div>
        </Space>
      )}
    </Drawer>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(date) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Products() {
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [stockProduct, setStockProduct] = useState(null);
  const [qrProduct, setQrProduct] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [filterCat, setFilterCat] = useState('');
  const { isAdminOrAbove, hasInventoryWrite } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'products', 'finished', search, lowStockOnly],
    queryFn: () =>
      api.get('/inventory/products', { params: { search: search || undefined, isLowStock: lowStockOnly || undefined, isRawMaterial: false, limit: 100 } }).then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const allProducts = (data?.data?.products || data?.data || []).filter((p) => !p.isRawMaterial);

  const products = useMemo(() => {
    let list = allProducts;
    if (filterCat) list = list.filter((p) => p.category === filterCat);
    return list;
  }, [allProducts, filterCat]);

  const categories = useMemo(() => [...new Set(allProducts.map((p) => p.category).filter(Boolean))].sort(), [allProducts]);

  const stats = useMemo(() => ({
    total: allProducts.length,
    inStock: allProducts.filter((p) => p.currentStock > (p.minStockLevel || 0)).length,
    lowStock: allProducts.filter((p) => p.currentStock > 0 && p.currentStock <= (p.minStockLevel || 0)).length,
    outStock: allProducts.filter((p) => p.currentStock === 0).length,
    value: allProducts.reduce((s, p) => s + ((p.currentStock || 0) * (p.costPrice || 0)), 0),
  }), [allProducts]);

  const lowStockCount = stats.lowStock + stats.outStock;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['inventory'] });

  const handleDelete = async () => {
    if (!deleteProduct) return;
    setDeleting(true);
    try {
      await api.delete(`/inventory/products/${deleteProduct._id}`);
      toast.success(`${deleteProduct.name} deleted`);
      setDeleteProduct(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const canWrite = hasInventoryWrite();

  const columns = [
    {
      title: 'Product', key: 'product',
      render: (_, p) => (
        <Space>
          {p.images?.[0] ? <Avatar shape="square" src={p.images[0]} /> : <Avatar shape="square" icon={<Package size={16} />} style={{ background: '#f1f5f9', color: '#94a3b8' }} />}
          <div>
            <Text strong>{p.name}</Text>
            <div><Text type="secondary" style={{ fontSize: 12 }}>{p.productType || p.subCategory || '—'}</Text></div>
          </div>
        </Space>
      ),
    },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', render: (v) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }} type="secondary">{v}</Text> },
    { title: 'Category', dataIndex: 'category', key: 'category', render: (v) => <Tag>{v}</Tag> },
    {
      title: 'Stock', key: 'stock', align: 'center',
      render: (_, p) => {
        const isLow = p.currentStock <= p.minStockLevel;
        const isOut = p.currentStock === 0;
        return <Text strong style={{ color: isOut ? '#ef4444' : isLow ? '#f97316' : undefined }}>{p.currentStock} <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{p.unit}</Text></Text>;
      },
    },
    {
      title: 'Price & GST', key: 'price', align: 'right',
      render: (_, p) => (
        <div>
          {p.mrp > 0 && <div><Text strong style={{ fontSize: 13 }}>MRP ₹{p.mrp?.toLocaleString('en-IN')}</Text></div>}
          <Text type="secondary" style={{ fontSize: 12 }}>SP: ₹{p.sellingPrice?.toLocaleString('en-IN') || '—'}{p.gstRate != null && <Text style={{ fontSize: 12, color: '#3b82f6' }}> GST {p.gstRate}%</Text>}</Text>
        </div>
      ),
    },
    {
      title: 'Status', key: 'status', align: 'center',
      render: (_, p) => {
        const isLow = p.currentStock <= p.minStockLevel;
        const isOut = p.currentStock === 0;
        return isOut ? <Tag color="red">Out of Stock</Tag> : isLow ? <Tag color="orange">Low Stock</Tag> : <Tag color="green">In Stock</Tag>;
      },
    },
    { title: 'Last Stock In', key: 'lastStockIn', align: 'center', render: (_, p) => <Text type="secondary" style={{ fontSize: 12 }}>{p.lastStockIn ? timeAgo(p.lastStockIn) : '—'}</Text> },
    ...(canWrite ? [{
      title: 'Actions', key: 'actions', align: 'right',
      render: (_, p) => (
        <Space size={4}>
          <Button size="small" onClick={() => setStockProduct(p)}>Stock</Button>
          <Button size="small" type="text" icon={<QrCode size={14} />} title="QR Label" onClick={() => setQrProduct(p)} />
          <Button size="small" type="text" onClick={() => setEditProduct(p)}>Edit</Button>
          {canWrite && <Button size="small" type="text" danger icon={<Trash2 size={14} />} title="Delete" onClick={() => setDeleteProduct(p)} />}
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Products</Title>
          <Text type="secondary">{products.length} products · {lowStockCount} low stock</Text>
        </div>
        {canWrite && (
          <Space>
            {isAdminOrAbove() && <ImportButton templateUrl="/inventory/import/template" importUrl="/inventory/import" onSuccess={invalidate} label="Import" />}
            <Button type="primary" icon={<Plus size={14} />} onClick={() => setShowForm(true)}>Add Product</Button>
          </Space>
        )}
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={5}>
          <Card size="small"><Space><div style={{ width: 40, height: 40, borderRadius: 10, background: '#3b82f61f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={18} color="#3b82f6" /></div><div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total</Text><Text strong style={{ fontSize: 18 }}>{stats.total}</Text></div></Space></Card>
        </Col>
        <Col span={5}>
          <Card size="small"><Space><div style={{ width: 40, height: 40, borderRadius: 10, background: '#10b9811f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 size={18} color="#10b981" /></div><div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>In Stock</Text><Text strong style={{ fontSize: 18, color: '#059669' }}>{stats.inStock}</Text></div></Space></Card>
        </Col>
        <Col span={5}>
          <Card size="small"><Space><div style={{ width: 40, height: 40, borderRadius: 10, background: '#f973161f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TriangleAlert size={18} color="#f97316" /></div><div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Low Stock</Text><Text strong style={{ fontSize: 18, color: '#ea580c' }}>{stats.lowStock}</Text></div></Space></Card>
        </Col>
        <Col span={5}>
          <Card size="small"><Space><div style={{ width: 40, height: 40, borderRadius: 10, background: '#ef44441f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TriangleAlert size={18} color="#ef4444" /></div><div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Out of Stock</Text><Text strong style={{ fontSize: 18, color: '#dc2626' }}>{stats.outStock}</Text></div></Space></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Space><div style={{ width: 40, height: 40, borderRadius: 10, background: '#6366f11f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IndianRupee size={18} color="#6366f1" /></div><div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Inventory Value</Text><Text strong style={{ fontSize: 15, color: '#4f46e5' }}>₹{stats.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text></div></Space></Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products, SKU..." prefix={<Search size={14} color="#9ca3af" />} style={{ width: 260 }} />
        <Select value={filterCat} onChange={setFilterCat} style={{ width: 180 }} options={[{ label: 'All Categories', value: '' }, ...categories.map((c) => ({ label: c, value: c }))]} />
        <Button type={lowStockOnly ? 'primary' : 'default'} danger={lowStockOnly} icon={<TriangleAlert size={14} />} onClick={() => setLowStockOnly((p) => !p)}>Low Stock Only</Button>
      </Space>

      <Card styles={{ body: { padding: 0 } }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : (
          <Table rowKey="_id" columns={columns} dataSource={products} pagination={false} locale={{ emptyText: 'No products found' }} />
        )}
      </Card>

      <ProductFormDrawer
        open={showForm || !!editProduct}
        initial={editProduct}
        onClose={() => { setShowForm(false); setEditProduct(null); }}
        onSuccess={() => { setShowForm(false); setEditProduct(null); invalidate(); }}
      />

      <StockAdjustDrawer product={stockProduct} onClose={() => setStockProduct(null)} onSuccess={() => { setStockProduct(null); invalidate(); }} />

      {qrProduct && <QRLabelModal products={[qrProduct]} onClose={() => setQrProduct(null)} />}
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onSuccess={invalidate} />}

      <Button
        shape="round" type="primary" icon={<QrCode size={16} />} size="large"
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 30, background: '#f97316', borderColor: '#f97316' }}
        onClick={() => setShowScanner(true)}
      >
        Scan QR
      </Button>

      <Modal
        open={!!deleteProduct} onCancel={() => setDeleteProduct(null)} footer={null} width={380}
        title={<Space size={8}><Trash2 size={16} color="#ef4444" />Delete Product?</Space>}
      >
        {deleteProduct && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Text type="secondary">This cannot be undone.</Text>
            <Card size="small" style={{ background: '#fafafa' }}>
              <Text strong>{deleteProduct.name}</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>SKU: {deleteProduct.sku} · Stock: {deleteProduct.currentStock} {deleteProduct.unit}</Text></div>
            </Card>
            <Space style={{ width: '100%' }}>
              <Button style={{ flex: 1 }} onClick={() => setDeleteProduct(null)}>Cancel</Button>
              <Button danger type="primary" style={{ flex: 1 }} loading={deleting} onClick={handleDelete}>Delete</Button>
            </Space>
          </Space>
        )}
      </Modal>
    </div>
  );
}
