/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const baseSecurityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
]

const nextConfig = {
  allowedDevOrigins: ['lather-crisping-laborious.ngrok-free.dev'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    const headers = [...baseSecurityHeaders]
    if (isProd) {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      })
    }
    return [{ source: '/:path*', headers }]
  },
}

export default nextConfig
