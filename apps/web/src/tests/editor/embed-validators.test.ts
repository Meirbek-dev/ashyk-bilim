/**
 * Unit tests for embed-validators.ts
 * Covers specific examples for each validator and the src builder helpers.
 */
import { describe, expect, it } from 'vitest'
import {
  parseYouTubeUrl,
  validateExcalidrawUrl,
  buildExcalidrawSrc,
  validateTldrawUrl,
  buildTldrawSrc,
} from '../../components/Objects/Editor/Extensions/EmbedBlock/embed-validators'

// ---------------------------------------------------------------------------
// parseYouTubeUrl
// ---------------------------------------------------------------------------

describe('parseYouTubeUrl', () => {
  describe('valid formats', () => {
    it('extracts ID from watch?v= URL', () => {
      expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('extracts ID from youtu.be short URL', () => {
      expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('extracts ID from /embed/ URL', () => {
      expect(parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('extracts ID from /shorts/ URL', () => {
      expect(parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('accepts youtube.com (without www) for watch?v=', () => {
      expect(parseYouTubeUrl('https://youtube.com/watch?v=abc123')).toBe('abc123')
    })
  })

  describe('invalid inputs', () => {
    it('returns null for empty string', () => {
      expect(parseYouTubeUrl('')).toBeNull()
    })

    it('returns null for non-URL string', () => {
      expect(parseYouTubeUrl('not a url')).toBeNull()
    })

    it('returns null for wrong hostname', () => {
      expect(parseYouTubeUrl('https://vimeo.com/watch?v=abc')).toBeNull()
    })

    it('returns null for youtube.com root path', () => {
      expect(parseYouTubeUrl('https://www.youtube.com/')).toBeNull()
    })

    it('returns null for watch URL with missing v param', () => {
      expect(parseYouTubeUrl('https://www.youtube.com/watch')).toBeNull()
    })

    it('returns null for watch URL with empty v param', () => {
      expect(parseYouTubeUrl('https://www.youtube.com/watch?v=')).toBeNull()
    })

    it('returns null for youtu.be with no path', () => {
      expect(parseYouTubeUrl('https://youtu.be/')).toBeNull()
    })

    it('returns null for /embed/ with no ID', () => {
      expect(parseYouTubeUrl('https://www.youtube.com/embed/')).toBeNull()
    })

    it('returns null for /shorts/ with no ID', () => {
      expect(parseYouTubeUrl('https://www.youtube.com/shorts/')).toBeNull()
    })

    it('returns null for malformed URL', () => {
      expect(parseYouTubeUrl('http://')).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// validateExcalidrawUrl
// ---------------------------------------------------------------------------

describe('validateExcalidrawUrl', () => {
  it('returns errorEmpty for empty string', () => {
    expect(validateExcalidrawUrl('')).toBe('errorEmpty')
  })

  it('returns errorEmpty for whitespace-only string', () => {
    expect(validateExcalidrawUrl('   ')).toBe('errorEmpty')
  })

  it('returns null for valid excalidraw.com URL', () => {
    expect(validateExcalidrawUrl('https://excalidraw.com/#room=abc,key')).toBeNull()
  })

  it('returns null for excalidraw.com URL with path', () => {
    expect(validateExcalidrawUrl('https://excalidraw.com/some/path')).toBeNull()
  })

  it('returns errorInvalid for wrong hostname', () => {
    expect(validateExcalidrawUrl('https://example.com/path')).toBe('errorInvalid')
  })

  it('returns errorInvalid for subdomain of excalidraw.com', () => {
    expect(validateExcalidrawUrl('https://app.excalidraw.com/path')).toBe('errorInvalid')
  })

  it('returns errorInvalid for non-URL string', () => {
    expect(validateExcalidrawUrl('not a url')).toBe('errorInvalid')
  })

  it('returns errorInvalid for relative URL', () => {
    expect(validateExcalidrawUrl('/some/path')).toBe('errorInvalid')
  })
})

// ---------------------------------------------------------------------------
// buildExcalidrawSrc
// ---------------------------------------------------------------------------

describe('buildExcalidrawSrc', () => {
  it('appends ?embed=1 when no query string present', () => {
    expect(buildExcalidrawSrc('https://excalidraw.com/#room=abc')).toBe('https://excalidraw.com/#room=abc?embed=1')
  })

  it('appends &embed=1 when query string already present', () => {
    expect(buildExcalidrawSrc('https://excalidraw.com/path?foo=bar')).toBe(
      'https://excalidraw.com/path?foo=bar&embed=1',
    )
  })
})

// ---------------------------------------------------------------------------
// validateTldrawUrl
// ---------------------------------------------------------------------------

describe('validateTldrawUrl', () => {
  it('returns errorEmpty for empty string', () => {
    expect(validateTldrawUrl('')).toBe('errorEmpty')
  })

  it('returns errorEmpty for whitespace-only string', () => {
    expect(validateTldrawUrl('   ')).toBe('errorEmpty')
  })

  it('returns null for valid tldraw.com /r/<room-id> URL', () => {
    expect(validateTldrawUrl('https://tldraw.com/r/my-room')).toBeNull()
  })

  it('returns errorInvalid for wrong hostname', () => {
    expect(validateTldrawUrl('https://example.com/r/room')).toBe('errorInvalid')
  })

  it('returns errorInvalid for subdomain of tldraw.com', () => {
    expect(validateTldrawUrl('https://app.tldraw.com/r/room')).toBe('errorInvalid')
  })

  it('returns errorInvalid for tldraw.com without /r/ path', () => {
    expect(validateTldrawUrl('https://tldraw.com/some/path')).toBe('errorInvalid')
  })

  it('returns errorInvalid for tldraw.com with /r/ but no room ID', () => {
    expect(validateTldrawUrl('https://tldraw.com/r/')).toBe('errorInvalid')
  })

  it('returns errorInvalid for tldraw.com with /r/ and extra path segments', () => {
    expect(validateTldrawUrl('https://tldraw.com/r/room/extra')).toBe('errorInvalid')
  })

  it('returns errorInvalid for non-URL string', () => {
    expect(validateTldrawUrl('not a url')).toBe('errorInvalid')
  })

  it('returns errorInvalid for relative URL', () => {
    expect(validateTldrawUrl('/r/room')).toBe('errorInvalid')
  })
})

// ---------------------------------------------------------------------------
// buildTldrawSrc
// ---------------------------------------------------------------------------

describe('buildTldrawSrc', () => {
  it('appends ?embed=1 when no query string present', () => {
    expect(buildTldrawSrc('https://tldraw.com/r/my-room')).toBe('https://tldraw.com/r/my-room?embed=1')
  })

  it('appends &embed=1 when query string already present', () => {
    expect(buildTldrawSrc('https://tldraw.com/r/my-room?foo=bar')).toBe('https://tldraw.com/r/my-room?foo=bar&embed=1')
  })
})
