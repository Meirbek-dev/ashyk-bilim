'use client';

import { useCallback, useEffect, useRef } from 'react';

// ── Persisted shape ───────────────────────────────────────────────────────────

export interface PersistedAttemptData<T = unknown> {
  attemptUuid: string;
  answers: T;
  lastSaved: number;
  /** Bumped when the stored schema changes so old entries are discarded. */
  version: number;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseAssessmentAttemptOptions<T = unknown> {
  /**
   * Unique identifier for the in-progress attempt. Used as the localStorage key
   * suffix so multiple concurrent attempts never collide.
   */
  attemptUuid: string;
  /**
   * Called once on mount when recoverable answers exist for this attempt.
   * The caller decides what to do (e.g. show a recovery dialog).
   */
  onRestore?: (answers: T) => void;
  /** Milliseconds between auto-saves.  0 = save synchronously on every call. */
  autoSaveInterval?: number;
  /** Hours after which stored data is considered expired and purged. */
  expirationHours?: number;
  /**
   * Storage key prefix.  Defaults to `'assessment_answers_'`.
   * Override to namespace exam vs. quiz attempts if needed (usually unnecessary
   * since `attemptUuid` already makes keys unique).
   */
  storageKeyPrefix?: string;
}

// ── Return type ───────────────────────────────────────────────────────────────

export interface UseAssessmentAttemptReturn<T = unknown> {
  /** Persist answers. May be debounced by `autoSaveInterval`. */
  saveAnswers: (answers: T) => void;
  /** Remove the localStorage entry for this attempt (call on successful submit). */
  clearSavedAnswers: () => void;
  /** Returns the stored data if it is still valid, or `null` otherwise. */
  getRecoverableData: () => PersistedAttemptData<T> | null;
}

const DEFAULT_PREFIX = 'assessment_answers_';
const SCHEMA_VERSION = 1;

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Generalised localStorage draft-answer persistence for any assessment kind.
 *
 * Replaces the exam-specific `useExamPersistence` hook.  Drop-in compatible:
 * same `saveAnswers` / `clearSavedAnswers` / `getRecoverableData` API, but
 * works with any serialisable answer type `T` and any `storageKeyPrefix`.
 */
export function useAssessmentAttempt<T = unknown>({
  attemptUuid,
  onRestore,
  autoSaveInterval = 5000,
  expirationHours = 24,
  storageKeyPrefix = DEFAULT_PREFIX,
}: UseAssessmentAttemptOptions<T>): UseAssessmentAttemptReturn<T> {
  const storageKey = `${storageKeyPrefix}${attemptUuid}`;
  const pendingAnswersRef = useRef<T | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRestoreRef = useRef(onRestore);

  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const isExpired = useCallback(
    (entry: PersistedAttemptData<T>): boolean => {
      const expirationMs = expirationHours * 60 * 60 * 1000;
      return Date.now() - entry.lastSaved > expirationMs;
    },
    [expirationHours],
  );

  const purgeExpired = useCallback(() => {
    if (typeof globalThis.window === 'undefined') return;
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key?.startsWith(storageKeyPrefix)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const entry = JSON.parse(raw) as PersistedAttemptData<T>;
          if (isExpired(entry)) toRemove.push(key);
        } catch {
          toRemove.push(key); // corrupt entry
        }
      }
      for (const k of toRemove) localStorage.removeItem(k);
    } catch {
      // localStorage unavailable (SSR, private browsing quota)
    }
  }, [isExpired, storageKeyPrefix]);

  // ── Read ─────────────────────────────────────────────────────────────────────

  const getRecoverableData = useCallback((): PersistedAttemptData<T> | null => {
    if (typeof globalThis.window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const entry = JSON.parse(raw) as PersistedAttemptData<T>;
      if (
        entry.attemptUuid !== attemptUuid ||
        entry.version !== SCHEMA_VERSION ||
        isExpired(entry) ||
        !entry.answers ||
        (typeof entry.answers === 'object' && Object.keys(entry.answers).length === 0)
      ) {
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }, [attemptUuid, isExpired, storageKey]);

  // ── Write ─────────────────────────────────────────────────────────────────────

  const persist = useCallback(
    (answers: T) => {
      if (typeof globalThis.window === 'undefined') return;
      try {
        const entry: PersistedAttemptData<T> = {
          attemptUuid,
          answers,
          lastSaved: Date.now(),
          version: SCHEMA_VERSION,
        };
        localStorage.setItem(storageKey, JSON.stringify(entry));
      } catch (error) {
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          purgeExpired();
          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify({ attemptUuid, answers, lastSaved: Date.now(), version: SCHEMA_VERSION }),
            );
          } catch {
            // Quota still exceeded after purge — silently drop.
          }
        }
      }
    },
    [attemptUuid, purgeExpired, storageKey],
  );

  const saveAnswers = useCallback(
    (answers: T) => {
      pendingAnswersRef.current = answers;
      if (autoSaveInterval <= 0) persist(answers);
    },
    [autoSaveInterval, persist],
  );

  const clearSavedAnswers = useCallback(() => {
    if (typeof globalThis.window === 'undefined') return;
    try {
      localStorage.removeItem(storageKey);
      pendingAnswersRef.current = null;
    } catch {
      // ignore
    }
  }, [storageKey]);

  // ── Auto-save interval ────────────────────────────────────────────────────────

  useEffect(() => {
    if (autoSaveInterval <= 0) return;
    autoSaveTimerRef.current = setInterval(() => {
      if (pendingAnswersRef.current !== null) {
        persist(pendingAnswersRef.current);
      }
    }, autoSaveInterval);
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [autoSaveInterval, persist]);

  // ── Mount: purge stale + check recovery ──────────────────────────────────────

  useEffect(() => {
    purgeExpired();
  }, [purgeExpired]);

  useEffect(() => {
    const data = getRecoverableData();
    if (data && onRestoreRef.current) {
      onRestoreRef.current(data.answers);
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { saveAnswers, clearSavedAnswers, getRecoverableData };
}
