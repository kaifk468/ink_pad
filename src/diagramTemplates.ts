import { createConnector } from './canvasModel'
import type { CanvasItem, ConnectorAttachment, ConnectorRelationshipType, ConnectorRouting, HldShape, Point, RectangleObject, TextObject } from './canvasModel'
import { CLASS_BOX_DEFAULT_STROKE_WIDTH, createClassBox } from './classBoxLayout'
import { HLD_DEFAULT_SIZE, createHldShape } from './hldShapes'
import { createTextObject } from './textLayout'

/**
 * Starter layouts ("Insert template"). Each template is a list of ordinary items (boxes, text labels inside boxes, attached connectors)
 * with local ids starting at 1 per kind and the top-left of the whole layout at (0, 0). The App inserts them through the paste path, which
 * gives them real ids, keeps them in the workspace and centres them in the view. Nothing here is a new item kind.
 */
export type DiagramTemplate = { id: string; name: string; description: string; build: () => CanvasItem[] }

type Side = 'left' | 'right' | 'top' | 'bottom'
const STROKE_COLOR = '#1e1e1e'
const LABEL_SIZE = 24
/** The HLD templates are drawn at this fraction of the shapes' tap-create sizes (a whole template is then about 1000 x 400 units, readable on one screen). */
export const HLD_TEMPLATE_SCALE = 0.7

class Sheet {
  items: CanvasItem[] = []
  private rectangleId = 1
  private textId = 1
  private connectorId = 1

  /** `scale` shrinks every HLD box position and size, so a whole template fits one screen at a readable zoom. */
  constructor(private readonly scale = 1) {}

  /** An HLD shape; `name` becomes a text label centred in it (`labelDrop` moves it down for shapes with an icon in the middle). Coordinates and sizes are in unscaled units. */
  hld(shape: HldShape, unscaledX: number, unscaledY: number, name: string, unscaledSize = HLD_DEFAULT_SIZE[shape], unscaledLabelDrop = 0): RectangleObject {
    const scaled = (value: number): number => Math.round(value * this.scale)
    const x = scaled(unscaledX)
    const y = scaled(unscaledY)
    const size = { width: scaled(unscaledSize.width), height: scaled(unscaledSize.height) }
    const labelDrop = scaled(unscaledLabelDrop)
    const made = createHldShape(this.rectangleId++, x, y, size.width, size.height, STROKE_COLOR, CLASS_BOX_DEFAULT_STROKE_WIDTH, shape)
    // The saved file keeps the two ink dividers 24 units from the edges and each other; start with those values so a save and load changes nothing.
    const top = Math.min(Math.max(made.inkBox?.top ?? y, y + 24), y + size.height - 48)
    const mid = Math.min(Math.max(made.inkBox?.mid ?? y, top + 24), y + size.height - 24)
    const box: RectangleObject = { ...made, inkBox: { top, mid, ink: [] } }
    this.items.push(box)
    this.label(box, name, LABEL_SIZE, labelDrop)
    return box
  }

  /** A plain rectangle with an optional title label placed near its top. */
  plain(x: number, y: number, width: number, height: number, title?: string): RectangleObject {
    const box: RectangleObject = { kind: 'rectangle', id: this.rectangleId++, x, y, width, height, strokeColor: STROKE_COLOR, strokeWidth: CLASS_BOX_DEFAULT_STROKE_WIDTH }
    this.items.push(box)
    if (title) this.label(box, title, 30, -(height / 2 - 40))
    return box
  }

  /** A typed class box whose top-left corner is (x, y). */
  classBox(x: number, y: number, name: string, attributes: string, methods: string): RectangleObject {
    const made = createClassBox(this.rectangleId++, 0, 0, { name, attributes, methods }, STROKE_COLOR)
    const box = { ...made, x, y }
    this.items.push(box)
    return box
  }

  /** A text label whose centre is the box centre (plus `drop` down), so it lies fully inside the box; centred like labels typed inside a shape. */
  private label(box: RectangleObject, text: string, fontSize: number, drop: number): TextObject {
    const made = createTextObject(this.textId++, 0, 0, text, STROKE_COLOR, fontSize)
    const label: TextObject = { ...made, align: 'center', x: box.x + box.width / 2 - made.width / 2, y: box.y + box.height / 2 + drop - made.height / 2 }
    this.items.push(label)
    return label
  }

  /** An arrow between the middle of one side of `from` and the middle of one side of `to`, attached to both boxes. */
  connect(from: RectangleObject, fromSide: Side, to: RectangleObject, toSide: Side, options: { type?: ConnectorRelationshipType; routing?: ConnectorRouting } = {}): void {
    const attach = (box: RectangleObject, side: Side): ConnectorAttachment => ({
      rectangleId: box.id,
      offsetX: side === 'right' ? box.width : side === 'left' ? 0 : box.width / 2,
      offsetY: side === 'bottom' ? box.height : side === 'top' ? 0 : box.height / 2,
    })
    const startAttachment = attach(from, fromSide)
    const endAttachment = attach(to, toSide)
    const point = (box: RectangleObject, a: ConnectorAttachment): Point => ({ x: box.x + a.offsetX, y: box.y + a.offsetY, pressure: 1 })
    const connector = createConnector(this.connectorId++, point(from, startAttachment), point(to, endAttachment), STROKE_COLOR, CLASS_BOX_DEFAULT_STROKE_WIDTH, startAttachment, endAttachment, options.type ?? 'directed-association')
    this.items.push(options.routing === 'elbow' ? { ...connector, routing: 'elbow' } : connector)
  }
}

function clientServerDatabase(): CanvasItem[] {
  const sheet = new Sheet(HLD_TEMPLATE_SCALE)
  const user = sheet.hld('user', 0, 170, 'User', undefined, 50)
  const balancer = sheet.hld('loadBalancer', 220, 185, 'Load balancer')
  const serviceA = sheet.hld('service', 620, 20, 'Service A')
  const serviceB = sheet.hld('service', 620, 340, 'Service B')
  const database = sheet.hld('database', 1060, 140, 'Database', undefined, 20)
  sheet.connect(user, 'right', balancer, 'left')
  sheet.connect(balancer, 'right', serviceA, 'left', { routing: 'elbow' })
  sheet.connect(balancer, 'right', serviceB, 'left', { routing: 'elbow' })
  sheet.connect(serviceA, 'right', database, 'left', { routing: 'elbow' })
  sheet.connect(serviceB, 'right', database, 'left', { routing: 'elbow' })
  return sheet.items
}

function cacheAndQueue(): CanvasItem[] {
  const sheet = new Sheet(HLD_TEMPLATE_SCALE)
  const client = sheet.hld('browser', 0, 120, 'Client', { width: 280, height: 160 }, 12)
  const api = sheet.hld('service', 360, 120, 'API service', { width: 320, height: 160 })
  const cache = sheet.hld('cache', 780, 125, 'Cache', { width: 280, height: 150 })
  const queue = sheet.hld('queue', 310, 400, 'Queue', { width: 420, height: 140 })
  const worker = sheet.hld('service', 830, 400, 'Worker', { width: 300, height: 140 })
  const database = sheet.hld('database', 1230, 360, 'Database', { width: 260, height: 220 }, 20)
  sheet.connect(client, 'right', api, 'left')
  sheet.connect(api, 'right', cache, 'left')
  sheet.connect(api, 'bottom', queue, 'top')
  sheet.connect(queue, 'right', worker, 'left')
  sheet.connect(worker, 'right', database, 'left')
  return sheet.items
}

function classDiagram(): CanvasItem[] {
  const sheet = new Sheet()
  const driver = sheet.classBox(0, 0, 'Driver', '- name: String', '+ drive(v: Vehicle)')
  const vehicle = sheet.classBox(520, 0, 'Vehicle', '- id: int\n- speed: float', '+ start()\n+ stop()')
  const car = sheet.classBox(520, 330, 'Car', '- doors: int', '+ openDoor()')
  // A Car is a Vehicle: the inheritance triangle sits on the Vehicle end. A Driver uses a Vehicle: a plain association.
  sheet.connect(car, 'top', vehicle, 'bottom', { type: 'inheritance' })
  sheet.connect(driver, 'right', vehicle, 'left', { type: 'association' })
  return sheet.items
}

function interviewBoard(): CanvasItem[] {
  const sheet = new Sheet()
  const width = 620
  const height = 400
  const gap = 40
  sheet.plain(0, 0, width, height, 'Requirements')
  sheet.plain(width + gap, 0, width, height, 'API')
  sheet.plain(0, height + gap, width, height, 'High-level design')
  sheet.plain(width + gap, height + gap, width, height, 'Deep dive')
  return sheet.items
}

export const DIAGRAM_TEMPLATES: readonly DiagramTemplate[] = [
  { id: 'client-server-database', name: 'Client–server–database', description: 'User, load balancer, two services and a database.', build: clientServerDatabase },
  { id: 'cache-queue-service', name: 'Cache + queue service', description: 'Client, API service with a cache, and a queue feeding a worker and database.', build: cacheAndQueue },
  { id: 'class-diagram', name: 'Class diagram', description: 'Three typed class boxes with inheritance and an association.', build: classDiagram },
  { id: 'interview-board', name: 'Interview board', description: 'Four boxes: Requirements, API, High-level design, Deep dive.', build: interviewBoard },
]

/** The items of a template (fresh each call), or null for an unknown id. */
export function buildTemplate(id: string): CanvasItem[] | null {
  return DIAGRAM_TEMPLATES.find((template) => template.id === id)?.build() ?? null
}
