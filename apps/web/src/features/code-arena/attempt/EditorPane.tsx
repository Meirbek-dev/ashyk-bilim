'use client';

import { useRef } from 'react';
import { AlignLeft, Code2, RotateCcw, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CodeEditor } from '@/components/features/courses/code-challenges/CodeEditor';
import { LanguageSelector } from '@/components/features/courses/code-challenges/LanguageSelector';
import type { Judge0Language } from '../domain';
import type { CodeEditorPreferences } from '../hooks/useEditorPreferences';

interface EditorPaneProps {
  code: string;
  onCodeChange: (code: string) => void;
  languageId: number;
  onLanguageChange: (languageId: number) => void;
  languages: Judge0Language[];
  allowedLanguages?: number[];
  readOnly?: boolean;
  starterCode: string;
  preferences: CodeEditorPreferences;
  onPreferencesChange: (next: CodeEditorPreferences) => void;
  monacoOptions: Record<string, unknown>;
}

export function EditorPane({
  code,
  onCodeChange,
  languageId,
  onLanguageChange,
  languages,
  allowedLanguages,
  readOnly = false,
  starterCode,
  preferences,
  onPreferencesChange,
  monacoOptions,
}: EditorPaneProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const selectedLanguage = languages.find((language) => language.id === languageId);
  const editorRef = useRef<any>(null);

  const handleMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleFormat = () => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run();
  };

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-2">
        <div className="flex min-w-0 items-center gap-2">
          <Code2 className="size-4 text-gray-600" />
          <span className="text-sm font-semibold">{t('codeTab')}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onCodeChange(starterCode)}
            disabled={readOnly || !starterCode}
          >
            <RotateCcw className="size-4" />
            {t('resetCode')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleFormat}
            disabled={readOnly}
          >
            <AlignLeft className="size-4" />
            {t('formatCode')}
          </Button>
          <LanguageSelector
            languages={languages}
            selectedId={languageId}
            onSelect={onLanguageChange}
            allowedLanguages={allowedLanguages}
            disabled={readOnly}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <Settings2 className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t('editorSettings')}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={preferences.wordWrap}
                onCheckedChange={(checked) => onPreferencesChange({ ...preferences, wordWrap: checked })}
              >
                {t('wordWrap')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={preferences.minimap}
                onCheckedChange={(checked) => onPreferencesChange({ ...preferences, minimap: checked })}
              >
                {t('minimap')}
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{t('fontSize')}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={String(preferences.fontSize)}
                    onValueChange={(val) => onPreferencesChange({ ...preferences, fontSize: Number(val) })}
                  >
                    {[12, 13, 14, 15, 16, 18, 20].map((size) => (
                      <DropdownMenuRadioItem
                        key={size}
                        value={String(size)}
                      >
                        {t('pxValue', { size })}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CodeEditor
        value={code}
        onChange={onCodeChange}
        languageId={languageId}
        monacoLanguage={selectedLanguage?.monaco_language}
        readOnly={readOnly}
        height="100%"
        className="min-h-0 flex-1 rounded-none border-0"
        onMount={handleMount}
        options={monacoOptions}
        readOnlyMessage={readOnly ? 'This submission is read-only.' : undefined}
      />
    </div>
  );
}
