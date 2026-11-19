import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TextFontId } from './canvasModel'
import { TEXT_LINE_HEIGHT, measureTextSize, textFontFamily, type TextMeasure } from './textLayout'
import { editorFit, type FitEditorState } from './textFit'

export type TextEditorState = {
  /** Existing text item being edited, or null when creating a new label. */
  itemId: number | null
  /** Top-left of the text box in sheet (canvas) coordinates. */
  x: number
  y: number
  fontSize: number
  /** The label's font; none means the original clean sans. */
  fontFamily?: TextFontId
  color: string
  initialText: string
  /** Desktop auto-fit (see textFit.ts); all missing on the tablet and on plain canvas. */
  fitArea?: FitEditorState['fitArea']
  pickedSize?: number
  fitOff?: boolean
  /** Desktop: a new label typed inside a shape is centred on this point (while typing and when saved). */
  centerOn?: { x: number; y: number }
}

type TextEditorOverlayProps = {
  editor: TextEditorState
  viewport: { scale: number; offsetX: number; offsetY: number }
  measure: (fontSize: number, fontId?: TextFontId) => TextMeasure | undefined
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

/** A plain textarea positioned over the canvas, so the system keyboard and handwriting input work. */
export function TextEditorOverlay({ editor, viewport, measure, onChange, onCommit, onCancel }: TextEditorOverlayProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(editor.initialText)
  const scale = viewport.scale
  const fit = editorFit(editor, value, measure)
  const fontSize = fit ? fit.fontSize : editor.fontSize
  const size = fit ?? measureTextSize(value, fontSize, measure(fontSize, editor.fontFamily))
  const padding = 6
  const boxWidth = fit?.wrap ? size.width * scale + padding * 2 : Math.max(size.width * scale + padding * 2 + 8, fontSize * scale * 4)
  const boxHeight = size.height * scale + padding * 2

  useLayoutEffect(() => {
    const field = fieldRef.current
    if (!field) return
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
  }, [])
  useEffect(() => { onChange(editor.initialText) }, [])

  return (
    <textarea
      ref={fieldRef}
      className="text-editor"
      aria-label="Text label"
      value={value}
      spellCheck={false}
      autoCapitalize="sentences"
      rows={1}
      wrap={fit?.wrap ? 'soft' : 'off'}
      style={{
        left: editor.centerOn ? editor.centerOn.x * scale + viewport.offsetX - boxWidth / 2 : editor.x * scale + viewport.offsetX - padding,
        top: editor.centerOn ? editor.centerOn.y * scale + viewport.offsetY - boxHeight / 2 : editor.y * scale + viewport.offsetY - padding,
        width: boxWidth,
        height: boxHeight,
        ...(editor.centerOn ? { textAlign: 'center' as const } : {}),
        padding,
        fontFamily: textFontFamily(editor.fontFamily),
        fontSize: fontSize * scale,
        lineHeight: TEXT_LINE_HEIGHT,
        color: editor.color,
        ...(fit?.wrap ? { overflow: 'hidden' } : {}),
      }}
      onChange={(event) => { setValue(event.target.value); onChange(event.target.value) }}
      onBlur={onCommit}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); onCancel() }
        else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onCommit() }
      }}
    />
  )
}
