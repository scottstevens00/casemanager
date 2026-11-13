import { Repeat, Search } from 'lucide-react'
import { useState } from 'react'
import { effectiveDue, sortByDue } from '../lib/actions'
import { addDays, todayISO } from '../lib/dates'
import { useStore } from '../lib/store'
import type { Task, TaskKind } from '../lib/types'
import { navigate, openDialog } from '../lib/ui'
import { TaskRow } from '../components/TaskRow'
import { Empty, Seg } from '../components/ui'

type View = 'open' | 'done' | 'all'
type Preset = 'all' | 'overdue' | 'week' | 'summaries' | 'nodate'

export function Tasks({ preset: initialPreset = 'all', followups = false }: { preset?: string; followups?: boolean }) {
  const s = useStore()
  const [view, setView] = useState<View>('open')
  const [preset, setPreset] = useState<Preset>((initialPreset as Preset) || 'all')
  const [caseId, setCaseId] = useState('')
  const [kind, setKind] = useState<TaskKind | ''>(followups ? 'followup' : '')
  const [who, setWho] = useState('')
  const [q, setQ] = useState('')
  const today = todayISO()

  let list = s.list('tasks')
  if (view === 'open') list = list.filter((t) => t.status !== 'done')
  if (view === 'done') list = list.filter((t) => t.status === 'done')
  if (caseId) list = list.filter((t) => (caseId === '_none' ? !t.caseId : t.caseId === caseId))
  if (kind) list = list.filter((t) => t.kind === kind)
  if (who) list = list.filter((t) => t.assignedBy === who || t.waitingOn === who)
  if (q) {
    const ql = q.toLowerCase()
    list = list.filter((t) => [t.title, t.notes, t.waitingOn, t.assignedBy, s.find('cases', t.caseId)?.name].some((x) => x?.toLowerCase().includes(ql)))
  }
  if (preset === 'overdue') list = list.filter((t) => (effectiveDue(t) || '9999') < today)
  if (preset === 'week') list = list.filter((t) => {
    const d = effectiveDue(t)
    return !!d && d >= today && d <= addDays(today, 7)
  })
  if (preset === 'summaries') list = list.filter((t) => t.kind === 'summary')
  if (preset === 'nodate') list = list.filter((t) => !effectiveDue(t))
  list = view === 'done' ? list.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)) : list.sort(sortByDue)

  const groups: { title: string; items: Task[] }[] = []
  if (view === 'done') groups.push({ title: 'Completed', items: list })
  else {
    const g = (title: string, f: (d?: string) => boolean) => groups.push({ title, items: list.filter((t) => f(effectiveDue(t))) })
    g('Overdue', (d) => !!d && d < today)
    g('Today', (d) => d === today)
    g('Next 7 days', (d) => !!d && d > today && d <= addDays(today, 7))
    g('Next 30 days', (d) => !!d && d > addDays(today, 7) && d <= addDays(today, 30))
    g('Later', (d) => !!d && d > addDays(today, 30))
    g('No date', (d) => !d)
  }
  const people = [...new Set(s.list('tasks').flatMap((t) => [t.assignedBy, t.waitingOn]).filter(Boolean) as string[])].sort()

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>{followups ? 'Follow-ups' : 'Tasks'}</h1>
          <div className="sub">
            {followups
              ? `Letters, emails and calls you're waiting on. You get a nudge every ${s.settings.followUpBusinessDays} business days until the loop is closed.`
              : `${list.length} ${view === 'done' ? 'completed' : view === 'open' ? 'open' : ''} task${list.length === 1 ? '' : 's'}`}
          </div>
        </div>
        {followups && (
          <button className="btn primary" onClick={() => openDialog({ type: 'workflow', workflowId: 'letter_sent' })}>
            <Repeat size={14} /> New follow-up
          </button>
        )}
      </div>

      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Seg
          value={view}
          onChange={setView}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'done', label: 'Completed' },
            { value: 'all', label: 'All' },
          ]}
        />
        {!followups && (
          <select className="select" style={{ width: 'auto' }} value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            <option value="all">Any date</option>
            <option value="overdue">Overdue</option>
            <option value="week">Next 7 days</option>
            <option value="summaries">Summary reports</option>
            <option value="nodate">No date</option>
          </select>
        )}
        <select className="select" style={{ width: 'auto' }} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
          <option value="">All cases</option>
          <option value="_none">No case</option>
          {s.list('cases').map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {!followups && (
          <select className="select" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as TaskKind | '')}>
            <option value="">All types</option>
            <option value="task">Tasks</option>
            <option value="deadline">Deadlines</option>
            <option value="followup">Follow-ups</option>
            <option value="summary">Summaries</option>
          </select>
        )}
        {people.length > 0 && (
          <select className="select" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Anyone</option>
            {people.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        )}
        <div className="quickadd" style={{ maxWidth: 260, height: 34, background: 'var(--card)' }}>
          <Search size={14} color="var(--muted)" />
          <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="stack">
        {!list.length && (
          <div className="card">
            <Empty>
              {followups ? (
                <>
                  Nothing you're waiting on. When you send a letter or email that needs an answer, log it under{' '}
                  <a href="#/followups" onClick={(e) => (e.preventDefault(), openDialog({ type: 'workflow', workflowId: 'letter_sent' }))}>
                    New follow-up
                  </a>
                  .
                </>
              ) : (
                'Nothing matches.'
              )}
            </Empty>
          </div>
        )}
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <div key={g.title} className="card">
              <div className="card-head">
                <h2 style={{ color: g.title === 'Overdue' ? 'var(--red)' : undefined }}>{g.title}</h2>
                <span className="count">{g.items.length}</span>
              </div>
              <div className="list">
                {g.items.map((t) => (
                  <TaskRow key={t.id} t={t} />
                ))}
              </div>
            </div>
          ))}
      </div>
      {initialPreset !== 'all' && preset !== 'all' && (
        <p className="small" style={{ marginTop: 12 }}>
          <a href="#/tasks" onClick={() => navigate('tasks')}>
            Show all tasks
          </a>
        </p>
      )}
    </div>
  )
}
