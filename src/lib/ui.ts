// App-wide UI state: which dialog is open, toasts, and the hash router.

import { useSyncExternalStore } from 'react'
import type { CaseEvent, Task, TimeEntry } from './types'

export type Dialog =
  | { type: 'task'; id?: string; draft?: Partial<Task> }
  | { type: 'case'; id?: string }
  | { type: 'event'; id?: string; draft?: Partial<CaseEvent> }
  | { type: 'workflow'; caseId?: string; workflowId?: string }
  | { type: 'scanner'; caseId?: string }
  | { type: 'time'; id?: string; draft?: Partial<TimeEntry> }
  | { type: 'confirm'; title: string; body?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void }

export interface Toast {
  id: number
  text: string
  tone?: 'ok' | 'warn' | 'error'
  action?: { label: string; run: () => void }
}

interface UIState {
  dialogs: Dialog[]
  toasts: Toast[]
  route: string[]
  search: string
}

let state: UIState = { dialogs: [], toasts: [], route: parseHash(), search: '' }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const setState = (p: Partial<UIState>) => {
  state = { ...state, ...p }
  emit()
}

function parseHash(): string[] {
  const h = typeof location !== 'undefined' ? location.hash.replace(/^#\/?/, '') : ''
  const parts = h.split('/').filter(Boolean)
  return parts.length ? parts : ['today']
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const route = parseHash()
    // #/task/<id> opens the task over the current page instead of navigating.
    if (route[0] === 'task' && route[1]) {
      openDialog({ type: 'task', id: route[1] })
      history.replaceState(null, '', '#/' + state.route.join('/'))
      return
    }
    setState({ route })
  })
}

export function useUI() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
  )
}

export function navigate(path: string) {
  const p = path.replace(/^#?\/?/, '')
  if (location.hash.replace(/^#\/?/, '') === p) return
  location.hash = '/' + p
}

export function openDialog(d: Dialog) {
  setState({ dialogs: [...state.dialogs, d] })
}

export function closeDialog() {
  setState({ dialogs: state.dialogs.slice(0, -1) })
}

export function confirmAction(title: string, onConfirm: () => void, opts: { body?: string; confirmLabel?: string; danger?: boolean } = {}) {
  openDialog({ type: 'confirm', title, onConfirm, ...opts })
}

let toastId = 0
export function toast(text: string, tone: Toast['tone'] = 'ok', action?: Toast['action']) {
  const t: Toast = { id: ++toastId, text, tone, action }
  setState({ toasts: [...state.toasts.slice(-2), t] })
  setTimeout(() => setState({ toasts: state.toasts.filter((x) => x.id !== t.id) }), action ? 7000 : 3500)
}

export function dismissToast(id: number) {
  setState({ toasts: state.toasts.filter((x) => x.id !== id) })
}

export function setSearch(search: string) {
  setState({ search })
}

export function initialRoute() {
  const r = parseHash()
  if (r[0] === 'task' && r[1]) {
    setState({ route: ['today'] })
    openDialog({ type: 'task', id: r[1] })
  }
}
