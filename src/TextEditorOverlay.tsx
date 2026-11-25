import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TextAlign, TextFontId } from './canvasModel'
import { TEXT_LINE_HEIGHT, measureTextSize, textFontFamily, type TextMeasure } from './textLayout'
import { continueList, minimalEdit } from './listContinuation'
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
  /** Alignment of the label being edited (new labels inside a shape are centred through centerOn). */
  align?: TextAlign
  /** A right-aligned label being re-edited keeps this right edge (sheet coordinates) while typing and when saved. */
  anchorRight?: number
  /** Editing the label of this connector (Enter commits, Shift+Enter is a new line; committing writes connector.label). */
  connectorId?: number
  /** A label typed into a just-inserted sticky note: committing it adds no undo step of its own (the insert already saved one). */
  mergeHistory?: boolean
  /** Open with the whole text selected, so typing replaces it (a just-added Boundary label). */
  selectAll?: boolean
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
    if (editor.selectAll) field.select()
    else field.setSelectionRange(field.value.length, field.value.length)
  }, [])
  useEffect(() => { onChange(editor.initialText) }, [])

  // Enter on a list line continues (or ends) the list. Returns true when the key was consumed.
  const skipBeforeInput = useRef(false)
  const editorRef = useRef(editor)
  editorRef.current = editor
  const applyListEnter = (field: HTMLTextAreaElement): boolean => {
    const result = continueList(field.value, field.selectionStart, field.selectionEnd)
    if (!result) return false
    const edit = minimalEdit(field.value, result.value)
    field.setSelectionRange(edit.from, edit.to)
    // execCommand keeps the browser's own undo stack and fires the input event React listens to.
    let done = false
    try { done = edit.text ? document.execCommand('insertText', false, edit.text) : document.execCommand('delete') } catch { done = false }
    if (!done || field.value !== result.value) {
      field.setRangeText(edit.text, edit.from, edit.to, 'end')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    field.setSelectionRange(result.caret, result.caret)
    return true
  }
  // Android on-screen keyboards often send no usable keydown Enter, only beforeinput.
  useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType !== 'insertLineBreak' && event.inputType !== 'insertParagraph') return
      if (skipBeforeInput.current) { skipBeforeInput.current = false; return }
      if (event.isComposing || !event.cancelable || editorRef.current.connectorId !== undefined) return
      if (continueList(field.value, field.selectionStart, field.selectionEnd)) {
        event.preventDefault()
        skipBeforeInput.current = true
        try { applyListEnter(field) } finally { skipBeforeInput.current = false }
      }
    }
    field.addEventListener('beforeinput', onBeforeInput)
    return () => field.removeEventListener('beforeinput', onBeforeInput)
  }, [])

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
        left: editor.centerOn ? editor.centerOn.x * scale + viewport.offsetX - boxWidth / 2 : editor.anchorRight !== undefined ? editor.anchorRight * scale + viewport.offsetX - boxWidth + padding : editor.x * scale + viewport.offsetX - padding,
        top: editor.centerOn ? editor.centerOn.y * scale + viewport.offsetY - boxHeight / 2 : editor.y * scale + viewport.offsetY - padding,
        width: boxWidth,
        height: boxHeight,
        ...(editor.align ? { textAlign: editor.align === 'right' ? 'right' as const : 'center' as const } : editor.centerOn ? { textAlign: 'center' as const } : {}),
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
        else if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229 && (event.ctrlKey || event.metaKey || (editor.connectorId !== undefined && !event.shiftKey))) { event.preventDefault(); onCommit() }
        else if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
          // Plain Enter inserts a newline here (connector labels commit above), so it may continue a list.
          if (editor.connectorId === undefined && applyListEnter(event.currentTarget)) event.preventDefault()
        } else if (event.key === 'Enter') {
          // Shift/Alt+Enter is a plain line break; the beforeinput path must not continue the list for it.
          skipBeforeInput.current = true
        }
      }}
      onKeyUp={(event) => { if (event.key === 'Enter') skipBeforeInput.current = false }}
    />
  )
}
