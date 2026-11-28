import { useEffect, useRef, useState } from 'react'

type MermaidDialogProps = {
  /** Inserts the diagram; returns an error message to show in the dialog, or null when it was inserted (the App then closes the dialog). */
  onInsert: (text: string) => string | null
  onClose: () => void
}

const EXAMPLE = 'flowchart LR\n  A[Client] --> B[(Database)]\n  B -->|reads| C[[Service]]'

/** "Insert from Mermaid…": a text box for flowchart / graph, classDiagram, sequenceDiagram, erDiagram or stateDiagram text. Escape, the close button, Cancel or a click outside closes it. */
export function MermaidDialog({ onInsert, onClose }: MermaidDialogProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const paste = () => {
    const read = navigator.clipboard?.readText
    if (!read) return
    navigator.clipboard.readText().then((value) => { if (value) { setText(value); setError(null) } }, () => undefined)
    areaRef.current?.focus()
  }
  const submit = () => setError(onInsert(text))
  return (
    <div className="file-panel-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="file-panel template-chooser mermaid-dialog" role="dialog" aria-modal="true" aria-label="Insert from Mermaid or PlantUML">
        <header className="file-panel-header">
          <strong>Insert from Mermaid or PlantUML</strong>
          <button type="button" className="file-panel-close" aria-label="Close" title="Close (Esc)" onClick={onClose}>×</button>
        </header>
        <form className="mermaid-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
          <textarea
            ref={areaRef}
            autoFocus
            rows={10}
            spellCheck={false}
            aria-label="Mermaid text"
            placeholder={EXAMPLE}
            value={text}
            onChange={(event) => { setText(event.target.value); setError(null) }}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit() } }}
          />
          <p className="template-empty">Supports flowchart (with subgraphs), classDiagram, sequenceDiagram, erDiagram and stateDiagram. PlantUML class and sequence diagrams (@startuml) also work.</p>
          {error && <p className="template-error" role="alert">{error}</p>}
          <div className="mermaid-actions">
            <button type="button" onClick={paste} title="Paste the text on the clipboard into the box">Paste</button>
            <span className="mermaid-spacer" />
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="mermaid-insert" title="Insert the diagram (Ctrl+Enter)">Insert</button>
          </div>
        </form>
      </section>
    </div>
  )
}
