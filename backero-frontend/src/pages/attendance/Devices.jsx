import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Cpu, RefreshCw, UploadCloud, Settings as SettingsIcon, X } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Button, Card, Drawer, Empty, Input, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const VENDORS = [
  { value: 'MOCK', label: 'Mock (test)' },
  { value: 'CSV_IMPORT', label: 'CSV Import' },
];

const STATUS_COLOR = { ONLINE: 'green', OFFLINE: 'red', UNKNOWN: 'default' };

function AddDeviceDrawer({ open, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', vendor: 'MOCK', location_label: '', connection_secret_ref: '' });

  const mutation = useMutation({
    mutationFn: (body) => api.post('/devices', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device registered');
      setForm({ name: '', vendor: 'MOCK', location_label: '', connection_secret_ref: '' });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to register device'),
  });

  return (
    <Drawer
      open={open} onClose={onClose} width={400} closeIcon={<X size={18} />} title="Add Device"
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} disabled={!form.name.trim()} onClick={() => mutation.mutate(form)}>Add Device</Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Device Name *</Text>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Front Gate Scanner" />
        </div>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Vendor</Text>
          <Select value={form.vendor} onChange={(v) => setForm((f) => ({ ...f, vendor: v }))} style={{ width: '100%' }} options={VENDORS} />
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Only CSV Import actually ingests punches today — other vendors register but "Sync" is a stub.</Text>
        </div>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Location Label</Text>
          <Input value={form.location_label} onChange={(e) => setForm((f) => ({ ...f, location_label: e.target.value }))} placeholder="Main entrance" />
        </div>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Connection Secret Ref</Text>
          <Input value={form.connection_secret_ref} onChange={(e) => setForm((f) => ({ ...f, connection_secret_ref: e.target.value }))} placeholder="Optional" />
        </div>
      </Space>
    </Drawer>
  );
}

function ImportConfigDrawer({ device, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    employeeRefColumn: device?.importConfig?.employee_ref_column || 'EmployeeCode',
    dateColumn: device?.importConfig?.date_column || 'Date',
    checkInColumn: device?.importConfig?.check_in_column || 'CheckIn',
    checkOutColumn: device?.importConfig?.check_out_column || 'CheckOut',
    dateFormat: device?.importConfig?.date_format || 'YYYY-MM-DD',
    timeFormat: device?.importConfig?.time_format || 'HH:mm',
    utcOffsetMinutes: device?.importConfig?.utc_offset_minutes ?? 330,
  });

  const mutation = useMutation({
    // Backend's csvImportAdapter.service.js reads snake_case keys verbatim off the stored
    // importConfig (employee_ref_column, date_column, etc.) — it does NOT accept camelCase,
    // unlike most other endpoints in this API. Map explicitly at submit time.
    mutationFn: (f) => api.put(`/devices/${device._id}/import-config`, {
      employee_ref_column: f.employeeRefColumn,
      date_column: f.dateColumn,
      check_in_column: f.checkInColumn || undefined,
      check_out_column: f.checkOutColumn || undefined,
      date_format: f.dateFormat,
      time_format: f.timeFormat,
      utc_offset_minutes: f.utcOffsetMinutes,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); toast.success('Import config saved'); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save config'),
  });

  return (
    <Drawer
      open={!!device} onClose={onClose} width={400} closeIcon={<X size={18} />} title={`CSV Import Config — ${device?.name}`}
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} onClick={() => mutation.mutate(form)}>Save Config</Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size={14}>
        {[
          ['employeeRefColumn', 'Employee Code Column'], ['dateColumn', 'Date Column'],
          ['checkInColumn', 'Check-in Column'], ['checkOutColumn', 'Check-out Column'],
          ['dateFormat', 'Date Format'], ['timeFormat', 'Time Format'],
        ].map(([key, label]) => (
          <div key={key}>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>{label}</Text>
            <Input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
          </div>
        ))}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>UTC Offset (minutes)</Text>
          <Input type="number" value={form.utcOffsetMinutes} onChange={(e) => setForm((f) => ({ ...f, utcOffsetMinutes: Number(e.target.value) }))} />
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>India Standard Time is +330.</Text>
        </div>
      </Space>
    </Drawer>
  );
}

export default function Devices() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [configDevice, setConfigDevice] = useState(null);
  const [importDeviceId, setImportDeviceId] = useState(null);
  const fileInputRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });
  const devices = data?.data || [];

  const syncMutation = useMutation({
    mutationFn: (id) => api.post(`/devices/${id}/sync`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      const { events_ingested, events_matched, events_unmatched } = res.data;
      toast.success(`Synced — ${events_ingested} ingested, ${events_matched} matched, ${events_unmatched} unmatched`);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Sync failed'),
  });

  const importMutation = useMutation({
    mutationFn: ({ id, file }) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/devices/${id}/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      const { events_ingested, events_matched, events_unmatched } = res.data;
      toast.success(`Imported — ${events_ingested} ingested, ${events_matched} matched, ${events_unmatched} unmatched`);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Import failed'),
  });

  const triggerImport = (deviceId) => {
    setImportDeviceId(deviceId);
    fileInputRef.current?.click();
  };
  const onFileChosen = (e) => {
    const file = e.target.files?.[0];
    if (file && importDeviceId) importMutation.mutate({ id: importDeviceId, file });
    e.target.value = '';
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Vendor', dataIndex: 'vendor', key: 'vendor', render: (v) => <Tag>{v}</Tag> },
    { title: 'Location', dataIndex: 'locationLabel', key: 'locationLabel', render: (v) => v || '—' },
    { title: 'Status', dataIndex: 'status', key: 'status', align: 'center', render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{v}</Tag> },
    { title: 'Last Seen', dataIndex: 'lastSeenAt', key: 'lastSeenAt', render: (v) => v ? dayjs(v).format('DD MMM, HH:mm') : '—' },
    { title: 'Clock Drift', dataIndex: 'clockDriftSeconds', key: 'clockDriftSeconds', render: (v) => v != null ? `${v}s` : '—' },
    {
      title: 'Actions', key: 'actions', align: 'right',
      render: (_, d) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<RefreshCw size={14} />} title="Sync" loading={syncMutation.isPending} onClick={() => syncMutation.mutate(d._id)} />
          {d.vendor === 'CSV_IMPORT' && (
            <>
              <Button type="text" size="small" icon={<SettingsIcon size={14} />} title="Import Config" onClick={() => setConfigDevice(d)} />
              <Button type="text" size="small" icon={<UploadCloud size={14} />} title="Import CSV" onClick={() => triggerImport(d._id)} />
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Biometric Devices</Title>
          <Text type="secondary">Register devices and import attendance punches</Text>
        </div>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Device</Button>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="_id" columns={columns} dataSource={devices} loading={isLoading} pagination={false}
          locale={{
            emptyText: (
              <Empty image={<Cpu size={40} color="#d1d5db" style={{ margin: '0 auto' }} />} description="No devices registered">
                <Button type="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add First Device</Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={onFileChosen} />
      <AddDeviceDrawer open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportConfigDrawer device={configDevice} onClose={() => setConfigDevice(null)} />
    </div>
  );
}
