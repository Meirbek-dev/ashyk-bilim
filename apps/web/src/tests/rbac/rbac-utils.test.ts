import { describe, it, expect } from 'vitest';
import { perm } from '@/types/permissions';

describe('RBAC Utility', () => {
  it('should format permission strings correctly', () => {
    // Testing the actual implementation from '@/types/permissions'
    expect(perm('course', 'create', 'platform')).toBe('course:create:platform');
    expect(perm('user', 'read', 'own')).toBe('user:read:own');
  });
});
