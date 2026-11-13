// Copies the offline OCR engine and English model into public/ocr so scanned orders can be read with no internet.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const out = 'public/ocr'
mkdirSync(out, { recursive: true })
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
]
for (const [src, dst] of files) {
  if (!existsSync(src)) throw new Error('Missing ' + src)
  copyFileSync(src, join(out, dst))
}
console.log('OCR files copied to', out)
