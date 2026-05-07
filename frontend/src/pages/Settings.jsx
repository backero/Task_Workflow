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

  const [orgForm, setOrgForm] = useState({
    name: org?.name || '',
    settings: {
      timezone: org?.settings?.timezone || 'Asia/Kolkata',
      currency: org?.settings?.currency || 'INR',
    },
  })
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgMsg, setOrgMsg]     = useState('')
  const [orgErr, setOrgErr]     = useState('')

  const saveOrg = async (e) => {
    e.preventDefault()
    setOrgMsg(''); setOrgErr('')
    setOrgSaving(true)
    try {
      await api.patch('/org', orgForm)
      await fetchOrg()
      setOrgMsg('Organization settings updated')
    } catch (err) {
      setOrgErr(err.response?.data?.message || 'Failed to update')
    } finally {
      setOrgSaving(false)
    }
  }

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  return (
    <Layout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

        {/* Org settings — admin only */}
        {isAdmin && org && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-gray-800 mb-1">Organization Settings</h2>
            <p className="text-sm text-gray-400 mb-5">Visible to all admins in your organization</p>

            <form onSubmit={saveOrg} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Name</label>
                <input
                  className="input-field"
                  value={orgForm.name}
                  onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
                  <select
                    className="input-field"
                    value={orgForm.settings.timezone}
                    onChange={(e) => setOrgForm({ ...orgForm, settings: { ...orgForm.settings, timezone: e.target.value } })}
                  >
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
                  <select
                    className="input-field"
                    value={orgForm.settings.currency}
                    onChange={(e) => setOrgForm({ ...orgForm, settings: { ...orgForm.settings, currency: e.target.value } })}
                  >
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
                  <span className="font-medium text-brand-600 capitalize">{org.plan}</span>
                </div>
                <div className="flex justify-between">
                  <span>Org ID</span>
                  <span className="font-mono text-xs text-gray-500">{org._id}</span>
                </div>
              </div>

              {orgErr && <p className="text-red-500 text-sm">{orgErr}</p>}
              {orgMsg && <p className="text-green-600 text-sm">✓ {orgMsg}</p>}

              <div className="flex justify-end pt-1">
                <button type="submit" disabled={orgSaving} className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
                  {orgSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Account section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-5">Account</h2>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/profile')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">👤</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">Edit Profile</p>
                  <p className="text-xs text-gray-400">Update name, email, designation</p>
                </div>
              </div>
              <span className="text-gray-300">→</span>
            </button>

            <button
              onClick={() => navigate('/members')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">👥</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">Manage Team</p>
                  <p className="text-xs text-gray-400">Invite, update roles, remove members</p>
                </div>
              </div>
              <span className="text-gray-300">→</span>
            </button>

            <button
              onClick={() => navigate('/analytics')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">📊</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">Analytics & Reports</p>
                  <p className="text-xs text-gray-400">Task completion, team workload</p>
                </div>
              </div>
              <span className="text-gray-300">→</span>
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
          <h2 className="font-semibold text-red-600 mb-4">Danger Zone</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Sign Out</p>
              <p className="text-xs text-gray-400">You will be redirected to the login page</p>
            </div>
            <button
              onClick={handleLogout}
              className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Settings
