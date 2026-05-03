/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['lather-crisping-laborious.ngrok-free.dev'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
