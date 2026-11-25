import type { CanvasItem } from './canvasModel'

/** Stub: the sequence diagram importer is written separately and replaces this file. */
export type MermaidDiagramResult =
  | { ok: true; items: CanvasItem[]; boxes: number; links: number; ignoredLines: number; kind: 'flowchart' | 'class' | 'sequence' }
  | { ok: false; error: string }

export const isMermaidSequenceText = (line: string): boolean => /^sequenceDiagram\s*;?$/.test(line.trim())
export function buildMermaidSequence(_text: string): MermaidDiagramResult {
  return { ok: false, error: 'Sequence diagrams are not supported yet.' }
}
