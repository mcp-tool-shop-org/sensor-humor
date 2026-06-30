# syntax=docker/dockerfile:1

# --- Build stage: compile TypeScript -> dist/ ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage: production deps + compiled output ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

LABEL org.opencontainers.image.source="https://github.com/mcp-tool-shop-org/sensor-humor"
LABEL org.opencontainers.image.description="MCP comedy sidekick — gives LLMs a sense of humor via Ollama-powered comedic personality"
LABEL org.opencontainers.image.licenses="MIT"

# sensor-humor speaks MCP over stdio, so run it interactively:
#   docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
#     ghcr.io/mcp-tool-shop-org/sensor-humor:latest
ENTRYPOINT ["node", "dist/index.js"]
