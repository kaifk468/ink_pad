/** The zoom menu opened from the % readout: fixed zoom levels, Fit drawing and Fit selection. */
export const ZOOM_MENU_LEVELS = [50, 100, 150, 200] as const

export type ZoomMenuChoice = { kind: 'level'; percent: number } | { kind: 'fitDrawing' } | { kind: 'fitSelection' }

export type ZoomMenuItem = { id: string; label: string; hint?: string; disabled: boolean; choice: ZoomMenuChoice }

/** Menu rows with their disabled states: every zoom choice is off while the tablet zoom lock is on; Fit selection also needs a selection. Hints (shortcuts) are desktop only. */
export function zoomMenuItems(options: { locked: boolean; hasSelection: boolean; desktop: boolean }): ZoomMenuItem[] {
  const { locked, hasSelection, desktop } = options
  return [
    ...ZOOM_MENU_LEVELS.map((percent): ZoomMenuItem => ({ id: `zoom:${percent}`, label: `${percent}%`, disabled: locked, choice: { kind: 'level', percent } })),
    { id: 'zoom:fit-drawing', label: 'Fit drawing', ...(desktop ? { hint: 'Shift+1' } : {}), disabled: locked, choice: { kind: 'fitDrawing' } },
    { id: 'zoom:fit-selection', label: 'Fit selection', ...(desktop ? { hint: 'Shift+2' } : {}), disabled: locked || !hasSelection, choice: { kind: 'fitSelection' } },
  ]
}
