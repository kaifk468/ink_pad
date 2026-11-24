import { useEffect, useMemo, useRef, useState } from 'react'
import { filterCommands, type PaletteEntry } from '../commandPalette'

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
  const results = useMemo(() => filterCommands(entries, query), [entries, query])
  const current = results.length === 0 ? -1 : Math.min(active, results.length - 1)

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    row?.scrollIntoView({ block: 'nearest' })
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
        <input
          className="command-palette-input"
          type="text"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder="Type a command"
          aria-label="Search commands"
          aria-controls="command-palette-list"
          aria-activedescendant={current >= 0 ? `command-palette-row-${current}` : undefined}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0) }}
        />
        <div ref={listRef} id="command-palette-list" className="command-palette-list" role="listbox" aria-label="Commands">
          {results.length === 0 && <p className="command-palette-empty">No matching commands</p>}
          {results.map((entry, index) => (
            <div
              key={entry.id}
              id={`command-palette-row-${index}`}
              className={`command-palette-row${index === current ? ' active' : ''}`}
              role="option"
              aria-selected={index === current}
              onPointerMove={() => { if (index !== current) setActive(index) }}
              onClick={() => run(entry.id)}
            >
              <span className="command-palette-label">{entry.label}<small>{entry.group}</small></span>
              {entry.keys && <kbd>{entry.keys}</kbd>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
