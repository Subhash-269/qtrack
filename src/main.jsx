import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './supabaseClient'
import App from './App.jsx'
import Auth from './Auth.jsx'
import OAuthConsent from './OAuthConsent.jsx'

// MCP clients send the user to /oauth/consent. If they have to sign in first (possibly via
// GitHub/Google, which return to the site root), remember where to come back to.
const RETURN_KEY = 'qtrack_oauth_return'
const isConsent = window.location.pathname.startsWith('/oauth/consent')
if (isConsent) { try { sessionStorage.setItem(RETURN_KEY, window.location.href) } catch { /* storage blocked */ } }

// After sign-in, go back to a pending consent page (same origin only)
function pendingConsent() {
  if (isConsent) { try { sessionStorage.removeItem(RETURN_KEY) } catch { /* storage blocked */ } return null }
  try {
    const back = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    return back && new URL(back).origin === window.location.origin ? back : null
  } catch { return null }
}

function Root() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const onSession = (session) => {
      const back = session && pendingConsent()
      if (back) { window.location.replace(back); return }
      setSession(session)
      setLoading(false)
    }
    supabase.auth.getSession().then(({ data: { session } }) => onSession(session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => onSession(session)
    )
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#111110', color:'#888780' }}>
      Loading...
    </div>
  )

  if (isConsent) return session ? <OAuthConsent session={session} /> : <Auth />
  return session ? <App session={session} /> : <Auth />
}

createRoot(document.getElementById('root')).render(
  <StrictMode><Root /></StrictMode>
)
