# syntax=docker/dockerfile:1
FROM node:22.23-slim

ENV NODE_ENV=production \
    EMBARK_KEYSHARE_DIR=/data/keyshares \
    EMBARK_CHAIN_ID=1279885899

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY scripts ./scripts
RUN sed -i 's/\r$//' scripts/entrypoint.sh && chmod +x scripts/entrypoint.sh \
 && mkdir -p /data/keyshares && chown -R node:node /data

# A named volume mounted at /data starts with this directory's owner, so the
# non-root user can write the keyshare there.
VOLUME ["/data"]
USER node

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["mcp"]
