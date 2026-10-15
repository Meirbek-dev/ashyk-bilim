import { Sigma } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

// The old editor's formula templates (B-EDT-29).
const TEMPLATES: { label: () => string; latex: string }[] = [
  { label: m.editor_math_fraction, latex: String.raw`\frac{a}{b}` },
  { label: m.editor_math_sqrt, latex: String.raw`\sqrt{x}` },
  { label: m.editor_math_sum, latex: String.raw`\sum_{i=1}^{n} x_i` },
  { label: m.editor_math_integral, latex: String.raw`\int_{a}^{b} f(x) \, dx` },
  { label: m.editor_math_limit, latex: String.raw`\lim_{x \to \infty} f(x)` },
  { label: m.editor_math_matrix, latex: String.raw`\begin{pmatrix} a & b \ c & d \end{pmatrix}` },
  { label: m.editor_math_binomial, latex: String.raw`\binom{n}{k}` },
  { label: m.editor_math_quadratic, latex: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}` },
  { label: m.editor_math_vector, latex: String.raw`\vec{v} = \begin{pmatrix} x \ y \ z \end{pmatrix}` },
  {
    label: m.editor_math_system,
    latex: String.raw`\begin{cases} a_1x + b_1y = c_1 \ a_2x + b_2y = c_2 \end{cases}`,
  },
]

/** A menu of starter formulas: picking one replaces the formula, as in the old editor. */
export function MathTemplates({ onPick }: { onPick: (latex: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="self-start">
            <Sigma aria-hidden />
            {m.editor_math_templates()}
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        {TEMPLATES.map(template => (
          <DropdownMenuItem key={template.latex} onClick={() => onPick(template.latex)}>
            {template.label()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
