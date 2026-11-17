import { useLayoutEffect, useRef, useState } from 'react'
import type { CodeObject } from './canvasModel'
import { CODE_FONT_FAMILY, CODE_PADDING, CODE_TAB_WIDTH, codeColors, codeFontSize, codeGeometry } from './codeBlock'
import { codeCharWidth } from './app/codeRenderer'
import { indentSelection } from './codeEditing'

type CodeEditorOverlayProps = {
  item: CodeObject
  viewport: { scale: number; offsetX: number; offsetY: number }
  onChange: (value: string) => void
  /** Escape and clicking away both commit. */
  onCommit: () => void
}

/** A textarea laid exactly over the code block (Desktop only). Tab indents, Shift+Tab outdents, Escape or clicking away commits. */
export function CodeEditorOverlay({ item, viewport, onChange, onCommit }: CodeEditorOverlayProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(item.text)
  const scale = viewport.scale
  const colors = codeColors(item)
  const lineCount = value.split('\n').length
  const geometry = codeGeometry(item, lineCount, codeCharWidth(codeFontSize(item)))
  const fontSize = geometry.fontSize * scale
  const lineHeight = geometry.lineHeight * scale

  useLayoutEffect(() => {
    const field = fieldRef.current
    if (!field) return
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
    onChange(item.text)
  }, [])

  const edit = (next: string, selectionStart: number, selectionEnd: number) => {
    setValue(next)
    onChange(next)
    requestAnimationFrame(() => fieldRef.current?.setSelectionRange(selectionStart, selectionEnd))
  }

  return (
    <div
      className="code-editor"
      style={{ left: item.x * scale + viewport.offsetX, top: item.y * scale + viewport.offsetY, width: item.width * scale, height: item.height * scale, background: colors.background, borderColor: colors.border, fontFamily: CODE_FONT_FAMILY, fontSize, lineHeight: `${lineHeight}px` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div ref={gutterRef} className="code-editor-gutter" aria-hidden="true" style={{ width: geometry.gutterRight * scale, color: colors.gutter, paddingTop: CODE_PADDING * scale }}>
        {Array.from({ length: lineCount }, (_, index) => <div key={index}>{index + 1}</div>)}
      </div>
      <textarea
        ref={fieldRef}
        className="code-editor-field"
        aria-label="Code"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        style={{ left: geometry.textX * scale, paddingTop: CODE_PADDING * scale, color: colors.plain, tabSize: CODE_TAB_WIDTH }}
        onChange={(event) => { setValue(event.target.value); onChange(event.target.value) }}
        onScroll={(event) => { if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-event.currentTarget.scrollTop}px)` }}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); onCommit(); return }
          if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault()
            const field = event.currentTarget
            const result = indentSelection(field.value, field.selectionStart, field.selectionEnd, event.shiftKey)
            edit(result.text, result.start, result.end)
          }
        }}
      />
    </div>
  )
}
