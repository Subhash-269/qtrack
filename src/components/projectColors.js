// Project colors: a fixed palette that reads on the dark theme. A project without a saved color
// gets one picked from its id, so it stays the same across devices and reloads.
export const PROJECT_COLORS = ['#AFA9EC', '#85B7EB', '#5DCAA5', '#FAC775', '#ED93B1', '#6FC3D8', '#F0997B', '#C0DD97', '#F09595', '#D3D1C7']

export function projectColor(p) {
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
