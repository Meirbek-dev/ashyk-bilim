import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  ClipboardCheck,
  Code2,
  FileText,
  GraduationCap,
  Lightbulb,
  MessageSquareText,
} from 'lucide-react'

export type MarkdownEditorPreset =
  | 'assessmentDescription'
  | 'questionPrompt'
  | 'explanation'
  | 'fileSubmissionInstructions'
  | 'codeProblemStatement'
  | 'codeInputSpec'
  | 'codeOutputSpec'
  | 'codeExampleExplanation'
  | 'codeHint'
  | 'codeEditorial'
  | 'courseDescription'

export type MarkdownRenderMode =
  | 'prompt'
  | 'taskDescription'
  | 'compactRichText'
  | 'codeProblem'
  | 'codeSpec'
  | 'courseDescription'
  | 'plainSummary'

export type MarkdownEditorSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface MarkdownSnippet {
  id: string
  label: string
  markdown: string
}

/** Groups of toolbar actions for preset-driven toolbar composition. */
export type ToolbarGroup =
  | 'formatting' // Bold, italic, strikethrough, inline code
  | 'headings' // H1–H3
  | 'lists' // Bullet, ordered, task
  | 'blocks' // Code block, blockquote
  | 'media' // Link, image
  | 'table' // Insert table
  | 'math' // Math inline / block

export interface MarkdownPresetConfig {
  label: string
  description: string
  icon: LucideIcon
  renderMode: MarkdownRenderMode
  placeholder: string
  minHeight: number
  maxHeight?: number
  maxLength: number
  /** Feature gates — controls both toolbar visibility and extension registration. */
  allowTaskList: boolean
  allowTable: boolean
  allowMath: boolean
  allowCodeBlock: boolean
  allowImages: boolean
  /** Ordered list of toolbar groups to render. */
  toolbarGroups: ToolbarGroup[]
  snippets: MarkdownSnippet[]
}

// ── Snippet libraries ─────────────────────────────────────────────────────────

const taskSnippets: MarkdownSnippet[] = [
  {
    id: 'objective',
    label: 'Task objective',
    markdown: '## Objective\n\nDescribe what learners need to produce and why it matters.\n',
  },
  {
    id: 'rubric',
    label: 'Rubric table',
    markdown:
      '| Criteria | Excellent | Needs work |\n| --- | --- | --- |\n| Accuracy | Complete and correct | Missing key requirements |\n',
  },
  {
    id: 'checklist',
    label: 'Checklist',
    markdown:
      '- [ ] Read all requirements\n- [ ] Check formatting\n- [ ] Submit before the deadline\n',
  },
]

const codeSnippets: MarkdownSnippet[] = [
  {
    id: 'problem-template',
    label: 'Problem template',
    markdown:
      '## Problem\n\nDescribe the task.\n\n## Example\n\n```text\nInput:\n\nOutput:\n```\n\n## Constraints\n\n- `1 <= n <= 10^5`\n',
  },
  {
    id: 'example-block',
    label: 'Example block',
    markdown: '```text\nInput:\n\nOutput:\n```\n\n**Explanation:** Add the reasoning here.\n',
  },
  {
    id: 'complexity',
    label: 'Complexity target',
    markdown: '**Expected complexity:** `O(n)` time and `O(1)` extra memory.\n',
  },
]

const courseSnippets: MarkdownSnippet[] = [
  {
    id: 'course-overview',
    label: 'Course overview',
    markdown: '## Overview\n\nDescribe who this course is for and what learners will build.\n',
  },
  {
    id: 'prerequisites',
    label: 'Prerequisites',
    markdown:
      '## Prerequisites\n\n- Basic familiarity with the topic\n- Required tools or accounts\n',
  },
  {
    id: 'outcomes',
    label: 'Learning outcomes',
    markdown:
      '## By the end, learners can\n\n- Explain the core concepts\n- Apply the skill in practice\n',
  },
]

// ── Preset definitions ────────────────────────────────────────────────────────

export const MARKDOWN_PRESETS: Record<MarkdownEditorPreset, MarkdownPresetConfig> = {
  assessmentDescription: {
    label: 'Assessment description',
    description: 'Student-facing overview, policy notes, and exam instructions.',
    icon: ClipboardCheck,
    renderMode: 'taskDescription',
    placeholder: 'Write the assessment instructions students will see...',
    minHeight: 220,
    maxLength: 10_000,
    allowTaskList: true,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table', 'math'],
    snippets: taskSnippets,
  },
  questionPrompt: {
    label: 'Question prompt',
    description: 'Prompt text shown inside assessment questions.',
    icon: MessageSquareText,
    renderMode: 'prompt',
    placeholder: 'Write the question prompt...',
    minHeight: 160,
    maxLength: 12_000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table', 'math'],
    snippets: taskSnippets.slice(0, 2),
  },
  explanation: {
    label: 'Explanation',
    description: 'Rubrics, explanations, and teacher feedback.',
    icon: Lightbulb,
    renderMode: 'compactRichText',
    placeholder: 'Write an explanation or rubric...',
    minHeight: 140,
    maxLength: 8000,
    allowTaskList: true,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table', 'math'],
    snippets: taskSnippets.slice(1),
  },
  fileSubmissionInstructions: {
    label: 'Submission instructions',
    description: 'Requirements, accepted files, rubric, and submission checklist.',
    icon: FileText,
    renderMode: 'taskDescription',
    placeholder: 'Write clear upload instructions, naming rules, and grading expectations...',
    minHeight: 300,
    maxLength: 12_000,
    allowTaskList: true,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table'],
    snippets: [
      {
        id: 'file-rules',
        label: 'File naming rules',
        markdown: '## File naming\n\nUse this format: `lastname_firstname_taskname.ext`.\n',
      },
      ...taskSnippets,
    ],
  },
  codeProblemStatement: {
    label: 'Problem statement',
    description: 'Competitive-programming style statement with examples and constraints.',
    icon: Code2,
    renderMode: 'codeProblem',
    placeholder: 'Write the coding challenge statement...',
    minHeight: 360,
    maxLength: 12_000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table', 'math'],
    snippets: codeSnippets,
  },
  codeInputSpec: {
    label: 'Input specification',
    description: 'Describe stdin or function input shape.',
    icon: Code2,
    renderMode: 'codeSpec',
    placeholder: 'Describe the input format...',
    minHeight: 160,
    maxLength: 4000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'lists', 'blocks', 'table', 'math'],
    snippets: codeSnippets.slice(1),
  },
  codeOutputSpec: {
    label: 'Output specification',
    description: 'Describe expected output shape.',
    icon: Code2,
    renderMode: 'codeSpec',
    placeholder: 'Describe the output format...',
    minHeight: 160,
    maxLength: 4000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'lists', 'blocks', 'table', 'math'],
    snippets: codeSnippets.slice(1),
  },
  codeExampleExplanation: {
    label: 'Example explanation',
    description: 'Explain a visible sample test.',
    icon: Code2,
    renderMode: 'compactRichText',
    placeholder: 'Explain why this sample produces the expected output...',
    minHeight: 140,
    maxLength: 4000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'lists', 'blocks', 'math'],
    snippets: codeSnippets.slice(1),
  },
  codeHint: {
    label: 'Hint',
    description: 'Progressive help without revealing the full solution.',
    icon: Lightbulb,
    renderMode: 'compactRichText',
    placeholder: 'Write a focused hint...',
    minHeight: 120,
    maxLength: 2000,
    allowTaskList: false,
    allowTable: false,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'lists', 'blocks', 'math'],
    snippets: codeSnippets.slice(2, 3),
  },
  codeEditorial: {
    label: 'Editorial',
    description: 'Solution explanation released by policy.',
    icon: BookOpen,
    renderMode: 'codeProblem',
    placeholder: 'Explain the intended solution...',
    minHeight: 300,
    maxLength: 12_000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table', 'math'],
    snippets: codeSnippets,
  },
  courseDescription: {
    label: 'Course description',
    description: 'Public course overview shown to learners.',
    icon: GraduationCap,
    renderMode: 'courseDescription',
    placeholder: 'Describe the course, audience, prerequisites, and outcomes...',
    minHeight: 300,
    maxLength: 8000,
    allowTaskList: false,
    allowTable: true,
    allowMath: false,
    allowCodeBlock: false,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'media', 'table'],
    snippets: courseSnippets,
  },
}

export function getMarkdownPreset(preset: MarkdownEditorPreset): MarkdownPresetConfig {
  return MARKDOWN_PRESETS[preset]
}
