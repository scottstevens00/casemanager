import type { ISODate } from './dates'

export type ID = string

/** Fields every synced record carries. */
export interface Base {
  id: ID
  createdAt: number
  updatedAt: number
  /** Device that made the last change (tie-breaker for sync). */
  dev?: string
  /** Local revision: bumped on every local edit, used to send only changes when syncing. */
  lrev?: number
  deleted?: boolean
}

export type CaseStatus = 'active' | 'on_hold' | 'closed'

export interface Contact {
  id: ID
  name: string
  role?: string
  org?: string
  phone?: string
  email?: string
}

export interface Case extends Base {
  name: string
  caption?: string
  status: CaseStatus
  caseType?: string
  client?: string
  carrier?: string
  claimNo?: string
  adjuster?: string
  fileNo?: string
  court?: string
  caseNo?: string
  judge?: string
  partner?: string
  plaintiffCounsel?: string
  notes?: string
  contacts?: Contact[]
}

export type TaskKind = 'task' | 'followup' | 'deadline' | 'summary'
export type TaskStatus = 'open' | 'in_progress' | 'waiting' | 'done'
export type Priority = 'high' | 'normal' | 'low'

export interface FollowUpLog {
  date: ISODate
  note?: string
}

export interface Task extends Base {
  caseId?: ID
  title: string
  kind: TaskKind
  category?: string
  status: TaskStatus
  priority: Priority
  /** Hard deadline. */
  due?: ISODate
  /** Soft target date (e.g. summary goal of 10 business days). */
  target?: ISODate
  dueTime?: string
  assignedBy?: string
  assignedOn?: ISODate
  /** Extra one-off reminders, local 'YYYY-MM-DDTHH:MM'. */
  remind?: string[]
  notes?: string
  /** How the date was computed, with the rule citation. */
  rule?: string
  /** Where the task came from (workflow, scheduling order, etc.). */
  source?: string
  // Follow-ups on letters/emails
  waitingOn?: string
  sentOn?: ISODate
  sentVia?: 'letter' | 'email' | 'letter+email' | 'call' | 'other'
  nextFollowUp?: ISODate
  followUps?: FollowUpLog[]
  eventId?: ID
  /** Which checklist step this is (e.g. 'answer', 'ids', 'mil'), so later workflows update it instead of duplicating. */
  wfKey?: string
  completedAt?: number
  completedOn?: ISODate
}

export type EventKind = 'deposition' | 'meeting' | 'hearing' | 'trial' | 'conference' | 'case_eval' | 'facilitation' | 'other'

export interface CaseEvent extends Base {
  caseId?: ID
  title: string
  kind: EventKind
  date: ISODate
  time?: string
  location?: string
  notes?: string
  source?: string
}

export interface TimeEntry extends Base {
  caseId?: ID
  taskId?: ID
  date: ISODate
  hours: number
  taskCode?: string
  activityCode?: string
  narrative: string
}

export interface DB {
  cases: Case[]
  tasks: Task[]
  events: CaseEvent[]
  time: TimeEntry[]
}

export type Collection = keyof DB

export interface Peer {
  id: string
  name: string
  /** Highest of their revisions we've received. */
  seenRev: number
  /** Highest of our revisions they've confirmed. */
  ackedRev: number
  lastSync?: number
}

export interface Settings {
  userName: string
  followUpBusinessDays: number
  summaryTargetDays: number
  summaryHardDays: number
  /** Calendar days before a deadline to remind (0 = day of). */
  deadlineReminderDays: number[]
  morningTime: string
  extraClosed: ISODate[]
  people: string[]
  categories: string[]
  notifications: boolean
  aiEnabled: boolean
  theme: 'system' | 'light' | 'dark'
  weekStartsMonday: boolean
}

export const DEFAULT_CATEGORIES = [
  'Pleading/Motion',
  'Discovery',
  'Deposition',
  'Expert work',
  'Research/Memo',
  'Client/Adjuster report',
  'Correspondence',
  'Trial prep',
  'Admin',
]

export const DEFAULT_SETTINGS: Settings = {
  userName: 'Scott Stevens',
  followUpBusinessDays: 5,
  summaryTargetDays: 10,
  summaryHardDays: 30,
  deadlineReminderDays: [7, 2, 0],
  morningTime: '08:30',
  extraClosed: [],
  people: [],
  categories: DEFAULT_CATEGORIES,
  notifications: true,
  aiEnabled: true,
  theme: 'system',
  weekStartsMonday: true,
}

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  deposition: 'Deposition',
  meeting: 'Meeting',
  hearing: 'Hearing',
  trial: 'Trial',
  conference: 'Conference',
  case_eval: 'Case evaluation',
  facilitation: 'Facilitation',
  other: 'Event',
}

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  task: 'Task',
  followup: 'Follow-up',
  deadline: 'Deadline',
  summary: 'Summary',
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Not started',
  in_progress: 'In progress',
  waiting: 'Waiting on others',
  done: 'Completed',
}

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  closed: 'Closed',
}
