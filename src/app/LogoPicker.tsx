import { useEffect, useRef, useState } from 'react'
import { loadedTechLogos, loadTechLogos } from '../techLogos'
import { searchTechLogos } from '../techLogoSearch'
import type { TechLogo } from '../techLogoSearch'

type LogoPickerProps = {
  /** Inserts one logo box (with its name label when `showName`). */
  onInsert: (logo: TechLogo, showName: boolean) => void
  /** Search text owned by the host (the shape search field of a tray). When given, this picker has no search field of its own and shows only matches (at most 12). */
  externalQuery?: string
  /** Focus the search field when it appears (desktop only: it would pop up the tablet keyboard). */
  autoFocus?: boolean
  /** Tablet: 48px buttons (touch targets of at least 44px). */
  touch?: boolean
  /** Desktop dialog: named tiles, a result count beside the "Show name" switch, the first match marked as the Enter target. */
  labelled?: boolean
}

const EXTERNAL_LIMIT = 12

/** Shown with the logo picker and in the keyboard shortcut dialog. */
export const LOGO_CREDIT = 'Logos: Simple Icons (CC0; a few keep their own Apache-2.0, MIT or BSD licence). Brand names and logos belong to their owners.'

/** Tech logos (Simple Icons, built into the app): a search field, a "Show name" switch and a grid of brand buttons. Shared by the desktop More shapes tray and the tablet Insert tray. */
export function LogoPicker({ onInsert, externalQuery, autoFocus, touch, labelled }: LogoPickerProps) {
  const [logos, setLogos] = useState<readonly TechLogo[] | null>(loadedTechLogos)
  const [failed, setFailed] = useState(false)
  const [ownQuery, setOwnQuery] = useState('')
  const [showName, setShowName] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)
  const external = externalQuery !== undefined
  const query = external ? externalQuery : ownQuery

  useEffect(() => {
    if (logos) return
    let alive = true
    loadTechLogos().then((table) => { if (alive) setLogos(table) }, () => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [logos])
  useEffect(() => { if (autoFocus && !external) searchRef.current?.focus() }, [autoFocus, external])

  const shown = logos ? searchTechLogos(query, logos, external ? EXTERNAL_LIMIT : Infinity) : []
  return (
    <div className={`logo-picker${touch ? ' logo-picker-touch' : ''}`} role="group" aria-label="Tech logos">
      {!external && <input
        ref={searchRef}
        className="shape-search-field logo-search-field"
        type="search"
        aria-label="Search logos"
        placeholder="Search logos (kafka, postgres…)"
        value={ownQuery}
        onChange={(event) => setOwnQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && shown[0]) { event.preventDefault(); onInsert(shown[0], showName) }
        }}
      />}
      {labelled && !external && logos && <div className="logo-meta-row">
        <span className="logo-count" role="status">{shown.length === 0 ? '' : query.trim() ? `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}` : `${shown.length} logos`}{shown.length > 0 && query.trim() ? <> · <kbd>Enter</kbd> inserts the first</> : null}</span>
        <label className="logo-name-toggle"><input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} /><span>Show name</span></label>
      </div>}
      {!labelled && !external && <label className="logo-name-toggle"><input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} /><span>Show name</span></label>}
      {!external && failed && <div className="shape-search-empty" role="status">Logos could not load</div>}
      {!external && !failed && !logos && <div className="shape-search-empty" role="status">Loading logos…</div>}
      {!external && logos && shown.length === 0 && <div className="shape-search-empty" role="status">{labelled ? <>No logo for “{query.trim()}”. Try a product name, like postgres or redis.</> : 'No logo matches'}</div>}
      {external && shown.length > 0 && <div className="insert-tray-heading">Tech logos</div>}
      <div className={`logo-grid${labelled ? ' logo-grid-labelled' : ''}`}>
        {shown.map((logo, index) => (
          <button className={`logo-button${labelled && index === 0 && query.trim() ? ' logo-button-first' : ''}`} type="button" key={logo.slug} aria-label={logo.title} title={logo.title} onClick={() => onInsert(logo, showName)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={logo.path} /></svg>
            {labelled && <span className="logo-button-name" aria-hidden="true">{logo.title.replace(/^Apache /, "")}</span>}
          </button>
        ))}
      </div>
      {!external && <p className="logo-credit">{LOGO_CREDIT}</p>}
    </div>
  )
}
