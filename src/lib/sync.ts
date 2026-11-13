// Scan-to-sync: devices exchange changes by showing and scanning QR codes. No cloud, no network.
//
// Each device numbers its own edits (lrev). A payload carries the records the other device hasn't
// confirmed yet, plus an acknowledgment of what we've received from it, so both sides only send changes.

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { store } from './store'
import type { Base, Collection, DB, Peer } from './types'

export interface SyncPayload {
  v: 1
  from: string
  name: string
  /** Our revision counter at send time. */
  rev: number
  /** Highest of the receiver's revisions we have received. */
  ack: number
  records: Partial<DB>
}

const COLLECTIONS: Collection[] = ['cases', 'tasks', 'events', 'time']

export function knownPeers(): Peer[] {
  return Object.values(store.meta.peers).sort((a, b) => (b.lastSync || 0) - (a.lastSync || 0))
}

export function buildPayload(peerId?: string, full = false): { payload: SyncPayload; count: number } {
  const peer = peerId ? store.meta.peers[peerId] : undefined
  const since = full || !peer ? 0 : peer.ackedRev
  const records: Partial<DB> = {}
  let count = 0
  for (const col of COLLECTIONS) {
    const list = (store.db[col] as Base[]).filter((r) => (r.lrev ?? 0) > since || (since === 0 && !r.deleted))
    if (list.length) {
      ;(records as Record<string, Base[]>)[col] = list
      count += list.length
    }
  }
  return {
    payload: { v: 1, from: store.meta.deviceId, name: store.meta.deviceName, rev: store.meta.rev, ack: peer?.seenRev ?? 0, records },
    count,
  }
}

export function applyPayload(p: SyncPayload): { added: number; updated: number; peerName: string } {
  if (p.v !== 1) throw new Error('This code came from a newer version of Case Manager. Update both devices.')
  if (p.from === store.meta.deviceId) throw new Error("That's this device's own code.")
  const res = store.mergeRecords(p.records)
  const prev: Peer = store.meta.peers[p.from] || { id: p.from, name: p.name, seenRev: 0, ackedRev: 0 }
  const peer: Peer = {
    ...prev,
    name: p.name,
    seenRev: Math.max(prev.seenRev, p.rev),
    ackedRev: Math.max(prev.ackedRev, Math.min(p.ack, store.meta.rev)),
    lastSync: Date.now(),
  }
  store.updateMeta({ peers: { ...store.meta.peers, [p.from]: peer } })
  void store.flush()
  return { ...res, peerName: p.name }
}

// ---------- framing for QR codes ----------
// Frame bytes: 'C','M', version(1), session(4), index(2), total(2), data...

const MAGIC0 = 0x43
const MAGIC1 = 0x4d
const HEADER = 11

export function encodeFrames(payload: SyncPayload, chunk = 700): Uint8Array[] {
  const json = JSON.stringify(payload)
  const data = deflateSync(strToU8(json), { level: 9 })
  const total = Math.max(1, Math.ceil(data.length / chunk))
  const session = crypto.getRandomValues(new Uint8Array(4))
  const frames: Uint8Array[] = []
  for (let i = 0; i < total; i++) {
    const part = data.subarray(i * chunk, (i + 1) * chunk)
    const f = new Uint8Array(HEADER + part.length)
    f[0] = MAGIC0
    f[1] = MAGIC1
    f[2] = 1
    f.set(session, 3)
    f[7] = i >> 8
    f[8] = i & 255
    f[9] = total >> 8
    f[10] = total & 255
    f.set(part, HEADER)
    frames.push(f)
  }
  return frames
}

export class FrameCollector {
  session = ''
  total = 0
  parts = new Map<number, Uint8Array>()

  /** Returns true when the frame was new. Throws on codes that aren't Case Manager codes. */
  add(bytes: Uint8Array | number[]): boolean {
    const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)
    if (b.length < HEADER || b[0] !== MAGIC0 || b[1] !== MAGIC1) throw new Error('Not a Case Manager code')
    const session = Array.from(b.subarray(3, 7)).join('.')
    const idx = (b[7] << 8) | b[8]
    const total = (b[9] << 8) | b[10]
    if (session !== this.session) {
      this.session = session
      this.total = total
      this.parts.clear()
    }
    if (this.parts.has(idx)) return false
    this.parts.set(idx, b.slice(HEADER))
    return true
  }

  get done() {
    return this.total > 0 && this.parts.size === this.total
  }

  get progress() {
    return this.total ? this.parts.size / this.total : 0
  }

  result(): SyncPayload {
    const len = [...this.parts.values()].reduce((s, p) => s + p.length, 0)
    const all = new Uint8Array(len)
    let o = 0
    for (let i = 0; i < this.total; i++) {
      const p = this.parts.get(i)!
      all.set(p, o)
      o += p.length
    }
    return JSON.parse(strFromU8(inflateSync(all))) as SyncPayload
  }
}
