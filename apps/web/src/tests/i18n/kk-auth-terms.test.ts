// UX-178: one kk term each — Cancel, the 429 phrasing and «password» — so the
// login, signup and security pages do not disagree.
import { describe, expect, it } from 'vite-plus/test'

import enMessages from '@/messages/en-US.json'
import kkMessages from '@/messages/kk-KZ.json'

type Tree = { [key: string]: string | Tree }

function* leaves(kk: Tree, en: Tree | undefined, path = ''): Generator<[string, string, string | undefined]> {
  for (const [key, value] of Object.entries(kk)) {
    const enValue = en?.[key]
    if (typeof value === 'string') yield [`${path}${key}`, value, typeof enValue === 'string' ? enValue : undefined]
    else yield* leaves(value, typeof enValue === 'object' ? enValue : undefined, `${path}${key}.`)
  }
}

const all = [...leaves(kkMessages as unknown as Tree, enMessages as unknown as Tree)]

describe('kk auth/security terms (UX-178)', () => {
  it('Cancel is always «Болдырмау»', () => {
    expect(all.filter(([, kk, en]) => en === 'Cancel' && kk !== 'Болдырмау').map(([k]) => k)).toEqual([])
  })

  it('password is always «құпиясөз»', () => {
    expect(all.filter(([, kk]) => /құпия сөз/iu.test(kk)).map(([k]) => k)).toEqual([])
  })

  it('too many attempts reads the same on login and elsewhere', () => {
    expect(all.filter(([, kk]) => kk.startsWith('Әрекеттер тым көп')).map(([k]) => k)).toEqual([])
    expect(kkMessages.Errors.codes['rate-limited']).toBe(kkMessages.Auth.Login.rateLimited)
  })
})
