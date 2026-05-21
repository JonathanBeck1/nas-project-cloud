FROM node:22-alpine AS deps

WORKDIR /app

# better-sqlite3 may need native compilation on Alpine.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Native binaries the v0.3 preview pipeline depends on:
#   ffmpeg        — video poster frames (PR 2)
#   poppler-utils — pdftoppm for first-page PDF previews (PR 3)
# Each is probed once at first use; a missing binary degrades cleanly
# to status: "unsupported" without crashing the worker.
RUN apk add --no-cache ffmpeg poppler-utils \
  && addgroup -S -g 1001 nodejs \
  && adduser -S -u 1001 nextjs -G nodejs \
  && mkdir -p /data /mnt/nas-cloud \
  && chown -R nextjs:nodejs /data /mnt/nas-cloud

COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start"]
