/**
 * Frame timing for one pen stroke, shown on screen with ?debug=on (works in the deployed build, no dev mode needed).
 *
 * The browser calls our animation-frame callback once per display frame, so the gap between two callbacks while the pen
 * is down is the closest a page can get to "how often did the screen get new ink". A long gap is a frame that was
 * late. Gaps over IDLE_GAP_MS are the pen pausing, not slowness, and are left out.
 */
export const IDLE_GAP_MS = 100
export const SLOW_GAP_MS = 20

export type FrameSummary = {
  frames: number
  gapP50: number
  gapP95: number
  gapMax: number
  /** Share of frames whose gap was over SLOW_GAP_MS, 0..1. */
  slowShare: number
  drawP50: number
  drawMax: number
  samplesPerFrame: number
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

export type FrameRecorder = {
  /** One animation-frame callback while the pen is down. `drawMs` is our own drawing time for that frame. */
  frame: (timestamp: number, drawMs: number) => void
  /** Pen samples that arrived (counted per pen move). */
  samples: (count: number) => void
  /** Ends the stroke: returns its summary (null if it had too few frames) and starts over. */
  finish: () => FrameSummary | null
}

export function createFrameRecorder(minFrames = 4): FrameRecorder {
  let last: number | null = null
  let gaps: number[] = []
  let draws: number[] = []
  let sampleCount = 0
  const reset = () => { last = null; gaps = []; draws = []; sampleCount = 0 }
  return {
    frame(timestamp, drawMs) {
      if (last !== null) {
        const gap = timestamp - last
        if (gap > 0 && gap <= IDLE_GAP_MS) gaps.push(gap)
      }
      last = timestamp
      draws.push(drawMs)
    },
    samples(count) { sampleCount += count },
    finish() {
      const frames = draws.length
      const result: FrameSummary | null = gaps.length >= minFrames
        ? (() => {
            const sortedGaps = gaps.slice().sort((a, b) => a - b)
            const sortedDraws = draws.slice().sort((a, b) => a - b)
            return {
              frames,
              gapP50: percentile(sortedGaps, 0.5),
              gapP95: percentile(sortedGaps, 0.95),
              gapMax: sortedGaps[sortedGaps.length - 1],
              slowShare: gaps.filter((gap) => gap > SLOW_GAP_MS).length / gaps.length,
              drawP50: percentile(sortedDraws, 0.5),
              drawMax: sortedDraws[sortedDraws.length - 1],
              samplesPerFrame: frames ? sampleCount / frames : 0,
            }
          })()
        : null
      reset()
      return result
    },
  }
}

export function formatFrameSummary(summary: FrameSummary): string {
  const ms = (value: number) => (value < 10 ? value.toFixed(1) : String(Math.round(value)))
  return `last stroke: gap ${ms(summary.gapP50)}/${ms(summary.gapP95)}/${ms(summary.gapMax)} ms (mid/95%/max) · slow ${Math.round(summary.slowShare * 100)}% · draw ${ms(summary.drawP50)}/${ms(summary.drawMax)} ms · ${summary.samplesPerFrame.toFixed(1)} samples/frame · ${summary.frames} frames`
}

/** The switches that change drawing, as "name=value" for the on-screen flags line. */
export function formatDrawFlags(flags: {
  directMax: number; live: 'whole' | 'incremental'; predict: boolean; thin: boolean; cache: boolean; desync: boolean
  cpu: boolean; dprCap: number | null; oneLayer: boolean; group: boolean; dirty: boolean; layerDom: boolean
}): string {
  return [
    `direct<=${flags.directMax}`,
    `live=${flags.live}`,
    `predict=${flags.predict ? 'on' : 'off'}`,
    `thin=${flags.thin ? 'on' : 'off'}`,
    `cache=${flags.cache ? 'on' : 'off'}`,
    `group=${flags.group ? 'on' : 'off'}`,
    `layers=${flags.oneLayer ? 'one' : 'two'}`,
    `canvas=${flags.cpu ? 'cpu' : 'gpu'}`,
    `dpr<=${flags.dprCap ?? 'any'}`,
    `dirty=${flags.dirty ? 'box' : 'full'}`,
    `layerdom=${flags.layerDom ? 'on' : 'off'}`,
    `desync=${flags.desync ? 'on' : 'off'}`,
  ].join(' · ')
}
