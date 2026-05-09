'use client';

import { useActivityAIChat } from '@components/Contexts/AI/ActivityAIChatContext';
import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert';
import { useSession } from '@/hooks/useSession';
import type { Session } from '@/lib/auth/types';
import { AlertTriangle, BadgeInfo, NotebookTabs, X } from 'lucide-react';
import { AiMessageBubble } from '@components/Shared/AI/AiMessageBubble';
import { AiChatInput } from '@components/Shared/AI/AiChatInput';
import platformLogoLight from '@public/platform_logo_light.svg';
import UserAvatar from '@components/Objects/UserAvatar';
import { ScrollArea } from '@components/ui/scroll-area';
import { AnimatePresence, motion } from 'motion/react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Separator } from '@components/ui/separator';
import type { TextPart } from '@tanstack/ai-client';
import { Spinner } from '@components/ui/spinner';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Activity {
  activity_uuid: string;
  [key: string]: unknown;
}

interface AIActivityAskProps {
  activity: Activity;
}

type PredefinedQuestionType = 'about' | 'flashcards' | 'examples';

// ── Main Trigger Button ────────────────────────────────────────────────────────

const AIActivityAsk = ({ activity: _activity }: AIActivityAskProps) => {
  const t = useTranslations('Activities.AIActivityAsk');
  const { isModalOpen, openModal, setIsModalOpen } = useActivityAIChat();

  const handleToggleModal = () => {
    if (isModalOpen) {
      setIsModalOpen(false);
    } else {
      openModal();
    }
  };

  return (
    <>
      <ActivityChatPanel />
      <Button
        variant="outline"
        size="sm"
        aria-pressed={isModalOpen}
        onClick={handleToggleModal}
        className={cn(
          'h-9 gap-2 rounded-full border-zinc-700 bg-zinc-900 px-4 text-zinc-200 hover:bg-zinc-800 hover:text-white',
          isModalOpen && 'border-zinc-600 bg-zinc-800 text-white',
        )}
      >
        <Image
          className="rounded-sm"
          width={18}
          height={18}
          src={platformLogoLight}
          alt={t('askAI')}
          style={{ height: 'auto' }}
        />
        <span className="text-xs font-semibold">{t('askAI')}</span>
      </Button>
    </>
  );
};

// ── Chat Panel ─────────────────────────────────────────────────────────────────

const ActivityChatPanel = () => {
  const t = useTranslations('Activities.AIActivityAsk');
  const { user: viewer } = useSession();

  const {
    messages,
    sendMessage,
    isLoading,
    stop,
    error,
    clear,
    statusMessage,
    isModalOpen,
    setIsModalOpen,
    inputValue,
    setInputValue,
  } = useActivityAIChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;
  const hasError = error !== undefined;

  // Auto-scroll to the latest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = () => {
    if (!isLoading && inputValue.trim()) {
      sendMessage(inputValue);
      setInputValue('');
    }
  };

  const closePanel = () => setIsModalOpen(false);

  return (
    <AnimatePresence>
      {isModalOpen && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            key="ai-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={closePanel}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="ai-panel"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'fixed z-50 flex flex-col overflow-hidden',
              'border border-zinc-700/60 bg-zinc-900 shadow-2xl',
              'inset-x-0 bottom-0 rounded-t-2xl',
              'h-[62dvh]',
              // Definite height (not h-auto + max-h) so that the inner flex-1
              // messages container and ScrollArea h-full resolve correctly.
              'md:bottom-4 md:left-1/2 md:h-[min(620px,85dvh)] md:min-h-[380px] md:w-[min(680px,95vw)] md:-translate-x-1/2 md:rounded-xl',
            )}
            style={{ pointerEvents: 'auto' }}
            role="dialog"
            aria-label={t('AI')}
            aria-modal="true"
          >
            {/* Mobile drag-handle pill */}
            <div
              className="mx-auto mt-2.5 h-1 w-10 flex-shrink-0 rounded-full bg-zinc-700 md:hidden"
              aria-hidden="true"
            />

            <div className="flex flex-1 flex-col overflow-hidden p-4 pt-3">
              {/* Header */}
              <div className="mb-3 flex flex-shrink-0 items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image
                    className="rounded-sm"
                    width={20}
                    height={20}
                    src={platformLogoLight}
                    alt={t('logoAlt')}
                    style={{ height: 'auto' }}
                  />
                  <span className="text-sm font-semibold text-zinc-100">{t('AI')}</span>
                  {isLoading && <Spinner className="h-3.5 w-3.5 text-zinc-400" />}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={closePanel}
                    aria-label={t('closePanel')}
                    className="h-7 w-7 text-zinc-500 hover:text-black"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Status hint */}
              {statusMessage && <p className="mb-2 flex-shrink-0 text-xs text-zinc-500">{statusMessage}</p>}

              {/* Messages area */}
              <div className="mb-3 min-h-0 flex-1 overflow-hidden">
                {hasMessages && !hasError ? (
                  <ScrollArea className="h-full overscroll-contain pr-1">
                    <div className="space-y-3 pb-2">
                      {messages.map((message, index) => {
                        const text = message.parts
                          .filter((p): p is TextPart => p.type === 'text')
                          .map((p) => p.content)
                          .join('');
                        const isLast = index === messages.length - 1;
                        const isStreamingThis = isLast && isLoading && message.role === 'assistant';
                        return (
                          <AiMessageBubble
                            key={message.id ?? index}
                            role={message.role as 'user' | 'assistant'}
                            content={text}
                            isStreaming={isStreamingThis}
                          />
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                ) : hasError ? (
                  <ErrorDisplay
                    errorMessage={error?.message}
                    onDismiss={clear}
                    t={t}
                  />
                ) : (
                  <AIMessagePlaceHolder
                    sendMessage={(msg) => {
                      sendMessage(msg);
                    }}
                    viewer={viewer}
                  />
                )}
              </div>

              <Separator className="mb-3 flex-shrink-0 bg-zinc-800" />

              {/* Input row */}
              <div className="flex-shrink-0">
                <AiChatInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSend={handleSend}
                  onStop={stop}
                  disabled={isLoading}
                  placeholder={t('placeholder')}
                  showAvatar
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ── Error Display ──────────────────────────────────────────────────────────────

interface ErrorDisplayProps {
  errorMessage?: string;
  onDismiss: () => void;
  t: (key: string) => string;
}

const ErrorDisplay = ({ errorMessage, onDismiss, t }: ErrorDisplayProps) => (
  <div
    className="flex h-full items-center justify-center"
    role="alert"
  >
    <Alert
      variant="destructive"
      className="max-w-md"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t('errorTitle')}</AlertTitle>
      <AlertDescription className="mt-1">{errorMessage || t('errorTitle')}</AlertDescription>
      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onDismiss}
          className="h-7 border-red-800 bg-transparent text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300"
        >
          {t('dismiss')}
        </Button>
      </div>
    </Alert>
  </div>
);

// ── Placeholder ────────────────────────────────────────────────────────────────

interface AIMessagePlaceHolderProps {
  sendMessage: (message: string) => void;
  viewer: Session['user'] | null;
}

const AIMessagePlaceHolder = ({ sendMessage, viewer }: AIMessagePlaceHolderProps) => {
  const t = useTranslations('Activities.AIActivityAsk');

  const userName = viewer?.first_name || viewer?.username || t('defaultUser');

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <div className="text-center">
        <p className="flex flex-wrap items-center justify-center gap-1.5 text-sm font-medium text-zinc-400">
          <span>{t('hello')}</span>
          <span className="flex items-center gap-1.5 capitalize">
            <UserAvatar
              size="sm"
              variant="outline"
            />
            <span className="text-zinc-300">{userName},</span>
          </span>
          <span>{t('howCanWeHelp')}</span>
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <AIChatPredefinedQuestion
          sendMessage={sendMessage}
          label="about"
        />
        <AIChatPredefinedQuestion
          sendMessage={sendMessage}
          label="flashcards"
        />
        <AIChatPredefinedQuestion
          sendMessage={sendMessage}
          label="examples"
        />
      </div>
    </div>
  );
};

// ── Predefined Question Badge ──────────────────────────────────────────────────

interface AIChatPredefinedQuestionProps {
  sendMessage: (message: string) => void;
  label: PredefinedQuestionType;
}

const AIChatPredefinedQuestion = ({ sendMessage, label }: AIChatPredefinedQuestionProps) => {
  const t = useTranslations('Activities.AIActivityAsk');

  const questions: Record<PredefinedQuestionType, string> = {
    about: t('questionAbout'),
    flashcards: t('questionFlashcards'),
    examples: t('questionExamples'),
  };

  const icons: Record<PredefinedQuestionType, ReactNode> = {
    about: <BadgeInfo className="h-3.5 w-3.5" />,
    flashcards: <NotebookTabs className="h-3.5 w-3.5" />,
    examples: <span className="text-xs leading-none font-bold">{t('examplesAbbr')}</span>,
  };

  const question = questions[label];

  const handleKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      sendMessage(question);
    }
  };

  return (
    <Badge
      role="button"
      tabIndex={0}
      variant="outline"
      className="cursor-pointer gap-1.5 border-zinc-700 bg-zinc-800 py-1 text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:outline-none"
      onClick={() => sendMessage(question)}
      onKeyDown={handleKeyDown}
    >
      {icons[label]}
      <span className="text-xs">{question}</span>
    </Badge>
  );
};

export default AIActivityAsk;
