'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { OnChange, OnMount } from '@monaco-editor/react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'

import { useTheme } from '@/components/providers/theme-provider'
import { cn } from '@/lib/utils'
import { WidgetErrorBoundary } from '@/components/ui/widget-error-boundary'

// Use the installed ESM build (including dependency overrides), not the wrapper's older CDN/AMD default.
const Editor = dynamic(
  async () => {
    const [monaco, { default: MonacoEditor, loader }] = await Promise.all([
      import('monaco-editor'),
      import('@monaco-editor/react'),
    ])
    globalThis.MonacoEnvironment = {
      getWorker(_moduleId, label) {
        switch (label) {
          case 'json': {
            return new Worker(new URL('monaco-editor/language/json/json.worker.js', import.meta.url), {
              type: 'module',
            })
          }
          case 'css':
          case 'scss':
          case 'less': {
            return new Worker(new URL('monaco-editor/language/css/css.worker.js', import.meta.url), { type: 'module' })
          }
          case 'html':
          case 'handlebars':
          case 'razor': {
            return new Worker(new URL('monaco-editor/language/html/html.worker.js', import.meta.url), {
              type: 'module',
            })
          }
          case 'typescript':
          case 'javascript': {
            return new Worker(new URL('monaco-editor/language/typescript/ts.worker.js', import.meta.url), {
              type: 'module',
            })
          }
          default: {
            return new Worker(new URL('monaco-editor/editor/editor.worker.js', import.meta.url), { type: 'module' })
          }
        }
      },
    }
    loader.config({ monaco })
    return MonacoEditor
  },
  { ssr: false },
)

export interface Language {
  id: number
  name: string
  monacoLanguage?: string
}

function getMonacoLanguage(_languageId: number): string {
  return 'plaintext'
}

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  languageId: number
  monacoLanguage?: string
  readOnly?: boolean
  height?: string | number
  className?: string
  onMount?: OnMount
  options?: Record<string, unknown>
  readOnlyMessage?: string
}

const DEFAULT_OPTIONS = {}

export function CodeEditor({
  value,
  onChange,
  languageId,
  monacoLanguage,
  readOnly = false,
  height = '400px',
  className,
  onMount,
  options = DEFAULT_OPTIONS,
  readOnlyMessage,
}: CodeEditorProps) {
  const t = useTranslations('Activities.CodeChallenges')
  const { resolvedTheme } = useTheme()
  const [editorKey, setEditorKey] = useState(0)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      editor.onDidDispose(() => {
        setEditorKey(prev => prev + 1)
      })
      onMount?.(editor, monaco)
    },
    [onMount],
  )

  const handleChange: OnChange = useCallback(
    newValue => {
      onChange(newValue || '')
    },
    [onChange],
  )

  const editorOptions = useMemo(
    () => ({
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
      fontSize: 14,
      lineHeight: 1.6,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'on' as const,
      folding: true,
      lineNumbers: 'on' as const,
      renderLineHighlight: 'line' as const,
      cursorBlinking: 'smooth' as const,
      cursorSmoothCaretAnimation: 'on' as const,
      smoothScrolling: true,
      padding: { top: 16, bottom: 16 },
      readOnly,
      ...(readOnlyMessage ? { readOnlyMessage: { value: readOnlyMessage } } : {}),
      ...options,
    }),
    [readOnly, options, readOnlyMessage],
  )

  return (
    <div className={cn('relative overflow-hidden rounded-lg border', className)}>
      {readOnly && readOnlyMessage ? (
        <div className="bg-background/95 text-muted-foreground absolute top-2 right-2 z-10 rounded-md border px-2 py-1 text-xs shadow-sm">
          {readOnlyMessage}
        </div>
      ) : null}
      <WidgetErrorBoundary scope="monaco-code-editor" variant="section" title={t('codeEditorFailedToLoad')}>
        <Editor
          key={editorKey}
          height={height}
          language={monacoLanguage ?? getMonacoLanguage(languageId)}
          value={value}
          onChange={handleChange}
          onMount={handleMount}
          theme={(options.theme as string) || (resolvedTheme === 'dark' ? 'vs-dark' : 'light')}
          options={editorOptions}
          loading={
            <div
              className="bg-muted flex animate-pulse items-center justify-center rounded-lg"
              style={{
                height: typeof height === 'number' ? `${height}px` : height,
              }}
            >
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
            </div>
          }
        />
      </WidgetErrorBoundary>
    </div>
  )
}
