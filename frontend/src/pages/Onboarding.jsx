import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'

const slugify = (str) =>
  str.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50)

const Onboarding = () => {
  const { user, fetchMe } = useAuth()
  const { fetchOrg } = useOrg()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: '',
    slug: '',
    adminName: user?.name || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleNameChange = (val) => {
    setForm({ ...form, name: val, slug: slugify(val) })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/org', {
        name: form.name,
        slug: form.slug,
        adminName: form.adminName,
        adminPhone: user?.phone,
      })
      // Re-fetch user + org to get updated organizationId
      await fetchMe()
      await fetchOrg()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">B</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome!</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Let's set up your organization to get started.
          </p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Create Your Organization</h2>
          <p className="text-sm text-gray-500 mb-6">You'll be the Admin and can invite team members after setup.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Name *</label>
              <input
                className="input-field"
                placeholder="John Doe"
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Name *</label>
              <input
                className="input-field"
                placeholder="Backero Private Limited"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                URL Slug *
                <span className="ml-1 text-xs text-gray-400 font-normal">(used in org URL)</span>
              </label>
              <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent">
                <span className="bg-gray-50 border-r border-gray-300 px-3 py-3 text-gray-400 text-sm whitespace-nowrap">
                  backero.app/
                </span>
                <input
                  className="flex-1 px-3 py-3 outline-none text-gray-900 bg-white"
                  placeholder="my-company"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                  pattern="^[a-z0-9-]+$"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !form.name || !form.slug || !form.adminName}
              className="btn-primary"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating…
                </span>
              ) : 'Create Organization & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Onboarding
