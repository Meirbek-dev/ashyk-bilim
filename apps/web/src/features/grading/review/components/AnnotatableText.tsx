'use client';

/**
 * AnnotatableText
 *
 * Renders a plain-text student answer block where teachers can:
 *  1. Select a passage to add an inline comment
 *  2. Hover over existing highlights to see / remove the comment
 *
 * Character offsets are computed against the raw `text` prop (not the DOM),
 * so they are stable regardless of how the text is rendered.
 */
import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TextAnnotation } from '../AnnotationContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectionState {
  start: number;
  end: number;
  selectedText: string;
  /** Approximate rect used to anchor the add-comment toolbar */
  rect: DOMRect;
}

// ─── Segment model ────────────────────────────────────────────────────────────

type Segment = { type: 'plain'; text: string } | { type: 'annotated'; text: string; annotation: TextAnnotation };

function buildSegments(text: string, annotations: TextAnnotation[]): Segment[] {
  if (!annotations.length) return [{ type: 'plain', text }];

  // Sort and merge overlapping ranges so we never double-highlight
  const sorted = [...annotations].toSorted((a, b) => a.start - b.start);
  const merged: TextAnnotation[] = [];
  for (const ann of sorted) {
    const prev = merged.at(-1);
    if (prev && ann.start < prev.end) {
      // Extend prev range (keep first annotation's comment)
      prev.end = Math.max(prev.end, ann.end);
    } else {
      merged.push({ ...ann });
    }
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const ann of merged) {
    const start = Math.max(0, ann.start);
    const end = Math.min(text.length, ann.end);
    if (cursor < start) segments.push({ type: 'plain', text: text.slice(cursor, start) });
    segments.push({ type: 'annotated', text: text.slice(start, end), annotation: ann });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ type: 'plain', text: text.slice(cursor) });
  return segments;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AnnotatableTextProps {
  text: string;
  annotations: TextAnnotation[];
  readOnly?: boolean;
  onAdd: (a: Omit<TextAnnotation, 'id' | 'itemUuid'>) => void;
  onRemove: (annotationId: string) => void;
}

export default function AnnotatableText({
  text,
  annotations,
  readOnly = false,
  onAdd,
  onRemove,
}: AnnotatableTextProps) {
  const t = useTranslations('Features.Grading.Annotation');
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [comment, setComment] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleMouseUp = () => {
    if (readOnly) return;
    const sel = globalThis.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return;
    if (!containerRef.current.contains(sel.anchorNode)) return;

    const range = sel.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(containerRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const selectedText = sel.toString().trim();
    if (!selectedText) return;
    const end = start + selectedText.length;
    const rect = range.getBoundingClientRect();
    setSelection({ start, end, selectedText, rect });
    setComment('');
  };

  const cancelSelection = () => {
    setSelection(null);
    setComment('');
    globalThis.getSelection()?.removeAllRanges();
  };

  const confirmAnnotation = () => {
    if (!selection || !comment.trim()) return;
    onAdd({
      start: selection.start,
      end: selection.end,
      selectedText: selection.selectedText,
      comment: comment.trim(),
    });
    cancelSelection();
  };

  const segments = buildSegments(text, annotations);

  return (
    <div className="space-y-2">
      {/* Text display */}
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className={cn(
          'bg-card rounded-md border p-3 text-sm whitespace-pre-wrap leading-relaxed',
          !readOnly && 'select-text cursor-text',
        )}
      >
        {segments.map((seg, i) =>
          seg.type === 'plain' ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <span
              key={i}
              className={cn(
                'relative rounded-sm px-0.5 py-0.5',
                hoveredId === seg.annotation.id
                  ? 'bg-amber-300/80 dark:bg-amber-500/50'
                  : 'bg-amber-200/70 dark:bg-amber-500/30',
              )}
              onMouseEnter={() => setHoveredId(seg.annotation.id)}
              onMouseLeave={() => setHoveredId(null)}
              title={seg.annotation.comment}
            >
              {seg.text}
              {!readOnly && hoveredId === seg.annotation.id && (
                <button
                  type="button"
                  aria-label={t('removeAnnotation')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(seg.annotation.id);
                  }}
                  className="bg-destructive text-destructive-foreground absolute -top-2 -right-2 z-10 flex size-4 items-center justify-center rounded-full shadow"
                >
                  <X className="size-2.5" />
                </button>
              )}
            </span>
          ),
        )}
      </div>

      {/* Add-comment panel (appears below text when selection is active) */}
      {selection && (
        <div className="space-y-2 rounded-md border bg-amber-50/80 p-3 dark:bg-amber-900/20">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            {t('addNoteFor', {
              text: selection.selectedText.slice(0, 60) + (selection.selectedText.length > 60 ? '…' : ''),
            })}
          </p>
          <Textarea
            
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('commentPlaceholder')}
            className="min-h-16 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                confirmAnnotation();
              }
              if (e.key === 'Escape') cancelSelection();
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={confirmAnnotation}
              disabled={!comment.trim()}
            >
              {t('addNote')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={cancelSelection}
            >
              {t('cancel')}
            </Button>
            <span className="text-muted-foreground ml-auto text-xs">{t('ctrlEnterHint')}</span>
          </div>
        </div>
      )}

      {/* Annotation list below text */}
      {annotations.length > 0 && (
        <ul className="space-y-1">
          {annotations.map((ann, idx) => (
            <li
              key={ann.id}
              className="flex items-start gap-2 rounded-md border bg-amber-50/60 px-3 py-1.5 text-xs dark:bg-amber-900/10"
              onMouseEnter={() => setHoveredId(ann.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span className="mt-0.5 shrink-0 rounded-full bg-amber-400/70 px-1.5 text-[10px] font-semibold text-amber-900">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-muted-foreground line-clamp-1 italic">"{ann.selectedText}"</span>
                <span className="ml-1 font-medium">{ann.comment}</span>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={t('removeAnnotation')}
                  onClick={() => onRemove(ann.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
