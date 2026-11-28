import type { CanvasItem } from './canvasModel'
import type { TechLogo } from './techLogoSearch'

/**
 * Lazy registry of the tech logo table. techLogoData.ts (about 200 KB of path data) is a separate chunk, fetched the first time a logo is
 * drawn, exported or searched; until then logos draw as the neutral placeholder and `subscribeTechLogos` listeners (the canvas redraw) run when it arrives.
 * It is built into the app bundle, so it works offline.
 */
let table: readonly TechLogo[] | null = null
let bySlug = new Map<string, TechLogo>()
let pending: Promise<readonly TechLogo[]> | null = null
/** A failed load is not retried by drawing (that would retry every frame); the pickers and exports call loadTechLogos, which does try again. */
let failed = false
const listeners = new Set<() => void>()

/** The loaded table, or null before the first load finished. */
export const loadedTechLogos = (): readonly TechLogo[] | null => table

/** One logo by slug: undefined when it is unknown to this build or the table has not loaded yet (a load is started in that case). */
export function findTechLogo(slug: string): TechLogo | undefined {
  if (!table && !failed) void loadTechLogos().catch(() => undefined)
  return bySlug.get(slug)
}

/** Makes `logos` the loaded table and notifies the listeners. loadTechLogos calls it; tests call it with the generated data. */
export function installTechLogos(logos: readonly TechLogo[]): readonly TechLogo[] {
  table = logos
  bySlug = new Map(logos.map((logo) => [logo.slug, logo]))
  listeners.forEach((listener) => listener())
  return logos
}

export function loadTechLogos(): Promise<readonly TechLogo[]> {
  if (table) return Promise.resolve(table)
  pending ??= import('./techLogoData').then((module) => installTechLogos(module.TECH_LOGOS)).catch((error) => { pending = null; failed = true; throw error })
  return pending
}

/** Runs `listener` after the table loads (to redraw). Returns the unsubscribe function. */
export function subscribeTechLogos(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Exports are synchronous: wait for the table first when any of these items is a logo box. Never throws (an offline failure just leaves placeholders). */
export async function ensureTechLogosFor(items: readonly CanvasItem[]): Promise<void> {
  if (table || !items.some((item) => item.kind === 'rectangle' && item.logo !== undefined)) return
  try { await loadTechLogos() } catch { /* placeholders */ }
}
