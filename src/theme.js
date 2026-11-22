// Color themes. Components use CSS variables (var(--bg), var(--text), ...) instead of hex values;
// each theme sets those variables on <html data-theme="...">. "system" follows the device:
// Calm when it's dark, Light when it's light. The choice is kept per device.
// Palette rationale and contrast checks: docs/proposals/color-palette.md

export const THEMES = [
  { id: 'system', label: 'System', note: 'follows your device' },
  { id: 'calm', label: 'Calm', note: 'default' },
  { id: 'soft', label: 'Soft', note: 'lower contrast' },
  { id: 'high', label: 'High contrast' },
  { id: 'light', label: 'Light' },
  { id: 'blush', label: 'Blush', note: 'soft pink' },
  { id: 'hero', label: 'Hero', note: 'red and blue' },
  { id: 'gold', label: 'Black & Gold' },
  { id: 'iron', label: 'Red & Gold' },
]
export const DEFAULT_THEME = 'calm'
// Three colors per theme for the picker swatch: page, card, accent
export const swatch = (id) => { const t = T[resolveTheme(id)]; return [t.bg, t.surface, id === 'gold' ? t.amber : id === 'hero' || id === 'iron' ? t.red : t.blue] }
const LIGHT = new Set(['light', 'blush'])
const KEY = 'qtrack_theme'

// Role tokens. The names follow the old hex palette so components read the same:
// bg page · side sidebar · surface cards · line2 row dividers · raise2 hover/popover · line borders
// dim control borders (≥3:1) · muted small labels (≥4.5:1) · sub · soft · title · text
const T = {
  calm: { bg: '#1B1B19', side: '#1F1F1D', surface: '#222220', line2: '#292926', raise2: '#2E2E2B', line: '#34342F', dim: '#6E6D66', muted: '#9C9A92', sub: '#ABA9A1', soft: '#C4C2B9', title: '#DAD8CF', text: '#E6E4DC', red: '#D98880', green: '#7FBFA0', blue: '#8FB8D6', amber: '#E0B872', pink: '#E3A49B', purple: '#B3AEDF', orange: '#E3A07F', lime: '#B8CF95' },
  soft: { bg: '#202320', side: '#232623', surface: '#282B27', line2: '#2E312D', raise2: '#323531', line: '#3A3E39', dim: '#747873', muted: '#96958B', sub: '#A3A298', soft: '#BAB8AE', title: '#CFCDC3', text: '#D8D6CC', red: '#C98A7B', green: '#8DB59A', blue: '#9AB4C8', amber: '#CFAE7A', pink: '#D2A496', purple: '#ABA6CC', orange: '#CFA084', lime: '#AFC296' },
  high: { bg: '#000000', side: '#0A0A0A', surface: '#111111', line2: '#1A1A1A', raise2: '#1E1E1E', line: '#3A3A37', dim: '#6B6B66', muted: '#C8C8C2', sub: '#D6D6D0', soft: '#E6E6E0', title: '#FFFFFF', text: '#FFFFFF', red: '#FF7A70', green: '#5FE0B0', blue: '#7CC4FF', amber: '#FFD166', pink: '#FF9D95', purple: '#C5BFFF', orange: '#FFA27A', lime: '#C8F08A' },
  light: { bg: '#F7F6F2', side: '#EFEDE7', surface: '#FFFFFF', line2: '#EEECE6', raise2: '#F1EFE8', line: '#E1DFD7', dim: '#8C8A82', muted: '#6B6A64', sub: '#5E5D58', soft: '#45443F', title: '#2B2A27', text: '#1F1E1C', red: '#B3261E', green: '#2E7D5B', blue: '#1F5F9E', amber: '#8A5A00', pink: '#B3261E', purple: '#5B4FC4', orange: '#A6461A', lime: '#4F7A1C' },
  blush: { bg: '#FFF4F6', side: '#FCE8ED', surface: '#FFFFFF', line2: '#F9E6EB', raise2: '#FCEEF2', line: '#F3D6DE', dim: '#B07F8F', muted: '#86606F', sub: '#7A5664', soft: '#5E3F4C', title: '#4A2E3B', text: '#3B2530', red: '#C0365F', green: '#2E7D5B', blue: '#2F63B0', amber: '#8A5A00', pink: '#B0284F', purple: '#7B4FC2', orange: '#A6461A', lime: '#4F7A1C' },
  hero: { bg: '#0E1322', side: '#111830', surface: '#151C31', line2: '#1A2239', raise2: '#1E2740', line: '#2A3452', dim: '#636F90', muted: '#9AA5C0', sub: '#AAB4CC', soft: '#C3CBDD', title: '#DCE2F0', text: '#EEF1F8', red: '#FF4D57', green: '#4FD1A5', blue: '#5B9BFF', amber: '#F2C14E', pink: '#FF8A92', purple: '#B79CFF', orange: '#FF8F6B', lime: '#A8E07A' },
  gold: { bg: '#0D0C0A', side: '#12110D', surface: '#17150F', line2: '#1D1A13', raise2: '#211E16', line: '#2E2A1F', dim: '#6E6450', muted: '#A89B7C', sub: '#B7AB8D', soft: '#CFC4A8', title: '#E6DCC6', text: '#F2EBDC', red: '#E07A62', green: '#9CC78A', blue: '#9DB4D6', amber: '#E7C35A', pink: '#EBA08C', purple: '#B9A3D9', orange: '#E8A87C', lime: '#C6D68E' },
  iron: { bg: '#190E0D', side: '#1E1211', surface: '#231413', line2: '#2A1917', raise2: '#2F1C1A', line: '#3F2622', dim: '#86665C', muted: '#B39689', sub: '#C1A69A', soft: '#D6C0B5', title: '#EAD9CF', text: '#F6E9E2', red: '#FF5A4E', green: '#8FCB9B', blue: '#9FB7E8', amber: '#F0C35C', pink: '#FF9A90', purple: '#C3A6E6', orange: '#FF9B70', lime: '#C2DA8E' },
}

// Tinted chip/badge backgrounds and borders, mixed from the accent and the card color
const TINTS = ['red:pink', 'blue:blue', 'purple:purple', 'green:green', 'amber:amber', 'orange:orange']
  .map(p => { const [name, accent] = p.split(':'); return `--tint-${name}-bg: color-mix(in srgb, var(--${accent}) 14%, var(--surface)); --tint-${name}-bd: color-mix(in srgb, var(--${accent}) 34%, var(--surface));` })
  .join(' ')

function css() {
  const blocks = Object.entries(T).map(([id, t]) =>
    `:root[data-theme="${id}"] { color-scheme: ${LIGHT.has(id) ? 'light' : 'dark'}; ${Object.entries(t).map(([k, v]) => `--${k}: ${v};`).join(' ')} }`)
  return `${blocks.join('\n')}\n:root { ${TINTS} }\nhtml, body { background: var(--bg); color: var(--text); }`
}

export function getThemePref() {
  try { const v = localStorage.getItem(KEY); return THEMES.some(t => t.id === v) ? v : DEFAULT_THEME } catch { return DEFAULT_THEME }
}

const prefersLight = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
export const resolveTheme = (pref) => (pref === 'system' ? (prefersLight() ? 'light' : DEFAULT_THEME) : pref)
export const isLightTheme = () => typeof document !== 'undefined' && LIGHT.has(document.documentElement.dataset.theme)

function apply(pref) {
  document.documentElement.dataset.theme = resolveTheme(pref)
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref) } catch { /* storage blocked */ }
  apply(pref)
}

// Call once before the first render
export function initTheme() {
  if (!document.getElementById('qt-theme')) {
    const style = document.createElement('style')
    style.id = 'qt-theme'
    style.textContent = css()
    document.head.appendChild(style)
  }
  apply(getThemePref())
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (getThemePref() === 'system') apply('system') })
}
