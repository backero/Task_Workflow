import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Camera, Copy } from 'lucide-react';
import { Avatar, Button, Card, Col, Input, Row, Space, Switch, Tabs, Typography } from 'antd';

const { Title, Text, Paragraph } = Typography;

export default function Settings() {
  const { user, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [sigPreview, setSigPreview] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [qrPreview, setQrPreview] = useState('');
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [callbackUrlInput, setCallbackUrlInput] = useState('');
  const [revealedKey, setRevealedKey] = useState(null);
  const avatarInputRef = React.useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => { setAvatarBroken(false); }, [user?.avatar]);

  const { register, handleSubmit } = useForm({ defaultValues: { firstName: user?.firstName, lastName: user?.lastName, phone: user?.phone, designation: user?.designation } });
  const { register: regPass, handleSubmit: submitPass, reset: resetPass } = useForm();
  const { register: regInv, handleSubmit: submitInv, reset: resetInv, watch: watchInv } = useForm();

  const { data: orgData } = useQuery({
    queryKey: ['org-me'],
    queryFn: () => api.get('/organizations/me').then((r) => r.data.organization),
    enabled: ['invoice', 'org'].includes(activeTab),
  });

  useEffect(() => {
    if (orgData && activeTab === 'invoice') {
      const b = orgData.bankDetails || {};
      resetInv({
        logo: orgData.logo || '',
        invoicePrefix: orgData.invoicePrefix || 'INV',
        invoiceTerms: orgData.invoiceTerms || '',
        signatureUrl: orgData.signatureUrl || '',
        bankName: b.bankName || '',
        accountNumber: b.accountNumber || '',
        ifscCode: b.ifscCode || '',
        accountName: b.accountName || '',
        branch: b.branch || '',
        upiId: b.upiId || '',
        upiQrUrl: b.upiQrUrl || '',
      });
      setSigPreview(orgData.signatureUrl || '');
      setLogoPreview(orgData.logo || '');
      setQrPreview(b.upiQrUrl || '');
    }
  }, [orgData, activeTab, resetInv]);

  const sigUrl = watchInv ? watchInv('signatureUrl') : '';
  const logoUrl = watchInv ? watchInv('logo') : '';
  const qrUrl = watchInv ? watchInv('upiQrUrl') : '';
  useEffect(() => { setSigPreview(sigUrl || ''); }, [sigUrl]);
  useEffect(() => { setLogoPreview(logoUrl || ''); }, [logoUrl]);
  useEffect(() => { setQrPreview(qrUrl || ''); }, [qrUrl]);

  const profileMutation = useMutation({
    mutationFn: (data) => api.patch('/users/me/profile', data),
    onSuccess: (res) => { setUser(res.data.user); toast.success('Profile updated'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const avatarMutation = useMutation({
    mutationFn: (file) => {
      const form = new FormData();
      form.append('avatar', file);
      return api.post('/users/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => { setUser(res.data.user); toast.success('Profile photo updated'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to upload photo'),
  });

  const handleAvatarSelected = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    avatarMutation.mutate(file);
  };

  const passwordMutation = useMutation({
    mutationFn: (data) => api.patch('/auth/change-password', data),
    onSuccess: () => { toast.success('Password changed'); resetPass(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const invoiceMutation = useMutation({
    mutationFn: (data) => api.put('/organizations/me', {
      logo: data.logo,
      invoicePrefix: data.invoicePrefix,
      invoiceTerms: data.invoiceTerms,
      signatureUrl: data.signatureUrl,
      bankDetails: {
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        ifscCode: data.ifscCode,
        accountName: data.accountName,
        branch: data.branch,
        upiId: data.upiId,
        upiQrUrl: data.upiQrUrl,
      },
    }),
    onSuccess: () => { queryClient.invalidateQueries(['org-me']); toast.success('Invoice settings saved'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
  });

  const isAdmin = ['admin', 'owner', 'super_admin'].includes(user?.role);

  const { data: integrationStatus, refetch: refetchIntegrationStatus } = useQuery({
    queryKey: ['social-automation-status'],
    queryFn: () => api.get('/organizations/social-automation/status').then((r) => r.data),
    enabled: isAdmin && activeTab === 'integrations',
  });

  useEffect(() => {
    if (integrationStatus) setCallbackUrlInput(integrationStatus.defaultCallbackUrl || '');
  }, [integrationStatus]);

  const generateKeyMutation = useMutation({
    mutationFn: () => api.post('/organizations/social-automation/generate-key'),
    onSuccess: (res) => {
      setRevealedKey({ apiKey: res.data.apiKey, webhookSecret: res.data.webhookSecret });
      refetchIntegrationStatus();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to generate key'),
  });

  const callbackUrlMutation = useMutation({
    mutationFn: (defaultCallbackUrl) => api.put('/organizations/social-automation/callback-url', { defaultCallbackUrl }),
    onSuccess: () => { toast.success('Callback URL saved'); refetchIntegrationStatus(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
  });

  const Field = ({ label, hint, children }) => (
    <div>
      <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>{label}</Text>
      {children}
      {hint && <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>{hint}</Text>}
    </div>
  );

  const items = [
    {
      key: 'profile', label: 'Profile',
      children: (
        <Card>
          <Title level={5} style={{ marginBottom: 16 }}>Profile Information</Title>
          <form onSubmit={handleSubmit(profileMutation.mutate)}>
            <Space size={16} style={{ marginBottom: 24 }} align="center">
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarSelected} style={{ display: 'none' }} />
              <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => avatarInputRef.current?.click()} title="Change profile photo">
                {user?.avatar && !avatarBroken ? (
                  <Avatar size={64} src={user.avatar} onError={() => { setAvatarBroken(true); return false; }} />
                ) : (
                  <Avatar size={64} style={{ backgroundColor: '#669c2c1f', color: '#669c2c', fontSize: 24, fontWeight: 700 }}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Avatar>
                )}
              </div>
              <div>
                <Text strong>{user?.firstName} {user?.lastName}</Text>
                <div><Text type="secondary" style={{ fontSize: 13 }}>{user?.role?.replace('_', ' ')} • {user?.department}</Text></div>
                <div><Text type="secondary" style={{ fontSize: 12 }}>{user?.email}</Text></div>
                <Button type="link" size="small" icon={<Camera size={12} />} style={{ paddingLeft: 0 }} onClick={() => avatarInputRef.current?.click()}>Change photo</Button>
              </div>
            </Space>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <Row gutter={12}>
                <Col span={12}><Field label="First Name"><Input {...register('firstName')} /></Field></Col>
                <Col span={12}><Field label="Last Name"><Input {...register('lastName')} /></Field></Col>
              </Row>
              <Field label="Phone"><Input {...register('phone')} /></Field>
              <Field label="Designation"><Input {...register('designation')} /></Field>
              <Button type="primary" htmlType="submit" loading={profileMutation.isPending}>Save Changes</Button>
            </Space>
          </form>
        </Card>
      ),
    },
    {
      key: 'password', label: 'Password',
      children: (
        <Card>
          <Title level={5} style={{ marginBottom: 16 }}>Change Password</Title>
          <form onSubmit={submitPass(passwordMutation.mutate)}>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <Field label="Current Password"><Input.Password {...regPass('currentPassword', { required: true })} /></Field>
              <Field label="New Password"><Input.Password {...regPass('newPassword', { required: true, minLength: { value: 8, message: 'Min 8 chars' } })} /></Field>
              <Button type="primary" htmlType="submit" loading={passwordMutation.isPending}>Change Password</Button>
            </Space>
          </form>
        </Card>
      ),
    },
    {
      key: 'notifications', label: 'Notifications',
      children: (
        <Card>
          <Title level={5} style={{ marginBottom: 16 }}>Notification Preferences</Title>
          <Space direction="vertical" style={{ width: '100%' }} split={<div style={{ borderBottom: '1px solid #f0f0f0' }} />}>
            {[
              { key: 'inApp', label: 'In-App Notifications', desc: 'Show notifications inside the platform' },
              { key: 'whatsapp', label: 'WhatsApp Notifications', desc: 'Receive alerts on WhatsApp' },
              { key: 'email', label: 'Email Notifications', desc: 'Receive email updates for tasks and approvals' },
            ].map((pref) => {
              const enabled = user?.settings?.notifications?.[pref.key] ?? true;
              return (
                <div key={pref.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                  <div>
                    <Text strong>{pref.label}</Text>
                    <div><Text type="secondary" style={{ fontSize: 13 }}>{pref.desc}</Text></div>
                  </div>
                  <Switch
                    checked={enabled}
                    onChange={() => {
                      api.patch('/users/me/profile', { [`settings.notifications.${pref.key}`]: !enabled })
                        .then((res) => setUser(res.data.user))
                        .catch(() => toast.error('Failed to update'));
                    }}
                  />
                </div>
              );
            })}
          </Space>
        </Card>
      ),
    },
  ];

  if (isAdmin) {
    items.push({
      key: 'invoice', label: 'Invoice Settings',
      children: (
        <form onSubmit={submitInv(invoiceMutation.mutate)}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card>
              <Title level={5} style={{ marginBottom: 16 }}>Invoice General</Title>
              <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <Field label="Company Logo URL" hint="This logo appears on all invoices and PDFs.">
                  <Input {...regInv('logo')} placeholder="https://example.com/logo.png" />
                  {logoPreview && (
                    <Space style={{ marginTop: 12 }} align="center">
                      <Card size="small" styles={{ body: { padding: 8 } }}><img src={logoPreview} alt="Logo preview" style={{ maxHeight: 64, maxWidth: 180, objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} /></Card>
                      <Text style={{ fontSize: 12, color: '#16a34a' }}>Logo preview looks good!</Text>
                    </Space>
                  )}
                </Field>
                <Row gutter={12}>
                  <Col span={12}><Field label="Invoice Prefix" hint="e.g. INV → INV-2025-001"><Input {...regInv('invoicePrefix')} placeholder="INV" /></Field></Col>
                </Row>
                <Field label="Invoice Terms & Conditions"><Input.TextArea {...regInv('invoiceTerms')} rows={3} placeholder="Payment due within 30 days..." /></Field>
              </Space>
            </Card>

            <Card>
              <Title level={5} style={{ marginBottom: 4 }}>Bank Details</Title>
              <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>These will appear on all invoices for customer payment.</Text>
              <Row gutter={[12, 16]}>
                <Col span={12}><Field label="Bank Name"><Input {...regInv('bankName')} placeholder="State Bank of India" /></Field></Col>
                <Col span={12}><Field label="Account Holder Name"><Input {...regInv('accountName')} placeholder="ABC Pvt Ltd" /></Field></Col>
                <Col span={12}><Field label="Account Number"><Input {...regInv('accountNumber')} placeholder="1234567890" /></Field></Col>
                <Col span={12}><Field label="IFSC Code"><Input {...regInv('ifscCode')} placeholder="SBIN0001234" /></Field></Col>
                <Col span={12}><Field label="Branch"><Input {...regInv('branch')} placeholder="Koramangala, Bengaluru" /></Field></Col>
                <Col span={12}><Field label="UPI ID"><Input {...regInv('upiId')} placeholder="company@upi" /></Field></Col>
              </Row>
              <div style={{ marginTop: 16 }}>
                <Field label="UPI QR Code Image URL" hint="Upload your GPay / PhonePe / bank QR image and paste the URL here. This QR will appear on all invoices.">
                  <Input {...regInv('upiQrUrl')} placeholder="https://example.com/upi-qr.png" />
                </Field>
              </div>
              {qrPreview && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>QR Preview:</Text>
                  <Card size="small" styles={{ body: { padding: 8 } }} style={{ display: 'inline-block' }}><img src={qrPreview} alt="UPI QR preview" style={{ width: 112, height: 112, objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} /></Card>
                </div>
              )}
            </Card>

            <Card>
              <Title level={5} style={{ marginBottom: 4 }}>Authorized Signatory</Title>
              <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>Paste a publicly accessible URL to your signature image. It will appear at the bottom of every invoice.</Text>
              <Field label="Signature Image URL"><Input {...regInv('signatureUrl')} placeholder="https://example.com/signature.png" /></Field>
              {sigPreview && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Preview:</Text>
                  <Card size="small" style={{ display: 'inline-block' }}><img src={sigPreview} alt="Signature preview" style={{ maxHeight: 96, maxWidth: 320, objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} /></Card>
                </div>
              )}
              <Card size="small" style={{ marginTop: 16, background: '#eff6ff', borderColor: '#bfdbfe' }}>
                <Text strong style={{ fontSize: 13, color: '#1d4ed8' }}>How to get a signature image URL</Text>
                <ul style={{ fontSize: 12, color: '#2563eb', marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
                  <li>Upload your signature image to Google Drive → Share → "Anyone with link" → copy direct link</li>
                  <li>Or upload to Cloudinary / ImgBB and copy the image URL</li>
                  <li>Or use your company logo URL if you want the logo as the signatory mark</li>
                </ul>
              </Card>
            </Card>

            <Button type="primary" htmlType="submit" block loading={invoiceMutation.isPending}>Save Invoice Settings</Button>
          </Space>
        </form>
      ),
    });

    items.push({
      key: 'integrations', label: 'Integrations',
      children: (
        <Card>
          <Title level={5} style={{ marginBottom: 4 }}>Social Media Automation</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Lets an external system push posts here for Marketing approval, and get notified once reviewed.</Text>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: '1px solid #f0f0f0', marginTop: 16 }}>
            <div>
              <Text strong>{integrationStatus?.configured ? 'API key configured' : 'Not configured yet'}</Text>
              {integrationStatus?.configured && (
                <div><Text type="secondary" style={{ fontSize: 11 }}>Ends in •••{integrationStatus.apiKeyPreview}{integrationStatus.generatedAt && ` — generated ${new Date(integrationStatus.generatedAt).toLocaleDateString()}`}</Text></div>
              )}
            </div>
            <Button
              type="primary" loading={generateKeyMutation.isPending}
              onClick={() => {
                if (integrationStatus?.configured && !window.confirm('Generating a new key invalidates the old one — the automation system will need updating. Continue?')) return;
                generateKeyMutation.mutate();
              }}
            >
              {integrationStatus?.configured ? 'Regenerate Key' : 'Generate API Key'}
            </Button>
          </div>

          {revealedKey && (
            <Card size="small" style={{ background: '#fffbe6', borderColor: '#ffe58f', marginBottom: 16 }}>
              <Text strong style={{ fontSize: 13, color: '#874d00', display: 'block', marginBottom: 12 }}>Save these now — they will not be shown again.</Text>
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>API Key (X-Backero-Api-Key)</Text>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input readOnly value={revealedKey.apiKey} style={{ fontFamily: 'monospace', fontSize: 12 }} onFocus={(e) => e.target.select()} />
                    <Button icon={<Copy size={13} />} onClick={() => { navigator.clipboard.writeText(revealedKey.apiKey); toast.success('Copied'); }}>Copy</Button>
                  </Space.Compact>
                </div>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Webhook Secret (BACKERO_WEBHOOK_SECRET)</Text>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input readOnly value={revealedKey.webhookSecret} style={{ fontFamily: 'monospace', fontSize: 12 }} onFocus={(e) => e.target.select()} />
                    <Button icon={<Copy size={13} />} onClick={() => { navigator.clipboard.writeText(revealedKey.webhookSecret); toast.success('Copied'); }}>Copy</Button>
                  </Space.Compact>
                </div>
                <Button block onClick={() => setRevealedKey(null)}>I've saved these</Button>
              </Space>
            </Card>
          )}

          <div style={{ paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
            <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Default Callback URL</Text>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>Used when the automation system doesn't send its own callbackUrl per request.</Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input value={callbackUrlInput} onChange={(e) => setCallbackUrlInput(e.target.value)} placeholder="https://your-automation-app.example.com/webhooks/backero-approval" />
              <Button type="primary" loading={callbackUrlMutation.isPending} onClick={() => callbackUrlMutation.mutate(callbackUrlInput)}>Save</Button>
            </Space.Compact>
          </div>
        </Card>
      ),
    });
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Title level={4} style={{ marginBottom: 16 }}>Settings</Title>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={items} />
    </div>
  );
}
