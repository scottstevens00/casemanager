// Offline OCR for scanned orders. The engine and English model are bundled with the app (public/ocr),
// so nothing is downloaded from the internet and the page never leaves this device.

type Progress = (msg: string, frac?: number) => void

export async function ocrImages(images: (HTMLCanvasElement | Blob)[], onProgress?: Progress): Promise<string[]> {
  const { createWorker } = await import('tesseract.js')
  const base = new URL('ocr/', document.baseURI).href
  const worker = await createWorker('eng', 1, {
    workerPath: base + 'worker.min.js',
    corePath: base + 'tesseract-core-simd-lstm.wasm.js',
    langPath: base.replace(/\/$/, ''),
    gzip: true,
    logger: (m: { status: string; progress: number }) => onProgress?.(m.status, m.progress),
  })
  const out: string[] = []
  try {
    for (let i = 0; i < images.length; i++) {
      onProgress?.(`Reading page ${i + 1} of ${images.length}`, i / images.length)
      const { data } = await worker.recognize(images[i] as HTMLCanvasElement)
      out.push(data.text)
    }
  } finally {
    await worker.terminate()
  }
  return out
}
