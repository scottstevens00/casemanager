// The app's data store: everything lives on this device in IndexedDB.
// Nothing here talks to a server.

import { createStore, del, get, keys, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import { todayISO } from './dates'
import {
  DEFAULT_SETTINGS,
  type Base,
  type Case,
  type CaseEvent,
  type Collection,
  type DB,
  type Peer,
  type Settings,
  type Task,
  type TimeEntry,
} from './types'

const idb = createStore('case-manager', 'kv')

export interface Meta {
  deviceId: string
  deviceName: string
  rev: number
  peers: Record<string, Peer>
  firedReminders: Record<string, number>
  lastReminderCheck: number
  createdAt: number
  lastBackupAt?: number
  lastBackupError?: string
}

type RecordOf<C extends Collection> = DB[C][number]

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const EMPTY_DB: DB = { cases: [], tasks: [], events: [], time: [] }

class Store {
  db: DB = structuredClone(EMPTY_DB)
  settings: Settings = { ...DEFAULT_SETTINGS }
  meta: Meta = {
    deviceId: uid(),
    deviceName: 'This device',
    rev: 0,
    peers: {},
    firedReminders: {},
    lastReminderCheck: Date.now(),
    createdAt: Date.now(),
  }
  loaded = false
  version = 0
  private listeners = new Set<() => void>()
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private changeHooks = new Set<() => void>()

  async load() {
    const [db, settings, meta] = await Promise.all([
      get<DB>('db', idb),
      get<Settings>('settings', idb),
      get<Meta>('meta', idb),
    ])
    if (db) this.db = { ...structuredClone(EMPTY_DB), ...db }
    if (settings) this.settings = { ...DEFAULT_SETTINGS, ...settings }
    if (meta) this.meta = { ...this.meta, ...meta }
    else await set('meta', this.meta, idb)
    this.loaded = true
    this.bump()
    void this.dailySnapshot()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getVersion = () => this.version

  /** Called after any data change (used for backups and notification scheduling). */
  onChange(fn: () => void) {
    this.changeHooks.add(fn)
    return () => {
      this.changeHooks.delete(fn)
    }
  }

  private bump() {
    this.version++
    for (const l of this.listeners) l()
  }

  private scheduleSave(dataChanged = true) {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.flush(dataChanged), 150)
  }

  async flush(dataChanged = true) {
    clearTimeout(this.saveTimer)
    await Promise.all([set('db', this.db, idb), set('settings', this.settings, idb), set('meta', this.meta, idb)])
    if (dataChanged) for (const h of this.changeHooks) h()
  }

  // ---------- records ----------

  list<C extends Collection>(col: C, includeDeleted = false): RecordOf<C>[] {
    const arr = this.db[col] as RecordOf<C>[]
    return includeDeleted ? arr : arr.filter((r) => !r.deleted)
  }

  find<C extends Collection>(col: C, id: string | undefined): RecordOf<C> | undefined {
    if (!id) return undefined
    return (this.db[col] as RecordOf<C>[]).find((r) => r.id === id && !r.deleted)
  }

  /** Create or update a record. Pass `id` to update; omit it to create. */
  save<C extends Collection>(col: C, data: Partial<RecordOf<C>> & { id?: string }): RecordOf<C> {
    const arr = this.db[col] as RecordOf<C>[]
    const now = Date.now()
    const rev = ++this.meta.rev
    const idx = data.id ? arr.findIndex((r) => r.id === data.id) : -1
    let rec: RecordOf<C>
    if (idx >= 0) {
      rec = { ...arr[idx], ...data, updatedAt: now, dev: this.meta.deviceId, lrev: rev } as RecordOf<C>
      const copy = arr.slice()
      copy[idx] = rec
      ;(this.db[col] as RecordOf<C>[]) = copy
    } else {
      rec = { ...data, id: data.id || uid(), createdAt: now, updatedAt: now, dev: this.meta.deviceId, lrev: rev } as RecordOf<C>
      ;(this.db[col] as RecordOf<C>[]) = [...arr, rec]
    }
    this.bump()
    this.scheduleSave()
    return rec
  }

  saveMany<C extends Collection>(col: C, items: (Partial<RecordOf<C>> & { id?: string })[]) {
    const out: RecordOf<C>[] = []
    for (const it of items) out.push(this.save(col, it))
    return out
  }

  remove(col: Collection, id: string) {
    const rec = this.find(col, id)
    if (!rec) return
    this.save(col, { id, deleted: true } as never)
    if (col === 'cases') {
      // A deleted case takes its tasks and dates with it; time entries stay for billing history.
      for (const t of this.list('tasks').filter((t) => t.caseId === id)) this.save('tasks', { id: t.id, deleted: true })
      for (const e of this.list('events').filter((e) => e.caseId === id)) this.save('events', { id: e.id, deleted: true })
    }
  }

  // ---------- settings & meta ----------

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch }
    this.bump()
    this.scheduleSave(false)
  }

  updateMeta(patch: Partial<Meta>) {
    this.meta = { ...this.meta, ...patch }
    this.scheduleSave(false)
  }

  /** Remember people who give assignments, for autocomplete. */
  rememberPerson(name?: string) {
    const n = name?.trim()
    if (!n) return
    if (this.settings.people.some((p) => p.toLowerCase() === n.toLowerCase())) return
    this.updateSettings({ people: [...this.settings.people, n].sort((a, b) => a.localeCompare(b)) })
  }

  // ---------- whole-database operations ----------

  exportAll() {
    return {
      app: 'case-manager',
      version: 1,
      exportedAt: new Date().toISOString(),
      db: this.db,
      settings: this.settings,
    }
  }

  /** Replace everything with a backup's contents. */
  async restore(data: { db: DB; settings?: Settings }) {
    await this.snapshot('before-restore')
    const rev = ++this.meta.rev
    const fix = <T extends Base>(arr: T[] = []) => arr.map((r) => ({ ...r, lrev: rev }))
    this.db = {
      cases: fix(data.db.cases),
      tasks: fix(data.db.tasks),
      events: fix(data.db.events),
      time: fix(data.db.time),
    }
    if (data.settings) this.settings = { ...DEFAULT_SETTINGS, ...data.settings }
    this.bump()
    await this.flush()
  }

  async snapshot(label: string) {
    await set(`snap:${label}:${Date.now()}`, this.exportAll(), idb)
  }

  private async dailySnapshot() {
    const key = `daily:${todayISO()}`
    const existing = await get(key, idb)
    if (!existing && this.db.cases.length + this.db.tasks.length > 0) await set(key, this.exportAll(), idb)
    // keep 10 daily snapshots and 5 others
    const all = (await keys(idb)).map(String)
    const daily = all.filter((k) => k.startsWith('daily:')).sort()
    for (const k of daily.slice(0, Math.max(0, daily.length - 10))) await del(k, idb)
    const snaps = all.filter((k) => k.startsWith('snap:')).sort()
    for (const k of snaps.slice(0, Math.max(0, snaps.length - 5))) await del(k, idb)
  }

  async listSnapshots(): Promise<string[]> {
    const all = (await keys(idb)).map(String)
    return all.filter((k) => k.startsWith('daily:') || k.startsWith('snap:')).sort().reverse()
  }

  async readSnapshot(key: string) {
    return get(key, idb)
  }

  // Raw key-value helpers for other modules (backup file handle, etc.)
  kvGet<T>(key: string) {
    return get<T>(key, idb)
  }
  kvSet(key: string, value: unknown) {
    return set(key, value, idb)
  }

  /** Apply records received from another device (sync). Newer `updatedAt` wins. */
  mergeRecords(incoming: Partial<DB>): { added: number; updated: number } {
    let added = 0
    let updated = 0
    for (const col of Object.keys(EMPTY_DB) as Collection[]) {
      const inc = (incoming[col] || []) as Base[]
      if (!inc.length) continue
      const arr = (this.db[col] as Base[]).slice()
      const index = new Map(arr.map((r, i) => [r.id, i]))
      for (const r of inc) {
        const i = index.get(r.id)
        if (i === undefined) {
          // Received records keep lrev 0 so they aren't echoed straight back.
          arr.push({ ...r, lrev: 0 })
          index.set(r.id, arr.length - 1)
          added++
        } else {
          const cur = arr[i]
          const newer = r.updatedAt > cur.updatedAt || (r.updatedAt === cur.updatedAt && (r.dev || '') > (cur.dev || ''))
          if (newer) {
            arr[i] = { ...r, lrev: 0 }
            updated++
          }
        }
      }
      ;(this.db[col] as Base[]) = arr
    }
    if (added || updated) {
      this.bump()
      this.scheduleSave()
    }
    return { added, updated }
  }
}

export const store = new Store()

/** Re-render when the store changes. */
export function useStore() {
  useSyncExternalStore(store.subscribe, store.getVersion)
  return store
}

// Convenience typed helpers
export const cases = () => store.list('cases') as Case[]
export const tasks = () => store.list('tasks') as Task[]
export const events = () => store.list('events') as CaseEvent[]
export const timeEntries = () => store.list('time') as TimeEntry[]
