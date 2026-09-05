# Simple single-stage image - this app has no build step (no TS/bundler),
# so there's nothing a multi-stage build would buy us here.
FROM node:18-alpine

WORKDIR /app

# Copy manifests first so `npm ci` is cached unless dependencies change.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy the rest of the backend (frontend/ is excluded - see .dockerignore -
# it's a static site meant to be deployed separately, e.g. Netlify/Vercel).
COPY src ./src
COPY sql ./sql
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 4000

# Migrations are NOT run automatically on every container start (they're
# not written to be safely re-runnable - see scripts/run-migrations.js).
# Run them once per environment via `docker compose run --rm migrate`
# (see docker-compose.yml) or `npm run db:migrate` before/after deploying.
CMD ["node", "src/server.js"]
