import { Inter, JetBrains_Mono } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
  // Enable preload for Inter (critical font used above-the-fold).
  preload: true,
  weight: 'variable',
  style: ['normal', 'italic'],
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
});
