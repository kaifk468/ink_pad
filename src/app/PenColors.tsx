import type { CSSProperties } from 'react'
import { COLORS } from './appConfig'
import { penColorsForBoard } from '../boardColors'
import type { BoardTheme } from '../boardStyle'

/** The pen colours, always in view while the pen is the active tool (top right, left of the profile button). */
export function PenColors({ color, onColor, theme = 'light' }: { color: string; onColor: (value: string) => void; theme?: BoardTheme }) {
  return (
    <div className="pen-colors" role="group" aria-label="Pen color">
      {penColorsForBoard(theme, COLORS).map((item) => (
        <button
          key={item.value}
          className={`pen-color${color === item.value ? ' selected' : ''}`}
          type="button"
          title={item.name}
          aria-label={item.name}
          aria-pressed={color === item.value}
          style={{ '--swatch': item.display, '--swatch-ring': theme === 'light' ? undefined : 'rgba(36, 42, 52, .35)' } as CSSProperties}
          onClick={() => onColor(item.value)}
        />
      ))}
    </div>
  )
}
