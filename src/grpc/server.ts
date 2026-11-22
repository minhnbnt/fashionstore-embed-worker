import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

import type { Settings } from "../config";

const PROTO_DIR = "src/grpc/proto";

export interface GrpcServer {
  start(): Promise<number>;
  stop(graceS: number): Promise<void>;
}

export async function createGrpcServer(
  settings: Settings,
  embeddingService: grpc.UntypedServiceImplementation,
): Promise<GrpcServer> {
  const loaderOptions: protoLoader.Options = {
    includeDirs: [PROTO_DIR],
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  };
  const embedding = grpc.loadPackageDefinition(
    protoLoader.loadSync("fashion_clip/v1/embedding.proto", loaderOptions),
  ) as never;
  const health = grpc.loadPackageDefinition(
    protoLoader.loadSync("grpc/health/v1/health.proto", loaderOptions),
  ) as never;

  const embeddingServiceDefinition = (
    embedding as Record<string, Record<string, Record<string, { service: grpc.ServiceDefinition }>>>
  )["fashion_clip"].v1.EmbeddingService.service;
  const healthServiceDefinition = (
    health as Record<
      string,
      Record<string, Record<string, Record<string, { service: grpc.ServiceDefinition }>>>
    >
  )["grpc"].health.v1.Health.service;

  const server = new grpc.Server({
    "grpc.max_receive_message_length": settings.grpcMaxImageBytes,
    "grpc.max_send_message_length": settings.grpcMaxImageBytes,
  });
  server.addService(embeddingServiceDefinition, embeddingService);
  server.addService(healthServiceDefinition, {
    Check: (_call: unknown, callback: (error: null, value: { status: number }) => void) => {
      callback(null, { status: 1 });
    },
    Watch: (call: { end: () => void }) => {
      call.end();
    },
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.bindAsync(
      `127.0.0.1:${settings.grpcPort}`,
      grpc.ServerCredentials.createInsecure(),
      (error, boundPort) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(boundPort);
      },
    );
  });

  return {
    start: async () => port,
    stop: (graceS: number) =>
      new Promise<void>((resolve) => {
        let finished = false;
        const timer = setTimeout(() => {
          if (!finished) {
            server.forceShutdown();
          }
        }, graceS * 1000);
        server.tryShutdown(() => {
          finished = true;
          clearTimeout(timer);
          resolve();
        });
      }),
  };
}
