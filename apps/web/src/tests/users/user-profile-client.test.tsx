/** @vitest-environment jsdom */
// BUG-366: user-supplied image hosts outside `images.remotePatterns` render
// as plain <img> instead of crashing the page; UX-270: dates and «Present»
// follow the page locale.

import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import UserProfileClient from '@/app/_shared/withmenu/user/[username]/UserProfileClient'
import kkMessages from '@/messages/kk-KZ.json'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/features/users/hooks/useUsers', () => ({ useUserCourses: () => ({ isSuccess: false }) }))
vi.mock('@/features/trail/hooks/useTrail', () => ({ useTrailCurrent: () => ({ data: undefined, isLoading: false }) }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ isAuthenticated: false }) }))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))

const profile = {
  sections: [
    {
      id: 's1',
      type: 'image-gallery' as const,
      title: 'Галерея',
      images: [{ url: 'https://img.freepik.com/premium-vector/boy.jpg?w=740', caption: 'аватар' }],
    },
    {
      id: 's2',
      type: 'experience' as const,
      title: 'Опыт',
      experiences: [
        { title: 'Учитель', organization: 'Школа', startDate: '2024-09-01', current: true, description: '' },
      ],
    },
    {
      id: 's3',
      type: 'education' as const,
      title: 'Образование',
      education: [
        {
          institution: 'ПГУ',
          degree: 'специалист',
          field: 'Математика',
          startDate: '1993-09-01',
          endDate: '1997-06-30',
          current: false,
        },
      ],
    },
    {
      id: 's4',
      type: 'affiliation' as const,
      title: 'Организации',
      affiliations: [{ name: 'IT-куб', description: '', logoUrl: 'https://itcube38.ru/logo.png' }],
    },
  ],
}

function renderIn(locale: string, messages: Record<string, unknown>) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <UserProfileClient userData={{ id: 'u1', username: 'B_Saduakas', first_name: 'Садуакас' }} profile={profile} />
    </NextIntlClientProvider>,
  )
}

describe('public profile (BUG-366, UX-270)', () => {
  it('renders external gallery and logo hosts as plain images', () => {
    renderIn('ru', ruMessages)
    expect(screen.getByAltText('аватар').getAttribute('src')).toBe(
      'https://img.freepik.com/premium-vector/boy.jpg?w=740',
    )
    for (const logo of screen.getAllByAltText('IT-куб')) {
      expect(logo.getAttribute('src')).toBe('https://itcube38.ru/logo.png')
    }
  })

  it('localizes the date ranges and the open-ended label', () => {
    renderIn('ru', ruMessages)
    expect(screen.getByText(/сентябрь 2024 г\. – по настоящее время/u)).toBeInTheDocument()
    expect(screen.getByText(/сентябрь 1993 г\. – июнь 1997 г\./u)).toBeInTheDocument()
    expect(screen.queryByText(/Present|2024-09-01/u)).toBeNull()

    renderIn('kk', kkMessages)
    expect(screen.getByText(/2024.*қазіргі уақытқа дейін/u)).toBeInTheDocument()
  })
})
