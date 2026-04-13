'use client';

import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { Table, Plus, Columns, Minus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TableDropdownProps {
  editor: Editor;
}

export function TableDropdown({ editor }: TableDropdownProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label={t('table')}
            title={t('table')}
          >
            <Table className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent
        side="bottom"
        align="start"
      >
        <DropdownMenuItem
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <Table className="size-4" />
          <span>{t('insertTable')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
          <Plus className="size-4" />
          <span>{t('addRowBelow')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
          <Columns className="size-4" />
          <span>{t('addColumnRight')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()}>
          <Minus className="size-4" />
          <span>{t('deleteRow')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => editor.chain().focus().deleteColumn().run()}
        >
          <Trash2 className="size-4" />
          <span>{t('deleteColumn')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
