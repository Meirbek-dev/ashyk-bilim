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
  // `just stack up <slot>` for slot > 0: one `next dev` per output folder (gitignored `.next-*`), and its own
  // gitignored tsconfig copy, which next rewrites with that folder's type includes (tsconfig.json stays untouched).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typescript: { tsconfigPath: process.env.NEXT_TSCONFIG_PATH || 'tsconfig.json' },
  devIndicators: false,
  // Server action arguments include credentials.
  logging: { serverFunctions: false },
  // Unified Caching & PPR
  cacheComponents: true,

  // Local dev only: in production nginx serves /content/{key} from the public
  // bucket (infra/nginx/routes.conf). Without a proxy the browser has
  // nothing at /content/, so every avatar and block asset 404s.
  async rewrites() {
    const bucket = process.env.CONTENT_REWRITE_TARGET
    return bucket ? [{ source: '/content/:path*', destination: `${bucket.replace(/\/$/, '')}/:path*` }] : []
  },

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
  transpilePackages: ['@base-ui/react'],

  partialPrefetching: true,

  allowedDevOrigins: ['cs-mooc.tou.edu.kz', '192.168.12.35', '192.168.1.46'],
  experimental: {
    turbopackRustReactCompiler: true,
    turbopackFileSystemCacheForDev: false,
    serverActions: {
      allowedOrigins: ['cs-mooc.tou.edu.kz', 'localhost:3000'],
    },
    // Turbopack / Package Optimization (lucide-react and recharts are optimized by default).
    optimizePackageImports: [
      '@icons-pack/react-simple-icons',
      // Animation
      'motion/react',
      // Heavy utility libs
      '@daypicker/react',
      // TipTap editor (heavy)
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/pm',
      '@tiptap/starter-kit',
      '@tiptap/extensions',
      '@tiptap/extension-link',
      '@tiptap/extension-image',
      '@tiptap/extension-table',
      '@tiptap/extension-heading',
      '@tiptap/extension-youtube',
      'tiptap-markdown',
    ],
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
