/**
 * useAssessmentAutosave — Auto-saves student draft every 30 seconds.
 *
 * Uses optimistic concurrency via If-Match header with draft_version.
 * Debounces rapid edits so at most one save request is in flight at a time.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '@/features/assessments/shared/AutoSaveIndicator';

const AUTOSAVE_INTERVAL_MS = 30_000;

interface UseAssessmentAutosaveOptions {
  /** Assessment UUID to save drafts for. */
  assessmentUuid: string;
  /** Current draft version (from server). */
  draftVersion: number;
  /** Function that returns the current answers to save. */
  getAnswers: () => Record<string, unknown>;
  /** Whether autosave is enabled (e.g., disabled after submission). */
  enabled?: boolean;
  /** API call to save the draft. */
  saveDraft: (
    assessmentUuid: string,
    answers: Record<string, unknown>,
    ifMatch: string,
  ) => Promise<{ draft_version: number }>;
}

interface UseAssessmentAutosaveResult {
  status: SaveStatus;
  lastSavedAt: Date | null;
  saveNow: () => Promise<void>;
}

export function useAssessmentAutosave({
  assessmentUuid,
  draftVersion,
  getAnswers,
  enabled = true,
  saveDraft,
}: UseAssessmentAutosaveOptions): UseAssessmentAutosaveResult {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const isSavingRef = useRef(false);
  const versionRef = useRef(draftVersion);

  // Keep version ref in sync
  useEffect(() => {
    versionRef.current = draftVersion;
  }, [draftVersion]);

  const saveNow = useCallback(async () => {
    if (isSavingRef.current || !enabled) return;

    isSavingRef.current = true;
    setStatus('saving');

    try {
      const answers = getAnswers();
      const result = await saveDraft(assessmentUuid, answers, String(versionRef.current));
      versionRef.current = result.draft_version;
      setStatus('saved');
      setLastSavedAt(new Date());

      // Reset to idle after 3 seconds
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 3000);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error) {
        const httpError = error as { status: number };
        if (httpError.status === 412) {
          setStatus('conflict');
          return;
        }
      }
      setStatus('error');
      // Reset to idle after 5 seconds
      setTimeout(() => setStatus((s) => (s === 'error' ? 'idle' : s)), 5000);
    } finally {
      isSavingRef.current = false;
    }
  }, [assessmentUuid, enabled, getAnswers, saveDraft]);

  // Auto-save interval
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      saveNow();
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, saveNow]);

  return { status, lastSavedAt, saveNow };
}
