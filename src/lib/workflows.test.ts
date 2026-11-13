import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './types'
import { workflowById } from './workflows'

const ctx = { settings: DEFAULT_SETTINGS, rules: {}, caseType: 'Medical malpractice' }

describe('new case checklist', () => {
  it('builds the second-chair checklist with dates', () => {
    const wf = workflowById('new_case')!
    const v = { ...wf.defaults!(ctx), assignedOn: '2026-11-13', servedOn: '2026-11-10', method: 'personal', aomFiled: '2026-11-02' }
    const d = wf.build(v, ctx)
    const by = (k: string) => d.find((x) => x.key === k)!.task!
    expect(d.map((x) => x.key)).toEqual(['sol_memo', 'answer', 'ids', 'disco', 'qpo', 'amd', 'mil'])
    expect(by('answer').due).toBe('2026-12-01') // 21 days after 11/10
    expect(by('ids').due).toBe('2026-12-29') // later of 12/1+28 or plaintiff's (12/15)+14
    expect(by('disco').due).toBe('2026-12-01')
    expect(by('qpo').due).toBe('2026-12-01')
    expect(by('amd').due).toBe('2027-02-01') // 91 days after 11/2 = Sun 1/31 -> Mon 2/1
    expect(by('mil').due).toBeUndefined()
    expect(by('sol_memo').due).toBe('2026-11-20')
    expect(by('answer').wfKey).toBe('answer')
  })
  it('works before service is known', () => {
    const wf = workflowById('new_case')!
    const d = wf.build({ assignedOn: '2026-11-13', medmal: '' }, { ...ctx, caseType: 'Premises liability' })
    expect(d.map((x) => x.key)).toEqual(['sol_memo', 'answer', 'ids', 'disco', 'qpo', 'mil'])
    expect(d[1].task!.due).toBeUndefined()
  })
  it('answer filed marks the answer done and shares checklist keys', () => {
    const d = workflowById('answer_filed')!.build({ answeredOn: '2026-11-13' }, ctx)
    expect(d[0]).toMatchObject({ type: 'complete', wfKey: 'answer' })
    expect(d.filter((x) => x.task?.wfKey).map((x) => x.task!.wfKey)).toEqual(['disco', 'qpo', 'qpo_followup', 'ids'])
    const ids = d.find((x) => x.task?.wfKey === 'ids')!.task!
    // Answer 11/13: plaintiff's IDS due 11/27 (holiday) -> 11/30; ours = later of 12/11 or 12/14
    expect(ids.due).toBe('2026-12-14')
  })
})
