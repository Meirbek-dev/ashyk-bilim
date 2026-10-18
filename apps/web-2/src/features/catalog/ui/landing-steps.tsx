import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

/** How to start, as three steps stitched together by a dashed seam (the ornament's language). */
export function LandingSteps() {
  const steps = [
    { id: 'browse', body: <Link to="/courses">{m.catalog_landing_step_browse()}</Link> },
    { id: 'signup', body: m.catalog_landing_step_signup() },
    { id: 'learn', body: m.catalog_landing_step_learn() },
  ]
  return (
    <section aria-labelledby="landing-start" className="flex flex-col gap-6">
      <h2 id="landing-start" className="text-xl font-semibold">
        {m.catalog_landing_start_title()}
      </h2>
      <ol className="grid gap-6 @2xl:grid-cols-3 @2xl:gap-0">
        {steps.map((step, index) => (
          <li key={step.id} className="flex gap-4 @2xl:flex-col @2xl:pr-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-primary bg-background font-heading text-lg font-semibold tabular-nums"
              >
                {index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden className="hidden h-0 flex-1 border-t-2 border-dashed border-input @2xl:block" />
              ) : null}
            </div>
            <span className="max-w-xs self-center @2xl:self-start">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
