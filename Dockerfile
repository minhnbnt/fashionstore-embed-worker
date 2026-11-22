FROM registry.access.redhat.com/hi/nodejs:26-builder AS build

USER 0
WORKDIR /app

# Node 26 không còn Corepack; ảnh Red Hat chỉ ship npm. Cài pnpm từ / để tránh
# devEngines.packageManager (npm bị EBADDEVENGINES nếu chạy trong /app).
RUN cd / && npm install -g pnpm@12.21.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY native-runtime/package.json ./native-runtime/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Chỉ đóng gói gói native (sharp + onnxruntime-node), phần JS đã nằm trong dist/.
RUN pnpm --filter native-runtime deploy --prod /native \
 && find /native/node_modules/.pnpm -path '*/onnxruntime-node/bin/napi-v6' -type d \
      -exec sh -c 'find "$1" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} +' _ {} \; \
 && find /native/node_modules/.pnpm -path '*/onnxruntime-node/bin/napi-v6/linux' -type d \
      -exec sh -c 'find "$1" -mindepth 1 -maxdepth 1 ! -name x64 -exec rm -rf {} +' _ {} \;

FROM registry.access.redhat.com/hi/nodejs:26

USER 0
WORKDIR /app

ENV NODE_ENV=production \
    HF_HOME=/models \
    LOCAL_FILES_ONLY=true \
    GRPC_BIND_HOST=0.0.0.0 \
    GRPC_PORT=9091

COPY --from=build /app/dist ./dist
COPY --from=build /native/node_modules ./node_modules
COPY --from=build /app/scripts/prefetch-model.mjs ./scripts/prefetch-model.mjs

# Weights pinned theo SHA, nạp sẵn vào image để chạy offline.
RUN node scripts/prefetch-model.mjs && chown -R 65532:0 /app /models

USER 65532
EXPOSE 9091

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "dist/grpc-health.mjs"]

CMD ["node", "dist/main.mjs"]
