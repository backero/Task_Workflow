import { useState } from 'react';
import toast from 'react-hot-toast';
import { Upload } from 'lucide-react';
import { Button, Col, Drawer, Form, Input, InputNumber, Row, Select, Space, Typography } from 'antd';
import { CATEGORIES as CATALOG_CATEGORIES, UNITS as CATALOG_UNITS, PRODUCT_TYPES as CATALOG_PRODUCT_TYPES, GST_RATES as CATALOG_GST_RATES, STATUSES as CATALOG_STATUSES } from '../inventory/ProductCatalogPage';

const { Text } = Typography;

// Leaf module (no imports from SampleLeadDetail.jsx / StageSteps.jsx / NewOrderModal.jsx) so all
// three can create a catalog product inline without forming an import cycle — this used to live
// inside SampleLeadDetail.jsx, but StageSteps.jsx's Stage 0 "Orders" panel now also
// needs it (to add another product line for an existing order's customer) and StageSteps.jsx is
// itself imported BY SampleLeadDetail.jsx, so it had to move out to its own file first.

// "Create Product" — creates a real Product Catalog entry via POST /catalog/products (the
// caller does the actual API call and passes it in as onSave), so it shows up in the actual
// Product Catalog too. Mirrors the exact Basic Info field set of the catalog's own "Add New
// Product" form (Formulation/Costing/Marketplace/etc. only unlock after the product exists
// there too, so they're out of scope here).
export function CreateCatalogProductModal({ nextCode, defaultName, saving, onClose, onSave }) {
  const [code, setCode] = useState(nextCode);
  const [name, setName] = useState(defaultName || '');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('Active');
  const [unit, setUnit] = useState('ml');
  const [weight, setWeight] = useState('');
  const [gstRate, setGstRate] = useState(18);
  const [hsnCode, setHsnCode] = useState('');
  const [shelfLife, setShelfLife] = useState('');
  const [description, setDescription] = useState('');
  const [storage, setStorage] = useState('');
  const [certifications, setCertifications] = useState('');
  const [barcode, setBarcode] = useState('');
  const [imagePreview, setImagePreview] = useState(null);

  function onImageChange(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => setImagePreview(ev.target.result);
    r.readAsDataURL(f);
  }

  function submit() {
    if (!code.trim() || !name.trim() || !category) { toast.error('SKU code, name and category are required'); return; }
    onSave({
      code: code.trim(), name: name.trim(), category, subCategory: subCategory.trim() || undefined,
      type: type || undefined, status, unit, weight: weight ? Number(weight) : undefined,
      gstRate, hsnCode: hsnCode.trim() || undefined, shelfLife: shelfLife ? Number(shelfLife) : undefined,
      description: description.trim() || undefined, storage: storage.trim() || undefined,
      certifications: certifications.trim() || undefined, barcode: barcode.trim() || undefined,
      image: imagePreview || undefined,
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Create Product"
      width={520}
      footer={
        <Space style={{ width: '100%' }}>
          <Button onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={saving} onClick={submit}>Create in Catalog</Button>
        </Space>
      }
    >
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
        Creates a real entry in the Product Catalog (same fields as Product Catalog's own Add Product).
      </Text>

      <Form layout="vertical">
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="SKU Code *" required>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., FG-0007" />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item label="Product Name *" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Vitamin C Serum" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="Category *" required>
              <Select value={category || undefined} onChange={setCategory} placeholder="Select…" options={CATALOG_CATEGORIES.map((c) => ({ label: c, value: c }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Sub-Category">
              <Input value={subCategory} onChange={(e) => setSubCategory(e.target.value)} placeholder="e.g., Shampoo, Serum" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Product Type">
              <Select value={type || undefined} onChange={setType} placeholder="Select…" options={CATALOG_PRODUCT_TYPES.map((t) => ({ label: t, value: t }))} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="Status">
              <Select value={status} onChange={setStatus} options={CATALOG_STATUSES.map((s) => ({ label: s, value: s }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Base Unit">
              <Select value={unit} onChange={setUnit} options={CATALOG_UNITS.map((u) => ({ label: u, value: u }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Ref Weight/Volume">
              <InputNumber style={{ width: '100%' }} value={weight} onChange={setWeight} placeholder="e.g., 200" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="GST Rate">
              <Select value={gstRate} onChange={setGstRate} options={CATALOG_GST_RATES.map((r) => ({ label: `${r}%`, value: r }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="HSN Code">
              <Input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="e.g., 3305" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Shelf Life (months)">
              <InputNumber style={{ width: '100%' }} value={shelfLife} onChange={setShelfLife} placeholder="e.g., 36" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={16}>
            <Form.Item label="Description">
              <Input.TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Product description, key claims, benefits…" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Image">
              <label style={{ width: 64, height: 64, border: '2px dashed #d9d9d9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', background: '#fff' }}>
                {imagePreview ? (
                  <img src={imagePreview} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Upload size={16} color="#bfbfbf" />
                )}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onImageChange} />
              </label>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="Storage">
              <Input value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="Cool, dry place" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Certifications">
              <Input value={certifications} onChange={(e) => setCertifications(e.target.value)} placeholder="Organic, Cruelty-Free…" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Barcode">
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="8901234567890" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Drawer>
  );
}
