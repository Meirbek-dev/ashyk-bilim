'use client';

import type { Announcements } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Returns DndContext `announcements` for screen-reader accessibility.
 *
 * Usage:
 * ```tsx
 * const announcements = useDndAnnouncements();
 * <DndContext announcements={announcements} ...>
 * ```
 *
 * The hook reads item positions from `SortableContext` via DndKit's built-in
 * `over` / `active` ids — the caller does not need to pass the items array.
 */
export function useDndAnnouncements(items: string[]): Announcements {
  const t = useTranslations('Common.DragAndDrop');

  const getPosition = useCallback((id: string | number) => items.indexOf(String(id)) + 1, [items]);

  const count = items.length;

  return {
    onDragStart({ active }) {
      const index = getPosition(active.id);
      return t('liftItem', { index, count });
    },
    onDragOver({ active, over }) {
      if (!over) return;
      const index = getPosition(over.id);
      return t('moveItem', { index, count });
    },
    onDragEnd({ active, over }) {
      if (!over) return;
      const index = getPosition(over.id);
      return t('dropItem', { index, count });
    },
    onDragCancel({ active }) {
      const index = getPosition(active.id);
      return t('cancelDrag', { index });
    },
  };
}
