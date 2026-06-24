import type { Editor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { extractHeadingOutline } from '@components/Objects/Editor/core'
import { cn } from '@/lib/utils'

interface TableOfContentsProps {
  editor: Editor | null
  className?: string
  minItems?: number
}

export function useHeadingOutline(editor: Editor | null) {
  const [headings, setHeadings] = useState<ReturnType<typeof extractHeadingOutline>>([])

  useEffect(() => {
    if (!editor) return

    const updateHeadings = () => {
      setHeadings(extractHeadingOutline(editor.state.doc))
    }

    editor.on('update', updateHeadings)
    updateHeadings()

    return () => {
      editor.off('update', updateHeadings)
    }
  }, [editor])

  return headings
}

const TableOfContents = ({ className, editor, minItems = 2 }: TableOfContentsProps) => {
  const headings = useHeadingOutline(editor)
  const [activeId, setActiveId] = useState<string | null>(null)
  const visibleHeadings = useMemo(() => headings.filter(heading => heading.id && heading.text), [headings])

  if (!activeId && visibleHeadings[0]?.id) {
    setActiveId(visibleHeadings[0].id)
  }

  useEffect(() => {
    if (visibleHeadings.length < minItems) return
    const elements = visibleHeadings
      .map(heading => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => Boolean(element))
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-20% 0px -65% 0px',
        threshold: [0, 1],
      },
    )

    elements.forEach(element => observer.observe(element))
    return () => observer.disconnect()
  }, [minItems, visibleHeadings])

  if (visibleHeadings.length < minItems) return null

  return (
    <div
      className={cn('m-0 flex h-fit w-full flex-col items-stretch border-0 bg-transparent p-0 shadow-none', className)}
    >
      <ul className="m-0 !list-none !p-0">
        {visibleHeadings.map(heading => (
          <li
            key={heading.id}
            style={{ paddingLeft: `${(heading.level - 1) * 1}rem` }}
            className="my-2 flex !list-none items-start gap-1"
          >
            <span
              className={cn(
                'mt-[0.1rem] flex shrink-0 items-center',
                activeId === heading.id ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Check size={15} strokeWidth={1.7} />
            </span>
            <a
              style={{
                fontWeight: heading.level === 1 ? 500 : 400,
                fontSize: heading.level === 1 ? '1rem' : heading.level === 2 ? '0.97rem' : '0.95rem',
              }}
              className={cn(
                'hover:text-primary focus-visible:ring-ring block min-w-0 flex-1 rounded-sm bg-transparent p-0 leading-[1.4] break-words hyphens-auto no-underline outline-none transition-colors focus-visible:ring-2',
                activeId === heading.id ? 'text-primary' : 'text-foreground',
              )}
              href={`#${heading.id}`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default TableOfContents
