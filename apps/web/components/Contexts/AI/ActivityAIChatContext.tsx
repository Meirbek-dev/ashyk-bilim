'use client';

/**
 * Thin shared context that wraps a single useChat instance for all AI
 * components within an activity page (AIActivityAsk + AICanvaToolkit).
 *
 * Using a context allows AIActivityAsk and AICanvaToolkit — which live in
 * separate React subtrees — to share the same chat session and message list
 * without prop drilling.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createActivityChatAdapter } from '@services/ai/activity-chat-adapter';
import type { UseChatReturn } from '@tanstack/ai-react';
import type { TextPart } from '@tanstack/ai-client';
import type { PropsWithChildren } from 'react';
import { useChat } from '@tanstack/ai-react';
import { useLocale, useTranslations } from 'next-intl';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityAIChatContextValue extends UseChatReturn {
  /** In-flight status hint forwarded from the backend status SSE events. */
  statusMessage: string | null;
  /** Whether the chat panel is visible. */
  isModalOpen: boolean;
  /** Opens the panel without forcing a new backend session. */
  openModal: () => void;
  setIsModalOpen: (open: boolean) => void;
  /** Current text input value. */
  inputValue: string;
  setInputValue: (value: string) => void;
  /** Aborts the current in-flight backend request. */
  abort: () => void;
  /** Clears local chat state and resets the backend session UUID. */
  resetConversation: () => void;
  /** Sends a prompt and resolves with the final assistant text for that run. */
  sendMessageAndGetResponse: (message: string) => Promise<string>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ActivityAIChatContext = createContext<ActivityAIChatContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function ActivityAIChatProvider({ activityUuid, children }: PropsWithChildren<{ activityUuid: string }>) {
  const tStatus = useTranslations('Activities.AIStatus');
  const locale = useLocale();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  // Keep the session UUID in a ref so it survives React Fast Refresh and
  // Strict-Mode double-mounts without starting a new backend session.
  const sessionUuidRef = useRef<string | null>(null);

  // Store the adapter's abort function so we can cancel in-flight requests.
  const abortRef = useRef<(() => void) | null>(null);
  const resolverQueueRef = useRef<((value: string) => void)[]>([]);

  const adapter = useMemo(
    () =>
      createActivityChatAdapter({
        activityUuid,
        getStatusMessage: (status) => {
          switch (status) {
            case 'processing': {
              return tStatus('processing');
            }
            case 'retrieving': {
              return tStatus('retrieving');
            }
            case 'analyzing': {
              return tStatus('analyzing');
            }
            case 'generating': {
              return tStatus('generating');
            }
            case 'aborted': {
              return tStatus('aborted');
            }
            default: {
              return tStatus('working');
            }
          }
        },
        getSessionUuid: () => sessionUuidRef.current,
        setSessionUuid: (uuid) => {
          sessionUuidRef.current = uuid;
        },
      }),
    // Recreate adapter only when the activity changes — access token and
    // session UUID changes are handled inside the factory via getter/setter.
    [activityUuid, tStatus],
  );

  // Keep the abort ref in sync whenever the adapter is recreated.
  useEffect(() => {
    abortRef.current = adapter.abort;
    return () => {
      adapter.abort();
    };
  }, [adapter]);

  const settleNextPendingResponse = useCallback((value: string) => {
    resolverQueueRef.current.shift()?.(value);
  }, []);

  const chat = useChat({
    connection: adapter.connection,
    onChunk: (chunk) => {
      if (chunk.type === 'CUSTOM' && chunk.name === 'ai_status') {
        setStatusMessage((chunk.value as { message?: string }).message ?? null);
      }
    },
    onFinish: (message) => {
      setStatusMessage(null);
      const text = message.parts
        .filter((part): part is TextPart => part.type === 'text')
        .map((part) => part.content)
        .join('');
      settleNextPendingResponse(text);
    },
    onError: () => {
      setStatusMessage(null);
      settleNextPendingResponse('');
    },
  });

  const chatStopRef = useRef(chat.stop);
  const chatClearRef = useRef(chat.clear);
  const chatSendMessageRef = useRef(chat.sendMessage);

  useEffect(() => {
    chatStopRef.current = chat.stop;
    chatClearRef.current = chat.clear;
    chatSendMessageRef.current = chat.sendMessage;
  }, [chat.stop, chat.clear, chat.sendMessage]);

  const abort = useCallback(() => {
    abortRef.current?.();
  }, []);

  const resetConversation = useCallback(() => {
    abort();
    chatStopRef.current();
    chatClearRef.current();
    setStatusMessage(null);
    setInputValue('');
    sessionUuidRef.current = null;

    while (resolverQueueRef.current.length) {
      resolverQueueRef.current.shift()?.('');
    }
  }, [abort]);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const sendMessageAndGetResponse = useCallback((message: string): Promise<string> => {
    if (!message.trim()) {
      return Promise.resolve('');
    }

    return new Promise((resolve) => {
      resolverQueueRef.current.push(resolve);
      chatSendMessageRef.current(message);
    });
  }, []);

  useEffect(() => {
    resetConversation();
    setIsModalOpen(false);
  }, [activityUuid, resetConversation]);

  useEffect(() => {
    const pendingResolvers = resolverQueueRef.current;

    return () => {
      while (pendingResolvers.length) {
        pendingResolvers.shift()?.('');
      }
    };
  }, []);

  // Abort stream and clear input when the panel closes.
  useEffect(() => {
    if (!isModalOpen) {
      abort();
      chatStopRef.current();
      setInputValue('');
    }
  }, [abort, isModalOpen]);

  const value = useMemo(
    () => ({
      ...chat,
      statusMessage,
      isModalOpen,
      openModal,
      setIsModalOpen,
      inputValue,
      setInputValue,
      abort,
      resetConversation,
      sendMessageAndGetResponse,
    }),
    [chat, statusMessage, isModalOpen, openModal, inputValue, abort, resetConversation, sendMessageAndGetResponse],
  );

  return <ActivityAIChatContext.Provider value={value}>{children}</ActivityAIChatContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useActivityAIChat(): ActivityAIChatContextValue {
  const ctx = useContext(ActivityAIChatContext);
  if (!ctx) throw new Error('useActivityAIChat must be used within ActivityAIChatProvider');
  return ctx;
}
