import { m } from '#/paraglide/messages'

/** A micro-lecture's learning objectives (B-AI-19); nothing when it has none. */
export function LearningObjectives({ objectives }: { objectives: readonly string[] }) {
  if (objectives.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-sm font-medium">{m.ai_remediation_objectives()}</h4>
      <ul className="list-disc ps-5 text-sm">
        {objectives.map(objective => (
          <li key={objective}>{objective}</li>
        ))}
      </ul>
    </section>
  )
}
