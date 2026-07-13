# Simple Dockerfile - assumes local build has been run first
# Run 'pnpm build:web && pnpm --filter @vibetree/server build' locally before building this

FROM node:18-alpine AS runtime

# Install build dependencies for native modules (needed for node-pty)
RUN apk add --no-cache python3 python3-dev py3-setuptools make g++

# Install pnpm and serve (for serving static files)
RUN npm install -g pnpm@8.14.0 serve

# Create app user for security
RUN addgroup -g 1001 -S nodejs && adduser -S vibetree -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Create directories and copy package.json files
RUN mkdir -p packages/core packages/ui packages/auth packages/server-core apps/server apps/web
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/
COPY packages/auth/package.json ./packages/auth/
COPY packages/server-core/package.json ./packages/server-core/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

# Install only production dependencies
ENV PYTHON=/usr/bin/python3
RUN pnpm install --prod --no-frozen-lockfile

# Copy built application (assumes local build was successful)
COPY packages/core/dist ./packages/core/dist
COPY packages/ui/dist ./packages/ui/dist
COPY packages/auth/dist ./packages/auth/dist
COPY packages/server-core/dist ./packages/server-core/dist
COPY apps/server/dist ./apps/server/dist
COPY apps/web/dist ./apps/web/dist

# Copy package.json files for workspace resolution
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/
COPY packages/auth/package.json ./packages/auth/

# Change ownership to app user
RUN chown -R vibetree:nodejs /app
USER vibetree

# Expose ports
EXPOSE 3000 3002

# Environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3002
ENV WEB_PORT=3000

# Create startup script
COPY --chown=vibetree:nodejs <<EOF /app/start.sh
#!/bin/sh

# Start the backend server in background
echo "Starting VibeTree server..."
cd /app/apps/server && node dist/index.js &
SERVER_PID=\$!

# Start the web frontend
echo "Starting VibeTree web frontend..."
cd /app/apps/web && serve -s dist -l \${WEB_PORT} -n &
WEB_PID=\$!

# Function to handle shutdown
shutdown() {
    echo "Shutting down VibeTree services..."
    kill \$SERVER_PID \$WEB_PID 2>/dev/null
    wait \$SERVER_PID \$WEB_PID 2>/dev/null
    exit 0
}

# Trap signals for graceful shutdown
trap shutdown SIGTERM SIGINT

echo "VibeTree is running!"
echo "Web UI: http://localhost:\${WEB_PORT}"
echo "API Server: http://localhost:\${PORT}"

# Wait for processes
wait \$SERVER_PID \$WEB_PID
EOF

RUN chmod +x /app/start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

# Start the application
CMD ["/app/start.sh"]