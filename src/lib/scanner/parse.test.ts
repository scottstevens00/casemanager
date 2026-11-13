import { describe, expect, it } from 'vitest'
import { headerInfo, parseScheduleText } from './parse'

const ORDER = `STATE OF MICHIGAN
IN THE CIRCUIT COURT FOR THE COUNTY OF GENESEE
JOHN DOE, Plaintiff, v ASCENSION GENESYS HOSPITAL, Defendant.
Case No. 26-112233-NH
Hon. Joseph J. Farah
SCHEDULING ORDER
At a session of said Court held on November 2, 2026
1. Plaintiff's Witness List shall be filed by .......... February 15, 2027
2. Defendant's Witness List shall be filed by ......... March 15, 2027
3. Discovery shall be completed by: June 30, 2027
4. Dispositive motions must be heard by 7/30/2027
5. Settlement Conference: September 14, 2027 at 9:00 a.m.
6. Trial: Tuesday, October 19, 2027 at 8:30 AM
Motions in limine shall be filed 28 days before trial.
Expert witness disclosure
April 1, 2027
IT IS SO ORDERED.
Dated: November 2, 2026     /s/ Joseph J. Farah, Circuit Judge`

describe('scheduling order parser', () => {
  const found = parseScheduleText(ORDER, '2026-11-13')
  const by = (d: string) => found.filter((f) => f.date === d)
  it('finds labeled deadlines', () => {
    expect(by('2027-02-15')[0].label).toMatch(/Plaintiff's Witness List/)
    expect(by('2027-02-15')[0].type).toBe('deadline')
    expect(by('2027-03-15')[0].label).toMatch(/Defendant's Witness List/)
    expect(by('2027-06-30')[0].label).toMatch(/Discovery closes/)
    expect(by('2027-07-30')[0].label).toMatch(/Dispositive motions/)
  })
  it('classifies events and times', () => {
    const sc = by('2027-09-14')[0]
    expect(sc.type).toBe('event')
    expect(sc.eventKind).toBe('conference')
    expect(sc.time).toBe('09:00')
    const trial = by('2027-10-19')[0]
    expect(trial.eventKind).toBe('trial')
    expect(trial.time).toBe('08:30')
  })
  it('computes relative deadlines', () => {
    const mil = found.find((f) => /limine/i.test(f.label))!
    expect(mil.date).toBe('2027-09-21')
    expect(mil.source).toBe('computed')
  })
  it('takes the label from the line above', () => {
    expect(by('2027-04-01')[0].label).toMatch(/Expert witness disclosure/)
  })
  it('unchecks the order date', () => {
    for (const f of by('2026-11-02')) expect(f.include).toBe(false)
  })
  it('header', () => {
    expect(headerInfo(ORDER)).toEqual({ caseNo: '26-112233-NH', judge: 'Joseph J. Farah' })
  })
})

describe('label cleanup', () => {
  it('turns order phrasing into short labels', () => {
    const f = parseScheduleText(`Plaintiff's Witness List shall be filed by .......... February 15, 2027
Discovery shall be completed by: June 30, 2027
Dispositive motions must be heard by 7/30/2027
Facilitation shall be conducted no later than August 15, 2027`, '2026-11-13')
    expect(f.map((x) => x.label)).toEqual(["Plaintiff's Witness List due", 'Discovery closes', 'Dispositive motions heard by', 'Facilitation completed by'])
  })
})
