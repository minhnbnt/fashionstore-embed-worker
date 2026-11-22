import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { loadSettings } from "../config";
import type { SearchEmbedder } from "../service/search-embedding";
import { InvalidImageError, MODEL_NAME } from "../types";
import { createEmbeddingService } from "./embedding-service";
import { createGrpcServer, type GrpcServer } from "./server";

const PROTO_DIR = "src/grpc/proto";
const loaderOptions: protoLoader.Options = {
  includeDirs: [PROTO_DIR],
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

let server: GrpcServer | null = null;

afterEach(async () => {
  if (server !== null) {
    await server.stop(0.1);
    server = null;
  }
});

function clientFor(port: number, protoFile: string, service: string) {
  const definition = grpc.loadPackageDefinition(
    protoLoader.loadSync(protoFile, loaderOptions),
  ) as Record<string, unknown>;
  let current: Record<string, unknown> = definition;
  for (const part of service.split(".")) {
    current = current[part] as Record<string, unknown>;
  }
  const Client = current as unknown as new (...args: unknown[]) => unknown;
  return new Client(`127.0.0.1:${port}`, grpc.credentials.createInsecure()) as {
    EmbedImage: (
      request: { image: Buffer },
      callback: (
        error: grpc.ServiceError | null,
        value: { vector: number[]; model: string },
      ) => void,
    ) => void;
    Check: (
      request: Record<string, never>,
      callback: (error: grpc.ServiceError | null, value: { status: number }) => void,
    ) => void;
  };
}

const embedder = {
  embed: vi.fn().mockResolvedValue(Array.from({ length: 512 }, () => 0.25)),
} as unknown as SearchEmbedder;

describe("createGrpcServer", () => {
  it("EmbedImage trả 512 chiều, health trả SERVING", async () => {
    const settings = loadSettings({ GRPC_PORT: "0" });
    server = await createGrpcServer(
      settings,
      createEmbeddingService(embedder, settings.grpcMaxConcurrency),
    );
    const port = await server.start();

    const client = clientFor(
      port,
      "fashion_clip/v1/embedding.proto",
      "fashion_clip.v1.EmbeddingService",
    );
    const reply = await new Promise<{ vector: number[]; model: string }>((resolve, reject) => {
      client.EmbedImage({ image: Buffer.from([1, 2, 3]) }, (error, value) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });

    expect(reply.vector).toHaveLength(512);
    expect(reply.model).toBe(MODEL_NAME);

    const health = clientFor(port, "grpc/health/v1/health.proto", "grpc.health.v1.Health");
    const status = await new Promise<number>((resolve, reject) => {
      health.Check({}, (error, value) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(value.status);
      });
    });
    // loader dùng enums: "String" nên wire value 1 hiện thành "SERVING".
    expect(status).toBe("SERVING");
  });

  it("buffer rỗng → INVALID_ARGUMENT", async () => {
    const failing = {
      embed: vi.fn().mockRejectedValue(new InvalidImageError("boom")),
    } as unknown as SearchEmbedder;
    const settings = loadSettings({ GRPC_PORT: "0" });
    server = await createGrpcServer(settings, createEmbeddingService(failing, 4));
    const port = await server.start();
    const client = clientFor(
      port,
      "fashion_clip/v1/embedding.proto",
      "fashion_clip.v1.EmbeddingService",
    );

    const error = await new Promise<grpc.ServiceError | null>((resolve) => {
      client.EmbedImage({ image: Buffer.alloc(0) }, (rpcError) => resolve(rpcError));
    });

    expect(error?.code).toBe(grpc.status.INVALID_ARGUMENT);
  });

  it("stop(')...') đóng server", async () => {
    const settings = loadSettings({ GRPC_PORT: "0" });
    server = await createGrpcServer(settings, createEmbeddingService(embedder, 4));
    const port = await server.start();
    await server.stop(0.1);
    server = null;

    const client = clientFor(
      port,
      "fashion_clip/v1/embedding.proto",
      "fashion_clip.v1.EmbeddingService",
    );
    const error = await new Promise<grpc.ServiceError | null>((resolve) => {
      client.EmbedImage({ image: Buffer.from([1]) }, (rpcError) => resolve(rpcError));
    });
    expect(error?.code).toBe(grpc.status.UNAVAILABLE);
  });
});
