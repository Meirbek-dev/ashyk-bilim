import { m } from '#/paraglide/messages'
import type { ActivityType } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'

const items: readonly { type: ActivityType; title: () => string; text: () => string }[] = [
  { type: 'video', title: m.catalog_landing_inside_video, text: m.catalog_landing_inside_video_text },
  { type: 'quiz', title: m.catalog_landing_inside_quiz, text: m.catalog_landing_inside_quiz_text },
  { type: 'code_challenge', title: m.catalog_landing_inside_code, text: m.catalog_landing_inside_code_text },
  { type: 'file_submission', title: m.catalog_landing_inside_file, text: m.catalog_landing_inside_file_text },
]

/** What a course is made of, for a guest who has not opened one yet: a contents page of four activity kinds. */
export function LandingInside() {
  return (
    <section
      aria-labelledby="landing-inside"
      className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @3xl:gap-16"
    >
      <h2 id="landing-inside" className="text-2xl font-semibold">
        {m.catalog_landing_inside_title()}
      </h2>
      <ul className="flex flex-col divide-y border-y">
        {items.map(item => (
          <li
            key={item.type}
            className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 py-5 @2xl:grid-cols-[1.5rem_minmax(0,14rem)_minmax(0,1fr)] @2xl:gap-x-6"
          >
            <ActivityIcon type={item.type} />
            <h3 className="text-lg font-semibold">{item.title()}</h3>
            <p className="col-start-2 text-sm text-muted-foreground @2xl:col-start-3 @2xl:pt-1">{item.text()}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
