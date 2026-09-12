import { describe, expect, it } from 'vitest'
import { describeUserAgent } from '@/lib/user-agent'

describe('describeUserAgent', () => {
  it('names browser and system', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome · Windows')
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari · iOS')
    expect(describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0')).toBe('Firefox · Linux')
    // Critic 9: headless Chrome fell through to Safari.
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome · Windows')
  })
  it('falls back to null for API clients', () => {
    expect(describeUserAgent('node')).toBeNull()
    expect(describeUserAgent('')).toBeNull()
    expect(describeUserAgent(null)).toBeNull()
  })
})
