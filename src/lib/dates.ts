// Date math for Case Manager. Dates are plain 'YYYY-MM-DD' strings in local time;
// arithmetic is done in UTC so daylight-saving changes never shift a day.

export type ISODate = string

const DAY = 86_400_000

export function toUTC(d: ISODate): number {
  const [y, m, dd] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, dd)
}

export function fromUTC(ms: number): ISODate {
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

function pad(n: number) {
  return n < 10 ? '0' + n : String(n)
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const ms = toUTC(s)
  return fromUTC(ms) === s
}

export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * DAY)
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY)
}

export function weekday(d: ISODate): number {
  return new Date(toUTC(d)).getUTCDay() // 0 = Sunday
}

export function isWeekend(d: ISODate): boolean {
  const w = weekday(d)
  return w === 0 || w === 6
}

/** Adds calendar months; a day that doesn't exist in the target month becomes that month's last day (MCR 1.108(3)). */
export function addMonths(d: ISODate, months: number): ISODate {
  const [y, m, dd] = d.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = total % 12
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return fromUTC(Date.UTC(ny, nm, Math.min(dd, last)))
}

export function addYears(d: ISODate, years: number): ISODate {
  return addMonths(d, years * 12)
}

// ---------- Michigan court holidays, MCR 8.110(D)(2) ----------

function nthWeekday(year: number, month: number, dow: number, n: number): ISODate {
  // month 0-11; n >= 1
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const day = 1 + ((dow - first + 7) % 7) + (n - 1) * 7
  return fromUTC(Date.UTC(year, month, day))
}

function lastWeekday(year: number, month: number, dow: number): ISODate {
  const lastDay = new Date(Date.UTC(year, month + 1, 0))
  const diff = (lastDay.getUTCDay() - dow + 7) % 7
  return fromUTC(lastDay.getTime() - diff * DAY)
}

export interface Holiday {
  date: ISODate
  name: string
}

/** Weekend rule for New Year's Day, Juneteenth, Independence Day, Veterans' Day and Christmas: Saturday → Friday, Sunday → Monday. */
function observedFixed(d: ISODate): ISODate {
  const w = weekday(d)
  if (w === 6) return addDays(d, -1)
  if (w === 0) return addDays(d, 1)
  return d
}

/** Christmas Eve / New Year's Eve: on a Friday → Thursday before; on a Saturday or Sunday → Friday before. */
function observedEve(d: ISODate): ISODate {
  const w = weekday(d)
  if (w === 5) return addDays(d, -1)
  if (w === 6) return addDays(d, -1)
  if (w === 0) return addDays(d, -2)
  return d
}

const holidayCache = new Map<number, Holiday[]>()

/** Holidays observed by Michigan state courts whose observed date falls in `year`. */
export function courtHolidays(year: number): Holiday[] {
  const cached = holidayCache.get(year)
  if (cached) return cached
  const out: Holiday[] = []
  const build = (y: number) => {
    const list: Holiday[] = [
      { date: observedFixed(`${y}-01-01`), name: "New Year's Day" },
      { date: nthWeekday(y, 0, 1, 3), name: 'Martin Luther King, Jr. Day' },
      { date: nthWeekday(y, 1, 1, 3), name: "Presidents' Day" },
      { date: lastWeekday(y, 4, 1), name: 'Memorial Day' },
      { date: observedFixed(`${y}-06-19`), name: 'Juneteenth' },
      { date: observedFixed(`${y}-07-04`), name: 'Independence Day' },
      { date: nthWeekday(y, 8, 1, 1), name: 'Labor Day' },
      { date: observedFixed(`${y}-11-11`), name: "Veterans' Day" },
      { date: nthWeekday(y, 10, 4, 4), name: 'Thanksgiving Day' },
      { date: addDays(nthWeekday(y, 10, 4, 4), 1), name: 'Day after Thanksgiving' },
      { date: observedEve(`${y}-12-24`), name: 'Christmas Eve' },
      { date: observedFixed(`${y}-12-25`), name: 'Christmas Day' },
      { date: observedEve(`${y}-12-31`), name: "New Year's Eve" },
    ]
    return list
  }
  // A Saturday New Year's Day is observed on Dec 31 of the prior year, so look one year ahead too.
  for (const y of [year - 1, year, year + 1]) {
    for (const h of build(y)) if (h.date.startsWith(String(year))) out.push(h)
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  holidayCache.set(year, out)
  return out
}

export function holidayName(d: ISODate): string | undefined {
  return courtHolidays(Number(d.slice(0, 4))).find((h) => h.date === d)?.name
}

export interface DayRules {
  /** Extra closed days (firm closures, local court orders), 'YYYY-MM-DD'. */
  extraClosed?: ISODate[]
}

export function nonWorkingReason(d: ISODate, rules: DayRules = {}): string | undefined {
  const w = weekday(d)
  if (w === 6) return 'Saturday'
  if (w === 0) return 'Sunday'
  const h = holidayName(d)
  if (h) return h
  if (rules.extraClosed?.includes(d)) return 'Closed (your settings)'
  return undefined
}

export function isWorkingDay(d: ISODate, rules: DayRules = {}): boolean {
  return nonWorkingReason(d, rules) === undefined
}

export function nextWorkingDay(d: ISODate, rules: DayRules = {}): ISODate {
  let x = d
  while (!isWorkingDay(x, rules)) x = addDays(x, 1)
  return x
}

export function prevWorkingDay(d: ISODate, rules: DayRules = {}): ISODate {
  let x = d
  while (!isWorkingDay(x, rules)) x = addDays(x, -1)
  return x
}

/** N business days after `d` (the day of the event is not counted). */
export function addBusinessDays(d: ISODate, n: number, rules: DayRules = {}): ISODate {
  let x = d
  let count = 0
  const step = n >= 0 ? 1 : -1
  while (count < Math.abs(n)) {
    x = addDays(x, step)
    if (isWorkingDay(x, rules)) count++
  }
  return x
}

/** Business days from a to b (positive when b is later), not counting a. */
export function businessDaysBetween(a: ISODate, b: ISODate, rules: DayRules = {}): number {
  if (a === b) return 0
  const step = toUTC(b) > toUTC(a) ? 1 : -1
  let x = a
  let n = 0
  while (x !== b) {
    x = addDays(x, step)
    if (isWorkingDay(x, rules)) n += step
  }
  return n
}

export interface Computation {
  date: ISODate
  steps: string[]
}

/**
 * MCR 1.108: exclude the day of the act; include the last day unless it is a Saturday, Sunday,
 * legal holiday, or day the court is closed, in which case the period runs to the next such day.
 */
export function computeForward(
  trigger: ISODate,
  amount: number,
  unit: 'days' | 'weeks' | 'months' | 'years',
  rules: DayRules = {},
): Computation {
  let raw: ISODate
  if (unit === 'days') raw = addDays(trigger, amount)
  else if (unit === 'weeks') raw = addDays(trigger, amount * 7)
  else if (unit === 'months') raw = addMonths(trigger, amount)
  else raw = addYears(trigger, amount)
  const steps = [`${fmtLong(trigger)} is the triggering day and isn't counted.`]
  steps.push(`${amount} ${unit === 'days' && amount === 1 ? 'day' : unit} later is ${fmtLong(raw)}.`)
  let date = raw
  if (!isWorkingDay(raw, rules)) {
    date = nextWorkingDay(raw, rules)
    steps.push(`${fmtLong(raw)} is a ${nonWorkingReason(raw, rules)}, so the deadline moves to ${fmtLong(date)} (MCR 1.108(1)).`)
  }
  return { date, steps }
}

/** "At least N days before" a hearing: count back, and if that lands on a non-court day, move earlier to be safe. */
export function computeBackward(event: ISODate, amount: number, rules: DayRules = {}): Computation {
  const raw = addDays(event, -amount)
  const steps = [`${fmtLong(event)} is the event day and isn't counted.`, `${amount} days before is ${fmtLong(raw)}.`]
  let date = raw
  if (!isWorkingDay(raw, rules)) {
    date = prevWorkingDay(raw, rules)
    steps.push(
      `${fmtLong(raw)} is a ${nonWorkingReason(raw, rules)}. To be safe, this uses the business day before, ${fmtLong(date)}.`,
    )
  }
  return { date, steps }
}

export function computeBusiness(trigger: ISODate, n: number, rules: DayRules = {}): Computation {
  const date = addBusinessDays(trigger, n, rules)
  return {
    date,
    steps: [
      `${fmtLong(trigger)} isn't counted.`,
      `Counting ${n} business days (skipping weekends and Michigan court holidays) lands on ${fmtLong(date)}.`,
    ],
  }
}

// ---------- formatting ----------

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function fmtShort(d?: ISODate): string {
  if (!d) return ''
  const [, m, dd] = d.split('-').map(Number)
  return `${DOW[weekday(d)]} ${MON[m - 1]} ${dd}`
}

export function fmtLong(d?: ISODate): string {
  if (!d) return ''
  const [y, m, dd] = d.split('-').map(Number)
  return `${DOW[weekday(d)]}, ${MONTH_FULL[m - 1]} ${dd}, ${y}`
}

export function fmtMDY(d?: ISODate): string {
  if (!d) return ''
  const [y, m, dd] = d.split('-').map(Number)
  return `${m}/${dd}/${y}`
}

export function fmtTime(t?: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${pad(m)} ${ap}`
}

/** "today", "tomorrow", "in 3 days", "2 days ago" */
export function relDay(d: ISODate, today: ISODate = todayISO()): string {
  const n = diffDays(d, today)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  if (n > 1 && n < 7) return `in ${n} days`
  if (n < 0) return `${-n} days ago`
  if (n < 60) return `in ${n} days`
  return fmtShort(d)
}

export function startOfWeek(d: ISODate): ISODate {
  // Monday-based week
  const w = weekday(d)
  return addDays(d, -((w + 6) % 7))
}

export const MONTH_NAMES = MONTH_FULL

/** Picks the later of two computed deadlines and explains the choice. */
export function laterOf(a: Computation, b: Computation, aLabel: string, bLabel: string): Computation {
  const later = toUTC(b.date) > toUTC(a.date) ? b : a
  const which = later === a ? aLabel : bLabel
  return {
    date: later.date,
    steps: [
      `${aLabel}: ${fmtLong(a.date)}.`,
      `${bLabel}: ${fmtLong(b.date)}.`,
      `The later date controls: ${fmtLong(later.date)} (${which}).`,
    ],
  }
}
