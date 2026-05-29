import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

type RemotePattern = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>[number]

const createRemotePattern = (value: string | undefined, pathname: string): RemotePattern | null => {
  const normalizedValue = value?.trim()
  if (!normalizedValue) return null

  try {
    const url = new URL(normalizedValue)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    return {
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      port: url.port,
      pathname,
    }
  } catch {
    return null
  }
}

const imageRemotePatterns = [
  createRemotePattern(process.env.NEXT_PUBLIC_MEDIA_URL ?? process.env.NEXT_PUBLIC_SITE_URL, '/content/platform/**'),
  createRemotePattern(process.env.NEXT_PUBLIC_SITE_URL, '/app_logo_full.svg'),
].filter((pattern): pattern is RemotePattern => pattern !== null)

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
    remotePatterns: imageRemotePatterns,
    dangerouslyAllowLocalIP: process.env.NODE_ENV === 'development',
  },

  // Build & Environment
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@base-ui/react'],

  allowedDevOrigins: ['https://cs-mooc.tou.edu.kz', 'http://192.168.12.35', 'http://192.168.1.46'],
  experimental: {
    serverActions: {
      allowedOrigins: ['cs-mooc.tou.edu.kz', 'localhost:3000'],
    },
    // Turbopack / Package Optimization
    optimizePackageImports: [
      '@icons-pack/react-simple-icons',
      'lucide-react',
      // Animation
      'motion/react',
      // Heavy utility libs
      'recharts',
      '@daypicker/react',
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
      '@tiptap/extension-character-count',
      '@tiptap/extension-focus',
      '@tiptap/extension-youtube',
      'tiptap-extension-code-block-shiki',
      'tiptap-markdown',
    ],
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
