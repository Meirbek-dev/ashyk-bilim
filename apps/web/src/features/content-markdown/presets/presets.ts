import type { LucideIcon } from 'lucide-react'
import { BookOpen, ClipboardCheck, Code2, FileText, GraduationCap, Lightbulb, MessageSquareText } from 'lucide-react'

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

type MarkdownTranslator = (key: string, values?: Record<string, string | number>) => string

/** Groups of toolbar actions for preset-driven toolbar composition. */
export type ToolbarGroup =
  | 'formatting' // Bold, italic, strikethrough, inline code
  | 'headings' // H1–H3
  | 'lists' // Bullet, ordered, task
  | 'blocks' // Code block, blockquote
  | 'media' // Link, image
  | 'table' // Insert table
  | 'math' // Math inline / block

interface MarkdownPresetRules {
  icon: LucideIcon
  renderMode: MarkdownRenderMode
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
}

interface MarkdownSnippetDefinition {
  id: string
  labelKey: string
  markdownKey: string
}

interface MarkdownPresetTextDefinition {
  labelKey: string
  descriptionKey: string
  placeholderKey: string
  snippets: MarkdownSnippetDefinition[]
}

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

const taskSnippetDefinitions: MarkdownSnippetDefinition[] = [
  {
    id: 'objective',
    labelKey: 'presets.shared.objective.label',
    markdownKey: 'presets.shared.objective.markdown',
  },
  {
    id: 'rubric',
    labelKey: 'presets.shared.rubric.label',
    markdownKey: 'presets.shared.rubric.markdown',
  },
  {
    id: 'checklist',
    labelKey: 'presets.shared.checklist.label',
    markdownKey: 'presets.shared.checklist.markdown',
  },
]

const codeSnippetDefinitions: MarkdownSnippetDefinition[] = [
  {
    id: 'problem-template',
    labelKey: 'presets.shared.problemTemplate.label',
    markdownKey: 'presets.shared.problemTemplate.markdown',
  },
  {
    id: 'example-block',
    labelKey: 'presets.shared.exampleBlock.label',
    markdownKey: 'presets.shared.exampleBlock.markdown',
  },
  {
    id: 'complexity',
    labelKey: 'presets.shared.complexityTarget.label',
    markdownKey: 'presets.shared.complexityTarget.markdown',
  },
]

const courseSnippetDefinitions: MarkdownSnippetDefinition[] = [
  {
    id: 'course-overview',
    labelKey: 'presets.shared.courseOverview.label',
    markdownKey: 'presets.shared.courseOverview.markdown',
  },
  {
    id: 'prerequisites',
    labelKey: 'presets.shared.prerequisites.label',
    markdownKey: 'presets.shared.prerequisites.markdown',
  },
  {
    id: 'outcomes',
    labelKey: 'presets.shared.learningOutcomes.label',
    markdownKey: 'presets.shared.learningOutcomes.markdown',
  },
]

// ── Preset definitions ────────────────────────────────────────────────────────

const MARKDOWN_PRESET_RULES: Record<MarkdownEditorPreset, MarkdownPresetRules> = {
  assessmentDescription: {
    icon: ClipboardCheck,
    renderMode: 'taskDescription',
    minHeight: 220,
    maxLength: 10_000,
    allowTaskList: true,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table', 'math'],
  },
  questionPrompt: {
    icon: MessageSquareText,
    renderMode: 'prompt',
    minHeight: 160,
    maxLength: 12_000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table', 'math'],
  },
  explanation: {
    icon: Lightbulb,
    renderMode: 'compactRichText',
    minHeight: 140,
    maxLength: 8000,
    allowTaskList: true,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table', 'math'],
  },
  fileSubmissionInstructions: {
    icon: FileText,
    renderMode: 'taskDescription',
    minHeight: 300,
    maxLength: 12_000,
    allowTaskList: true,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table'],
  },
  codeProblemStatement: {
    icon: Code2,
    renderMode: 'codeProblem',
    minHeight: 360,
    maxLength: 12_000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table', 'math'],
  },
  codeInputSpec: {
    icon: Code2,
    renderMode: 'codeSpec',
    minHeight: 160,
    maxLength: 4000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'lists', 'blocks', 'table', 'math'],
  },
  codeOutputSpec: {
    icon: Code2,
    renderMode: 'codeSpec',
    minHeight: 160,
    maxLength: 4000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'lists', 'blocks', 'table', 'math'],
  },
  codeExampleExplanation: {
    icon: Code2,
    renderMode: 'compactRichText',
    minHeight: 140,
    maxLength: 4000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'lists', 'blocks', 'math'],
  },
  codeHint: {
    icon: Lightbulb,
    renderMode: 'compactRichText',
    minHeight: 120,
    maxLength: 2000,
    allowTaskList: false,
    allowTable: false,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'lists', 'blocks', 'math'],
  },
  codeEditorial: {
    icon: BookOpen,
    renderMode: 'codeProblem',
    minHeight: 300,
    maxLength: 12_000,
    allowTaskList: false,
    allowTable: true,
    allowMath: true,
    allowCodeBlock: true,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'blocks', 'media', 'table', 'math'],
  },
  courseDescription: {
    icon: GraduationCap,
    renderMode: 'courseDescription',
    minHeight: 300,
    maxLength: 8000,
    allowTaskList: false,
    allowTable: true,
    allowMath: false,
    allowCodeBlock: false,
    allowImages: false,
    toolbarGroups: ['formatting', 'headings', 'lists', 'media', 'table'],
  },
}

const MARKDOWN_PRESET_TEXT: Record<MarkdownEditorPreset, MarkdownPresetTextDefinition> = {
  assessmentDescription: {
    labelKey: 'presets.assessmentDescription.label',
    descriptionKey: 'presets.assessmentDescription.description',
    placeholderKey: 'presets.assessmentDescription.placeholder',
    snippets: taskSnippetDefinitions,
  },
  questionPrompt: {
    labelKey: 'presets.questionPrompt.label',
    descriptionKey: 'presets.questionPrompt.description',
    placeholderKey: 'presets.questionPrompt.placeholder',
    snippets: taskSnippetDefinitions.slice(0, 2),
  },
  explanation: {
    labelKey: 'presets.explanation.label',
    descriptionKey: 'presets.explanation.description',
    placeholderKey: 'presets.explanation.placeholder',
    snippets: taskSnippetDefinitions.slice(1),
  },
  fileSubmissionInstructions: {
    labelKey: 'presets.fileSubmissionInstructions.label',
    descriptionKey: 'presets.fileSubmissionInstructions.description',
    placeholderKey: 'presets.fileSubmissionInstructions.placeholder',
    snippets: [
      {
        id: 'file-rules',
        labelKey: 'presets.shared.fileNamingRules.label',
        markdownKey: 'presets.shared.fileNamingRules.markdown',
      },
      ...taskSnippetDefinitions,
    ],
  },
  codeProblemStatement: {
    labelKey: 'presets.codeProblemStatement.label',
    descriptionKey: 'presets.codeProblemStatement.description',
    placeholderKey: 'presets.codeProblemStatement.placeholder',
    snippets: codeSnippetDefinitions,
  },
  codeInputSpec: {
    labelKey: 'presets.codeInputSpec.label',
    descriptionKey: 'presets.codeInputSpec.description',
    placeholderKey: 'presets.codeInputSpec.placeholder',
    snippets: codeSnippetDefinitions.slice(1),
  },
  codeOutputSpec: {
    labelKey: 'presets.codeOutputSpec.label',
    descriptionKey: 'presets.codeOutputSpec.description',
    placeholderKey: 'presets.codeOutputSpec.placeholder',
    snippets: codeSnippetDefinitions.slice(1),
  },
  codeExampleExplanation: {
    labelKey: 'presets.codeExampleExplanation.label',
    descriptionKey: 'presets.codeExampleExplanation.description',
    placeholderKey: 'presets.codeExampleExplanation.placeholder',
    snippets: codeSnippetDefinitions.slice(1),
  },
  codeHint: {
    labelKey: 'presets.codeHint.label',
    descriptionKey: 'presets.codeHint.description',
    placeholderKey: 'presets.codeHint.placeholder',
    snippets: codeSnippetDefinitions.slice(2, 3),
  },
  codeEditorial: {
    labelKey: 'presets.codeEditorial.label',
    descriptionKey: 'presets.codeEditorial.description',
    placeholderKey: 'presets.codeEditorial.placeholder',
    snippets: codeSnippetDefinitions,
  },
  courseDescription: {
    labelKey: 'presets.courseDescription.label',
    descriptionKey: 'presets.courseDescription.description',
    placeholderKey: 'presets.courseDescription.placeholder',
    snippets: courseSnippetDefinitions,
  },
}

const defaultMarkdownTranslator: MarkdownTranslator = key => key

function localizeSnippet(t: MarkdownTranslator, definition: MarkdownSnippetDefinition): MarkdownSnippet {
  return {
    id: definition.id,
    label: t(definition.labelKey),
    markdown: t(definition.markdownKey),
  }
}

function localizePreset(t: MarkdownTranslator, preset: MarkdownEditorPreset): MarkdownPresetConfig {
  const rules = MARKDOWN_PRESET_RULES[preset]
  const text = MARKDOWN_PRESET_TEXT[preset]

  return {
    ...rules,
    label: t(text.labelKey),
    description: t(text.descriptionKey),
    placeholder: t(text.placeholderKey),
    snippets: text.snippets.map(snippet => localizeSnippet(t, snippet)),
  }
}

export const MARKDOWN_PRESETS = MARKDOWN_PRESET_RULES

export function getMarkdownPreset(
  preset: MarkdownEditorPreset,
  t: MarkdownTranslator = defaultMarkdownTranslator,
): MarkdownPresetConfig {
  return localizePreset(t, preset)
}