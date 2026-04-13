import { apiFetch } from '@/lib/api-client';

export async function reportClientError(payload: Record<string, unknown>): Promise<void> {
  const origin = typeof globalThis.window !== 'undefined' ? globalThis.location.origin : undefined;

  await apiFetch('/api/log-error', {
    baseUrl: origin,
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
    keepalive: true,
    method: 'POST',
  });
}
