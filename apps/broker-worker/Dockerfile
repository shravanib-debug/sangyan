# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/broker-worker/package.json apps/broker-worker/package.json
RUN pnpm install --frozen-lockfile
COPY apps/broker-worker apps/broker-worker
RUN pnpm --filter @thehrav/broker-worker build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV BROKER_WORKER_MODE=replay
COPY --from=builder --chown=node:node /app/apps/broker-worker/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health || exit 1
CMD ["node", "dist/index.js"]
