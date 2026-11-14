import { CalendarDays, Repeat, ScanLine, Sparkles } from 'lucide-react'
import { effectiveDue, sortByDue } from '../lib/actions'
import { addDays, diffDays, fmtLong, fmtShort, fmtTime, todayISO } from '../lib/dates'
import { useStore } from '../lib/store'
import { EVENT_KIND_LABEL, type Task } from '../lib/types'
import { navigate, openDialog } from '../lib/ui'
import { TaskRow } from '../components/TaskRow'
import { Empty } from '../components/ui'

export function Today() {
  const s = useStore()
  const today = todayISO()
  const open = s.list('tasks').filter((t) => t.status !== 'done')
  const nonFU = open.filter((t) => t.kind !== 'followup')
  const ed = (t: Task) => effectiveDue(t)
  const overdue = nonFU.filter((t) => (ed(t) || '9999') < today).sort(sortByDue)
  const dueToday = nonFU.filter((t) => ed(t) === today || (t.kind === 'summary' && t.target === today)).sort(sortByDue)
  const weekEnd = addDays(today, 7)
  const thisWeek = nonFU.filter((t) => {
    const d = ed(t)
    return !!d && d > today && d <= weekEnd && !(t.kind === 'summary' && t.target === today)
  }).sort(sortByDue)
  const fus = open.filter((t) => t.kind === 'followup').sort(sortByDue)
  const fuDue = fus.filter((t) => (effectiveDue(t) || '9999') <= today)
  const summaries = nonFU.filter((t) => t.kind === 'summary').sort(sortByDue)
  const noDate = nonFU.filter((t) => !ed(t) && t.kind === 'task').sort((a, b) => b.createdAt - a.createdAt)
  const events = s
    .list('events')
    .filter((e) => e.date >= today && e.date <= addDays(today, 14))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
  const doneToday = s.list('tasks').filter((t) => t.status === 'done' && t.completedOn === today)
  const hasData = s.list('cases').length + s.list('tasks').length > 0
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = s.settings.userName.split(' ')[0]

  if (!hasData) return <Welcome />

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>
            {greet}
            {first ? `, ${first}` : ''}
          </h1>
          <div className="sub">
            {fmtLong(today)}
            {doneToday.length ? ` · ${doneToday.length} done today` : ''}
          </div>
        </div>
        <button className="btn" onClick={() => openDialog({ type: 'workflow' })}>
          <Sparkles size={15} /> Log what happened
        </button>
        <button className="btn hide-mobile" onClick={() => openDialog({ type: 'scanner' })}>
          <ScanLine size={15} /> Scan order
        </button>
      </div>

      <div className="stats">
        <button className={`stat ${overdue.length ? 'red' : ''}`} onClick={() => navigate('tasks/overdue')}>
          <div className="n">{overdue.length}</div>
          <div className="l">Overdue</div>
        </button>
        <button className={`stat ${dueToday.length ? 'amber' : ''}`} onClick={() => navigate('tasks/week')}>
          <div className="n">{dueToday.length + thisWeek.length}</div>
          <div className="l">Due in the next 7 days</div>
        </button>
        <button className={`stat ${fuDue.length ? 'purple' : ''}`} onClick={() => navigate('followups')}>
          <div className="n">{fuDue.length}</div>
          <div className="l">Follow-ups to send · {fus.length} open</div>
        </button>
        <button className="stat blue" onClick={() => navigate('tasks/summaries')}>
          <div className="n">{summaries.length}</div>
          <div className="l">Summary reports open</div>
        </button>
      </div>

      <div className="grid-2">
        <div className="stack">
          {overdue.length > 0 && <Section title="Overdue" tone="red" items={overdue} />}
          <Section title="Today" items={dueToday} empty="Nothing due today." />
          <Section title="Follow-ups to send" icon={<Repeat size={15} />} items={fuDue} empty="No one to chase today." more={fus.length > fuDue.length ? () => navigate('followups') : undefined} moreLabel={`All ${fus.length} open follow-ups`} />
          <Section title="Coming up this week" items={thisWeek} empty="Nothing else due in the next 7 days." />
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <CalendarDays size={15} />
              <h2 className="grow">Next two weeks</h2>
              <button className="btn sm ghost" onClick={() => navigate('calendar')}>
                Calendar
              </button>
            </div>
            <div className="list">
              {!events.length && <Empty>No depositions, hearings or meetings in the next 14 days.</Empty>}
              {events.map((e) => {
                const c = s.find('cases', e.caseId)
                const n = diffDays(e.date, today)
                return (
                  <div key={e.id} className="task-row" onClick={() => openDialog({ type: 'event', id: e.id })}>
                    <div style={{ width: 54, flex: 'none' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtShort(e.date).slice(4)}</div>
                      <div className="tiny muted">{n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : fmtShort(e.date).slice(0, 3)}</div>
                    </div>
                    <div className="task-main">
                      <div className="task-title">{e.title}</div>
                      <div className="task-meta">
                        {c && <span className="chip case">{c.name}</span>}
                        <span className="chip green">{EVENT_KIND_LABEL[e.kind]}</span>
                        {e.time && <span>{fmtTime(e.time)}</span>}
                        {e.location && <span className="ellipsis">{e.location}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {summaries.length > 0 && <Section title="Summary reports" items={summaries} />}
          {noDate.length > 0 && <Section title="No due date" items={noDate.slice(0, 8)} more={noDate.length > 8 ? () => navigate('tasks') : undefined} moreLabel={`All ${noDate.length}`} />}
        </div>
      </div>
    </div>
  )
}

function Section(props: { title: string; items: Task[]; empty?: string; tone?: 'red'; icon?: React.ReactNode; more?: () => void; moreLabel?: string }) {
  return (
    <div className="card">
      <div className="card-head">
        {props.icon}
        <h2 style={{ color: props.tone === 'red' ? 'var(--red)' : undefined }}>{props.title}</h2>
        <span className="count">{props.items.length || ''}</span>
        <div className="spacer" />
        {props.more && (
          <button className="btn sm ghost" onClick={props.more}>
            {props.moreLabel || 'More'}
          </button>
        )}
      </div>
      <div className="list">
        {!props.items.length && <Empty>{props.empty}</Empty>}
        {props.items.map((t) => (
          <TaskRow key={t.id} t={t} />
        ))}
      </div>
    </div>
  )
}

function Welcome() {
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 720, margin: '30px auto' }}>
        <div className="card-body" style={{ padding: 28 }}>
          <div className="brand-mark" style={{ width: 44, height: 44, fontSize: 19, marginBottom: 14 }}>
            CM
          </div>
          <h1>Welcome to Case Manager</h1>
          <p className="muted">Everything stays on this computer. Start with your active cases, then add what's on your plate.</p>
          <ol className="steps-big" style={{ margin: '18px 0' }}>
            <li>
              <div>
                <b>Add your active cases.</b> Just a short name is enough to start; fill in the caption, court and claim info whenever.
              </div>
            </li>
            <li>
              <div>
                <b>Type tasks into the bar at the top</b> as they come in — “Adams: draft RFP responses by Fri for Heidi”.
              </div>
            </li>
            <li>
              <div>
                <b>Log what happens</b> — an answer filed, a deposition, a letter sent — and the deadlines and follow-ups are worked out for you.
              </div>
            </li>
            <li>
              <div>
                <b>Scan scheduling orders</b> to pull every date straight into the case.
              </div>
            </li>
          </ol>
          <div className="row wrap">
            <button className="btn primary" onClick={() => openDialog({ type: 'case' })}>
              Add your first case
            </button>
            <button className="btn" onClick={() => navigate('settings')}>
              Settings &amp; backup
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
