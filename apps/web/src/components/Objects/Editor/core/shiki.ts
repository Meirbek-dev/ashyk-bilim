import { createHighlighter } from 'shiki/bundle/web';

/**
 * Singleton highlighter instance for Shiki.
 * Optimized for web usage with shiki/bundle/web.
 */
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

export const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [
        'html',
        'css',
        'javascript',
        'typescript',
        'python',
        'java',
        'kotlin',
        'markdown',
        'json',
        'bash',
        'sql',
        'yaml',
      ],
    });
  }
  return highlighterPromise;
};

/**
 * Highlights code to HTML using Shiki.
 * Supports dual themes (light and dark) using CSS variables.
 */
export async function highlightCode(code: string, lang: string) {
  const highlighter = await getHighlighter();
  
  // Ensure the language is loaded
  if (!highlighter.getLoadedLanguages().includes(lang)) {
    try {
      await highlighter.loadLanguage(lang as any);
    } catch (e) {
      console.warn(`Failed to load Shiki language: ${lang}. Falling back to plain text.`, e);
      lang = 'text';
    }
  }

  return highlighter.codeToHtml(code, {
    lang,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    defaultColor: false, // Use CSS variables
  });
}
