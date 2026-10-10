import { describe, expect, it } from 'vite-plus/test'
import { decodeCsv, parsePastedIdentifiers, parseRosterCsv } from '@/lib/roster-import'
import { csvBlob } from '@/lib/download'

// QA cluster H: the roster's paste box and CSV import.
describe('parsePastedIdentifiers', () => {
  it('splits on new lines, commas, semicolons and tabs', () => {
    expect(parsePastedIdentifiers(' a@x.kz,\nbob ;\r\n\n"carol"\tdan ')).toEqual(['a@x.kz', 'bob', 'carol', 'dan'])
  })
})

describe('parseRosterCsv', () => {
  it('reads an Excel (ru) file: BOM, `;`, header, quoted cells, blank rows', () => {
    const csv = '\uFEFFФИО;Email\r\n"Иванов И.";ivanov@uni.kz\r\n;\r\nПетров;"petrov@uni.kz"\r\n'
    expect(parseRosterCsv(csv)).toEqual(['ivanov@uni.kz', 'petrov@uni.kz'])
  })

  it('decodes a Windows-1251 file (plain «CSV» from a Russian Excel)', () => {
    // «Почта», CRLF, ivanov@uni.kz in cp1251
    const bytes = new Uint8Array([
      0xcf,
      0xee,
      0xf7,
      0xf2,
      0xe0,
      0x0d,
      0x0a,
      ...new TextEncoder().encode('ivanov@uni.kz'),
    ])
    const text = decodeCsv(bytes.buffer)
    expect(text.startsWith('Почта')).toBe(true)
    expect(parseRosterCsv(text)).toEqual(['ivanov@uni.kz'])
    expect(decodeCsv(new TextEncoder().encode('\uFEFFПочта').buffer)).toBe('Почта')
  })

  it('reads one comma column of usernames without a header', () => {
    expect(parseRosterCsv('alice\nbob\n')).toEqual(['alice', 'bob'])
  })

  it('drops a lone username header', () => {
    expect(parseRosterCsv('username\nalice')).toEqual(['alice'])
    expect(parseRosterCsv('Email,Name\nalice@x.kz,Alice')).toEqual(['alice@x.kz'])
  })

  it('round-trips the roster export (`;` + BOM)', async () => {
    const bytes = new Uint8Array(
      await csvBlob(
        [
          ['username', 'email'],
          ['alice', 'alice@x.kz'],
        ],
        'ru-RU',
      ).arrayBuffer(),
    )
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    // Keep the BOM (`ignoreBOM`): the import must strip it itself.
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    expect(text.startsWith('\uFEFF"username";"email"')).toBe(true)
    expect(parseRosterCsv(text)).toEqual(['alice@x.kz'])
  })
})
