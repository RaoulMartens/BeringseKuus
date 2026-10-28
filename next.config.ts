import type { NextConfig } from 'next';

import { vasteHeaders } from './src/lib/beveiligingsheaders';

// De CSP zet src/middleware.ts, met een nonce per aanvraag; hier de overige beveiligingsheaders.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: vasteHeaders() }];
  },
};

export default nextConfig;
