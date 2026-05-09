'use server';
import { requireSession } from '@/lib/auth/session';

import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';

export async function updatePassword(user_id: number, data: any) {
  await requireSession();
  const result = await apiFetch(`users/change_password/${user_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return await getResponseMetadata(result);
}
