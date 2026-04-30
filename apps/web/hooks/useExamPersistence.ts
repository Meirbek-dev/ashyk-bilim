// LEGACY — replaced by features/assessments/shell/hooks/useAssessmentAttempt.ts
// TODO Phase 1: delete this file once ExamAttemptContent is migrated.
// See plans/assessment-system-redesign.md
'use client';
import { useCallback, useEffect, useRef } from 'react';

interface PersistedExamData {
  attemptUuid: string;
  answers: Record<number, any>;
  lastSaved: number;
  version: number;
}

interface UseExamPersistenceOptions {
  attemptUuid: string;
  onRestore?: (answers: Record<number, any>) => void;
  autoSaveInterval?: number; // milliseconds
  expirationHours?: number;
}

interface UseExamPersistenceReturn {
  saveAnswers: (answers: Record<number, any>) => void;
  clearSavedAnswers: () => void;
  hasRecoverableData: () => boolean;
  getRecoverableData: () => PersistedExamData | null;
  lastSaveTime: number | null;
}

const STORAGE_KEY_PREFIX = 'exam_answers_';
const VERSION = 1;

/**
 * Hook for persisting exam answers to localStorage with auto-save and recovery.
 *
 * Features:
 * - Auto-saves answers at configurable interval (default 5s)
 * - Detects and offers recovery from previous session
 * - Auto-cleanup of expired data (default 24 hours)
 * - Version control for schema migrations
 *
 * @param options Configuration options
 * @returns Methods to manage persistence
 */
export function useExamPersistence({
  attemptUuid,
  onRestore,
  autoSaveInterval = 5000,
  expirationHours = 24,
}: UseExamPersistenceOptions): UseExamPersistenceReturn {
  const storageKey = `${STORAGE_KEY_PREFIX}${attemptUuid}`;
  const lastSaveTimeRef = useRef<number | null>(null);
  const pendingAnswersRef = useRef<Record<number, any> | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up expired data from localStorage
  const cleanupExpiredData = useCallback(() => {
    if (typeof globalThis.window === 'undefined') return;

    try {
      const now = Date.now();
      const expirationMs = expirationHours * 60 * 60 * 1000;
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key?.startsWith(STORAGE_KEY_PREFIX)) continue;

        const dataStr = localStorage.getItem(key);
        if (!dataStr) continue;

        try {
          const data = JSON.parse(dataStr) as PersistedExamData;
          if (now - data.lastSaved > expirationMs) {
            keysToRemove.push(key);
          }
        } catch {
          // Invalid data, mark for removal
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key));
      if (keysToRemove.length > 0) {
        console.log(`[useExamPersistence] Cleaned up ${keysToRemove.length} expired exam data`);
      }
    } catch (error) {
      console.error('[useExamPersistence] Error during cleanup:', error);
    }
  }, [expirationHours]);

  // Check if there's recoverable data for this attempt
  const hasRecoverableData = useCallback((): boolean => {
    if (typeof globalThis.window === 'undefined') return false;

    try {
      const dataStr = localStorage.getItem(storageKey);
      if (!dataStr) return false;

      const data = JSON.parse(dataStr) as PersistedExamData;
      const now = Date.now();
      const expirationMs = expirationHours * 60 * 60 * 1000;

      return (
        data.attemptUuid === attemptUuid &&
        data.version === VERSION &&
        now - data.lastSaved < expirationMs &&
        Object.keys(data.answers).length > 0
      );
    } catch {
      return false;
    }
  }, [attemptUuid, expirationHours, storageKey]);

  // Get recoverable data
  const getRecoverableData = useCallback((): PersistedExamData | null => {
    if (!hasRecoverableData()) return null;

    try {
      const dataStr = localStorage.getItem(storageKey);
      if (!dataStr) return null;
      return JSON.parse(dataStr) as PersistedExamData;
    } catch {
      return null;
    }
  }, [hasRecoverableData, storageKey]);

  // Save answers to localStorage
  const saveAnswers = useCallback(
    (answers: Record<number, any>) => {
      if (typeof globalThis.window === 'undefined') return;

      try {
        // Validate answers object to prevent saving corrupted data
        if (!answers || typeof answers !== 'object') {
          console.warn('[useExamPersistence] Invalid answers object, skipping save');
          return;
        }

        const data: PersistedExamData = {
          attemptUuid,
          answers,
          lastSaved: Date.now(),
          version: VERSION,
        };

        localStorage.setItem(storageKey, JSON.stringify(data));
        lastSaveTimeRef.current = data.lastSaved;
      } catch (error) {
        // Handle QuotaExceededError gracefully
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          console.warn('[useExamPersistence] LocalStorage quota exceeded, attempting cleanup');
          cleanupExpiredData();
          // Try one more time after cleanup
          try {
            const data: PersistedExamData = {
              attemptUuid,
              answers,
              lastSaved: Date.now(),
              version: VERSION,
            };
            localStorage.setItem(storageKey, JSON.stringify(data));
            lastSaveTimeRef.current = data.lastSaved;
          } catch (error) {
            console.error('[useExamPersistence] Failed to save exam answers after cleanup:', error);
          }
        } else {
          console.error('[useExamPersistence] Failed to save answers:', error);
        }
      }
    },
    [attemptUuid, storageKey, cleanupExpiredData],
  );

  // Clear saved answers
  const clearSavedAnswers = useCallback(() => {
    if (typeof globalThis.window === 'undefined') return;

    try {
      localStorage.removeItem(storageKey);
      lastSaveTimeRef.current = null;
      pendingAnswersRef.current = null;
    } catch (error) {
      console.error('[useExamPersistence] Failed to clear saved answers:', error);
    }
  }, [storageKey]);

  // Auto-save effect
  useEffect(() => {
    if (autoSaveInterval <= 0) return;

    autoSaveTimerRef.current = setInterval(() => {
      if (pendingAnswersRef.current) {
        saveAnswers(pendingAnswersRef.current);
      }
    }, autoSaveInterval);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [autoSaveInterval, saveAnswers]);

  // Cleanup expired data on mount
  useEffect(() => {
    cleanupExpiredData();
  }, [cleanupExpiredData]);

  // Check for recoverable data on mount
  useEffect(() => {
    if (hasRecoverableData() && onRestore) {
      const data = getRecoverableData();
      if (data) {
        console.log(`[useExamPersistence] Found recoverable data from ${new Date(data.lastSaved).toLocaleString()}`);
        onRestore(data.answers);
      }
    }
  }, [hasRecoverableData, getRecoverableData, onRestore]);

  // Update pending answers ref (for auto-save)
  const saveAnswersWithAutoSave = useCallback(
    (answers: Record<number, any>) => {
      pendingAnswersRef.current = answers;
      // Immediate save if no auto-save interval
      if (autoSaveInterval <= 0) {
        saveAnswers(answers);
      }
    },
    [autoSaveInterval, saveAnswers],
  );

  return {
    saveAnswers: saveAnswersWithAutoSave,
    clearSavedAnswers,
    hasRecoverableData,
    getRecoverableData,
    lastSaveTime: lastSaveTimeRef.current,
  };
}
