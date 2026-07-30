# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Build-time environment variables for Vite
ARG VITE_NAKAMA_HOST
ARG VITE_NAKAMA_PORT
ARG VITE_NAKAMA_KEY
ARG VITE_NAKAMA_SSL
ARG VITE_USE_PROXY
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_DEV
ARG VITE_APP_VERSION
ARG VITE_TELEGRAM_BOT_ID
ARG VITE_TELEGRAM_BOT_USERNAME
ARG VITE_BASE_PATH

ENV VITE_NAKAMA_HOST=$VITE_NAKAMA_HOST
ENV VITE_NAKAMA_PORT=$VITE_NAKAMA_PORT
ENV VITE_NAKAMA_KEY=$VITE_NAKAMA_KEY
ENV VITE_NAKAMA_SSL=$VITE_NAKAMA_SSL
ENV VITE_USE_PROXY=$VITE_USE_PROXY
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_DEV=$VITE_SENTRY_DEV
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_TELEGRAM_BOT_ID=$VITE_TELEGRAM_BOT_ID
ENV VITE_TELEGRAM_BOT_USERNAME=$VITE_TELEGRAM_BOT_USERNAME
ENV VITE_BASE_PATH=$VITE_BASE_PATH

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
