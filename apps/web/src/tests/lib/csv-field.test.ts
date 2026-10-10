import { describe, expect, it } from 'vite-plus/test'
import { csvBlob, csvField } from '@/lib/download'

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

// Excel splits on the locale's list separator and reads `8.7` as a date in ru/kk.
describe('csvBlob', () => {
  const rows = [['Курс', 93.33, '8.7', '3.8.1', 100]]
  const text = async (locale: string) =>
    new TextDecoder('utf-8', { ignoreBOM: true }).decode(await csvBlob(rows, locale).arrayBuffer())

  it('writes `;` and a decimal comma for ru and kk', async () => {
    expect(await text('ru-RU')).toBe('\uFEFF"Курс";"93,33";"8,7";"3.8.1";"100"\r\n')
    expect(await text('kk-KZ')).toBe(await text('ru-RU'))
  })

  it('writes `,` and a decimal point for en', async () => {
    expect(await text('en-US')).toBe('\uFEFF"Курс","93.33","8.7","3.8.1","100"\r\n')
  })
})
