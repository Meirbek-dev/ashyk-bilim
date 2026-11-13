import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

/** How to start: three numbered steps side by side from @2xl, one under another on a phone. The page ends on them. */
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
      className="grid gap-x-16 gap-y-6 border-t pt-10 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
    >
      <h2 id="landing-start" className="text-xl font-semibold">
        {m.catalog_landing_start_title()}
      </h2>
      <ol className="grid gap-5 @2xl:grid-cols-3 @2xl:gap-6">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-baseline gap-4 @2xl:flex-col @2xl:gap-2">
            <span
              aria-hidden
              className="w-6 shrink-0 font-heading text-xl font-semibold text-muted-foreground tabular-nums"
            >
              {index + 1}
            </span>
            <span className="text-pretty">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
