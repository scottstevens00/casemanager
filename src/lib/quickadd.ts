// Turns a typed line like "Adams: draft RFP responses by Fri for Heidi !" into a task.

import { addDays, isISODate, todayISO, weekday, type ISODate } from './dates'
import type { Case, Priority } from './types'

export interface QuickParse {
  title: string
  caseId?: string
  due?: ISODate
  assignedBy?: string
  priority: Priority
  category?: string
  followUp?: boolean
  waitingOn?: string
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function parseDateWord(word: string, today: ISODate): ISODate | undefined {
  const w = word.toLowerCase().replace(/\.$/, '')
  if (w === 'today' || w === 'tod') return today
  if (w === 'tomorrow' || w === 'tmrw' || w === 'tom') return addDays(today, 1)
  const di = DAYS.findIndex((d) => w.startsWith(d))
  if (di >= 0 && /^(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(day|nesday|rsday|urday|sday)?$/.test(w)) {
    const cur = weekday(today)
    let delta = (di - cur + 7) % 7
    if (delta === 0) delta = 7
    return addDays(today, delta)
  }
  const md = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (md) {
    const m = Number(md[1])
    const d = Number(md[2])
    let y = md[3] ? Number(md[3]) : Number(today.slice(0, 4))
    if (y < 100) y += 2000
    let iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (!isISODate(iso)) return undefined
    if (!md[3] && iso < today) iso = `${y + 1}-${iso.slice(5)}`
    return iso
  }
  return undefined
}

export function parseQuickAdd(input: string, cases: Case[], today: ISODate = todayISO()): QuickParse {
  let s = ' ' + input.trim() + ' '
  let priority: Priority = 'normal'
  if (/\s!{1,3}(high)?\s/i.test(s) || /\burgent\b|\basap\b/i.test(s)) {
    priority = 'high'
    s = s.replace(/\s!{1,3}(high)?\s/i, ' ')
  }

  // Case: "Adams: ..." prefix or a case name anywhere
  let caseId: string | undefined
  const prefix = s.match(/^\s*([^:]{2,40}):\s/)
  const active = cases.filter((c) => !c.deleted && c.status !== 'closed')
  const byName = (name: string) =>
    active.find((c) => c.name.toLowerCase() === name.toLowerCase()) ||
    active.find((c) => c.name.toLowerCase().startsWith(name.toLowerCase()) && name.length >= 3)
  if (prefix) {
    const c = byName(prefix[1].trim())
    if (c) {
      caseId = c.id
      s = ' ' + s.slice(prefix[0].length)
    }
  }
  if (!caseId) {
    for (const c of [...active].sort((a, b) => b.name.length - a.name.length)) {
      const re = new RegExp(`\\s(?:re:?\\s+|in\\s+)?${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:'s)?\\s`, 'i')
      if (re.test(s)) {
        caseId = c.id
        s = s.replace(re, ' ')
        break
      }
    }
  }

  // Due date: "by Fri", "due 11/20", "on Monday", "in 3 days", "next week", or a trailing date word
  let due: ISODate | undefined
  const inN = s.match(/\s(?:due\s+|by\s+)?in\s+(\d+)\s+(day|days|week|weeks)\s/i)
  if (inN) {
    const n = Number(inN[1]) * (/week/i.test(inN[2]) ? 7 : 1)
    due = addDays(today, n)
    s = s.replace(inN[0], ' ')
  }
  if (!due) {
    const nextWeek = s.match(/\s(?:due\s+|by\s+)?next\s+week\s/i)
    if (nextWeek) {
      due = addDays(today, ((8 - weekday(today)) % 7 || 7))
      s = s.replace(nextWeek[0], ' ')
    }
  }
  if (!due) {
    const m = s.match(/\s(?:due|by|on|before)\s+(?:next\s+)?(\S+)\s/i)
    if (m) {
      const d = parseDateWord(m[1], today)
      if (d) {
        due = d
        s = s.replace(m[0], ' ')
      }
    }
  }
  if (!due) {
    const m = s.match(/\s(today|tomorrow|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s/i)
    if (m) {
      const d = parseDateWord(m[1], today)
      if (d) {
        due = d
        s = s.replace(m[0], ' ')
      }
    }
  }

  // Who assigned it: "for Heidi" / "from Saulius"
  let assignedBy: string | undefined
  const who = s.match(/\s(?:for|from|per)\s+([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+)?)\s/)
  if (who) {
    assignedBy = who[1]
    s = s.replace(who[0], ' ')
  }

  let title = s.replace(/\s+/g, ' ').trim()
  title = title.charAt(0).toUpperCase() + title.slice(1)

  // Follow-up phrasing: "follow up with X re ..." / "waiting on X"
  let followUp = false
  let waitingOn: string | undefined
  const wo = title.match(/^(?:waiting on|follow(?:\s|-)?up with)\s+([^,—-]+?)(?:\s+(?:re|about|on)\s+|\s*[,—-]\s*|$)/i)
  if (wo) {
    followUp = true
    waitingOn = wo[1].trim()
    const rest = title.slice(wo[0].length).trim()
    if (rest) title = rest.charAt(0).toUpperCase() + rest.slice(1)
  }

  const category = guessCategory(title)
  return { title, caseId, due, assignedBy, priority, category, followUp, waitingOn }
}

export function guessCategory(t: string): string | undefined {
  const s = t.toLowerCase()
  if (/depo|deposition/.test(s)) return 'Deposition'
  if (/expert|affidavit of merit|meritorious|amd\b/.test(s)) return 'Expert work'
  if (/interrog|rfp|rfa|request(s)? to|discovery|subpoena|disclosure|records/.test(s)) return 'Discovery'
  if (/motion|brief|answer|complaint|pleading|stipulat|order/.test(s)) return 'Pleading/Motion'
  if (/research|memo|case law/.test(s)) return 'Research/Memo'
  if (/report|adjuster|client|carrier|status/.test(s)) return 'Client/Adjuster report'
  if (/letter|email|call|qpo|correspond/.test(s)) return 'Correspondence'
  if (/trial|exhibit|witness list|jury/.test(s)) return 'Trial prep'
  return undefined
}
