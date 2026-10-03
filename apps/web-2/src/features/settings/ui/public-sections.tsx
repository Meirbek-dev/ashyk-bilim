import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { ProfileSection } from '#/shared/api/gen/types.gen'
import { Anchor } from '#/shared/components/anchor'
import { formatDate } from '#/shared/i18n/format'

import { skillLevelLabels } from './section-items'

const day = (date: string) => formatDate(Date.parse(date) / 1000)

const period = (item: { startDate: string; endDate?: string | null; current: boolean }) =>
  m.settings_user_period({
    start: day(item.startDate),
    end: item.current || !item.endDate ? m.settings_user_present() : day(item.endDate),
  })

const muted = 'text-sm text-muted-foreground'

type Renderers = { [T in ProfileSection['type']]: (section: Extract<ProfileSection, { type: T }>) => ReactNode }

// Courses are listed by the page itself, and the legacy gamification kind has no public data: both show nothing.
const bodies: Renderers = {
  text: section => <p className="max-w-prose wrap-anywhere whitespace-pre-line">{section.content}</p>,
  links: section => (
    <ul className="flex flex-col gap-1">
      {section.links.map(link => (
        <li key={link.url} className="wrap-anywhere">
          <Anchor href={link.url} target="_blank" rel="noopener noreferrer">
            {link.title || link.url}
          </Anchor>
        </li>
      ))}
    </ul>
  ),
  skills: section => (
    <ul className="flex flex-col gap-1">
      {section.skills.map(skill => (
        <li key={skill.name}>
          {skill.name}
          {skill.level ? <span className={muted}> · {skillLevelLabels[skill.level]()}</span> : null}
          {skill.category ? <span className={muted}> · {skill.category}</span> : null}
        </li>
      ))}
    </ul>
  ),
  experience: section => (
    <ul className="flex flex-col gap-3">
      {section.experiences.map(item => (
        <li key={`${item.title}-${item.startDate}`} className="flex flex-col gap-1">
          <h3 className="font-medium">{[item.title, item.organization].filter(Boolean).join(' · ')}</h3>
          <p className={muted}>{period(item)}</p>
          {item.description ? <p className="whitespace-pre-line">{item.description}</p> : null}
        </li>
      ))}
    </ul>
  ),
  education: section => (
    <ul className="flex flex-col gap-3">
      {section.education.map(item => (
        <li key={`${item.institution}-${item.startDate}`} className="flex flex-col gap-1">
          <h3 className="font-medium">{item.institution}</h3>
          <p className={muted}>{[item.degree, item.field, period(item)].filter(Boolean).join(' · ')}</p>
          {item.description ? <p className="whitespace-pre-line">{item.description}</p> : null}
        </li>
      ))}
    </ul>
  ),
  affiliation: section => (
    <ul className="flex flex-col gap-3">
      {section.affiliations.map(item => (
        <li key={item.name} className="flex items-start gap-3">
          {item.logoUrl ? <img src={item.logoUrl} alt="" className="size-10 rounded-md object-contain" /> : null}
          <div className="flex flex-col gap-1">
            <h3 className="font-medium">{item.name}</h3>
            {item.description ? <p className={muted}>{item.description}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  ),
  'image-gallery': section => (
    <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
      {section.images.map(image => (
        <li key={image.url}>
          <figure className="flex flex-col gap-1">
            <img src={image.url} alt={image.caption ?? ''} className="aspect-video w-full rounded-md object-cover" />
            {image.caption ? <figcaption className={muted}>{image.caption}</figcaption> : null}
          </figure>
        </li>
      ))}
    </ul>
  ),
  courses: () => null,
  gamification: () => null,
}

function body(section: ProfileSection): ReactNode {
  switch (section.type) {
    case 'text':
      return bodies.text(section)
    case 'links':
      return bodies.links(section)
    case 'skills':
      return bodies.skills(section)
    case 'experience':
      return bodies.experience(section)
    case 'education':
      return bodies.education(section)
    case 'affiliation':
      return bodies.affiliation(section)
    case 'image-gallery':
      return bodies['image-gallery'](section)
    default:
      return null
  }
}

/** The builder sections in their saved order, read-only. */
export function PublicSections({ sections }: { sections: ProfileSection[] }) {
  return sections
    .filter(section => section.type !== 'courses' && section.type !== 'gamification')
    .map(section => (
      <section key={section.id} aria-label={section.title} className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold wrap-anywhere">{section.title}</h2>
        {body(section)}
      </section>
    ))
}
