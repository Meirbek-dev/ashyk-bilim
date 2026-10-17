import { m } from '#/paraglide/messages'
import type { ContinueLearning } from '#/shared/api/gen/types.gen'

import { ContinueItem } from './continue-item'
import { HomeSection } from './home-section'

/** Up to three started courses: the first as the page's hero (its button is the one primary action), then cards. */
export function ContinueSection({ items }: { items: readonly ContinueLearning[] }) {
  const [first, ...rest] = items
  if (!first) return null
  return (
    <HomeSection title={m.home_continue_title()}>
      <ContinueItem item={first} primary />
      {rest.length > 0 ? (
        <ul className="grid gap-4 @2xl:grid-cols-2">
          {rest.map(item => (
            <li key={item.course_id} className="flex">
              <ContinueItem item={item} primary={false} />
            </li>
          ))}
        </ul>
      ) : null}
    </HomeSection>
  )
}
