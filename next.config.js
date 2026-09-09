/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // Image optimization
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
    minimumCacheTTL: 3600,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  
  experimental: {
    optimizePackageImports: [
      'geist',
      'lucide-react',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
    ],
    serverActions: {
      bodySizeLimit: '50mb',
    },
    serverComponentsExternalPackages: [
      'better-sqlite3',
      'mysql2',
      '@aws-sdk/client-s3',
      'undici',
      'bcryptjs',
    ],
  },
  
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // Production response hardening.
  poweredByHeader: false,

  async redirects() {
    return [
      { source: '/agents', destination: '/create', permanent: true },
      { source: '/agents/:path*', destination: '/create', permanent: true },
    ];
  },
  
  // Response headers for API freshness, static asset caching, and security.
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Vary', value: 'Accept-Encoding' },
        ],
      },
      {
        source: '/api/:path((?!media/|character-cards/|announcement$|image-models$|video-models$|chat/models$|prompts$|channels$|disabled-models$|user/daily-usage$|user/character-cards$|status/pending$|user/invite-code$).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
