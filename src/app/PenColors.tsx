import type { CSSProperties } from 'react'
import { COLORS } from './appConfig'

/** The pen colours, always in view while the pen is the active tool (top right, left of the profile button). */
export function PenColors({ color, onColor }: { color: string; onColor: (value: string) => void }) {
  return (
    <div className="pen-colors" role="group" aria-label="Pen color">
      {COLORS.map((item) => (
        <button
          key={item.value}
          className={`pen-color${color === item.value ? ' selected' : ''}`}
          type="button"
          title={item.name}
          aria-label={item.name}
          aria-pressed={color === item.value}
          style={{ '--swatch': item.value } as CSSProperties}
          onClick={() => onColor(item.value)}
        />
      ))}
    </div>
  )
}
