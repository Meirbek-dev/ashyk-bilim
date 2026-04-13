import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';

export interface SearchContentParams {
  query: string;
  page?: number;
  limit?: number;
  next?: any;
}

export async function searchContent({ query, page = 1, limit = 20 }: SearchContentParams) {
  const result = await apiFetch(`search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
  return await getResponseMetadata(result);
}
