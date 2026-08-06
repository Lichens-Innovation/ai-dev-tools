FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

WORKDIR /app

# Copy workspace manifests so yarn can install all workspace dependencies
COPY package.json yarn.lock ./
COPY packages/claude-fs/package.json ./packages/claude-fs/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/tailwind-config/package.json ./packages/tailwind-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/
COPY apps/help-server/package.json ./apps/help-server/

RUN yarn install --frozen-lockfile

# Copy package source files
COPY packages/ ./packages/
COPY apps/help-server/ ./apps/help-server/

EXPOSE 3008

CMD ["yarn", "workspace", "helper-server", "dev"]
