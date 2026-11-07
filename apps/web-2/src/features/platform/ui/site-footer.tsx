import { BrandMark } from '#/shared/components/brand-mark'
import { UniversityMark } from '#/shared/components/university-mark'

/** The colophon under a guest's page: who publishes all this. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-10 md:px-8">
        <BrandMark full className="h-9 w-auto" />
        <span aria-hidden className="h-7 border-l" />
        <UniversityMark className="h-8" />
      </div>
    </footer>
  )
}
