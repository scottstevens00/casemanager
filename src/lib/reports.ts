// Weekly team report, time export and calendar export.

import { addDays, diffDays, fmtLong, fmtMDY, startOfWeek, todayISO, type ISODate } from './dates'
import { buildXlsx, type Cell, type Sheet } from './xlsx'
import { STATUS_LABEL, TASK_KIND_LABEL, type Case, type CaseEvent, type Task, type TimeEntry } from './types'
import { codeLabel } from './utbms'
import { effectiveDue, finishedOnTime } from './taskdates'

export interface WeekData {
  start: ISODate
  end: ISODate
  label: string
  completed: Task[]
  open: Task[]
  waiting: Task[]
  events: CaseEvent[]
  timeByCase: { caseId?: string; hours: number }[]
  totalHours: number
}

export function weekOf(d: ISODate): { start: ISODate; end: ISODate; label: string } {
  const start = startOfWeek(d)
  const end = addDays(start, 6)
  return { start, end, label: `Week of ${fmtMDY(start)} – ${fmtMDY(addDays(start, 4))}` }
}


export function buildWeek(d: ISODate, data: { tasks: Task[]; events: CaseEvent[]; time: TimeEntry[] }): WeekData {
  const { start, end, label } = weekOf(d)
  const inWeek = (x?: ISODate) => !!x && x >= start && x <= end
  const live = data.tasks.filter((t) => !t.deleted)
  const completed = live.filter((t) => t.status === 'done' && inWeek(t.completedOn))
  const sortDue = (a: Task, b: Task) => (effectiveDue(a) || '9999').localeCompare(effectiveDue(b) || '9999')
  const open = live.filter((t) => t.status !== 'done' && t.kind !== 'followup').sort(sortDue)
  const waiting = live.filter((t) => t.status !== 'done' && t.kind === 'followup').sort(sortDue)
  const events = data.events.filter((e) => !e.deleted && inWeek(e.date)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
  const entries = data.time.filter((t) => !t.deleted && inWeek(t.date))
  const map = new Map<string, number>()
  for (const e of entries) map.set(e.caseId || '', (map.get(e.caseId || '') || 0) + e.hours)
  const timeByCase = [...map.entries()].map(([caseId, hours]) => ({ caseId: caseId || undefined, hours: Math.round(hours * 10) / 10 }))
  const totalHours = Math.round(entries.reduce((s, e) => s + e.hours, 0) * 10) / 10
  return { start, end, label, completed, open, waiting, events, timeByCase, totalHours }
}

export function weeklyXlsx(w: WeekData, cases: Case[], userName: string, today: ISODate = todayISO()): Uint8Array {
  const cmap = new Map(cases.map((c) => [c.id, c]))
  const matter = (id?: string) => (id ? cmap.get(id)?.name || '' : 'General')
  const COLS = 10
  const header: Cell[] = ['Matter', 'Task', 'Assigned by', 'Assigned', 'Deadline given', 'Court / actual due', 'Status', 'Completed', 'On time', 'Notes'].map((v) => ({ v, s: 'header' as const }))
  const rows: Sheet['rows'] = [
    [{ v: `Weekly Task Report — ${userName}`, s: 'title' }],
    [{ v: `${w.label}   ·   Prepared ${fmtLong(today)}`, s: 'subtitle' }],
    [],
  ]
  const section = (title: string, list: Task[], done = false) => {
    rows.push([{ v: `${title} (${list.length})`, s: 'section' }, ...Array(COLS - 1).fill({ v: '', s: 'section' })])
    rows.push(header)
    if (!list.length) rows.push([{ v: 'None', s: 'muted' }])
    for (const t of list) {
      const isFU = t.kind === 'followup'
      const given = isFU ? t.nextFollowUp : t.givenDue
      const court = t.due
      const late = (d?: string) => !done && !!d && d < today
      const onTime = finishedOnTime(t)
      const notes = [
        t.kind !== 'task' ? TASK_KIND_LABEL[t.kind] : '',
        t.waitingOn ? `Waiting on ${t.waitingOn}` : '',
        isFU && t.nextFollowUp ? `Next nudge ${fmtMDY(t.nextFollowUp)}` : '',
        t.kind === 'summary' && t.target ? `Goal ${fmtMDY(t.target)}` : '',
        t.notes || '',
      ]
        .filter(Boolean)
        .join(' · ')
      rows.push([
        { v: matter(t.caseId), s: 'bold' },
        { v: t.title, s: 'wrap' },
        t.assignedBy || '',
        { v: t.assignedOn || '', date: true },
        { v: isFU ? '' : given || '', date: true, s: late(given) ? 'overdue' : 'date' },
        { v: court || '', date: true, s: late(court) ? 'overdue' : 'date' },
        STATUS_LABEL[t.status],
        { v: t.completedOn || '', date: true },
        onTime === undefined ? '' : onTime ? 'Yes' : { v: 'Late', s: 'overdue' },
        { v: notes, s: 'wrap' },
      ])
    }
    rows.push([])
  }
  section('Completed this week', w.completed, true)
  section('Open and in progress', w.open)
  section('Waiting on others', w.waiting)

  rows.push([{ v: `Depositions, hearings and meetings this week (${w.events.length})`, s: 'section' }, ...Array(COLS - 1).fill({ v: '', s: 'section' })])
  rows.push(['Matter', 'Event', 'Date', 'Time', 'Location'].map((v) => ({ v, s: 'header' as const })))
  if (!w.events.length) rows.push([{ v: 'None', s: 'muted' }])
  for (const e of w.events) rows.push([{ v: matter(e.caseId), s: 'bold' }, { v: e.title, s: 'wrap' }, { v: e.date, date: true }, e.time || '', e.location || ''])
  rows.push([])
  if (w.totalHours > 0) {
    rows.push([{ v: `Time logged this week: ${w.totalHours.toFixed(1)} hours`, s: 'section' }, ...Array(COLS - 1).fill({ v: '', s: 'section' })])
    rows.push([{ v: 'Matter', s: 'header' }, { v: 'Hours', s: 'header' }])
    for (const r of w.timeByCase) rows.push([{ v: matter(r.caseId), s: 'bold' }, { v: r.hours, s: 'hours' }])
  }
  return buildXlsx([
    {
      name: 'Weekly Report',
      widths: [15, 44, 14, 11, 13, 13, 15, 11, 8, 38],
      rows,
      freezeRows: 0,
      merges: ['A1:J1', 'A2:J2'],
      footer: `Weekly Task Report – ${w.label}`,
    },
  ])
}

export function weeklyEmailText(w: WeekData, cases: Case[], userName: string, today: ISODate = todayISO()): string {
  const cmap = new Map(cases.map((c) => [c.id, c]))
  const m = (id?: string) => (id ? cmap.get(id)?.name || 'General' : 'General')
  const L: string[] = [`Hi all — here's my update for the ${w.label.toLowerCase()}.`, '']
  const block = (title: string, list: Task[], done = false) => {
    L.push(`${title}:`)
    if (!list.length) L.push('  • None')
    for (const t of list) {
      const parts: string[] = []
      if (!done) {
        if (t.givenDue && t.kind !== 'followup') parts.push(`due${t.assignedBy ? ' to ' + t.assignedBy : ''} ${fmtMDY(t.givenDue)}${t.givenDue < today ? ', overdue' : ''}`)
        if (t.due) parts.push(`${t.givenDue ? 'court date' : 'due'} ${fmtMDY(t.due)}${!t.givenDue && t.due < today ? ', overdue' : ''}`)
      } else if (t.assignedBy) parts.push(`for ${t.assignedBy}`)
      const tail = parts.length ? ` (${parts.join('; ')})` : ''
      L.push(`  • ${m(t.caseId)} — ${t.title}${t.waitingOn && !done ? ` [waiting on ${t.waitingOn}]` : ''}${tail}`)
    }
    L.push('')
  }
  block('Completed this week', w.completed, true)
  const soon = w.open.filter((t) => {
    const d = effectiveDue(t)
    return !d || diffDays(d, today) <= 14
  })
  block('In progress / coming up', soon)
  block('Waiting on others', w.waiting)
  L.push('Details are in the attached spreadsheet.', '', userName.split(' ')[0] || '')
  return L.join('\n')
}

export function timeXlsx(entries: TimeEntry[], cases: Case[], from: ISODate, to: ISODate): Uint8Array {
  const cmap = new Map(cases.map((c) => [c.id, c]))
  const rows: Sheet['rows'] = [
    [{ v: 'Time Entries', s: 'title' }],
    [{ v: `${fmtMDY(from)} – ${fmtMDY(to)}`, s: 'subtitle' }],
    [],
    ['Date', 'Matter', 'File No.', 'Claim No.', 'Task', 'Activity', 'Hours', 'Narrative'].map((v) => ({ v, s: 'header' as const })),
  ]
  const sorted = entries.filter((e) => !e.deleted && e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date))
  let total = 0
  for (const e of sorted) {
    const c = e.caseId ? cmap.get(e.caseId) : undefined
    total += e.hours
    rows.push([
      { v: e.date, date: true },
      { v: c?.name || 'General', s: 'bold' },
      c?.fileNo || '',
      c?.claimNo || '',
      e.taskCode ? `${e.taskCode} ${codeLabel(e.taskCode)}` : '',
      e.activityCode ? `${e.activityCode} ${codeLabel(e.activityCode)}` : '',
      { v: e.hours, s: 'hours' },
      { v: e.narrative, s: 'wrap' },
    ])
  }
  rows.push([])
  rows.push(['', '', '', '', '', { v: 'Total', s: 'bold' }, { v: Math.round(total * 10) / 10, s: 'hours' }])
  return buildXlsx([
    {
      name: 'Time',
      widths: [11, 16, 12, 14, 30, 26, 8, 60],
      rows,
      freezeRows: 4,
      autoFilter: sorted.length ? `A4:H${4 + sorted.length}` : undefined,
      merges: ['A1:H1', 'A2:H2'],
      footer: `Time Entries ${fmtMDY(from)} – ${fmtMDY(to)}`,
    },
  ])
}
