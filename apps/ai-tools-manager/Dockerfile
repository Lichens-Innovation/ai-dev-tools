FROM node:22-alpine AS pruner
RUN corepack enable
WORKDIR /app
COPY . .
RUN npx turbo prune ai-tools-manager --docker

FROM node:22-alpine AS installer
RUN corepack enable
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/yarn.lock ./yarn.lock
RUN yarn install --immutable

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
RUN yarn turbo run build --filter=ai-tools-manager --no-daemon

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=builder /app/apps/ai-tools-manager/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
