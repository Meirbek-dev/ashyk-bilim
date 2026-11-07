import { m } from '#/paraglide/messages'

/** The level as one block of solid colour: the page's largest figure. The title's line says it in words. */
export function LevelBlock({ level }: { level: number }) {
  return (
    <div aria-hidden className="ab-dye ab-cover flex aspect-video w-full flex-col justify-between p-5">
      <span className="text-sm">{m.achievements_level_title()}</span>
      <span className="font-heading text-display font-semibold text-foreground tabular-nums">{level}</span>
    </div>
  )
}
