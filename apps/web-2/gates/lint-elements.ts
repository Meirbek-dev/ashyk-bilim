import type { OxlintConfig } from 'vite-plus/lint'

export const forbiddenElements = ['button', 'input', 'select', 'textarea', 'dialog', 'table', 'a'].map(element => ({
  element,
  message: `Use the stock component from #/shared/ui or a composite from #/shared/components (Link / Anchor for <a>), not raw <${element}>.`,
}))
export const LINK_COMPOSITES = ['src/shared/components/link.tsx', 'src/shared/components/anchor.tsx']
export const forbiddenExceptA = forbiddenElements.filter(entry => entry.element !== 'a')

// Stored editor documents reproduce Tiptap's DOM; kit wrappers and link styling break B-EDT-34 parity.
export const rendererOverrides: NonNullable<OxlintConfig['overrides']> = [
  // B-EDT-34 reproduces Tiptap's stored document DOM. Kit tables/links add wrappers and styling that break parity.
  {
    files: ['src/features/editor/ui/static/document.tsx'],
    rules: {
      'react/forbid-elements': ['error', { forbid: forbiddenElements.filter(entry => entry.element !== 'table') }],
      // Tiptap's read-only root is a div with role=article; a nested <article> doubles every post's article.
      'jsx-a11y/prefer-tag-over-role': 'off',
    },
  },
  {
    files: ['src/features/editor/ui/static/inline.tsx'],
    rules: { 'react/forbid-elements': ['error', { forbid: forbiddenExceptA }] },
  },
  // Markdown drawn as Tiptap's read-only view draws it: plain links and tables under `ab-prose`, as stored documents.
  {
    files: ['src/features/markdown/ui/rich-text.tsx'],
    rules: {
      'react/forbid-elements': ['error', { forbid: forbiddenExceptA.filter(entry => entry.element !== 'table') }],
    },
  },
]
