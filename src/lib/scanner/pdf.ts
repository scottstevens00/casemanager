// Reads a PDF on this device with pdf.js: the text layer for e-filed orders, page images for scanned ones.

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfRead {
  pages: string[]
  pageCount: number
  /** True when the text layer is basically empty, i.e. a scan. */
  scanned: boolean
  doc: pdfjs.PDFDocumentProxy
}

interface TextItemLike {
  str: string
  transform: number[]
  width: number
  hasEOL?: boolean
}

export async function readPdf(data: ArrayBuffer): Promise<PdfRead> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items = (tc.items as TextItemLike[]).filter((i) => typeof i.str === 'string')
    // Group into lines by y position, then sort by x.
    const lines: { y: number; parts: { x: number; w: number; s: string }[] }[] = []
    for (const it of items) {
      if (!it.str.trim()) continue
      const x = it.transform[4]
      const y = it.transform[5]
      let line = lines.find((l) => Math.abs(l.y - y) < 3)
      if (!line) {
        line = { y, parts: [] }
        lines.push(line)
      }
      line.parts.push({ x, w: it.width, s: it.str })
    }
    lines.sort((a, b) => b.y - a.y)
    const text = lines
      .map((l) => {
        l.parts.sort((a, b) => a.x - b.x)
        let out = ''
        let end = -Infinity
        for (const p of l.parts) {
          if (out && p.x - end > 2) out += p.x - end > 30 ? '   ' : ' '
          out += p.s
          end = p.x + p.w
        }
        return out
      })
      .join('\n')
    pages.push(text)
  }
  const chars = pages.join('').replace(/\s/g, '').length
  return { pages, pageCount: doc.numPages, scanned: chars < 80 * doc.numPages, doc }
}

/** Renders a page to a canvas for OCR or the on-device AI. */
export async function renderPage(doc: pdfjs.PDFDocumentProxy, pageNo: number, scale = 2): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNo)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return canvas
}
