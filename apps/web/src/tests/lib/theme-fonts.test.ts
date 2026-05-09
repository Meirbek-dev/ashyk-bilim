import { describe, expect, it } from 'vitest';
import {
  buildGoogleFontCssUrl,
  extractFontFamily,
  getThemeFontStylesheetHref,
  resolveThemeFontFamilies,
} from '@/lib/theme-fonts';

describe('theme font handling', () => {
  it('extracts the first custom family while preserving quoted names', () => {
    expect(extractFontFamily('"JetBrains Mono", ui-monospace, monospace')).toBe('JetBrains Mono');
    expect(extractFontFamily("'DM Sans', system-ui, sans-serif")).toBe('DM Sans');
  });

  it('skips system font stacks that should not hit Google Fonts', () => {
    expect(extractFontFamily('ui-sans-serif, system-ui, sans-serif')).toBeNull();
    expect(extractFontFamily('Segoe UI, Helvetica Neue, Arial, sans-serif')).toBeNull();
    expect(extractFontFamily('Menlo, Monaco, Consolas, monospace')).toBeNull();
  });

  it('resolves only supported Google families from tweakcn tokens', () => {
    expect(
      resolveThemeFontFamilies({
        'font-sans': 'Inter, sans-serif',
        'font-serif': 'Signifier, Georgia, serif',
        'font-mono': 'JetBrains Mono, monospace',
      }),
    ).toEqual(['Inter', 'JetBrains Mono']);
  });

  it('builds one deterministic Google Fonts stylesheet for active theme fonts', () => {
    expect(buildGoogleFontCssUrl(['JetBrains Mono', 'Inter'])).toBe(
      'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&family=JetBrains+Mono:wght@400..700&display=swap',
    );
  });

  it('returns no stylesheet when a theme uses only local system fonts', () => {
    expect(
      getThemeFontStylesheetHref({
        'font-sans': 'Segoe UI, Helvetica Neue, Arial, sans-serif',
        'font-serif': 'Georgia, serif',
        'font-mono': 'SFMono-Regular, Menlo, Consolas, monospace',
      }),
    ).toBeNull();
  });
});
