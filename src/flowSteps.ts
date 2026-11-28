import { canvasItemKey, type CanvasItem, type ConnectorObject } from './canvasModel'
import { cleanConnectorLabel, MAX_CONNECTOR_LABEL_LENGTH } from './connectorLabel'

/** A step prefix: digits then "." or ")" and whitespace or the end ("2. text", "2)"), or a label that is only one or two digits (a bare step number; "404" is data). "200 OK", "3 replicas", "1.5k QPS" and "2.5 MB/s" are not steps. */
const STEP_NUMBER = /^(?:\d+[.)](?:\s+|$)|\d{1,2}\s*$)/

/**
 * The connectors a step command works on: the unlocked connectors in the selection; when the selection holds only boxes,
 * the unlocked connectors with both ends attached to selected boxes. Empty when there are none.
 */
export function stepTargets(items: readonly CanvasItem[], selectedKeys: ReadonlySet<string>): ConnectorObject[] {
  const connectors = items.filter((item): item is ConnectorObject => item.kind === 'connector' && item.locked !== true)
  const chosen = connectors.filter((connector) => selectedKeys.has(canvasItemKey(connector)))
  if (chosen.length > 0) return chosen
  if (items.some((item) => item.kind === 'connector' && selectedKeys.has(canvasItemKey(item)))) return []
  const boxes = new Set<number>()
  for (const item of items) if (item.kind === 'rectangle' && selectedKeys.has(canvasItemKey(item))) boxes.add(item.id)
  if (boxes.size === 0) return []
  return connectors.filter((connector) => connector.startAttachment && connector.endAttachment
    && boxes.has(connector.startAttachment.rectangleId) && boxes.has(connector.endAttachment.rectangleId))
}

const byPosition = (a: ConnectorObject, b: ConnectorObject) => a.start.y - b.start.y || a.start.x - b.start.x || a.id - b.id

/** The targets in flow order: connectors whose start box has no incoming target first, then breadth first along the end boxes. Cycles end (each connector once). */
function flowOrder(targets: ConnectorObject[]): ConnectorObject[] {
  const endsAt = new Set<number>()
  for (const connector of targets) if (connector.endAttachment) endsAt.add(connector.endAttachment.rectangleId)
  const outgoing = new Map<number, ConnectorObject[]>()
  for (const connector of targets) {
    if (!connector.startAttachment) continue
    const list = outgoing.get(connector.startAttachment.rectangleId)
    if (list) list.push(connector)
    else outgoing.set(connector.startAttachment.rectangleId, [connector])
  }
  for (const list of outgoing.values()) list.sort(byPosition)
  const sorted = [...targets].sort(byPosition)
  const roots = sorted.filter((connector) => !connector.startAttachment || !endsAt.has(connector.startAttachment.rectangleId))
  const visited = new Set<number>()
  const order: ConnectorObject[] = []
  const walk = (start: ConnectorObject[]) => {
    const queue = start.filter((connector) => !visited.has(connector.id))
    queue.forEach((connector) => visited.add(connector.id))
    for (let head = 0; head < queue.length; head++) {
      const connector = queue[head]
      order.push(connector)
      for (const next of outgoing.get(connector.endAttachment?.rectangleId ?? -1) ?? []) {
        if (visited.has(next.id)) continue
        visited.add(next.id)
        queue.push(next)
      }
    }
  }
  walk(roots)
  // What is left lies on a cycle: start at the topmost, leftmost unvisited connector until all are numbered.
  for (const connector of sorted) if (!visited.has(connector.id)) walk([connector])
  return order
}

function relabel(items: CanvasItem[], changes: Map<number, string | undefined>): CanvasItem[] | null {
  let changed = false
  const next = items.map((item) => {
    if (item.kind !== 'connector' || !changes.has(item.id)) return item
    const label = changes.get(item.id)
    if (label === item.label) return item
    changed = true
    const { label: _old, ...rest } = item
    return label === undefined ? rest : { ...rest, label }
  })
  return changed ? next : null
}

/** Labels the target connectors 1, 2, 3 … in flow order, keeping the text after an old number. Null when there is nothing to number or nothing changes. */
export function numberSteps(items: CanvasItem[], selectedKeys: ReadonlySet<string>): CanvasItem[] | null {
  const targets = stepTargets(items, selectedKeys)
  if (targets.length === 0) return null
  const changes = new Map<number, string | undefined>()
  flowOrder(targets).forEach((connector, index) => {
    const rest = (cleanConnectorLabel(connector.label) ?? '').replace(STEP_NUMBER, '').trim()
    const label = rest === '' ? String(index + 1) : `${index + 1}. ${rest}`
    changes.set(connector.id, cleanConnectorLabel(label.slice(0, MAX_CONNECTOR_LABEL_LENGTH)))
  })
  return relabel(items, changes)
}

/** Removes the leading step numbers from the target connectors' labels (a label that was only a number is removed). Null when nothing changes. */
export function clearSteps(items: CanvasItem[], selectedKeys: ReadonlySet<string>): CanvasItem[] | null {
  const changes = new Map<number, string | undefined>()
  for (const connector of stepTargets(items, selectedKeys)) {
    const label = cleanConnectorLabel(connector.label)
    if (label === undefined || !STEP_NUMBER.test(label)) continue
    changes.set(connector.id, cleanConnectorLabel(label.replace(STEP_NUMBER, '')))
  }
  return relabel(items, changes)
}
