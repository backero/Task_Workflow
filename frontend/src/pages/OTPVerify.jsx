import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

const OTP_LENGTH = 6

const OTPVerify = () => {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const phone  = location.state?.phone
  const devOtp = location.state?.devOtp

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef([])

  useEffect(() => {
    if (devOtp) {
      // Auto-fill and submit in dev/console mode
      const filled = devOtp.split('').slice(0, OTP_LENGTH)
      setDigits(filled)
      setTimeout(() => submitOtp(devOtp), 300)
    } else {
      inputRefs.current[0]?.focus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [resendCooldown])

  if (user) return <Navigate to="/dashboard" replace />
  if (!phone) return <Navigate to="/login" replace />

  const handleChange = (index, value) => {
    if (!/^\d?$/.test(value)) return
    const next = [...digits]
    next[index] = value
    setDigits(next)
    setError('')
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
    // Auto-submit when all digits filled
    if (value && index === OTP_LENGTH - 1) {
      const otp = [...next].join('')
      if (otp.length === OTP_LENGTH) submitOtp(otp)
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus()
        const next = [...digits]
        next[index - 1] = ''
        setDigits(next)
      }
    }
    if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus()
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus()
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const next = Array(OTP_LENGTH).fill('')
    pasted.split('').forEach((d, i) => { next[i] = d })
    setDigits(next)
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus()
    if (pasted.length === OTP_LENGTH) submitOtp(pasted)
  }

  const submitOtp = async (otp) => {
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/verify', { phone, otp })
      const { accessToken, refreshToken, user: userData } = data.data
      login(accessToken, refreshToken, userData)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed. Try again.')
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const otp = digits.join('')
    if (otp.length < OTP_LENGTH) { setError(`Enter all ${OTP_LENGTH} digits`); return }
    submitOtp(otp)
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    try {
      await api.post('/auth/login', { phone })
      setDigits(Array(OTP_LENGTH).fill(''))
      setError('')
      setResendCooldown(30)
      inputRefs.current[0]?.focus()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend OTP')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">B</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Backero</h1>
          <p className="text-gray-500 mt-1 text-sm">Workflow Management Platform</p>
        </div>

        <div className="card">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
          >
            ← Back
          </button>

          <h2 className="text-xl font-semibold text-gray-800 mb-1">Enter OTP</h2>
          <p className="text-sm text-gray-500 mb-6">
            Sent to <span className="font-medium text-gray-700">{phone}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex gap-2.5 justify-center" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-xl transition-all outline-none
                    ${d ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-300 bg-white text-gray-900'}
                    focus:border-brand-500 focus:bg-brand-50`}
                  disabled={loading}
                />
              ))}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-xl text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || digits.join('').length < OTP_LENGTH}
              className="btn-primary"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying…
                </span>
              ) : 'Verify & Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Didn't receive?{' '}
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="text-brand-600 font-medium hover:text-brand-700 disabled:text-gray-400 transition-colors"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
            </button>
          </p>

          {devOtp ? (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700">
              <strong>Dev mode:</strong> OTP auto-filled and signing you in…
            </div>
          ) : (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <strong>Dev tip:</strong> Check your backend terminal for the OTP. It is printed as:
              <code className="block mt-1 bg-amber-100 px-2 py-1 rounded font-mono">
                [SMS:CONSOLE] OTP for {phone}: xxxxxx
              </code>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OTPVerify
