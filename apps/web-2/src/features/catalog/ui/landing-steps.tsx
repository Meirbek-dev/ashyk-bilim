import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

/** How to start: three steps joined by a hairline. */
export function LandingSteps() {
  const steps = [
    {
      id: 'browse',
      body: (
        <Link to="/courses" variant="accent">
          {m.catalog_landing_step_browse()}
        </Link>
      ),
    },
    // Sign-up links to sign-in too, so one link serves both halves of the sentence.
    {
      id: 'signup',
      body: (
        <Link to="/signup" variant="accent">
          {m.catalog_landing_step_signup()}
        </Link>
      ),
    },
    { id: 'learn', body: m.catalog_landing_step_learn() },
  ]
  return (
    <section
      aria-labelledby="landing-start"
      className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @3xl:gap-16"
    >
      <h2 id="landing-start" className="text-2xl font-semibold">
        {m.catalog_landing_start_title()}
      </h2>
      <ol className="grid gap-6 @2xl:grid-cols-3 @2xl:gap-0">
        {steps.map((step, index) => (
          <li key={step.id} className="flex gap-4 @2xl:flex-col @2xl:gap-3 @2xl:pr-6">
            <div className="flex items-center gap-3">
              <span aria-hidden className="w-9 shrink-0 font-heading text-3xl text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden className="hidden h-0 flex-1 border-t border-input @2xl:block" />
              ) : null}
            </div>
            <span className="max-w-xs self-center @2xl:self-start">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
