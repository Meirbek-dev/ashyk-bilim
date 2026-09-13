// UX-056: the create dialog's validation / time-limit helpers and the studio
// access panel are shared by quizzes and exams — their copy names neither.
import { describe, expect, it } from 'vite-plus/test'

import en from '@/messages/en-US.json'
import kk from '@/messages/kk-KZ.json'
import ru from '@/messages/ru-RU.json'

const KIND_WORDS = /тест|экзамен|test|exam|сынақ|емтихан/i

function sharedCopy(messages: typeof ru): string[] {
  const modal = messages.Components.NewExamModal
  const access = messages.Features.Assessments.Studio.AccessManagement
  return [
    messages.Validation.examTitleRequired,
    messages.Validation.examDescriptionRequired,
    modal.timeLimitDescription,
    modal.timeLimitMinutesDescription,
    access.title,
    access.description,
    access.allCourseLearnersDesc,
    access.restrictedDesc,
    access.lockoutDesc,
  ]
}

describe('kind-neutral shared copy (UX-056)', () => {
  it.each([
    ['ru', ru],
    ['kk', kk as unknown as typeof ru],
    ['en', en as unknown as typeof ru],
  ])('%s names neither quiz nor exam', (_locale, messages) => {
    for (const text of sharedCopy(messages)) expect(text).not.toMatch(KIND_WORDS)
  })
})
