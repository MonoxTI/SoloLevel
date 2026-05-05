/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    PYTHON_API_URL: process.env.PYTHON_API_URL,
  },
};

module.exports = nextConfig;