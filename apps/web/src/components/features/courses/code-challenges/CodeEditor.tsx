'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { OnChange, OnMount } from '@monaco-editor/react'

import { useTheme } from '@/components/providers/theme-provider'
import { cn } from '@/lib/utils'

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
    </div>
  )
}
