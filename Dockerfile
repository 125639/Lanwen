# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN rm -f .npmrc && npm ci

FROM deps AS build
COPY . .
RUN rm -f .npmrc && npm run build

FROM base AS runtime
RUN addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8770

COPY --chown=app:app package.json package-lock.json ./
RUN rm -f .npmrc && npm ci --omit=dev

COPY --chown=app:app --from=build /app/dist ./dist
COPY --chown=app:app --from=build /app/server ./server

USER app

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8770/api/health || exit 1

EXPOSE 8770
CMD ["node", "server/index.js"]
