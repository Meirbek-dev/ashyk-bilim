'use client';

/**
 * OutlineRail — Left column of the 3-column studio layout.
 *
 * Shows the list of assessment items with drag-and-drop reordering.
 * Highlights the currently selected item.
 */

import { GripVertical, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OutlineItem {
  item_uuid: string;
  order: number;
  kind: string;
  title: string;
  max_score: number;
}

interface OutlineRailProps {
  items: OutlineItem[];
  selectedItemUuid: string | null;
  onSelectItem: (uuid: string) => void;
  onAddItem: () => void;
  onReorder?: (items: { item_uuid: string; order: number }[]) => void;
  disabled?: boolean;
}

export default function OutlineRail({
  items,
  selectedItemUuid,
  onSelectItem,
  onAddItem,
  disabled = false,
}: OutlineRailProps) {
  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-medium">Items</h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={onAddItem}
          disabled={disabled}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">No items yet. Click + to add one.</p>
        ) : (
          <ul
            className="divide-y"
            role="listbox"
            aria-label="Assessment items"
          >
            {items.map((item, idx) => (
              <li
                key={item.item_uuid}
                role="option"
                aria-selected={item.item_uuid === selectedItemUuid}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50',
                  item.item_uuid === selectedItemUuid && 'bg-primary/5 border-l-2 border-primary',
                )}
                onClick={() => onSelectItem(item.item_uuid)}
              >
                <GripVertical className="text-muted-foreground size-3 shrink-0 cursor-grab" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {idx + 1}. {item.title || item.kind}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {item.kind} • {item.max_score} pts
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
