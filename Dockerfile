# Candidate build only. Requires a genuine pnpm-lock.yaml generated and reviewed online first.
# The Node major tag is for development; production digest/security review remains a release gate.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
RUN DATABASE_URL=postgresql://unused:unused@127.0.0.1:5432/build_only pnpm exec prisma generate
COPY tsconfig.server.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
COPY artifacts/openapi.json ./artifacts/openapi.json
RUN pnpm contract:check && pnpm typecheck && pnpm build
RUN pnpm prune --prod
FROM node:22-bookworm-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4318
# For a container, explicitly set HOST=0.0.0.0 and place it behind an authenticated/TLS boundary.
CMD ["node", "dist/apps/api/src/main.js"]
