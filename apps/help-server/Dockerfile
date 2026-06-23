FROM node:24-alpine

RUN corepack enable

WORKDIR /app

# Copy workspace manifests so pnpm can install all workspace dependencies
COPY package.json pnpm.lock.yaml pnpm-workspace.yaml ./
COPY packages/claude-fs/package.json ./packages/claude-fs/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/tailwind-config/package.json ./packages/tailwind-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/
COPY apps/help-server/package.json ./apps/help-server/

RUN pnpm install --frozen-lockfile

# Copy package source files
COPY packages/ ./packages/
COPY apps/help-server/ ./apps/help-server/

EXPOSE 3008

CMD ["pnpm", "--filter", "helper-server", "dev"]
