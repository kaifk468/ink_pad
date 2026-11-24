import type { RectangleBounds, RectangleObject } from './canvasModel'

/** A sticky note is an ordinary plain rectangle with a pale yellow fill and an amber outline: no new item kind, nothing new in the saved format. */
export const STICKY_FILL = '#fff3a3'
export const STICKY_OUTLINE = '#e0b400'
export const STICKY_WIDTH = 180
export const STICKY_HEIGHT = 120

/** The note centred on `centre`, moved back inside the workspace when it would stick out. */
export function createStickyNote(id: number, centre: { x: number; y: number }, strokeWidth: number, workspace: RectangleBounds): RectangleObject {
  const x = Math.max(workspace.x, Math.min(workspace.x + workspace.width - STICKY_WIDTH, centre.x - STICKY_WIDTH / 2))
  const y = Math.max(workspace.y, Math.min(workspace.y + workspace.height - STICKY_HEIGHT, centre.y - STICKY_HEIGHT / 2))
  return { kind: 'rectangle', id, x, y, width: STICKY_WIDTH, height: STICKY_HEIGHT, strokeColor: STICKY_OUTLINE, strokeWidth, fillColor: STICKY_FILL }
}
