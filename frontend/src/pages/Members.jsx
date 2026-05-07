import { useState } from 'react'
import api from '../api/axios'
import Layout from '../components/Layout'
import { useOrg } from '../context/OrgContext'
import { useAuth } from '../context/AuthContext'

const ROLES = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN']

const ROLE_COLOR = {
  ORG_ADMIN: 'bg-purple-100 text-purple-700',
  ADMIN:     'bg-indigo-100 text-indigo-700',
  HR:        'bg-pink-100 text-pink-700',
  MANAGER:   'bg-amber-100 text-amber-700',
  EMPLOYEE:  'bg-green-100 text-green-700',
}

const Members = () => {
  const { user } = useAuth()
  const { members, fetchMembers } = useOrg()
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ phone: '', name: '', role: 'EMPLOYEE' })
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  const isAdmin = ['ADMIN', 'ORG_ADMIN'].includes(user?.role)

  const formatPhone = (raw) => '+91' + raw.replace(/\D/g, '').slice(0, 10)

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')
    if (inviteForm.phone.replace(/\D/g, '').length !== 10) {
      setInviteError('Enter a valid 10-digit phone number')
      return
    }
    setInviteLoading(true)
    try {
      const { data } = await api.post('/org/members/invite', {
        phone: formatPhone(inviteForm.phone),
        name: inviteForm.name,
        role: inviteForm.role,
      })
      setInviteSuccess(data.message)
      setInviteForm({ phone: '', name: '', role: 'EMPLOYEE' })
      fetchMembers()
    } catch (err) {
      setInviteError(err.response?.data?.message || 'Failed to invite member')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRoleChange = async (memberId, role) => {
    try {
      await api.patch(`/org/members/${memberId}/role`, { role })
      fetchMembers()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update role')
    }
  }

  const handleRemove = async (memberId) => {
    if (!confirm('Remove this member from the organization?')) return
    try {
      await api.delete(`/org/members/${memberId}`)
      fetchMembers()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove member')
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="text-gray-500 text-sm mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''} in your organization</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInvite((v) => !v)}
            className="bg-brand-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Invite Member
          </button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">Invite Team Member</h3>
          <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone * (10 digits)</label>
              <input
                className="input-field text-sm py-2"
                placeholder="98765 43210"
                value={inviteForm.phone}
                onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                className="input-field text-sm py-2"
                placeholder="Full name"
                value={inviteForm.name}
                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select
                className="input-field text-sm py-2"
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={inviteLoading} className="w-full bg-brand-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {inviteLoading ? 'Adding…' : 'Add Member'}
              </button>
            </div>
          </form>
          {inviteError && <p className="text-red-500 text-sm mt-2">{inviteError}</p>}
          {inviteSuccess && <p className="text-green-600 text-sm mt-2">✓ {inviteSuccess}</p>}
        </div>
      )}

      {/* Members table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {members.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No members found</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {members.map((m) => (
              <div key={m._id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {(m.name?.[0] || m.phone?.[3] || '?').toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{m.name || 'No name set'}</p>
                  <p className="text-sm text-gray-400">{m.phone}</p>
                  {(m.designation || m.department) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[m.designation, m.department].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                {/* Role */}
                <div className="flex-shrink-0">
                  {isAdmin && m._id !== user?._id && m._id !== user?.id ? (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m._id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLOR[m.role] || 'bg-gray-100 text-gray-600'}`}>
                      {m.role}
                    </span>
                  )}
                </div>

                {/* Last seen */}
                <div className="text-xs text-gray-400 flex-shrink-0 hidden sm:block w-24 text-right">
                  {m.lastLoginAt
                    ? new Date(m.lastLoginAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                    : 'Never'}
                </div>

                {/* Remove */}
                {isAdmin && m._id !== user?._id && m._id !== user?.id && (
                  <button
                    onClick={() => handleRemove(m._id)}
                    className="text-xs text-red-400 hover:text-red-600 flex-shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}

export default Members
