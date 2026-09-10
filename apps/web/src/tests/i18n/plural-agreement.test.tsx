import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { describe, expect, it } from 'vitest'

import ruMessages from '@/messages/ru-RU.json'

// Regression test for the Russian one/few/many plural-agreement defect:
// a count interpolated next to a hard-coded plural noun (e.g. "1 курсов в охвате").
// TeacherAnalytics.filters.scopedCourses is one of the strings named in the QA report.
function ScopedCourses({ count }: { count: number }) {
  const t = useTranslations('TeacherAnalytics.filters')
  return <span>{t('scopedCourses', { count })}</span>
}

function renderScopedCourses(count: number) {
  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <ScopedCourses count={count} />
    </NextIntlClientProvider>,
  )
}

describe('ru-RU plural agreement', () => {
  it('picks the correct one/few/many noun form for TeacherAnalytics.filters.scopedCourses', () => {
    renderScopedCourses(1)
    expect(screen.getByText('1 курс в охвате')).toBeInTheDocument()

    renderScopedCourses(3)
    expect(screen.getByText('3 курса в охвате')).toBeInTheDocument()

    renderScopedCourses(5)
    expect(screen.getByText('5 курсов в охвате')).toBeInTheDocument()
  })
})
