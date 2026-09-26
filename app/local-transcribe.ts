let worker: Worker | null = null;

export async function transcribeLocally(blob: Blob, onStatus: (message: string) => void): Promise<string> {
  if (!worker) {
    try { worker = new Worker("/runtime/transcribe-worker.js?model=whisper-small", { type: "module" }); }
    catch { throw new Error("Не удалось запустить локальную расшифровку. Обновите страницу и попробуйте ещё раз."); }
  }
  const context = new AudioContext();
  let samples: Float32Array;
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16_000), 16_000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const resampled = await offline.startRendering();
    samples = resampled.getChannelData(0).slice();
  } finally { await context.close(); }
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return new Promise<string>((resolve, reject) => {
    const currentWorker = worker!;
    const cleanup = () => {
      currentWorker.removeEventListener("message", onMessage);
      currentWorker.removeEventListener("error", onError);
      currentWorker.removeEventListener("messageerror", onError);
    };
    const onError = () => {
      cleanup();
      currentWorker.terminate();
      if (worker === currentWorker) worker = null;
      reject(new Error("Не удалось запустить расшифровку. Обновите страницу и попробуйте ещё раз."));
    };
    const onMessage = (event: MessageEvent<{id:string;status:string;text?:string;error?:string}>) => {
      if (event.data.id !== id) return;
      if (event.data.status === "loading") onStatus("Загружается локальная модель Whisper small. Первый запуск может занять несколько минут…");
      if (event.data.status === "transcribing") onStatus("Whisper расшифровывает запись на этом устройстве…");
      if (event.data.status === "done" || event.data.status === "error") {
        cleanup();
        if (event.data.status === "done") resolve(event.data.text?.trim() ?? "");
        else reject(new Error("Локальная модель недоступна. Проверьте загрузку модели и попробуйте ещё раз."));
      }
    };
    currentWorker.addEventListener("message", onMessage);
    currentWorker.addEventListener("error", onError);
    currentWorker.addEventListener("messageerror", onError);
    try { currentWorker.postMessage({ id, samples }, [samples.buffer]); }
    catch { onError(); }
  });
}
