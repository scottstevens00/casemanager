// A running stopwatch for billing time. Survives reloads.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { roundTenth, suggestCodes } from './utbms'
import { store } from './store'
import { openDialog } from './ui'
import { todayISO } from './dates'

export interface Timer {
  start: number
  caseId?: string
  taskId?: string
  narrative?: string
  /** Time banked from earlier runs (paused). */
  bankedMs?: number
  paused?: boolean
}

let timer: Timer | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export async function loadTimer() {
  timer = await store.kvGet<Timer>('timer')
  emit()
}

function persist() {
  void store.kvSet('timer', timer)
  emit()
}

export function startTimer(t: Omit<Timer, 'start'> = {}) {
  timer = { ...t, start: Date.now(), bankedMs: 0 }
  persist()
}

export function pauseTimer() {
  if (!timer || timer.paused) return
  timer = { ...timer, paused: true, bankedMs: (timer.bankedMs || 0) + (Date.now() - timer.start) }
  persist()
}

export function resumeTimer() {
  if (!timer || !timer.paused) return
  timer = { ...timer, paused: false, start: Date.now() }
  persist()
}

export function elapsedMs(t = timer) {
  if (!t) return 0
  return (t.bankedMs || 0) + (t.paused ? 0 : Date.now() - t.start)
}

export function stopTimer() {
  if (!timer) return
  const hours = roundTenth(elapsedMs() / 3_600_000)
  const t = timer
  timer = undefined
  persist()
  openDialog({ type: 'time', draft: { caseId: t.caseId, taskId: t.taskId, narrative: t.narrative || '', hours, date: todayISO(), ...(t.narrative ? suggestCodes(t.narrative) : {}) } })
}

export function cancelTimer() {
  timer = undefined
  persist()
}

export function useTimer(): Timer | undefined {
  const t = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => timer,
  )
  const [, tick] = useState(0)
  useEffect(() => {
    if (!t || t.paused) return
    const i = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(i)
  }, [t])
  return t
}

export function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
