# Fashion Embed Worker (Node.js PoC)

Port bản Python `../embed-worker` sang Node.js. Tiêu thụ pgmq `embed_jobs`, tải ảnh từ S3,
tính Fashion-CLIP 512-dim bằng ONNX, ghi `product_embedding`, đồng thời serve gRPC
`EmbedImage` + health cho backend Java trên `127.0.0.1:9091`.

## Chạy local

```bash
pnpm install
pnpm dev
pnpm check && pnpm test
pnpm build && pnpm start
```

Env mặc định trong `.env.example`. Cần Postgres đã migrate tới `V46` và S3 endpoint.

## Stub gRPC

Proto canonical vẫn ở `../embed-worker/proto/...`. Sinh TS stub đã commit trong `src/grpc/gen/`:

```bash
pnpm proto:sync   # copy proto canonical vào src/grpc/proto
pnpm proto:gen    # pnpm exec buf generate
```

Stub dùng `protoc-gen-es` (`erasable_syntax=true`) + `protoc-gen-grpc-es`, chạy trên
`@grpc/grpc-js` nên Java backend không đổi. `pnpm proto:sync` rồi `pnpm proto:gen` mỗi khi
đổi contract.

## Parity

```bash
RUN_PARITY=1 pnpm test src/infrastructure/model.parity.test.ts
```

Hai gate: model (cùng `pixel_values`) cosine ≥ 0.99999; end-to-end cosine ≥ 0.9975
(decoder JPEG pure-JS khác libjpeg của Pillow — xem design doc §9).

## Container

```bash
podman build -t embed-worker-node .
podman run --rm -p 9091:9091 \
  -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/fashionstore \
  -e S3_ENDPOINT_URL=http://s3:9000 \
  embed-worker-node
```

Image dùng `registry.access.redhat.com/hi/nodejs:26-builder` để build và
`.../hi/nodejs:26` để chạy. Chỉ đóng gói gói native (`sharp`, `onnxruntime-node` CPU
linux/x64, ~67 MB); phần JS nằm trong `dist/`. Weights ONNX được tải lúc build theo SHA
pin, chạy hoàn toàn offline với `LOCAL_FILES_ONLY=true`.

Khi chạy trong compose, đặt `GRPC_BIND_HOST=0.0.0.0` và cho backend Java dùng
`EMBED_GRPC_ADDRESS=embed-worker:9091`. HEALTHCHECK gọi `dist/grpc-health.mjs` qua service
`grpc.health.v1/Health.Check`.
