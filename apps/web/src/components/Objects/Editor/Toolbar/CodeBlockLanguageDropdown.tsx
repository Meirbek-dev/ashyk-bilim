'use client';

import type { Editor } from '@tiptap/react';
import { Code, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  CODE_BLOCK_LANGUAGE_VALUES,
  normalizeCodeBlockLanguage,
  PLAIN_TEXT_CODE_BLOCK_LANGUAGE,
  toCodeBlockLanguageAttribute,
} from '../core/code-block-languages';
import type { CodeBlockLanguageValue } from '../core/code-block-languages';

interface CodeBlockLanguageDropdownProps {
  editor: Editor;
  language: string | null;
}

const LANGUAGE_LABELS: Record<CodeBlockLanguageValue, string> = {
  [PLAIN_TEXT_CODE_BLOCK_LANGUAGE]: 'Plain text',
  css: 'CSS',
  html: 'HTML',
  java: 'Java',
  javascript: 'JavaScript',
  kotlin: 'Kotlin',
  python: 'Python',
  typescript: 'TypeScript',
};

export function CodeBlockLanguageDropdown({ editor, language }: CodeBlockLanguageDropdownProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');
  const activeLanguage = normalizeCodeBlockLanguage(language);

  const handleValueChange = (value: string) => {
    const nextLanguage = toCodeBlockLanguageAttribute(value);

    if (editor.isActive('codeBlock')) {
      editor.chain().focus().updateAttributes('codeBlock', { language: nextLanguage }).run();
      return;
    }

    editor
      .chain()
      .focus()
      .setCodeBlock(nextLanguage ? { language: nextLanguage } : undefined)
      .run();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="bg-muted max-w-40 justify-between gap-1.5"
            aria-label={t('codeBlockLanguage')}
            title={t('codeBlockLanguage')}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Code className="size-4 shrink-0" />
              <span className="truncate text-xs">{LANGUAGE_LABELS[activeLanguage]}</span>
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent
        side="bottom"
        align="start"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('codeBlockLanguage')}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuRadioGroup
          value={activeLanguage}
          onValueChange={handleValueChange}
        >
          <DropdownMenuRadioItem value={PLAIN_TEXT_CODE_BLOCK_LANGUAGE}>{t('plainText')}</DropdownMenuRadioItem>
          {CODE_BLOCK_LANGUAGE_VALUES.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
            >
              {LANGUAGE_LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
