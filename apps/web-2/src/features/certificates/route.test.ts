import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { verifyHead } from './route'

const titles = (status: string) => verifyHead({ match: { status } }).meta.map(tag => 'title' in tag && tag.title)

describe('verifyHead', () => {
  // The page says «Сертификат не найден»; the tab said «Страница не найдена».
  test('B-CRT-02 a code that matches no certificate names the tab as the page does', () => {
    expect(titles('notFound')).toEqual([expect.stringContaining(m.certificates_not_found())])
    expect(titles('error')).toEqual([])
  })
})
