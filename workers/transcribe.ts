import { env, pipeline } from "@huggingface/transformers";

// Load the smaller, matching ONNX runtime from this Site. The model itself is
// fetched and cached separately when transcription is first used.
if (!env.backends.onnx.wasm) throw new Error("Локальный движок распознавания недоступен");
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL("/runtime/ort-wasm-simd-threaded.mjs", self.location.origin).href,
  wasm: new URL("/runtime/ort-wasm-simd-threaded.wasm", self.location.origin).href,
};

let transcriberPromise: Promise<unknown> | null = null;
let oldModelCacheCleaned = false;

async function removeOldModelCache() {
  if (typeof caches === "undefined") return;
  try {
    if (!(await caches.has("transformers-cache"))) return;
    const cache = await caches.open("transformers-cache");
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      if (url.hostname === "huggingface.co" && url.pathname.startsWith("/Xenova/whisper-tiny/")) {
        await cache.delete(request);
      }
    }
  } catch {
    // A blocked browser cache should not prevent transcription.
  }
}

self.onmessage = async (event: MessageEvent<{ id: string; samples: Float32Array }>) => {
  const { id, samples } = event.data;
  try {
    if (!transcriberPromise) {
      self.postMessage({ id, status: "loading" });
      transcriberPromise = pipeline("automatic-speech-recognition", "Xenova/whisper-small", {
        device: "wasm",
        dtype: "q8",
      });
    }
    const transcriber = await transcriberPromise as (audio:Float32Array,options:{language:string;task:string;chunk_length_s:number;stride_length_s:number})=>Promise<{text:string}|{text:string}[]>;
    if (!oldModelCacheCleaned) {
      await removeOldModelCache();
      oldModelCacheCleaned = true;
    }
    self.postMessage({ id, status: "transcribing" });
    const result = await transcriber(samples, { language: "russian", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
    self.postMessage({ id, status: "done", text: Array.isArray(result) ? result.map(part => part.text).join(" ") : result.text });
  } catch (error) {
    transcriberPromise = null;
    self.postMessage({ id, status: "error", error: error instanceof Error ? error.message : "Не удалось запустить локальную модель" });
  }
};
