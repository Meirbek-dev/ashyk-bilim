'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { MarkdownRenderMode } from '../presets/presets'
import { extractMarkdownSummary } from '../utils/markdown-extract'
import { sanitizeMarkdownImageUrl, sanitizeMarkdownUrl } from '../utils/markdown-sanitize'
import { MarkdownCodeBlock } from './MarkdownCodeBlock'
import { MarkdownImage } from './MarkdownImage'
import { MarkdownHeading, extractMarkdownHeadingText, slugifyMarkdownHeading } from './MarkdownHeading'
import { AiStreamingCursor } from './MarkdownStreaming'

interface MarkdownContentProps {
  content: string
  mode?: MarkdownRenderMode
  className?: string
  compact?: boolean
  emptyFallback?: React.ReactNode
  /** When true, append a blinking cursor after the last streamed token (AI use). */
  streaming?: boolean
  /** Allow rendering of external images. Default: false for security. */
  allowImages?: boolean
  /** Show heading anchor links. Default: true for courseDescription / codeProblem modes. */
  showHeadingAnchors?: boolean
  /** Callback when a heading anchor is clicked (e.g. for hash navigation). */
  onHeadingAnchorClick?: (id: string) => void
}

const MODE_WITH_ANCHORS = new Set<MarkdownRenderMode>(['courseDescription', 'codeProblem'])
const MODE_WITH_MATH = new Set<MarkdownRenderMode>([
  'prompt',
  'taskDescription',
  'codeProblem',
  'codeSpec',
  'compactRichText',
])

const modeClassName: Record<MarkdownRenderMode, string> = {
  prompt: 'prose-sm leading-relaxed',
  taskDescription: 'prose-base leading-relaxed',
  compactRichText: 'prose-sm leading-normal',
  codeProblem: 'prose-sm leading-relaxed',
  codeSpec: 'prose-sm leading-relaxed',
  courseDescription: 'prose-base md:prose-lg leading-relaxed',
  plainSummary: '',
}

function remarkHeadingIds() {
  return (tree: any) => {
    const headingIds = new Map<string, number>()

    function extractText(node: any): string {
      if (!node) return ''
      if (node.type === 'text') return node.value || ''
      if (node.value) return node.value
      if (node.children) return node.children.map(extractText).join('')
      return ''
    }

    function traverse(node: any) {
      if (node.type === 'heading') {
        const text = extractText(node)
        const base = slugifyMarkdownHeading(text) || 'section'
        const count = headingIds.get(base) ?? 0
        headingIds.set(base, count + 1)
        const id = count === 0 ? base : `${base}-${count + 1}`

        if (!node.data) node.data = {}
        if (!node.data.hProperties) node.data.hProperties = {}
        node.data.hProperties.id = id
      }

      if (node.children) {
        node.children.forEach(traverse)
      }
    }

    traverse(tree)
  }
}

export function MarkdownContent({
  content,
  mode = 'prompt',
  className,
  compact = false,
  emptyFallback = null,
  streaming = false,
  allowImages = false,
  showHeadingAnchors,
  onHeadingAnchorClick,
}: MarkdownContentProps) {
  const t = useTranslations('Features.ContentMarkdown')
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldShowAnchors = showHeadingAnchors ?? MODE_WITH_ANCHORS.has(mode)
  const hasMath = MODE_WITH_MATH.has(mode) && /\$/.test(content)

  // Lazy-load KaTeX CSS only when math is actually present
  useEffect(() => {
    if (!hasMath) return
    // Dynamic import so KaTeX CSS is code-split and not loaded on every page
    import('katex/dist/katex.min.css').catch(() => {
      // CSS import — no action needed on failure
    })
  }, [hasMath])

  // Streaming cursor: inject after last text node
  useEffect(() => {
    if (!streaming || !containerRef.current) return
    const container = containerRef.current

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let lastTextNode: Node | null = null
    let node: Node | null
    while ((node = walker.nextNode())) lastTextNode = node

    if (!lastTextNode?.parentElement) return

    const cursor = document.createElement('span')
    cursor.className =
      'ml-0.5 inline-block h-[1em] w-[2px] translate-y-[1px] animate-pulse rounded-sm bg-current opacity-80'
    cursor.setAttribute('aria-hidden', 'true')
    lastTextNode.parentElement.appendChild(cursor)
    return () => cursor.remove()
  })

  if (!content?.replace(/\\[nr]/g, '\n').trim()) return <>{emptyFallback}</>
  if (mode === 'plainSummary') return <>{extractMarkdownSummary(content)}</>

  const remarkPlugins: Parameters<typeof ReactMarkdown>[0]['remarkPlugins'] = [remarkGfm, remarkHeadingIds]
  if (hasMath) remarkPlugins.push(remarkMath)

  const rehypePlugins: Parameters<typeof ReactMarkdown>[0]['rehypePlugins'] = []
  if (hasMath) rehypePlugins.push(rehypeKatex)

  return (
    <div
      ref={containerRef}
      aria-live={streaming ? 'polite' : undefined}
      className={cn(
        'prose dark:prose-invert max-w-none',
        modeClassName[mode],
        compact && 'prose-sm',
        '[&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        '[&_table]:my-0 [&_th]:whitespace-nowrap [&_td]:align-top',
        '[&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-0',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          // ── Headings ────────────────────────────────────────────────────────
          h1: ({ children, id, ...props }) =>
            shouldShowAnchors ? (
              <MarkdownHeading
                level={1}
                anchorId={id}
                {...(onHeadingAnchorClick ? { onAnchorClick: onHeadingAnchorClick } : {})}
                {...props}
              >
                {children}
              </MarkdownHeading>
            ) : (
              <h1 id={id} {...props}>
                {children}
              </h1>
            ),
          h2: ({ children, id, ...props }) =>
            shouldShowAnchors ? (
              <MarkdownHeading
                level={2}
                anchorId={id}
                {...(onHeadingAnchorClick ? { onAnchorClick: onHeadingAnchorClick } : {})}
                {...props}
              >
                {children}
              </MarkdownHeading>
            ) : (
              <h2 id={id} {...props}>
                {children}
              </h2>
            ),
          h3: ({ children, id, ...props }) =>
            shouldShowAnchors ? (
              <MarkdownHeading
                level={3}
                anchorId={id}
                {...(onHeadingAnchorClick ? { onAnchorClick: onHeadingAnchorClick } : {})}
                {...props}
              >
                {children}
              </MarkdownHeading>
            ) : (
              <h3 id={id} {...props}>
                {children}
              </h3>
            ),

          // ── Links ────────────────────────────────────────────────────────────
          a: ({ href, children, ...props }) => {
            const safeHref = sanitizeMarkdownUrl(href)
            if (!safeHref) {
              return <span className="text-muted-foreground underline decoration-dotted">{children}</span>
            }
            const external = /^https?:\/\//i.test(safeHref)
            return (
              <a
                {...props}
                href={safeHref}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
              >
                {children}
              </a>
            )
          },

          // ── Code ─────────────────────────────────────────────────────────────
          code: ({ className: codeClassName, children }) => {
            const match = /language-(\w+)/.exec(codeClassName ?? '')
            const code = String(children).replace(/\n$/, '')

            // Inline code: no language class AND no newlines
            if (!match && !code.includes('\n')) {
              return <code className={cn('rounded bg-muted px-1 py-0.5 text-[0.92em]', codeClassName)}>{children}</code>
            }

            return (
              <MarkdownCodeBlock
                code={code}
                {...(match?.[1] ? { language: match[1] } : {})}
                compact={compact || mode === 'compactRichText'}
              />
            )
          },

          // ── Tables ────────────────────────────────────────────────────────────
          table: ({ children }) => (
            <div className="not-prose my-4 overflow-x-auto rounded-md border">
              <table className="m-0 w-full min-w-max border-collapse text-sm">{children}</table>
            </div>
          ),

          // ── Images ────────────────────────────────────────────────────────────
          img: ({ src, alt, title }) => {
            if (!allowImages) {
              return (
                <span className="text-muted-foreground inline-flex items-center gap-1 rounded border border-dashed px-2 py-1 text-xs">
                  <span aria-hidden="true">🖼</span>
                  <span>{alt || t('imageLabel')}</span>
                </span>
              )
            }
            const safeHref = sanitizeMarkdownImageUrl(typeof src === 'string' ? src : undefined)
            return (
              <MarkdownImage
                {...(safeHref ? { src: safeHref } : {})}
                {...(alt ? { alt } : {})}
                {...(title ? { title } : {})}
              />
            )
          },

          // ── Paragraphs (streaming cursor) ──────────────────────────────────
          p: ({ children, node }) => {
            const isLast = streaming && node?.position?.end?.offset === content.length
            return (
              <p>
                {children}
                {isLast && <AiStreamingCursor />}
              </p>
            )
          },

          // ── List items (streaming cursor) ──────────────────────────────────
          li: ({ children, node }) => {
            const isLast = streaming && node?.position?.end?.offset === content.length
            return (
              <li>
                {children}
                {isLast && <AiStreamingCursor />}
              </li>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
