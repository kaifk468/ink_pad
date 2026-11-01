import { useEffect, useRef } from 'react'
import type { StorageInfo } from './app/useDocuments'
import { statusLabel, type SaveStatus } from './FilePanel'

export function storageLabel(storage: StorageInfo): string {
  if (storage.kind === 'drive') return 'Google Drive'
  if (storage.kind === 'device') return storage.folderName ? `Device folder “${storage.folderName}”` : 'Device folder'
  return 'This browser'
}

type StoragePanelProps = {
  storage: StorageInfo
  saveStatus: SaveStatus
  notice: string | null
  onClose: () => void
  onChooseDeviceFolder: () => void
  onReconnect: () => void
  onConnectDrive: () => void
  onUseBrowserStorage: () => void
  onCopyBrowserHere: () => void
}

/** Where all folders and diagrams live: this browser, a folder on the device, or the person's Google Drive. */
export function StoragePanel(props: StoragePanelProps) {
  const { storage } = props
  const latest = useRef(props)
  latest.current = props
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') latest.current.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="file-panel-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}>
      <section className="file-panel storage-panel" role="dialog" aria-modal="true" aria-label="Storage">
        <header className="file-panel-header">
          <strong>Storage</strong>
          <button type="button" className="file-panel-close" aria-label="Close" onClick={props.onClose}>×</button>
        </header>
        <p className="storage-current">Your folders and diagrams are saved in: <strong>{storageLabel(storage)}</strong></p>
        <p className={`file-panel-status status-${props.saveStatus}`} role="status">{statusLabel(props.saveStatus, storage.kind)}</p>
        {props.notice && <p className="file-panel-notice" role="alert">{props.notice}</p>}

        <div className="file-panel-storage">
          {storage.kind === 'browser' && <p className="file-panel-hint">Diagrams are saved in this browser only. The browser can clear them, and other devices cannot see them. Connect Google Drive or a device folder for anything important.</p>}
          {storage.kind === 'device' && !storage.locked && <p className="file-panel-hint">Folders you make in InkPad are real folders there, and each diagram is a .inkpad file.</p>}
          {storage.kind === 'device' && storage.locked && <p className="file-panel-notice" role="alert">Your device folder “{storage.folderName}” needs permission again after a restart. Nothing is being saved until you reconnect.</p>}
          {storage.kind === 'drive' && !storage.locked && <p className="file-panel-hint">Saved in a private InkPad area of your Google Drive that only this app can open (it does not appear in your normal Drive files). Folders and diagrams keep the same hierarchy on every device you sign in on.</p>}
          {storage.kind === 'drive' && storage.locked && <p className="file-panel-notice" role="alert">Google needs you to sign in again. Nothing is being saved until you do. Your drawing stays on screen.</p>}
          <div className="file-panel-actions">
            {storage.locked && <button type="button" className="file-panel-primary" onClick={props.onReconnect}>{storage.kind === 'drive' ? 'Sign in again' : 'Reconnect folder'}</button>}
            {storage.kind !== 'drive' && <button type="button" onClick={props.onConnectDrive}>Connect Google Drive…</button>}
            {storage.supported && <button type="button" onClick={props.onChooseDeviceFolder}>{storage.kind === 'device' ? 'Choose another folder…' : 'Use a device folder…'}</button>}
            {storage.kind !== 'browser' && !storage.locked && <button type="button" onClick={props.onCopyBrowserHere}>Copy browser diagrams here</button>}
            {storage.kind !== 'browser' && <button type="button" onClick={props.onUseBrowserStorage}>{storage.kind === 'drive' ? 'Disconnect Google Drive' : 'Use browser storage'}</button>}
          </div>
          {!storage.supported && <p className="file-panel-hint">A device folder needs Chrome or Edge on a secure (https) address.</p>}
        </div>
      </section>
    </div>
  )
}
