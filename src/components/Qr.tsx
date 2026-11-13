import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { FrameCollector, type SyncPayload } from '../lib/sync'

/** Cycles through QR frames so a camera can collect them all. */
export function QrAnimator({ frames, fps = 4 }: { frames: Uint8Array[]; fps?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (frames.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % frames.length), 1000 / fps)
    return () => clearInterval(t)
  }, [frames, fps])
  useEffect(() => {
    if (!canvas.current || !frames.length) return
    void QRCode.toCanvas(canvas.current, [{ data: frames[idx % frames.length], mode: 'byte' }], {
      errorCorrectionLevel: 'L',
      margin: 2,
      scale: 6,
      color: { dark: '#000000', light: '#ffffff' },
    })
  }, [idx, frames])
  return (
    <div className="col" style={{ alignItems: 'center' }}>
      <div className="qr-box">
        <canvas ref={canvas} />
      </div>
      {frames.length > 1 && (
        <div className="small muted">
          Code {(idx % frames.length) + 1} of {frames.length} — keep the camera on it until it finishes
        </div>
      )}
    </div>
  )
}

/** Camera scanner that collects all frames of a sync code. */
export function QrScanner({ onDone, onError }: { onDone: (p: SyncPayload) => void; onError?: (msg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [progress, setProgress] = useState(0)
  const [msg, setMsg] = useState('Starting the camera…')
  const doneRef = useRef(false)

  useEffect(() => {
    let stream: MediaStream | undefined
    let raf = 0
    let stopped = false
    const collector = new FrameCollector()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    let last = 0

    const tick = (t: number) => {
      if (stopped) return
      raf = requestAnimationFrame(tick)
      const v = video.current
      if (!v || v.readyState < 2 || t - last < 70) return
      last = t
      const w = v.videoWidth
      const h = v.videoHeight
      if (!w || !h) return
      const scale = Math.min(1, 960 / Math.max(w, h))
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
      if (!code?.binaryData?.length) return
      try {
        if (collector.add(Uint8Array.from(code.binaryData))) {
          setProgress(collector.progress)
          setMsg(collector.total > 1 ? `Got ${collector.parts.size} of ${collector.total}` : 'Got it')
        }
        if (collector.done && !doneRef.current) {
          doneRef.current = true
          stopped = true
          onDone(collector.result())
        }
      } catch (e) {
        setMsg(String((e as Error).message))
      }
    }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (stopped) return stream.getTracks().forEach((tr) => tr.stop())
        const v = video.current!
        v.srcObject = stream
        v.setAttribute('playsinline', 'true')
        await v.play()
        setMsg('Point the camera at the code')
        raf = requestAnimationFrame(tick)
      } catch (e) {
        const m = (e as Error).name === 'NotAllowedError' ? 'Camera permission was blocked. Allow the camera for Case Manager and try again.' : 'No camera found on this device.'
        setMsg(m)
        onError?.(m)
      }
    })()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  return (
    <div className="col" style={{ alignItems: 'center' }}>
      <div className="video-box">
        <video ref={video} muted playsInline />
        <div className="frame" />
      </div>
      <div className="progress" style={{ width: 'min(480px, 100%)', height: 7 }}>
        <span style={{ width: `${progress * 100}%`, background: 'var(--green)' }} />
      </div>
      <div className="small muted">{msg}</div>
    </div>
  )
}
