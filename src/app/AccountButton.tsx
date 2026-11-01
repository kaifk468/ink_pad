import { useEffect, useState } from 'react'

/** Top-right avatar. Placeholder: sign-in does not exist yet, so it only shows a "coming soon" note. */
export function AccountButton() {
  const [noteOpen, setNoteOpen] = useState(false)
  useEffect(() => {
    if (!noteOpen) return
    const timer = window.setTimeout(() => setNoteOpen(false), 2600)
    return () => window.clearTimeout(timer)
  }, [noteOpen])
  return (
    <div className="account-control">
      <button className="account-button" type="button" aria-label="Sign in, coming soon" aria-disabled="true" aria-expanded={noteOpen} title="Sign in, coming soon" onClick={() => setNoteOpen((value) => !value)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4.5 20c1.2-3.6 4-5 7.5-5s6.3 1.4 7.5 5"/></svg>
      </button>
      {noteOpen && <div className="account-note" role="status">Sign in, coming soon</div>}
    </div>
  )
}
