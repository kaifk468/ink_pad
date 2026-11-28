import { useEffect, useRef } from 'react'

type FindBarProps = {
  query: string
  onQueryChange: (query: string) => void
  /** Number of matches on all pages, and the 0-based index of the one shown (-1 = none yet). */
  count: number
  index: number
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
  /** Changes each time Find is asked for again: the field is focused and selected. */
  focusTick: number
  desktop: boolean
  /** Replace row: shown or not, its text, and the actions (the current match's item, or every page). */
  replaceOpen: boolean
  onToggleReplace: () => void
  replacement: string
  onReplacementChange: (text: string) => void
  onReplace: () => void
  onReplaceAll: () => void
}

/** Small find bar at the top centre. Enter = next, Shift+Enter = previous, Escape closes. It never covers the dock and only takes pointer input on itself. */
export function FindBar({ query, onQueryChange, count, index, onNext, onPrevious, onClose, focusTick, desktop, replaceOpen, onToggleReplace, replacement, onReplacementChange, onReplace, onReplaceAll }: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusTick])
  const shown = count === 0 ? 0 : Math.min(Math.max(index, 0) + 1, count)
  const hasQuery = query.trim().length > 0
  return (
    <div className="find-bar" role="search" aria-label="Find on the canvas">
      <div className="find-row">
      <input
        ref={inputRef}
        className="find-input"
        type="text"
        spellCheck={false}
        autoComplete="off"
        placeholder="Find"
        aria-label="Find text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
          if (event.key === 'Enter') { event.preventDefault(); if (event.shiftKey) onPrevious(); else onNext(); return }
          // Ctrl/Cmd+F again keeps the browser's own find bar away and selects the text.
          if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') { event.preventDefault(); inputRef.current?.select() }
          // Ctrl/Cmd+H shows the replace row (Chrome's History stays away).
          if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'h') { event.preventDefault(); if (!replaceOpen) onToggleReplace() }
        }}
      />
      <span className="find-count" aria-live="polite">{hasQuery ? `${shown} of ${count}` : ''}</span>
      <button type="button" className="find-button" aria-label="Previous match" title={desktop ? 'Previous match (Shift+Enter)' : 'Previous match'} disabled={count === 0} onClick={onPrevious}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>
      </button>
      <button type="button" className="find-button" aria-label="Next match" title={desktop ? 'Next match (Enter)' : 'Next match'} disabled={count === 0} onClick={onNext}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <button type="button" className={`find-button${replaceOpen ? ' is-on' : ''}`} aria-label="Replace" aria-pressed={replaceOpen} title={desktop ? 'Replace (Ctrl+H)' : 'Replace'} onClick={onToggleReplace}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h11l-3-3M19 16H8l3 3"/></svg>
      </button>
      <button type="button" className="find-button" aria-label="Close find" title={desktop ? 'Close (Esc)' : 'Close'} onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
      </button>
      </div>
      {replaceOpen && (
        <div className="find-row">
          <input
            className="find-input"
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="Replace with"
            aria-label="Replace with"
            value={replacement}
            onChange={(event) => onReplacementChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
              if (event.key === 'Enter') { event.preventDefault(); if (hasQuery && count > 0) { if (event.shiftKey || event.ctrlKey || event.metaKey) onReplaceAll(); else onReplace() } }
            }}
          />
          <button type="button" className="find-text-button" disabled={!hasQuery || count === 0} onClick={onReplace}>Replace</button>
          <button type="button" className="find-text-button" disabled={!hasQuery || count === 0} onClick={onReplaceAll}>Replace all</button>
        </div>
      )}
    </div>
  )
}
