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

// One Truchet tile: two quarter circles joining edge midpoints, turned one of two ways.
const tile = (x: number, y: number, turned: boolean) =>
  turned
    ? `M${x + 0.5} ${y}A.5 .5 0 0 0 ${x + 1} ${y + 0.5}M${x} ${y + 0.5}A.5 .5 0 0 1 ${x + 0.5} ${y + 1}`
    : `M${x + 0.5} ${y}A.5 .5 0 0 1 ${x} ${y + 0.5}M${x + 1} ${y + 0.5}A.5 .5 0 0 0 ${x + 0.5} ${y + 1}`

/**
 * The ornament of one seed at a width:height `ratio` (cards 2, banners 5, panels 0.8): grid size, field colour index,
 * the arcs as one path, and studs on some corners. The short side gets `base`..`base + 3` tiles.
 */
export function coverPattern(seed: string, ratio = 2, base = 6) {
  const next = random(seed)
  const short = base + Math.floor(next() * 4)
  const cols = ratio >= 1 ? Math.round(short * ratio) : short
  const rows = ratio >= 1 ? short : Math.round(short / ratio)
  const field = Math.floor(next() * 5)
  let path = ''
  const studs: [number, number][] = []
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      path += tile(x, y, next() < 0.5)
      if (next() < 0.14) studs.push([x, y])
    }
  return { cols, rows, field, path, studs }
}
