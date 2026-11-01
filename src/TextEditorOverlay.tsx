import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TEXT_FONT_FAMILY, TEXT_LINE_HEIGHT, measureTextSize, type TextMeasure } from './textLayout'

export type TextEditorState = {
  /** Existing text item being edited, or null when creating a new label. */
  itemId: number | null
  /** Top-left of the text box in sheet (canvas) coordinates. */
  x: number
  y: number
  fontSize: number
  color: string
  initialText: string
}

type TextEditorOverlayProps = {
  editor: TextEditorState
  viewport: { scale: number; offsetX: number; offsetY: number }
  measure: (fontSize: number) => TextMeasure | undefined
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

/** A plain textarea positioned over the canvas, so the system keyboard and handwriting input work. */
export function TextEditorOverlay({ editor, viewport, measure, onChange, onCommit, onCancel }: TextEditorOverlayProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(editor.initialText)
  const scale = viewport.scale
  const size = measureTextSize(value, editor.fontSize, measure(editor.fontSize))
  const padding = 6

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
      wrap="off"
      style={{
        left: editor.x * scale + viewport.offsetX - padding,
        top: editor.y * scale + viewport.offsetY - padding,
        width: Math.max(size.width * scale + padding * 2 + 8, editor.fontSize * scale * 4),
        height: size.height * scale + padding * 2,
        padding,
        fontFamily: TEXT_FONT_FAMILY,
        fontSize: editor.fontSize * scale,
        lineHeight: TEXT_LINE_HEIGHT,
        color: editor.color,
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
