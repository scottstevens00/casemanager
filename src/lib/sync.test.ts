import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { describe, expect, it } from 'vitest'
import { encodeFrames, FrameCollector, type SyncPayload } from './sync'

function render(bytes: Uint8Array, scale = 4) {
  const qr = QRCode.create([{ data: bytes, mode: 'byte' }], { errorCorrectionLevel: 'L' })
  const n = qr.modules.size
  const margin = 2
  const size = (n + margin * 2) * scale
  const px = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (qr.modules.get(y, x))
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4
            px[i] = px[i + 1] = px[i + 2] = 0
          }
  return { px, size }
}

describe('scan-to-sync codes', () => {
  it('a payload survives being split into QR codes, scanned out of order, and reassembled', () => {
    const tasks = Array.from({ length: 60 }, (_, i) => ({
      id: 't' + i,
      title: `Task ${i} ${Math.random().toString(36).slice(2)} ${crypto.randomUUID()}`,
      kind: 'task',
      status: 'open',
      priority: 'normal',
      createdAt: 1,
      updatedAt: 2,
      due: '2026-12-01',
    }))
    const payload = { v: 1, from: 'pc', name: 'Work PC', rev: 99, ack: 3, records: { tasks } } as unknown as SyncPayload
    const frames = encodeFrames(payload, 650)
    expect(frames.length).toBeGreaterThan(1)
    const c = new FrameCollector()
    // Camera sees frames in a scrambled order with repeats.
    const order = [...frames.keys()].reverse().concat([...frames.keys()])
    for (const i of order) {
      const { px, size } = render(frames[i])
      const code = jsQR(px, size, size)
      expect(code).not.toBeNull()
      c.add(Uint8Array.from(code!.binaryData))
    }
    expect(c.done).toBe(true)
    expect(c.result()).toEqual(payload)
  })
  it('rejects codes that are not Case Manager codes', () => {
    expect(() => new FrameCollector().add(new TextEncoder().encode('https://example.com'))).toThrow()
  })
})
