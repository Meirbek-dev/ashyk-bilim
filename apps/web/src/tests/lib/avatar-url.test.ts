import { describe, expect, it } from 'vitest';

import { normalizeAvatarUrl } from '@/services/media/avatar';

describe('avatar URL normalization', () => {
  it('proxies Google profile image URLs through the app', () => {
    const googleUrl = 'https://lh3.googleusercontent.com/a/ACg8ocSample=s96-c';

    expect(normalizeAvatarUrl(googleUrl)).toBe(`/api/avatar?url=${encodeURIComponent(googleUrl)}`);
  });

  it('extracts and proxies Google URLs embedded in backend avatar paths', () => {
    const googleUrl = 'https://lh3.googleusercontent.com/a/ACg8ocSample=s96-c';
    const wrappedUrl = `http://localhost:3000/content/users/user-1/avatars/${googleUrl}`;

    expect(normalizeAvatarUrl(wrappedUrl)).toBe(`/api/avatar?url=${encodeURIComponent(googleUrl)}`);
  });

  it('keeps local avatar URLs unchanged', () => {
    expect(normalizeAvatarUrl('/content/users/user-1/avatars/avatar.webp')).toBe(
      '/content/users/user-1/avatars/avatar.webp',
    );
  });

  it('does not proxy unsupported external hosts', () => {
    const externalUrl = 'https://example.com/avatar.png';

    expect(normalizeAvatarUrl(externalUrl)).toBe(externalUrl);
  });
});
