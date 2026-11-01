import { describe, expect, test } from 'vite-plus/test'

import { keyLabel } from '#/shared/lib/key-label'
import { readingMinutes, wordCount } from './word-count'

describe('editing aids', () => {
  test('B-EDT-38 words count runs of letters or digits, in any script; a dash is not a word', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('  Переменная - это имя  ')).toBe(3)
    expect(wordCount('Қазақ тілі 2026')).toBe(3)
    expect(readingMinutes(0)).toBe(0)
    expect(readingMinutes(20)).toBe(1)
    expect(readingMinutes(900)).toBe(5)
  })

  test('B-EDT-37 shortcuts read as this platform prints them', () => {
    expect(keyLabel('Mod-b', false)).toBe('Ctrl+B')
    expect(keyLabel('Mod-b', true)).toBe('⌘B')
    expect(keyLabel('Mod-Shift-8', false)).toBe('Ctrl+Shift+8')
    expect(keyLabel('Mod-Alt-2', true)).toBe('⌘⌥2')
    expect(keyLabel('Mod-Shift-ArrowUp', false)).toBe('Ctrl+Shift+↑')
    expect(keyLabel('/', false)).toBe('/')
  })
})
