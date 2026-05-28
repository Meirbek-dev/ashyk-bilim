// ── Editor ────────────────────────────────────────────────────────────────────
export { MarkdownEditor } from './editor/MarkdownEditor'

// ── Renderer ─────────────────────────────────────────────────────────────────
export { MarkdownContent } from './renderer/MarkdownContent'
export { MarkdownCodeBlock } from './renderer/MarkdownCodeBlock'
export { MarkdownImage } from './renderer/MarkdownImage'
export { MarkdownHeading } from './renderer/MarkdownHeading'
export { AiStreamingCursor } from './renderer/MarkdownStreaming'

// ── Presets ───────────────────────────────────────────────────────────────────
export type {
  MarkdownEditorPreset,
  MarkdownEditorSaveState,
  MarkdownRenderMode,
  MarkdownPresetConfig,
  MarkdownSnippet,
  ToolbarGroup,
} from './presets/presets'
export { MARKDOWN_PRESETS, getMarkdownPreset } from './presets/presets'

// ── Sanitization utilities ────────────────────────────────────────────────────
export {
  findUnsafeMarkdownLinks,
  hasRawHtml,
  isMarkdownStructurallyEmpty,
  isSafeMarkdownImageUrl,
  isSafeMarkdownUrl,
  normalizeMarkdown,
  sanitizeMarkdownImageUrl,
  sanitizeMarkdownUrl,
} from './utils/markdown-sanitize'

// ── Extraction utilities ─────────────────────────────────────────────────────
export { extractMarkdownPlainText, extractMarkdownSummary } from './utils/markdown-extract'

// ── Validation ───────────────────────────────────────────────────────────────
export {
  getHighestMarkdownIssueSeverity,
  validateMarkdownContent,
} from './hooks/useMarkdownValidation'
export type { MarkdownValidationIssue } from './hooks/useMarkdownValidation'

// ── Shiki (shared singleton) ──────────────────────────────────────────────────
export { getMarkdownSaveGate } from './policy/save-gate'
export type { MarkdownSaveGate, MarkdownSaveIntent } from './policy/save-gate'

export { highlightCode, getLanguageDisplayName } from './lib/shiki'
