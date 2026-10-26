import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

/** The quiet ways on below the course summary's actions: the learner's courses or the catalog. */
export function WaysOn() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-sm">
      <Link to="/learning">{m.player_my_courses()}</Link>
      <Link to="/courses">{m.player_catalog()}</Link>
    </p>
  )
}
