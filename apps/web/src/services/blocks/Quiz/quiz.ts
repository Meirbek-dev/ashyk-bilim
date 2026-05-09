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
