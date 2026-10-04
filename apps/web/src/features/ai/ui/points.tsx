import { m } from '#/paraglide/messages'

/** A titled list of short points (strengths, risks); "None." when empty. */
export function Points({ title, items }: { title: string; items: string[] | undefined }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="font-medium">{title}</h3>
      {items && items.length > 0 ? (
        <ul className="list-disc ps-5 text-sm">
          {items.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{m.ai_none()}</p>
      )}
    </section>
  )
}
