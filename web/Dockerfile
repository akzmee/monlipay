# =============================================================================
# Dockerfile — MonliPay frontend (Next.js 16 standalone)
# =============================================================================
#
# Multi-stage build produces a minimal image (~180MB) that runs the Next.js
# standalone server without a process manager. No dev dependencies, no
# .next/cache, no source maps.
#
# Usage (from repo root):
#   docker build -t monlipay-web ./web
#   docker run -p 3000:3000 \
#     -e NEXT_PUBLIC_NETWORK=testnet \
#     -e NEXT_PUBLIC_LINK_VAULT_ADDRESS=0x... \
#     -e NEXT_PUBLIC_WC_PROJECT_ID=... \
#     monlipay-web
#
# IMPORTANT: env vars are passed at runtime, NOT baked into the image.
# `NEXT_PUBLIC_*` vars are inlined at build time by Next.js — so to switch
# between testnet/mainnet without rebuilding, see docker-compose.yml which
# builds ONE image per branch (each branch is built with its own env baked in).

# ---------- Stage 1: deps ----------
FROM node:22-alpine AS deps
WORKDIR /app

# Native deps (bufferutil/utf-8-validate need node-gyp → python3 + make + g++)
RUN apk add --no-cache python3 make g++

# Install only what's needed to resolve the lockfile.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ---------- Stage 2: builder ----------
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build (noisy + leaks build metadata).
ENV NEXT_TELEMETRY_DISABLED=1

# Build arguments — these become baked-in NEXT_PUBLIC_* values.
# This is how we produce two images (testnet vs mainnet) from the same
# Dockerfile: build twice with different build-args.
ARG NEXT_PUBLIC_NETWORK=testnet
ARG NEXT_PUBLIC_LINK_VAULT_ADDRESS=0x0000000000000000000000000000000000000000
ARG NEXT_PUBLIC_WC_PROJECT_ID=00000000000000000000000000000000
ARG NEXT_PUBLIC_GAS_SPONSOR_ENABLED=false
ARG NEXT_PUBLIC_GAS_FORWARDER_ADDRESS=0x0000000000000000000000000000000000000000

ENV NEXT_PUBLIC_NETWORK=$NEXT_PUBLIC_NETWORK
ENV NEXT_PUBLIC_LINK_VAULT_ADDRESS=$NEXT_PUBLIC_LINK_VAULT_ADDRESS
ENV NEXT_PUBLIC_WC_PROJECT_ID=$NEXT_PUBLIC_WC_PROJECT_ID
ENV NEXT_PUBLIC_GAS_SPONSOR_ENABLED=$NEXT_PUBLIC_GAS_SPONSOR_ENABLED
ENV NEXT_PUBLIC_GAS_FORWARDER_ADDRESS=$NEXT_PUBLIC_GAS_FORWARDER_ADDRESS

RUN npm run build

# ---------- Stage 3: runner (final image) ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as non-root for defense-in-depth. Next.js standalone doesn't need
# to write anywhere except /tmp (for sharp's image cache), so a read-only
# filesystem would also work if you want to harden further.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy the standalone server + static assets. The standalone output bundles
# only the node_modules actually used at runtime, so this is small.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# Next.js standalone entrypoint — runs `node server.js`.
# Healthcheck hits the homepage; if it doesn't return 200 within 10s the
# container is marked unhealthy and docker-compose will restart it.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
