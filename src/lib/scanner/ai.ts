// On-device AI through Chrome's built-in Gemini Nano (the Prompt API).
// Everything runs inside Chrome on this computer; the document is never sent anywhere.

import { isISODate } from '../dates'
import type { Found } from './parse'
import { classify } from './parse'

export type AiStatus = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available'

interface LMSession {
  prompt: (input: unknown, opts?: { responseConstraint?: unknown; signal?: AbortSignal }) => Promise<string>
  destroy: () => void
  inputQuota?: number
  contextWindow?: number
}

interface LMStatic {
  availability: (opts?: unknown) => Promise<string>
  create: (opts?: unknown) => Promise<LMSession>
}

function api(): LMStatic | undefined {
  const g = globalThis as unknown as { LanguageModel?: LMStatic }
  return g.LanguageModel
}

const TEXT_OPTS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }
const IMAGE_OPTS = { expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }

export async function aiStatus(withImages = false): Promise<AiStatus> {
  const lm = api()
  if (!lm) return 'unsupported'
  try {
    return (await lm.availability(withImages ? IMAGE_OPTS : TEXT_OPTS)) as AiStatus
  } catch {
    return 'unavailable'
  }
}

/** Downloads Chrome's on-device model if needed. Must be called from a button click. */
export async function prepareAi(onProgress?: (frac: number) => void): Promise<boolean> {
  const lm = api()
  if (!lm) return false
  try {
    const s = await lm.create({
      ...TEXT_OPTS,
      monitor(m: EventTarget) {
        m.addEventListener('downloadprogress', (e) => onProgress?.((e as unknown as { loaded: number }).loaded))
      },
    })
    s.destroy()
    return true
  } catch {
    return false
  }
}

const SYSTEM = `You read Michigan court scheduling orders for a defense attorney.
List every date in the order that is a deadline or a scheduled event: witness lists, expert disclosures, discovery cutoff, dispositive motion deadlines, motions in limine, case evaluation, facilitation or mediation, settlement conference, final pretrial conference, joint final pretrial order, exhibit lists, trial, and anything similar.
For each one give: label (short, as the order describes it), date as YYYY-MM-DD, time as HH:MM 24-hour if a time is stated, and type: "event" for hearings, conferences, case evaluation, facilitation and trial; "deadline" for anything that must be filed, served, exchanged or completed by a date.
If a deadline is stated relative to another date (for example "28 days before trial"), compute the actual date.
Skip the date the order was signed or entered. Do not invent dates that are not in the order.`

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          type: { type: 'string', enum: ['deadline', 'event'] },
        },
        required: ['label', 'date', 'type'],
      },
    },
  },
  required: ['items'],
}

interface AiItem {
  label: string
  date: string
  time?: string
  type: 'deadline' | 'event'
}

let n = 0
const toFound = (it: AiItem, note?: string): Found | undefined => {
  if (!it?.label || !isISODate(it.date)) return undefined
  const cls = classify(it.label)
  const type = it.type === 'event' || it.type === 'deadline' ? it.type : cls.type
  return {
    id: `ai${Date.now().toString(36)}${(n++).toString(36)}`,
    label: it.label.trim().slice(0, 110),
    date: it.date,
    time: /^\d{2}:\d{2}$/.test(it.time || '') && type === 'event' ? it.time : undefined,
    type,
    eventKind: type === 'event' ? cls.eventKind || 'other' : undefined,
    include: true,
    source: 'ai',
    note,
  }
}

function chunks(text: string, size = 5000): string[] {
  const out: string[] = []
  let cur = ''
  for (const para of text.split(/\n/)) {
    if ((cur + '\n' + para).length > size && cur) {
      out.push(cur)
      cur = ''
    }
    cur += (cur ? '\n' : '') + para
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** Reads order text with the on-device model. Returns [] if the model isn't ready. */
export async function aiExtractFromText(text: string, signal?: AbortSignal): Promise<Found[]> {
  const lm = api()
  if (!lm || (await aiStatus()) !== 'available') return []
  const session = await lm.create({ ...TEXT_OPTS, initialPrompts: [{ role: 'system', content: SYSTEM }] })
  const found: Found[] = []
  try {
    for (const part of chunks(text)) {
      const raw = await session.prompt(`Scheduling order text:\n"""\n${part}\n"""\nReturn the JSON.`, { responseConstraint: SCHEMA, signal })
      const parsed = safeParse(raw)
      for (const it of parsed) {
        const f = toFound(it)
        if (f) found.push(f)
      }
    }
  } finally {
    session.destroy()
  }
  return found
}

/** Reads scanned page images with the on-device model (multimodal). */
export async function aiExtractFromImages(images: (HTMLCanvasElement | Blob)[], signal?: AbortSignal): Promise<Found[]> {
  const lm = api()
  if (!lm || (await aiStatus(true)) !== 'available') return []
  const session = await lm.create({ ...IMAGE_OPTS, initialPrompts: [{ role: 'system', content: SYSTEM }] })
  const found: Found[] = []
  try {
    for (const img of images) {
      const raw = await session.prompt(
        [{ role: 'user', content: [{ type: 'text', value: 'This is one page of a scheduling order. Return the JSON.' }, { type: 'image', value: img }] }],
        { responseConstraint: SCHEMA, signal },
      )
      for (const it of safeParse(raw)) {
        const f = toFound(it, 'Read from a scanned page by AI — double-check')
        if (f) found.push(f)
      }
    }
  } finally {
    session.destroy()
  }
  return found
}

function safeParse(raw: string): AiItem[] {
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''))
    return Array.isArray(j?.items) ? j.items : []
  } catch {
    return []
  }
}

/** Uses the model to turn a typed sentence into a task, when available. */
export async function aiQuickParse(sentence: string, caseNames: string[], todayIso: string): Promise<Record<string, string> | undefined> {
  const lm = api()
  if (!lm || (await aiStatus()) !== 'available') return undefined
  const session = await lm.create({
    ...TEXT_OPTS,
    initialPrompts: [
      {
        role: 'system',
        content: `Turn a lawyer's note into a task. Today is ${todayIso}. Known cases: ${caseNames.join(', ') || 'none'}. Return JSON with: title (imperative, short), case (one of the known cases or empty), due (YYYY-MM-DD or empty), assignedBy (person who gave the assignment or empty), priority (high/normal).`,
      },
    ],
  })
  try {
    const raw = await session.prompt(sentence, {
      responseConstraint: {
        type: 'object',
        properties: { title: { type: 'string' }, case: { type: 'string' }, due: { type: 'string' }, assignedBy: { type: 'string' }, priority: { type: 'string', enum: ['high', 'normal'] } },
        required: ['title'],
      },
    })
    return JSON.parse(raw)
  } catch {
    return undefined
  } finally {
    session.destroy()
  }
}
