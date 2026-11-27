import type { SaveStatus } from '../FilePanel'

type Props = { status: SaveStatus; text: string; onExport: () => void; exportOpen: boolean; hideExport?: boolean }

/** Desktop only: save-status pill and the Export button, shown left of the account button. */
export function DesktopStatusCluster({ status, text, onExport, exportOpen, hideExport }: Props) {
  const tone = status === 'saved' ? 'ok' : status === 'error' || status === 'locked' ? 'bad' : 'pending'
  return (
    <>
      <div className={`top-status-pill tone-${tone}`} role="status">
        <span key={status === 'saved' ? 'saved' : 'other'} className={`top-status-dot${status === 'saved' ? ' just-saved' : ''}`} aria-hidden="true" />
        <span className="top-status-text">{text}</span>
      </div>
      {!hideExport && <button className={`top-export-button${exportOpen ? ' selected' : ''}`} type="button" aria-haspopup="dialog" aria-expanded={exportOpen} title="Export and import (PNG, SVG, .inkpad)" onClick={onExport}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
        <span>Export</span>
      </button>}
    </>
  )
}
