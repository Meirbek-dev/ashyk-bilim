'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';
import { useEmbedPanelStore } from '../../Toolbar/EmbedPanel/EmbedPanelStore';
import type { EmbedBlockAttrs } from './EmbedBlock';
import { clampEmbedHeight } from './EmbedBlockNodeView';
import { buildTldrawSrc } from './embed-validators';

// ── Constants ─────────────────────────────────────────────────────────────────

const TLDRAW_MIN_HEIGHT = 200;
const TLDRAW_MAX_HEIGHT = 2000;
const TLDRAW_DEFAULT_HEIGHT = 500;

// ── TldrawNodeView ────────────────────────────────────────────────────────────

const TldrawNodeView = (props: TypedNodeViewProps<EmbedBlockAttrs>) => {
  const { node, updateAttributes, deleteNode, getPos, editor } = props;
  const { url, height: attrHeight } = node.attrs;

  const t = useTranslations('DashPage.Editor.EmbedPanel');
  const isEditable = editor.isEditable;

  // ── SSR guard ──────────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Height state (local during drag, persisted on commit) ──────────────────
  const initialHeight =
    typeof attrHeight === 'number' && attrHeight > 0
      ? clampEmbedHeight(attrHeight)
      : TLDRAW_DEFAULT_HEIGHT;

  const [displayHeight, setDisplayHeight] = useState(initialHeight);

  // Keep display height in sync when the node attribute changes externally
  useEffect(() => {
    if (typeof attrHeight === 'number' && attrHeight > 0) {
      setDisplayHeight(clampEmbedHeight(attrHeight));
    }
  }, [attrHeight]);

  // ── Drag-handle resize ─────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isEditable) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      dragStateRef.current = {
        startY: e.clientY,
        startHeight: displayHeight,
      };
    },
    [isEditable, displayHeight],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStateRef.current) return;
      const delta = e.clientY - dragStateRef.current.startY;
      const raw = dragStateRef.current.startHeight + delta;
      const clamped = Math.min(TLDRAW_MAX_HEIGHT, Math.max(TLDRAW_MIN_HEIGHT, raw));
      setDisplayHeight(clamped);
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStateRef.current) return;
      e.currentTarget.releasePointerCapture(e.pointerId);

      const delta = e.clientY - dragStateRef.current.startY;
      const raw = dragStateRef.current.startHeight + delta;
      const committed = Math.min(TLDRAW_MAX_HEIGHT, Math.max(TLDRAW_MIN_HEIGHT, raw));
      dragStateRef.current = null;

      updateAttributes({ height: committed });
    },
    [updateAttributes],
  );

  // ── Edit button ────────────────────────────────────────────────────────────
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const openForEdit = useEmbedPanelStore((s: ReturnType<typeof useEmbedPanelStore.getState>) => s.openForEdit);

  const handleEdit = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos === undefined || !url) return;
    openForEdit(pos, { type: 'tldraw', url }, editButtonRef as React.RefObject<HTMLButtonElement>);
  }, [getPos, openForEdit, url]);

  // ── Delete button ──────────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    deleteNode();
  }, [deleteNode]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const iframeSrc = url ? buildTldrawSrc(url) : null;

  return (
    <NodeViewWrapper className="tldraw-node-view w-full">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-gray-200"
        style={{ height: `${displayHeight}px` }}
      >
        {/* iframe — only rendered in browser environments */}
        {mounted && iframeSrc ? (
          <iframe
            src={iframeSrc}
            className="h-full w-full border-0"
            style={{
              pointerEvents: isEditable ? 'none' : 'auto',
            }}
            allowFullScreen
            title="tldraw embed"
          />
        ) : (
          !mounted && (
            <div className="flex h-full w-full items-center justify-center bg-gray-50">
              <p className="text-sm text-gray-400">Loading tldraw…</p>
            </div>
          )
        )}

        {/* Overlay toolbar — authoring mode only */}
        {isEditable && (
          <div
            className="absolute right-2 top-2 flex gap-1 rounded-lg bg-white/90 p-1 shadow-md backdrop-blur-sm"
            style={{ pointerEvents: 'auto' }}
          >
            <button
              ref={editButtonRef}
              type="button"
              aria-label={t('editButton') + ' tldraw embed'}
              onClick={handleEdit}
              className="rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              {t('editButton')}
            </button>
            <button
              type="button"
              aria-label={t('deleteButton') + ' tldraw embed'}
              onClick={handleDelete}
              className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
            >
              {t('deleteButton')}
            </button>
          </div>
        )}

        {/* Resize handle — authoring mode only */}
        {isEditable && (
          <div
            className="absolute bottom-0 left-0 right-0 flex cursor-ns-resize items-center justify-center"
            style={{ height: '12px', pointerEvents: 'auto' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            aria-hidden="true"
          >
            <div className="h-1 w-12 rounded-full bg-gray-300 opacity-60 hover:opacity-100" />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export default TldrawNodeView;
