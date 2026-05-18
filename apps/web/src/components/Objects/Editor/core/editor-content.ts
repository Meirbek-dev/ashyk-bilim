import type { Content, JSONContent } from '@tiptap/core';

export type TiptapJsonDoc = JSONContent & {
  type: 'doc';
  content: JSONContent[];
};

export const EMPTY_TIPTAP_DOC: TiptapJsonDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTiptapJsonDoc(content: unknown): content is TiptapJsonDoc {
  return isRecord(content) && content.type === 'doc' && Array.isArray(content.content);
}

function parseMaybeJsonString(content: unknown): unknown {
  if (typeof content !== 'string') {
    return content;
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content;
  }
}

function readStringAttr(attrs: Record<string, unknown> | null, key: string): string | null {
  const value = attrs?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function legacyBlockQuizToInlineQuiz(node: JSONContent): JSONContent {
  const attrs = isRecord(node.attrs) ? node.attrs : null;
  const assessmentUuid =
    readStringAttr(attrs, 'assessmentUuid') ??
    readStringAttr(attrs, 'assessment_uuid') ??
    readStringAttr(attrs, 'assessmentId') ??
    readStringAttr(attrs, 'assessment_id');

  return {
    type: 'inlineQuiz',
    attrs: {
      assessmentUuid,
    },
  };
}

function removeLegacyNodes(node: JSONContent): JSONContent {
  if (node.type === 'blockQuiz') {
    return legacyBlockQuizToInlineQuiz(node);
  }

  if (!Array.isArray(node.content)) {
    return node;
  }

  return {
    ...node,
    content: node.content.map(removeLegacyNodes),
  };
}

export function removeLegacyBlockQuizNodes(content: TiptapJsonDoc): TiptapJsonDoc {
  return {
    ...content,
    content: content.content.map(removeLegacyNodes),
  };
}

export function normalizeTiptapJsonContent(content: unknown, fallback: Content = EMPTY_TIPTAP_DOC): Content {
  const parsedContent = parseMaybeJsonString(content);

  if (isTiptapJsonDoc(parsedContent)) {
    return removeLegacyBlockQuizNodes(parsedContent);
  }

  if (isRecord(parsedContent) && Array.isArray(parsedContent.content)) {
    return removeLegacyBlockQuizNodes({
      type: 'doc',
      content: parsedContent.content,
    });
  }

  return fallback;
}
