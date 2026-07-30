# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_NAKAMA_HOST
ARG VITE_NAKAMA_PORT
ARG VITE_NAKAMA_KEY
ARG VITE_NAKAMA_SSL
ARG VITE_USE_PROXY

ENV VITE_NAKAMA_HOST=$VITE_NAKAMA_HOST
ENV VITE_NAKAMA_PORT=$VITE_NAKAMA_PORT
ENV VITE_NAKAMA_KEY=$VITE_NAKAMA_KEY
ENV VITE_NAKAMA_SSL=$VITE_NAKAMA_SSL
ENV VITE_USE_PROXY=$VITE_USE_PROXY

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:80/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
