// ABA UTBMS litigation task codes and activity codes.

export const TASK_CODES: { code: string; label: string; phase?: boolean }[] = [
  { code: 'L100', label: 'Case Assessment, Development and Administration', phase: true },
  { code: 'L110', label: 'Fact Investigation/Development' },
  { code: 'L120', label: 'Analysis/Strategy' },
  { code: 'L130', label: 'Experts/Consultants' },
  { code: 'L140', label: 'Document/File Management' },
  { code: 'L150', label: 'Budgeting' },
  { code: 'L160', label: 'Settlement/Non-Binding ADR' },
  { code: 'L190', label: 'Other Case Assessment, Development and Administration' },
  { code: 'L200', label: 'Pre-Trial Pleadings and Motions', phase: true },
  { code: 'L210', label: 'Pleadings' },
  { code: 'L220', label: 'Preliminary Injunctions/Provisional Remedies' },
  { code: 'L230', label: 'Court Mandated Conferences' },
  { code: 'L240', label: 'Dispositive Motions' },
  { code: 'L250', label: 'Other Written Motions and Submissions' },
  { code: 'L260', label: 'Class Action Certification and Notice' },
  { code: 'L300', label: 'Discovery', phase: true },
  { code: 'L310', label: 'Written Discovery' },
  { code: 'L320', label: 'Document Production' },
  { code: 'L330', label: 'Depositions' },
  { code: 'L340', label: 'Expert Discovery' },
  { code: 'L350', label: 'Discovery Motions' },
  { code: 'L390', label: 'Other Discovery' },
  { code: 'L400', label: 'Trial Preparation and Trial', phase: true },
  { code: 'L410', label: 'Fact Witnesses' },
  { code: 'L420', label: 'Expert Witnesses' },
  { code: 'L430', label: 'Written Motions and Submissions' },
  { code: 'L440', label: 'Other Trial Preparation and Support' },
  { code: 'L450', label: 'Trial and Hearing Attendance' },
  { code: 'L460', label: 'Post-Trial Motions and Submissions' },
  { code: 'L470', label: 'Enforcement' },
  { code: 'L500', label: 'Appeal', phase: true },
  { code: 'L510', label: 'Appellate Motions and Submissions' },
  { code: 'L520', label: 'Appellate Briefs' },
  { code: 'L530', label: 'Oral Argument' },
]

export const ACTIVITY_CODES: { code: string; label: string }[] = [
  { code: 'A101', label: 'Plan and prepare for' },
  { code: 'A102', label: 'Research' },
  { code: 'A103', label: 'Draft/revise' },
  { code: 'A104', label: 'Review/analyze' },
  { code: 'A105', label: 'Communicate (in firm)' },
  { code: 'A106', label: 'Communicate (with client)' },
  { code: 'A107', label: 'Communicate (other outside counsel)' },
  { code: 'A108', label: 'Communicate (other external)' },
  { code: 'A109', label: 'Appear for/attend' },
  { code: 'A110', label: 'Manage data/files' },
  { code: 'A111', label: 'Other' },
]

export const codeLabel = (code?: string) =>
  code ? [...TASK_CODES, ...ACTIVITY_CODES].find((c) => c.code === code)?.label || '' : ''

/** Suggests codes from a narrative, so most entries need no picking. */
export function suggestCodes(text: string): { taskCode?: string; activityCode?: string } {
  const t = text.toLowerCase()
  let taskCode: string | undefined
  if (/depos|depo\b|dep\b/.test(t)) taskCode = 'L330'
  else if (/expert|affidavit of merit|amd\b|meritorious/.test(t)) taskCode = 'L130'
  else if (/interrog|request(s)? to (produce|admit)|rfp|rfa|discovery response|written discovery/.test(t)) taskCode = 'L310'
  else if (/subpoena|records|document production|produce/.test(t)) taskCode = 'L320'
  else if (/summary disposition|msd|dispositive/.test(t)) taskCode = 'L240'
  else if (/motion|brief/.test(t)) taskCode = 'L250'
  else if (/answer|complaint|affirmative defenses|pleading/.test(t)) taskCode = 'L210'
  else if (/case evaluation|facilitation|mediation|settlement/.test(t)) taskCode = 'L160'
  else if (/scheduling conference|status conference|pretrial conference/.test(t)) taskCode = 'L230'
  else if (/trial/.test(t)) taskCode = 'L440'
  else if (/report|evaluat|strategy|analy/.test(t)) taskCode = 'L120'
  else if (/medical records|chart|investigat/.test(t)) taskCode = 'L110'

  let activityCode: string | undefined
  if (/^(draft|prepare|revise|edit)|\bdraft/.test(t)) activityCode = 'A103'
  else if (/^(review|analy)|\breview/.test(t)) activityCode = 'A104'
  else if (/research/.test(t)) activityCode = 'A102'
  else if (/attend|appear|hearing|deposition of/.test(t)) activityCode = 'A109'
  else if (/(email|call|letter|correspond|conference) (with|to) (client|adjuster|insured)/.test(t)) activityCode = 'A106'
  else if (/(email|call|letter|correspond).*(counsel|attorney)/.test(t)) activityCode = 'A107'
  else if (/(email|call|letter|correspond)/.test(t)) activityCode = 'A108'
  else if (/(partner|in firm|internal|team)/.test(t)) activityCode = 'A105'
  else if (/plan|prepare for|prep for/.test(t)) activityCode = 'A101'
  return { taskCode, activityCode }
}

/** Billing increments of a tenth of an hour, rounded up. */
export const roundTenth = (hours: number) => Math.max(0.1, Math.ceil(hours * 10 - 1e-9) / 10)
