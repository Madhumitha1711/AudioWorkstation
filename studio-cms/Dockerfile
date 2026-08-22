# studio-cms — Strapi 5 admin/content API
# Multi-stage build: compile TS + admin panel with full devDependencies,
# run with prod-only deps. Verified: sharp ships prebuilt musl binaries,
# so no extra apk build toolchain is needed on alpine for this project.

FROM node:20-alpine AS build
WORKDIR /app

# Strapi's build step only needs *some* value for these (it doesn't need to
# be the real secret) since it's just bundling the admin panel — the real
# values are injected as container env vars at runtime, never baked in here.
ENV APP_KEYS=build-time-placeholder-key-a,build-time-placeholder-key-b \
    API_TOKEN_SALT=build-time-placeholder \
    ADMIN_JWT_SECRET=build-time-placeholder \
    TRANSFER_TOKEN_SALT=build-time-placeholder \
    ENCRYPTION_KEY=build-time-placeholder \
    NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/favicon.png ./favicon.png
# Required: `strapi start` checks for tsconfig.json in the cwd to decide
# where the compiled config/dist actually lives. Without it, it defaults
# distDir to the image root and can't find dist/config/database.js,
# so db.config.connection comes back undefined at startup.
COPY --from=build /app/tsconfig.json ./tsconfig.json

RUN addgroup -S strapi && adduser -S strapi -G strapi && chown -R strapi:strapi /app
USER strapi

EXPOSE 1337
CMD ["npm", "run", "start"]
