/** @vitest-environment jsdom */
// UX-278: a collection name that is one long word widened a 390 px phone page
// (scrollWidth 956) - the heading and description must wrap anywhere.
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@services/courses/collections', () => ({
  getCollectionById: async () => ({ name: 'Я'.repeat(100), description: 'Ж'.repeat(300), courses: [] }),
}))

import PlatformCollectionPage from '@/app/[locale]/(platform)/(withmenu)/collection/[collectionid]/page'

describe('collection page long name', () => {
  it('lets the heading and description break inside a word', async () => {
    const suspense = PlatformCollectionPage({ params: Promise.resolve({ collectionid: 'c1' }) }) as ReactElement<{
      children: ReactElement<object, (props: object) => Promise<ReactElement>>
    }>
    const content = suspense.props.children
    render(await content.type(content.props))
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('wrap-anywhere')
    expect(screen.getByText('Ж'.repeat(300)).className).toContain('wrap-anywhere')
  })
})
