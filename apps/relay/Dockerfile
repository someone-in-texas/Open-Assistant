FROM node:22.22.0-alpine@sha256:74b7c5f0e921e7c2e7042d722bd26044eea3fe63b4d2937f9c0d4187042471dd AS build
WORKDIR /src
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm build:relay

FROM node:22.22.0-alpine@sha256:74b7c5f0e921e7c2e7042d722bd26044eea3fe63b4d2937f9c0d4187042471dd
ENV NODE_ENV=production
USER node
WORKDIR /app
COPY --from=build --chown=node:node /src/apps/relay/dist ./dist
COPY --from=build --chown=node:node /src/node_modules ./node_modules
CMD ["node", "dist/index.js"]
