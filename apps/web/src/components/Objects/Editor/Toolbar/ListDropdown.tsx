'use client';

import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { List, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ListDropdownProps {
  editor: Editor;
  isBulletList: boolean;
  isOrderedList: boolean;
}

export function ListDropdown({ editor, isBulletList, isOrderedList }: ListDropdownProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            className={isBulletList || isOrderedList ? 'bg-muted' : undefined}
            aria-label={t('lists')}
            title={t('lists')}
          >
            <List className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent
        side="bottom"
        align="start"
      >
        <DropdownMenuItem onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="size-4" />
          <span>{t('listOptions.bulletList')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="size-4" />
          <span>{t('listOptions.orderedList')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
