import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from './quickadd'

const cases = [{ id: 'a', name: 'Adams', status: 'active', createdAt: 0, updatedAt: 0 }] as never

describe('quick add', () => {
  it('reads case, assigner, deadline given and court date', () => {
    const p = parseQuickAdd('Adams: draft RFP responses by Fri for Heidi court 12/1 !', cases, '2026-11-13')
    expect(p).toMatchObject({ title: 'Draft RFP responses', caseId: 'a', due: '2026-11-20', courtDue: '2026-12-01', assignedBy: 'Heidi', priority: 'high' })
  })
  it('follow-ups', () => {
    const p = parseQuickAdd('waiting on Smith re signed authorizations', cases, '2026-11-13')
    expect(p).toMatchObject({ followUp: true, waitingOn: 'Smith', title: 'Signed authorizations' })
  })
})
