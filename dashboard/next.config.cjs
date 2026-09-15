/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    PYTHON_API_URL: process.env.PYTHON_API_URL,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};
module.exports = nextConfig;
