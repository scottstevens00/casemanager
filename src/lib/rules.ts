// Michigan deadline rules for the calculator and workflows.
// Each rule cites its source. Courts can change any of these by order; always check the order and current rule.

import {
  computeBackward,
  computeBusiness,
  computeForward,
  laterOf,
  type Computation,
  type DayRules,
  type ISODate,
} from './dates'

export interface RuleOption {
  key: string
  label: string
  choices: { value: string; label: string }[]
}

export interface DeadlineRule {
  id: string
  group: string
  title: string
  trigger: string
  cite: string
  note?: string
  options?: RuleOption[]
  /** Second date input, when the rule depends on two events. */
  trigger2?: string
  compute: (trigger: ISODate, opts: Record<string, string>, rules: DayRules, trigger2?: ISODate) => Computation
}

export const RULE_GROUPS = [
  'Pleadings',
  'Med mal',
  'Disclosures & discovery',
  'Motions',
  'Case evaluation',
  'Post-judgment & appeal',
  'Limitations',
  'Custom',
]

export const RULES: DeadlineRule[] = [
  {
    id: 'answer',
    group: 'Pleadings',
    title: 'Answer to complaint due',
    trigger: 'Date summons & complaint served',
    cite: 'MCR 2.108(A)(1)–(2)',
    options: [
      {
        key: 'method',
        label: 'How was it served?',
        choices: [
          { value: 'personal', label: 'Personally, in Michigan (21 days)' },
          { value: 'mail', label: 'Outside Michigan, or by registered mail (28 days)' },
        ],
      },
    ],
    compute: (t, o, r) => computeForward(t, o.method === 'mail' ? 28 : 21, 'days', r),
  },
  {
    id: 'answer_cross',
    group: 'Pleadings',
    title: 'Answer to cross-claim or counterclaim',
    trigger: 'Date the pleading was served',
    cite: 'MCR 2.108(A)(4)',
    compute: (t, _o, r) => computeForward(t, 21, 'days', r),
  },
  {
    id: 'amd',
    group: 'Med mal',
    title: 'Affidavit of meritorious defense due',
    trigger: "Date plaintiff filed the affidavit of merit",
    cite: 'MCL 600.2912e(1)',
    note: 'If plaintiff failed to allow access to medical records under MCL 600.2912b(5), the AMD may be filed within 91 days after the answer is filed (MCL 600.2912e(2)).',
    compute: (t, _o, r) => computeForward(t, 91, 'days', r),
  },
  {
    id: 'noi_response',
    group: 'Med mal',
    title: 'Written response to notice of intent',
    trigger: 'Date the NOI was received',
    cite: 'MCL 600.2912b(7)',
    note: 'If no response is received within 154 days, the claimant may file suit when the 154 days expire (MCL 600.2912b(8)).',
    compute: (t, _o, r) => computeForward(t, 154, 'days', r),
  },
  {
    id: 'noi_records',
    group: 'Med mal',
    title: 'Allow claimant access to medical records',
    trigger: 'Date the NOI was received',
    cite: 'MCL 600.2912b(5)',
    compute: (t, _o, r) => computeForward(t, 56, 'days', r),
  },
  {
    id: 'noi_period',
    group: 'Med mal',
    title: 'NOI waiting period ends (earliest suit date)',
    trigger: 'Date the NOI was given',
    cite: 'MCL 600.2912b(1), (3)',
    options: [
      {
        key: 'period',
        label: 'Notice period',
        choices: [
          { value: '182', label: '182 days (standard)' },
          { value: '154', label: '154 days (no timely response)' },
          { value: '91', label: '91 days (shortened, 2912b(3))' },
        ],
      },
    ],
    compute: (t, o, r) => computeForward(t, Number(o.period || 182), 'days', r),
  },
  {
    id: 'disclosures_def',
    group: 'Disclosures & discovery',
    title: "Our initial disclosures (answering party)",
    trigger: 'Date our answer was filed',
    cite: 'MCR 2.302(A)(5)(b)(ii)',
    note: "Due at the later of 28 days after the answer or 14 days after plaintiff's disclosures are due. A party may seek discovery only after serving its own initial disclosures (MCR 2.301(A)(1)).",
    compute: (t, _o, r) => {
      const a = computeForward(t, 28, 'days', r)
      const b = computeForward(computeForward(t, 14, 'days', r).date, 14, 'days', r)
      return laterOf(a, b, "28 days after the answer", "14 days after plaintiff's disclosures are due")
    },
  },
  {
    id: 'disclosures_pl',
    group: 'Disclosures & discovery',
    title: "Plaintiff's initial disclosures due",
    trigger: 'Date the answer was filed',
    cite: 'MCR 2.302(A)(5)(b)(i)',
    compute: (t, _o, r) => computeForward(t, 14, 'days', r),
  },
  {
    id: 'disc_response',
    group: 'Disclosures & discovery',
    title: 'Responses to interrogatories / requests to produce / requests to admit',
    trigger: 'Date the requests were served',
    cite: 'MCR 2.309(B)(4), 2.310(C)(2), 2.312(B)(1)',
    note: 'Michigan adds no extra days for mail or e-service. Requests for admission not answered in time are deemed admitted.',
    compute: (t, _o, r) => computeForward(t, 28, 'days', r),
  },
  {
    id: 'disc_response_def',
    group: 'Disclosures & discovery',
    title: 'Defendant served with discovery along with the complaint',
    trigger: 'Date the discovery was served',
    trigger2: 'Date summons & complaint were served',
    cite: 'MCR 2.309(B)(4), 2.310(C)(2)',
    note: 'A defendant may answer interrogatories and requests to produce within 42 days after service of the summons and complaint, or 28 days after service of the requests, whichever is later. Requests to admit follow MCR 2.312(B)(1).',
    compute: (t, _o, r, t2) => {
      const a = computeForward(t, 28, 'days', r)
      if (!t2) return a
      const b = computeForward(t2, 42, 'days', r)
      return laterOf(a, b, '28 days after the requests', '42 days after the complaint')
    },
  },
  {
    id: 'sd_motion',
    group: 'Motions',
    title: 'Summary disposition: motion and brief filed & served',
    trigger: 'Hearing date',
    cite: 'MCR 2.116(G)(1)(a)(i)',
    note: 'At least 21 days before the hearing unless the court sets a different time.',
    compute: (t, _o, r) => computeBackward(t, 21, r),
  },
  {
    id: 'sd_response',
    group: 'Motions',
    title: 'Summary disposition: response filed & served',
    trigger: 'Hearing date',
    cite: 'MCR 2.116(G)(1)(a)(ii)',
    compute: (t, _o, r) => computeBackward(t, 7, r),
  },
  {
    id: 'sd_reply',
    group: 'Motions',
    title: 'Summary disposition: reply brief (5 pages max)',
    trigger: 'Hearing date',
    cite: 'MCR 2.116(G)(1)(a)(iii)',
    compute: (t, _o, r) => computeBackward(t, 4, r),
  },
  {
    id: 'motion_serve',
    group: 'Motions',
    title: 'Other motions: serve motion and notice of hearing',
    trigger: 'Hearing date',
    cite: 'MCR 2.119(C)(1)',
    options: [
      {
        key: 'method',
        label: 'Service method',
        choices: [
          { value: 'delivery', label: 'Delivery or e-service (7 days)' },
          { value: 'mail', label: 'First-class mail (9 days)' },
        ],
      },
    ],
    compute: (t, o, r) => computeBackward(t, o.method === 'mail' ? 9 : 7, r),
  },
  {
    id: 'motion_response',
    group: 'Motions',
    title: 'Other motions: serve response',
    trigger: 'Hearing date',
    cite: 'MCR 2.119(C)(2)',
    options: [
      {
        key: 'method',
        label: 'Service method',
        choices: [
          { value: 'delivery', label: 'Delivery or e-service (3 days)' },
          { value: 'mail', label: 'First-class mail (5 days)' },
        ],
      },
    ],
    compute: (t, o, r) => computeBackward(t, o.method === 'mail' ? 5 : 3, r),
  },
  {
    id: 'reconsideration',
    group: 'Motions',
    title: 'Motion for reconsideration or rehearing',
    trigger: 'Date the order was entered',
    cite: 'MCR 2.119(F)(1)',
    compute: (t, _o, r) => computeForward(t, 21, 'days', r),
  },
  {
    id: 'ce_summary',
    group: 'Case evaluation',
    title: 'Case evaluation summary & fee',
    trigger: 'Case evaluation hearing date',
    cite: 'MCR 2.403(I)(1)',
    note: 'At least 7 days before the hearing unless the notice of hearing says otherwise. Late filings draw a $150 penalty (MCR 2.403(I)(2)).',
    compute: (t, _o, r) => computeBackward(t, 7, r),
  },
  {
    id: 'ce_accept',
    group: 'Case evaluation',
    title: 'Accept or reject case evaluation',
    trigger: 'Date the evaluation was served',
    cite: 'MCR 2.403(L)(1)',
    note: 'Failure to file a written acceptance or rejection within 28 days is treated as a rejection.',
    compute: (t, _o, r) => computeForward(t, 28, 'days', r),
  },
  {
    id: 'new_trial',
    group: 'Post-judgment & appeal',
    title: 'Motion for new trial / to amend judgment',
    trigger: 'Date the judgment was entered',
    cite: 'MCR 2.611(B)',
    compute: (t, _o, r) => computeForward(t, 21, 'days', r),
  },
  {
    id: 'appeal_right',
    group: 'Post-judgment & appeal',
    title: 'Claim of appeal (appeal of right)',
    trigger: 'Date the judgment or order was entered',
    cite: 'MCR 7.204(A)(1)',
    note: 'Jurisdictional. A timely post-judgment motion restarts the period from the order deciding it.',
    compute: (t, _o, r) => computeForward(t, 21, 'days', r),
  },
  {
    id: 'appeal_leave',
    group: 'Post-judgment & appeal',
    title: 'Application for leave to appeal',
    trigger: 'Date the order was entered',
    cite: 'MCR 7.205(A)(1)',
    compute: (t, _o, r) => computeForward(t, 21, 'days', r),
  },
  {
    id: 'sol_medmal',
    group: 'Limitations',
    title: 'Med mal statute of limitations (2 years)',
    trigger: 'Date of the act or omission (accrual)',
    cite: 'MCL 600.5805(8); 600.5838a',
    note: 'Rough arithmetic only. Also check the 6-month discovery rule (MCL 600.5838a(2)), NOI tolling (MCL 600.5856(c)), and the wrongful-death saving provision (MCL 600.5852).',
    compute: (t, _o, r) => computeForward(t, 2, 'years', r),
  },
  {
    id: 'sol_injury',
    group: 'Limitations',
    title: 'Personal injury / premises statute of limitations (3 years)',
    trigger: 'Date of injury',
    cite: 'MCL 600.5805(2)',
    note: 'Rough arithmetic only. Confirm accrual and any tolling.',
    compute: (t, _o, r) => computeForward(t, 3, 'years', r),
  },
  {
    id: 'custom_after',
    group: 'Custom',
    title: 'Calendar days after',
    trigger: 'Starting date',
    cite: 'MCR 1.108',
    options: [{ key: 'n', label: 'Days', choices: [] }],
    compute: (t, o, r) => computeForward(t, Number(o.n || 0), 'days', r),
  },
  {
    id: 'custom_before',
    group: 'Custom',
    title: 'Calendar days before',
    trigger: 'Event date',
    cite: 'MCR 1.108',
    options: [{ key: 'n', label: 'Days', choices: [] }],
    compute: (t, o, r) => computeBackward(t, Number(o.n || 0), r),
  },
  {
    id: 'custom_business',
    group: 'Custom',
    title: 'Business days after',
    trigger: 'Starting date',
    cite: 'Weekends and MCR 8.110(D)(2) court holidays skipped',
    options: [{ key: 'n', label: 'Business days', choices: [] }],
    compute: (t, o, r) => computeBusiness(t, Number(o.n || 0), r),
  },
]

export function ruleById(id: string): DeadlineRule | undefined {
  return RULES.find((r) => r.id === id)
}

/** Text saved on a task explaining where its date came from. */
export function describeComputation(rule: DeadlineRule, c: Computation): string {
  return `${rule.title} — ${rule.cite}. ${c.steps.join(' ')}${rule.note ? ' Note: ' + rule.note : ''}`
}
