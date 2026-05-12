import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  devIndicators: false,
  // Unified Caching & PPR
  cacheComponents: true,

  // Compiler & Language Features
  reactCompiler: true,
  typedRoutes: true, // Essential for large-scale LMS routing safety

  // Image & Media Optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 100],
    // Optimized for avatars and course thumbnails
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
  },

  // Build & Environment
  output: 'standalone',
  reactStrictMode: true,

  allowedDevOrigins: ['https://cs-mooc.tou.edu.kz', 'http://192.168.12.35', 'http://192.168.1.46'],
  experimental: {
    serverActions: {
      allowedOrigins: ['cs-mooc.tou.edu.kz', 'localhost:3000'],
    },
    // Turbopack / Package Optimization
    optimizePackageImports: [
      '@base-ui/react',
      '@icons-pack/react-simple-icons',
      'lucide-react',
      // Animation
      'motion/react',
      // Heavy utility libs
      'recharts',
      '@daypicker/react',
      'date-fns',
      // Monaco editor (locally bundled, code-split via next/dynamic)
      '@monaco-editor/react',
      'monaco-editor',
      // TipTap editor (heavy)
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/pm',
      '@tiptap/starter-kit',
      '@tiptap/extension-link',
      '@tiptap/extension-image',
      '@tiptap/extension-table',
      '@tiptap/extension-table-cell',
      '@tiptap/extension-table-header',
      '@tiptap/extension-table-row',
      '@tiptap/extension-heading',
      '@tiptap/extension-character-count',
      '@tiptap/extension-focus',
      '@tiptap/extensions',
      '@tiptap/extension-youtube',
      'tiptap-extension-code-block-shiki',
      'tiptap-markdown',
    ],
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
