// Platform bits: native phone app vs. Chrome on the PC, notifications, file downloads.

import { Capacitor } from '@capacitor/core'

export const isNative = () => Capacitor.isNativePlatform()

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

/** Save a file: download on the PC, share sheet on the phone. */
export async function saveFile(name: string, data: Uint8Array | string, mime: string) {
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const b64 = typeof data === 'string' ? btoa(unescape(encodeURIComponent(data))) : u8ToB64(data)
    const res = await Filesystem.writeFile({ path: name, data: b64, directory: Directory.Cache })
    await Share.share({ title: name, url: res.uri })
    return
  }
  const blob = new Blob([typeof data === 'string' ? data : (data as BlobPart)], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function u8ToB64(u8: Uint8Array): string {
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode(...u8.subarray(i, i + CH))
  return btoa(s)
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}
