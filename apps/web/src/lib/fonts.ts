import { JetBrains_Mono } from 'next/font/google';

export const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
});
