import { CalendarPlus, Clock, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { dayRules } from '../lib/actions'
import { addBusinessDays, fmtLong, fmtShort, todayISO } from '../lib/dates'
import { taskToIcs, buildIcs } from '../lib/ics'
import { saveFile } from '../lib/platform'
import { store, useStore } from '../lib/store'
import { STATUS_LABEL, type Priority, type Task, type TaskKind, type TaskStatus } from '../lib/types'
import { closeDialog, confirmAction, openDialog, toast } from '../lib/ui'
import { Drawer, Field, PersonInput, Seg } from './ui'

export function TaskEditor({ id, draft }: { id?: string; draft?: Partial<Task> }) {
  const s = useStore()
  const existing = id ? s.find('tasks', id) : undefined
  const [t, setT] = useState<Partial<Task>>(() =>
    existing
      ? { ...existing }
      : {
          kind: 'task',
          status: 'open',
          priority: 'normal',
          assignedOn: todayISO(),
          ...draft,
        },
  )
  const [newRemind, setNewRemind] = useState('')
  if (id && !existing) {
    return (
      <Drawer title="Task not found">
        <p className="muted">This task was deleted.</p>
      </Drawer>
    )
  }
  const set = (p: Partial<Task>) => setT((x) => ({ ...x, ...p }))
  const cases = s.list('cases').filter((c) => c.status !== 'closed' || c.id === t.caseId)
  const isFU = t.kind === 'followup'

  const save = () => {
    if (!t.title?.trim()) {
      toast('Give it a title first', 'warn')
      return
    }
    const data = { ...t, title: t.title.trim() }
    if (data.kind === 'followup' && data.status === 'open') data.status = 'waiting'
    if (data.status === 'done' && !data.completedOn) {
      data.completedOn = todayISO()
      data.completedAt = Date.now()
    }
    if (data.status !== 'done') {
      data.completedOn = undefined
      data.completedAt = undefined
    }
    store.save('tasks', data as Task)
    store.rememberPerson(data.assignedBy)
    if (data.waitingOn) store.rememberPerson(data.waitingOn)
    closeDialog()
    toast(existing ? 'Saved' : 'Task added')
  }

  const del = () =>
    confirmAction(
      'Delete this task?',
      () => {
        store.remove('tasks', id!)
        closeDialog()
        toast('Deleted')
      },
      { danger: true, confirmLabel: 'Delete' },
    )

  const exportIcs = async () => {
    const item = taskToIcs(t as Task, s.find('cases', t.caseId))
    if (!item) return toast('Add a due date first', 'warn')
    await saveFile(`${(t.title || 'task').slice(0, 40).replace(/[^\w -]/g, '')}.ics`, buildIcs([item]), 'text/calendar')
    toast('Calendar file downloaded — open it to add to Outlook')
  }

  const setKind = (k: TaskKind) => {
    const p: Partial<Task> = { kind: k }
    if (k === 'followup') {
      p.status = 'waiting'
      p.sentOn = t.sentOn || todayISO()
      p.nextFollowUp = t.nextFollowUp || addBusinessDays(todayISO(), s.settings.followUpBusinessDays, dayRules())
      p.category = t.category || 'Correspondence'
    } else if (t.status === 'waiting') p.status = 'open'
    set(p)
  }

  return (
    <Drawer
      title={existing ? 'Task' : 'New task'}
      footer={
        <>
          {existing && (
            <button className="btn danger" onClick={del}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <Field label="What needs to happen">
          <textarea
            className="textarea"
            style={{ minHeight: 56, fontSize: 15, fontWeight: 550 }}
            value={t.title || ''}
            autoFocus={!existing}
            onChange={(e) => set({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
            }}
          />
        </Field>
        <div className="row wrap">
          <Seg<TaskKind>
            value={t.kind as TaskKind}
            onChange={setKind}
            options={[
              { value: 'task', label: 'Task' },
              { value: 'deadline', label: 'Deadline' },
              { value: 'followup', label: 'Follow-up' },
              { value: 'summary', label: 'Summary' },
            ]}
          />
          <Seg<Priority>
            value={t.priority as Priority}
            onChange={(v) => set({ priority: v })}
            options={[
              { value: 'high', label: 'High' },
              { value: 'normal', label: 'Normal' },
              { value: 'low', label: 'Low' },
            ]}
          />
        </div>
        <div className="form-grid">
          <Field label="Case">
            <select className="select" value={t.caseId || ''} onChange={(e) => set({ caseId: e.target.value || undefined })}>
              <option value="">— General / no case —</option>
              {cases
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Status">
            <select className="select" value={t.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Assigned by">
            <PersonInput value={t.assignedBy || ''} onChange={(v) => set({ assignedBy: v })} people={s.settings.people} placeholder="Who gave you this?" />
          </Field>
          <Field label="Assigned on">
            <input className="input" type="date" value={t.assignedOn || ''} onChange={(e) => set({ assignedOn: e.target.value || undefined })} />
          </Field>

          {isFU ? (
            <>
              <Field label="Waiting on">
                <PersonInput value={t.waitingOn || ''} onChange={(v) => set({ waitingOn: v })} people={s.settings.people} placeholder="e.g. Plaintiff's counsel" />
              </Field>
              <Field label="Sent">
                <div className="row">
                  <input className="input" type="date" value={t.sentOn || ''} onChange={(e) => set({ sentOn: e.target.value || undefined })} />
                  <select className="select" style={{ width: 130 }} value={t.sentVia || 'email'} onChange={(e) => set({ sentVia: e.target.value as Task['sentVia'] })}>
                    <option value="email">Email</option>
                    <option value="letter">Letter</option>
                    <option value="letter+email">Letter + email</option>
                    <option value="call">Call</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </Field>
              <Field label="Next nudge" help={`Default: ${s.settings.followUpBusinessDays} business days after sending`}>
                <input className="input" type="date" value={t.nextFollowUp || ''} onChange={(e) => set({ nextFollowUp: e.target.value || undefined })} />
              </Field>
              <Field label="Hard deadline (optional)">
                <input className="input" type="date" value={t.due || ''} onChange={(e) => set({ due: e.target.value || undefined })} />
              </Field>
            </>
          ) : (
            <>
              <Field label={t.kind === 'summary' ? 'Goal date' : 'Deadline you were given'} help={t.kind === 'summary' ? undefined : 'What the attorney asked for'}>
                {t.kind === 'summary' ? (
                  <input className="input" type="date" value={t.target || ''} onChange={(e) => set({ target: e.target.value || undefined })} />
                ) : (
                  <input className="input" type="date" value={t.givenDue || ''} onChange={(e) => set({ givenDue: e.target.value || undefined })} />
                )}
              </Field>
              <Field label={t.kind === 'summary' ? 'Hard deadline' : 'Actual due date (court)'} help={t.kind === 'summary' ? undefined : 'Court or rule deadline, if there is one'}>
                <div className="row">
                  <input className="input" type="date" value={t.due || ''} onChange={(e) => set({ due: e.target.value || undefined })} />
                  <input className="input" type="time" style={{ width: 120 }} value={t.dueTime || ''} onChange={(e) => set({ dueTime: e.target.value || undefined })} />
                </div>
              </Field>
              <Field label="Category">
                <select className="select" value={t.category || ''} onChange={(e) => set({ category: e.target.value || undefined })}>
                  <option value="">—</option>
                  {s.settings.categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {t.status === 'done' && (
            <Field label="Completed on">
              <input className="input" type="date" value={t.completedOn || ''} onChange={(e) => set({ completedOn: e.target.value || undefined })} />
            </Field>
          )}
        </div>

        {isFU && (t.followUps?.length || existing) ? (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              Follow-up history
            </div>
            <div className="col small" style={{ gap: 4 }}>
              {t.sentOn && <div>• Sent {fmtLong(t.sentOn)}</div>}
              {(t.followUps || []).map((f, i) => (
                <div key={i}>
                  • Followed up {fmtLong(f.date)}
                  {f.note ? ` — ${f.note}` : ''}
                </div>
              ))}
              {!t.followUps?.length && <div className="muted">No follow-ups logged yet.</div>}
            </div>
          </div>
        ) : null}

        <div>
          <div className="label" style={{ marginBottom: 6 }}>
            Extra reminders
          </div>
          <div className="row wrap">
            {(t.remind || []).map((r) => (
              <span key={r} className="chip blue">
                <Clock size={11} /> {fmtShort(r.slice(0, 10))} {r.slice(11)}
                <button className="icon-btn" style={{ padding: 0, color: 'inherit' }} onClick={() => set({ remind: (t.remind || []).filter((x) => x !== r) })}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <input className="input" type="datetime-local" style={{ width: 210, height: 30 }} value={newRemind} onChange={(e) => setNewRemind(e.target.value)} />
            <button
              className="btn sm"
              disabled={!newRemind}
              onClick={() => {
                set({ remind: [...(t.remind || []), newRemind.slice(0, 16)].sort() })
                setNewRemind('')
              }}
            >
              <Plus size={13} /> Add
            </button>
          </div>
          <div className="help small muted" style={{ marginTop: 4 }}>
            Deadlines also remind you automatically {s.settings.deadlineReminderDays.map((d) => (d === 0 ? 'the day of' : `${d} days before`)).join(', ')}.
          </div>
        </div>

        <Field label="Notes">
          <textarea className="textarea" value={t.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>

        {t.rule && (
          <div className="rule-note">
            <b>How the date was figured:</b> {t.rule}
          </div>
        )}
        {t.source && <div className="small muted">Source: {t.source}</div>}

        <div className="row wrap">
          <button className="btn sm" onClick={exportIcs}>
            <CalendarPlus size={14} /> Add to Outlook
          </button>
          {existing && (
            <button className="btn sm" onClick={() => openDialog({ type: 'time', draft: { caseId: t.caseId, taskId: id, narrative: t.title } })}>
              <Clock size={14} /> Log time
            </button>
          )}
        </div>
      </div>
    </Drawer>
  )
}
