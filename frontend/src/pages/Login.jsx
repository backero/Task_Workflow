import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

const Login = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (user) return <Navigate to="/dashboard" replace />

  const formatPhone = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 10)
    return digits
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (phone.length !== 10) {
      setError('Enter a valid 10-digit phone number')
      return
    }
    const fullPhone = `+91${phone}`
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { phone: fullPhone })
      navigate('/verify', { state: { phone: fullPhone, devOtp: data.data?.devOtp || null } })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">B</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Backero</h1>
          <p className="text-gray-500 mt-1 text-sm">Workflow Management Platform</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-gray-800 mb-1">Sign in</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your phone number to receive an OTP</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Phone Number
              </label>
              <div className="flex rounded-xl overflow-hidden border border-gray-300 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent transition-all">
                <div className="bg-gray-50 border-r border-gray-300 px-3 flex items-center">
                  <span className="text-gray-600 text-sm font-medium whitespace-nowrap">🇮🇳 +91</span>
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="98765 43210"
                  className="flex-1 px-3 py-3 outline-none text-gray-900 bg-white text-base tracking-wide"
                  required
                  autoFocus
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
              disabled={loading || phone.length !== 10}
              className="btn-primary"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending OTP…
                </span>
              ) : 'Send OTP'}
            </button>
          </form>

          <div className="mt-6 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700">
            <strong>Dev mode:</strong> OTP is auto-filled — you will be signed in automatically after clicking Send OTP.
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2025 Backero Private Limited
        </p>
      </div>
    </div>
  )
}

export default Login
