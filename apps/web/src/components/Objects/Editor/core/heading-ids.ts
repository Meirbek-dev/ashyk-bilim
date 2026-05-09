import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface HeadingOutlineItem {
  level: number;
  text: string;
  id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function slugifyHeadingText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildHeadingId(text: string, occurrence: number): string {
  const slug = slugifyHeadingText(text) || 'section';
  return occurrence > 0 ? `heading-${slug}-${occurrence + 1}` : `heading-${slug}`;
}

export function extractHeadingOutline(doc: ProseMirrorNode): HeadingOutlineItem[] {
  const headings: HeadingOutlineItem[] = [];
  const slugCounts = new Map<string, number>();
  const seenIds = new Set<string>();

  doc.descendants((node) => {
    if (node.type.name !== 'heading') {
      return;
    }

    const level = typeof node.attrs.level === 'number' ? node.attrs.level : 1;
    const text = node.textContent || '';
    const slugKey = slugifyHeadingText(text) || 'section';
    const rawId = isRecord(node.attrs) && typeof node.attrs.id === 'string' ? node.attrs.id.trim() : '';
    let id = rawId;

    if (!id || seenIds.has(id)) {
      const occurrence = slugCounts.get(slugKey) ?? 0;
      id = buildHeadingId(text, occurrence);

      while (seenIds.has(id)) {
        const nextOccurrence = (slugCounts.get(slugKey) ?? 0) + 1;
        slugCounts.set(slugKey, nextOccurrence);
        id = buildHeadingId(text, nextOccurrence);
      }
    }

    slugCounts.set(slugKey, (slugCounts.get(slugKey) ?? 0) + 1);
    seenIds.add(id);

    headings.push({
      level,
      text,
      id,
    });
  });

  return headings;
}

export function collectHeadingIdUpdates(doc: ProseMirrorNode): { pos: number; id: string }[] {
  const updates: { pos: number; id: string }[] = [];
  const slugCounts = new Map<string, number>();
  const seenIds = new Set<string>();

  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') {
      return;
    }

    const text = node.textContent || '';
    const slugKey = slugifyHeadingText(text) || 'section';
    const rawId = isRecord(node.attrs) && typeof node.attrs.id === 'string' ? node.attrs.id.trim() : '';
    let nextId = rawId;

    if (!nextId || seenIds.has(nextId)) {
      const occurrence = slugCounts.get(slugKey) ?? 0;
      nextId = buildHeadingId(text, occurrence);

      while (seenIds.has(nextId)) {
        const nextOccurrence = (slugCounts.get(slugKey) ?? 0) + 1;
        slugCounts.set(slugKey, nextOccurrence);
        nextId = buildHeadingId(text, nextOccurrence);
      }
    }

    slugCounts.set(slugKey, (slugCounts.get(slugKey) ?? 0) + 1);
    seenIds.add(nextId);

    if (nextId !== rawId) {
      updates.push({
        pos,
        id: nextId,
      });
    }
  });

  return updates;
}
