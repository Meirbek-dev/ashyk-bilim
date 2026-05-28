'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { useTranslations } from 'next-intl'
import * as Si from '@icons-pack/react-simple-icons'
import type { TypedNodeViewProps } from '@components/Objects/Editor/core'
import { useEmbedPanelStore } from '../../Toolbar/EmbedPanel/EmbedPanelStore'
import { buildExcalidrawSrc } from './embed-validators'
import type { EmbedBlockAttrs } from './EmbedBlock'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_HEIGHT = 500
const MIN_HEIGHT = 100
const MAX_HEIGHT = 1200

/**
 * Clamps a height value to the Excalidraw-specific range [MIN_HEIGHT, MAX_HEIGHT].
 * Note: clampEmbedHeight uses [200, 1200] globally; Excalidraw allows min 100px.
 */
function clampExcalidrawHeight(raw: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, raw))
}

// ── ExcalidrawNodeView ────────────────────────────────────────────────────────

/**
 * NodeView for Excalidraw embeds.
 *
 * - Uses a `mounted` guard to render the `<iframe>` only in browser environments
 *   (Requirement 5.6 — no SSR errors).
 * - In authoring mode: shows a drag handle for resizing and an overlay toolbar
 *   with "Edit" and "Delete" buttons (Requirements 5.4, 5.5, 8.1–8.7, 12.7).
 * - In read-only mode: hides the overlay toolbar and enables pointer events on
 *   the iframe so students can interact with the canvas (Requirement 5.4).
 */
const ExcalidrawNodeView = (props: TypedNodeViewProps<EmbedBlockAttrs>) => {
  const { node, editor, getPos, updateAttributes } = props
  const { url, height: attrHeight } = node.attrs

  const t = useTranslations('DashPage.Editor.EmbedPanel')
  const tCommon = useTranslations('Common')
  const { isEditable } = editor

  // ── SSR guard ──────────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // ── Height state ───────────────────────────────────────────────────────────
  const [height, setHeight] = useState<number>(() =>
    clampExcalidrawHeight(typeof attrHeight === 'number' && attrHeight > 0 ? attrHeight : DEFAULT_HEIGHT),
  )

  // Keep local height in sync when node attrs change externally
  useEffect(() => {
    if (typeof attrHeight === 'number' && attrHeight > 0) {
      setHeight(clampExcalidrawHeight(attrHeight))
    }
  }, [attrHeight])

  // ── Resize drag logic ──────────────────────────────────────────────────────
  const dragStartY = useRef<number>(0)
  const dragStartHeight = useRef<number>(0)
  const isDragging = useRef<boolean>(false)

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging.current) return
    const delta = e.clientY - dragStartY.current
    const newHeight = clampExcalidrawHeight(dragStartHeight.current + delta)
    setHeight(newHeight)
  }, [])

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!isDragging.current) return
      isDragging.current = false
      const delta = e.clientY - dragStartY.current
      const finalHeight = clampExcalidrawHeight(dragStartHeight.current + delta)
      setHeight(finalHeight)
      updateAttributes({ height: finalHeight })
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    },
    [handlePointerMove, updateAttributes],
  )

  const handleResizeHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      isDragging.current = true
      dragStartY.current = e.clientY
      dragStartHeight.current = height
      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp)
    },
    [height, handlePointerMove, handlePointerUp],
  )

  // ── Embed Panel store ──────────────────────────────────────────────────────
  const openForEdit = useEmbedPanelStore((s: ReturnType<typeof useEmbedPanelStore.getState>) => s.openForEdit)
  const editTriggerRef = useRef<HTMLButtonElement>(null)

  const handleEdit = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (pos === undefined || !url) return
    openForEdit(pos, { type: 'excalidraw', url }, editTriggerRef)
  }, [getPos, openForEdit, url])

  const handleDelete = useCallback(() => {
    editor.chain().focus().deleteNode('embedBlock').run()
  }, [editor])

  // ── Render ─────────────────────────────────────────────────────────────────
  const iframeSrc = url ? buildExcalidrawSrc(url) : ''

  return (
    <NodeViewWrapper className="excalidraw-node-view w-full">
      <div
        className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
        style={{ height: `${height}px` }}
      >
        {/* iframe — only rendered in browser environments */}
        {mounted && url ? (
          <iframe
            src={iframeSrc}
            title={t('providers.excalidraw.label')}
            className="h-full w-full border-0"
            style={{
              pointerEvents: isEditable ? 'none' : 'auto',
            }}
            allowFullScreen
            loading="lazy"
          />
        ) : (
          /* Placeholder shown during SSR or when URL is missing */
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <Si.SiExcalidraw className="size-10 text-gray-300" />
            <p className="text-sm text-gray-400">
              {url ? `${tCommon('loading')} ${t('providers.excalidraw.label')}…` : t('noUrlConfigured')}
            </p>
          </div>
        )}

        {/* Overlay toolbar — authoring mode only */}
        {isEditable && (
          <div
            className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-white/90 p-1 shadow-md backdrop-blur-sm"
            style={{ pointerEvents: 'auto' }}
          >
            <button
              ref={editTriggerRef}
              type="button"
              aria-label={`${t('editButton')} ${t('providers.excalidraw.label')}`}
              onClick={handleEdit}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              {/* Pencil icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={`${t('deleteButton')} ${t('providers.excalidraw.label')}`}
              onClick={handleDelete}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              {/* Trash icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          </div>
        )}

        {/* Resize handle — authoring mode only, bottom edge */}
        {isEditable && (
          <div
            role="separator"
            aria-label={`${t('resize')} ${t('providers.excalidraw.label')}`}
            aria-orientation="horizontal"
            className="absolute right-0 bottom-0 left-0 flex h-3 cursor-ns-resize items-center justify-center"
            style={{ pointerEvents: 'auto' }}
            onPointerDown={handleResizeHandlePointerDown}
          >
            <div className="h-1 w-12 rounded-full bg-gray-300 opacity-60 transition-opacity hover:opacity-100" />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export default ExcalidrawNodeView
