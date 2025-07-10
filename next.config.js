/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  env: {
    BACKEND_API_URL: process.env.BACKEND_API_URL || 'http://localhost:3001/api',
  },
}

module.exports = nextConfig
