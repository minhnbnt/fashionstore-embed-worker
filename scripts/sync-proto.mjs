import { cpSync, mkdirSync } from "node:fs";

const source = "../embed-worker/proto/fashion_clip/v1/embedding.proto";
const destination = "src/grpc/proto/fashion_clip/v1/embedding.proto";

mkdirSync("src/grpc/proto/fashion_clip/v1", { recursive: true });
cpSync(source, destination);
console.info(`proto synced: ${source} -> ${destination}`);
