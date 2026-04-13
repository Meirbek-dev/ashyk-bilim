'use client';

import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeadingDropdownProps {
  editor: Editor;
  headingLevel: number;
}

export function HeadingDropdown({ editor, headingLevel }: HeadingDropdownProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');

  const headingLabel = headingLevel === 0 ? t('paragraph') : t('headingLevel', { level: headingLevel });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="w-28 justify-between gap-1"
            aria-label={t('heading')}
            title={t('heading')}
          >
            <span className="truncate text-xs">{headingLabel}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent
        side="bottom"
        align="start"
      >
        <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
          <span className="text-sm">{t('paragraph')}</span>
        </DropdownMenuItem>
        {([1, 2, 3, 4, 5, 6] as const).map((level) => (
          <DropdownMenuItem
            key={level}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          >
            <span
              className="font-semibold"
              style={{ fontSize: `${Math.max(0.75, 1.1 - level * 0.06)}rem` }}
            >
              {t('headingLevel', { level })}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
