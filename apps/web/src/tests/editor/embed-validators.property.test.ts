/**
 * Property-based tests for embed-validators.ts
 * Uses fast-check to verify universal correctness properties.
 *
 * Feature: rich-text-editor
 */
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  validateTldrawUrl,
  buildTldrawSrc,
} from '../../components/Objects/Editor/Extensions/EmbedBlock/embed-validators'

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a non-empty room ID string safe for use in a URL path segment.
 * Uses alphanumeric characters and hyphens — common in real room IDs.
 */
const arbRoomId = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,29}$/)

/**
 * Generates a valid tldraw share URL: https://tldraw.com/r/<roomId>
 */
const arbValidTldrawUrl = arbRoomId.map(roomId => `https://tldraw.com/r/${roomId}`)

/**
 * Generates a valid tldraw share URL that already has a query string.
 */
const arbValidTldrawUrlWithQuery = fc
  .tuple(arbRoomId, fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,9}$/), fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/))
  .map(([roomId, key, value]) => `https://tldraw.com/r/${roomId}?${key}=${value}`)

// ---------------------------------------------------------------------------
// Property 5: tldraw URL validation produces correct specific errors
// Validates: Requirements 6.3
// ---------------------------------------------------------------------------

// Feature: rich-text-editor, Property 5: tldraw URL validation produces correct specific errors
describe('Property 5: validateTldrawUrl returns correct error key for any string input', () => {
  it('returns errorEmpty for empty string', () => {
    expect(validateTldrawUrl('')).toBe('errorEmpty')
  })

  it('returns errorEmpty for any whitespace-only string', () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(' ', '\t', '\n', '\r'),
          minLength: 1,
          maxLength: 20,
        }),
        url => {
          expect(validateTldrawUrl(url)).toBe('errorEmpty')
        },
      ),
      { numRuns: 50 },
    )
  })

  it('returns errorInvalid for non-URL strings (non-empty, non-whitespace)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => {
          if (s.trim() === '') return false
          try {
            new URL(s)
            return false // exclude valid URLs
          } catch {
            return true
          }
        }),
        url => {
          expect(validateTldrawUrl(url)).toBe('errorInvalid')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns errorInvalid for valid absolute URLs with wrong hostname (not tldraw.com)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'https://example.com/r/room',
          'https://app.tldraw.com/r/room',
          'https://www.tldraw.com/r/room',
          'https://tldraw.io/r/room',
          'https://youtube.com/r/room',
          'https://excalidraw.com/r/room',
          'https://google.com/r/room',
          'https://tldraw.net/r/room',
        ),
        url => {
          expect(validateTldrawUrl(url)).toBe('errorInvalid')
        },
      ),
      { numRuns: 50 },
    )
  })

  it('returns errorInvalid for tldraw.com URLs with invalid path (not /r/<room-id>)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'https://tldraw.com/',
          'https://tldraw.com/r/',
          'https://tldraw.com/r/room/extra',
          'https://tldraw.com/some/path',
          'https://tldraw.com/room',
          'https://tldraw.com/r',
          'https://tldraw.com/r/room/sub/path',
        ),
        url => {
          expect(validateTldrawUrl(url)).toBe('errorInvalid')
        },
      ),
      { numRuns: 50 },
    )
  })

  it('returns null for valid tldraw.com URLs with /r/<room-id> path', () => {
    fc.assert(
      fc.property(arbValidTldrawUrl, url => {
        expect(validateTldrawUrl(url)).toBeNull()
      }),
      { numRuns: 100 },
    )
  })

  it('returns the correct value for any arbitrary string (complete property)', () => {
    fc.assert(
      fc.property(fc.string(), url => {
        const result = validateTldrawUrl(url)

        if (url.trim() === '') {
          expect(result).toBe('errorEmpty')
        } else {
          let parsed: URL
          try {
            parsed = new URL(url)
          } catch {
            expect(result).toBe('errorInvalid')
            return
          }

          const isValidPath = /^\/r\/[^/]+$/.test(parsed.pathname)
          if (parsed.hostname === 'tldraw.com' && isValidPath) {
            expect(result).toBeNull()
          } else {
            expect(result).toBe('errorInvalid')
          }
        }
      }),
      { numRuns: 200 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 6: tldraw iframe src is always the stored URL with `?embed=1` appended
// Validates: Requirements 6.2
// ---------------------------------------------------------------------------

// Feature: rich-text-editor, Property 6: tldraw iframe src is always url + ?embed=1
describe('Property 6: buildTldrawSrc appends ?embed=1 correctly for any valid tldraw URL', () => {
  it('appends ?embed=1 when URL has no query string', () => {
    fc.assert(
      fc.property(arbValidTldrawUrl, url => {
        // arbValidTldrawUrl never includes '?' so this always holds
        expect(url.includes('?')).toBe(false)
        const src = buildTldrawSrc(url)
        expect(src).toBe(`${url}?embed=1`)
      }),
      { numRuns: 100 },
    )
  })

  it('appends &embed=1 when URL already has a query string', () => {
    fc.assert(
      fc.property(arbValidTldrawUrlWithQuery, url => {
        expect(url.includes('?')).toBe(true)
        const src = buildTldrawSrc(url)
        expect(src).toBe(`${url}&embed=1`)
      }),
      { numRuns: 100 },
    )
  })

  it('src always equals url + ?embed=1 (no query) or url + &embed=1 (with query)', () => {
    fc.assert(
      fc.property(fc.oneof(arbValidTldrawUrl, arbValidTldrawUrlWithQuery), url => {
        const src = buildTldrawSrc(url)
        const expected = url.includes('?') ? `${url}&embed=1` : `${url}?embed=1`
        expect(src).toBe(expected)
      }),
      { numRuns: 200 },
    )
  })

  it('src always ends with embed=1', () => {
    fc.assert(
      fc.property(fc.oneof(arbValidTldrawUrl, arbValidTldrawUrlWithQuery), url => {
        const src = buildTldrawSrc(url)
        expect(src.endsWith('embed=1')).toBe(true)
      }),
      { numRuns: 200 },
    )
  })
})
