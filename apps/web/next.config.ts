import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // async rewrites() {
  //   return [
  //     {
  //       source: '/umami/script.js',
  //       destination: 'https://eu.umami.is/script.js',
  //     },
  //     {
  //       source: '/umami/api/send',
  //       destination: 'https://eu.umami.is/api/send',
  //     },
  //   ];
  // },
  experimental: {
    optimizePackageImports: [
      '@base-ui/react',
      '@icons-pack/react-simple-icons',
      'lucide-react',
      // Heavy utility libs
      'recharts',
      'react-day-picker',
      'date-fns',
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
      '@tiptap/extensions',
      '@tiptap/extension-youtube',
      '@tiptap/extension-code-block-lowlight',
    ],
  },
  reactCompiler: true,
  reactStrictMode: true,
  cacheComponents: true,
  devIndicators: false,
  typedRoutes: true,
  output: 'standalone',
  allowedDevOrigins: ['https://cs-mooc.tou.edu.kz', 'http://192.168.12.35', 'http://192.168.1.46'],
  images: {
    // Allow using quality 100 for important SVG/brand images while keeping
    // the default smaller quality as fallback.
    qualities: [100, 75],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
