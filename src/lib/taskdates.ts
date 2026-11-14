// The dates on an assignment: when it was given, the deadline you were given, the actual (court) due date,
// and when you finished. The earliest open date is the one you work to.

import type { ISODate } from './dates'
import type { Task } from './types'

/** The date that matters next: the earlier of the deadline you were given and the court date (or the follow-up nudge). */
export function effectiveDue(t: Task): ISODate | undefined {
  if (t.kind === 'followup') return t.nextFollowUp || t.due
  const ds = [t.givenDue, t.due].filter(Boolean) as ISODate[]
  if (!ds.length) return undefined
  return ds.sort()[0]
}

/** True if finished on or before the deadline given (or the court date when no deadline was given). */
export function finishedOnTime(t: Task): boolean | undefined {
  if (t.status !== 'done' || !t.completedOn) return undefined
  const d = t.givenDue || t.due
  if (!d) return undefined
  return t.completedOn <= d
}
