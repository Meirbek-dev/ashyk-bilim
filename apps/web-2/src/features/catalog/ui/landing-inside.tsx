import { m } from '#/paraglide/messages'
import type { ActivityType } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'

const items: readonly { type: ActivityType; title: () => string; text: () => string }[] = [
  { type: 'video', title: m.catalog_landing_inside_video, text: m.catalog_landing_inside_video_text },
  { type: 'quiz', title: m.catalog_landing_inside_quiz, text: m.catalog_landing_inside_quiz_text },
  { type: 'code_challenge', title: m.catalog_landing_inside_code, text: m.catalog_landing_inside_code_text },
  { type: 'file_submission', title: m.catalog_landing_inside_file, text: m.catalog_landing_inside_file_text },
]

/** What a course is made of, for a guest who has not opened one yet: four activity kinds, each with its icon. */
export function LandingInside() {
  return (
    <section aria-labelledby="landing-inside" className="flex flex-col gap-6">
      <h2 id="landing-inside" className="text-xl font-semibold">
        {m.catalog_landing_inside_title()}
      </h2>
      <ul className="grid gap-gutter @xl:grid-cols-2 @4xl:grid-cols-4">
        {items.map(item => (
          <li key={item.type} className="flex flex-col gap-3">
            <ActivityIcon type={item.type} />
            <h3 className="text-base font-semibold">{item.title()}</h3>
            <p className="text-sm text-muted-foreground">{item.text()}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
