import * as v from 'valibot'
import { expect, test } from 'vite-plus/test'

import type { ProfileSections } from '#/shared/api/gen/types.gen'

import {
  ADDABLE_SECTIONS,
  newSection,
  normalizeSections,
  sectionHeading,
  shownSections,
  vBuilderDocument,
} from './profile-sections'

const issues = (document: ProfileSections) =>
  v.safeParse(vBuilderDocument, document).issues?.map(issue => v.getDotPath(issue)) ?? []

test('B-SET-05 every offered kind starts empty and valid; blank optional values are left out', () => {
  const sections = ADDABLE_SECTIONS.map((type, index) => newSection(type, `id-${index}`, type))
  expect(sections.map(section => section.type)).toEqual([
    'text',
    'links',
    'skills',
    'experience',
    'education',
    'affiliation',
    'image-gallery',
    'courses',
  ])
  expect(v.safeParse(vBuilderDocument, { sections }).success).toBe(true)

  const document: ProfileSections = {
    sections: [
      {
        type: 'experience',
        id: 'x',
        title: 'Опыт',
        experiences: [
          { title: 'A', organization: 'B', startDate: '2020-01-01', endDate: '', current: false, description: '' },
          {
            title: 'C',
            organization: 'D',
            startDate: '2021-01-01',
            endDate: '2022-01-01',
            current: true,
            description: '',
          },
        ],
      },
      { type: 'image-gallery', id: 'g', title: 'G', images: [{ url: 'https://e.test/a.png', caption: '' }] },
    ],
  }
  expect(normalizeSections(document)).toEqual({
    sections: [
      {
        type: 'experience',
        id: 'x',
        title: 'Опыт',
        experiences: [
          {
            title: 'A',
            organization: 'B',
            startDate: '2020-01-01',
            endDate: undefined,
            current: false,
            description: '',
          },
          {
            title: 'C',
            organization: 'D',
            startDate: '2021-01-01',
            endDate: undefined,
            current: true,
            description: '',
          },
        ],
      },
      { type: 'image-gallery', id: 'g', title: 'G', images: [{ url: 'https://e.test/a.png', caption: undefined }] },
    ],
  })
})

test('B-SET-06 link, image and logo addresses must be http(s) before saving', () => {
  expect(
    issues({
      sections: [
        {
          type: 'links',
          id: 'l',
          title: 'L',
          links: [
            { title: 'ok', url: 'https://e.test' },
            { title: 'x', url: 'ftp://e' },
          ],
        },
        { type: 'image-gallery', id: 'g', title: 'G', images: [{ url: 'javascript:alert(1)' }] },
        {
          type: 'affiliation',
          id: 'a',
          title: 'A',
          affiliations: [
            { name: 'blank logo is fine', logoUrl: '', description: '' },
            { name: 'bad', logoUrl: 'e.test/logo.png', description: '' },
          ],
        },
      ],
    }),
  ).toEqual(['sections.0.links.1.url', 'sections.1.images.0.url', 'sections.2.affiliations.1.logoUrl'])
})

test('B-SET-14 an old-web default section title reads as its type on the public profile', () => {
  expect(sectionHeading('Раздел «Опыт»')).toBe('Опыт')
  expect(sectionHeading('«Білім» бөлімі')).toBe('Білім')
  expect(sectionHeading('Experience Section')).toBe('Experience')
  expect(sectionHeading('Веб технологиялар')).toBe('Веб технологиялар')
  expect(sectionHeading('Раздел «Опыт» и навыки')).toBe('Раздел «Опыт» и навыки')
})

test('a section saved without items, or with blank text, is not shown to visitors', () => {
  const skills = newSection('skills', 's', 'Навыки')
  const text = { ...newSection('text', 't', 'О себе'), content: '  ' }
  const links = {
    type: 'links' as const,
    id: 'l',
    title: 'Ссылки',
    links: [{ title: 'GitHub', url: 'https://github.com' }],
  }
  const courses = newSection('courses', 'c', 'Курсы')
  expect(shownSections([skills, text, links, courses]).map(section => section.id)).toEqual(['l'])
})
