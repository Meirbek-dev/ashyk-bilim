import { completeAnyWord } from '@codemirror/autocomplete'
import { StreamLanguage } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'

/**
 * Completion from the words already in the file, for the languages that bring none of their own (Python, JavaScript,
 * TypeScript and Go complete local names themselves: both would list every word twice).
 */
const withWords = (language: Extension): Extension => [
  language,
  EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
]

// Editor modes for the languages the platform's code runner allows (server `monaco_language`: c, cpp, go, java,
// javascript, typescript, php, python, ruby, rust, kotlin, swift, csharp). Each loads on first use; anything else
// is plain text.
const modes: Record<string, () => Promise<Extension>> = {
  python: async () => (await import('@codemirror/lang-python')).python(),
  javascript: async () => (await import('@codemirror/lang-javascript')).javascript(),
  typescript: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true }),
  go: async () => (await import('@codemirror/lang-go')).go(),
  c: async () => withWords((await import('@codemirror/lang-cpp')).cpp()),
  cpp: async () => withWords((await import('@codemirror/lang-cpp')).cpp()),
  java: async () => withWords((await import('@codemirror/lang-java')).java()),
  rust: async () => withWords((await import('@codemirror/lang-rust')).rust()),
  php: async () => withWords((await import('@codemirror/lang-php')).php()),
  kotlin: async () => withWords(StreamLanguage.define((await import('@codemirror/legacy-modes/mode/clike')).kotlin)),
  csharp: async () => withWords(StreamLanguage.define((await import('@codemirror/legacy-modes/mode/clike')).csharp)),
  swift: async () => withWords(StreamLanguage.define((await import('@codemirror/legacy-modes/mode/swift')).swift)),
  ruby: async () => withWords(StreamLanguage.define((await import('@codemirror/legacy-modes/mode/ruby')).ruby)),
}

export const loadMode = (mode: string): Promise<Extension> => modes[mode]?.() ?? Promise.resolve(withWords([]))
