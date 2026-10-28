import { expect, test } from 'vite-plus/test'

import { decodeCsv } from './csv-text'

test('B-CST-39 B-COD-25 a CSV saved by a Russian Excel (Windows-1251) reads as Cyrillic', () => {
  const cp1251 = new Uint8Array([0xcf, 0xee, 0xf7, 0xf2, 0xe0]) // «Почта»
  expect(decodeCsv(cp1251.buffer)).toBe('Почта')
  expect(decodeCsv(new TextEncoder().encode('Почта').buffer)).toBe('Почта')
})
