import { useId, type ReactNode } from 'react'

type HomeSectionProps = {
  title: string
  /** The heading names the region but is not drawn: the hero under the page's title says «Продолжить» on its button. */
  titleHidden?: boolean
  children: ReactNode
}

/** One part of the page: an h2 that names the region. */
export function HomeSection({ title, titleHidden = false, children }: HomeSectionProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className={titleHidden ? 'sr-only' : 'text-xl font-semibold'}>
        {title}
      </h2>
      {children}
    </section>
  )
}
