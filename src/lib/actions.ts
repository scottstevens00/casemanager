// Common actions on tasks, follow-ups and events.

import { addBusinessDays, addDays, diffDays, todayISO, type DayRules, type ISODate } from './dates'
import { store } from './store'
import type { CaseEvent, Task } from './types'
import { toast } from './ui'
import { summaryDatesFor } from './workflows'

export const dayRules = (): DayRules => ({ extraClosed: store.settings.extraClosed })

/** The date that matters for sorting and reminders. */
export function effectiveDue(t: Task): ISODate | undefined {
  if (t.kind === 'followup') return t.nextFollowUp || t.due
  return t.due
}

export type DueState = 'overdue' | 'today' | 'soon' | 'week' | 'later' | 'none'

export function dueState(d: ISODate | undefined, today = todayISO()): DueState {
  if (!d) return 'none'
  const n = diffDays(d, today)
  if (n < 0) return 'overdue'
  if (n === 0) return 'today'
  if (n <= 3) return 'soon'
  if (n <= 7) return 'week'
  return 'later'
}

export function completeTask(id: string) {
  const t = store.find('tasks', id)
  if (!t) return
  const prev = { status: t.status, completedAt: t.completedAt, completedOn: t.completedOn }
  store.save('tasks', { id, status: 'done', completedAt: Date.now(), completedOn: todayISO() })
  toast(t.kind === 'followup' ? 'Loop closed' : 'Done', 'ok', {
    label: 'Undo',
    run: () => store.save('tasks', { id, ...prev }),
  })
}

export function reopenTask(id: string) {
  store.save('tasks', { id, status: 'open', completedAt: undefined, completedOn: undefined })
}

export function markFollowedUp(id: string, note?: string) {
  const t = store.find('tasks', id)
  if (!t) return
  const today = todayISO()
  const next = addBusinessDays(today, store.settings.followUpBusinessDays, dayRules())
  store.save('tasks', {
    id,
    status: 'waiting',
    followUps: [...(t.followUps || []), { date: today, note }],
    nextFollowUp: next,
  })
  toast(`Logged. Next nudge ${next === addDays(today, 1) ? 'tomorrow' : 'in ' + store.settings.followUpBusinessDays + ' business days'}.`)
}

export function snooze(id: string, businessDays = 1) {
  const t = store.find('tasks', id)
  if (!t) return
  const next = addBusinessDays(todayISO(), businessDays, dayRules())
  if (t.kind === 'followup') store.save('tasks', { id, nextFollowUp: next })
  else store.save('tasks', { id, remind: [...(t.remind || []), `${next}T${store.settings.morningTime}`] })
  toast(`Snoozed until ${next}`)
}

/** Saves an event; a deposition's summary deadlines move with its date. */
export function saveEvent(data: Partial<CaseEvent> & { id?: string }) {
  const before = data.id ? store.find('events', data.id) : undefined
  const ev = store.save('events', data)
  if (before && before.date !== ev.date) {
    const linked = store.list('tasks').filter((t) => t.eventId === ev.id && t.kind === 'summary' && t.status !== 'done')
    for (const t of linked) {
      const d = summaryDatesFor(ev.date, store.settings, dayRules())
      store.save('tasks', { id: t.id, target: d.target, due: d.due })
    }
    if (linked.length) toast('Summary deadlines moved with the new date')
  }
  return ev
}

export function sortByDue(a: Task, b: Task) {
  const da = effectiveDue(a) || '9999-12-31'
  const db = effectiveDue(b) || '9999-12-31'
  if (da !== db) return da.localeCompare(db)
  const pr = { high: 0, normal: 1, low: 2 }
  return pr[a.priority] - pr[b.priority]
}

export function openTasks(): Task[] {
  return store.list('tasks').filter((t) => t.status !== 'done')
}

export function caseName(id?: string) {
  return id ? store.find('cases', id)?.name : undefined
}
