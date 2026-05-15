'use client';

import { useCallback, useRef } from 'react';
import { YouTubeEmbed } from '@next/third-parties/google';
import { Pencil, Trash2 } from 'lucide-react';
import { NodeViewWrapper } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';
import { useEmbedPanelStore } from '../../Toolbar/EmbedPanel/EmbedPanelStore';
import type { EmbedBlockAttrs } from './EmbedBlock';
import { resolveYouTubeVideoId } from './embed-validators';

const YouTubeNodeView = (props: TypedNodeViewProps<EmbedBlockAttrs>) => {
  const { node, editor, deleteNode, getPos } = props;
  const { url } = node.attrs;
  const { isEditable } = editor;
  const videoId = url ? resolveYouTubeVideoId(url) : null;
  const t = useTranslations('DashPage.Editor.EmbedPanel');
  const openForEdit = useEmbedPanelStore((state) => state.openForEdit);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const handleEdit = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos === undefined || !url) return;
    openForEdit(pos, { type: 'youtube', url }, editButtonRef);
  }, [getPos, openForEdit, url]);

  if (!videoId) {
    return (
      <NodeViewWrapper className="youtube-node-view w-full">
        <div
          className="border-destructive/30 bg-destructive/5 text-destructive flex min-h-[200px] w-full items-center justify-center rounded-md border p-6 text-center text-sm"
          role="alert"
        >
          {t('errorYoutubeId')}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className="youtube-node-view relative my-4 w-full"
      data-drag-handle={isEditable ? '' : undefined}
    >
      <div className="aspect-video w-full overflow-hidden rounded-md">
        <YouTubeEmbed
          videoid={videoId}
          style="height: 100%; width: 100%; max-width: none;"
          params="rel=0"
        />
      </div>

      {isEditable ? (
        <div
          className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-black/10 bg-white/95 p-1 text-gray-700 shadow-sm backdrop-blur"
          contentEditable={false}
        >
          <button
            ref={editButtonRef}
            type="button"
            aria-label={`${t('editButton')} ${t('youtubeLabel')}`}
            onClick={handleEdit}
            className="flex size-8 items-center justify-center rounded hover:bg-gray-100"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`${t('deleteButton')} ${t('youtubeLabel')}`}
            onClick={deleteNode}
            className="flex size-8 items-center justify-center rounded text-red-600 hover:bg-red-50"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
};

export default YouTubeNodeView;
