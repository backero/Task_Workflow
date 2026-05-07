import { useState } from 'react'
import api from '../api/axios'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'

const Profile = () => {
  const { user, fetchMe } = useAuth()
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    designation: user?.designation || '',
    department: user?.department || '',
  })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await api.patch('/users/me', form)
      await fetchMe()
      setSuccess('Profile updated successfully')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const ROLE_COLOR = {
    ORG_ADMIN: 'bg-purple-100 text-purple-700',
    ADMIN:     'bg-indigo-100 text-indigo-700',
    HR:        'bg-pink-100 text-pink-700',
    MANAGER:   'bg-amber-100 text-amber-700',
    EMPLOYEE:  'bg-green-100 text-green-700',
  }

  return (
    <Layout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>

        {/* Avatar + overview card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 flex items-center gap-5">
          <div className="w-20 h-20 bg-brand-600 text-white rounded-2xl flex items-center justify-center text-3xl font-bold flex-shrink-0">
            {(user?.name?.[0] || user?.phone?.[3] || 'U').toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{user?.name || 'New User'}</h2>
            <p className="text-gray-500 text-sm">{user?.phone}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLOR[user?.role] || 'bg-gray-100 text-gray-600'}`}>
                {user?.role}
              </span>
              {user?.designation && <span className="text-xs text-gray-400">{user.designation}</span>}
              {user?.department && <span className="text-xs text-gray-400">· {user.department}</span>}
            </div>
          </div>
        </div>

        {/* Edit form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-5">Edit Profile</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                <input
                  className="input-field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <input
                  type="email"
                  className="input-field"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Designation / Title</label>
                <input
                  className="input-field"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  placeholder="e.g. Senior Developer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
                <input
                  className="input-field"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="e.g. Engineering"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}
            {success && <p className="text-green-600 text-sm">✓ {success}</p>}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Read-only info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-6">
          <h3 className="font-semibold text-gray-800 mb-4">Account Info</h3>
          <div className="space-y-3 text-sm">
            {[
              { label: 'Phone',      value: user?.phone },
              { label: 'Role',       value: user?.role },
              { label: 'User ID',    value: user?._id || user?.id },
              { label: 'Last Login', value: user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-IN') : 'N/A' },
              { label: 'Member Since', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-4">
                <span className="text-gray-400 flex-shrink-0">{label}</span>
                <span className="font-medium text-gray-700 text-right truncate max-w-xs text-xs sm:text-sm" title={value}>{value}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
            Phone number cannot be changed. Contact your organization admin for role changes.
          </p>
        </div>
      </div>
    </Layout>
  )
}

export default Profile
