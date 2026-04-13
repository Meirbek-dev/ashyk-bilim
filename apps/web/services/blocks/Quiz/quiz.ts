'use server';

import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';

interface QuizSubmissionPayload {
  answers: any[];
  start_ts?: string;
  end_ts?: string;
  idempotency_key?: string;
  violation_count?: number;
  violations?: Record<string, any>;
}

export async function submitQuizBlock(activity_id: number, data: QuizSubmissionPayload) {
  try {
    const result = await apiFetch(`blocks/quiz/${activity_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const response = await result.json();
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
    return response;
  } catch (error) {
    console.log('error', error);
    throw error;
  }
}

export async function getQuizAttempts(activity_id: number, user_id?: number) {
  try {
    const path = user_id
      ? `blocks/quiz/${activity_id}/attempts?user_id=${user_id}`
      : `blocks/quiz/${activity_id}/attempts`;

    const result = await apiFetch(path);
    return await result.json();
  } catch (error) {
    console.log('error', error);
    throw error;
  }
}

export async function getQuizStats(activity_id: number) {
  try {
    const result = await apiFetch(`blocks/quiz/${activity_id}/stats`);
    return await result.json();
  } catch (error) {
    console.log('error', error);
    throw error;
  }
}
