'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, GripHorizontal, Pencil, Trash2 } from 'lucide-react';
import { NodeViewWrapper } from '@tiptap/react';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';
import { useEmbedPanelStore } from '../../Toolbar/EmbedPanel/EmbedPanelStore';
import type { EmbedBlockAttrs } from './EmbedBlock';
import { buildEmbedSrc } from './embed-validators';
import { getEmbedProvider } from './embed-options';
import type { EmbedType } from './embed-options';
import { useTranslations } from 'next-intl';

const MIN_HEIGHT = 240;
const MAX_HEIGHT = 1600;

function clampHeight(value: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value));
}

export default function GenericEmbedNodeView(props: TypedNodeViewProps<EmbedBlockAttrs>) {
  const { node, editor, updateAttributes, deleteNode, getPos } = props;
  const { type, url, height: attrHeight } = node.attrs;
  const provider = getEmbedProvider(type);
  const t = useTranslations('DashPage.Editor.EmbedPanel');
  const { isEditable } = editor;
  const [mounted, setMounted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(!isEditable);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const openForEdit = useEmbedPanelStore((state) => state.openForEdit);

  const initialHeight = useMemo(() => {
    const fallback = provider?.defaultHeight ?? 520;
    return clampHeight(typeof attrHeight === 'number' && attrHeight > 0 ? attrHeight : fallback);
  }, [attrHeight, provider?.defaultHeight]);
  const [displayHeight, setDisplayHeight] = useState(initialHeight);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setDisplayHeight(initialHeight);
  }, [initialHeight]);

  const src = provider && url ? buildEmbedSrc(provider.type, url) : '';

  const handleEdit = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos === undefined || !provider || !url) return;
    openForEdit(pos, { type: provider.type as EmbedType, url }, editButtonRef);
  }, [getPos, openForEdit, provider, url]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isEditable) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        startY: event.clientY,
        startHeight: displayHeight,
      };
    },
    [displayHeight, isEditable],
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    setDisplayHeight(clampHeight(dragStateRef.current.startHeight + event.clientY - dragStateRef.current.startY));
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStateRef.current) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      const nextHeight = clampHeight(dragStateRef.current.startHeight + event.clientY - dragStateRef.current.startY);
      dragStateRef.current = null;
      setDisplayHeight(nextHeight);
      updateAttributes({ height: nextHeight });
    },
    [updateAttributes],
  );

  if (!provider || !url) {
    return (
      <NodeViewWrapper className="embed-block-node-view w-full">
        <div className="border-destructive/30 bg-destructive/5 text-destructive flex min-h-[160px] w-full items-center justify-center rounded-lg border p-6 text-center text-sm">
          {t('missingEmbed')}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className="embed-block-node-view my-4 w-full"
      data-drag-handle={isEditable ? '' : undefined}
    >
      <div
        className="border-border bg-card relative w-full overflow-hidden rounded-lg border"
        style={{ height: displayHeight }}
      >
        {mounted && src && isLoaded ? (
          <iframe
            src={src}
            title={`${provider.label} ${t('embed')}`}
            className="h-full w-full border-0"
            loading="lazy"
            allow={provider.allow ?? 'fullscreen; clipboard-read; clipboard-write'}
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"
            style={{ pointerEvents: isEditable ? 'none' : 'auto' }}
          />
        ) : (
          <div className="bg-muted/30 flex h-full min-h-[240px] flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="space-y-1.5">
              <p className="text-foreground text-sm font-semibold">{provider.label}</p>
              <p className="text-muted-foreground max-w-md text-sm">{provider.description}</p>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                contentEditable={false}
              >
                {t('openSource')}
                <ExternalLink className="size-3" />
              </a>
            </div>
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-2 text-sm font-medium"
              onClick={() => setIsLoaded(true)}
              contentEditable={false}
            >
              {t('loadEmbed')}
            </button>
          </div>
        )}

        {isEditable ? (
          <div
            className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-black/10 bg-white/95 p-1 text-gray-700 shadow-sm backdrop-blur"
            contentEditable={false}
            style={{ pointerEvents: 'auto' }}
          >
            <button
              ref={editButtonRef}
              type="button"
              aria-label={`${t('editButton')} ${provider.label} ${t('embed')}`}
              onClick={handleEdit}
              className="flex size-8 items-center justify-center rounded hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`${t('deleteButton')} ${provider.label} ${t('embed')}`}
              onClick={deleteNode}
              className="flex size-8 items-center justify-center rounded text-red-600 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-500"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ) : null}

        {isEditable ? (
          <div
            role="separator"
            aria-label={`${t('resize')} ${provider.label} ${t('embed')}`}
            aria-orientation="horizontal"
            className="absolute right-0 bottom-0 left-0 flex h-4 cursor-ns-resize items-center justify-center"
            contentEditable={false}
            style={{ pointerEvents: 'auto' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div className="flex h-2.5 w-16 items-center justify-center rounded-full bg-white/90 shadow-sm">
              <GripHorizontal className="size-4 text-gray-500" />
            </div>
          </div>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
