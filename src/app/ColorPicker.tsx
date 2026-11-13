import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { addRecentColor, hexToHsv, hsvToHex, loadRecentColors, parseHex, saveRecentColors } from '../colorUtils'
import './ColorPicker.css'

export interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  onCommit: (hex: string) => void
  recent?: string[]
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function ColorPicker({ value, onChange, onCommit, recent }: ColorPickerProps) {
  const current = parseHex(value) ?? '#000000'
  const [hsv, setHsv] = useState(() => hexToHsv(current))
  const [text, setText] = useState(current)
  const [invalid, setInvalid] = useState(false)
  const [recents, setRecents] = useState<string[]>(() => recent ?? loadRecentColors())
  const hsvRef = useRef(hsv)
  const dragging = useRef<'sv' | 'hue' | null>(null)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  // Follow external value changes, keeping hue when the colour is grey/black (hue is undefined there).
  useEffect(() => {
    if (hsvToHex(hsvRef.current.h, hsvRef.current.s, hsvRef.current.v) === current) return
    const next = hexToHsv(current)
    const keepHue = next.s === 0 || next.v === 0
    const merged = keepHue ? { ...next, h: hsvRef.current.h } : next
    hsvRef.current = merged
    setHsv(merged)
    setText(current)
    setInvalid(false)
  }, [current])

  const apply = (next: { h: number; s: number; v: number }) => {
    hsvRef.current = next
    setHsv(next)
    const hex = hsvToHex(next.h, next.s, next.v)
    setText(hex)
    setInvalid(false)
    onChange(hex)
  }
  const commit = (hex: string) => {
    const list = addRecentColor(loadRecentColors(), hex)
    saveRecentColors(list)
    setRecents(list)
    onCommit(hex)
  }
  const commitCurrent = () => commit(hsvToHex(hsvRef.current.h, hsvRef.current.s, hsvRef.current.v))

  const fromPointer = (kind: 'sv' | 'hue', e: ReactPointerEvent) => {
    const el = (kind === 'sv' ? svRef : hueRef).current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1)
    if (kind === 'hue') apply({ ...hsvRef.current, h: x * 360 })
    else apply({ ...hsvRef.current, s: x, v: 1 - clamp((e.clientY - r.top) / Math.max(1, r.height), 0, 1) })
  }
  const handlers = (kind: 'sv' | 'hue') => ({
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.currentTarget.focus()
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
      dragging.current = kind
      fromPointer(kind, e)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragging.current === kind) fromPointer(kind, e)
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragging.current !== kind) return
      dragging.current = null
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
      commitCurrent()
    },
    onPointerCancel: () => {
      if (dragging.current === kind) { dragging.current = null; commitCurrent() }
    },
  })

  const keyStep = (e: ReactKeyboardEvent) => (e.shiftKey ? 0.1 : 0.01)
  const onSvKey = (e: ReactKeyboardEvent) => {
    const k = keyStep(e)
    const { h, s, v } = hsvRef.current
    const next =
      e.key === 'ArrowLeft' ? { h, s: clamp(s - k, 0, 1), v } :
      e.key === 'ArrowRight' ? { h, s: clamp(s + k, 0, 1), v } :
      e.key === 'ArrowUp' ? { h, s, v: clamp(v + k, 0, 1) } :
      e.key === 'ArrowDown' ? { h, s, v: clamp(v - k, 0, 1) } : null
    if (!next) return
    e.preventDefault()
    apply(next)
    commitCurrent()
  }
  const onHueKey = (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 15 : 2
    const { h, s, v } = hsvRef.current
    const nh = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? clamp(h - step, 0, 360) : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? clamp(h + step, 0, 360) : null
    if (nh === null) return
    e.preventDefault()
    apply({ h: nh, s, v })
    commitCurrent()
  }

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v)
  const commitText = () => {
    const parsed = parseHex(text)
    if (!parsed) { setInvalid(true); return }
    setInvalid(false)
    setText(parsed)
    if (parsed !== hex) {
      const next = hexToHsv(parsed)
      const merged = next.s === 0 || next.v === 0 ? { ...next, h: hsvRef.current.h } : next
      hsvRef.current = merged
      setHsv(merged)
      onChange(parsed)
    }
    commit(parsed)
  }
  const shown = recent ?? recents

  return (
    <div className="color-picker">
      <div
        ref={svRef}
        className="color-picker__sv"
        role="slider"
        tabIndex={0}
        aria-label="Colour saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)} percent, brightness ${Math.round(hsv.v * 100)} percent`}
        style={{ backgroundColor: hsvToHex(hsv.h, 1, 1) }}
        onKeyDown={onSvKey}
        {...handlers('sv')}
      >
        <span className="color-picker__thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div
        ref={hueRef}
        className="color-picker__hue"
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        aria-valuetext={`Hue ${Math.round(hsv.h)} degrees`}
        onKeyDown={onHueKey}
        {...handlers('hue')}
      >
        <span className="color-picker__thumb" style={{ left: `${(hsv.h / 360) * 100}%`, top: '50%', background: hsvToHex(hsv.h, 1, 1) }} />
      </div>
      <div className="color-picker__row">
        <span className="color-picker__swatch color-picker__swatch--current" style={{ background: hex }} aria-hidden="true" />
        <label className="color-picker__label" htmlFor="color-picker-hex" style={{ display: 'contents' }}>
          <span className="color-picker__label">Hex</span>
          <input
            id="color-picker-hex"
            className="color-picker__hex"
            value={text}
            spellCheck={false}
            maxLength={7}
            aria-invalid={invalid}
            onChange={(e) => { setText(e.target.value); setInvalid(false) }}
            onBlur={commitText}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitText() } }}
          />
        </label>
      </div>
      <div>
        <div className="color-picker__label">Recent</div>
        <div className="color-picker__recent">
          {shown.slice(0, 8).map((c) => (
            <button
              key={c}
              type="button"
              className="color-picker__swatch"
              style={{ background: c }}
              aria-label={`Use ${c}`}
              aria-pressed={c === hex}
              onClick={() => {
                const next = hexToHsv(c)
                const merged = next.s === 0 || next.v === 0 ? { ...next, h: hsvRef.current.h } : next
                hsvRef.current = merged
                setHsv(merged)
                setText(c)
                setInvalid(false)
                onChange(c)
                commit(c)
              }}
            />
          ))}
          {shown.length === 0 && <span className="color-picker__empty">None yet</span>}
        </div>
      </div>
    </div>
  )
}
