'use client';

import { YouTubeEmbed } from '@next/third-parties/google';
import { getYouTubeVideoId } from '@/lib/utils';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

const YoutubeNodeView = (props: NodeViewProps) => {
  const { node } = props;
  const { src, start, controls, nocookie } = node.attrs;

  const videoId = getYouTubeVideoId(src);

  if (!videoId) {
    return (
      <NodeViewWrapper className="youtube-node-view border-2 border-dashed border-red-300 p-4 text-center text-red-500">
        Invalid YouTube URL
      </NodeViewWrapper>
    );
  }

  const params = new URLSearchParams();
  if (start) params.append('start', start);
  if (controls === false) params.append('controls', '0');
  if (nocookie) params.append('nocookie', '1');
  params.append('rel', '0');

  return (
    <NodeViewWrapper className="youtube-node-view relative w-full">
      <div className="aspect-video w-full overflow-hidden rounded-lg shadow-sm ring-1 ring-gray-200/10">
        <YouTubeEmbed
          videoid={videoId}
          style="height: 100%; width: 100%; max-width: none;"
          params={params.toString()}
        />
      </div>
    </NodeViewWrapper>
  );
};

export default YoutubeNodeView;
