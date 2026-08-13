FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

# ─── Dependencies ───
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/nextjs/package.json ./apps/nextjs/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/validators/package.json ./packages/validators/package.json
RUN pnpm install --frozen-lockfile

# ─── Build ───
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./
COPY --from=deps /app/pnpm-workspace.yaml ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ─── Production ───
FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/apps/nextjs/public ./apps/nextjs/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/nextjs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/nextjs/.next/static ./apps/nextjs/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production

CMD ["node", "apps/nextjs/server.js"]
