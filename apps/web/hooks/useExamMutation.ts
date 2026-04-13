'use client';

import { calculateExponentialBackoffDelay } from '@/lib/retry';
import { useCallback, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export interface MutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables, context?: any) => void;
  onSettled?: (data: TData | undefined, error: Error | undefined, variables: TVariables) => void;
  retry?: number | ((failureCount: number, error: Error) => boolean);
  retryDelay?: number | ((attemptIndex: number) => number);
  onMutate?: (variables: TVariables) => Promise<any> | any;
}

export interface MutationState<TData> {
  data: TData | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  failureCount: number;
}

/**
 * Custom mutation hook with retry logic and error handling
 * Similar to TanStack Query's useMutation but lightweight and tailored for exam operations
 *
 * Features:
 * - Configurable retry count or predicate
 * - Exponential backoff with jitter
 * - Optimistic updates with rollback
 * - Loading/error/success states
 *
 * @param options Mutation configuration
 */
export function useExamMutation<TData = unknown, TVariables = void>(options: MutationOptions<TData, TVariables>) {
  const {
    mutationFn,
    onSuccess,
    onError,
    onSettled,
    onMutate,
    retry = 3,
    retryDelay = (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30_000),
  } = options;

  const [state, setState] = useState<MutationState<TData>>({
    data: undefined,
    error: undefined,
    isLoading: false,
    isSuccess: false,
    isError: false,
    failureCount: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useState(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const shouldRetry = useCallback(
    (failureCount: number, error: Error): boolean => {
      if (typeof retry === 'number') {
        return failureCount < retry;
      }
      return retry(failureCount, error);
    },
    [retry],
  );

  const getRetryDelay = useCallback(
    (attemptIndex: number): number => {
      if (typeof retryDelay === 'number') {
        return retryDelay;
      }
      return retryDelay(attemptIndex);
    },
    [retryDelay],
  );

  const mutate = useCallback(
    async (variables: TVariables) => {
      // Create new abort controller for this mutation
      abortControllerRef.current = new AbortController();

      let context: any;
      let currentFailureCount = 0;

      // Reset state
      setState({
        data: undefined,
        error: undefined,
        isLoading: true,
        isSuccess: false,
        isError: false,
        failureCount: 0,
      });

      try {
        // Call onMutate for optimistic updates
        if (onMutate) {
          context = await onMutate(variables);
        }

        let lastError: Error | undefined;
        let result: TData | undefined;

        // Retry loop
        while (currentFailureCount <= (typeof retry === 'number' ? retry : 10)) {
          try {
            result = await mutationFn(variables);

            // Success!
            if (isMountedRef.current) {
              setState({
                data: result,
                error: undefined,
                isLoading: false,
                isSuccess: true,
                isError: false,
                failureCount: currentFailureCount,
              });
            }

            onSuccess?.(result, variables);
            onSettled?.(result, undefined, variables);

            return result;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if we should retry
            if (!shouldRetry(currentFailureCount, lastError)) {
              throw lastError;
            }

            currentFailureCount += 1;

            // Update failure count in state
            if (isMountedRef.current) {
              setState((prev) => ({
                ...prev,
                failureCount: currentFailureCount,
              }));
            }

            // Wait before retry with exponential backoff + jitter
            const delay = getRetryDelay(currentFailureCount - 1);
            const retryWaitMs = calculateExponentialBackoffDelay(0, {
              baseDelayMs: delay,
              maxDelayMs: delay,
              jitterRatio: 0.5,
            });
            await sleep(retryWaitMs);

            // Check if aborted during sleep
            if (abortControllerRef.current?.signal.aborted) {
              throw new Error('Mutation aborted', { cause: error });
            }
          }
        }

        // If we get here, we exhausted retries
        throw lastError || new Error('Unknown error');
      } catch (error) {
        const finalError = error instanceof Error ? error : new Error(String(error));

        if (isMountedRef.current) {
          setState({
            data: undefined,
            error: finalError,
            isLoading: false,
            isSuccess: false,
            isError: true,
            failureCount: currentFailureCount,
          });
        }

        onError?.(finalError, variables, context);
        onSettled?.(undefined, finalError, variables);

        throw finalError;
      }
    },
    [mutationFn, onSuccess, onError, onSettled, onMutate, retry, shouldRetry, getRetryDelay],
  );

  const mutateAsync = mutate;

  const reset = useCallback(() => {
    setState({
      data: undefined,
      error: undefined,
      isLoading: false,
      isSuccess: false,
      isError: false,
      failureCount: 0,
    });
  }, []);

  return {
    ...state,
    mutate,
    mutateAsync,
    reset,
  };
}

/**
 * Helper hook specifically for exam submission with built-in error handling
 */
export function useExamSubmission(onSuccess?: () => void) {
  const t = useTranslations('Activities.ExamActivity');

  const mutation = useExamMutation({
    mutationFn: async ({
      examUuid,
      attemptUuid,
      answers,
    }: {
      examUuid: string;
      attemptUuid: string;
      answers: Record<number, any>;
    }) => {
      const response = await apiFetch(`exams/${examUuid}/attempts/${attemptUuid}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Submission failed: ${response.status}`);
      }

      return response.json();
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
    onSuccess: (data, variables) => {
      toast.success(t('examSubmittedSuccessfully'));
      onSuccess?.();
    },
    onError: (error, variables, context) => {
      console.error('Exam submission error:', error);
      toast.error(error.message || t('errorSubmittingExam'));
    },
  });

  return mutation;
}
