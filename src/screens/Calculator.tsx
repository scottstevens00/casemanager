import { Calculator as CalcIcon, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dayRules } from '../lib/actions'
import { courtHolidays, fmtLong, isISODate, todayISO } from '../lib/dates'
import { describeComputation, RULE_GROUPS, RULES } from '../lib/rules'
import { useStore } from '../lib/store'
import { openDialog } from '../lib/ui'
import { Field } from '../components/ui'

export function Calculator() {
  const s = useStore()
  const [ruleId, setRuleId] = useState('answer')
  const rule = RULES.find((r) => r.id === ruleId)!
  const [date, setDate] = useState(todayISO())
  const [date2, setDate2] = useState('')
  const [opts, setOpts] = useState<Record<string, string>>({})
  const [caseId, setCaseId] = useState('')
  const pick = (id: string) => {
    setRuleId(id)
    const r = RULES.find((x) => x.id === id)!
    const o: Record<string, string> = {}
    for (const op of r.options || []) o[op.key] = op.choices[0]?.value || (op.key === 'n' ? '14' : '')
    setOpts(o)
  }
  const result = useMemo(() => {
    if (!isISODate(date)) return undefined
    try {
      return rule.compute(date, opts, dayRules(), isISODate(date2) ? date2 : undefined)
    } catch {
      return undefined
    }
  }, [rule, date, date2, opts, s.settings.extraClosed])
  const year = Number(todayISO().slice(0, 4))

  const addToCase = () => {
    if (!result) return
    const backward = /before|Hearing date|hearing date/.test(rule.trigger) || rule.id.startsWith('sd_') || rule.id.startsWith('motion_') || rule.id === 'ce_summary'
    openDialog({
      type: 'task',
      draft: {
        title: rule.title,
        kind: 'deadline',
        status: 'open',
        priority: backward || /answer|appeal|amd|disc/.test(rule.id) ? 'high' : 'normal',
        due: result.date,
        caseId: caseId || undefined,
        rule: describeComputation(rule, result),
        source: 'Deadline calculator',
      },
    })
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Deadline calculator</h1>
          <div className="sub">Michigan court rules, counted under MCR 1.108 with the MCR 8.110(D)(2) court holidays.</div>
        </div>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(260px, 340px) 1fr' }}>
        <div className="card rule-list" style={{ padding: 8, alignSelf: 'start' }}>
          {RULE_GROUPS.map((g) => (
            <div key={g} style={{ marginBottom: 6 }}>
              <div className="tiny muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', padding: '8px 10px 4px' }}>
                {g}
              </div>
              {RULES.filter((r) => r.group === g).map((r) => (
                <button key={r.id} className={r.id === ruleId ? 'on' : ''} onClick={() => pick(r.id)}>
                  {r.title}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="stack">
          <div className="card card-body">
            <div className="row" style={{ marginBottom: 12 }}>
              <CalcIcon size={18} color="var(--blue)" />
              <h2 className="grow">{rule.title}</h2>
              <span className="chip ghost">{rule.cite}</span>
            </div>
            <div className="form-grid">
              <Field label={rule.trigger}>
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              {rule.trigger2 && (
                <Field label={rule.trigger2}>
                  <input className="input" type="date" value={date2} onChange={(e) => setDate2(e.target.value)} />
                </Field>
              )}
              {(rule.options || []).map((o) =>
                o.choices.length ? (
                  <Field key={o.key} label={o.label}>
                    <select className="select" value={opts[o.key] || o.choices[0].value} onChange={(e) => setOpts({ ...opts, [o.key]: e.target.value })}>
                      {o.choices.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field key={o.key} label={o.label}>
                    <input className="input" type="number" min="0" value={opts[o.key] ?? '14'} onChange={(e) => setOpts({ ...opts, [o.key]: e.target.value })} />
                  </Field>
                ),
              )}
            </div>
            {result && (
              <div className="result" style={{ marginTop: 16 }}>
                <div className="small muted" style={{ fontWeight: 600 }}>
                  Deadline
                </div>
                <div className="big">{fmtLong(result.date)}</div>
                <ol className="steps">
                  {result.steps.map((st, i) => (
                    <li key={i}>{st}</li>
                  ))}
                </ol>
                {rule.note && <div className="rule-note" style={{ background: 'var(--card)' }}>{rule.note}</div>}
              </div>
            )}
            <div className="row wrap" style={{ marginTop: 14 }}>
              <select className="select" style={{ width: 220 }} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                <option value="">— Case —</option>
                {s.list('cases')
                  .filter((c) => c.status !== 'closed')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <button className="btn primary" disabled={!result} onClick={addToCase}>
                <Plus size={14} /> Add as a deadline
              </button>
            </div>
            <p className="tiny muted" style={{ marginBottom: 0 }}>
              A court order or local administrative order can change any of these. Always check the order and the current rule.
            </p>
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Michigan court holidays</h2>
            </div>
            <div className="card-body grid-2" style={{ gap: 12 }}>
              {[year, year + 1].map((y) => (
                <div key={y}>
                  <h3 style={{ marginBottom: 6 }}>{y}</h3>
                  <table className="table small">
                    <tbody>
                      {courtHolidays(y).map((h) => (
                        <tr key={h.date}>
                          <td className="nowrap">{fmtLong(h.date).replace(/, \d{4}$/, '')}</td>
                          <td>{h.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
