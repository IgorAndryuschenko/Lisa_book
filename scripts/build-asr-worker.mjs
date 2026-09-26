import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { build } from "vite";

const outputDirectory = resolve("public/runtime");
const requireFromTransformers = createRequire(import.meta.resolve("@huggingface/transformers"));
const runtimeDirectory = dirname(requireFromTransformers.resolve("onnxruntime-web"));
mkdirSync(outputDirectory, { recursive: true });
for (const name of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  copyFileSync(join(runtimeDirectory, name), join(outputDirectory, name));
}

await build({
  configFile: false,
  root: process.cwd(),
  publicDir: false,
  build: {
    outDir: "public/runtime",
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    target: "es2022",
    rollupOptions: {
      input: resolve("workers/transcribe.ts"),
      output: {
        entryFileNames: "transcribe-worker.js",
        chunkFileNames: "asr-[hash].js",
        assetFileNames: "asr-[hash][extname]",
      },
    },
  },
});

// The worker uses the separately supplied standard WASM runtime. Vite also
// emits an asyncify variant that this application never loads.
for (const name of readdirSync(outputDirectory)) {
  if (/^asr-[A-Za-z0-9_-]+\.wasm$/.test(name)) rmSync(join(outputDirectory, name));
}
