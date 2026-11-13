import { ArrowLeft, CalendarPlus, Clock, Edit3, Mail, Phone, Plus, ScanLine, Sparkles, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { sortByDue } from '../lib/actions'
import { fmtLong, fmtShort, fmtTime, todayISO } from '../lib/dates'
import { buildIcs, eventToIcs, taskToIcs } from '../lib/ics'
import { saveFile } from '../lib/platform'
import { useStore } from '../lib/store'
import { CASE_STATUS_LABEL, EVENT_KIND_LABEL, type Contact } from '../lib/types'
import { navigate, openDialog, toast } from '../lib/ui'
import { codeLabel } from '../lib/utbms'
import { ContactEditor } from '../components/Dialogs'
import { QuickAdd } from '../components/QuickAdd'
import { TaskRow } from '../components/TaskRow'
import { Empty } from '../components/ui'

type Tab = 'tasks' | 'dates' | 'contacts' | 'time' | 'done' | 'info'

export function CaseDetail({ id }: { id: string }) {
  const s = useStore()
  const c = s.find('cases', id)
  const [tab, setTab] = useState<Tab>('tasks')
  const [contact, setContact] = useState<Contact | 'new' | null>(null)
  if (!c)
    return (
      <div className="page">
        <p>
          That case doesn't exist. <a href="#/cases">Back to cases</a>
        </p>
      </div>
    )
  const tasks = s.list('tasks').filter((t) => t.caseId === id)
  const open = tasks.filter((t) => t.status !== 'done').sort(sortByDue)
  const done = tasks.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
  const today = todayISO()
  const events = s.list('events').filter((e) => e.caseId === id).sort((a, b) => a.date.localeCompare(b.date))
  const deadlines = open.filter((t) => t.kind === 'deadline' && t.due)
  const dates = [
    ...events.map((e) => ({ date: e.date, kind: 'event' as const, e })),
    ...deadlines.map((t) => ({ date: t.due!, kind: 'task' as const, t })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const time = s.list('time').filter((t) => t.caseId === id).sort((a, b) => b.date.localeCompare(a.date))
  const hours = time.reduce((x, t) => x + t.hours, 0)

  const exportAll = async () => {
    const items = [
      ...events.filter((e) => e.date >= today).map((e) => eventToIcs(e, c)),
      ...open.map((t) => taskToIcs(t, c)).filter((x) => !!x),
    ]
    if (!items.length) return toast('No upcoming dates to export', 'warn')
    await saveFile(`${c.name} - dates.ics`, buildIcs(items as never, `Case Manager — ${c.name}`), 'text/calendar')
    toast(`Exported ${items.length} dates — open the file in Outlook to import`)
  }

  return (
    <div className="page">
      <button className="btn ghost sm" style={{ marginBottom: 8 }} onClick={() => navigate('cases')}>
        <ArrowLeft size={14} /> Cases
      </button>
      <div className="page-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row wrap">
            <h1>{c.name}</h1>
            <span className={`chip ${c.status === 'active' ? 'green' : 'ghost'}`}>{CASE_STATUS_LABEL[c.status]}</span>
            {c.caseType && <span className="chip">{c.caseType}</span>}
          </div>
          {c.caption && <div className="sub">{c.caption}</div>}
          <div className="small muted" style={{ marginTop: 2 }}>
            {[c.court, c.caseNo && `No. ${c.caseNo}`, c.judge && `Judge ${c.judge}`].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button className="btn" onClick={() => openDialog({ type: 'case', id })}>
          <Edit3 size={14} /> Edit
        </button>
        <button className="btn" onClick={() => openDialog({ type: 'scanner', caseId: id })}>
          <ScanLine size={14} /> Scan order
        </button>
        <button className="btn primary" onClick={() => openDialog({ type: 'workflow', caseId: id })}>
          <Sparkles size={14} /> Log what happened
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <QuickAdd caseId={id} />
      </div>

      <div className="tabs">
        {(
          [
            ['tasks', 'Open', open.length],
            ['dates', 'Key dates', dates.filter((d) => d.date >= today).length],
            ['contacts', 'Contacts', c.contacts?.length || 0],
            ['time', 'Time', time.length ? hours.toFixed(1) + 'h' : 0],
            ['done', 'Completed', done.length],
            ['info', 'Details', ''],
          ] as [Tab, string, number | string][]
        ).map(([k, l, n]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
            {n ? <span className="n">{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'tasks' && (
        <div className="card">
          <div className="list">
            {!open.length && <Empty>No open tasks. Type one above, or log what happened to build the deadlines.</Empty>}
            {open.map((t) => (
              <TaskRow key={t.id} t={t} showCase={false} />
            ))}
          </div>
        </div>
      )}

      {tab === 'dates' && (
        <div className="card">
          <div className="card-head">
            <h2 className="grow">Key dates and deadlines</h2>
            <button className="btn sm" onClick={exportAll}>
              <CalendarPlus size={13} /> Send all to Outlook
            </button>
            <button className="btn sm" onClick={() => openDialog({ type: 'event', draft: { caseId: id } })}>
              <Plus size={13} /> Add date
            </button>
          </div>
          <div className="list">
            {!dates.length && <Empty>No dates yet. Scan the scheduling order or log a deposition or hearing.</Empty>}
            {dates.map((d) =>
              d.kind === 'event' ? (
                <div key={d.e.id} className="task-row" style={{ opacity: d.date < today ? 0.6 : 1 }} onClick={() => openDialog({ type: 'event', id: d.e.id })}>
                  <div style={{ width: 120, flex: 'none' }} className="small">
                    <b>{fmtShort(d.date)}</b>, {d.date.slice(0, 4)}
                    {d.e.time && <div className="muted">{fmtTime(d.e.time)}</div>}
                  </div>
                  <div className="task-main">
                    <div className="task-title">{d.e.title}</div>
                    <div className="task-meta">
                      <span className="chip green">{EVENT_KIND_LABEL[d.e.kind]}</span>
                      {d.e.location && <span>{d.e.location}</span>}
                      {d.e.source && <span className="faint">{d.e.source}</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={d.t.id} style={{ display: 'flex' }}>
                  <div style={{ width: 134, flex: 'none', padding: '10px 0 0 14px' }} className="small">
                    <b>{fmtShort(d.date)}</b>, {d.date.slice(0, 4)}
                  </div>
                  <div className="grow">
                    <TaskRow t={d.t} showCase={false} compact />
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="card">
          <div className="card-head">
            <h2 className="grow">Contacts</h2>
            <button className="btn sm" onClick={() => setContact('new')}>
              <UserPlus size={13} /> Add contact
            </button>
          </div>
          <div className="list">
            {!c.contacts?.length && <Empty>Plaintiff's counsel, adjuster, experts, court clerk…</Empty>}
            {(c.contacts || [])
              .slice()
              .sort((a, b) => (a.role || '').localeCompare(b.role || ''))
              .map((k) => (
                <div key={k.id} className="task-row" onClick={() => setContact(k)}>
                  <div className="task-main">
                    <div className="task-title">{k.name}</div>
                    <div className="task-meta">
                      {k.role && <span className="chip">{k.role}</span>}
                      {k.org && <span>{k.org}</span>}
                      {k.phone && (
                        <a href={`tel:${k.phone}`} onClick={(e) => e.stopPropagation()} className="row" style={{ gap: 3 }}>
                          <Phone size={11} /> {k.phone}
                        </a>
                      )}
                      {k.email && (
                        <a href={`mailto:${k.email}`} onClick={(e) => e.stopPropagation()} className="row" style={{ gap: 3 }}>
                          <Mail size={11} /> {k.email}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === 'time' && (
        <div className="card">
          <div className="card-head">
            <h2 className="grow">Time · {hours.toFixed(1)} hours</h2>
            <button className="btn sm" onClick={() => openDialog({ type: 'time', draft: { caseId: id } })}>
              <Clock size={13} /> Log time
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Hours</th>
                  <th>Codes</th>
                  <th>Narrative</th>
                </tr>
              </thead>
              <tbody>
                {!time.length && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No time logged.
                    </td>
                  </tr>
                )}
                {time.map((t) => (
                  <tr key={t.id} className="click" onClick={() => openDialog({ type: 'time', id: t.id })}>
                    <td className="nowrap">{fmtShort(t.date)}</td>
                    <td>{t.hours.toFixed(1)}</td>
                    <td className="nowrap small" title={`${codeLabel(t.taskCode)} / ${codeLabel(t.activityCode)}`}>
                      {[t.taskCode, t.activityCode].filter(Boolean).join(' · ')}
                    </td>
                    <td>{t.narrative}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'done' && (
        <div className="card">
          <div className="list">
            {!done.length && <Empty>Nothing completed yet.</Empty>}
            {done.map((t) => (
              <TaskRow key={t.id} t={t} showCase={false} />
            ))}
          </div>
        </div>
      )}

      {tab === 'info' && (
        <div className="grid-2">
          <div className="card card-body">
            <dl className="kv" style={{ margin: 0 }}>
              <dt>Caption</dt>
              <dd>{c.caption || '—'}</dd>
              <dt>Our client</dt>
              <dd>{c.client || '—'}</dd>
              <dt>Court</dt>
              <dd>{c.court || '—'}</dd>
              <dt>Case no.</dt>
              <dd>{c.caseNo || '—'}</dd>
              <dt>Judge</dt>
              <dd>{c.judge || '—'}</dd>
              <dt>Supervising</dt>
              <dd>{c.partner || '—'}</dd>
              <dt>Plaintiff's counsel</dt>
              <dd>{c.plaintiffCounsel || '—'}</dd>
            </dl>
          </div>
          <div className="card card-body">
            <dl className="kv" style={{ margin: 0 }}>
              <dt>Carrier</dt>
              <dd>{c.carrier || '—'}</dd>
              <dt>Adjuster</dt>
              <dd>{c.adjuster || '—'}</dd>
              <dt>Claim no.</dt>
              <dd>{c.claimNo || '—'}</dd>
              <dt>File no.</dt>
              <dd>{c.fileNo || '—'}</dd>
              <dt>Added</dt>
              <dd>{fmtLong(new Date(c.createdAt).toISOString().slice(0, 10))}</dd>
              <dt>Notes</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{c.notes || '—'}</dd>
            </dl>
          </div>
        </div>
      )}

      {contact && <ContactEditor caseId={id} contact={contact === 'new' ? undefined : contact} onDone={() => setContact(null)} />}
    </div>
  )
}
