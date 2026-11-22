ARG MODEL_REVISION=0f99955d944c39bfd9d035a02ac273c7a44a406b

FROM registry.access.redhat.com/hi/nodejs:26-builder AS build
ARG MODEL_REVISION

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

# Tải weights theo SHA pin bằng HF JS client (không cần script tự viết).
RUN pnpm exec hfjs download ff13/fashion-clip \
      config.json preprocessor_config.json onnx/vision_model.onnx \
      --revision "$MODEL_REVISION" --local-dir /models/hub/ff13/fashion-clip

# Chỉ đóng gói gói native (sharp + onnxruntime-node), phần JS đã nằm trong dist/.
RUN pnpm --filter native-runtime deploy --prod /native \
 && BIN=$(find /native/node_modules/.pnpm -path '*/onnxruntime-node/bin/napi-v6' -type d -print -quit) \
 && test -n "$BIN" \
 && for d in "$BIN"/*; do [ "$(basename "$d")" = linux ] || rm -rf "$d"; done \
 && for d in "$BIN"/linux/*; do [ "$(basename "$d")" = x64 ] || rm -rf "$d"; done

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

COPY --from=build /models /models

USER 65532
EXPOSE 9091

CMD ["node", "dist/main.mjs"]
