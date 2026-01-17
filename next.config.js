/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // 图片优化
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    // 图片缓存时间（秒）
    minimumCacheTTL: 3600,
    // 设备尺寸
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    // 图片尺寸
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  
  // 压缩
  compress: true,
  
  // 生产环境优化
  poweredByHeader: false,
  
  // 响应头
  async headers() {
    return [
      {
        source: '/api/:path*',
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
