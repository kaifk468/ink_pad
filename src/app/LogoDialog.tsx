import { useEffect } from 'react'
import type { TechLogo } from '../techLogoSearch'
import { LogoPicker } from './LogoPicker'

type LogoDialogProps = { onInsert: (logo: TechLogo, showName: boolean) => void; onClose: () => void }

/** "Insert logo…" (command palette): the tech logo picker in a small dialog. Escape, the close button or a click outside closes it; picking a logo inserts it and closes. */
export function LogoDialog({ onInsert, onClose }: LogoDialogProps) {
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
      <section className="file-panel logo-dialog" role="dialog" aria-modal="true" aria-label="Insert logo">
        <header className="file-panel-header">
          <strong>Insert logo</strong>
          <button type="button" className="file-panel-close" aria-label="Close" title="Close (Esc)" onClick={onClose}>×</button>
        </header>
        <LogoPicker autoFocus labelled onInsert={(logo, showName) => { onInsert(logo, showName); onClose() }} />
      </section>
    </div>
  )
}
