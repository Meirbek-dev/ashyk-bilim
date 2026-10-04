import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'

import { m } from '#/paraglide/messages'

import { stringAttr } from './align'
import { AttrForm } from './attr-form'

/** blockMathEquation: a display formula rendered by KaTeX (loaded with the first formula); authoring edits LaTeX. */
export function MathView({ node, editor, updateAttributes }: ReactNodeViewProps) {
  const latex = stringAttr(node.attrs['math_equation'])
  const target = useRef<HTMLDivElement>(null)
  const [invalid, setInvalid] = useState(false)
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
    <NodeViewWrapper className="my-4 flex flex-col gap-2">
      {/* KaTeX writes MathML next to the visual formula: screen readers read the MathML. */}
      <div ref={target} className="overflow-x-auto" />
      {invalid ? <p className="text-sm text-destructive">{m.editor_math_invalid()}</p> : null}
      {editor.isEditable ? (
        <AttrForm
          fields={[{ name: 'math_equation', label: m.editor_field_latex(), multiline: true }]}
          values={{ math_equation: latex }}
          onApply={values => updateAttributes(values)}
        />
      ) : null}
    </NodeViewWrapper>
  )
}
