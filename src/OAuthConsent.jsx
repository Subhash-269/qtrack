import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// /oauth/consent?authorization_id=… — Supabase Auth sends the user here when an MCP client
// (Claude, Cursor, …) asks to connect. The user is already signed in (main.jsx handles that).

const page = { minHeight: '100vh', background: '#111110', color: '#F1EFE8', fontFamily: "'DM Sans', -apple-system, sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }
const card = { width: 420, maxWidth: '100%', background: '#1A1A18', border: '1px solid #2C2C2A', borderRadius: 12, padding: '24px 24px 20px', boxSizing: 'border-box' }
const btn = (primary) => ({ flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: primary ? '#D3D1C7' : 'transparent', color: primary ? '#1A1A18' : '#B4B2A9', border: primary ? 'none' : '1px solid #444441' })

export default function OAuthConsent({ session }) {
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id')
  const [details, setDetails] = useState(null)
  const [error, setError] = useState(authorizationId ? null : 'This link is missing its authorization request.')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!authorizationId) return
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (error) return setError(error.message)
      // Already approved before: Supabase hands back the redirect straight away
      if (data && !data.authorization_id && data.redirect_url) return window.location.assign(data.redirect_url)
      setDetails(data)
    })
  }, [authorizationId])

  const decide = async (approve) => {
    setBusy(true)
    const { error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId)
    // On success supabase-js redirects back to the client itself
    if (error) { setError(error.message); setBusy(false) }
  }

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <span style={{ background: '#D3D1C7', color: '#111110', width: 24, height: 24, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>Q</span>
          <span style={{ fontSize: 15, fontWeight: 500 }}>QTrack</span>
        </div>
        {error ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Can't connect</div>
            <div style={{ fontSize: 13, color: '#F09595', marginBottom: 16 }}>{error}</div>
            <button onClick={() => window.location.assign('/')} style={btn(false)}>Back to QTrack</button>
          </>
        ) : !details ? (
          <div style={{ fontSize: 13, color: '#888780' }}>Loading…</div>
        ) : (
          <>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Connect {details.client?.name || 'this app'} to QTrack?</div>
            <div style={{ fontSize: 13, color: '#B4B2A9', lineHeight: 1.5, marginBottom: 16 }}>
              It will be able to read your projects, tasks, test cases, queue, meetings, notes and focus history, acting as <b style={{ color: '#F1EFE8' }}>{session.user.email}</b>.
              Every call it makes is logged, and you can revoke access at any time.
            </div>
            <div style={{ background: '#111110', border: '1px solid #2C2C2A', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#888780', marginBottom: 18, wordBreak: 'break-all' }}>
              <div>App: <span style={{ color: '#D3D1C7' }}>{details.client?.name || details.client?.id || 'Unknown'}</span></div>
              {details.redirect_uri && <div style={{ marginTop: 4 }}>Returns to: <span style={{ color: '#D3D1C7' }}>{details.redirect_uri}</span></div>}
              {details.scope?.trim() && <div style={{ marginTop: 4 }}>Requested: <span style={{ color: '#D3D1C7' }}>{details.scope}</span></div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button disabled={busy} onClick={() => decide(false)} style={btn(false)}>Deny</button>
              <button disabled={busy} onClick={() => decide(true)} style={btn(true)}>{busy ? 'Connecting…' : 'Allow access'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
