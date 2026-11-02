import { useState } from 'react'
import { displayName, initialsOf, type DriveProfile } from '../driveProfile'

type AccountButtonProps = {
  /** Who is signed in to Google Drive, when anyone is. */
  profile: DriveProfile | null
  /** Drive is the chosen storage but Google needs a tap before saving can continue. */
  needsReconnect: boolean
  onReconnect: () => void
  /** Opens the Storage panel. */
  onOpenStorage: () => void
}

/** The profile picture (or initials) for the avatar button; falls back to initials if the picture does not load. */
export function Avatar({ profile, className }: { profile: DriveProfile; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showPhoto = profile.photoUrl !== null && failedUrl !== profile.photoUrl
  return (
    <span className={`avatar${className ? ` ${className}` : ''}`} aria-hidden="true">
      {showPhoto
        ? <img src={profile.photoUrl as string} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setFailedUrl(profile.photoUrl)} />
        : <span className="avatar-initials">{initialsOf(profile)}</span>}
    </span>
  )
}

/** Top-right avatar. Shows the Google account's picture or initials when Drive is connected; a tap opens the Storage panel. */
export function AccountButton(props: AccountButtonProps) {
  const { profile } = props
  const name = profile ? displayName(profile) : null
  const label = name ? `${name}, Google Drive. Open storage` : 'Storage and account'
  return (
    <div className="account-control">
      {props.needsReconnect && <button className="reconnect-pill" type="button" onClick={props.onReconnect}>Reconnect Drive</button>}
      <button className={`account-button${profile ? ' has-profile' : ''}`} type="button" aria-label={label} title={name ?? 'Storage and account'} onClick={props.onOpenStorage}>
        {profile
          ? <Avatar profile={profile} />
          : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4.5 20c1.2-3.6 4-5 7.5-5s6.3 1.4 7.5 5"/></svg>}
      </button>
    </div>
  )
}
