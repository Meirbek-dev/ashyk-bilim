import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'

const location = (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`)).headers.get('location')

describe('proxy locale aliases', () => {
  it('sends /kk and the full tags to the configured prefix, keeping path and query', () => {
    expect(location('/kk/courses?page=2')).toBe('http://localhost:3000/kz/courses?page=2')
    expect(location('/kk')).toBe('http://localhost:3000/kz')
    expect(location('/kk-KZ/dash')).toBe('http://localhost:3000/kz/dash')
    expect(location('/ru-RU/dash')).toBe('http://localhost:3000/ru/dash')
    expect(location('/en-US/dash')).toBe('http://localhost:3000/en/dash')
  })

  it('leaves the real prefixes alone', () => {
    expect(location('/kz/courses')).toBeNull()
  })
})
