import type { ConnectorRelationshipType } from './canvasModel'
import { buildMermaidClassItems, type MermaidClass, type MermaidClassNote, type MermaidRelation } from './mermaidClassImport'
import { cleanMermaidText, decodeMermaidEntities, MAX_MERMAID_NODES, MAX_MERMAID_TEXT, normalizeMermaidSpaces } from './mermaidCommon'
import { buildSequenceItems, MAX_SEQUENCE_MESSAGES, MAX_SEQUENCE_PARTICIPANTS, type MermaidDiagramResult, type SequenceParticipant, type SequenceStep } from './mermaidSequenceImport'

/**
 * PlantUML import (class and sequence diagrams). A pure parser that produces the same intermediate models the Mermaid class and
 * sequence importers lay out, so boxes, connectors, cardinalities, boundaries, frames and notes look exactly like a Mermaid import.
 * `@startuml` / `@enduml` are optional. Class: class / interface / abstract class / enum with `{}` members and `<<stereotypes>>`, `extends` /
 * `implements`, relationships (`<|--`, `--|>`, `*--`, `o--`, `-->`, `..>`, `..|>`, `<|..`, `--`, `..`) with `: label` and `"1" -- "*"`
 * cardinalities, package / namespace blocks (dashed boundaries), notes (sticky notes). Sequence: participant / actor / boundary / control /
 * entity / database / queue / collections, messages, notes, alt / else / loop / opt / par / break / critical / group frames, autonumber, title.
 * Everything else (skinparam, hide / show, activate, legend, `!` directives, ...) is skipped and counted; `'` comments are free.
 */
const MAX_MEMBER_LENGTH = 120
const MAX_NOTE = 300
const MAX_CARDINALITY = 24
const MAX_LABEL = 200

const NAME = '[\\p{L}\\p{N}_.$]+'
const REF = `(?:"[^"]+"|${NAME}(?:<[\\p{L}\\p{N}_,?. ]+>)?)`
const SEQ_KEYWORDS = 'participant|actor|boundary|control|entity|database|queue|collections'
const CLASS_KEYWORDS = 'abstract\\s+class|abstract|class|interface|enum|annotation|struct|protocol|exception'
const CLASS_DECL = new RegExp(`^(${CLASS_KEYWORDS})\\s+(.+)$`, 'u')
const SEQ_DECL = new RegExp(`^(${SEQ_KEYWORDS})\\s+(.+)$`, 'u')
const STRICT_CLASS_FIRST = new RegExp(`^(?:${CLASS_KEYWORDS})\\s+(?:"[^"]+"\\s+as\\s+${NAME}|${NAME}(?:<[^>]+>)?(?:\\s+as\\s+(?:"[^"]+"|${NAME}))?)(?:\\s*<<[^>]+>>)?\\s*\\{?$`, 'u')
const STRICT_SEQ_FIRST = new RegExp(`^(?:${SEQ_KEYWORDS})\\s+(?:"[^"]+"(?:\\s+as\\s+${NAME})?|${NAME}(?:\\s+as\\s+(?:"[^"]+"|${NAME}))?)$`, 'u')
const CLASS_RELATION = new RegExp(`^(${REF})\\s*(?:"([^"]*)"\\s*)?(<\\||\\*|o|<|\\^|\\+)?((?:-|\\.)+(?:\\[[^\\]]*\\])?(?:(?:left|right|up|down|[lrud])(?![\\p{L}\\p{N}_]))?(?:-|\\.)*)(\\|>|\\*|o|>|\\^|\\+)?\\s*(?:"([^"]*)"\\s*)?(${REF})\\s*(?::\\s*(.*))?$`, 'u')
const CLASS_ONLY_LINE = /<\||\|>|\*--|--\*|\bo--|--o\b|\.\.>|<\.\.|(?:^|\s)(?:--|\.\.)(?:\s|$)/
const MEMBER_LINE = new RegExp(`^(${REF})\\s*:\\s*(.+)$`, 'u')
const SEQ_MESSAGE = new RegExp(`^(${REF})\\s*(<<?)?(-+(?:\\[[^\\]]*\\])?-*)(>>?|\\\\\\\\?|//?|x(?=\\s)|o(?=\\s))?\\s*(?:\\+\\+|--|\\*\\*|!!)?\\s*(${REF})(?:\\s*(?:\\+\\+|--|\\*\\*|!!))?\\s*(?::\\s*(.*))?$`, 'u')
const SEQ_NOTE = new RegExp(`^[rh]?note\\s+(left|right|over|across)(?:\\s+of)?\\s*(${REF})?(?:\\s*,\\s*(${REF}))?\\s*(?:#\\w+\\s*)?(?::\\s*(.*))?$`, 'iu')
const FRAME = /^(alt|loop|opt|par|break|critical|group)(?:\s+(.*))?$/
const DIVIDER = /^(else|and|also)(?:\s+(.*))?$/
const IGNORED_KEYWORDS = /^(?:skinparam|hide|show|set|title|header|footer|caption|scale|left\s+to\s+right|top\s+to\s+bottom|activate|deactivate|destroy|create|return|ref\b|delay|newpage|legend|mainframe|remove|restore|together|page|!|\.\.\.|\|\|\||==|<style|<\/style)/i
const NOTE_START = /^[rh]?note\b/i

export type PlantUmlKind = 'class' | 'sequence'

/** The lines between `@startuml` and `@enduml` (all lines when there is no marker), trimmed, without blank lines and `'` comments. */
function prepare(text: string): string[] {
  const clean = normalizeMermaidSpaces(text.slice(0, MAX_MERMAID_TEXT)).replace(/^﻿/, '').replace(/\/'[\s\S]*?(?:'\/|$)/g, '\n')
  const lines: string[] = []
  let started = !/^\s*@startuml\b/im.test(clean)
  for (const raw of clean.split(/\r?\n/)) {
    const line = raw.trim()
    if (/^@startuml\b/i.test(line)) { started = true; continue }
    if (/^@enduml\b/i.test(line)) { if (started) break; continue }
    if (!started || line === '' || line.startsWith("'")) continue
    lines.push(line)
  }
  return lines
}

const hasMarker = (text: string): boolean => {
  for (const raw of text.slice(0, MAX_MERMAID_TEXT).replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith("'")) continue
    return /^@startuml\b/i.test(line)
  }
  return false
}

/** Class or sequence, from the content: class declarations or class-only arrows mean class; participants or arrows between names mean sequence. */
function detectKind(lines: string[]): PlantUmlKind | null {
  let sequence = false
  for (const line of lines) {
    if (CLASS_DECL.test(line) && !SEQ_MESSAGE.test(line) && !/^(?:class|abstract|annotation|enum|struct)\s*[-.<:]/.test(line)) return 'class'
    if (/^(?:package|namespace)\b/.test(line)) return 'class'
    if (CLASS_ONLY_LINE.test(line) && CLASS_RELATION.test(line)) return 'class'
    if (SEQ_DECL.test(line) || /^autonumber\b/.test(line)) sequence = true
    else if (SEQ_MESSAGE.test(line) && /(?:->|<-|-\\|-\/)/.test(line)) sequence = true
  }
  return sequence ? 'sequence' : null
}

const unquote = (raw: string): string => { const t = raw.trim(); return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t }
const cleanText = (raw: string): string => cleanMermaidText(raw.replace(/<\/?(?:b|i|u|s|color[^>]*|size[^>]*)>/gi, '')).slice(0, MAX_LABEL)
const noteText = (raw: string): string => decodeMermaidEntities(raw.replace(/<br\s*\/?>|\\n/gi, '\n')).split('\n').map((line) => line.trim()).join('\n').trim().slice(0, MAX_NOTE)

// ---------------------------------------------------------------- class

type ClassParse = { ok: true; classes: MermaidClass[]; relations: MermaidRelation[]; notes: MermaidClassNote[]; ignoredLines: number } | { ok: false; error: string }
type PendingNote = { target?: string; alias?: string; lines: string[] }

/** `Foo<T>` -> key Foo, name Foo<T>. */
function classNames(raw: string): { key: string; name: string } {
  const text = unquote(raw)
  const generic = /^([^<]+)(<.*>)$/.exec(text)
  return { key: generic ? generic[1] : text, name: text }
}

function parseClass(lines: string[]): ClassParse {
  const classes = new Map<string, MermaidClass>()
  const relations: MermaidRelation[] = []
  const notes: MermaidClassNote[] = []
  const aliases = new Map<string, string>() // declared alias -> class key
  const noteAliases = new Map<string, number>() // note alias -> index in notes
  let ignored = 0
  let body: MermaidClass | null = null
  let note: PendingNote | null = null
  let skipUntil: RegExp | null = null
  const blocks: Array<{ kind: 'package'; name: string } | { kind: 'ignored' }> = []
  const currentPackage = (): string | undefined => {
    for (let index = blocks.length - 1; index >= 0; index -= 1) { const block = blocks[index]; if (block.kind === 'package') return block.name }
    return undefined
  }
  const keyOf = (raw: string): string => { const { key } = classNames(raw); return aliases.get(key) ?? key }
  const ensure = (raw: string): MermaidClass => {
    const { key: rawKey, name } = classNames(raw)
    const key = aliases.get(rawKey) ?? rawKey
    let known = classes.get(key)
    if (!known) { known = { id: key, name: aliases.has(rawKey) ? key : name, attributes: [], methods: [] }; classes.set(key, known) } else if (name !== key && known.name === key && !aliases.has(rawKey)) known.name = name
    return known
  }
  const addMember = (target: MermaidClass, raw: string): void => {
    const member = raw.trim().replace(/^\{(?:static|abstract|field|method|classifier)\}\s*/i, '').replace(/\s*\{(?:static|abstract|field|method|classifier)\}\s*/gi, ' ').trim()
    if (member === '' || /^([-=._])\1+/.test(member)) return // separators (`--`, `==`, `..`, `__`)
    const stereotype = /^<<\s*([^>]+?)\s*>>$/.exec(member)
    if (stereotype) { target.annotation = stereotype[1].replace(/^\(.,[^)]*\)\s*/, ''); return }
    const clean = decodeMermaidEntities(member).slice(0, MAX_MEMBER_LENGTH)
    ;(clean.includes('(') ? target.methods : target.attributes).push(clean)
  }
  const finishNote = (): void => {
    if (!note) return
    const text = noteText(note.lines.join('\n'))
    if (text === '') ignored += 1
    else {
      notes.push({ ...(note.target ? { target: note.target } : {}), text })
      if (note.alias) noteAliases.set(note.alias, notes.length - 1)
    }
    note = null
  }
  for (const line of lines) {
    if (skipUntil) { if (skipUntil.test(line)) skipUntil = null; continue }
    if (note) {
      if (/^end\s*[rh]?note$/i.test(line)) finishNote()
      else note.lines.push(line)
      continue
    }
    if (body) {
      // Only a line that starts with `}` closes the body (`{static}` / `{abstract}` modifiers contain braces too).
      if (line.startsWith('}')) body = null
      else addMember(body, line)
      continue
    }
    if (blocks.length > 0 && blocks[blocks.length - 1].kind === 'ignored') {
      if (line.startsWith('}')) blocks.pop()
      else if (line.endsWith('{')) blocks.push({ kind: 'ignored' })
      continue
    }
    if (line.startsWith('}')) { blocks.pop(); continue }
    const grouped = /^(?:package|namespace)\s+(.+?)\s*(?:#\w+\s*)?\{$/.exec(line)
    if (grouped) {
      const spec = grouped[1].trim()
      const named = /^"([^"]+)"(?:\s+as\s+\S+)?$/.exec(spec)
      const asName = /^(\S+)\s+as\s+"([^"]+)"$/.exec(spec)
      blocks.push({ kind: 'package', name: (named ? named[1] : asName ? asName[2] : spec).replace(/\s*<<.*>>$/, '') })
      continue
    }
    if (/^legend\b/i.test(line)) { ignored += 1; skipUntil = /^end\s*legend$/i; continue }
    if (line.endsWith('{') && IGNORED_KEYWORDS.test(line)) { ignored += 1; blocks.push({ kind: 'ignored' }); continue }
    if (NOTE_START.test(line)) {
      const placed = new RegExp(`^[rh]?note\\s+(?:(?:left|right|top|bottom)(?:\\s+of\\s+(${REF}))?|on\\s+link)\\s*(?:#\\w+\\s*)?(?::\\s*(.*))?$`, 'iu').exec(line)
      const quoted = /^[rh]?note\s+"([^"]+)"\s+as\s+(\w+)\s*(?:#\w+)?$/i.exec(line)
      const declared = /^[rh]?note\s+as\s+(\w+)\s*(?:#\w+)?$/i.exec(line)
      if (quoted) { note = { alias: quoted[2], lines: [quoted[1]] }; finishNote(); continue }
      if (placed) {
        const target = placed[1] ? keyOf(placed[1]) : undefined
        note = { ...(target ? { target } : {}), lines: placed[2] ? [placed[2]] : [] }
        if (placed[2]) finishNote()
        continue
      }
      if (declared) { note = { alias: declared[1], lines: [] }; continue }
      ignored += 1
      continue
    }
    const declaration = CLASS_DECL.exec(line)
    if (declaration && !/^(?:class|abstract|annotation|enum|struct)\s*[-.<:]/.test(line)) {
      const keyword = declaration[1].replace(/\s+/g, ' ')
      let rest = declaration[2].trim()
      let brace = false
      if (/\{\s*\}$/.test(rest)) rest = rest.replace(/\{\s*\}$/, '').trim()
      else if (rest.endsWith('{')) { brace = true; rest = rest.slice(0, -1).trim() }
      let stereotype: string | undefined
      rest = rest.replace(/<<\s*([^>]+?)\s*>>/, (_whole, value: string) => { stereotype = value.replace(/^\(.,[^)]*\)\s*/, ''); return '' }).replace(/\[\[[^\]]*\]\]/g, '').replace(/#[\p{L}\p{N}]+(?:[/|\\-]#?[\p{L}\p{N}]+)?/gu, '').trim()
      const parents: Array<{ name: string; realization: boolean }> = []
      const inherit = /\s+(?:extends|implements)\s+/.exec(rest)
      if (inherit) {
        // `extends A, B implements C, D`: each keyword owns the comma list that follows it
        const tail = rest.slice(inherit.index)
        rest = rest.slice(0, inherit.index).trim()
        for (const chunk of tail.split(/\s+(?=(?:extends|implements)\s)/)) {
          const parsedChunk = /^\s*(extends|implements)\s+(.+)$/.exec(chunk)
          if (parsedChunk) for (const part of parsedChunk[2].split(',')) if (part.trim()) parents.push({ name: part.trim(), realization: parsedChunk[1] === 'implements' })
        }
      }
      let id = ''
      let label = ''
      const quotedFirst = /^"([^"]+)"\s+as\s+(\S+)$/.exec(rest)
      const aliasLast = /^(\S+)\s+as\s+"([^"]+)"$/.exec(rest) ?? /^(\S+)\s+as\s+(\S+)$/.exec(rest)
      if (quotedFirst) { id = quotedFirst[2]; label = quotedFirst[1] }
      else if (aliasLast) { id = aliasLast[1]; label = aliasLast[2] }
      else if (new RegExp(`^${REF}$`, 'u').test(rest)) id = rest
      else { ignored += 1; continue }
      if (label) aliases.set(id, id)
      const target = ensure(id)
      if (label) target.name = label
      const pack = currentPackage()
      if (pack) target.namespace = pack
      const annotation = stereotype ?? (keyword === 'interface' ? 'interface' : keyword === 'enum' ? 'enumeration' : keyword === 'abstract class' || keyword === 'abstract' ? 'abstract' : keyword === 'annotation' ? 'annotation' : undefined)
      if (annotation) target.annotation = annotation
      for (const parent of parents) {
        const other = ensure(parent.name)
        if (other !== target) relations.push({ from: target.id, to: other.id, type: parent.realization ? 'realization' : 'inheritance', dashed: parent.realization })
      }
      if (brace) body = target
      continue
    }
    const relation = CLASS_RELATION.exec(line)
    if (relation && (relation[3] ?? '').length + relation[4].length + (relation[5] ?? '').length >= 2) {
      const [, leftRaw, leftCard, leftHeadRaw, stroke, rightHeadRaw, rightCard, rightRaw, labelRaw] = relation
      const leftNote = noteAliases.get(unquote(leftRaw))
      const rightNote = noteAliases.get(unquote(rightRaw))
      if (leftNote !== undefined || rightNote !== undefined) {
        // `N1 .. Foo` ties a floating note to a class
        if (leftNote === undefined || rightNote === undefined) {
          const index = (leftNote ?? rightNote) as number
          notes[index] = { ...notes[index], target: keyOf(leftNote !== undefined ? rightRaw : leftRaw) }
        }
        continue
      }
      const leftHead = leftHeadRaw === '^' ? '<|' : leftHeadRaw
      const rightHead = rightHeadRaw === '^' ? '|>' : rightHeadRaw
      const left = ensure(leftRaw)
      const right = ensure(rightRaw)
      if (left === right) { ignored += 1; continue }
      const dashed = stroke.includes('.')
      const text = labelRaw ? cleanText(labelRaw.replace(/^[<>]\s+|\s+[<>]$/g, '')) : ''
      const labelPart = text ? { label: text } : {}
      const cardOf = (side: MermaidClass): string => cleanText(side === left ? leftCard ?? '' : rightCard ?? '').slice(0, MAX_CARDINALITY)
      const make = (from: MermaidClass, to: MermaidClass, type: ConnectorRelationshipType, dash = false, twoWay = false): void => {
        const startLabel = cardOf(from)
        const endLabel = cardOf(to)
        relations.push({ from: from.id, to: to.id, type, dashed: dash, ...(twoWay ? { twoWay: true as const } : {}), ...labelPart, ...(startLabel ? { startLabel } : {}), ...(endLabel ? { endLabel } : {}) })
      }
      const plain = (head: string | undefined): boolean => head === '+'
      if (leftHead === '<' && rightHead === '>' && !dashed) make(left, right, 'directed-association', false, true)
      else if ((leftHead && rightHead) || plain(leftHead) || plain(rightHead)) make(left, right, 'association', dashed)
      else if (leftHead === '<|') make(right, left, dashed ? 'realization' : 'inheritance')
      else if (rightHead === '|>') make(left, right, dashed ? 'realization' : 'inheritance')
      else if (leftHead === '*') make(left, right, 'composition')
      else if (rightHead === '*') make(right, left, 'composition')
      else if (leftHead === 'o') make(left, right, 'aggregation')
      else if (rightHead === 'o') make(right, left, 'aggregation')
      else if (leftHead === '<') make(right, left, dashed ? 'dependency' : 'directed-association')
      else if (rightHead === '>') make(left, right, dashed ? 'dependency' : 'directed-association')
      else make(left, right, 'association', dashed)
      continue
    }
    if (IGNORED_KEYWORDS.test(line) || /^end\s*(?:legend|note)$/i.test(line)) { ignored += 1; continue }
    const member = MEMBER_LINE.exec(line)
    if (member) { addMember(ensure(member[1]), member[2]); continue }
    ignored += 1
  }
  finishNote()
  if (classes.size === 0) return { ok: false, error: 'No classes found. Start with @startuml, then lines like class Animal or Animal <|-- Dog.' }
  if (classes.size > MAX_MERMAID_NODES) return { ok: false, error: `Too many classes (${classes.size}); the limit is ${MAX_MERMAID_NODES}.` }
  const known = new Set(classes.keys())
  return { ok: true, classes: [...classes.values()], relations, notes: notes.map((entry) => (entry.target !== undefined && !known.has(entry.target) ? { text: entry.text } : entry)), ignoredLines: ignored }
}

// ---------------------------------------------------------------- sequence

type PendingSeqNote = { side: 'over' | 'left' | 'right'; a: string; b?: string; lines: string[] }

function buildSequence(lines: string[]): MermaidDiagramResult {
  const participants: SequenceParticipant[] = []
  const steps: SequenceStep[] = []
  const frameDefs: Array<{ kind: string; text: string }> = []
  const openFrames: number[] = []
  const ids = new Map<string, string>() // quoted long name -> alias id
  let ignored = 0
  let title = ''
  let numbered = false
  let messageCount = 0
  let lastParticipant: string | null = null
  let note: PendingSeqNote | null = null
  let skipUntil: RegExp | null = null
  let braceDepth = 0
  const idOf = (raw: string): string => { const text = unquote(raw); return ids.get(text) ?? text }
  const ensure = (raw: string): SequenceParticipant | null => {
    const id = idOf(raw)
    const found = participants.find((participant) => participant.id === id)
    if (found) return found
    if (participants.length >= MAX_SEQUENCE_PARTICIPANTS) return null
    const added: SequenceParticipant = { id, text: id, actor: false }
    participants.push(added)
    return added
  }
  const addNote = (side: 'over' | 'left' | 'right', aRaw: string, bRaw: string | undefined, text: string): void => {
    const a = ensure(aRaw)
    const b = bRaw && side === 'over' ? ensure(bRaw) : null
    if (!a || (bRaw && side === 'over' && !b)) { ignored += 1; return }
    steps.push({ kind: 'note', side, a: a.id, ...(b ? { b: b.id } : {}), text: noteText(text) })
  }
  for (const line of lines) {
    if (skipUntil) { if (skipUntil.test(line)) skipUntil = null; continue }
    if (braceDepth > 0) { if (line.endsWith('{')) braceDepth += 1; else if (line.startsWith('}')) braceDepth -= 1; continue }
    if (note) {
      if (/^end\s*[rh]?note$/i.test(line)) { addNote(note.side, note.a, note.b, note.lines.join('\n')); note = null } else note.lines.push(line)
      continue
    }
    const declared = SEQ_DECL.exec(line)
    if (declared && !SEQ_MESSAGE.test(line)) {
      const rest = declared[2].trim().replace(/<<[^>]*>>/g, '').replace(/\s+order\s+-?\d+/i, '').replace(/\s+#[\p{L}\p{N}]+(?:[/|\\-]#?[\p{L}\p{N}]+)?\s*$/u, '').trim()
      let id = rest
      let text = ''
      const quotedFirst = /^"([^"]+)"(?:\s+as\s+(\S+))?$/.exec(rest)
      const aliased = /^(\S+)\s+as\s+(.+)$/.exec(rest)
      if (quotedFirst) { id = quotedFirst[2] ?? quotedFirst[1]; text = quotedFirst[1] }
      else if (aliased) { id = aliased[1]; text = unquote(aliased[2]) }
      if (!id || /\s/.test(id)) { ignored += 1; continue }
      if (text) ids.set(text, id) // later messages may name the participant by its long name
      const participant = ensure(id)
      if (!participant) { ignored += 1; continue }
      participant.actor = declared[1] === 'actor'
      if (text) participant.text = cleanText(text) || id
      continue
    }
    const message = SEQ_MESSAGE.exec(line)
    if (message && (message[2] || message[4] || message[3].length >= 2)) {
      if (messageCount >= MAX_SEQUENCE_MESSAGES) { ignored += 1; continue }
      const [, leftRaw, leadHead, stroke, tailHead, rightRaw, text] = message
      const leftward = Boolean(leadHead) && !tailHead
      const first = ensure(leftward ? rightRaw : leftRaw)
      const second = first ? ensure(leftward ? leftRaw : rightRaw) : null
      if (!first || !second) { ignored += 1; continue }
      messageCount += 1
      lastParticipant = first.id
      steps.push({ kind: 'message', from: first.id, to: second.id, text: cleanText(text ?? ''), dashed: stroke.startsWith('--') || /dashed|dotted/.test(stroke), head: Boolean(leadHead || tailHead) })
      continue
    }
    if (/^autonumber\b/.test(line)) { numbered = true; continue }
    const titled = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line)
    if (titled) { title = cleanText(titled[1]); continue }
    if (NOTE_START.test(line)) {
      const noted = SEQ_NOTE.exec(line)
      if (!noted) { ignored += 1; continue }
      const word = noted[1].toLowerCase()
      const side = word === 'left' ? 'left' : word === 'right' ? 'right' : 'over'
      let a: string | undefined = noted[2]
      let b: string | undefined = noted[3]
      if (word === 'across') { a = participants[0]?.id; b = participants.length > 1 ? participants[participants.length - 1].id : undefined }
      if (!a && lastParticipant) a = lastParticipant
      if (!a) { ignored += 1; continue }
      if (noted[4]) addNote(side, a, b, noted[4])
      else note = { side, a, ...(b ? { b } : {}), lines: [] }
      continue
    }
    if (/^legend\b/i.test(line)) { ignored += 1; skipUntil = /^end\s*legend$/i; continue }
    if (/^(?:end\s*)?box\b/i.test(line)) { ignored += 1; continue }
    const opened = FRAME.exec(line)
    if (opened) {
      frameDefs.push({ kind: opened[1], text: cleanText(opened[2] ?? '').replace(/^\[(.*)\]$/, '$1') })
      openFrames.push(frameDefs.length - 1)
      steps.push({ kind: 'open', frame: frameDefs.length - 1 })
      continue
    }
    const divided = DIVIDER.exec(line)
    if (divided && openFrames.length > 0) { steps.push({ kind: 'divider', frame: openFrames[openFrames.length - 1], text: cleanText(divided[2] ?? '') }); continue }
    if (/^end$/i.test(line) && openFrames.length > 0) { steps.push({ kind: 'close', frame: openFrames.pop() as number }); continue }
    if (line.endsWith('{')) { ignored += 1; braceDepth = 1; continue }
    ignored += 1
  }
  const pending = note as PendingSeqNote | null
  if (pending) addNote(pending.side, pending.a, pending.b, pending.lines.join('\n'))
  if (participants.length === 0) return { ok: false, error: 'No participants found. Start with @startuml, then lines like participant Alice or Alice -> Bob: hello.' }
  while (openFrames.length > 0) steps.push({ kind: 'close', frame: openFrames.pop() as number })
  const built = buildSequenceItems({ participants, steps, frameDefs, title, numbered, messageCount, ignored })
  return built.ok ? { ok: true, items: built.items, boxes: built.boxes, links: built.links, ignoredLines: built.ignoredLines, kind: 'sequence', frames: built.frames } : built
}

// ---------------------------------------------------------------- entry points

/**
 * True for PlantUML text: it starts with `@startuml`, or (without markers) its first line is a class / participant declaration and the
 * rest reads as a diagram (a link, a member body or at least two boxes, with fewer unreadable lines than readable ones).
 * Plain text and Mermaid never match.
 */
export function isPlantUmlText(text: string): boolean {
  if (hasMarker(text)) return true
  const lines = prepare(text)
  if (lines.length < 2 || !(STRICT_CLASS_FIRST.test(lines[0]) || STRICT_SEQ_FIRST.test(lines[0]))) return false
  const built = buildPlantUml(text, lines)
  if (!built.ok) return false
  return (built.links > 0 || built.boxes >= 2 || lines.some((line) => line.endsWith('{'))) && built.ignoredLines * 2 <= lines.length
}

/** Reads PlantUML class or sequence text and builds the same items the Mermaid importers build. */
export function buildPlantUml(text: string, prepared: string[] = prepare(text)): MermaidDiagramResult {
  const kind = detectKind(prepared)
  if (kind === null) return { ok: false, error: 'No PlantUML class or sequence diagram found. Use class / interface lines with relationships, or participant lines with messages like Alice -> Bob: hello.' }
  if (kind === 'sequence') return buildSequence(prepared)
  const parsed = parseClass(prepared)
  if (!parsed.ok) return parsed
  const built = buildMermaidClassItems(parsed)
  return { ok: true, items: built.items, boxes: built.boxes, links: built.links, ignoredLines: parsed.ignoredLines, kind: 'class' }
}
