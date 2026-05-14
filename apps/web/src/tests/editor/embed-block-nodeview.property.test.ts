/**
 * Property-based tests for EmbedBlock NodeView height clamping.
 *
 * Feature: rich-text-editor, Property 8: EmbedBlock NodeView height is always clamped to [200, 1200]
 *
 * Validates: Requirements 8.4, 8.5
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { clampEmbedHeight } from '../../components/Objects/Editor/Extensions/EmbedBlock/EmbedBlockNodeView';

// ---------------------------------------------------------------------------
// Property 8: EmbedBlock NodeView height is always clamped to [200, 1200]
// ---------------------------------------------------------------------------

describe('EmbedBlock NodeView height clamping (Property 8)', () => {
  // Feature: rich-text-editor, Property 8: EmbedBlock NodeView height is always clamped to [200, 1200]
  it('clampEmbedHeight always returns a value in [200, 1200] for any integer input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 3000 }),
        (rawHeight) => {
          const clamped = clampEmbedHeight(rawHeight);
          expect(clamped).toBeGreaterThanOrEqual(200);
          expect(clamped).toBeLessThanOrEqual(1200);
        },
      ),
      { numRuns: 100 },
    );
  });
});
