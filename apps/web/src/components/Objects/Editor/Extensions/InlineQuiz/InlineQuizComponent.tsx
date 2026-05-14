'use client';

/**
 * InlineQuizComponent — NodeView for the InlineQuiz TipTap node.
 *
 * Renders either the author view (for teachers editing the lesson) or the
 * attempt view (for students consuming the lesson).
 */

import { useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';
import type { InlineQuizAttrs } from './types';
import InlineQuizAuthor from './InlineQuizAuthor';
import InlineQuizAttempt from './InlineQuizAttempt';

const InlineQuizComponent = (props: TypedNodeViewProps<InlineQuizAttrs>) => {
  const { node, updateAttributes, editor } = props;
  const { assessmentUuid } = node.attrs;
  const editable = editor.isEditable;

  const handleAssessmentCreated = useCallback(
    (uuid: string) => {
      updateAttributes({ assessmentUuid: uuid });
    },
    [updateAttributes],
  );

  const renderContent = () => {
    if (editable) {
      return (
        <InlineQuizAuthor
          assessmentUuid={assessmentUuid}
          onAssessmentCreated={handleAssessmentCreated}
        />
      );
    }

    if (!assessmentUuid) {
      return (
        <div className="border-muted-foreground/30 text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
          Quiz not configured
        </div>
      );
    }

    return <InlineQuizAttempt assessmentUuid={assessmentUuid} />;
  };

  return <NodeViewWrapper className="inline-quiz">{renderContent()}</NodeViewWrapper>;
};

export default InlineQuizComponent;
