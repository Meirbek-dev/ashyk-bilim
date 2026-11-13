import { m } from '#/paraglide/messages'
import { BrandMark } from '#/shared/components/brand-mark'
import { Link } from '#/shared/components/link'
import { UniversityMark } from '#/shared/components/university-mark'

/** The colophon under a guest's page: who publishes all this, and the two public ways in. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-10 gap-y-6 px-4 py-10 md:px-8">
        <div className="flex items-center gap-5">
          <BrandMark full className="h-9 w-auto" />
          <span aria-hidden className="h-7 border-l" />
          <UniversityMark className="h-8" />
        </div>
        <nav aria-label={m.platform_brand()} className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link variant="title" to="/courses">
            {m.platform_nav_courses()}
          </Link>
          <Link variant="title" to="/collections">
            {m.platform_nav_collections()}
          </Link>
        </nav>
      </div>
    </footer>
  )
}
