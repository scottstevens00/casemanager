import { ChevronLeft, ChevronRight, Download, Pause, Play, Plus, Square, X } from 'lucide-react'
import { useState } from 'react'
import { addDays, fmtMDY, fmtShort, startOfWeek, todayISO } from '../lib/dates'
import { saveFile } from '../lib/platform'
import { timeXlsx } from '../lib/reports'
import { useStore } from '../lib/store'
import { cancelTimer, elapsedMs, fmtElapsed, pauseTimer, resumeTimer, startTimer, stopTimer, useTimer } from '../lib/timer'
import { openDialog, toast } from '../lib/ui'
import { codeLabel } from '../lib/utbms'
import { Field } from '../components/ui'

export function Time() {
  const s = useStore()
  const timer = useTimer()
  const [week, setWeek] = useState(startOfWeek(todayISO()))
  const [caseId, setCaseId] = useState('')
  const [narr, setNarr] = useState('')
  const end = addDays(week, 6)
  const entries = s
    .list('time')
    .filter((t) => t.date >= week && t.date <= end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const total = entries.reduce((x, e) => x + e.hours, 0)
  const byDay = Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => ({ d, h: entries.filter((e) => e.date === d).reduce((x, e) => x + e.hours, 0) }))

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Time</h1>
          <div className="sub">Tenths of an hour, rounded up, with UTBMS task and activity codes.</div>
        </div>
        <button className="btn" onClick={async () => {
          await saveFile(`Time ${week} to ${end}.xlsx`, timeXlsx(s.list('time'), s.list('cases'), week, end), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          toast('Spreadsheet downloaded')
        }}>
          <Download size={14} /> Export week
        </button>
        <button className="btn primary" onClick={() => openDialog({ type: 'time' })}>
          <Plus size={14} /> Log time
        </button>
      </div>

      <div className="card card-body" style={{ marginBottom: 16 }}>
        {timer ? (
          <div className="row wrap">
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, minWidth: 150 }}>
              {fmtElapsed(elapsedMs(timer))}
            </div>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{timer.narrative || 'Timer running'}</div>
              <div className="small muted">{s.find('cases', timer.caseId)?.name || 'No case'} · {timer.paused ? 'Paused' : 'Running'}</div>
            </div>
            {timer.paused ? (
              <button className="btn" onClick={resumeTimer}>
                <Play size={14} /> Resume
              </button>
            ) : (
              <button className="btn" onClick={pauseTimer}>
                <Pause size={14} /> Pause
              </button>
            )}
            <button className="btn primary" onClick={stopTimer}>
              <Square size={13} /> Stop &amp; log
            </button>
            <button className="btn ghost" title="Discard" onClick={cancelTimer}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <Field label="Case">
              <select className="select" style={{ width: 200 }} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                <option value="">— General —</option>
                {s.list('cases')
                  .filter((c) => c.status !== 'closed')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="What are you working on?" className="grow">
              <input className="input" value={narr} placeholder="e.g. Review medical records re: catheter insertion" onChange={(e) => setNarr(e.target.value)} />
            </Field>
            <button
              className="btn primary"
              onClick={() => {
                startTimer({ caseId: caseId || undefined, narrative: narr })
                setNarr('')
              }}
            >
              <Play size={14} /> Start timer
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <button className="icon-btn" onClick={() => setWeek(addDays(week, -7))}>
            <ChevronLeft size={18} />
          </button>
          <h2>
            Week of {fmtMDY(week)}
          </h2>
          <button className="icon-btn" onClick={() => setWeek(addDays(week, 7))}>
            <ChevronRight size={18} />
          </button>
          <div className="spacer" />
          <b>{total.toFixed(1)} hrs</b>
        </div>
        <div className="row wrap" style={{ padding: '10px 14px', gap: 6, borderBottom: '1px solid var(--line-2)' }}>
          {byDay.map((x) => (
            <span key={x.d} className={`chip ${x.d === todayISO() ? 'blue' : 'ghost'}`}>
              {fmtShort(x.d).slice(0, 3)} {x.h ? x.h.toFixed(1) : '–'}
            </span>
          ))}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Case</th>
                <th>Hours</th>
                <th>Codes</th>
                <th>Narrative</th>
              </tr>
            </thead>
            <tbody>
              {!entries.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    No time this week.
                  </td>
                </tr>
              )}
              {entries.map((t) => (
                <tr key={t.id} className="click" onClick={() => openDialog({ type: 'time', id: t.id })}>
                  <td className="nowrap">{fmtShort(t.date)}</td>
                  <td>{s.find('cases', t.caseId)?.name || <span className="muted">General</span>}</td>
                  <td>{t.hours.toFixed(1)}</td>
                  <td className="nowrap small" title={`${codeLabel(t.taskCode)} / ${codeLabel(t.activityCode)}`}>
                    {[t.taskCode, t.activityCode].filter(Boolean).join(' · ') || <span className="muted">—</span>}
                  </td>
                  <td>{t.narrative}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
