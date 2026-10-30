export type StrokeDisplayMode = 'smooth' | 'raw'

const STORAGE_KEY = 'inkpad.strokeDisplayMode'

export function parseStrokeDisplayMode(value: string | null): StrokeDisplayMode {
  return value === 'raw' ? 'raw' : 'smooth'
}

export function loadStrokeDisplayMode(storage?: Pick<Storage, 'getItem'>): StrokeDisplayMode {
  try {
    return parseStrokeDisplayMode((storage ?? window.localStorage).getItem(STORAGE_KEY))
  } catch {
    return 'smooth'
  }
}

export function saveStrokeDisplayMode(mode: StrokeDisplayMode, storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? window.localStorage).setItem(STORAGE_KEY, mode)
  } catch {
    // Storage may be unavailable in restricted browser contexts; mode remains usable this session.
  }
}
