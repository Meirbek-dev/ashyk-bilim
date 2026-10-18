import { NextRequest } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { describe, expect, it } from 'vitest'
import { config, proxy } from '@/proxy'

const location = async (path: string) =>
  (await proxy(new NextRequest(`http://localhost:3000${path}`))).headers.get('location')

describe('proxy locale aliases', () => {
  it('serves brand resources without locale redirects while matching dotted route segments', () => {
    for (const url of [
      '/brand/share-card.png',
      '/brand/logo-white.png',
      '/site.webmanifest',
      '/apple-touch-icon.png',
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false)
    }
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/en/user/first.last' })).toBe(true)
  })

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
