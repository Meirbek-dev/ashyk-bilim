import * as v from 'valibot'
import { expect, test } from 'vite-plus/test'

import type { ProfileSections } from '#/shared/api/gen/types.gen'

import { ADDABLE_SECTIONS, newSection, normalizeSections, vBuilderDocument } from './profile-sections'

const issues = (document: ProfileSections) =>
  v.safeParse(vBuilderDocument, document).issues?.map(issue => v.getDotPath(issue)) ?? []

test('B-SET-05 every offered kind starts empty and valid; blank optional values go out as null', () => {
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
          { title: 'A', organization: 'B', startDate: '2020-01-01', endDate: null, current: false, description: '' },
          { title: 'C', organization: 'D', startDate: '2021-01-01', endDate: null, current: true, description: '' },
        ],
      },
      { type: 'image-gallery', id: 'g', title: 'G', images: [{ url: 'https://e.test/a.png', caption: null }] },
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
