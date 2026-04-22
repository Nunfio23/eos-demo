/** @type {import('next').NextConfig} */
const isMobile = process.env.MOBILE_BUILD === 'true'

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ['localhost', 'jbndrgxmjmyqebxfpova.supabase.co'],
    ...(isMobile && { unoptimized: true }),
  },
  ...(isMobile && {
    output: 'export',
    trailingSlash: true,
    env: {
      NEXT_PUBLIC_API_BASE: 'https://teslaschool.app',
    },
  }),
}

module.exports = nextConfig
