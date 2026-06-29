import { useState } from 'react'
import { authApi } from '../services/api'

export default function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  async function handleLogin() {
    if (!username || !password) { setError('Please enter username and password'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await authApi.login(username, password)
      localStorage.setItem('admin_token', data.token)
      localStorage.setItem('admin_username', data.username)
      onLogin(data.username)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--navy)', position: 'relative', overflow: 'hidden',
    }}>
      {/* Grid background */}
      <svg style={{ position: 'absolute', inset: 0, opacity: 0.04, pointerEvents: 'none', width: '100%', height: '100%' }}>
        <defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#00C8FF" strokeWidth="0.5" />
        </pattern></defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <div style={{
        width: 380, background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '36px 32px', position: 'relative', zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, background: 'var(--cyan)', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', fontSize: 20, fontWeight: 800, color: 'var(--navy)',
          }}>AI</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>TNEB PolicyAI</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Admin Portal</div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 24 }} />

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Username
            </label>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 12px',
              transition: 'border-color 0.15s',
            }}
              onFocus={() => {}} >
              <i className="ti ti-user" style={{ color: 'var(--muted)', fontSize: 14, marginRight: 8 }} />
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Enter username"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 13, color: 'var(--text)', padding: '10px 0',
                  fontFamily: 'var(--font-body)',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 12px',
            }}>
              <i className="ti ti-lock" style={{ color: 'var(--muted)', fontSize: 14, marginRight: 8 }} />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Enter password"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 13, color: 'var(--text)', padding: '10px 0',
                  fontFamily: 'var(--font-body)',
                }}
              />
              <button onClick={() => setShowPass(p => !p)} style={{
                background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: 2,
              }}>
                <i className={`ti ${showPass ? 'ti-eye-off' : 'ti-eye'}`} />
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              padding: '8px 12px', background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7,
              fontSize: 12, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <i className="ti ti-alert-circle" />
              {error}
            </div>
          )}

          <button onClick={handleLogin} disabled={loading} style={{
            padding: '11px', background: loading ? 'var(--surface3)' : 'var(--cyan)',
            border: 'none', borderRadius: 8, color: loading ? 'var(--muted)' : 'var(--navy)',
            fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginTop: 4, transition: 'all 0.15s',
          }}>
            {loading
              ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Signing in...</>
              : <><i className="ti ti-login" /> Sign in as Admin</>}
          </button>
        </div>

        <div style={{ marginTop: 20, padding: '10px 12px', background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
            <i className="ti ti-info-circle" style={{ marginRight: 4 }} />
            This portal is for authorized TNEB administrators only. Employee access does not require login.
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}