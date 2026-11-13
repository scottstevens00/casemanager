// Works out when to remind you about each task, follow-up and event.

import { addDays, fmtLong, fmtTime, type ISODate } from './dates'
import type { Case, CaseEvent, Settings, Task } from './types'

export interface Reminder {
  key: string
  at: number
  title: string
  body: string
  taskId?: string
  eventId?: string
  caseId?: string
}

export function localTime(date: ISODate, time: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '08:30').split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
}

function caseLabel(cases: Map<string, Case>, id?: string) {
  const c = id ? cases.get(id) : undefined
  return c ? `[${c.name}] ` : ''
}

export function computeReminders(
  data: { tasks: Task[]; events: CaseEvent[]; cases: Case[] },
  settings: Settings,
  from: number,
  to: number,
): Reminder[] {
  const out: Reminder[] = []
  const cases = new Map(data.cases.map((c) => [c.id, c]))
  const push = (r: Reminder) => {
    if (r.at >= from && r.at <= to) out.push(r)
  }
  const morning = settings.morningTime || '08:30'

  for (const t of data.tasks) {
    if (t.deleted || t.status === 'done') continue
    const cl = caseLabel(cases, t.caseId)
    if (t.kind === 'followup') {
      if (t.nextFollowUp) {
        const since = t.sentOn ? ` since ${fmtLong(t.sentOn)}` : ''
        push({
          key: `t:${t.id}:fu:${t.nextFollowUp}`,
          at: localTime(t.nextFollowUp, morning),
          title: `Follow up: ${cl}${t.title}`,
          body: t.waitingOn ? `Still waiting on ${t.waitingOn}${since}.` : `Check whether this loop is closed.`,
          taskId: t.id,
          caseId: t.caseId,
        })
      }
      if (t.due && t.due !== t.nextFollowUp) {
        push({ key: `t:${t.id}:due:${t.due}:0`, at: localTime(t.due, morning), title: `Due today: ${cl}${t.title}`, body: t.waitingOn ? `Waiting on ${t.waitingOn}.` : '', taskId: t.id, caseId: t.caseId })
      }
    } else if (t.due) {
      for (const d of settings.deadlineReminderDays) {
        const day = addDays(t.due, -d)
        push({
          key: `t:${t.id}:due:${t.due}:${d}`,
          at: localTime(day, morning),
          title: d === 0 ? `Due today: ${cl}${t.title}` : d === 1 ? `Due tomorrow: ${cl}${t.title}` : `Due in ${d} days: ${cl}${t.title}`,
          body: `Deadline ${fmtLong(t.due)}${t.dueTime ? ' at ' + fmtTime(t.dueTime) : ''}.`,
          taskId: t.id,
          caseId: t.caseId,
        })
      }
    }
    if (t.kind === 'summary' && t.target) {
      push({
        key: `t:${t.id}:target:${t.target}`,
        at: localTime(t.target, morning),
        title: `Summary goal today: ${cl}${t.title}`,
        body: t.due ? `Hard deadline ${fmtLong(t.due)}.` : '',
        taskId: t.id,
        caseId: t.caseId,
      })
    }
    for (const r of t.remind || []) {
      const [d, tm] = r.split('T')
      push({ key: `t:${t.id}:r:${r}`, at: localTime(d, tm || morning), title: `Reminder: ${cl}${t.title}`, body: t.due ? `Due ${fmtLong(t.due)}.` : '', taskId: t.id, caseId: t.caseId })
    }
  }

  for (const e of data.events) {
    if (e.deleted) continue
    const cl = caseLabel(cases, e.caseId)
    const when = e.time ? ` at ${fmtTime(e.time)}` : ''
    push({
      key: `e:${e.id}:${e.date}:prev`,
      at: localTime(addDays(e.date, -1), morning),
      title: `Tomorrow: ${cl}${e.title}`,
      body: `${fmtLong(e.date)}${when}${e.location ? ' — ' + e.location : ''}`,
      eventId: e.id,
      caseId: e.caseId,
    })
    if (e.time) {
      push({
        key: `e:${e.id}:${e.date}:${e.time}:1h`,
        at: localTime(e.date, e.time) - 60 * 60_000,
        title: `In 1 hour: ${cl}${e.title}`,
        body: `${fmtTime(e.time)}${e.location ? ' — ' + e.location : ''}`,
        eventId: e.id,
        caseId: e.caseId,
      })
    } else {
      push({ key: `e:${e.id}:${e.date}:day`, at: localTime(e.date, morning), title: `Today: ${cl}${e.title}`, body: e.location || '', eventId: e.id, caseId: e.caseId })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}
