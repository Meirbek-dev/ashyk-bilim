import { describe, expect, test } from 'vite-plus/test'

import type { CourseLearner } from '#/shared/api/gen/types.gen'

import { parsePasted, parseRosterCsv, rosterCsv, summarize } from './roster'

describe('roster', () => {
  test('B-CST-39 a pasted list splits on new lines, commas, semicolons and tabs', () => {
    expect(parsePasted(' a@x.kz,\n"b@x.kz" ;ivanov\t\n\n')).toEqual(['a@x.kz', 'b@x.kz', 'ivanov'])
  })

  test('B-CST-39 a class list CSV: header skipped, the email cell wins, ; or , delimited', () => {
    expect(parseRosterCsv('﻿ФИО;Почта\r\nИванов И.;ivanov@x.kz\r\n;\r\nПетров;petrov\r\n')).toEqual([
      'ivanov@x.kz',
      'petrov',
    ])
    // The header names the column: «ФИО;Логин» reads the logins, not the names before them.
    expect(parseRosterCsv('ФИО;Логин\r\nИванов Иван;ivanov\r\nПетрова;petrova\r\n')).toEqual(['ivanov', 'petrova'])
    expect(parseRosterCsv('email,name\na@x.kz,A\nb@x.kz,B')).toEqual(['a@x.kz', 'b@x.kz'])
    // A first row that already holds an email is data, not a header.
    expect(parseRosterCsv('user;a@x.kz\nuser;b@x.kz')).toEqual(['a@x.kz', 'b@x.kz'])
  })

  test('B-CST-39 the report counts outcomes and lists who was not enrolled', () => {
    const { counts, problems } = summarize([
      { identifier: 'a', outcome: 'enrolled', user: null },
      { identifier: 'b', outcome: 'already_enrolled', user: null },
      { identifier: 'c', outcome: 'not_found', user: null },
    ])
    expect(counts.enrolled).toBe(1)
    expect(counts.not_found).toBe(1)
    expect(problems.map(result => result.identifier)).toEqual(['c'])
  })

  test('B-CST-40 the export opens in Excel: BOM, ; and decimal comma in ru, formulas neutralized', () => {
    const learner: CourseLearner = {
      allowed_actions: [],
      avatar_key: null,
      completed_at_unix: null,
      display_name: '=HYPERLINK("x")',
      email: 'a@x.kz',
      enrolled_at_unix: 0,
      last_activity_at_unix: null,
      progress_pct: 66.666,
      user_id: '00000000-0000-4000-8000-000000000000',
      username: 'a',
    }
    const csv = rosterCsv(['Имя', 'Логин', 'Почта', 'Записан', 'Прогресс', 'Завершён'], [learner], () => 'D', false)
    expect(csv.startsWith('﻿"Имя";')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""x"")";"a";"a@x.kz";"D";"66,7";""\r\n`)
    expect(rosterCsv(['N'], [learner], () => 'D', true)).toContain('"66.7"')
  })
})
