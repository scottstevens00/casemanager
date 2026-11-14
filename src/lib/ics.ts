// Outlook calendar files (.ics). Each item keeps a stable UID so re-importing updates it.

import { addDays, type ISODate } from './dates'
import type { Case, CaseEvent, Task } from './types'
import { effectiveDue } from './taskdates'

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Lines longer than 75 octets must be folded (RFC 5545). */
function fold(line: string) {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) {
      out.push(cur)
      cur = ' ' + ch
    } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n')
}

const ymd = (d: ISODate) => d.replace(/-/g, '')
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')

function localStamp(d: ISODate, t: string) {
  return `${ymd(d)}T${t.replace(':', '')}00`
}

export interface IcsItem {
  uid: string
  summary: string
  description?: string
  date: ISODate
  time?: string
  durationMin?: number
  location?: string
  /** Minutes before start for the reminder. For all-day items, minutes before midnight. */
  alarmMin?: number
  busy?: boolean
}

export function buildIcs(items: IcsItem[], calName = 'Case Manager'): string {
  const L: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Case Manager//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-TIMEZONE:America/Detroit',
    'BEGIN:VTIMEZONE',
    'TZID:America/Detroit',
    'BEGIN:STANDARD',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'TZOFFSETFROM:-0400',
    'TZOFFSETTO:-0500',
    'TZNAME:EST',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0400',
    'TZNAME:EDT',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ]
  const dt = stamp()
  for (const it of items) {
    L.push('BEGIN:VEVENT')
    L.push(`UID:${it.uid}`)
    L.push(`DTSTAMP:${dt}`)
    L.push(`SEQUENCE:${Math.floor(Date.now() / 1000)}`)
    if (it.time) {
      const [h, m] = it.time.split(':').map(Number)
      const endMin = h * 60 + m + (it.durationMin ?? 60)
      const endDate = endMin >= 1440 ? addDays(it.date, 1) : it.date
      const em = endMin % 1440
      const endT = `${String(Math.floor(em / 60)).padStart(2, '0')}:${String(em % 60).padStart(2, '0')}`
      L.push(`DTSTART;TZID=America/Detroit:${localStamp(it.date, it.time)}`)
      L.push(`DTEND;TZID=America/Detroit:${localStamp(endDate, endT)}`)
    } else {
      L.push(`DTSTART;VALUE=DATE:${ymd(it.date)}`)
      L.push(`DTEND;VALUE=DATE:${ymd(addDays(it.date, 1))}`)
    }
    L.push(fold(`SUMMARY:${esc(it.summary)}`))
    if (it.description) L.push(fold(`DESCRIPTION:${esc(it.description)}`))
    if (it.location) L.push(fold(`LOCATION:${esc(it.location)}`))
    L.push(`TRANSP:${it.busy ? 'OPAQUE' : 'TRANSPARENT'}`)
    L.push(`X-MICROSOFT-CDO-BUSYSTATUS:${it.busy ? 'BUSY' : 'FREE'}`)
    if (it.alarmMin !== undefined) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(it.summary)}`), `TRIGGER:-PT${it.alarmMin}M`, 'END:VALARM')
    }
    L.push('END:VEVENT')
  }
  L.push('END:VCALENDAR')
  return L.join('\r\n') + '\r\n'
}

const caseTag = (c?: Case) => (c ? `[${c.name}] ` : '')

export function taskToIcs(t: Task, c?: Case): IcsItem | undefined {
  const date = effectiveDue(t)
  if (!date) return undefined
  const prefix = t.kind === 'followup' ? 'Follow up: ' : t.kind === 'summary' ? 'Summary due: ' : t.givenDue && date === t.givenDue ? `Due${t.assignedBy ? ' to ' + t.assignedBy : ''}: ` : 'Due: '
  const desc = [
    c?.caption,
    t.assignedBy ? `Assigned by ${t.assignedBy}${t.assignedOn ? ' on ' + t.assignedOn : ''}` : '',
    t.givenDue ? `Deadline given: ${t.givenDue}` : '',
    t.due && t.kind !== 'followup' ? `Court / actual due date: ${t.due}` : '',
    t.kind === 'summary' && t.target ? `Goal date: ${t.target}` : '',
    t.waitingOn ? `Waiting on: ${t.waitingOn}` : '',
    t.notes,
    t.rule,
    'From Case Manager',
  ]
    .filter(Boolean)
    .join('\n')
  return {
    uid: `task-${t.id}@casemanager`,
    summary: `${prefix}${caseTag(c)}${t.title}`,
    description: desc,
    date,
    time: t.dueTime,
    // All-day: remind at 8:30 AM the day before (15.5 hours before midnight).
    alarmMin: t.dueTime ? 60 : 930,
  }
}

export function eventToIcs(e: CaseEvent, c?: Case): IcsItem {
  return {
    uid: `event-${e.id}@casemanager`,
    summary: `${caseTag(c)}${e.title}`,
    description: [c?.caption, e.notes, 'From Case Manager'].filter(Boolean).join('\n'),
    date: e.date,
    time: e.time,
    durationMin: e.kind === 'trial' ? 480 : e.kind === 'deposition' ? 180 : 60,
    location: e.location,
    alarmMin: e.time ? 60 : 930,
    busy: !!e.time,
  }
}
