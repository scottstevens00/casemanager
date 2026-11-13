import { describe, expect, it } from 'vitest'
import {
  addBusinessDays,
  addMonths,
  businessDaysBetween,
  computeBackward,
  computeForward,
  courtHolidays,
  isWorkingDay,
} from './dates'
import { ruleById } from './rules'

const names = (y: number) => courtHolidays(y).map((h) => `${h.date} ${h.name}`)

describe('Michigan court holidays (MCR 8.110(D)(2))', () => {
  it('2026 list', () => {
    expect(names(2026)).toEqual([
      "2026-01-01 New Year's Day",
      '2026-01-19 Martin Luther King, Jr. Day',
      "2026-02-16 Presidents' Day",
      '2026-05-25 Memorial Day',
      '2026-06-19 Juneteenth',
      '2026-07-03 Independence Day', // July 4 is a Saturday
      '2026-09-07 Labor Day',
      "2026-11-11 Veterans' Day",
      '2026-11-26 Thanksgiving Day',
      '2026-11-27 Day after Thanksgiving',
      '2026-12-24 Christmas Eve',
      '2026-12-25 Christmas Day',
      "2026-12-31 New Year's Eve",
    ])
  })
  it('2027: Christmas on Saturday shifts Christmas to Fri 12/24 and Christmas Eve to Thu 12/23', () => {
    const h = names(2027)
    expect(h).toContain('2027-12-24 Christmas Day')
    expect(h).toContain('2027-12-23 Christmas Eve')
    // Jan 1 2028 is a Saturday -> observed Fri Dec 31 2027; NYE (Fri) -> Thu Dec 30
    expect(h).toContain("2027-12-31 New Year's Day")
    expect(h).toContain("2027-12-30 New Year's Eve")
    expect(h).toContain('2027-06-18 Juneteenth') // June 19 2027 is a Saturday
    expect(h).toContain('2027-07-05 Independence Day') // Sunday -> Monday
    expect(names(2028)).not.toContain("2028-01-01 New Year's Day")
  })
  it('2028: Christmas Eve on Sunday -> Fri 12/22; Christmas Mon 12/25', () => {
    const h = names(2028)
    expect(h).toContain('2028-12-22 Christmas Eve')
    expect(h).toContain('2028-12-25 Christmas Day')
    expect(h).toContain("2028-12-29 New Year's Eve") // Dec 31 2028 is Sunday
  })
})

describe('MCR 1.108 computation', () => {
  it('21 days from personal service, rolling past a weekend', () => {
    // Served Tue Nov 10 2026 + 21 = Tue Dec 1 2026
    expect(computeForward('2026-11-10', 21, 'days').date).toBe('2026-12-01')
    // Served Sat Nov 7 + 21 = Sat Nov 28 -> Mon Nov 30 (Fri 27 is a holiday but we roll forward)
    expect(computeForward('2026-11-07', 21, 'days').date).toBe('2026-11-30')
  })
  it('rolls past Thanksgiving holidays', () => {
    // + 28 from Oct 29 = Thu Nov 26 (Thanksgiving) -> Fri 27 holiday -> Sat, Sun -> Mon Nov 30
    expect(computeForward('2026-10-29', 28, 'days').date).toBe('2026-11-30')
  })
  it('months clamp to month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(computeForward('2024-02-29', 2, 'years').date).toBe('2026-03-02') // Feb 28 2026 is Saturday
  })
  it('backward from a hearing moves earlier when landing on a non-court day', () => {
    // Hearing Mon Dec 7 2026 - 21 = Mon Nov 16
    expect(computeBackward('2026-12-07', 21).date).toBe('2026-11-16')
    // Hearing Wed Dec 2 2026 - 7 = Wed Nov 25
    expect(computeBackward('2026-12-02', 7).date).toBe('2026-11-25')
    // Hearing Fri Dec 4 - 7 = Fri Nov 27 (holiday) -> Wed Nov 25
    expect(computeBackward('2026-12-04', 7).date).toBe('2026-11-25')
  })
})

describe('business days', () => {
  it('10 and 30 business days after a deposition', () => {
    // Depo Mon Nov 16 2026: 10 business days skips Thanksgiving Thu/Fri -> Wed Dec 2
    expect(addBusinessDays('2026-11-16', 10)).toBe('2026-12-02')
    expect(businessDaysBetween('2026-11-16', '2026-12-02')).toBe(10)
    expect(isWorkingDay('2026-11-27')).toBe(false)
  })
  it('5 business days for a follow-up', () => {
    expect(addBusinessDays('2026-11-13', 5)).toBe('2026-11-20')
    expect(addBusinessDays('2026-12-22', 5)).toBe('2027-01-04') // skips 12/24, 12/25, 12/31, 1/1 and weekends
  })
})

describe('rules', () => {
  it('defendant initial disclosures = 28 days after answer', () => {
    const r = ruleById('disclosures_def')!
    expect(r.compute('2026-11-02', {}, {}).date).toBe('2026-11-30')
  })
  it('answer by mail = 28 days', () => {
    const r = ruleById('answer')!
    expect(r.compute('2026-11-02', { method: 'mail' }, {}).date).toBe('2026-11-30')
    expect(r.compute('2026-11-02', { method: 'personal' }, {}).date).toBe('2026-11-23')
  })
  it('AMD = 91 days after AOM', () => {
    expect(ruleById('amd')!.compute('2026-09-01', {}, {}).date).toBe('2026-12-01')
  })
  it('defendant discovery: later of 28 days from requests or 42 from complaint', () => {
    const r = ruleById('disc_response_def')!
    expect(r.compute('2026-11-02', {}, {}, '2026-11-02').date).toBe('2026-12-14')
  })
})
