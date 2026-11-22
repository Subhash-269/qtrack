import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// /oauth/consent?authorization_id=… — Supabase Auth sends the user here when an MCP client
// (Claude, Cursor, …) asks to connect. The user is already signed in (main.jsx handles that).

const page = { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'DM Sans', -apple-system, sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }
const card = { width: 420, maxWidth: '100%', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '24px 24px 20px', boxSizing: 'border-box' }
const btn = (primary) => ({ flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: primary ? 'var(--title)' : 'transparent', color: primary ? 'var(--surface)' : 'var(--soft)', border: primary ? 'none' : '1px solid var(--dim)' })

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
          <span style={{ background: 'var(--title)', color: 'var(--bg)', width: 24, height: 24, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>Q</span>
          <span style={{ fontSize: 15, fontWeight: 500 }}>QTrack</span>
        </div>
        {error ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Can't connect</div>
            <div style={{ fontSize: 13, color: 'var(--pink)', marginBottom: 16 }}>{error}</div>
            <button onClick={() => window.location.assign('/')} style={btn(false)}>Back to QTrack</button>
          </>
        ) : !details ? (
          <div style={{ fontSize: 13, color: 'var(--sub)' }}>Loading…</div>
        ) : (
          <>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Connect {details.client?.name || 'this app'} to QTrack?</div>
            <div style={{ fontSize: 13, color: 'var(--soft)', lineHeight: 1.5, marginBottom: 16 }}>
              It will be able to read your projects, tasks, test cases, queue, meetings, notes and focus history, acting as <b style={{ color: 'var(--text)' }}>{session.user.email}</b>.
              Every call it makes is logged, and you can revoke access at any time.
            </div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--sub)', marginBottom: 18, wordBreak: 'break-all' }}>
              <div>App: <span style={{ color: 'var(--title)' }}>{details.client?.name || details.client?.id || 'Unknown'}</span></div>
              {details.redirect_uri && <div style={{ marginTop: 4 }}>Returns to: <span style={{ color: 'var(--title)' }}>{details.redirect_uri}</span></div>}
              {details.scope?.trim() && <div style={{ marginTop: 4 }}>Requested: <span style={{ color: 'var(--title)' }}>{details.scope}</span></div>}
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
