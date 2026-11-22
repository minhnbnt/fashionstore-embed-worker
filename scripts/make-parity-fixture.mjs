import { cpSync, mkdirSync, readdirSync } from "node:fs";

const source = "../backend/data/marketplace-import/images/lazada";
const target = "test-fixtures/images";

mkdirSync(target, { recursive: true });
const files = readdirSync(source).sort().slice(0, 16);
files.forEach((file, index) => {
  const extension = file.split(".").at(-1);
  cpSync(`${source}/${file}`, `${target}/${String(index).padStart(2, "0")}.${extension}`);
});

console.info(`copied ${files.length} images to ${target}`);
console.info(
  "Oracle: cd ../embed-worker && .venv/bin/python -c " +
    "'import json;from pathlib import Path;from PIL import Image;" +
    "from app.config import Settings;from app.infrastructure.model import FashionClipModel;" +
    'p=sorted(Path("../embed-worker-node/test-fixtures/images").iterdir());' +
    'ims=[Image.open(x).convert("RGB") for x in p];' +
    "m=FashionClipModel(Settings(local_files_only=True));m.load();" +
    'Path("../embed-worker-node/test-fixtures/python-vectors.json").write_text(' +
    "json.dumps(m.embed_images(ims).tolist()))'",
);
