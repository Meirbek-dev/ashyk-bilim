'use server';
import { requireSession } from '@/lib/auth/session';

import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';

export async function updateProfile(data: any, user_id: number) {
  await requireSession();
  const result = await apiFetch(`users/${user_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.users, 'max');
  }

  return metadata;
}
