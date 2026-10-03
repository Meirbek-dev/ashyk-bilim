import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

/** An unknown id, a malformed one, or a course hidden from the caller: the API does not tell them apart (UX-078). */
export function CourseNotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{m.course_not_found()}</h1>
      <Link to="/courses">{m.course_catalog()}</Link>
    </section>
  )
}
