import { EMBLEM } from './brand-emblem'

/** FNV-1a of the seed, then mulberry32: a small deterministic stream, the same on the server and in the browser. */
function random(seed: string): () => number {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The brand tones a cover is laid in (`.ab-cover[data-tone]` in globals.css): navy, orange, blue, sand, midnight. */
export const COVER_TONES = 5

// Per shape: the box, and the emblem's height as a share of the box height (from..to). A card crops the emblem
// past its edges; a list thumbnail is too small for a crop to read and an upright panel (a status page) shows the mark
// itself, so both draw the whole emblem: to the right in a thumb, centred in a panel.
const shapes = {
  card: { width: 160, height: 90, size: [1.2, 2.4] },
  thumb: { width: 160, height: 90, size: [0.78, 0.86] },
  panel: { width: 120, height: 150, size: [0.5, 0.5] },
} as const

export type CoverShape = keyof typeof shapes

/**
 * A cover without a picture, from its seed: the tone and where the emblem sits. The emblem always leans to the
 * right half and runs off an edge on a card, so a grid of covers reads as one series with different crops.
 */
export function coverLayout(seed: string, shape: CoverShape) {
  const next = random(seed)
  const { width, height, size } = shapes[shape]
  const tone = Math.floor(next() * COVER_TONES)
  const scale = (height * (size[0] + next() * (size[1] - size[0]))) / EMBLEM.height
  const w = EMBLEM.width * scale
  const h = EMBLEM.height * scale
  if (shape !== 'card') {
    const x = width * (shape === 'thumb' ? 0.72 : 0.5) - w / 2
    return {
      width,
      height,
      tone,
      transform: `translate(${x.toFixed(2)} ${((height - h) / 2).toFixed(2)}) scale(${scale.toFixed(4)})`,
    }
  }
  // The left edge between a third and two thirds across, the top above the box: the bigger the emblem, the further it
  // shifts, so one cover shows the A, another the curls.
  const x = width * (0.32 + next() * 0.3)
  const y = (height - h) * (0.15 + next() * 0.7)
  return { width, height, tone, transform: `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)})` }
}
