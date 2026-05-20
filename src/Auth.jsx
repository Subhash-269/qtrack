import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      if (error) setError(error.message)
      else setMessage('Check your email for a confirmation link!')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  const handleGitHub = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } })
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
  }

  const S = {
    page: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#111110', fontFamily: "'DM Sans', sans-serif"
    },
    card: {
      background: '#1A1A18', border: '1px solid #2C2C2A', borderRadius: 12,
      padding: '32px', width: 360
    },
    logo: {
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 24, justifyContent: 'center'
    },
    logoIcon: {
      background: '#D3D1C7', color: '#111110', width: 28, height: 28,
      borderRadius: 6, display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 14, fontWeight: 700
    },
    logoText: { fontSize: 18, fontWeight: 500, color: '#F1EFE8' },
    input: {
      width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 14,
      background: '#111110', color: '#F1EFE8', border: '1px solid #2C2C2A',
      outline: 'none', boxSizing: 'border-box', marginBottom: 10
    },
    btn: {
      width: '100%', padding: '10px', borderRadius: 6, fontSize: 14,
      fontWeight: 500, border: 'none', cursor: 'pointer',
      background: '#D3D1C7', color: '#111110', marginBottom: 8
    },
    oauthBtn: {
      width: '100%', padding: '10px', borderRadius: 6, fontSize: 13,
      border: '1px solid #2C2C2A', cursor: 'pointer',
      background: 'transparent', color: '#B4B2A9', marginBottom: 6,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
    },
    divider: {
      display: 'flex', alignItems: 'center', gap: 12,
      margin: '16px 0', color: '#5F5E5A', fontSize: 12
    },
    line: { flex: 1, height: 0.5, background: '#2C2C2A' },
    toggle: {
      background: 'none', border: 'none', color: '#85B7EB',
      cursor: 'pointer', fontSize: 13, padding: 0
    },
    error: {
      background: '#2D0A0A', color: '#F09595', padding: '8px 12px',
      borderRadius: 6, fontSize: 12, marginBottom: 10
    },
    message: {
      background: '#081F12', color: '#5DCAA5', padding: '8px 12px',
      borderRadius: 6, fontSize: 12, marginBottom: 10
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <span style={S.logoIcon}>Q</span>
          <span style={S.logoText}>QTrack</span>
        </div>

        <p style={{ textAlign: 'center', color: '#888780', fontSize: 13, margin: '0 0 20px' }}>
          {isSignUp ? 'Create your account' : 'Sign in to your account'}
        </p>

        {error && <div style={S.error}>{error}</div>}
        {message && <div style={S.message}>{message}</div>}

        <form onSubmit={handleSubmit}>
          <input
            style={S.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            style={S.input}
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button
            style={{ ...S.btn, opacity: loading ? 0.6 : 1 }}
            type="submit"
            disabled={loading}
          >
            {loading ? '...' : isSignUp ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <div style={S.divider}>
          <span style={S.line} />
          <span>or</span>
          <span style={S.line} />
        </div>

        <button style={S.oauthBtn} onClick={handleGitHub}>
          Continue with GitHub
        </button>
        <button style={S.oauthBtn} onClick={handleGoogle}>
          Continue with Google
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#888780', marginTop: 16 }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            style={S.toggle}
            onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null) }}
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}