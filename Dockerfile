# Candidate runtime and separate non-root ops target. Bases and JS dependencies are locked.
# Build --target ops for maintenance; default target runs the API.
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl ffmpeg python3 make g++ && rm -rf /var/lib/apt/lists/*
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
RUN pnpm contract:check && pnpm typecheck && pnpm build:sequential

FROM postgres:16-bookworm@sha256:efedf3595f1d6f415c08568ba171029bf54052e754cc9f030e3f2412b21f3d67 AS ops
WORKDIR /app
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=build --chown=1000:1000 /app/package.json ./package.json
COPY --from=build --chown=1000:1000 /app/dist ./dist
COPY --from=build --chown=1000:1000 /app/apps ./apps
COPY --from=build --chown=1000:1000 /app/packages ./packages
COPY --from=build --chown=1000:1000 /app/scripts ./scripts
COPY --from=build --chown=1000:1000 /app/prisma ./prisma
USER 1000:1000
ENTRYPOINT ["node", "scripts/ops.mjs"]
CMD ["help"]

FROM build AS production-deps
RUN pnpm prune --prod
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4318
# For a container, explicitly set HOST=0.0.0.0 and place it behind an authenticated/TLS boundary.
CMD ["node", "dist/apps/api/src/main.js"]
