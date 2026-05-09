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

export function normalizeTiptapJsonContent(content: unknown, fallback: Content = EMPTY_TIPTAP_DOC): Content {
  if (isTiptapJsonDoc(content)) {
    return content;
  }

  if (isRecord(content) && Array.isArray(content.content)) {
    return {
      type: 'doc',
      content: content.content,
    };
  }

  return fallback;
}
