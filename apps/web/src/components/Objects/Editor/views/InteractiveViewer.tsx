'use client';

import EditorOptionsProvider from '@components/Contexts/Editor/EditorContext';
import { EditorContent } from '@tiptap/react';
import { useEditorInstance } from '@components/Objects/Editor/core';
import type { ActivityRef } from '@components/Objects/Editor/core';
import AICanvaToolkit from '@components/Objects/Activities/DynamicCanva/AI/AICanvaToolkit';
import TableOfContents from '@components/Objects/Activities/DynamicCanva/TableOfContents';
import { useIsMobile } from '@/hooks/use-mobile';
import '@components/Objects/Editor/styles/prosemirror.css';

interface InteractiveViewerProps {
  content: unknown;
  activity: ActivityRef;
}

export function InteractiveViewer(props: InteractiveViewerProps) {
  const isMobile = useIsMobile();

  const editor = useEditorInstance({
    preset: 'interactive',
    activity: props.activity,
    content: props.content,
  });

  return (
    <EditorOptionsProvider options={{ isEditable: false, mode: 'interactive' }}>
      <div className="prosemirror-interactive relative mx-auto w-full px-1 py-2 sm:px-2 xl:px-4">
        <div className="pointer-events-none absolute inset-0 z-[1000] [&>*]:pointer-events-auto">
          {editor ? (
            <AICanvaToolkit
              activity={props.activity}
              editor={editor}
            />
          ) : null}
        </div>
        <div className="prosemirror-interactive-layout">
          {!isMobile && (
            <div className="prosemirror-interactive-layout-toc">
              <TableOfContents editor={editor} />
            </div>
          )}
          <div className="prosemirror-interactive-layout-content">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </EditorOptionsProvider>
  );
}
