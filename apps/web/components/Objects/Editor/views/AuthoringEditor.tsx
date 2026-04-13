'use client';

import { ActivityAIChatProvider } from '@components/Contexts/AI/ActivityAIChatContext';
import { CourseProvider } from '@components/Contexts/CourseContext';
import { EditorContent } from '@tiptap/react';
import { useEditorInstance } from '@components/Objects/Editor/core';
import type { ActivityRef } from '@components/Objects/Editor/core/editor-types';
import { EditorToolbar } from '../Toolbar/EditorToolbar';
import { BubbleToolbar } from '../menus/BubbleToolbar';
import { FloatingPlusButton } from '../menus/FloatingPlusButton';
import { SlashCommandMenu } from '../Toolbar/SlashCommandMenu';
import { EditorShell, EditorHeader } from '../chrome';
import AIEditorToolkit from '../AI/AIEditorToolkit';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslations } from 'next-intl';
import { Monitor } from 'lucide-react';
import { useState } from 'react';
import '@components/Objects/Editor/styles/prosemirror.css';

interface AuthoringEditorProps {
  content: unknown;
  activity: ActivityRef;
  course: {
    course_uuid: string;
    name: string;
    thumbnail_image?: string | null;
  };
  platform: unknown;
  onContentChange: (content: unknown) => void;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  setContent: (content: unknown) => void;
}

export function AuthoringEditor(props: AuthoringEditorProps) {
  const t = useTranslations('DashPage.Editor.Editor');
  const [isAIOpen, setIsAIOpen] = useState(false);

  const courseUuid = props.course.course_uuid.slice(7);
  const activityUuid = props.activity.activity_uuid.slice(9);

  const editor = useEditorInstance({
    preset: 'authoring',
    activity: props.activity,
    content: props.content,
    onUpdate: (json) => props.onContentChange(json),
  });

  const { setContent } = props;

  function handleContentSave() {
    if (editor) {
      setContent(editor.getJSON());
    }
  }

  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <div className="bg-muted flex h-screen w-full items-center justify-center p-4">
        <div className="rounded-lg bg-white p-6 text-center shadow-md">
          <h2 className="mb-4 text-xl font-bold">{t('mobileTitle')}</h2>
          <Monitor
            className="mx-auto my-5"
            size={60}
          />
          <p>{t('mobileMessage1')}</p>
          <p>{t('mobileMessage2')}</p>
        </div>
      </div>
    );
  }

  return (
    <CourseProvider courseuuid={props.course.course_uuid}>
      <ActivityAIChatProvider activityUuid={props.activity.activity_uuid}>
        <EditorShell>
          {/* Header */}
          <EditorHeader
            courseName={props.course.name}
            activityName={props.activity.name ?? ''}
            courseUuid={courseUuid}
            activityUuid={activityUuid}
            saveState={props.saveState}
            onSave={handleContentSave}
          />

          {/* Sticky toolbar */}
          <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
            <div className="px-3">
              <EditorToolbar
                editor={editor}
                onAIToggle={() => setIsAIOpen((prev) => !prev)}
              />
            </div>
          </div>

          {/* Content area */}
          <div className="prosemirror-authoring bg-background flex-1 overflow-y-auto">
            <div className="py-6">
              {editor ? (
                <>
                  <BubbleToolbar editor={editor} />
                  <FloatingPlusButton editor={editor} />
                  <AIEditorToolkit
                    activity={props.activity}
                    editor={editor}
                    isOpen={isAIOpen}
                    onClose={() => setIsAIOpen(false)}
                  />
                  <SlashCommandMenu editor={editor} />
                </>
              ) : null}
              <EditorContent editor={editor} />
            </div>
          </div>
        </EditorShell>
      </ActivityAIChatProvider>
    </CourseProvider>
  );
}
