FROM node:24-alpine

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

WORKDIR /app

# Copy workspace manifests so yarn can install all workspace dependencies
COPY package.json yarn.lock ./
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY apps/help-server/package.json ./apps/help-server/

RUN yarn install --frozen-lockfile

# Copy package source files
COPY packages/ ./packages/
COPY apps/help-server/ ./apps/help-server/

EXPOSE 3008

CMD ["yarn", "workspace", "helper-server", "dev"]
