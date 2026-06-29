import { useState } from 'react'
import { authApi } from '../services/api'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await authApi.login(username, password)
      console.log('Full login response data:', response.data)

      // Handle both 'token' and 'access_token' field names from backend
      const token = response.data.token || response.data.access_token
      const user = response.data.username || response.data.user || username
      const role = response.data.role || 'admin'

      if (!token) {
        console.error('No token in response. Response was:', response.data)
        setError('Login failed: No token received from server.')
        return
      }

      // Store token
      localStorage.setItem('admin_token', token)
      console.log('✅ Token stored:', token.substring(0, 20) + '...')

      // Store session info
      sessionStorage.setItem('tneb_role', role)
      sessionStorage.setItem('tneb_user', user)

      onLogin(role, user)
    } catch (err) {
      console.error('Login error:', err.response?.data || err.message)
      setError(err.response?.data?.detail || 'Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#f0f4f8',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        width: 380, background: 'white',
        borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        border: '1px solid #e2e8f0',
      }}>
        <div style={{
          background: '#003087',
          padding: '28px 32px 24px',
          textAlign: 'center',
        }}>
          <div style={{
            width: 52, height: 52, background: 'white',
            borderRadius: 12, margin: '0 auto 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="26" height="26" viewBox="0 0 18 18" fill="none">
              <polygon points="9,1 2,5 2,13 9,17 16,13 16,5"
                stroke="#003087" strokeWidth="1.5" fill="none" />
              <line x1="9" y1="1" x2="9" y2="17" stroke="#003087" strokeWidth="1.2" />
              <line x1="2" y1="5" x2="16" y2="13" stroke="#003087" strokeWidth="0.8" />
              <line x1="16" y1="5" x2="2" y2="13" stroke="#003087" strokeWidth="0.8" />
            </svg>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'white' }}>
            TNEB PolicyAI
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
            Admin Portal — Authorized Access Only
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ padding: '28px 32px 32px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: '#64748b', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Admin Username
            </label>
            <input
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              placeholder="admin"
              autoFocus
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #e2e8f0', borderRadius: 8,
                fontSize: 13, color: '#1e293b', outline: 'none',
                fontFamily: 'inherit', background: '#f8fafc',
                transition: 'border-color 0.15s', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = '#003087'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: '#64748b', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="Enter password"
                style={{
                  width: '100%', padding: '10px 38px 10px 12px',
                  border: '1px solid #e2e8f0', borderRadius: 8,
                  fontSize: 13, color: '#1e293b', outline: 'none',
                  fontFamily: 'inherit', background: '#f8fafc',
                  transition: 'border-color 0.15s', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#003087'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  color: '#94a3b8', cursor: 'pointer', fontSize: 14,
                  display: 'flex', padding: 2,
                }}
              >
                <i className={`ti ${showPw ? 'ti-eye-off' : 'ti-eye'}`} />
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: '8px 12px',
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: 7, fontSize: 12, color: '#dc2626',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <i className="ti ti-alert-circle" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            style={{
              width: '100%', padding: '11px',
              background: loading || !username || !password ? '#e2e8f0' : '#003087',
              border: 'none', borderRadius: 8,
              color: loading || !username || !password ? '#94a3b8' : 'white',
              fontSize: 13, fontWeight: 700,
              cursor: loading || !username || !password ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 7,
              transition: 'background 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {loading
              ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Signing in...</>
              : <><i className="ti ti-login" /> Admin Sign In</>
            }
          </button>
        </form>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg) }
          to   { transform: rotate(360deg) }
        }
      `}</style>
    </div>
  )
}