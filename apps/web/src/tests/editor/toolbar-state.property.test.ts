/**
 * Property-based tests for the EditorToolbar state selector.
 *
 * Feature: rich-text-editor, Property 9: Toolbar state selector returns only primitives
 *
 * Validates: Requirements 1.4, 2.2
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  selectToolbarState,
  type ToolbarStateSnap,
} from '../../components/Objects/Editor/Toolbar/EditorToolbar';

// ---------------------------------------------------------------------------
// Arbitrary generator for editor state snapshots
//
// The selector calls:
//   snap.editor.isActive(name, attrs?)  → boolean
//   snap.editor.can().undo()            → boolean
//   snap.editor.can().redo()            → boolean
//   snap.editor.getAttributes(name)     → Record<string, unknown>
//
// We generate arbitrary boolean return values for isActive/can, and
// arbitrary primitive-or-null values for getAttributes so we can verify
// the selector always returns only primitives regardless of what the
// editor reports.
// ---------------------------------------------------------------------------

/**
 * Builds an arbitrary ToolbarStateSnap where every editor method returns
 * independently generated values.
 */
const arbEditorStateSnapshot: fc.Arbitrary<ToolbarStateSnap> = fc
  .record({
    // isActive is called up to 13 times (7 named marks + 6 heading levels).
    // We generate a list of booleans and cycle through them.
    isActiveResults: fc.array(fc.boolean(), { minLength: 13, maxLength: 13 }),
    canUndo: fc.boolean(),
    canRedo: fc.boolean(),
    // getAttributes('codeBlock').language — string | undefined
    codeBlockLanguage: fc.oneof(
      fc.constant(undefined),
      fc.string({ minLength: 0, maxLength: 40 }),
    ),
    // getAttributes('link').href — string | undefined
    linkHref: fc.oneof(
      fc.constant(undefined),
      fc.string({ minLength: 0, maxLength: 200 }),
    ),
  })
  .map(({ isActiveResults, canUndo, canRedo, codeBlockLanguage, linkHref }) => {
    let callIndex = 0;

    const snap: ToolbarStateSnap = {
      editor: {
        isActive: (_name: string, _attrs?: Record<string, unknown>) => {
          // Return the next boolean in the sequence, cycling if needed
          const result = isActiveResults[callIndex % isActiveResults.length]!;
          callIndex++;
          return result;
        },
        can: () => ({
          undo: () => canUndo,
          redo: () => canRedo,
        }),
        getAttributes: (name: string) => {
          if (name === 'codeBlock') {
            return codeBlockLanguage !== undefined
              ? { language: codeBlockLanguage }
              : {};
          }
          if (name === 'link') {
            return linkHref !== undefined ? { href: linkHref } : {};
          }
          return {};
        },
      },
    };

    return snap;
  });

// ---------------------------------------------------------------------------
// Property 9: Toolbar state selector returns only primitives
// ---------------------------------------------------------------------------

describe('EditorToolbar state selector (Property 9)', () => {
  // Feature: rich-text-editor, Property 9: Toolbar state selector returns only primitives
  it('selectToolbarState returns only boolean, number, string, or null values for any editor snapshot', () => {
    fc.assert(
      fc.property(arbEditorStateSnapshot, (snap) => {
        const result = selectToolbarState(snap);

        for (const [key, value] of Object.entries(result)) {
          const t = typeof value;
          const isPrimitive =
            t === 'boolean' ||
            t === 'number' ||
            t === 'string' ||
            (t === 'object' && value === null);

          expect(
            isPrimitive,
            `Expected key "${key}" to be a primitive (boolean/number/string/null), got ${t}: ${JSON.stringify(value)}`,
          ).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('headingLevel is always a number in [0, 6]', () => {
    fc.assert(
      fc.property(arbEditorStateSnapshot, (snap) => {
        const result = selectToolbarState(snap);
        expect(typeof result.headingLevel).toBe('number');
        expect(result.headingLevel).toBeGreaterThanOrEqual(0);
        expect(result.headingLevel).toBeLessThanOrEqual(6);
      }),
      { numRuns: 200 },
    );
  });

  it('boolean fields are always booleans', () => {
    fc.assert(
      fc.property(arbEditorStateSnapshot, (snap) => {
        const result = selectToolbarState(snap);
        const booleanFields = [
          'isBold',
          'isItalic',
          'isStrike',
          'isBulletList',
          'isOrderedList',
          'isCodeBlock',
          'isLink',
          'canUndo',
          'canRedo',
        ] as const;

        for (const field of booleanFields) {
          expect(typeof result[field], `${field} should be boolean`).toBe('boolean');
        }
      }),
      { numRuns: 200 },
    );
  });

  it('codeBlockLanguage is always string or null', () => {
    fc.assert(
      fc.property(arbEditorStateSnapshot, (snap) => {
        const result = selectToolbarState(snap);
        const t = typeof result.codeBlockLanguage;
        const isStringOrNull = t === 'string' || (t === 'object' && result.codeBlockLanguage === null);
        expect(isStringOrNull).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('linkHref is always a string', () => {
    fc.assert(
      fc.property(arbEditorStateSnapshot, (snap) => {
        const result = selectToolbarState(snap);
        expect(typeof result.linkHref).toBe('string');
      }),
      { numRuns: 200 },
    );
  });
});
