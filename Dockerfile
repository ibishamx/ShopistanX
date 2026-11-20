# One image for the API and all four web apps; docker-compose picks the
# command for each service. Build-time values (DOMAIN) are baked into the
# Next.js builds, so build the image on or for the server it runs on.
# The full image (not -slim) already has the OpenSSL libraries Prisma needs.
FROM node:22-bookworm AS base
# pnpm installed where the unprivileged runtime user can use it.
ENV COREPACK_HOME=/opt/corepack COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN --mount=type=secret,id=ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/ca corepack enable && \
    NODE_EXTRA_CA_CERTS=/run/secrets/ca corepack prepare pnpm@10.28.0 --activate && chmod -R a+rX /opt/corepack
WORKDIR /app

FROM base AS build
# Next.js reads these at build time: the API address the apps proxy /api to,
# and the merchant URL the marketing site links to.
ARG API_URL=http://api:4000
ARG NEXT_PUBLIC_MERCHANT_URL
ENV API_URL=$API_URL NEXT_PUBLIC_MERCHANT_URL=$NEXT_PUBLIC_MERCHANT_URL NEXT_TELEMETRY_DISABLED=1
COPY . .
# The optional "ca" secret only matters when building behind a TLS-inspecting proxy.
RUN --mount=type=secret,id=ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/ca pnpm install --frozen-lockfile
RUN pnpm --filter @shopistan/api exec prisma generate
RUN pnpm -r build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
USER node
