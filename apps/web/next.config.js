/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  transpilePackages: ['@logitrack/utils'],
  webpack: (config) => {
    config.resolve.alias['@logitrack/utils'] = path.resolve(__dirname, '../../packages/utils/src/index.ts');
    return config;
  },
}

module.exports = nextConfig
