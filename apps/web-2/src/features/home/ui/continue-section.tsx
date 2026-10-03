import { m } from '#/paraglide/messages'
import type { ContinueLearning } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'

import { ContinueItem } from './continue-item'
import { HomeSection } from './home-section'

/** Up to three started courses; the first one's button is the page's one primary action. */
export function ContinueSection({ items }: { items: readonly ContinueLearning[] }) {
  if (items.length === 0) return null
  return (
    <HomeSection title={m.home_continue_title()}>
      <DataList items={items} getKey={item => item.course_id}>
        {item => <ContinueItem item={item} primary={item === items[0]} />}
      </DataList>
    </HomeSection>
  )
}
