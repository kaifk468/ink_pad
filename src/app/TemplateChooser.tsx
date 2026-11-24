import { useEffect } from 'react'
import { DIAGRAM_TEMPLATES } from '../diagramTemplates'

type TemplateChooserProps = { onChoose: (id: string) => void; onClose: () => void }

/** Small list of the starter layouts (name and one line each). Escape, the close button or a click outside closes it. */
export function TemplateChooser({ onChoose, onClose }: TemplateChooserProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="file-panel-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="file-panel template-chooser" role="dialog" aria-modal="true" aria-label="Insert template">
        <header className="file-panel-header">
          <strong>Insert template</strong>
          <button type="button" className="file-panel-close" aria-label="Close" title="Close (Esc)" onClick={onClose}>×</button>
        </header>
        <ul className="template-list">
          {DIAGRAM_TEMPLATES.map((template) => (
            <li key={template.id}>
              <button type="button" className="template-option" onClick={() => onChoose(template.id)}>
                <strong>{template.name}</strong>
                <span>{template.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
