import type { ReactNode } from 'react'
import type { InputMode } from '../desktopInput'

/** Tablet (non-desktop) content left of the account button: exactly what it was before the desktop top bar existed (pen colours in Pen mode, else nothing). */
export function accountLeading(penModeActive: boolean, inputMode: InputMode, penColors: ReactNode): ReactNode {
  return penModeActive && inputMode !== 'desktop' ? penColors : undefined
}
