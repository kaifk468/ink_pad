export const RECENT_COLORS_KEY = 'inkpad.recentColors'

export interface Hsv { h: number; s: number; v: number }

/** Returns '#rrggbb' (lowercase) for 3/6 digit hex with or without '#', else null. */
export function parseHex(input: string): string | null {
  if (typeof input !== 'string') return null
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!m) return null
  let h = m[1].toLowerCase()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return `#${h}`
}

export function hexToHsv(hex: string): Hsv {
  const p = parseHex(hex) ?? '#000000'
  const r = parseInt(p.slice(1, 3), 16) / 255
  const g = parseInt(p.slice(3, 5), 16) / 255
  const b = parseInt(p.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hh = ((h % 360) + 360) % 360
  const ss = Math.min(1, Math.max(0, s))
  const vv = Math.min(1, Math.max(0, v))
  const c = vv * ss
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = vv - c
  const [r, g, b] =
    hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x]
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function isDarkColor(hex: string): boolean {
  const p = parseHex(hex) ?? '#000000'
  const r = parseInt(p.slice(1, 3), 16)
  const g = parseInt(p.slice(3, 5), 16)
  const b = parseInt(p.slice(5, 7), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b < 140
}

/** Pure: newest first, deduplicated, capped at max. Invalid colours are ignored. */
export function addRecentColor(list: readonly string[], hex: string, max = 8): string[] {
  const c = parseHex(hex)
  if (!c) return list.slice(0, max)
  return [c, ...list.filter((x) => x !== c)].slice(0, max)
}

export function loadRecentColors(): string[] {
  try {
    const raw = JSON.parse(globalThis.localStorage.getItem(RECENT_COLORS_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.map((x) => (typeof x === 'string' ? parseHex(x) : null)).filter((x): x is string => !!x).slice(0, 8)
  } catch {
    return []
  }
}

export function saveRecentColors(list: readonly string[]): void {
  try {
    globalThis.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable */
  }
}
