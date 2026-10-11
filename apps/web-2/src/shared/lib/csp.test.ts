import { expect, test } from 'vite-plus/test'

import { contentSecurityPolicy } from './csp'

test('video metadata probes can load picked blobs and hosted media without allowing remote media', () => {
  const policy = contentSecurityPolicy('test-nonce').split('; ')
  expect(policy).toContain("media-src 'self' blob:")
  expect(policy).toContain("default-src 'self'")
  expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'")
})
