import { isLightTheme } from '../theme'

// Project colors: a fixed palette that reads on the dark theme. A project without a saved color
// gets one picked from its id, so it stays the same across devices and reloads.
export const PROJECT_COLORS = ['#AFA9EC', '#85B7EB', '#5DCAA5', '#FAC775', '#ED93B1', '#6FC3D8', '#F0997B', '#C0DD97', '#F09595', '#D3D1C7']

// Light themes (Light, Blush) show a darker twin of each color so dots and bars stay visible
const LIGHT_TWIN = { '#AFA9EC': '#6A5ACD', '#85B7EB': '#1F6FB2', '#5DCAA5': '#1E8A6A', '#FAC775': '#9A6A00', '#ED93B1': '#B8457A', '#6FC3D8': '#0F7C93', '#F0997B': '#B4532A', '#C0DD97': '#5A7D1E', '#F09595': '#B23B3B', '#D3D1C7': '#5F5E5A' }

export function projectColor(p) {
  const c = baseColor(p)
  return isLightTheme() ? (LIGHT_TWIN[c.toUpperCase()] || c) : c
}

function baseColor(p) {
  if (p?.color) return p.color
  // FNV-1a, then a final mix so ids that differ only at the end ("projects-1", "projects-72") spread out
  const id = String(p?.id || '')
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12
  return PROJECT_COLORS[(h >>> 0) % PROJECT_COLORS.length]
}

// Up to two letters for the collapsed rail: "CS 5800 · Algorithms" -> "CS", "Weather App" -> "WA"
export function projectInitials(name = '') {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
