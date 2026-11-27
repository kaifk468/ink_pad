import { useEffect, useMemo, useRef, useState } from 'react'
import { diagramIdFromEntry, filterCommands, groupPaletteEntries, splitCommandLabel, type PaletteEntry } from '../commandPalette'

type CommandPaletteProps = {
  entries: readonly PaletteEntry[]
  /** Called with the chosen entry's id. The palette closes itself (onClose) before this runs. */
  onRun: (id: string) => void
  onClose: () => void
}

/** Desktop command palette (Ctrl/Cmd+K): a search field over the list of commands. Arrows move, Enter runs, Escape or a click outside closes. */
export function CommandPalette({ entries, onRun, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const searching = query.trim() !== ''
  const groups = useMemo(() => (searching ? null : groupPaletteEntries(entries)), [entries, searching])
  // Empty query: grouped (each group contiguous, so arrows follow what is drawn). With a query: flat, ranked.
  const results = useMemo(() => (groups ? groups.flatMap((group) => group.entries) : filterCommands(entries, query)), [groups, entries, query])
  const indexOf = useMemo(() => new Map(results.map((entry, position) => [entry, position] as const)), [results])
  const current = results.length === 0 ? -1 : Math.min(active, results.length - 1)

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (current === 0 && listRef.current) listRef.current.scrollTop = 0 // wrapping to the first row shows its group title too
    else row?.scrollIntoView({ block: 'nearest' })
  }, [current, results])

  const run = (id: string) => {
    onClose() // closed first, so the command's own checks (no dialog open) pass
    onRun(id)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k')) { event.preventDefault(); onClose(); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + results.length) % results.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (current >= 0) run(results[current].id)
    }
  }

  return (
    <div className="file-panel-backdrop command-palette-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="command-palette-search">
          <svg className="command-palette-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            className="command-palette-input"
            type="text"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            placeholder="Search commands and diagrams"
            aria-label="Search commands"
            aria-controls="command-palette-list"
            aria-activedescendant={current >= 0 ? `command-palette-row-${current}` : undefined}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0) }}
          />
          <kbd className="command-palette-esc" aria-hidden="true">Esc</kbd>
        </div>
        <div ref={listRef} id="command-palette-list" className="command-palette-list" role="listbox" aria-label="Commands">
          {results.length === 0 && <p className="command-palette-empty">No commands match “{query.trim()}”</p>}
          {(groups ?? [{ group: '', entries: results }]).map((bucket) => (
            <div key={bucket.group || 'results'} className="command-palette-group" role={groups ? 'group' : 'presentation'} aria-labelledby={groups ? `command-palette-group-${bucket.group}` : undefined}>
              {groups && <div id={`command-palette-group-${bucket.group}`} className="command-palette-group-title">{bucket.group}</div>}
              {bucket.entries.map((entry) => {
                const index = indexOf.get(entry) ?? -1
                const { title, detail } = diagramIdFromEntry(entry.id) ? { title: entry.label, detail: '' } : splitCommandLabel(entry.label)
                const sub = [detail, entry.hint].filter(Boolean).join(' · ')
                return (
                  <div
                    key={entry.id}
                    id={`command-palette-row-${index}`}
                    className={`command-palette-row${index === current ? ' active' : ''}`}
                    role="option"
                    aria-selected={index === current}
                    onPointerMove={() => { if (index !== current) setActive(index) }}
                    onClick={() => run(entry.id)}
                  >
                    <span className="command-palette-label"><span className="command-palette-title">{title}</span>{sub && <small className="command-palette-detail">{sub}</small>}</span>
                    {!groups && <span className="command-palette-group-chip">{entry.group}</span>}
                    {entry.keys && <kbd>{entry.keys}</kbd>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
