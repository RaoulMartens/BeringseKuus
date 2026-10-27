import type { NextConfig } from 'next';

import { beveiligingsheaders } from './src/lib/beveiligingsheaders';

const omgeving = process.env.NODE_ENV === 'development' ? 'development' : 'production';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: beveiligingsheaders(omgeving) }];
  },
};

export default nextConfig;
