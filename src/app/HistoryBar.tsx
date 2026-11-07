type HistoryBarProps = { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; tidyLabel: string; onTidy: () => void }

/** Top-center undo and redo. */
export function HistoryBar({ canUndo, canRedo, onUndo, onRedo, tidyLabel, onTidy }: HistoryBarProps) {
  return (
    <div className="history-bar" role="group" aria-label="History">
      <button className="history-button" type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-2"/></svg>
        <span>Undo</span>
      </button>
      <button className="history-button" type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9h-9a6 6 0 0 0 0 12h2"/></svg>
        <span>Redo</span>
      </button>
      <button className="history-button tidy-button" type="button" onClick={onTidy} aria-label={tidyLabel} title={`${tidyLabel}: arrange the class boxes neatly`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="8.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M7 10.5v1.5h10v-1.5M12 12v1.5"/></svg>
        <span>{tidyLabel}</span>
      </button>
    </div>
  )
}
