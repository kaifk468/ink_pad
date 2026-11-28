import { useEffect } from 'react'
import { SHORTCUT_GROUPS, shortcutsInGroup } from '../desktopShortcuts'
import { LOGO_CREDIT } from './LogoPicker'

type ShortcutHelpProps = { onClose: () => void }

/** Desktop keyboard shortcut list, built from DESKTOP_SHORTCUTS. Escape or a click outside closes it. */
export function ShortcutHelp({ onClose }: ShortcutHelpProps) {
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
      <section className="file-panel shortcut-help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <header className="file-panel-header">
          <strong>Keyboard shortcuts</strong>
          <button type="button" className="file-panel-close" aria-label="Close" title="Close (Esc)" onClick={onClose}>×</button>
        </header>
        <div className="shortcut-help-body">
        <div className="shortcut-help-groups">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group} className="shortcut-help-group">
            <h3>{group}</h3>
            <dl className="shortcut-list">
              {shortcutsInGroup(group).map((entry) => (
                <div className="shortcut-row" key={`${group}:${entry.label}`}>
                  <dt>{entry.label}</dt>
                  <dd><kbd>{entry.keys}</kbd></dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        </div>
        </div>
        <p className="logo-credit">{LOGO_CREDIT}</p>
      </section>
    </div>
  )
}
