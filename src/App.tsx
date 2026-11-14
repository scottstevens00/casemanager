import {
  Bell,
  Briefcase,
  Calculator as CalcIcon,
  CalendarDays,
  Clock,
  FileSpreadsheet,
  Home,
  ListChecks,
  Pause,
  Play,
  Plus,
  QrCode,
  Repeat,
  Settings as SettingsIcon,
  Square,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { effectiveDue } from './lib/actions'
import { backupStatus, onBackupStatus, reconnectBackup } from './lib/backup'
import { addBusinessDays, todayISO } from './lib/dates'
import { onReminders } from './lib/notify'
import { isNative } from './lib/platform'
import { useStore } from './lib/store'
import { elapsedMs, fmtElapsed, pauseTimer, resumeTimer, stopTimer, useTimer } from './lib/timer'
import { dismissToast, navigate, openDialog, toast, useUI } from './lib/ui'
import { dayRules } from './lib/actions'
import { AddMenu, CaseEditor, ConfirmDialog, EventEditor, TimeEditor, WorkflowDialog } from './components/Dialogs'
import { QuickAdd } from './components/QuickAdd'
import { ScannerDialog } from './components/Scanner'
import { TaskEditor } from './components/TaskEditor'
import { Calculator } from './screens/Calculator'
import { Calendar } from './screens/Calendar'
import { CaseDetail } from './screens/CaseDetail'
import { Cases } from './screens/Cases'
import { Reports } from './screens/Reports'
import { Settings } from './screens/Settings'
import { Sync } from './screens/Sync'
import { Tasks } from './screens/Tasks'
import { Time } from './screens/Time'
import { Today } from './screens/Today'

export function App() {
  const s = useStore()
  const ui = useUI()
  const [addOpen, setAddOpen] = useState(false)
  const [, force] = useState(0)
  useEffect(() => onBackupStatus(() => force((x) => x + 1)), [])
  useEffect(
    () =>
      onReminders((rs) => {
        if (rs.length === 1) toast(rs[0].title, 'ok', rs[0].taskId ? { label: 'Open', run: () => openDialog({ type: 'task', id: rs[0].taskId }) } : undefined)
        else toast(`${rs.length} reminders — see Today`, 'ok', { label: 'Today', run: () => navigate('today') })
      }),
    [],
  )

  // Theme
  useEffect(() => {
    const apply = () => {
      const dark = s.settings.theme === 'dark' || (s.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [s.settings.theme])

  // Keyboard shortcuts: N = new task, / = focus quick add
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ui.dialogs.length) return
      if (e.key === '/') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.topbar .quickadd input')?.focus()
      }
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        openDialog({ type: 'task' })
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [ui.dialogs.length])

  const today = todayISO()
  const open = s.list('tasks').filter((t) => t.status !== 'done')
  const overdue = open.filter((t) => t.kind !== 'followup' && (effectiveDue(t) || '9999') < today).length
  const dueToday = open.filter((t) => effectiveDue(t) === today).length
  const fuDue = open.filter((t) => t.kind === 'followup' && (effectiveDue(t) || '9999') <= today).length

  const route = ui.route
  let page: ReactNode
  switch (route[0]) {
    case 'cases':
      page = <Cases />
      break
    case 'case':
      page = <CaseDetail key={route[1]} id={route[1]} />
      break
    case 'tasks':
      page = <Tasks key={'t' + (route[1] || '')} preset={route[1]} />
      break
    case 'followups':
      page = <Tasks key="fu" followups />
      break
    case 'calendar':
      page = <Calendar />
      break
    case 'time':
      page = <Time />
      break
    case 'calculator':
      page = <Calculator />
      break
    case 'reports':
      page = <Reports />
      break
    case 'sync':
      page = <Sync />
      break
    case 'settings':
      page = <Settings />
      break
    default:
      page = <Today />
  }

  const nav = (to: string, icon: ReactNode, label: string, count?: number, alert?: boolean) => (
    <button className={`nav-item ${route[0] === to || (to === 'cases' && route[0] === 'case') ? 'active' : ''}`} onClick={() => navigate(to)}>
      {icon}
      <span>{label}</span>
      {count ? <span className={`count ${alert ? 'alert' : ''}`}>{count}</span> : null}
    </button>
  )

  const onAdd = (k: 'task' | 'followup' | 'event' | 'workflow' | 'time' | 'case' | 'scan') => {
    setAddOpen(false)
    const caseId = route[0] === 'case' ? route[1] : undefined
    if (k === 'task') openDialog({ type: 'task', draft: { caseId } })
    if (k === 'followup')
      openDialog({ type: 'task', draft: { caseId, kind: 'followup', status: 'waiting', sentOn: today, nextFollowUp: addBusinessDays(today, s.settings.followUpBusinessDays, dayRules()), category: 'Correspondence' } })
    if (k === 'event') openDialog({ type: 'event', draft: { caseId } })
    if (k === 'workflow') openDialog({ type: 'workflow', caseId })
    if (k === 'time') openDialog({ type: 'time', draft: { caseId } })
    if (k === 'case') openDialog({ type: 'case' })
    if (k === 'scan') openDialog({ type: 'scanner', caseId })
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">CM</div>
          <div>
            <div className="brand-name">Case Manager</div>
            <div className="brand-sub">{s.settings.userName}</div>
          </div>
        </div>
        {nav('today', <Home size={17} />, 'Today', overdue + dueToday, overdue > 0)}
        {nav('cases', <Briefcase size={17} />, 'Cases', s.list('cases').filter((c) => c.status === 'active').length)}
        {nav('tasks', <ListChecks size={17} />, 'Tasks', open.filter((t) => t.kind !== 'followup').length)}
        {nav('followups', <Repeat size={17} />, 'Follow-ups', fuDue, fuDue > 0)}
        {nav('calendar', <CalendarDays size={17} />, 'Calendar')}
        <div className="nav-section">Tools</div>
        {nav('calculator', <CalcIcon size={17} />, 'Deadline calculator')}
        {nav('time', <Clock size={17} />, 'Time')}
        {nav('reports', <FileSpreadsheet size={17} />, 'Reports')}
        {nav('sync', <QrCode size={17} />, 'Sync with phone')}
        {nav('settings', <SettingsIcon size={17} />, 'Settings')}
        <div className="sidebar-foot">
          <TimerWidget />
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="brand-mark only-mobile" style={{ width: 30, height: 30, fontSize: 13, flex: 'none' }} onClick={() => navigate('today')}>
            CM
          </div>
          <QuickAdd />
          <button className="btn primary hide-mobile" onClick={() => setAddOpen(true)}>
            <Plus size={15} /> Add
          </button>
          <button className="icon-btn only-mobile" onClick={() => navigate('settings')} aria-label="Settings">
            <SettingsIcon size={19} />
          </button>
        </div>
        <div className="content">
          {!isNative() && backupStatus() === 'needs-permission' && (
            <div className="page">
              <div className="banner">
                <Bell size={16} /> Chrome needs your OK to keep saving the backup file.
                <button className="btn sm" onClick={() => void reconnectBackup()}>
                  Allow
                </button>
              </div>
            </div>
          )}
          {page}
        </div>
      </div>

      <nav className="bottom-nav">
        <button className={route[0] === 'today' ? 'on' : ''} onClick={() => navigate('today')}>
          <Home size={20} />
          Today
          {overdue + dueToday > 0 && <span className="badge">{overdue + dueToday}</span>}
        </button>
        <button className={route[0] === 'cases' || route[0] === 'case' ? 'on' : ''} onClick={() => navigate('cases')}>
          <Briefcase size={20} />
          Cases
        </button>
        <button className="add" onClick={() => setAddOpen(true)} aria-label="Add">
          <Plus size={24} />
        </button>
        <button className={route[0] === 'followups' ? 'on' : ''} onClick={() => navigate('followups')}>
          <Repeat size={20} />
          Follow-ups
          {fuDue > 0 && <span className="badge">{fuDue}</span>}
        </button>
        <button className={route[0] === 'sync' ? 'on' : ''} onClick={() => navigate('sync')}>
          <QrCode size={20} />
          Sync
        </button>
      </nav>

      {addOpen && <AddMenu onPick={onAdd} onClose={() => setAddOpen(false)} />}
      {ui.dialogs.map((d, i) => (
        <DialogHost key={i} d={d} />
      ))}
      <div className="toasts">
        {ui.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone || ''}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DialogHost({ d }: { d: ReturnType<typeof useUI>['dialogs'][number] }) {
  switch (d.type) {
    case 'task':
      return <TaskEditor id={d.id} draft={d.draft} />
    case 'case':
      return <CaseEditor id={d.id} />
    case 'event':
      return <EventEditor id={d.id} draft={d.draft} />
    case 'workflow':
      return <WorkflowDialog caseId={d.caseId} workflowId={d.workflowId} />
    case 'scanner':
      return <ScannerDialog caseId={d.caseId} />
    case 'time':
      return <TimeEditor id={d.id} draft={d.draft} />
    case 'confirm':
      return <ConfirmDialog d={d} />
  }
}

function TimerWidget() {
  const t = useTimer()
  const s = useStore()
  if (!t)
    return (
      <button className="nav-item" onClick={() => navigate('time')}>
        <Play size={15} />
        <span>Start a timer</span>
      </button>
    )
  return (
    <div className="timer">
      <div className="row">
        <span className="clock grow">{fmtElapsed(elapsedMs(t))}</span>
        {t.paused ? (
          <button className="icon-btn" style={{ color: '#fff' }} onClick={resumeTimer} title="Resume">
            <Play size={15} />
          </button>
        ) : (
          <button className="icon-btn" style={{ color: '#fff' }} onClick={pauseTimer} title="Pause">
            <Pause size={15} />
          </button>
        )}
        <button className="icon-btn" style={{ color: '#fff' }} onClick={stopTimer} title="Stop and log">
          <Square size={14} />
        </button>
      </div>
      <div className="small ellipsis" style={{ color: '#aebbd0' }}>
        {s.find('cases', t.caseId)?.name || 'General'}
        {t.narrative ? ` · ${t.narrative}` : ''}
      </div>
    </div>
  )
}
