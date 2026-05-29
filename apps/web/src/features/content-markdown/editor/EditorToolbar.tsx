'use client'

import type { Editor } from '@tiptap/react'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  Maximize2,
  Minimize2,
  Quote,
  Redo2,
  Rows3,
  Sigma,
  SplitSquareHorizontal,
  Strikethrough,
  TerminalSquare,
  TextCursorInput,
  FileCode2,
  Eye,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { MarkdownPresetConfig } from '../presets/presets'
import { EditorLinkDialog } from './EditorLinkDialog'
import { EditorImageDialog } from './EditorImageDialog'
import { EditorSnippetPicker } from './EditorSnippetPicker'
import { useTranslations } from 'next-intl'

export type ViewMode = 'write' | 'source' | 'split' | 'preview'

interface EditorToolbarProps {
  editor: Editor | null
  config: MarkdownPresetConfig
  disabled: boolean
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  isFullscreen: boolean
  onFullscreenToggle: () => void
}

export function EditorToolbar({
  editor,
  config,
  disabled,
  viewMode,
  onViewModeChange,
  isFullscreen,
  onFullscreenToggle,
}: EditorToolbarProps) {
  const t = useTranslations('MarkdownEditor')
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [imageDialogOpen, setImageDialogOpen] = useState(false)

  const groups = config.toolbarGroups

  const handleLinkConfirm = (href: string, openInNewTab: boolean) => {
    if (!editor) return
    if (!href) {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor
      .chain()
      .focus()
      .setLink({ href, target: openInNewTab ? '_blank' : null })
      .run()
  }

  const handleImageConfirm = (src: string, alt: string) => {
    if (!editor) return
    // Insert as markdown image syntax via tiptap-markdown
    const markdown = `![${alt}](${src})`
    const pos = editor.state.selection.to
    editor.chain().focus().insertContentAt(pos, markdown).run()
  }

  const currentLinkHref = editor?.isActive('link')
    ? (editor.getAttributes('link').href as string | undefined)
    : undefined

  return (
    <>
      <div
        role="toolbar"
        aria-label={t('toolbar.label')}
        className="bg-muted/25 flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5"
      >
        {/* Formatting group */}
        {groups.includes('formatting') && (
          <ToolbarGroup>
            <ToolbarButton
              title={t('toolbar.bold')}
              shortcut="Ctrl+B"
              active={editor?.isActive('bold') ?? null}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title={t('toolbar.italic')}
              shortcut="Ctrl+I"
              active={editor?.isActive('italic') ?? null}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title={t('toolbar.strikethrough')}
              shortcut="Ctrl+Shift+S"
              active={editor?.isActive('strike') ?? null}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title={t('toolbar.inlineCode')}
              shortcut="Ctrl+E"
              active={editor?.isActive('code') ?? null}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleCode().run()}
            >
              <Code className="size-3.5" />
            </ToolbarButton>
          </ToolbarGroup>
        )}

        {/* Headings group */}
        {groups.includes('headings') && (
          <ToolbarGroup>
            <ToolbarButton
              title={t('toolbar.h1')}
              shortcut="Ctrl+Alt+1"
              active={editor?.isActive('heading', { level: 1 }) ?? null}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <Heading1 className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title={t('toolbar.h2')}
              shortcut="Ctrl+Alt+2"
              active={editor?.isActive('heading', { level: 2 }) ?? null}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title={t('toolbar.h3')}
              shortcut="Ctrl+Alt+3"
              active={editor?.isActive('heading', { level: 3 }) ?? null}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <Heading3 className="size-3.5" />
            </ToolbarButton>
          </ToolbarGroup>
        )}

        {/* Lists group */}
        {groups.includes('lists') && (
          <ToolbarGroup>
            <ToolbarButton
              title={t('toolbar.bulletList')}
              active={editor?.isActive('bulletList') ?? null}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title={t('toolbar.orderedList')}
              active={editor?.isActive('orderedList') ?? null}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="size-3.5" />
            </ToolbarButton>
            {config.allowTaskList && (
              <ToolbarButton
                title={t('toolbar.taskList')}
                active={editor?.isActive('taskList') ?? null}
                disabled={disabled}
                onClick={() => {
                  if (!editor) return
                  const pos = editor.state.selection.to
                  editor.chain().focus().insertContentAt(pos, '- [ ] ').run()
                }}
              >
                <ListTodo className="size-3.5" />
              </ToolbarButton>
            )}
          </ToolbarGroup>
        )}

        {/* Blocks group */}
        {groups.includes('blocks') && (
          <ToolbarGroup>
            <ToolbarButton
              title={t('toolbar.blockquote')}
              active={editor?.isActive('blockquote') ?? null}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              <Quote className="size-3.5" />
            </ToolbarButton>
            {config.allowCodeBlock && (
              <ToolbarButton
                title={t('toolbar.codeBlock')}
                active={editor?.isActive('codeBlock') ?? null}
                disabled={disabled}
                onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
              >
                <TerminalSquare className="size-3.5" />
              </ToolbarButton>
            )}
          </ToolbarGroup>
        )}

        {/* Media group */}
        {groups.includes('media') && (
          <ToolbarGroup>
            <ToolbarButton
              title={t('toolbar.link')}
              shortcut="Ctrl+K"
              active={editor?.isActive('link') ?? null}
              disabled={disabled}
              onClick={() => setLinkDialogOpen(true)}
            >
              <LinkIcon className="size-3.5" />
            </ToolbarButton>
            {config.allowImages && (
              <ToolbarButton
                title={t('toolbar.image')}
                active={editor?.isActive('image') ?? null}
                disabled={disabled}
                onClick={() => setImageDialogOpen(true)}
              >
                <ImageIcon className="size-3.5" />
              </ToolbarButton>
            )}
          </ToolbarGroup>
        )}

        {/* Table group */}
        {groups.includes('table') && config.allowTable && (
          <ToolbarGroup>
            <ToolbarButton
              title={t('toolbar.table')}
              active={null}
              disabled={disabled}
              onClick={() => {
                if (!editor) return
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              }}
            >
              <Rows3 className="size-3.5" />
            </ToolbarButton>
          </ToolbarGroup>
        )}

        {/* Math group */}
        {groups.includes('math') && config.allowMath && (
          <ToolbarGroup>
            <ToolbarButton
              title={t('toolbar.math')}
              active={null}
              disabled={disabled}
              onClick={() => {
                const pos = editor?.state.selection.to
                if (pos !== undefined) editor?.chain().focus().insertContentAt(pos, ' $math$ ').run()
              }}
            >
              <Sigma className="size-3.5" />
            </ToolbarButton>
          </ToolbarGroup>
        )}

        {/* Undo / Redo */}
        <ToolbarGroup>
          <ToolbarButton
            title={t('toolbar.undo')}
            shortcut="Ctrl+Z"
            active={null}
            disabled={disabled || !editor?.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            title={t('toolbar.redo')}
            shortcut="Ctrl+Y"
            active={null}
            disabled={disabled || !editor?.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 className="size-3.5" />
          </ToolbarButton>
        </ToolbarGroup>

        {/* Right-aligned controls */}
        <div className="ml-auto flex items-center gap-1">
          {config.snippets.length > 0 && (
            <EditorSnippetPicker
              snippets={config.snippets}
              disabled={disabled}
              label={t('toolbar.snippets')}
              ariaLabel={t('toolbar.insertSnippet')}
              onSelect={markdown => {
                if (!editor) return
                const pos = editor.state.selection.to
                editor.chain().focus().insertContentAt(pos, `\n${markdown}`).run()
              }}
            />
          )}

          {/* View mode switcher */}
          <div className="flex items-center rounded-md border p-0.5">
            <ViewModeButton
              mode="write"
              activeMode={viewMode}
              onClick={onViewModeChange}
              title={t('toolbar.viewWrite')}
              icon={<TextCursorInput className="size-3.5" />}
            />
            <ViewModeButton
              mode="source"
              activeMode={viewMode}
              onClick={onViewModeChange}
              title={t('toolbar.viewSource')}
              icon={<FileCode2 className="size-3.5" />}
            />
            <ViewModeButton
              mode="split"
              activeMode={viewMode}
              onClick={onViewModeChange}
              title={t('toolbar.viewSplit')}
              icon={<SplitSquareHorizontal className="size-3.5" />}
            />
            <ViewModeButton
              mode="preview"
              activeMode={viewMode}
              onClick={onViewModeChange}
              title={t('toolbar.viewPreview')}
              icon={<Eye className="size-3.5" />}
            />
          </div>

          {/* Fullscreen toggle */}
          <ToolbarButton
            title={isFullscreen ? t('toolbar.exitFullscreen') : t('toolbar.fullscreen')}
            shortcut="F11"
            active={null}
            disabled={false}
            onClick={onFullscreenToggle}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </ToolbarButton>
        </div>
      </div>

      {/* Dialogs (rendered outside toolbar to avoid nested button/dialog issues) */}
      {linkDialogOpen && (
        <EditorLinkDialog
          currentHref={currentLinkHref}
          onConfirm={handleLinkConfirm}
          onClose={() => setLinkDialogOpen(false)}
        />
      )}
      {imageDialogOpen && (
        <EditorImageDialog onConfirm={handleImageConfirm} onClose={() => setImageDialogOpen(false)} />
      )}
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-0.5">{children}</div>
      <div className="bg-border mx-0.5 h-5 w-px" aria-hidden="true" />
    </>
  )
}

function ToolbarButton({
  title,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string
  shortcut?: string
  active: boolean | null
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  const label = shortcut ? `${title} (${shortcut})` : title
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active ?? undefined}
      aria-keyshortcuts={shortcut}
      disabled={disabled}
      onMouseDown={e => {
        e.preventDefault()
        onClick?.()
      }}
      className={cn(
        'hover:bg-muted flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground',
        active && 'bg-muted text-foreground',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {children}
    </button>
  )
}

function ViewModeButton({
  mode,
  activeMode,
  onClick,
  title,
  icon,
}: {
  mode: ViewMode
  activeMode: ViewMode
  onClick: (mode: ViewMode) => void
  title: string
  icon: React.ReactNode
}) {
  const isActive = activeMode === mode
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      onClick={() => onClick(mode)}
      className={cn(
        'flex size-7 items-center justify-center rounded transition-colors',
        isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {icon}
    </button>
  )
}
