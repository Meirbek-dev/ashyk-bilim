'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OnChange, OnMount } from '@monaco-editor/react';
import dynamic from 'next/dynamic';

import { useTheme } from '@/components/providers/theme-provider';
import { cn } from '@/lib/utils';

const MonacoEditor = dynamic(
  () =>
    import('@monaco-editor/react').then(({ Editor, loader }) => {
      loader.config({
        paths: {
          vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.0/min/vs',
        },
      });
      return { default: Editor };
    }),
  { ssr: false },
);

export interface Language {
  id: number;
  name: string;
  monacoLanguage?: string;
}

// Map Judge0 language IDs to Monaco language identifiers
const JUDGE0_TO_MONACO: Record<number, string> = {
  71: 'python', // Python (3.8.1)
  50: 'c', // C (GCC 9.2.0)
  54: 'cpp', // C++ (GCC 9.2.0)
  51: 'csharp', // C# (Mono 6.6.0.161)
  62: 'java', // Java (OpenJDK 13.0.1)
  63: 'javascript', // JavaScript (Node.js 12.14.0)
  73: 'rust', // Rust (1.40.0)
  82: 'sql', // SQL (SQLite 3.27.2)
  74: 'typescript', // TypeScript (3.7.4)
  // 60: 'go', // Go (1.13.5)
  // 78: 'kotlin', // Kotlin (1.3.70)
  68: 'php', // PHP (7.4.1)
  83: 'swift', // Swift (5.2.3)
};

function getMonacoLanguage(languageId: number): string {
  // Default to Python if the language ID is unknown to provide a sensible default
  return JUDGE0_TO_MONACO[languageId] || 'python';
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  languageId: number;
  readOnly?: boolean;
  height?: string | number;
  className?: string;
  onMount?: OnMount;
  options?: Record<string, unknown>;
}

export function CodeEditor({
  value,
  onChange,
  languageId,
  readOnly = false,
  height = '400px',
  className,
  onMount,
  options = {},
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setIsMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      // Configure editor settings
      editor.updateOptions({
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 14,
        lineHeight: 1.6,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        insertSpaces: true,
        wordWrap: 'on',
        folding: true,
        lineNumbers: 'on',
        renderLineHighlight: 'line',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        smoothScrolling: true,
        padding: { top: 16, bottom: 16 },
        ...options,
      });

      onMount?.(editor, monaco);
    },
    [onMount, options],
  );

  const handleChange: OnChange = useCallback(
    (newValue) => {
      onChange(newValue || '');
    },
    [onChange],
  );

  if (!isMounted) {
    return (
      <div
        className={cn('animate-pulse rounded-lg bg-muted', className)}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      />
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border', className)}>
      <MonacoEditor
        height={height}
        language={getMonacoLanguage(languageId)}
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        options={{
          readOnly,
          domReadOnly: readOnly,
        }}
        loading={
          <div className="flex h-full items-center justify-center">
            <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
          </div>
        }
      />
    </div>
  );
}

export default CodeEditor;
