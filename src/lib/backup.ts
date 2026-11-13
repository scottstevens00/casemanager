// Automatic backup to a file you choose on the work PC (e.g. your Documents or a firm network drive).
// Uses Chrome's File System Access API. The file never leaves the PC.

import { store } from './store'

type Handle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>
}

declare global {
  interface Window {
    showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>
    showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>
  }
}

let handle: Handle | undefined
let status: 'none' | 'ok' | 'needs-permission' | 'error' = 'none'
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
export const onBackupStatus = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const backupSupported = () => typeof window !== 'undefined' && !!window.showSaveFilePicker
export const backupStatus = () => status
export const backupFileName = () => handle?.name

export async function initBackup() {
  if (!backupSupported()) return
  handle = await store.kvGet<Handle>('backupHandle')
  if (!handle) {
    status = 'none'
    emit()
    return
  }
  const p = await handle.queryPermission?.({ mode: 'readwrite' })
  status = p === 'granted' ? 'ok' : 'needs-permission'
  emit()
  store.onChange(scheduleBackup)
}

export async function chooseBackupFile() {
  if (!window.showSaveFilePicker) return
  const h = (await window.showSaveFilePicker({
    suggestedName: 'case-manager-backup.json',
    types: [{ description: 'Case Manager backup', accept: { 'application/json': ['.json'] } }],
  })) as Handle
  handle = h
  await store.kvSet('backupHandle', h)
  status = 'ok'
  store.onChange(scheduleBackup)
  await writeBackup()
}

export async function reconnectBackup() {
  if (!handle?.requestPermission) return
  const p = await handle.requestPermission({ mode: 'readwrite' })
  status = p === 'granted' ? 'ok' : 'needs-permission'
  emit()
  if (status === 'ok') await writeBackup()
}

let timer: ReturnType<typeof setTimeout> | undefined
function scheduleBackup() {
  clearTimeout(timer)
  timer = setTimeout(() => void writeBackup(), 4000)
}

export async function writeBackup() {
  if (!handle) return
  try {
    const p = await handle.queryPermission?.({ mode: 'readwrite' })
    if (p && p !== 'granted') {
      status = 'needs-permission'
      emit()
      return
    }
    const w = await handle.createWritable()
    await w.write(JSON.stringify(store.exportAll()))
    await w.close()
    status = 'ok'
    store.updateMeta({ lastBackupAt: Date.now(), lastBackupError: undefined })
  } catch (e) {
    status = 'error'
    store.updateMeta({ lastBackupError: String((e as Error).message || e) })
  }
  emit()
}
