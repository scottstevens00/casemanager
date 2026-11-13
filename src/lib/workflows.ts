// "Log what happened" workflows: one event in a case creates the tasks and deadlines that follow from it.
// Every generated item is shown for review before anything is saved.

import { addBusinessDays, fmtLong, todayISO, type DayRules, type ISODate } from './dates'
import { describeComputation, ruleById } from './rules'
import type { CaseEvent, EventKind, Settings, Task } from './types'

export interface WorkflowField {
  key: string
  label: string
  type: 'date' | 'text' | 'time' | 'select' | 'checkbox' | 'number' | 'person'
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
  help?: string
  showIf?: (v: Record<string, string>) => boolean
}

export interface Draft {
  key: string
  include: boolean
  /** 'complete' marks an existing checklist task done (e.g. the answer, once it's filed). */
  type: 'task' | 'event' | 'complete'
  task?: Partial<Task>
  event?: Partial<CaseEvent>
  /** Matching open task in the case (same wfKey): the draft updates it instead of adding a duplicate. */
  updateId?: string
  /** For 'complete' drafts: the checklist step to mark done. */
  wfKey?: string
}

export interface WorkflowContext {
  settings: Settings
  rules: DayRules
  caseType?: string
}

export interface Workflow {
  id: string
  title: string
  blurb: string
  fields: WorkflowField[]
  defaults?: (ctx: WorkflowContext) => Record<string, string>
  build: (v: Record<string, string>, ctx: WorkflowContext) => Draft[]
}

const computed = (ruleId: string, trigger: ISODate, opts: Record<string, string>, rules: DayRules, trigger2?: ISODate) => {
  const rule = ruleById(ruleId)!
  const c = rule.compute(trigger, opts, rules, trigger2)
  return { date: c.date, rule: describeComputation(rule, c) }
}

const isMedMal = (t?: string) => !!t && /med|malpractice|nh\b/i.test(t)

export const WORKFLOWS: Workflow[] = [
  {
    id: 'new_case',
    title: 'New case assigned',
    blurb: 'Your second-chair checklist: SOL memo, answer, IDS, discovery requests, QPO, AOMD and MILs, with the deadlines worked out.',
    fields: [
      { key: 'assignedOn', label: 'Date assigned to you', type: 'date', required: true },
      { key: 'assignedBy', label: 'Assigned by', type: 'person', placeholder: 'e.g. the first chair' },
      { key: 'servedOn', label: 'Date the complaint was served on our client', type: 'date', help: 'Leave blank if you don’t know yet — the answer task will be added without a date.' },
      {
        key: 'method',
        label: 'How was it served?',
        type: 'select',
        options: [
          { value: 'personal', label: 'Personally, in Michigan (21 days)' },
          { value: 'mail', label: 'Outside Michigan, or by registered mail (28 days)' },
        ],
        showIf: (v) => !!v.servedOn,
      },
      { key: 'medmal', label: 'Medical malpractice case (adds the AOMD)', type: 'checkbox' },
      {
        key: 'aomFiled',
        label: 'Date plaintiff filed the affidavit of merit',
        type: 'date',
        help: 'Usually filed with the complaint.',
        showIf: (v) => v.medmal === '1',
      },
      { key: 'trial', label: 'Trial date, if already set', type: 'date', help: 'Usually not known yet. Scanning the scheduling order later fills in the MIL date.' },
    ],
    defaults: (ctx) => ({ method: 'personal', medmal: isMedMal(ctx.caseType) ? '1' : '', assignedOn: todayISO() }),
    build: (v, ctx) => {
      const out: Draft[] = []
      const who = v.assignedBy || undefined
      const ans = v.servedOn ? computed('answer', v.servedOn, { method: v.method }, ctx.rules) : undefined
      // SOL memo: 5 business days after assignment, but before the answer is due.
      let solDue = addBusinessDays(v.assignedOn, 5, ctx.rules)
      if (ans && solDue > ans.date) solDue = addBusinessDays(ans.date, -2, ctx.rules)
      if (solDue < v.assignedOn) solDue = v.assignedOn
      const base = { assignedBy: who, assignedOn: v.assignedOn, priority: 'high' as const }
      out.push({
        key: 'sol_memo',
        include: true,
        type: 'task',
        task: { ...base, title: 'SOL memo', kind: 'task', category: 'Research/Memo', due: solDue, wfKey: 'sol_memo', notes: 'Default: 5 business days after assignment and before the answer is due. Change it to fit the case.' },
      })
      out.push({
        key: 'answer',
        include: true,
        type: 'task',
        task: {
          ...base,
          title: 'Answer and affirmative defenses',
          kind: 'deadline',
          category: 'Pleading/Motion',
          due: ans?.date,
          rule: ans?.rule,
          wfKey: 'answer',
          notes: 'Affirmative defenses go in the responsive pleading (MCR 2.111(F)(3)).' + (ans ? '' : ' Add the due date once you know when the complaint was served.'),
        },
      })
      const sameDay = ans?.date
      const sameDayNote = 'Goes out the same day as the answer.'
      out.push({
        key: 'ids',
        include: true,
        type: 'task',
        task: {
          ...base,
          title: 'Initial disclosures (IDS)',
          kind: 'deadline',
          category: 'Discovery',
          due: sameDay,
          wfKey: 'ids',
          notes: `${sameDayNote} We can serve discovery only after serving our initial disclosures (MCR 2.301(A)(1)). The rule's outer limit is the later of 28 days after the answer or 14 days after plaintiff's disclosures are due (MCR 2.302(A)(5)(b)(ii)).`,
        },
      })
      out.push({
        key: 'disco',
        include: true,
        type: 'task',
        task: { ...base, title: 'Discovery requests to plaintiff (interrogatories, requests to produce, requests to admit)', kind: 'task', category: 'Discovery', due: sameDay, wfKey: 'disco', notes: sameDayNote },
      })
      out.push({
        key: 'qpo',
        include: true,
        type: 'task',
        task: { ...base, title: "Stipulated QPO with cover letter and email to plaintiff's counsel", kind: 'task', category: 'Correspondence', due: sameDay, wfKey: 'qpo', notes: sameDayNote + ' Log the send with “Letter or email sent” — or log “Answer filed” — to start the follow-up.' },
      })
      if (v.medmal === '1') {
        const amd = v.aomFiled ? computed('amd', v.aomFiled, {}, ctx.rules) : undefined
        out.push({
          key: 'amd',
          include: true,
          type: 'task',
          task: {
            ...base,
            title: 'Affidavit of meritorious defense (AOMD)',
            kind: 'deadline',
            category: 'Expert work',
            due: amd?.date,
            rule: amd?.rule,
            wfKey: 'amd',
            notes: amd ? undefined : 'Due 91 days after plaintiff files the affidavit of merit (MCL 600.2912e(1)). Add the date when you have it.',
          },
        })
      }
      const mil = v.trial ? computed('custom_before', v.trial, { n: '28' }, ctx.rules) : undefined
      out.push({
        key: 'mil',
        include: true,
        type: 'task',
        task: {
          ...base,
          priority: 'normal',
          title: 'Motions in limine (MILs)',
          kind: 'deadline',
          category: 'Trial prep',
          due: mil?.date,
          rule: mil ? mil.rule + ' Placeholder of 28 days before trial — use the scheduling order’s MIL date.' : undefined,
          wfKey: 'mil',
          notes: 'The date comes from the scheduling order. Scanning the order fills it in automatically.',
        },
      })
      return out
    },
  },
  {
    id: 'answer_filed',
    title: 'Answer filed',
    blurb: 'Same-day discovery and stipulated QPO, the QPO follow-up, and initial-disclosure dates.',
    fields: [{ key: 'answeredOn', label: 'Date the answer was filed', type: 'date', required: true }],
    build: (v, ctx) => {
      const d = v.answeredOn
      const fu = addBusinessDays(d, ctx.settings.followUpBusinessDays, ctx.rules)
      const ours = computed('disclosures_def', d, {}, ctx.rules)
      const theirs = computed('disclosures_pl', d, {}, ctx.rules)
      const discResp = computed('disc_response', d, {}, ctx.rules)
      return [
        { key: 'answer_done', include: true, type: 'complete', wfKey: 'answer', task: { title: 'Mark “Answer and affirmative defenses” done' } },
        {
          key: 'disclosures',
          include: true,
          type: 'task',
          task: {
            title: 'Initial disclosures (IDS)',
            kind: 'deadline',
            category: 'Discovery',
            priority: 'high',
            due: d,
            wfKey: 'ids',
            rule: ours.rule,
            notes: `Goes out with the answer and discovery: we can seek discovery only after serving our initial disclosures (MCR 2.301(A)(1)). Outer limit under the rule: ${fmtLong(ours.date)}.`,
          },
        },
        {
          key: 'discovery',
          include: true,
          type: 'task',
          task: {
            title: 'Discovery requests to plaintiff (interrogatories, requests to produce, requests to admit)',
            kind: 'task',
            wfKey: 'disco',
            category: 'Discovery',
            priority: 'high',
            due: d,
            notes: 'Goes out the same day as the answer.',
          },
        },
        {
          key: 'qpo',
          include: true,
          type: 'task',
          task: {
            title: "Stipulated QPO with cover letter and email to plaintiff's counsel",
            kind: 'task',
            wfKey: 'qpo',
            category: 'Correspondence',
            priority: 'high',
            due: d,
            notes: 'Goes out the same day as discovery.',
          },
        },
        {
          key: 'qpo_followup',
          include: true,
          type: 'task',
          task: {
            title: "Signed stipulated QPO back from plaintiff's counsel",
            kind: 'followup',
            wfKey: 'qpo_followup',
            category: 'Correspondence',
            priority: 'normal',
            status: 'waiting',
            waitingOn: "Plaintiff's counsel",
            sentOn: d,
            sentVia: 'letter+email',
            nextFollowUp: fu,
            rule: `Follow up ${ctx.settings.followUpBusinessDays} business days after sending (${fmtLong(fu)}).`,
          },
        },
        {
          key: 'pl_disclosures',
          include: true,
          type: 'task',
          task: {
            title: "Plaintiff's initial disclosures due",
            kind: 'followup',
            category: 'Discovery',
            priority: 'normal',
            status: 'waiting',
            waitingOn: 'Plaintiff',
            due: theirs.date,
            nextFollowUp: theirs.date,
            rule: theirs.rule,
          },
        },
        {
          key: 'pl_discovery',
          include: true,
          type: 'task',
          task: {
            title: "Plaintiff's answers to our discovery due",
            kind: 'followup',
            category: 'Discovery',
            priority: 'normal',
            status: 'waiting',
            waitingOn: 'Plaintiff',
            due: discResp.date,
            nextFollowUp: discResp.date,
            rule: discResp.rule + ' Assumes our discovery is served the day the answer is filed; change the date if not.',
          },
        },
      ]
    },
  },
  {
    id: 'deposition',
    title: 'Deposition or meeting',
    blurb: 'Puts it on the calendar and starts the summary clock (10-business-day goal, 30 hard).',
    fields: [
      {
        key: 'kind',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'deposition', label: 'Deposition' },
          { value: 'meeting', label: 'Meeting' },
          { value: 'hearing', label: 'Hearing' },
          { value: 'other', label: 'Other' },
        ],
      },
      { key: 'name', label: 'Deponent / meeting name', type: 'text', required: true, placeholder: 'e.g. Dr. Smith' },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'time', label: 'Time', type: 'time' },
      { key: 'location', label: 'Location / Zoom', type: 'text' },
      { key: 'summary', label: 'Summary report needed', type: 'checkbox' },
    ],
    defaults: () => ({ kind: 'deposition', summary: '1' }),
    build: (v, ctx) => {
      const kindLabel = v.kind === 'deposition' ? 'Deposition' : v.kind === 'meeting' ? 'Meeting' : v.kind === 'hearing' ? 'Hearing' : 'Event'
      const title = v.kind === 'deposition' ? `Deposition of ${v.name}` : `${v.name}`
      const out: Draft[] = [
        {
          key: 'event',
          include: true,
          type: 'event',
          event: { title, kind: (v.kind || 'other') as EventKind, date: v.date, time: v.time || undefined, location: v.location || undefined },
        },
      ]
      if (v.summary === '1') {
        const target = addBusinessDays(v.date, ctx.settings.summaryTargetDays, ctx.rules)
        const hard = addBusinessDays(v.date, ctx.settings.summaryHardDays, ctx.rules)
        out.push({
          key: 'summary',
          include: true,
          type: 'task',
          task: {
            title: `${kindLabel} summary report — ${v.name}`,
            kind: 'summary',
            category: v.kind === 'deposition' ? 'Deposition' : 'Client/Adjuster report',
            priority: 'normal',
            target,
            due: hard,
            rule: `Goal: ${ctx.settings.summaryTargetDays} business days after (${fmtLong(target)}). Hard deadline: ${ctx.settings.summaryHardDays} business days after (${fmtLong(hard)}). Weekends and court holidays skipped.`,
          },
        })
      }
      return out
    },
  },
  {
    id: 'letter_sent',
    title: 'Letter or email sent — waiting on a reply',
    blurb: `Reminds you to follow up until the loop is closed.`,
    fields: [
      { key: 'what', label: 'What was sent', type: 'text', required: true, placeholder: 'e.g. Stipulated QPO letter' },
      { key: 'to', label: 'Waiting on', type: 'person', required: true, placeholder: "e.g. Plaintiff's counsel" },
      { key: 'sentOn', label: 'Date sent', type: 'date', required: true },
      {
        key: 'via',
        label: 'Sent by',
        type: 'select',
        options: [
          { value: 'letter+email', label: 'Letter and email' },
          { value: 'letter', label: 'Letter' },
          { value: 'email', label: 'Email' },
          { value: 'call', label: 'Call / voicemail' },
        ],
      },
      { key: 'days', label: 'Follow up after (business days)', type: 'number' },
    ],
    defaults: (ctx) => ({ via: 'email', days: String(ctx.settings.followUpBusinessDays) }),
    build: (v, ctx) => {
      const n = Number(v.days) || ctx.settings.followUpBusinessDays
      const next = addBusinessDays(v.sentOn, n, ctx.rules)
      return [
        {
          key: 'followup',
          include: true,
          type: 'task',
          task: {
            title: v.what,
            kind: 'followup',
            category: 'Correspondence',
            priority: 'normal',
            status: 'waiting',
            waitingOn: v.to,
            sentOn: v.sentOn,
            sentVia: (v.via || 'email') as Task['sentVia'],
            nextFollowUp: next,
            rule: `Follow up ${n} business days after sending (${fmtLong(next)}).`,
          },
        },
      ]
    },
  },
  {
    id: 'discovery_received',
    title: 'Discovery served on us',
    blurb: 'Response deadlines for interrogatories, requests to produce and requests to admit.',
    fields: [
      { key: 'servedOn', label: 'Date served on us', type: 'date', required: true },
      { key: 'rogs', label: 'Interrogatories', type: 'checkbox' },
      { key: 'rfp', label: 'Requests to produce', type: 'checkbox' },
      { key: 'rfa', label: 'Requests to admit', type: 'checkbox' },
      { key: 'withComplaint', label: 'Served with the summons and complaint', type: 'checkbox' },
      { key: 'complaintServed', label: 'Date the complaint was served', type: 'date', showIf: (v) => v.withComplaint === '1' },
    ],
    defaults: () => ({ rogs: '1', rfp: '1', rfa: '' }),
    build: (v, ctx) => {
      const out: Draft[] = []
      const def = v.withComplaint === '1' && v.complaintServed
      const base = def
        ? computed('disc_response_def', v.servedOn, {}, ctx.rules, v.complaintServed)
        : computed('disc_response', v.servedOn, {}, ctx.rules)
      const parts = [v.rogs === '1' && 'interrogatories', v.rfp === '1' && 'requests to produce'].filter(Boolean)
      if (parts.length)
        out.push({
          key: 'resp',
          include: true,
          type: 'task',
          task: {
            title: `Answer plaintiff's ${parts.join(' and ')}`,
            kind: 'deadline',
            category: 'Discovery',
            priority: 'high',
            due: base.date,
            rule: base.rule,
          },
        })
      if (v.rfa === '1') {
        const rfa = computed('disc_response', v.servedOn, {}, ctx.rules)
        out.push({
          key: 'rfa',
          include: true,
          type: 'task',
          task: {
            title: "Answer plaintiff's requests to admit (deemed admitted if late)",
            kind: 'deadline',
            category: 'Discovery',
            priority: 'high',
            due: rfa.date,
            rule: rfa.rule,
          },
        })
      }
      return out
    },
  },
  {
    id: 'motion_hearing',
    title: 'Motion hearing scheduled',
    blurb: 'Briefing deadlines counted back from the hearing.',
    fields: [
      { key: 'title', label: 'Motion', type: 'text', required: true, placeholder: 'e.g. Motion for summary disposition' },
      { key: 'date', label: 'Hearing date', type: 'date', required: true },
      { key: 'time', label: 'Time', type: 'time' },
      {
        key: 'side',
        label: 'Whose motion?',
        type: 'select',
        options: [
          { value: 'ours', label: 'Ours' },
          { value: 'theirs', label: 'Opposing party' },
        ],
      },
      { key: 'dispositive', label: 'Summary disposition (MCR 2.116)', type: 'checkbox' },
    ],
    defaults: () => ({ side: 'ours', dispositive: '1' }),
    build: (v, ctx) => {
      const out: Draft[] = [
        { key: 'event', include: true, type: 'event', event: { title: `Hearing: ${v.title}`, kind: 'hearing', date: v.date, time: v.time || undefined } },
      ]
      const add = (key: string, title: string, ruleId: string, opts: Record<string, string> = {}, include = true) => {
        const c = computed(ruleId, v.date, opts, ctx.rules)
        out.push({ key, include, type: 'task', task: { title, kind: 'deadline', category: 'Pleading/Motion', priority: 'high', due: c.date, rule: c.rule } })
      }
      if (v.dispositive === '1') {
        if (v.side === 'ours') {
          add('motion', `File and serve ${v.title} and brief`, 'sd_motion')
          add('reply', `Reply brief (optional, 5 pages) — ${v.title}`, 'sd_reply', {}, true)
        } else add('response', `Response to ${v.title}`, 'sd_response')
      } else {
        if (v.side === 'ours') add('motion', `Serve ${v.title} and notice of hearing`, 'motion_serve', { method: 'delivery' })
        else add('response', `Response to ${v.title}`, 'motion_response', { method: 'delivery' })
      }
      return out
    },
  },
  {
    id: 'case_eval',
    title: 'Case evaluation scheduled',
    blurb: 'Summary due date, and the 28-day accept/reject clock once the award is served.',
    fields: [
      { key: 'date', label: 'Case evaluation date', type: 'date', required: true },
      { key: 'time', label: 'Time', type: 'time' },
      { key: 'served', label: 'Date the evaluation was served (if already received)', type: 'date' },
    ],
    build: (v, ctx) => {
      const out: Draft[] = [{ key: 'event', include: true, type: 'event', event: { title: 'Case evaluation', kind: 'case_eval', date: v.date, time: v.time || undefined } }]
      const s = computed('ce_summary', v.date, {}, ctx.rules)
      out.push({ key: 'summary', include: true, type: 'task', task: { title: 'Case evaluation summary, exhibits and fee', kind: 'deadline', category: 'Client/Adjuster report', priority: 'high', due: s.date, rule: s.rule } })
      if (v.served) {
        const a = computed('ce_accept', v.served, {}, ctx.rules)
        out.push({ key: 'accept', include: true, type: 'task', task: { title: 'File acceptance or rejection of case evaluation', kind: 'deadline', category: 'Client/Adjuster report', priority: 'high', due: a.date, rule: a.rule } })
      }
      return out
    },
  },
  {
    id: 'order_entered',
    title: 'Order or judgment entered',
    blurb: 'Reconsideration and appeal windows.',
    fields: [
      { key: 'title', label: 'Order', type: 'text', required: true, placeholder: 'e.g. Order denying summary disposition' },
      { key: 'date', label: 'Date entered', type: 'date', required: true },
      { key: 'recon', label: 'Track reconsideration deadline (21 days)', type: 'checkbox' },
      { key: 'appeal', label: 'Track appeal deadline (21 days)', type: 'checkbox' },
    ],
    defaults: () => ({ recon: '1', appeal: '1' }),
    build: (v, ctx) => {
      const out: Draft[] = []
      if (v.recon === '1') {
        const c = computed('reconsideration', v.date, {}, ctx.rules)
        out.push({ key: 'recon', include: true, type: 'task', task: { title: `Reconsideration deadline — ${v.title}`, kind: 'deadline', category: 'Pleading/Motion', priority: 'normal', due: c.date, rule: c.rule } })
      }
      if (v.appeal === '1') {
        const c = computed('appeal_right', v.date, {}, ctx.rules)
        out.push({ key: 'appeal', include: true, type: 'task', task: { title: `Appeal deadline — ${v.title}`, kind: 'deadline', category: 'Pleading/Motion', priority: 'high', due: c.date, rule: c.rule + ' Use MCR 7.205(A)(1) (leave application, also 21 days) for non-final orders.' } })
      }
      return out
    },
  },
]

export function workflowById(id: string) {
  return WORKFLOWS.find((w) => w.id === id)
}

/** Keeps a deposition's summary task in step when the deposition date changes. */
export function summaryDatesFor(date: ISODate, settings: Settings, rules: DayRules) {
  return {
    target: addBusinessDays(date, settings.summaryTargetDays, rules),
    due: addBusinessDays(date, settings.summaryHardDays, rules),
  }
}
