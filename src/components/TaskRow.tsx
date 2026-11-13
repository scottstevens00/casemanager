import { Check as CheckIcon, Clock, Mail, MessageSquareReply, Repeat } from 'lucide-react'
import { completeTask, dayRules, dueState, effectiveDue, markFollowedUp, reopenTask, snooze } from '../lib/actions'
import { businessDaysBetween, diffDays, fmtShort, relDay, todayISO, type ISODate } from '../lib/dates'
import { store } from '../lib/store'
import { TASK_KIND_LABEL, type Task } from '../lib/types'
import { navigate, openDialog } from '../lib/ui'

export function DueChip({ date, label, done }: { date?: ISODate; label?: string; done?: boolean }) {
  if (!date) return null
  const st = done ? 'later' : dueState(date)
  const cls = st === 'overdue' ? 'red' : st === 'today' ? 'amber' : st === 'soon' ? 'gold' : ''
  const text = st === 'overdue' ? `Overdue · ${fmtShort(date)}` : st === 'today' ? 'Today' : st === 'soon' || st === 'week' ? `${cap(relDay(date))} · ${fmtShort(date)}` : fmtShort(date)
  return (
    <span className={`chip ${cls}`} title={date}>
      {label ? label + ' ' : ''}
      {text}
    </span>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function SummaryProgress({ t }: { t: Task }) {
  if (t.kind !== 'summary' || !t.due) return null
  const ev = t.eventId ? store.find('events', t.eventId) : undefined
  const start = ev?.date || (t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : todayISO())
  const total = Math.max(1, businessDaysBetween(start, t.due, dayRules()))
  const used = Math.max(0, Math.min(total, businessDaysBetween(start, todayISO(), dayRules())))
  const goalAt = t.target ? Math.max(0, Math.min(1, businessDaysBetween(start, t.target, dayRules()) / total)) : undefined
  const late = todayISO() > (t.due || '')
  const pastGoal = !!t.target && todayISO() > t.target
  return (
    <span className="row" style={{ gap: 6 }} title={`${used} of ${total} business days used`}>
      <span className={`progress ${late ? 'late' : pastGoal ? 'warn' : ''}`} style={{ width: 90 }}>
        <span style={{ width: `${(used / total) * 100}%` }} />
        {goalAt !== undefined && <i style={{ left: `${goalAt * 100}%` }} />}
      </span>
      <span className="tiny muted">
        {Math.max(0, total - used)} of {total} biz days left
      </span>
    </span>
  )
}

export function TaskRow({ t, showCase = true, compact }: { t: Task; showCase?: boolean; compact?: boolean }) {
  const c = t.caseId ? store.find('cases', t.caseId) : undefined
  const done = t.status === 'done'
  const due = effectiveDue(t)
  const isFU = t.kind === 'followup'
  const fuDue = isFU && t.nextFollowUp && t.nextFollowUp <= todayISO()
  return (
    <div className={`task-row ${done ? 'done' : ''}`} onClick={() => openDialog({ type: 'task', id: t.id })}>
      <button
        className={`check ${done ? 'on' : ''} ${t.priority === 'high' && !done ? 'hi' : ''}`}
        title={done ? 'Mark not done' : isFU ? 'Loop closed' : 'Mark done'}
        onClick={(e) => {
          e.stopPropagation()
          if (done) reopenTask(t.id)
          else completeTask(t.id)
        }}
      >
        <CheckIcon size={12} strokeWidth={3} />
      </button>
      <div className="task-main">
        <div className="task-title">{t.title}</div>
        <div className="task-meta">
          {showCase && c && (
            <button
              className="chip case"
              onClick={(e) => {
                e.stopPropagation()
                navigate(`case/${c.id}`)
              }}
            >
              {c.name}
            </button>
          )}
          {t.kind !== 'task' && (
            <span className={`chip ${t.kind === 'followup' ? 'purple' : t.kind === 'summary' ? 'blue' : 'ghost'}`}>
              {isFU ? <Repeat size={11} /> : null}
              {TASK_KIND_LABEL[t.kind]}
            </span>
          )}
          {isFU && t.nextFollowUp && !done && <DueChip date={t.nextFollowUp} label="Nudge" />}
          {!isFU && t.kind === 'summary' && t.target && !done && (
            <span className={`chip ${todayISO() > t.target ? 'amber' : 'ghost'}`}>Goal {fmtShort(t.target)}</span>
          )}
          {!isFU && <DueChip date={t.due} done={done} label={t.kind === 'summary' ? 'Due' : undefined} />}
          {isFU && t.due && t.due !== t.nextFollowUp && <DueChip date={t.due} label="Due" done={done} />}
          {!compact && t.kind === 'summary' && !done && <SummaryProgress t={t} />}
          {isFU && t.waitingOn && (
            <span>
              Waiting on <b>{t.waitingOn}</b>
              {t.sentOn ? ` · sent ${fmtShort(t.sentOn)}` : ''}
              {t.followUps?.length ? ` · nudged ${t.followUps.length}×` : ''}
            </span>
          )}
          {t.assignedBy && !compact && <span>from {t.assignedBy}</span>}
          {!compact && t.status === 'in_progress' && <span className="chip blue">In progress</span>}
          {done && t.completedOn && <span>done {fmtShort(t.completedOn)}</span>}
          {!due && !done && !isFU && t.kind === 'task' && !compact && <span className="faint">no due date</span>}
          {due && !done && diffDays(due, todayISO()) < -30 && <span className="faint">({-diffDays(due, todayISO())} days)</span>}
        </div>
      </div>
      {isFU && !done && (
        <div className="task-actions" onClick={(e) => e.stopPropagation()}>
          {fuDue && (
            <button className="btn sm" title="I followed up — remind me again later" onClick={() => markFollowedUp(t.id)}>
              <Mail size={13} />
              <span>Followed up</span>
            </button>
          )}
          <button className="btn sm" title="They responded — loop closed" onClick={() => completeTask(t.id)}>
            <MessageSquareReply size={13} />
            <span>Closed</span>
          </button>
        </div>
      )}
      {!isFU && !done && due && due <= todayISO() && (
        <div className="task-actions hide-mobile" onClick={(e) => e.stopPropagation()}>
          <button className="btn sm ghost" title="Remind me tomorrow" onClick={() => snooze(t.id, 1)}>
            <Clock size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
