import { Briefcase, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { effectiveDue, sortByDue } from '../lib/actions'
import { todayISO } from '../lib/dates'
import { useStore } from '../lib/store'
import { CASE_STATUS_LABEL, type CaseStatus } from '../lib/types'
import { navigate, openDialog } from '../lib/ui'
import { DueChip } from '../components/TaskRow'
import { Seg } from '../components/ui'

export function Cases() {
  const s = useStore()
  const [filter, setFilter] = useState<CaseStatus | 'all'>('active')
  const [q, setQ] = useState('')
  const all = s.list('cases')
  const tasks = s.list('tasks').filter((t) => t.status !== 'done')
  const list = all
    .filter((c) => filter === 'all' || c.status === filter)
    .filter((c) => !q || [c.name, c.caption, c.caseNo, c.claimNo, c.fileNo, c.client, c.judge].some((x) => x?.toLowerCase().includes(q.toLowerCase())))
    .map((c) => {
      const open = tasks.filter((t) => t.caseId === c.id).sort(sortByDue)
      const next = open.find((t) => effectiveDue(t))
      return { c, open, next, nextDate: next ? effectiveDue(next) : undefined }
    })
    // Cases with something due soonest first; cases with nothing scheduled go last, by name.
    .sort((a, b) => (a.nextDate || '9999').localeCompare(b.nextDate || '9999') || a.c.name.localeCompare(b.c.name))

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Cases</h1>
          <div className="sub">{all.filter((c) => c.status === 'active').length} active</div>
        </div>
        <Seg
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'on_hold', label: 'On hold' },
            { value: 'closed', label: 'Closed' },
            { value: 'all', label: 'All' },
          ]}
        />
        <button className="btn primary" onClick={() => openDialog({ type: 'case' })}>
          <Plus size={15} /> New case
        </button>
      </div>
      {all.length > 6 && (
        <div className="quickadd" style={{ marginBottom: 14, maxWidth: 420, background: 'var(--card)' }}>
          <Search size={15} color="var(--muted)" />
          <input placeholder="Find a case by name, caption, case no., claim no.…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {!list.length && (
        <div className="card empty-big">
          <Briefcase size={30} />
          <h2>{all.length ? 'No cases here' : 'No cases yet'}</h2>
          <p>Add each active matter with a short name like “Adams”.</p>
          <button className="btn primary" onClick={() => openDialog({ type: 'case' })}>
            <Plus size={15} /> New case
          </button>
        </div>
      )}
      <div className="case-grid">
        {list.map(({ c, open, next }) => {
          const overdue = open.filter((t) => (effectiveDue(t) || '9999') < todayISO()).length
          const fus = open.filter((t) => t.kind === 'followup').length
          return (
            <div key={c.id} className="card case-card" onClick={() => navigate(`case/${c.id}`)}>
              <div className="row">
                <div className="case-name grow ellipsis">{c.name}</div>
                {c.status !== 'active' && <span className="chip ghost">{CASE_STATUS_LABEL[c.status]}</span>}
                {c.caseType && <span className="chip">{c.caseType}</span>}
              </div>
              {c.caption && <div className="small muted ellipsis">{c.caption}</div>}
              <div className="small muted">{[c.court, c.caseNo, c.judge && `Judge ${c.judge}`].filter(Boolean).join(' · ') || ' '}</div>
              <div className="row wrap" style={{ marginTop: 2 }}>
                <span className="chip ghost">{open.length} open</span>
                {overdue > 0 && <span className="chip red">{overdue} overdue</span>}
                {fus > 0 && <span className="chip purple">{fus} follow-up{fus > 1 ? 's' : ''}</span>}
              </div>
              {next ? (
                <div className="row small" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 8 }}>
                  <span className="grow ellipsis">
                    <span className="muted">Next: </span>
                    {next.title}
                  </span>
                  <DueChip date={effectiveDue(next)} />
                </div>
              ) : (
                <div className="small faint" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 8 }}>
                  Nothing scheduled
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
