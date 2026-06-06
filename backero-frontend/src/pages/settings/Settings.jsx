import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [sigPreview, setSigPreview] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [qrPreview, setQrPreview] = useState('');
  const queryClient = useQueryClient();

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

  const TABS = [
    { key: 'profile', label: 'Profile' },
    { key: 'password', label: 'Password' },
    { key: 'notifications', label: 'Notifications' },
    ...(isAdmin ? [{ key: 'invoice', label: 'Invoice Settings' }] : []),
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-[#1b2e4a]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="card p-6">
          <h3 className="section-title">Profile Information</h3>
          <form onSubmit={handleSubmit(profileMutation.mutate)} className="space-y-4">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                <span className="text-brand-700 dark:text-brand-400 text-2xl font-bold">{user?.firstName?.[0]}{user?.lastName?.[0]}</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{user?.firstName} {user?.lastName}</p>
                <p className="text-sm text-gray-500 capitalize">{user?.role?.replace('_', ' ')} • {user?.department}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">First Name</label><input {...register('firstName')} className="input" /></div>
              <div><label className="label">Last Name</label><input {...register('lastName')} className="input" /></div>
            </div>
            <div><label className="label">Phone</label><input {...register('phone')} className="input" /></div>
            <div><label className="label">Designation</label><input {...register('designation')} className="input" /></div>
            <button type="submit" disabled={profileMutation.isPending} className="btn-primary">
              {profileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'password' && (
        <div className="card p-6">
          <h3 className="section-title">Change Password</h3>
          <form onSubmit={submitPass(passwordMutation.mutate)} className="space-y-4">
            <div><label className="label">Current Password</label><input {...regPass('currentPassword', { required: true })} type="password" className="input" /></div>
            <div><label className="label">New Password</label><input {...regPass('newPassword', { required: true, minLength: { value: 8, message: 'Min 8 chars' } })} type="password" className="input" /></div>
            <button type="submit" disabled={passwordMutation.isPending} className="btn-primary">
              {passwordMutation.isPending ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="card p-6">
          <h3 className="section-title">Notification Preferences</h3>
          <div className="space-y-4">
            {[
              { key: 'inApp', label: 'In-App Notifications', desc: 'Show notifications inside the platform' },
              { key: 'whatsapp', label: 'WhatsApp Notifications', desc: 'Receive alerts on WhatsApp' },
              { key: 'email', label: 'Email Notifications', desc: 'Receive email updates (coming soon)' },
            ].map((pref) => (
              <div key={pref.key} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-[#1b2e4a]">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{pref.label}</p>
                  <p className="text-sm text-gray-500">{pref.desc}</p>
                </div>
                <button className="relative w-11 h-6 rounded-full bg-brand-600 transition-colors" type="button">
                  <span className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full shadow" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'invoice' && (
        <form onSubmit={submitInv(invoiceMutation.mutate)} className="space-y-6">
          {/* General */}
          <div className="card p-6 space-y-4">
            <h3 className="section-title">Invoice General</h3>

            {/* Company Logo */}
            <div>
              <label className="label">Company Logo URL</label>
              <input {...regInv('logo')} className="input" placeholder="https://example.com/logo.png" />
              <p className="text-xs text-gray-400 mt-1">This logo appears on all invoices and PDFs.</p>
              {logoPreview && (
                <div className="mt-3 flex items-center gap-4">
                  <div className="border border-gray-200 dark:border-[#1b2e4a] rounded-lg p-3 bg-white inline-block">
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="max-h-16 max-w-[180px] object-contain"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400">Logo preview looks good!</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Invoice Prefix</label>
                <input {...regInv('invoicePrefix')} className="input" placeholder="INV" />
                <p className="text-xs text-gray-400 mt-1">e.g. INV → INV-2025-001</p>
              </div>
            </div>
            <div>
              <label className="label">Invoice Terms &amp; Conditions</label>
              <textarea {...regInv('invoiceTerms')} rows={3} className="input resize-none" placeholder="Payment due within 30 days..." />
            </div>
          </div>

          {/* Bank Details */}
          <div className="card p-6 space-y-4">
            <h3 className="section-title">Bank Details</h3>
            <p className="text-sm text-gray-500">These will appear on all invoices for customer payment.</p>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Bank Name</label><input {...regInv('bankName')} className="input" placeholder="State Bank of India" /></div>
              <div><label className="label">Account Holder Name</label><input {...regInv('accountName')} className="input" placeholder="ABC Pvt Ltd" /></div>
              <div><label className="label">Account Number</label><input {...regInv('accountNumber')} className="input" placeholder="1234567890" /></div>
              <div><label className="label">IFSC Code</label><input {...regInv('ifscCode')} className="input" placeholder="SBIN0001234" /></div>
              <div><label className="label">Branch</label><input {...regInv('branch')} className="input" placeholder="Koramangala, Bengaluru" /></div>
              <div><label className="label">UPI ID</label><input {...regInv('upiId')} className="input" placeholder="company@upi" /></div>
            </div>

            <div>
              <label className="label">UPI QR Code Image URL</label>
              <input {...regInv('upiQrUrl')} className="input" placeholder="https://example.com/upi-qr.png" />
              <p className="text-xs text-gray-400 mt-1">Upload your GPay / PhonePe / bank QR image and paste the URL here. This QR will appear on all invoices.</p>
            </div>
            {qrPreview && (
              <div className="mt-2">
                <p className="text-xs text-gray-400 mb-2">QR Preview:</p>
                <div className="border border-gray-200 dark:border-[#1b2e4a] rounded-lg p-3 inline-block bg-white">
                  <img
                    src={qrPreview}
                    alt="UPI QR preview"
                    className="w-28 h-28 object-contain"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Signature */}
          <div className="card p-6 space-y-4">
            <h3 className="section-title">Authorized Signatory</h3>
            <p className="text-sm text-gray-500">Paste a publicly accessible URL to your signature image. It will appear at the bottom of every invoice.</p>
            <div>
              <label className="label">Signature Image URL</label>
              <input {...regInv('signatureUrl')} className="input" placeholder="https://example.com/signature.png" />
            </div>
            {sigPreview && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 mb-2">Preview:</p>
                <div className="border border-gray-200 dark:border-[#1b2e4a] rounded-lg p-4 inline-block bg-white">
                  <img
                    src={sigPreview}
                    alt="Signature preview"
                    className="max-h-24 max-w-xs object-contain"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              </div>
            )}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">How to get a signature image URL</p>
              <ul className="text-xs text-blue-600 dark:text-blue-400 mt-1 space-y-1 list-disc list-inside">
                <li>Upload your signature image to Google Drive → Share → "Anyone with link" → copy direct link</li>
                <li>Or upload to Cloudinary / ImgBB and copy the image URL</li>
                <li>Or use your company logo URL if you want the logo as the signatory mark</li>
              </ul>
            </div>
          </div>

          <button type="submit" disabled={invoiceMutation.isPending} className="btn-primary w-full">
            {invoiceMutation.isPending ? 'Saving...' : 'Save Invoice Settings'}
          </button>
        </form>
      )}
    </div>
  );
}
