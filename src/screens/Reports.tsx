import { CalendarPlus, ChevronLeft, ChevronRight, Copy, FileSpreadsheet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { addDays, fmtMDY, todayISO } from '../lib/dates'
import { buildIcs, eventToIcs, taskToIcs, type IcsItem } from '../lib/ics'
import { copyText, saveFile } from '../lib/platform'
import { buildWeek, timeXlsx, weeklyEmailText, weeklyXlsx } from '../lib/reports'
import { useStore } from '../lib/store'
import { toast } from '../lib/ui'
import { Field } from '../components/ui'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function Reports() {
  const s = useStore()
  const [day, setDay] = useState(todayISO())
  const w = useMemo(() => buildWeek(day, { tasks: s.list('tasks'), events: s.list('events'), time: s.list('time') }), [day, s.version])
  const email = weeklyEmailText(w, s.list('cases'), s.settings.userName)
  const [from, setFrom] = useState(w.start)
  const [to, setTo] = useState(w.end)
  const [icsDays, setIcsDays] = useState(90)

  const downloadWeekly = async () => {
    await saveFile(`Weekly Task Report - ${s.settings.userName} - ${fmtMDY(w.start).replace(/\//g, '-')}.xlsx`, weeklyXlsx(w, s.list('cases'), s.settings.userName), XLSX)
    toast('Weekly report downloaded — attach it to your email')
  }

  const exportIcs = async () => {
    const today = todayISO()
    const end = addDays(today, icsDays)
    const items: IcsItem[] = []
    for (const e of s.list('events').filter((e) => e.date >= today && e.date <= end)) items.push(eventToIcs(e, s.find('cases', e.caseId)))
    for (const t of s.list('tasks').filter((t) => t.status !== 'done')) {
      const it = taskToIcs(t, s.find('cases', t.caseId))
      if (it && it.date >= today && it.date <= end) items.push(it)
    }
    if (!items.length) return toast('Nothing to export', 'warn')
    await saveFile(`Case Manager ${today}.ics`, buildIcs(items), 'text/calendar')
    toast(`Exported ${items.length} dates`)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Reports</h1>
          <div className="sub">Your weekly team update, time for billing, and dates for Outlook.</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <FileSpreadsheet size={16} color="var(--green)" />
            <h2 className="grow">Weekly team report</h2>
            <button className="icon-btn" onClick={() => setDay(addDays(w.start, -7))}>
              <ChevronLeft size={18} />
            </button>
            <span className="small" style={{ fontWeight: 600 }}>
              {fmtMDY(w.start)}–{fmtMDY(addDays(w.start, 4))}
            </span>
            <button className="icon-btn" onClick={() => setDay(addDays(w.start, 7))}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="card-body">
            <div className="row wrap" style={{ marginBottom: 12 }}>
              <span className="chip green">{w.completed.length} completed</span>
              <span className="chip">{w.open.length} open</span>
              <span className="chip purple">{w.waiting.length} waiting on others</span>
              <span className="chip ghost">{w.events.length} events</span>
              {w.totalHours > 0 && <span className="chip blue">{w.totalHours.toFixed(1)} hrs</span>}
            </div>
            <div className="row wrap">
              <button className="btn primary" onClick={downloadWeekly}>
                <FileSpreadsheet size={14} /> Download spreadsheet
              </button>
              <button className="btn" onClick={async () => toast((await copyText(email)) ? 'Email text copied — paste it into Outlook' : "Couldn't copy", 'ok')}>
                <Copy size={14} /> Copy email text
              </button>
            </div>
            <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--bg)', borderRadius: 8, padding: 12, marginTop: 12, maxHeight: 320, overflow: 'auto', fontFamily: 'inherit' }}>
              {email}
            </pre>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <FileSpreadsheet size={16} color="var(--blue)" />
              <h2>Time entries</h2>
            </div>
            <div className="card-body">
              <div className="row wrap" style={{ alignItems: 'flex-end' }}>
                <Field label="From">
                  <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </Field>
                <Field label="To">
                  <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </Field>
                <button
                  className="btn"
                  onClick={async () => {
                    await saveFile(`Time ${from} to ${to}.xlsx`, timeXlsx(s.list('time'), s.list('cases'), from, to), XLSX)
                    toast('Time spreadsheet downloaded')
                  }}
                >
                  Download
                </button>
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>
                Date, matter, file and claim numbers, UTBMS codes, hours and narrative — ready to key into billing.
              </p>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <CalendarPlus size={16} color="var(--blue)" />
              <h2>Outlook calendar</h2>
            </div>
            <div className="card-body">
              <div className="row wrap" style={{ alignItems: 'flex-end' }}>
                <Field label="Upcoming">
                  <select className="select" value={icsDays} onChange={(e) => setIcsDays(Number(e.target.value))}>
                    <option value={30}>Next 30 days</option>
                    <option value={90}>Next 90 days</option>
                    <option value={180}>Next 6 months</option>
                    <option value={365}>Next year</option>
                  </select>
                </Field>
                <button className="btn" onClick={exportIcs}>
                  Download .ics
                </button>
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>
                In Outlook: <b>File → Open &amp; Export → Import/Export → Import an iCalendar file</b>, then choose <b>Import</b>. Deadlines show as all-day items with a reminder the morning before, and Outlook's reminders reach your phone. Importing the same dates twice can make duplicates, so for one-off additions use “Add to Outlook” on the task itself.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
