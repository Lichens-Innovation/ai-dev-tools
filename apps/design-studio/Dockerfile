FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd

RUN corepack enable

WORKDIR /app

# Copy workspace manifests so pnpm can install all workspace dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/claude-fs/package.json ./packages/claude-fs/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/styles/package.json ./packages/styles/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/
COPY apps/help-server/package.json ./apps/help-server/
COPY apps/design-studio/package.json ./apps/design-studio/

# Only the studio's own dependencies. The app runs as the host user (compose `user:`), so it must be able to write
# in /app (Vite's cache) and so must pnpm's store, hence the open permissions.
RUN pnpm install --frozen-lockfile --filter design-studio... && chmod -R a+rwX /app

COPY packages/ ./packages/
COPY apps/design-studio/ ./apps/design-studio/

# The target project is mounted here, read-write.
VOLUME /project
ENV PROJECT_ROOT=/project HOME=/tmp

WORKDIR /app/apps/design-studio

CMD ["./node_modules/.bin/vite", "dev"]
