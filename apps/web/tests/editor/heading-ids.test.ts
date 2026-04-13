import { describe, expect, it } from 'vitest';
import { slugifyHeadingText } from '../../components/Objects/Editor/core/heading-ids';

describe('slugifyHeadingText', () => {
  // ── Latin ──────────────────────────────────────────────────────────────────
  it('lowercases and hyphenates Latin text', () => {
    expect(slugifyHeadingText('Hello World')).toBe('hello-world');
  });

  it('strips punctuation from Latin text', () => {
    expect(slugifyHeadingText('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple spaces/underscores into one hyphen', () => {
    expect(slugifyHeadingText('foo   bar__baz')).toBe('foo-bar-baz');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugifyHeadingText('  Hello World  ')).toBe('hello-world');
  });

  // ── Cyrillic ───────────────────────────────────────────────────────────────
  it('preserves Cyrillic characters without stripping', () => {
    const slug = slugifyHeadingText('Привет Мир');
    expect(slug).toBe('привет-мир');
  });

  it('lowercases Cyrillic text', () => {
    expect(slugifyHeadingText('ҚАЗАҚСТАН')).toBe('қазақстан');
  });

  it('handles mixed Cyrillic and Latin', () => {
    const slug = slugifyHeadingText('JavaScript және Python');
    expect(slug).toBe('javascript-және-python');
  });

  it('strips Cyrillic punctuation but keeps letters and digits', () => {
    // `:` and `.` and `—` are stripped; `1.2` becomes `12` (dot removed)
    const slug = slugifyHeadingText('Сурет: 1.2 — Схема');
    expect(slug).toBe('сурет-12-схема');
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  it('returns empty string for empty input', () => {
    expect(slugifyHeadingText('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(slugifyHeadingText('   ')).toBe('');
  });

  it('preserves digits', () => {
    expect(slugifyHeadingText('Chapter 3')).toBe('chapter-3');
  });

  it('is idempotent on already-slugified ASCII input', () => {
    const slug = 'hello-world-123';
    expect(slugifyHeadingText(slug)).toBe(slug);
  });

  it('does not produce leading/trailing hyphens from non-word chars', () => {
    const slug = slugifyHeadingText('---Hello---');
    expect(slug).not.toMatch(/^-|-$/);
  });
});
