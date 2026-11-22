import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Chạy lúc build image: tải weights theo SHA pin vào layout mà env.localModelPath expects.
// model.ts đặt env.localModelPath = ${HF_HOME}/hub/, từ_pretrained(modelId) sẽ đọc
// ${HF_HOME}/hub/${MODEL_ID}/...
const modelId = process.env.MODEL_ID ?? "ff13/fashion-clip";
const revision = process.env.MODEL_REVISION ?? "0f99955d944c39bfd9d035a02ac273c7a44a406b";
const hfHome = process.env.HF_HOME ?? "/models";
const targetDir = join(hfHome, "hub", modelId);

const files = [
  { name: "config.json", minBytes: 100 },
  { name: "preprocessor_config.json", minBytes: 100 },
  { name: "onnx/vision_model.onnx", minBytes: 350_000_000 },
];

for (const file of files) {
  const url = `https://huggingface.co/${modelId}/resolve/${revision}/${file.name}`;
  console.info(`downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download ${file.name} failed: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < file.minBytes) {
    throw new Error(`${file.name} too small: ${bytes.length} bytes`);
  }
  const target = join(targetDir, file.name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  console.info(`  -> ${target} (${statSync(target).size} bytes)`);
}
