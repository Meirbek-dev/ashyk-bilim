import { RequestBody, getResponseMetadata } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';

export async function checkHealth() {
  try {
    const result = await fetch(`${getAPIUrl()}health`, RequestBody('GET', null, null));
    if (!result.ok) {
      return {
        success: false,
        status: result.status,
        HTTPmessage: result.statusText,
        data: null,
      };
    }
    return getResponseMetadata(result);
  } catch {
    return {
      success: false,
      status: 503,
      HTTPmessage: 'Service unavailable',
      data: null,
    };
  }
}
