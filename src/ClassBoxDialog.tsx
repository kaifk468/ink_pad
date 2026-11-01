import { useEffect, useRef, useState } from 'react'
import type { ClassBoxContent } from './canvasModel'

type ClassBoxDialogProps = {
  initial: ClassBoxContent
  isNew: boolean
  onDone: (content: ClassBoxContent) => void
  onCancel: () => void
}

/** Edits the three compartments of a UML class box. Plain fields so the keyboard and handwriting input work. */
export function ClassBoxDialog({ initial, isNew, onDone, onCancel }: ClassBoxDialogProps) {
  const [content, setContent] = useState(initial)
  const nameRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const field = (key: keyof ClassBoxContent) => (event: React.ChangeEvent<HTMLTextAreaElement>) => setContent((current) => ({ ...current, [key]: event.target.value }))

  return (
    <div className="file-panel-backdrop">
      <section className="file-panel class-dialog" role="dialog" aria-modal="true" aria-label="Class box">
        <header className="file-panel-header">
          <strong>{isNew ? 'New class box' : 'Edit class box'}</strong>
          <button type="button" className="file-panel-close" aria-label="Cancel" onClick={onCancel}>×</button>
        </header>
        <label className="file-panel-field">
          <span>Class name</span>
          <textarea ref={nameRef} className="class-dialog-field" rows={2} value={content.name} placeholder="Order  (put «interface» on a first line if you like)" aria-label="Class name" spellCheck={false} onChange={field('name')} />
        </label>
        <label className="file-panel-field">
          <span>Attributes — one per line</span>
          <textarea className="class-dialog-field" rows={4} value={content.attributes} placeholder="- id: int&#10;- total: float" aria-label="Attributes" spellCheck={false} onChange={field('attributes')} />
        </label>
        <label className="file-panel-field">
          <span>Methods — one per line</span>
          <textarea className="class-dialog-field" rows={4} value={content.methods} placeholder="+ addItem(item)&#10;+ pay()" aria-label="Methods" spellCheck={false} onChange={field('methods')} />
        </label>
        <div className="file-panel-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="class-dialog-done" onClick={() => onDone(content)}>Done</button>
        </div>
      </section>
    </div>
  )
}
