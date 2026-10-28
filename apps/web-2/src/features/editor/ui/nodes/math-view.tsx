import { use, useEffect, useRef, useState } from 'react'

import { m } from '#/paraglide/messages'

import { stringAttr } from './align'
import { NodeParts, type ViewProps } from './parts'

/**
 * blockMathEquation: a display formula rendered by KaTeX (loaded with the first formula); authoring edits LaTeX in a
 * form shown for the picked formula or an empty one, as the embed and the button do: a lecture of ten formulas read as
 * ten forms.
 */
export function MathView({ node, editor, selected, updateAttributes }: ViewProps) {
  const { Wrapper, Authoring } = use(NodeParts)
  const latex = stringAttr(node.attrs['math_equation'])
  const target = useRef<HTMLDivElement>(null)
  const [invalid, setInvalid] = useState(false)
  const authoring = editor.isEditable && (selected || !latex.trim()) ? Authoring : null
  useEffect(() => {
    let live = true
    void import('katex').then(({ default: katex }) => {
      if (!live || !target.current) return null
      try {
        katex.render(latex, target.current, { displayMode: true, throwOnError: true })
        setInvalid(false)
      } catch {
        target.current.textContent = latex
        setInvalid(true)
      }
      return null
    })
    return () => {
      live = false
    }
  }, [latex])
  return (
    <Wrapper className="my-4 flex flex-col gap-2">
      {/* KaTeX writes MathML next to the visual formula: screen readers read the MathML. */}
      <div ref={target} className="overflow-x-auto" />
      {invalid ? <p className="text-sm text-destructive">{m.editor_math_invalid()}</p> : null}
      {authoring ? <authoring.MathTemplates onPick={next => updateAttributes({ math_equation: next })} /> : null}
      {authoring ? (
        <authoring.AttrForm
          // A picked template is the new value of the field.
          key={latex}
          fields={[{ name: 'math_equation', label: m.editor_field_latex(), multiline: true }]}
          values={{ math_equation: latex }}
          onApply={values => updateAttributes(values)}
        />
      ) : null}
    </Wrapper>
  )
}
