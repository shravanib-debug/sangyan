# syntax=docker/dockerfile:1.7
# Build from the repository root:
#   docker build -f apps/broker-worker/Dockerfile -t thehrav-broker-worker .
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
COPY apps/broker-worker/package.json apps/broker-worker/package.json
RUN npm install --workspace @thehrav/broker-worker --include-workspace-root=false
COPY apps/broker-worker apps/broker-worker
RUN npm run build --workspace @thehrav/broker-worker

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV BROKER_WORKER_MODE=replay
COPY package.json package-lock.json* ./
COPY apps/broker-worker/package.json apps/broker-worker/package.json
# Runtime dependencies only (the Supabase client); no compiler or dev tooling in the image.
RUN npm install --omit=dev --workspace @thehrav/broker-worker --include-workspace-root=false \
  && chown -R node:node /app
COPY --from=builder --chown=node:node /app/apps/broker-worker/dist ./apps/broker-worker/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health || exit 1
CMD ["node", "apps/broker-worker/dist/index.js"]
