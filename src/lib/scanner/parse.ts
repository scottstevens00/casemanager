// Rule-based reader for scheduling orders: finds every date and the label next to it.
// Works with no AI at all; the on-device AI (when available) adds to these results.

import { addDays, isISODate, todayISO, type ISODate } from '../dates'
import type { EventKind } from '../types'

export interface Found {
  id: string
  label: string
  date: ISODate
  time?: string
  type: 'deadline' | 'event'
  eventKind?: EventKind
  include: boolean
  source: 'text' | 'ai' | 'computed' | 'ocr'
  line?: string
  note?: string
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const MONTH_RE = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
const RE_NAMED = new RegExp(`(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\\s+)?${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'gi')
const RE_DAYOF = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+day\\s+of\\s+${MONTH_RE},?\\s+(\\d{4})`, 'gi')
const RE_NUM = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g
const RE_TIME = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)/i

function iso(y: number, m: number, d: number): ISODate | undefined {
  if (y < 100) y += 2000
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return isISODate(s) ? s : undefined
}

interface DateHit {
  date: ISODate
  start: number
  end: number
}

export function findDates(line: string): DateHit[] {
  const hits: DateHit[] = []
  const taken = (s: number, e: number) => hits.some((h) => s < h.end && e > h.start)
  for (const m of line.matchAll(RE_DAYOF)) {
    const d = iso(Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]))
    if (d) hits.push({ date: d, start: m.index!, end: m.index! + m[0].length })
  }
  for (const m of line.matchAll(RE_NAMED)) {
    if (taken(m.index!, m.index! + m[0].length)) continue
    const d = iso(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]))
    if (d) hits.push({ date: d, start: m.index!, end: m.index! + m[0].length })
  }
  for (const m of line.matchAll(RE_NUM)) {
    if (taken(m.index!, m.index! + m[0].length)) continue
    const d = iso(Number(m[3]), Number(m[1]), Number(m[2]))
    if (d) hits.push({ date: d, start: m.index!, end: m.index! + m[0].length })
  }
  return hits.sort((a, b) => a.start - b.start)
}

function parseTime(s: string): string | undefined {
  const m = s.match(RE_TIME)
  if (!m) return undefined
  let h = Number(m[1])
  const min = Number(m[2] || 0)
  const pm = /p/i.test(m[3])
  if (h === 12) h = pm ? 12 : 0
  else if (pm) h += 12
  if (h > 23 || min > 59) return undefined
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function cleanLabel(s: string): string {
  let x = s
    .replace(RE_TIME, ' ')
    .replace(/[_.·•…]{2,}/g, ' ')
    .replace(/^[\s\d.)(:•*-]+/, '')
    .replace(/[\s:,;-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  for (let i = 0; i < 3; i++) x = x.replace(/\s+(at|on or before|no later than|not later than|by|on|due on|shall be|must be|is|are|will be|set for|scheduled for)$/i, '').trim()
  // "Plaintiff's witness list shall be filed by" -> "Plaintiff's witness list due"
  x = x.replace(/\s+(?:shall|must|will|is to|are to)\s+(?:be\s+)?(filed|served|exchanged|submitted|produced|completed|closed|heard|held|conducted|taken|identified|named)(?:\s+(?:and\s+\w+\s+)?(?:by|on|before|on or before|no later than|not later than))?$/i, (_m, v: string) => {
    const w = v.toLowerCase()
    if (/completed|closed/.test(w)) return ' closes'
    if (/heard/.test(w)) return ' heard by'
    if (/held|conducted|taken/.test(w)) return ' completed by'
    return ' due'
  })
  return x.replace(/[\s:,;-]+$/, '').trim()
}

const EXCLUDE = /\b(dated|date of (this )?order|entered|signed|issued|date filed|filed on|hon\.?|circuit (court )?judge|proof of service|served on|mailed on|p\d{5}|clerk)\b/i

export function classify(label: string): { type: 'deadline' | 'event'; eventKind?: EventKind } {
  const s = label.toLowerCase()
  const isDoc = /(list|brief|summary|statement|report|motion|exhibit|instruction|order|disclos|witness|cut-?off|close|complete|filed|served|exchange|due)/.test(s)
  if (/case evaluation|mediation tribunal/.test(s) && !/summary|statement|fee/.test(s)) return { type: 'event', eventKind: 'case_eval' }
  if (/(facilitation|mediation)/.test(s) && !/(complete|completed|by|deadline|statement)/.test(s)) return { type: 'event', eventKind: 'facilitation' }
  if (/(settlement|status|pre-?trial|scheduling|calendar|docket) (conference|call)|conference\b/.test(s) && !/(statement|order)\s*(due|filed)?$/.test(s)) return { type: 'event', eventKind: 'conference' }
  if (/\btrial\b/.test(s) && !isDoc) return { type: 'event', eventKind: 'trial' }
  if (/\bhearing\b/.test(s) && !/(brief|motion).*(due|filed)/.test(s)) return { type: 'event', eventKind: 'hearing' }
  return { type: 'deadline' }
}

let n = 0
const nid = () => `f${Date.now().toString(36)}${(n++).toString(36)}`

export function parseScheduleText(text: string, today: ISODate = todayISO(), source: Found['source'] = 'text'): Found[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
  const out: Found[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const hits = findDates(line)
    if (!hits.length) continue
    // Text between dates on the same line gives each date its own label (table rows).
    hits.forEach((h, k) => {
      const before = line.slice(k === 0 ? 0 : hits[k - 1].end, h.start)
      const after = line.slice(h.end, k + 1 < hits.length ? hits[k + 1].start : undefined)
      let label = cleanLabel(before)
      if (label.replace(/[^a-z]/gi, '').length < 5) label = cleanLabel(after) || label
      if (label.replace(/[^a-z]/gi, '').length < 5) {
        // Look upward for the label (labels often sit on the line above the date).
        for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
          if (findDates(lines[j]).length) break
          const cand = cleanLabel(lines[j])
          if (cand.replace(/[^a-z]/gi, '').length >= 5) {
            label = cand
            break
          }
        }
      }
      if (!label) label = 'Date from order'
      if (label.length > 110) label = label.slice(0, 107).replace(/\s\S*$/, '') + '…'
      const time = parseTime(after) || parseTime(line)
      const cls = classify(label)
      const excluded = EXCLUDE.test(line) || EXCLUDE.test(label)
      out.push({
        id: nid(),
        label: label.charAt(0).toUpperCase() + label.slice(1),
        date: h.date,
        time: cls.type === 'event' ? time : undefined,
        ...cls,
        include: !excluded && h.date >= today,
        source,
        line,
        note: excluded ? 'Looks like the order’s own date or a signature line' : h.date < today ? 'Date is in the past' : undefined,
      })
    })
  }

  // Relative deadlines: "Witness lists shall be filed 90 days before trial"
  const anchors = out.filter((f) => f.type === 'event')
  for (const line of lines) {
    if (findDates(line).length) continue
    const m = line.match(/(\d{1,3})\s+days?\s+(before|prior to|after|following)\s+(?:the\s+)?(trial|final pre-?trial conference|settlement conference|case evaluation|facilitation|pre-?trial conference)/i)
    if (!m) continue
    const anchorWord = m[3].toLowerCase()
    const anchor = anchors.find((a) => a.label.toLowerCase().includes(anchorWord.split(' ')[0]))
    if (!anchor) continue
    const days = Number(m[1]) * (/before|prior/i.test(m[2]) ? -1 : 1)
    const label = cleanLabel(line.slice(0, m.index)) || cleanLabel(line)
    out.push({
      id: nid(),
      label: (label || 'Deadline').slice(0, 110),
      date: addDays(anchor.date, days),
      type: 'deadline',
      include: true,
      source: 'computed',
      line,
      note: `${Math.abs(days)} days ${days < 0 ? 'before' : 'after'} ${anchor.label} (${anchor.date})`,
    })
  }
  return dedupe(out)
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

export function dedupe(items: Found[]): Found[] {
  const out: Found[] = []
  for (const it of items) {
    const dup = out.find((o) => o.date === it.date && (norm(o.label).includes(norm(it.label).slice(0, 12)) || norm(it.label).includes(norm(o.label).slice(0, 12))))
    if (dup) {
      if (dup.source !== 'text' && it.source === 'text') Object.assign(dup, { ...it, id: dup.id })
      continue
    }
    out.push(it)
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Pulls case number / judge from the order header when present. */
export function headerInfo(text: string): { caseNo?: string; judge?: string } {
  const caseNo = text.match(/\b(\d{2}-\d{4,7}-[A-Z]{2})\b/)?.[1] || text.match(/Case No\.?:?\s*([A-Z0-9-]{6,})/i)?.[1]
  const judge = text.match(/Hon(?:orable)?\.?[ \t]+([A-Z][A-Za-z.]+(?:[ \t]+[A-Z]\.?)?(?:[ \t]+[A-Z][A-Za-z'-]+)+)/)?.[1]
  return { caseNo, judge }
}
