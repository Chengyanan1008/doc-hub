# syntax=docker/dockerfile:1.6

############################
# Stage 1: build frontend
############################
FROM node:20-alpine AS web-builder

WORKDIR /web

# 利用 layer cache：先拷依赖文件
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 拷贝源码并构建
COPY apps/web/ ./

# 部署路径前缀（被反代到子路径时使用，例如 /doc/）。默认 '/'，向后兼容。
ARG VITE_BASE=/
ENV VITE_BASE=${VITE_BASE}
RUN npm run build

############################
# Stage 2: build backend
############################
FROM golang:1.22-alpine AS api-builder

WORKDIR /src/api

# 启用 module 缓存
ENV CGO_ENABLED=0 GOOS=linux GOFLAGS=-mod=mod

COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api/ ./
RUN go build -trimpath -ldflags "-s -w" -o /out/doc-hub ./cmd/server

############################
# Stage 3: runtime
############################
FROM alpine:3.20 AS runtime

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S app && adduser -S -G app app

WORKDIR /app

# 后端二进制
COPY --from=api-builder /out/doc-hub /app/doc-hub

# 前端构建产物
COPY --from=web-builder /web/dist /app/web

# 数据目录（文档存储）
RUN mkdir -p /data/docs && chown -R app:app /app /data

USER app

ENV DOC_HUB_ADDR=:8787 \
    DOC_HUB_STORAGE=/data/docs \
    DOC_HUB_WEB_ROOT=/app/web \
    DOC_HUB_ORIGIN=*

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1

ENTRYPOINT ["/app/doc-hub"]
