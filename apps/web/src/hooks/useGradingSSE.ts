/**
 * useGradingSSE — Hook for real-time grading updates via Server-Sent Events.
 *
 * Connects to the SSE endpoint and dispatches events when:
 * - A new submission arrives for the current activity
 * - Another teacher grades the same submission (conflict detection)
 * - A grade is published
 */

import { useEffect, useRef } from 'react';

export type GradingSSEEvent =
  | { type: 'submission.submitted'; submission_uuid: string; user_id: number }
  | { type: 'grade.published'; submission_uuid: string; final_score: number }
  | { type: 'submission.returned'; submission_uuid: string }
  | { type: 'grade.conflict'; submission_uuid: string; graded_by: number };

interface UseGradingSSEOptions {
  /** Activity ID to subscribe to. */
  activityId: number;
  /** Assessment UUID for filtering. */
  assessmentUuid?: string;
  /** Called when a relevant event arrives. */
  onEvent: (event: GradingSSEEvent) => void;
  /** Whether the connection should be active. */
  enabled?: boolean;
}

export function useGradingSSE({ activityId, assessmentUuid, onEvent, enabled = true }: UseGradingSSEOptions): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !activityId) return;

    const params = new URLSearchParams({ activity_id: String(activityId) });
    if (assessmentUuid) params.set('assessment_uuid', assessmentUuid);

    const url = `/api/v1/grading/sse?${params.toString()}`;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as GradingSSEEvent;
          onEventRef.current(data);
        } catch {
          // Ignore malformed events
        }
      };

      eventSource.onerror = () => {
        // EventSource auto-reconnects; we just log
        console.debug('[GradingSSE] Connection error, will auto-reconnect');
      };
    } catch {
      // SSE not supported or URL invalid
    }

    return () => {
      eventSource?.close();
    };
  }, [activityId, assessmentUuid, enabled]);
}
