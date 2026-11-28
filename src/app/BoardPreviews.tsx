import type { ReactNode } from 'react'
import { BOARD_PALETTES, boardPalette, type BoardPalette, type BoardStyleId } from '../boardStyle'
import { canvasPreviewMarks } from '../boardPicker'
import type { CanvasType } from '../canvasTypes'

/** One picker tile: a small drawing over a label. Shared by the Desktop sheet and the Tablet menu (styles: .bp-* in styles.css). */
export function PickerTile(props: { label: string; title?: string; selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`bp-tile${props.selected ? ' selected' : ''}`} type="button" aria-pressed={props.selected} title={props.title ?? props.label} onClick={props.onClick}>
      {props.children}
      <span className="bp-tile-label">{props.label}</span>
    </button>
  )
}

const BOX_A = 'M8.5 15.5C14 14.3 21 15 28 14.6C28.8 20 28.2 27 28.4 33.2C21 33.8 14 32.6 8 33.4C8.4 27 7.6 21 8.5 15.5Z'
const BOX_B = 'M46.5 15C52 14 58 15.2 64.2 14.8C64.6 20 63.8 27 64.4 33C58 33.6 52 32.8 46 33.6C46.5 27 45.6 21 46.5 15Z'

/** 72x48 preview of a board style: a box, an arrow and a second box over a dot pattern, in that style's colours. */
export function BoardStylePreview({ style, dark }: { style: BoardStyleId; dark: boolean }) {
  const p: BoardPalette = style === 'chalk' ? BOARD_PALETTES.chalk : dark ? BOARD_PALETTES.dark : BOARD_PALETTES.light
  const dots = canvasPreviewMarks('dotted').dots
  const stroke = { stroke: p.ink, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg className="bp-preview" viewBox="0 0 72 48" aria-hidden="true" focusable="false">
      <rect x=".5" y=".5" width="71" height="47" fill={p.sheet} stroke={p.line} />
      <path d={dots} stroke={p.dot} strokeWidth="1.8" strokeLinecap="round" />
      {style === 'clean'
        ? <>
          <rect x="8" y="15" width="20" height="18" rx="2" fill={p.fill} {...stroke} />
          <rect x="46" y="15" width="18" height="18" rx="2" fill={p.fill} {...stroke} />
          <path d="M28 24H44M40 20l5 4-5 4" fill="none" {...stroke} />
        </>
        : <>
          <path d={BOX_A} fill={p.fill} {...stroke} />
          <path d={BOX_B} fill={p.fill} {...stroke} />
          <path d="M28.5 24.5C33 23.4 38 25 43.5 24M39.5 20.5L44.5 24L39.5 28.2" fill="none" {...stroke} />
        </>}
    </svg>
  )
}

/** 72x48 preview of a canvas type in the current board's sheet and mark colours (dark on the dark and chalk boards). */
export function CanvasPreview({ type, board }: { type: CanvasType; board: string | undefined }) {
  const p = boardPalette(board)
  const marks = canvasPreviewMarks(type)
  return (
    <svg className="bp-preview" viewBox="0 0 72 48" aria-hidden="true" focusable="false">
      <rect x=".5" y=".5" width="71" height="47" fill={p.sheet} stroke={p.line} />
      {marks.dots && <path d={marks.dots} stroke={p.dot} strokeWidth="2" strokeLinecap="round" />}
      {marks.lines && <path d={marks.lines} stroke={p.line} strokeWidth="1" fill="none" />}
      {marks.strong && <path d={marks.strong} stroke={p.lineStrong} strokeWidth="1.2" fill="none" />}
    </svg>
  )
}
