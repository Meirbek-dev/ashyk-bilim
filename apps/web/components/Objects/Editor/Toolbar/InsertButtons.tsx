'use client';

import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { createInsertItems, INSERT_CATEGORY_LABELS } from './insert-items';

interface InsertButtonsProps {
  editor: Editor;
}

export function InsertButtons({ editor }: InsertButtonsProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');
  const items = createInsertItems(t).filter((item) => item.includeInToolbar);

  const groups = (['basic', 'media', 'interactive'] as const)
    .map((category) => ({
      category,
      items: items.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <TooltipProvider delay={150}>
      <div className="flex flex-wrap items-center gap-1">
        {groups.map((group, index) => (
          <div
            key={group.category}
            className="flex items-center gap-1"
          >
            <div
              className="border-border/70 bg-muted/30 flex flex-wrap items-center gap-1 rounded-xl border px-1 py-1"
              role="group"
              aria-label={t(INSERT_CATEGORY_LABELS[group.category])}
            >
              {group.items.map((item) => (
                <Tooltip key={item.id}>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => item.run(editor)}
                        aria-label={item.label}
                        title={item.label}
                        className=""
                      >
                        {item.icon}
                      </Button>
                    }
                  />
                  <TooltipContent side="bottom">
                    <div className="space-y-0.5">
                      <p className="font-medium">{item.label}</p>
                      <p className="text-background/80">{item.description}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            {index < groups.length - 1 ? (
              <Separator
                orientation="vertical"
                className="mx-1 h-6"
              />
            ) : null}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
