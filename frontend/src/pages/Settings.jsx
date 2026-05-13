import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'

const TIMEZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Singapore', 'Asia/Dubai']
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']

const Settings = () => {
  const { user, logout } = useAuth()
  const { org, fetchOrg } = useOrg()
  const navigate = useNavigate()
  const isAdmin = ['ADMIN', 'ORG_ADMIN'].includes(user?.role)

  const [tab, setTab] = useState('general')

  /* ── General form ─────────────────────────────────────── */
  const [orgForm, setOrgForm] = useState({
    name: org?.name || '',
    settings: {
      timezone: org?.settings?.timezone || 'Asia/Kolkata',
      currency: org?.settings?.currency || 'INR',
    },
  })
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgMsg, setOrgMsg]   = useState('')
  const [orgErr, setOrgErr]   = useState('')

  const saveOrg = async (e) => {
    e.preventDefault()
    setOrgMsg(''); setOrgErr('')
    setOrgSaving(true)
    try {
      await api.patch('/org', orgForm)
      await fetchOrg()
      setOrgMsg('General settings saved')
    } catch (err) {
      setOrgErr(err.response?.data?.message || 'Failed to update')
    } finally { setOrgSaving(false) }
  }

  /* ── Company Info form ────────────────────────────────── */
  const [infoForm, setInfoForm] = useState({
    phone: org?.phone || '',
    email: org?.email || '',
    gstin: org?.gstin || '',
    address: {
      line1:   org?.address?.line1   || '',
      city:    org?.address?.city    || '',
      state:   org?.address?.state   || '',
      pincode: org?.address?.pincode || '',
    },
    bankDetails: {
      bankName:      org?.bankDetails?.bankName      || '',
      accountNumber: org?.bankDetails?.accountNumber || '',
      ifsc:          org?.bankDetails?.ifsc          || '',
      upiId:         org?.bankDetails?.upiId         || '',
    },
  })
  const [infoSaving, setInfoSaving] = useState(false)
  const [infoMsg, setInfoMsg] = useState('')
  const [infoErr, setInfoErr] = useState('')

  const setAddr = (k, v) => setInfoForm(f => ({ ...f, address: { ...f.address, [k]: v } }))
  const setBank = (k, v) => setInfoForm(f => ({ ...f, bankDetails: { ...f.bankDetails, [k]: v } }))

  const saveInfo = async (e) => {
    e.preventDefault()
    setInfoMsg(''); setInfoErr('')
    setInfoSaving(true)
    try {
      await api.patch('/org', infoForm)
      await fetchOrg()
      setInfoMsg('Company info saved — invoices will reflect these details')
    } catch (err) {
      setInfoErr(err.response?.data?.message || 'Failed to update')
    } finally { setInfoSaving(false) }
  }

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  const TABS = [
    { key: 'general', label: 'General' },
    { key: 'company', label: 'Company Info' },
    { key: 'account', label: 'Account' },
  ]

  return (
    <Layout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-5">Settings</h1>

        {/* Tab switcher */}
        {isAdmin && (
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── General Tab ─── */}
        {tab === 'general' && isAdmin && org && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-gray-800 mb-1">Organization Settings</h2>
            <p className="text-sm text-gray-400 mb-5">Visible to all admins</p>

            <form onSubmit={saveOrg} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Name</label>
                <input className="input-field" value={orgForm.name}
                  onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
                  <select className="input-field" value={orgForm.settings.timezone}
                    onChange={(e) => setOrgForm({ ...orgForm, settings: { ...orgForm.settings, timezone: e.target.value } })}>
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
                  <select className="input-field" value={orgForm.settings.currency}
                    onChange={(e) => setOrgForm({ ...orgForm, settings: { ...orgForm.settings, currency: e.target.value } })}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-500">
                <div className="flex justify-between">
                  <span>Org Slug</span>
                  <span className="font-mono font-medium text-gray-700">{org.slug}</span>
                </div>
                <div className="flex justify-between">
                  <span>Plan</span>
                  <span className="font-medium capitalize text-indigo-600">{org.plan}</span>
                </div>
                <div className="flex justify-between">
                  <span>Org ID</span>
                  <span className="font-mono text-xs text-gray-400">{org._id}</span>
                </div>
              </div>

              {orgErr && <p className="text-red-500 text-sm">{orgErr}</p>}
              {orgMsg && <p className="text-green-600 text-sm">✓ {orgMsg}</p>}

              <div className="flex justify-end pt-1">
                <button type="submit" disabled={orgSaving}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {orgSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Company Info Tab ─── */}
        {tab === 'company' && isAdmin && (
          <form onSubmit={saveInfo} className="space-y-5">
            {/* Contact details */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 mb-1">Contact Details</h2>
              <p className="text-sm text-gray-400 mb-4">Printed on invoices and PDF exports</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                  <input className="input-field" placeholder="+91 98765 43210" value={infoForm.phone}
                    onChange={e => setInfoForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input type="email" className="input-field" placeholder="billing@company.com" value={infoForm.email}
                    onChange={e => setInfoForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">GSTIN</label>
                  <input className="input-field uppercase" placeholder="27AABCU9603R1ZX" value={infoForm.gstin}
                    onChange={e => setInfoForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 mb-4">Business Address</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Address Line 1</label>
                  <input className="input-field" placeholder="Building, Street, Area" value={infoForm.address.line1}
                    onChange={e => setAddr('line1', e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                    <input className="input-field" placeholder="Mumbai" value={infoForm.address.city}
                      onChange={e => setAddr('city', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
                    <input className="input-field" placeholder="Maharashtra" value={infoForm.address.state}
                      onChange={e => setAddr('state', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Pincode</label>
                    <input className="input-field" placeholder="400001" value={infoForm.address.pincode}
                      onChange={e => setAddr('pincode', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Bank details */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 mb-1">Bank Details</h2>
              <p className="text-sm text-gray-400 mb-4">Shown as "Pay To" section on invoices</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank Name</label>
                  <input className="input-field" placeholder="HDFC Bank" value={infoForm.bankDetails.bankName}
                    onChange={e => setBank('bankName', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Number</label>
                  <input className="input-field font-mono" placeholder="50100XXXXXXXXXX" value={infoForm.bankDetails.accountNumber}
                    onChange={e => setBank('accountNumber', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">IFSC Code</label>
                  <input className="input-field uppercase font-mono" placeholder="HDFC0001234" value={infoForm.bankDetails.ifsc}
                    onChange={e => setBank('ifsc', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">UPI ID</label>
                  <input className="input-field" placeholder="company@hdfcbank" value={infoForm.bankDetails.upiId}
                    onChange={e => setBank('upiId', e.target.value)} />
                </div>
              </div>
            </div>

            {infoErr && <p className="text-red-500 text-sm px-1">{infoErr}</p>}
            {infoMsg && <p className="text-green-600 text-sm px-1">✓ {infoMsg}</p>}

            <div className="flex justify-end">
              <button type="submit" disabled={infoSaving}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {infoSaving ? 'Saving…' : 'Save Company Info'}
              </button>
            </div>
          </form>
        )}

        {/* ── Account Tab ─── */}
        {tab === 'account' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
              <h2 className="font-semibold text-gray-800 mb-5">Account</h2>
              <div className="space-y-3">
                <button onClick={() => navigate('/profile')}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Edit Profile</p>
                      <p className="text-xs text-gray-400">Update name, email, designation</p>
                    </div>
                  </div>
                  <span className="text-gray-300 text-sm">→</span>
                </button>

                <button onClick={() => navigate('/members')}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Manage Team</p>
                      <p className="text-xs text-gray-400">Invite, update roles, remove members</p>
                    </div>
                  </div>
                  <span className="text-gray-300 text-sm">→</span>
                </button>

                <button onClick={() => navigate('/reports')}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Reports & Analytics</p>
                      <p className="text-xs text-gray-400">Export data, view insights</p>
                    </div>
                  </div>
                  <span className="text-gray-300 text-sm">→</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
              <h2 className="font-semibold text-red-600 mb-4">Danger Zone</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Sign Out</p>
                  <p className="text-xs text-gray-400">You will be redirected to the login page</p>
                </div>
                <button onClick={handleLogout}
                  className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}

        {/* Non-admin fallback */}
        {!isAdmin && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-sm text-gray-400 text-center py-4">Only admins can access organization settings.</p>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default Settings
