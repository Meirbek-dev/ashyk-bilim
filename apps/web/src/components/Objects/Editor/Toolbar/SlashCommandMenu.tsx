'use client';

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useTranslations } from 'next-intl';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { useEffect, useMemo, useRef } from 'react';
import { closeSlashCommand } from '../core/slash-command';
import type { SlashCommandState } from '../core/slash-command';
import { createInsertItems, INSERT_CATEGORY_LABELS } from './insert-items';

type SlashItem = ReturnType<typeof createInsertItems>[number];

interface SlashCommandMenuProps {
  editor: Editor | null;
}

export function SlashCommandMenu({ editor }: SlashCommandMenuProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const slashState = useEditorState({
    editor,
    selector: (ctx) =>
      (ctx.editor?.storage as unknown as Record<string, unknown>)?.slashCommand as SlashCommandState | undefined,
  });

  const slashItems = useMemo(() => createInsertItems(t), [t]);

  useEffect(() => {
    if (!editor || !slashState?.active) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const { target } = event;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      closeSlashCommand(editor);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [editor, slashState?.active]);

  if (!slashState?.active || !editor) return null;

  const coords = editor.view.coordsAtPos(slashState.from);

  // Filter items by query
  const query = slashState.query.toLowerCase();
  const filteredItems = query
    ? slashItems.filter(
        (item) => item.label.toLowerCase().includes(query) || item.description.toLowerCase().includes(query),
      )
    : slashItems;

  // Group filtered items by category
  const groups = (['basic', 'media', 'interactive'] as const)
    .map((cat) => ({
      category: cat,
      items: filteredItems.filter((item) => item.category === cat),
    }))
    .filter((group) => group.items.length > 0);

  function runCommand(item: SlashItem) {
    if (!editor) return;
    const { to } = editor.state.selection;
    editor.chain().focus().deleteRange({ from: slashState!.from, to }).run();
    item.run(editor);
    closeSlashCommand(editor);
  }

  // Clamp position to viewport
  const viewportHeight = typeof globalThis.window !== 'undefined' ? window.innerHeight : 800;
  const menuHeight = 360;
  const top = coords.bottom + menuHeight > viewportHeight ? coords.top - menuHeight - 4 : coords.bottom + 4;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top,
        left: Math.max(8, coords.left),
        zIndex: 50,
      }}
    >
      <Command className="border-border bg-popover w-80 rounded-lg border shadow-lg">
        <CommandInput
          placeholder={t('slashSearchPlaceholder')}
          value={slashState.query}
          readOnly
        />
        <CommandList className="max-h-[320px]">
          <CommandEmpty>{t('slashNoResults')}</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup
              key={group.category}
              heading={t(INSERT_CATEGORY_LABELS[group.category])}
            >
              {group.items.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => runCommand(item)}
                  className="hover:border-border/70 hover:bg-accent/70 hover:text-foreground data-selected:border-border/70 data-selected:bg-accent data-selected:text-foreground flex cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 transition-colors"
                >
                  <span className="border-border/70 bg-muted/70 text-muted-foreground group-hover/command-item:border-primary/20 group-hover/command-item:bg-background group-hover/command-item:text-foreground group-data-selected/command-item:border-primary/25 group-data-selected/command-item:bg-background group-data-selected/command-item:text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors">
                    {item.icon}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-muted-foreground truncate text-xs">{item.description}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
