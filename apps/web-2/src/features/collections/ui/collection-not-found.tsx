import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

/** An unknown id, a malformed one, or someone else's hidden collection: the API does not tell them apart (UX-078). */
export function CollectionNotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{m.collections_not_found()}</h1>
      <Link to="/collections">{m.collections_all()}</Link>
    </section>
  )
}
