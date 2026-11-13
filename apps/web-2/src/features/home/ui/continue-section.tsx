import { m } from '#/paraglide/messages'
import type { ContinueLearning } from '#/shared/api/gen/types.gen'

import { ContinueHero } from './continue-hero'
import { ContinueRow } from './continue-row'
import { HomeSection } from './home-section'

/** Up to three started courses: the first as the page's hero (its button is the one primary action), then rows. */
export function ContinueSection({ items }: { items: readonly ContinueLearning[] }) {
  const [first, ...rest] = items
  if (!first) return null
  return (
    // No drawn heading: «Сегодня», «Продолжить» and the course's name read as three titles in a column.
    <HomeSection title={m.home_continue_title()} titleHidden>
      <ContinueHero item={first} />
      {rest.length > 0 ? (
        <ul className="mt-2 grid gap-x-12 border-t pt-2 @3xl:grid-cols-2">
          {rest.map(item => (
            <li key={item.course_id}>
              <ContinueRow item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </HomeSection>
  )
}
