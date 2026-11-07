import type { NavigationSettings } from './touchNavigator'

const ONE_FINGER_KEY = 'inkpad.oneFingerPan'
const ZOOM_LOCK_KEY = 'inkpad.zoomLock'

export const DEFAULT_NAVIGATION_SETTINGS: NavigationSettings = { oneFingerPan: false, zoomLocked: false }

export function loadNavigationSettings(storage?: Pick<Storage, 'getItem'>): NavigationSettings {
  try {
    const source = storage ?? window.localStorage
    return { oneFingerPan: source.getItem(ONE_FINGER_KEY) === 'on', zoomLocked: source.getItem(ZOOM_LOCK_KEY) === 'on' }
  } catch {
    return { ...DEFAULT_NAVIGATION_SETTINGS }
  }
}

export function saveNavigationSettings(settings: NavigationSettings, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const target = storage ?? window.localStorage
    target.setItem(ONE_FINGER_KEY, settings.oneFingerPan ? 'on' : 'off')
    target.setItem(ZOOM_LOCK_KEY, settings.zoomLocked ? 'on' : 'off')
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}
