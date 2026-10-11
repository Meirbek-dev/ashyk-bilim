import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'

const location = async (path: string) =>
  (await proxy(new NextRequest(`http://localhost:3000${path}`))).headers.get('location')

describe('proxy locale aliases', () => {
  it('sends /kk and the full tags to the configured prefix, keeping path and query', async () => {
    expect(await location('/kk/courses?page=2')).toBe('http://localhost:3000/kz/courses?page=2')
    expect(await location('/kk')).toBe('http://localhost:3000/kz')
    expect(await location('/kk-KZ/dash')).toBe('http://localhost:3000/kz/dash')
    expect(await location('/ru-RU/dash')).toBe('http://localhost:3000/ru/dash')
    expect(await location('/en-US/dash')).toBe('http://localhost:3000/en/dash')
  })

  it('leaves the real prefixes alone', async () => {
    expect(await location('/kz/courses')).toBeNull()
  })
})
