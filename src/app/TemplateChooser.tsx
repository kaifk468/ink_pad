import { useEffect, useState } from 'react'
import { DIAGRAM_TEMPLATES } from '../diagramTemplates'
import { MAX_TEMPLATE_NAME_LENGTH, type UserTemplate } from '../userTemplates'

type TemplateChooserProps = {
  onChoose: (id: string) => void
  onClose: () => void
  /** Templates saved on this device ("My templates"). */
  userTemplates: readonly UserTemplate[]
  onChooseUser: (id: string) => void
  onDeleteUser: (id: string) => void
  /** Something is selected, so "Save selection as template…" is enabled. */
  canSave: boolean
  /** Open with the name field already showing (from the right-click menu or the command palette). */
  startSaving?: boolean
  /** Saves the selection under `name`; returns an error message to show, or null when it was saved (the App then closes the chooser). */
  onSave: (name: string) => string | null
}

const DEVICE_ONLY = 'Saved on this device only (in this browser); not part of the diagram file.'

/** Small list of the starter layouts and the user's own templates. Escape, the close button or a click outside closes it. */
export function TemplateChooser({ onChoose, onClose, userTemplates, onChooseUser, onDeleteUser, canSave, startSaving = false, onSave }: TemplateChooserProps) {
  const [saving, setSaving] = useState(startSaving && canSave)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const submit = () => setError(onSave(name))
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
        <h3 className="template-section-title" title={DEVICE_ONLY}>My templates</h3>
        {userTemplates.length === 0 && <p className="template-empty">None yet. Select items on the canvas, then save them here. {DEVICE_ONLY}</p>}
        <ul className="template-list" aria-label="My templates">
          {userTemplates.map((template) => (
            <li key={template.id} className="template-user-row">
              <button type="button" className="template-option" title={`Insert “${template.name}”. ${DEVICE_ONLY}`} onClick={() => onChooseUser(template.id)}>
                <strong>{template.name}</strong>
                <span>{template.items.length} {template.items.length === 1 ? 'item' : 'items'}</span>
              </button>
              <button
                type="button"
                className="template-delete"
                aria-label={`Delete template ${template.name}`}
                title="Delete this template from this device"
                onClick={() => { if (confirm(`Delete template “${template.name}” from this device?`)) onDeleteUser(template.id) }}
              >×</button>
            </li>
          ))}
        </ul>
        {saving ? (
          <form className="template-save-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
            <input
              type="text"
              autoFocus
              maxLength={MAX_TEMPLATE_NAME_LENGTH}
              placeholder="Template name"
              aria-label="Template name"
              value={name}
              onChange={(event) => { setName(event.target.value); setError(null) }}
            />
            <button type="submit">Save</button>
            {error && <p className="template-error" role="alert">{error}</p>}
          </form>
        ) : (
          <button type="button" className="template-save-button" disabled={!canSave} title={canSave ? `Save the selected items as a template. ${DEVICE_ONLY}` : 'Select something on the canvas first'} onClick={() => setSaving(true)}>Save selection as template…</button>
        )}
      </section>
    </div>
  )
}
