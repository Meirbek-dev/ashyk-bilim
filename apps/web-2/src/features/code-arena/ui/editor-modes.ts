import { StreamLanguage } from '@codemirror/language'
import type { Extension } from '@codemirror/state'

// Editor modes for the languages the platform's Judge0 allows (server `monaco_language`: c, cpp, go, java,
// javascript, typescript, php, python, ruby, rust, kotlin, swift, csharp). Each loads on first use; anything else
// is plain text.
const modes: Record<string, () => Promise<Extension>> = {
  python: async () => (await import('@codemirror/lang-python')).python(),
  c: async () => (await import('@codemirror/lang-cpp')).cpp(),
  cpp: async () => (await import('@codemirror/lang-cpp')).cpp(),
  java: async () => (await import('@codemirror/lang-java')).java(),
  javascript: async () => (await import('@codemirror/lang-javascript')).javascript(),
  typescript: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true }),
  rust: async () => (await import('@codemirror/lang-rust')).rust(),
  php: async () => (await import('@codemirror/lang-php')).php(),
  go: async () => (await import('@codemirror/lang-go')).go(),
  kotlin: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/clike')).kotlin),
  csharp: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/clike')).csharp),
  swift: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/swift')).swift),
  ruby: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/ruby')).ruby),
}

export const loadMode = (mode: string): Promise<Extension> => modes[mode]?.() ?? Promise.resolve([])
