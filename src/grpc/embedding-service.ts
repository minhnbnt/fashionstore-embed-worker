import * as grpc from "@grpc/grpc-js";

import type { SearchEmbedder } from "../service/search-embedding";
import { ImageTooLargeError, InvalidImageError, MODEL_NAME } from "../types";

interface EmbedImageRequest {
  image: Buffer | Uint8Array;
}

interface EmbedImageReply {
  vector: number[];
  model: string;
}

export function createEmbeddingService(
  embedder: SearchEmbedder,
  maxConcurrency: number,
): grpc.UntypedServiceImplementation {
  let active = 0;
  const handler: grpc.handleUnaryCall<EmbedImageRequest, EmbedImageReply> = (call, callback) => {
    if (active >= maxConcurrency) {
      callback({
        code: grpc.status.RESOURCE_EXHAUSTED,
        details: `quá ${maxConcurrency} RPC đồng thời`,
      });
      return;
    }
    active += 1;
    void (async () => {
      try {
        const vector = await embedder.embed(Buffer.from(call.request.image));
        callback(null, { vector, model: MODEL_NAME });
      } catch (cause: unknown) {
        if (cause instanceof ImageTooLargeError) {
          callback({ code: grpc.status.RESOURCE_EXHAUSTED, details: cause.message });
        } else if (cause instanceof InvalidImageError) {
          callback({ code: grpc.status.INVALID_ARGUMENT, details: cause.message });
        } else {
          callback({ code: grpc.status.INTERNAL, details: String(cause) });
        }
      } finally {
        active -= 1;
      }
    })();
  };
  return { EmbedImage: handler as grpc.UntypedHandleCall };
}
