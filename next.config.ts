import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Emits a minimal server bundle for the Docker runtime image.
  output: 'standalone',
  poweredByHeader: false,
};

export default config;
