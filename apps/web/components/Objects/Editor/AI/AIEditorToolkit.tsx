import {
  AlertTriangle,
  BetweenHorizontalStart,
  FastForward,
  Feather,
  FileStack,
  Languages,
  Lightbulb,
  Square,
  X,
} from 'lucide-react';
import { useActivityAIChat } from '@components/Contexts/AI/ActivityAIChatContext';
import { AiMarkdownRenderer } from '@components/Shared/AI/AiMarkdownRenderer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import platformLogo from '@public/platform_logo.svg';
import platformLogoLight from '@public/platform_logo_light.svg';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { TextPart } from '@tanstack/ai-client';
import { Spinner } from '@components/ui/spinner';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import type { Variants } from 'motion/react';
import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/providers/theme-provider';
import { cn } from '@/lib/utils';
import { marked } from 'marked';
import Image from 'next/image';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

// NOTE: 'GenerateQuiz' was removed — it was in TOOL_ICONS but never rendered.
type ToolLabel = 'Writer' | 'ContinueWriting' | 'MakeLonger' | 'Translate' | 'Critisize';
type CritisizeScope = 'selection' | 'lecture';

interface AIEditorToolkitProps {
  editor: Editor;
  activity: { activity_uuid: string };
  isOpen: boolean;
  onClose: () => void;
}

interface AIPromptsLabels {
  label: ToolLabel;
  selection: string;
  scope?: CritisizeScope;
  targetLanguage?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MODAL_VARIANTS: Variants = {
  hidden: { y: 8, opacity: 0 },
  visible: { y: 0, opacity: 1 },
  exit: { y: 4, opacity: 0 },
};

const SPRING_TRANSITION = { duration: 0.18, ease: 'easeOut' } as const;

const TOOL_ICONS: Record<ToolLabel, typeof Feather> = {
  Writer: Feather,
  ContinueWriting: FastForward,
  MakeLonger: FileStack,
  Translate: Languages,
  Critisize: Lightbulb,
};

// ============================================================================
// Utility Functions
// ============================================================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Removes all occurrences of `textToRemove` from `originalText`. */
function removeOccurrences(textToRemove: string, originalText: string): string {
  if (!textToRemove) return originalText;
  try {
    const regex = new RegExp(escapeRegex(textToRemove), 'gi');
    return originalText.replace(regex, '');
  } catch {
    return originalText;
  }
}

// ============================================================================
// Custom Hooks
// ============================================================================

function useEditorOperations(editor: Editor) {
  const abortRef = useRef<AbortController | null>(null);

  const getSelectedText = useCallback(() => {
    const { selection } = editor.state;
    return editor.state.doc.textBetween(selection.from, selection.to);
  }, [editor]);

  const getSelectedBlockText = useCallback(() => {
    const { $from } = editor.state.selection;
    const start = $from.start($from.depth);
    const end = $from.end($from.depth);
    return editor.state.doc.textBetween(start, end, '\n', '\n');
  }, [editor]);

  const getEntireText = useCallback(() => {
    const { doc } = editor.state;
    return doc.textBetween(0, doc.content.size, '\n', '\n');
  }, [editor]);

  const typeText = useCallback(
    async (text: string, replaceSelection = false) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      if (replaceSelection) {
        editor.chain().focus().deleteSelection().run();
      }

      const html = await marked.parse(text);
      editor.chain().focus().insertContent(html).run();
    },
    [editor],
  );

  const cancelTyping = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    getSelectedText,
    getSelectedBlockText,
    getEntireText,
    typeText,
    cancelTyping,
  };
}

// ============================================================================
// Tool Button Component
// ============================================================================

interface ToolButtonProps {
  label: ToolLabel;
  selectedTool: ToolLabel;
  onSelect: (label: ToolLabel) => void;
}

function AiEditorToolButton({ label, selectedTool, onSelect }: ToolButtonProps) {
  const t = useTranslations('Activities.AIEditorToolkit');

  const isSelected = selectedTool === label;
  const Icon = TOOL_ICONS[label];

  return (
    <Button
      variant={isSelected ? 'secondary' : 'ghost'}
      size="sm"
      onClick={() => onSelect(label)}
      aria-label={t(`${label}Label`)}
      className={cn(
        'h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium',
        isSelected
          ? 'bg-zinc-700 text-zinc-100 hover:bg-zinc-600'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
      )}
    >
      <Icon size={13} />
      <span className="hidden sm:inline">{t(`${label}Label`)}</span>
    </Button>
  );
}

// ============================================================================
// Action Screen Component
// ============================================================================

interface ActionScreenProps {
  onExecute: () => void;
  selectedTool: ToolLabel;
  isLoading: boolean;
  error: Error | undefined;
  onDismissError: () => void;
  critisizeScope: CritisizeScope;
  onCritisizeScopeChange: (scope: CritisizeScope) => void;
  chatInputValue: string;
  onInputChange: (value: string) => void;
  lastAiResponse: string;
  /** Partial text arriving during a streaming generation. */
  streamingPreview: string;
}

function AiEditorActionScreen({
  onExecute,
  selectedTool,
  isLoading,
  error,
  onDismissError,
  critisizeScope,
  onCritisizeScopeChange,
  chatInputValue,
  onInputChange,
  lastAiResponse,
  streamingPreview,
}: ActionScreenProps) {
  const t = useTranslations('Activities.AIEditorToolkit');

  const hasAiResponse = lastAiResponse && !isLoading && selectedTool === 'Critisize';

  if (error) {
    return (
      <div className="flex w-full items-start gap-3 rounded-lg border border-red-900/50 bg-red-950/40 p-3">
        <AlertTriangle
          size={15}
          className="mt-0.5 shrink-0 text-red-400"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-red-300">{t('errorTitle')}</p>
          <p className="mt-0.5 text-xs text-red-400/80">{error.message}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDismissError}
          className="h-6 w-6 shrink-0 text-red-400 hover:bg-red-900/30 hover:text-red-300"
          aria-label={t('dismissError')}
        >
          <X size={12} />
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <Spinner className="h-4 w-4 text-zinc-400" />
          <p className="text-sm text-zinc-400">{t('thinking')}</p>
        </div>
        {streamingPreview && (
          // Plain div instead of ScrollArea: max-height alone doesn't give a
          // "definite" height for ScrollArea's internal height:100% viewport.
          <div className="max-h-40 w-full overflow-y-auto rounded-md border border-zinc-700/60 bg-zinc-800/50">
            <div className="p-3">
              <AiMarkdownRenderer
                content={streamingPreview}
                isStreaming
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (selectedTool === 'Writer') {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <Feather
          size={20}
          className="text-zinc-500"
        />
        <p className="text-sm font-medium text-zinc-300">{t('writerPlaceholder')}</p>
        <p className="text-xs text-zinc-500">{t('typePromptBelow')}</p>
      </div>
    );
  }

  if (selectedTool === 'ContinueWriting') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Button
          size="sm"
          onClick={onExecute}
          className="gap-2"
        >
          <FastForward size={13} />
          {t('continuePlaceholder')}
        </Button>
      </div>
    );
  }

  if (selectedTool === 'MakeLonger') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Button
          size="sm"
          onClick={onExecute}
          className="gap-2"
        >
          <FileStack size={13} />
          {t('longerPlaceholder')}
        </Button>
      </div>
    );
  }

  if (selectedTool === 'Critisize') {
    if (hasAiResponse) {
      return (
        <div className="max-h-48 w-full overflow-y-auto rounded-md border border-zinc-700/60 bg-zinc-800/50">
          <div className="p-3">
            <AiMarkdownRenderer content={lastAiResponse} />
          </div>
        </div>
      );
    }

    return (
      <div className="flex w-full flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{t('critisizeScopeLabel')}:</span>
          {(['selection', 'lecture'] as const).map((scope) => (
            <Button
              key={scope}
              variant={critisizeScope === scope ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onCritisizeScopeChange(scope)}
              aria-pressed={critisizeScope === scope}
              className={cn(
                'h-7 rounded-md px-2.5 text-xs',
                critisizeScope === scope ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              {t(scope === 'selection' ? 'critisizeScopeSelection' : 'critisizeScopeLecture')}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          onClick={onExecute}
          className="gap-2"
        >
          <Lightbulb size={13} />
          {t('critisizePlaceholder')}
        </Button>
      </div>
    );
  }

  if (selectedTool === 'Translate') {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <Input
          value={chatInputValue}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onInputChange(e.target.value)}
          placeholder={t('translateExample')}
          className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
        />
        <Button
          size="sm"
          onClick={onExecute}
          className="gap-2"
        >
          <Languages size={13} />
          {t('translatePlaceholder')}
        </Button>
      </div>
    );
  }

  return null;
}

// ============================================================================
// Feedback Modal Component
// ============================================================================

interface FeedbackModalProps {
  editor: Editor;
  activity: { activity_uuid: string };
  selectedTool: ToolLabel;
  isUserInputEnabled: boolean;
  chatInputValue: string;
  critisizeScope: CritisizeScope;
  isLoading: boolean;
  error: Error | undefined;
  lastAiResponse: string;
  streamingPreview: string;
  onToolChange: (tool: ToolLabel) => void;
  onUserInputEnabledChange: (enabled: boolean) => void;
  onInputChange: (value: string) => void;
  onCritisizeScopeChange: (scope: CritisizeScope) => void;
  onDismissError: () => void;
  onCancel: () => void;
  sendMessageAndGetResponse: (prompt: string) => Promise<string>;
}

function UserFeedbackModal({
  editor,
  activity: _activity,
  selectedTool,
  isUserInputEnabled,
  chatInputValue,
  critisizeScope,
  isLoading,
  error,
  lastAiResponse,
  streamingPreview,
  onToolChange,
  onUserInputEnabledChange,
  onInputChange,
  onCritisizeScopeChange,
  onDismissError,
  onCancel,
  sendMessageAndGetResponse,
}: FeedbackModalProps) {
  const t = useTranslations('Activities.AIEditorToolkit');
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? platformLogoLight : platformLogo;

  const { getSelectedText, getSelectedBlockText, getEntireText, typeText } = useEditorOperations(editor);

  const getPrompt = useCallback(
    ({ label, selection, scope, targetLanguage }: AIPromptsLabels): string => {
      if (!selection) return '';

      switch (label) {
        case 'Writer': {
          return t('prompt_writer', { selection });
        }
        case 'ContinueWriting': {
          return t('prompt_continueWriting', { selection });
        }
        case 'MakeLonger': {
          return t('prompt_makeLonger', { selection });
        }
        case 'Critisize': {
          return scope === 'lecture'
            ? t('prompt_critisizeLecture', { selection })
            : t('prompt_critisize', { selection });
        }
        case 'Translate': {
          return targetLanguage ? t('prompt_translateTo', { language: targetLanguage, selection }) : '';
        }
      }
    },
    [t],
  );

  const handleOperation = useCallback(
    async (label: ToolLabel, inputValue: string) => {
      onToolChange(label);

      switch (label) {
        case 'Writer': {
          const prompt = getPrompt({ label, selection: inputValue });
          if (!prompt) return;

          onUserInputEnabledChange(false);
          const response = await sendMessageAndGetResponse(prompt);
          if (response) await typeText(response);
          onUserInputEnabledChange(true);
          break;
        }

        case 'ContinueWriting': {
          const selection = getSelectedBlockText();
          const prompt = getPrompt({ label, selection });
          if (!prompt) return;

          const response = await sendMessageAndGetResponse(prompt);
          const cleanedResponse = removeOccurrences(selection, response);
          if (cleanedResponse) await typeText(cleanedResponse);
          break;
        }

        case 'MakeLonger': {
          const selection = getSelectedText();
          const prompt = getPrompt({ label, selection });
          if (!prompt) return;

          const response = await sendMessageAndGetResponse(prompt);
          if (response) await typeText(response, true);
          break;
        }

        case 'Critisize': {
          const selection = critisizeScope === 'lecture' ? getEntireText() : getSelectedBlockText();

          if (!selection) {
            toast.error(critisizeScope === 'lecture' ? t('critisizeLectureMissing') : t('critisizeSelectionMissing'));
            return;
          }

          const prompt = getPrompt({ label, selection, scope: critisizeScope });
          if (!prompt) return;

          await sendMessageAndGetResponse(prompt);
          break;
        }

        case 'Translate': {
          const selection = getSelectedText();
          if (!selection || !inputValue) {
            toast.error(t('translateToLanguageMissing'));
            return;
          }

          const prompt = getPrompt({ label, selection, targetLanguage: inputValue });
          if (!prompt) return;

          const response = await sendMessageAndGetResponse(prompt);
          if (response) await typeText(response, true);
          break;
        }
      }
    },
    [
      getPrompt,
      sendMessageAndGetResponse,
      typeText,
      getSelectedText,
      getSelectedBlockText,
      getEntireText,
      critisizeScope,
      onToolChange,
      onUserInputEnabledChange,
      t,
    ],
  );

  const handleKeyPress = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleOperation(selectedTool, chatInputValue);
      }
    },
    [handleOperation, selectedTool, chatInputValue],
  );

  const handleSubmit = useCallback(() => {
    handleOperation(selectedTool, chatInputValue);
  }, [handleOperation, selectedTool, chatInputValue]);

  return (
    <motion.div
      variants={MODAL_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={SPRING_TRANSITION}
      className="fixed bottom-24 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-[600px] -translate-x-1/2"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900 p-4 shadow-xl">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Image
              width={18}
              height={18}
              src={logoSrc}
              alt={t('platformLogoAlt')}
              className="rounded-sm"
              style={{ height: 'auto' }}
            />
            <span className="text-sm font-semibold text-zinc-100">{t('aiEditorTitle')}</span>
          </div>
          {/* Cancel button — visible while generating */}
          {isLoading && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-7 gap-1.5 px-2 text-xs text-zinc-500 hover:text-red-400"
              aria-label={t('stop')}
            >
              <Square
                size={11}
                className="fill-current"
              />
              {t('stop')}
            </Button>
          )}
        </div>

        {/* Content */}
        <div className="mb-3 flex min-h-[80px] w-full items-center justify-center rounded-lg bg-zinc-800/50 p-4">
          <AiEditorActionScreen
            onExecute={handleSubmit}
            selectedTool={selectedTool}
            isLoading={isLoading}
            error={error}
            onDismissError={onDismissError}
            critisizeScope={critisizeScope}
            onCritisizeScopeChange={onCritisizeScopeChange}
            chatInputValue={chatInputValue}
            onInputChange={onInputChange}
            lastAiResponse={lastAiResponse}
            streamingPreview={streamingPreview}
          />
        </div>

        {/* Input — only for Writer tool */}
        {isUserInputEnabled && (
          <div className="flex items-center gap-2">
            <Input
              onKeyDown={handleKeyPress}
              value={chatInputValue}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder={t('askAI')}
              disabled={isLoading}
              aria-label={t('askAI')}
              className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSubmit}
              disabled={isLoading || !chatInputValue.trim()}
              aria-label={t('sendMessage')}
              className="h-9 w-9 shrink-0 text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
            >
              <BetweenHorizontalStart size={16} />
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function AIEditorToolkit({ editor, activity, isOpen, onClose }: AIEditorToolkitProps) {
  const t = useTranslations('Activities.AIEditorToolkit');
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? platformLogoLight : platformLogo;
  const { messages, sendMessageAndGetResponse, isLoading, error, clear, stop, abort, resetConversation } =
    useActivityAIChat();

  // ── Local UI state ────────────────────────────────────────────────────────
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<ToolLabel>('Writer');
  // Hidden by default — only shown for the Writer tool.
  const [isUserInputEnabled, setIsUserInputEnabled] = useState(false);
  const [critisizeScope, setCritisizeScope] = useState<CritisizeScope>('selection');
  const [chatInputValue, setChatInputValue] = useState('');

  // Abort any in-flight request when the toolkit is closed or unmounted.
  useEffect(() => {
    if (!isOpen) {
      abort();
    }
    return () => {
      abort();
    };
  }, [abort, isOpen]);

  // Derive the last AI text: committed response (for Critisize display)
  // and in-flight streaming preview (for all tools while loading).
  // Both come from the same message — combined into one useMemo.
  const { lastAiResponse, streamingPreview } = useMemo(() => {
    const lastAssistant = [...messages].toReversed().find((m) => m.role === 'assistant');
    const text =
      lastAssistant?.parts
        .filter((p): p is TextPart => p.type === 'text')
        .map((p) => p.content)
        .join('') ?? '';
    return {
      lastAiResponse: isLoading ? '' : text,
      streamingPreview: isLoading ? text : '',
    };
  }, [messages, isLoading]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setIsFeedbackModalOpen(false);
    onClose();
  }, [onClose]);

  const handleToolSelect = useCallback(
    (label: ToolLabel) => {
      abort();
      stop();
      resetConversation();

      setSelectedTool(label);
      setIsFeedbackModalOpen(true);
      // The Writer tool has a free-text input; all other tools don't need it.
      setIsUserInputEnabled(label === 'Writer');
    },
    [abort, resetConversation, stop],
  );

  const handleCancel = useCallback(() => {
    abort();
    stop();
  }, [abort, stop]);

  const handleDismissError = useCallback(() => {
    clear();
  }, [clear]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={MODAL_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={SPRING_TRANSITION}
          className="fixed inset-0 z-50"
          style={{ pointerEvents: 'none' }}
        >
          <AnimatePresence>
            {isFeedbackModalOpen && (
              <UserFeedbackModal
                activity={activity}
                editor={editor}
                selectedTool={selectedTool}
                isUserInputEnabled={isUserInputEnabled}
                chatInputValue={chatInputValue}
                critisizeScope={critisizeScope}
                isLoading={isLoading}
                error={error}
                lastAiResponse={lastAiResponse}
                streamingPreview={streamingPreview}
                onToolChange={setSelectedTool}
                onUserInputEnabledChange={setIsUserInputEnabled}
                onInputChange={setChatInputValue}
                onCritisizeScopeChange={setCritisizeScope}
                onDismissError={handleDismissError}
                onCancel={handleCancel}
                sendMessageAndGetResponse={sendMessageAndGetResponse}
              />
            )}
          </AnimatePresence>

          {/* Toolbar */}
          <div
            className="fixed bottom-0 left-1/2 z-40 mb-5 -translate-x-1/2"
            style={{ pointerEvents: 'auto' }}
          >
            <div className="flex items-center gap-1.5 rounded-xl border border-zinc-700/60 bg-zinc-900 px-3 py-2 shadow-lg">
              {/* Logo */}
              <div className="flex items-center gap-2 pr-1">
                <Image
                  width={20}
                  height={20}
                  src={logoSrc}
                  alt={t('aiIconAlt')}
                  className="rounded-sm"
                  style={{ height: 'auto' }}
                />
                <span className="hidden text-xs font-semibold text-zinc-300 sm:block">{t('aiEditorTitle')}</span>
              </div>

              <div className="h-5 w-px bg-zinc-700/60" />

              {/* Tools */}
              <div className="flex flex-wrap gap-1">
                <AiEditorToolButton
                  label="Writer"
                  selectedTool={selectedTool}
                  onSelect={handleToolSelect}
                />
                <AiEditorToolButton
                  label="ContinueWriting"
                  selectedTool={selectedTool}
                  onSelect={handleToolSelect}
                />
                <AiEditorToolButton
                  label="MakeLonger"
                  selectedTool={selectedTool}
                  onSelect={handleToolSelect}
                />
                <AiEditorToolButton
                  label="Critisize"
                  selectedTool={selectedTool}
                  onSelect={handleToolSelect}
                />
                <AiEditorToolButton
                  label="Translate"
                  selectedTool={selectedTool}
                  onSelect={handleToolSelect}
                />
              </div>

              <div className="h-5 w-px bg-zinc-700/60" />

              {/* Close */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                aria-label={t('closeToolkit')}
                className="h-8 w-8 text-zinc-500 hover:bg-red-950/40 hover:text-red-400"
              >
                <X size={15} />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
