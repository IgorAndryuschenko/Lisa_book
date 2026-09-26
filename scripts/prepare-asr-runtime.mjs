import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const requireFromTransformers = createRequire(import.meta.resolve("@huggingface/transformers"));
const runtimeDirectory = dirname(requireFromTransformers.resolve("onnxruntime-web"));
const outputDirectory = join(process.cwd(), "dist/client/runtime");
mkdirSync(outputDirectory, { recursive: true });
for (const name of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  copyFileSync(join(runtimeDirectory, name), join(outputDirectory, name));
}

// Vite emits an unused asyncify build above the host's per-file size limit.
// The worker explicitly loads the matching standard WASM build above.
function removeUnusedRuntime(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) removeUnusedRuntime(path);
    else if (item.name.startsWith("ort-wasm-simd-threaded.asyncify-") && item.name.endsWith(".wasm")) rmSync(path);
  }
}
removeUnusedRuntime(join(process.cwd(), "dist"));
