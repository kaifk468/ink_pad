import { useState } from 'react'
import { LANE_MAX_COUNT, LANE_MIN_COUNT, LANE_NAME_MAX_LENGTH, laneCount, laneDir, laneNames, type LaneSettings } from '../canvasLanes'
import { MARK_STRENGTHS, markStrength, type MarkStrength } from '../pageTemplates'

/** `menu` = the tablet menu panel (touch sized, >= 44px), `ms` = the Desktop menu sheet (compact). Class names: <prefix>-setting, -setting-label, -segments, -segment. */
export type ControlsVariant = 'menu' | 'ms'

/** Mark strength: Faint / Normal / Bold for the dots, lines and lane borders of this diagram. */
export function MarksControl(props: { variant: ControlsVariant; marks: string | undefined; onMarks?: (strength: MarkStrength) => void }) {
  const p = props.variant
  const current = markStrength(props.marks)
  return (
    <div className={`${p}-setting`} role="group" aria-label="Mark strength">
      <span className={`${p}-setting-label`}>Marks</span>
      <div className={`${p}-segments lane-touch`}>
        {MARK_STRENGTHS.map(({ id, label }) => (
          <button key={id} className={`${p}-segment${current === id ? ' selected' : ''}`} type="button" aria-pressed={current === id} onClick={() => props.onMarks?.(id)}>{label}</button>
        ))}
      </div>
    </div>
  )
}

/** One lane name field: edits stay local until Enter or blur, then are saved (the field's text is cleaned by the saver). */
function LaneNameInput(props: { index: number; value: string; onCommit: (index: number, value: string) => void }) {
  const [draft, setDraft] = useState(props.value)
  const [seen, setSeen] = useState(props.value)
  // A saved change from outside (another diagram, a cleaned value) replaces the draft.
  if (seen !== props.value) { setSeen(props.value); setDraft(props.value) }
  const commit = () => { if (draft !== props.value) props.onCommit(props.index, draft) }
  return (
    <input className="lane-name-input" type="text" value={draft} maxLength={LANE_NAME_MAX_LENGTH} placeholder={`Lane ${props.index + 1}`} aria-label={`Lane ${props.index + 1} name`}
      autoComplete="off" spellCheck={false}
      onChange={(event) => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur() } }} />
  )
}

/** Lane settings of the Lanes canvas: Rows / Columns, lane count (2..8) and one name field per lane. Not undo steps; they autosave. */
export function LaneControls(props: { variant: ControlsVariant; lanes: LaneSettings | undefined; onLanes?: (patch: LaneSettings) => void }) {
  const p = props.variant
  const dir = laneDir(props.lanes)
  const count = laneCount(props.lanes)
  const names = laneNames(props.lanes)
  const setNames = (index: number, value: string) => {
    const stored: unknown = props.lanes?.names
    const next: string[] = Array.isArray(stored) ? stored.map((name) => (typeof name === 'string' ? name : '')) : []
    while (next.length < LANE_MAX_COUNT) next.push('')
    next[index] = value
    props.onLanes?.({ names: next })
  }
  return (
    <>
      <div className={`${p}-setting`} role="group" aria-label="Lane direction">
        <span className={`${p}-setting-label`}>Lane direction</span>
        <div className={`${p}-segments two lane-touch`}>
          {([['rows', 'Rows'], ['columns', 'Columns']] as const).map(([id, label]) => (
            <button key={id} className={`${p}-segment${dir === id ? ' selected' : ''}`} type="button" aria-pressed={dir === id} onClick={() => props.onLanes?.({ dir: id })}>{label}</button>
          ))}
        </div>
      </div>
      <div className={`${p}-setting`} role="group" aria-label="Number of lanes">
        <span className={`${p}-setting-label`}>Number of lanes</span>
        <div className="lane-stepper">
          <button type="button" aria-label="Fewer lanes" disabled={count <= LANE_MIN_COUNT} onClick={() => props.onLanes?.({ count: count - 1 })}>−</button>
          <output aria-live="polite">{count}</output>
          <button type="button" aria-label="More lanes" disabled={count >= LANE_MAX_COUNT} onClick={() => props.onLanes?.({ count: count + 1 })}>+</button>
        </div>
      </div>
      <div className={`${p}-setting`} role="group" aria-label="Lane names">
        <span className={`${p}-setting-label`}>Lane names</span>
        <div className="lane-names">
          {names.map((name, index) => <LaneNameInput key={index} index={index} value={name} onCommit={setNames} />)}
        </div>
      </div>
    </>
  )
}
