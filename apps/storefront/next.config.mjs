/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@shopistan/ui'],
  poweredByHeader: false,
  // The browser only ever talks to this app's own host; /api is proxied to the
  // Shopistan API so session cookies stay scoped to this host.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_URL || 'http://localhost:4000'}/:path*` }];
  },
};

export default nextConfig;
