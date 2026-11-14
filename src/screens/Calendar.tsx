import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { effectiveDue } from '../lib/actions'
import { addDays, courtHolidays, fmtShort, fmtTime, holidayName, MONTH_NAMES, todayISO, weekday, type ISODate } from '../lib/dates'
import { buildIcs, eventToIcs, taskToIcs, type IcsItem } from '../lib/ics'
import { saveFile } from '../lib/platform'
import { useStore } from '../lib/store'
import { EVENT_KIND_LABEL, TASK_KIND_LABEL } from '../lib/types'
import { navigate, openDialog, toast } from '../lib/ui'
import { Seg } from '../components/ui'

type Mode = 'agenda' | 'month'

export function Calendar() {
  const s = useStore()
  const today = todayISO()
  const [mode, setMode] = useState<Mode>('agenda')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [days, setDays] = useState(60)
  const tasks = s.list('tasks').filter((t) => t.status !== 'done')
  const events = s.list('events')

  const itemsOn = (d: ISODate) => ({
    events: events.filter((e) => e.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    tasks: tasks.filter((t) => effectiveDue(t) === d || t.due === d || t.givenDue === d || (t.kind === 'summary' && t.target === d)),
  })

  const exportUpcoming = async () => {
    const end = addDays(today, 180)
    const items: IcsItem[] = []
    for (const e of events.filter((e) => e.date >= today && e.date <= end)) items.push(eventToIcs(e, s.find('cases', e.caseId)))
    for (const t of tasks) {
      const it = taskToIcs(t, s.find('cases', t.caseId))
      if (it && it.date >= today && it.date <= end) items.push(it)
    }
    if (!items.length) return toast('Nothing upcoming to export', 'warn')
    await saveFile(`Case Manager ${today}.ics`, buildIcs(items), 'text/calendar')
    toast(`Exported ${items.length} dates. In Outlook: File → Open & Export → Import/Export → iCalendar.`)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Calendar</h1>
          <div className="sub">Depositions, hearings, deadlines and follow-ups. Court holidays are marked.</div>
        </div>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'agenda', label: 'Agenda' },
            { value: 'month', label: 'Month' },
          ]}
        />
        <button className="btn" onClick={exportUpcoming}>
          <CalendarPlus size={14} /> Send to Outlook
        </button>
        <button className="btn primary" onClick={() => openDialog({ type: 'event' })}>
          <Plus size={14} /> Add date
        </button>
      </div>

      {mode === 'agenda' && (
        <div className="card">
          <div className="list">
            {Array.from({ length: days }, (_, i) => addDays(today, i)).map((d) => {
              const it = itemsOn(d)
              const hol = holidayName(d)
              if (!it.events.length && !it.tasks.length && !hol) return null
              return (
                <div key={d} className="agenda-day">
                  <div className="agenda-date">
                    <div className="d" style={{ color: d === today ? 'var(--blue)' : undefined }}>{d === today ? 'Today' : fmtShort(d)}</div>
                    <div className="w">{d === today ? fmtShort(d) : d.slice(0, 4)}</div>
                  </div>
                  <div>
                    {hol && <div className="small" style={{ color: 'var(--gold)', fontWeight: 600 }}>Court holiday — {hol}</div>}
                    {it.events.map((e) => (
                      <div key={e.id} className="agenda-item" onClick={() => openDialog({ type: 'event', id: e.id })}>
                        <span className="time-col">{e.time ? fmtTime(e.time) : 'All day'}</span>
                        <div>
                          <span className="t" style={{ fontWeight: 600 }}>{e.title}</span>{' '}
                          {e.caseId && <span className="chip case">{s.find('cases', e.caseId)?.name}</span>} <span className="chip green">{EVENT_KIND_LABEL[e.kind]}</span>
                        </div>
                      </div>
                    ))}
                    {it.tasks.map((t) => (
                      <div key={t.id} className="agenda-item" onClick={() => openDialog({ type: 'task', id: t.id })}>
                        <span className="time-col">
                          {t.kind === 'followup' && t.nextFollowUp === d ? 'Nudge' : t.kind === 'summary' && t.target === d ? 'Goal' : t.givenDue === d ? (t.assignedBy ? `To ${t.assignedBy.split(' ')[0]}` : 'Given') : t.givenDue ? 'Court' : 'Due'}
                        </span>
                        <div>
                          <span className="t">{t.title}</span>{' '}
                          {t.caseId && <span className="chip case">{s.find('cases', t.caseId)?.name}</span>}{' '}
                          <span className={`chip ${t.kind === 'followup' ? 'purple' : t.kind === 'summary' ? 'blue' : 'ghost'}`}>{TASK_KIND_LABEL[t.kind]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="card-body" style={{ borderTop: '1px solid var(--line-2)' }}>
            <button className="btn sm" onClick={() => setDays(days + 90)}>
              Show 90 more days
            </button>
          </div>
        </div>
      )}

      {mode === 'month' && <Month month={month} setMonth={setMonth} itemsOn={itemsOn} />}
    </div>
  )
}

function Month({ month, setMonth, itemsOn }: { month: string; setMonth: (m: string) => void; itemsOn: (d: ISODate) => { events: { id: string; title: string }[]; tasks: { id: string; title: string; kind: string }[] } }) {
  const [y, m] = month.split('-').map(Number)
  const first = `${month}-01`
  const start = addDays(first, -((weekday(first) + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const today = todayISO()
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  courtHolidays(y)
  return (
    <div className="card">
      <div className="card-head">
        <button className="icon-btn" onClick={() => shift(-1)}>
          <ChevronLeft size={18} />
        </button>
        <h2 style={{ minWidth: 150, textAlign: 'center' }}>
          {MONTH_NAMES[m - 1]} {y}
        </h2>
        <button className="icon-btn" onClick={() => shift(1)}>
          <ChevronRight size={18} />
        </button>
        <button className="btn sm ghost" onClick={() => setMonth(today.slice(0, 7))}>
          Today
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="tiny muted" style={{ padding: '6px 8px', fontWeight: 650, borderBottom: '1px solid var(--line)' }}>
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const it = itemsOn(d)
          const hol = holidayName(d)
          const out = d.slice(0, 7) !== month
          const wk = weekday(d) === 0 || weekday(d) === 6
          return (
            <div
              key={d}
              style={{
                minHeight: 92,
                borderBottom: '1px solid var(--line-2)',
                borderRight: '1px solid var(--line-2)',
                padding: 5,
                background: hol ? 'var(--gold-soft)' : wk ? 'var(--bg)' : undefined,
                opacity: out ? 0.45 : 1,
                overflow: 'hidden',
              }}
            >
              <div className="tiny" style={{ fontWeight: 700, color: d === today ? 'var(--blue)' : undefined }}>
                {Number(d.slice(8))}
                {hol && <span style={{ color: 'var(--gold)', fontWeight: 600 }}> · {hol}</span>}
              </div>
              {it.events.map((e) => (
                <div key={e.id} className="tiny ellipsis" style={{ cursor: 'pointer', color: 'var(--green)', fontWeight: 600 }} onClick={() => openDialog({ type: 'event', id: e.id })}>
                  ● {e.title}
                </div>
              ))}
              {it.tasks.slice(0, 4).map((t) => (
                <div key={t.id} className="tiny ellipsis" style={{ cursor: 'pointer', color: t.kind === 'followup' ? 'var(--purple)' : 'var(--ink-2)' }} onClick={() => openDialog({ type: 'task', id: t.id })}>
                  ○ {t.title}
                </div>
              ))}
              {it.tasks.length > 4 && (
                <div className="tiny muted" style={{ cursor: 'pointer' }} onClick={() => navigate('calendar')}>
                  +{it.tasks.length - 4} more
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
