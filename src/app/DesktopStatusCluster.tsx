import type { SaveStatus } from '../FilePanel'
import { desktopStatusTone } from './desktopChrome'

type Props = { status: SaveStatus; text: string; /** The page has content (drives the idle tone: empty = neutral dot). */ hasContent?: boolean; onExport: () => void; /** Same as Ctrl+S. */ onSave: () => void; exportOpen: boolean; hideExport?: boolean; /** Bumped by Ctrl+S: replays the dot pulse and flashes the pill once. */ flashKey?: number }

/** Desktop only: save-status pill and the Export button, shown left of the account button. */
export function DesktopStatusCluster({ status, text, onExport, onSave, exportOpen, hideExport, flashKey = 0, hasContent = true }: Props) {
  const tone = desktopStatusTone(status, hasContent)
  return (
    <>
      <button key={`pill-${flashKey}`} type="button" className={`top-status-pill tone-${tone}${flashKey > 0 ? ' flash' : ''}`} title="Save now (Ctrl+S)" aria-label={`${text}. Save now`} onClick={onSave}>
        <span key={`${status === 'saved' ? 'saved' : 'other'}-${flashKey}`} className={`top-status-dot${status === 'saved' ? ' just-saved' : ''}`} aria-hidden="true" />
        <span className="top-status-text" role="status" aria-live="polite">{text}</span>
      </button>
      {!hideExport && <button className={`top-export-button${exportOpen ? ' selected' : ''}`} type="button" aria-haspopup="dialog" aria-expanded={exportOpen} title="Export and import (PNG, SVG, .inkpad)" onClick={onExport}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
        <span>Export</span>
      </button>}
    </>
  )
}
