import { describe, expect, it } from 'vite-plus/test'
import { csvField } from '@/lib/download'

// BUG-196 (web mirror): client-side CSV exports defuse spreadsheet formulas.
describe('csvField', () => {
  it('quotes and defuses formula-leading cells', () => {
    expect(csvField('=HYPERLINK("http://evil","x") +1-1')).toBe(`"'=HYPERLINK(""http://evil"",""x"") +1-1"`)
    expect(csvField('+1')).toBe(`"'+1"`)
    expect(csvField('-1')).toBe(`"'-1"`)
    expect(csvField('@cmd')).toBe(`"'@cmd"`)
    expect(csvField('plain, text')).toBe(`"plain, text"`)
    expect(csvField(null)).toBe('""')
    expect(csvField(42)).toBe('"42"')
  })
})
