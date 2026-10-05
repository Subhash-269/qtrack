import { createClient } from '@supabase/supabase-js'
import { mockSupabase } from './demo/mockSupabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// /demo (or ?demo) runs the app against local sample data — no account needed
export const isDemo = window.location.pathname.startsWith('/demo') || new URLSearchParams(window.location.search).has('demo')

export const supabase = isDemo ? mockSupabase : createClient(supabaseUrl, supabaseKey)
