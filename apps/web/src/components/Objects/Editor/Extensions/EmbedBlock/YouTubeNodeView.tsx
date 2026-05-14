'use client';

import { YouTubeEmbed } from '@next/third-parties/google';
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import { NodeViewWrapper } from '@tiptap/react';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';
import type { EmbedBlockAttrs } from './EmbedBlock';

/**
 * YouTubeNodeView
 *
 * Renders a YouTube video embed using `<YouTubeEmbed>` from `@next/third-parties/google`
 * in a responsive 16:9 container with rounded corners.
 *
 * - `node.attrs.url` contains the extracted video ID (not the full URL).
 * - No overlay toolbar in either authoring or read-only mode (YouTube embeds are view-only).
 *
 * Requirements: 4.4, 4.7, 4.8
 */
const YouTubeNodeView = (props: TypedNodeViewProps<EmbedBlockAttrs>) => {
  const { url } = props.node.attrs;
  const { isEditable } = useEditorProvider();

  // `url` stores the extracted video ID from parseYouTubeUrl
  const videoId = url;

  if (!videoId) {
    return (
      <NodeViewWrapper className="youtube-node-view w-full">
        <div
          className="flex min-h-[200px] w-full items-center justify-center rounded-md border border-red-200 bg-red-50 p-6 text-center"
          role="alert"
        >
          <p className="text-sm text-red-600">Invalid or missing YouTube video ID.</p>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className="youtube-node-view w-full"
      // Prevent the editor from intercepting pointer events on the embed in read-only mode
      data-drag-handle={isEditable ? '' : undefined}
    >
      {/* 16:9 responsive container with border-radius ≥ 4px (rounded-md = 6px) */}
      <div className="aspect-video w-full overflow-hidden rounded-md">
        <YouTubeEmbed
          videoid={videoId}
          style="height: 100%; width: 100%; max-width: none;"
          params="rel=0"
        />
      </div>
    </NodeViewWrapper>
  );
};

export default YouTubeNodeView;
