import { CalendarPlus, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dayRules, saveEvent } from '../lib/actions'
import { fmtLong, fmtShort, todayISO } from '../lib/dates'
import { buildIcs, eventToIcs } from '../lib/ics'
import { saveFile } from '../lib/platform'
import { store, uid, useStore } from '../lib/store'
import { CASE_STATUS_LABEL, EVENT_KIND_LABEL, TASK_KIND_LABEL, type Case, type CaseEvent, type CaseStatus, type Contact, type EventKind, type TimeEntry } from '../lib/types'
import { closeDialog, confirmAction, navigate, openDialog, toast, type Dialog } from '../lib/ui'
import { ACTIVITY_CODES, roundTenth, suggestCodes, TASK_CODES } from '../lib/utbms'
import { WORKFLOWS, workflowById, type Draft } from '../lib/workflows'
import { Check, Field, Modal, PersonInput } from './ui'

// ---------------- Case ----------------

export function CaseEditor({ id }: { id?: string }) {
  const s = useStore()
  const existing = id ? s.find('cases', id) : undefined
  const [c, setC] = useState<Partial<Case>>(() => (existing ? { ...existing } : { status: 'active', caseType: 'Medical malpractice', contacts: [] }))
  const set = (p: Partial<Case>) => setC((x) => ({ ...x, ...p }))
  const save = () => {
    if (!c.name?.trim()) return toast('Give the case a short name (e.g. "Adams")', 'warn')
    const saved = s.save('cases', { ...c, name: c.name.trim() } as Case)
    s.rememberPerson(c.partner)
    closeDialog()
    if (!existing) {
      navigate(`case/${saved.id}`)
      openDialog({ type: 'workflow', caseId: saved.id, workflowId: 'new_case' })
    }
    toast(existing ? 'Case saved' : 'Case added')
  }
  const del = () =>
    confirmAction(
      `Delete ${existing?.name}?`,
      () => {
        s.remove('cases', id!)
        closeDialog()
        navigate('cases')
        toast('Case deleted')
      },
      { body: 'Its tasks and dates are deleted too. Time entries are kept.', danger: true, confirmLabel: 'Delete case' },
    )
  const types = ['Medical malpractice', 'Premises liability', 'Nursing home', 'Auto negligence', 'General liability', 'Other']
  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : 'New case'}
      size="wide"
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
            Save case
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Short name" help="What you call it — used on every task, e.g. “Adams”.">
          <input className="input" autoFocus={!existing} value={c.name || ''} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="select" value={c.status} onChange={(e) => set({ status: e.target.value as CaseStatus })}>
            {(Object.keys(CASE_STATUS_LABEL) as CaseStatus[]).map((k) => (
              <option key={k} value={k}>
                {CASE_STATUS_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Caption" className="span-2">
          <input className="input" placeholder="e.g. Jack Adams v. Example Hospital, et al." value={c.caption || ''} onChange={(e) => set({ caption: e.target.value })} />
        </Field>
        <Field label="Case type">
          <input className="input" list="case-types" value={c.caseType || ''} onChange={(e) => set({ caseType: e.target.value })} />
          <datalist id="case-types">
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Our client(s)">
          <input className="input" value={c.client || ''} onChange={(e) => set({ client: e.target.value })} />
        </Field>
        <Field label="Court / county">
          <input className="input" placeholder="e.g. Genesee County Circuit Court" value={c.court || ''} onChange={(e) => set({ court: e.target.value })} />
        </Field>
        <Field label="Case number">
          <input className="input" placeholder="e.g. 26-123456-NH" value={c.caseNo || ''} onChange={(e) => set({ caseNo: e.target.value })} />
        </Field>
        <Field label="Judge">
          <input className="input" value={c.judge || ''} onChange={(e) => set({ judge: e.target.value })} />
        </Field>
        <Field label="Supervising attorney">
          <PersonInput value={c.partner || ''} onChange={(v) => set({ partner: v })} people={s.settings.people} />
        </Field>
        <Field label="Carrier">
          <input className="input" value={c.carrier || ''} onChange={(e) => set({ carrier: e.target.value })} />
        </Field>
        <Field label="Adjuster">
          <input className="input" value={c.adjuster || ''} onChange={(e) => set({ adjuster: e.target.value })} />
        </Field>
        <Field label="Claim no.">
          <input className="input" value={c.claimNo || ''} onChange={(e) => set({ claimNo: e.target.value })} />
        </Field>
        <Field label="Firm file no.">
          <input className="input" value={c.fileNo || ''} onChange={(e) => set({ fileNo: e.target.value })} />
        </Field>
        <Field label="Plaintiff's counsel" className="span-2">
          <input className="input" value={c.plaintiffCounsel || ''} onChange={(e) => set({ plaintiffCounsel: e.target.value })} />
        </Field>
        <Field label="Notes" className="span-2">
          <textarea className="textarea" value={c.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

export function ContactEditor({ caseId, contact, onDone }: { caseId: string; contact?: Contact; onDone: () => void }) {
  const [x, setX] = useState<Contact>(contact || { id: uid(), name: '' })
  const c = store.find('cases', caseId)!
  const save = () => {
    if (!x.name.trim()) return toast('Add a name', 'warn')
    const list = (c.contacts || []).filter((k) => k.id !== x.id)
    store.save('cases', { id: caseId, contacts: [...list, x] })
    onDone()
  }
  return (
    <Modal
      title={contact ? 'Edit contact' : 'Add contact'}
      size="narrow"
      onClose={onDone}
      footer={
        <>
          {contact && (
            <button
              className="btn danger"
              onClick={() => {
                store.save('cases', { id: caseId, contacts: (c.contacts || []).filter((k) => k.id !== x.id) })
                onDone()
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onDone}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <Field label="Name">
          <input className="input" autoFocus value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} />
        </Field>
        <Field label="Role">
          <input className="input" list="contact-roles" placeholder="e.g. Plaintiff's counsel, Adjuster, Expert" value={x.role || ''} onChange={(e) => setX({ ...x, role: e.target.value })} />
          <datalist id="contact-roles">
            {["Plaintiff's counsel", 'Co-defense counsel', 'Adjuster', 'Client contact', 'Risk manager', 'Expert', 'Court clerk', 'Court reporter', 'Facilitator', 'Witness'].map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Firm / organization">
          <input className="input" value={x.org || ''} onChange={(e) => setX({ ...x, org: e.target.value })} />
        </Field>
        <div className="form-grid">
          <Field label="Phone">
            <input className="input" type="tel" value={x.phone || ''} onChange={(e) => setX({ ...x, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={x.email || ''} onChange={(e) => setX({ ...x, email: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ---------------- Event ----------------

export function EventEditor({ id, draft }: { id?: string; draft?: Partial<CaseEvent> }) {
  const s = useStore()
  const existing = id ? s.find('events', id) : undefined
  const [e, setE] = useState<Partial<CaseEvent>>(() => (existing ? { ...existing } : { kind: 'other', date: todayISO(), ...draft }))
  const set = (p: Partial<CaseEvent>) => setE((x) => ({ ...x, ...p }))
  const save = () => {
    if (!e.title?.trim() || !e.date) return toast('Add a title and date', 'warn')
    saveEvent({ ...e, title: e.title.trim() } as CaseEvent)
    closeDialog()
    toast(existing ? 'Saved' : 'Added to the calendar')
  }
  return (
    <Modal
      title={existing ? 'Edit date' : 'Add a key date'}
      footer={
        <>
          {existing && (
            <button
              className="btn danger"
              onClick={() =>
                confirmAction('Delete this date?', () => {
                  s.remove('events', id!)
                  closeDialog()
                }, { danger: true, confirmLabel: 'Delete' })
              }
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          {existing && (
            <button className="btn" onClick={() => void saveFile('event.ics', buildIcs([eventToIcs(e as CaseEvent, s.find('cases', e.caseId))]), 'text/calendar')}>
              <CalendarPlus size={14} /> Outlook
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
      <div className="form-grid">
        <Field label="What" className="span-2">
          <input className="input" autoFocus={!existing} placeholder="e.g. Deposition of Dr. Smith" value={e.title || ''} onChange={(x) => set({ title: x.target.value })} />
        </Field>
        <Field label="Type">
          <select className="select" value={e.kind} onChange={(x) => set({ kind: x.target.value as EventKind })}>
            {(Object.keys(EVENT_KIND_LABEL) as EventKind[]).map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Case">
          <select className="select" value={e.caseId || ''} onChange={(x) => set({ caseId: x.target.value || undefined })}>
            <option value="">— None —</option>
            {s.list('cases').map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={e.date || ''} onChange={(x) => set({ date: x.target.value })} />
        </Field>
        <Field label="Time">
          <input className="input" type="time" value={e.time || ''} onChange={(x) => set({ time: x.target.value || undefined })} />
        </Field>
        <Field label="Location / Zoom" className="span-2">
          <input className="input" value={e.location || ''} onChange={(x) => set({ location: x.target.value })} />
        </Field>
        <Field label="Notes" className="span-2">
          <textarea className="textarea" value={e.notes || ''} onChange={(x) => set({ notes: x.target.value })} />
        </Field>
      </div>
      {existing && s.list('tasks').some((t) => t.eventId === existing.id && t.kind === 'summary') && (
        <p className="small muted" style={{ marginTop: 10 }}>
          Changing the date also moves this deposition's summary deadlines.
        </p>
      )}
    </Modal>
  )
}

// ---------------- Time ----------------

export function TimeEditor({ id, draft }: { id?: string; draft?: Partial<TimeEntry> }) {
  const s = useStore()
  const existing = id ? s.find('time', id) : undefined
  const [t, setT] = useState<Partial<TimeEntry>>(() => {
    if (existing) return { ...existing }
    const base: Partial<TimeEntry> = { date: todayISO(), hours: 0.1, ...draft }
    if (base.narrative && !base.taskCode) Object.assign(base, suggestCodes(base.narrative))
    return base
  })
  const [hoursText, setHoursText] = useState(String(t.hours ?? 0.1))
  const set = (p: Partial<TimeEntry>) => setT((x) => ({ ...x, ...p }))
  const save = () => {
    const h = roundTenth(Number(hoursText) || 0)
    if (!t.narrative?.trim()) return toast('Add a narrative', 'warn')
    s.save('time', { ...t, hours: h, narrative: t.narrative.trim() } as TimeEntry)
    closeDialog()
    toast(`Logged ${h.toFixed(1)} hr`)
  }
  return (
    <Modal
      title={existing ? 'Edit time entry' : 'Log time'}
      footer={
        <>
          {existing && (
            <button
              className="btn danger"
              onClick={() =>
                confirmAction('Delete this time entry?', () => {
                  s.remove('time', id!)
                  closeDialog()
                }, { danger: true, confirmLabel: 'Delete' })
              }
            >
              <Trash2 size={14} />
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
      <div className="form-grid">
        <Field label="Case">
          <select className="select" value={t.caseId || ''} onChange={(e) => set({ caseId: e.target.value || undefined })}>
            <option value="">— General —</option>
            {s.list('cases').map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="row">
          <Field label="Date" className="grow">
            <input className="input" type="date" value={t.date || ''} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Hours">
            <input
              className="input"
              style={{ width: 90 }}
              type="number"
              step="0.1"
              min="0.1"
              value={hoursText}
              onChange={(e) => setHoursText(e.target.value)}
              onBlur={() => setHoursText(roundTenth(Number(hoursText) || 0).toFixed(1))}
            />
          </Field>
        </div>
        <Field label="Narrative" className="span-2" help="Codes are suggested from what you type — change them if needed.">
          <textarea
            className="textarea"
            autoFocus={!existing}
            value={t.narrative || ''}
            onChange={(e) => {
              const narrative = e.target.value
              const sug = suggestCodes(narrative)
              set({ narrative, taskCode: t.taskCode && existing ? t.taskCode : sug.taskCode || t.taskCode, activityCode: t.activityCode && existing ? t.activityCode : sug.activityCode || t.activityCode })
            }}
          />
        </Field>
        <Field label="UTBMS task code">
          <select className="select" value={t.taskCode || ''} onChange={(e) => set({ taskCode: e.target.value || undefined })}>
            <option value="">—</option>
            {TASK_CODES.map((c) => (
              <option key={c.code} value={c.code} disabled={c.phase}>
                {c.phase ? `— ${c.code} ${c.label} —` : `${c.code} ${c.label}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Activity code">
          <select className="select" value={t.activityCode || ''} onChange={(e) => set({ activityCode: e.target.value || undefined })}>
            <option value="">—</option>
            {ACTIVITY_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

// ---------------- Workflow ----------------

export function WorkflowDialog({ caseId: initialCase, workflowId }: { caseId?: string; workflowId?: string }) {
  const s = useStore()
  const [caseId, setCaseId] = useState(initialCase || '')
  const [wfId, setWfId] = useState(workflowId || '')
  const wf = workflowById(wfId)
  const c = s.find('cases', caseId)
  const ctx = useMemo(() => ({ settings: s.settings, rules: dayRules(), caseType: c?.caseType }), [s.settings, c?.caseType])
  const [values, setValues] = useState<Record<string, string>>(() => {
    const w = workflowById(workflowId || '')
    return w?.defaults?.({ settings: store.settings, rules: dayRules(), caseType: store.find('cases', initialCase)?.caseType }) || {}
  })
  const [drafts, setDrafts] = useState<Draft[] | null>(null)

  const pick = (id: string) => {
    const w = workflowById(id)!
    setWfId(id)
    setValues({ ...(w.defaults?.(ctx) || {}) })
    setDrafts(null)
  }

  const preview = () => {
    if (!wf) return
    const missing = wf.fields.filter((f) => f.required && !(f.showIf && !f.showIf(values)) && !values[f.key])
    if (missing.length) return toast(`Fill in: ${missing.map((m) => m.label).join(', ')}`, 'warn')
    // Steps already on this case's list (from the new-case checklist) get updated, not duplicated.
    const existing = caseId ? s.list('tasks').filter((t) => t.caseId === caseId && t.status !== 'done' && t.wfKey) : []
    const mapped: Draft[] = []
    for (const d of wf.build(values, ctx)) {
      if (d.type === 'complete') {
        const ex = existing.find((t) => t.wfKey === d.wfKey)
        if (ex) mapped.push({ ...d, updateId: ex.id, task: { title: `Mark “${ex.title}” done` } })
        continue
      }
      const ex = d.type === 'task' && d.task?.wfKey ? existing.find((t) => t.wfKey === d.task!.wfKey) : undefined
      mapped.push(ex ? { ...d, updateId: ex.id } : d)
    }
    setDrafts(mapped)
  }

  const commit = () => {
    if (!drafts || !wf) return
    let eventId: string | undefined
    let n = 0
    for (const d of drafts.filter((d) => d.include && d.type === 'event')) {
      const ev = saveEvent({ ...d.event, caseId: caseId || undefined, source: wf.title } as CaseEvent)
      eventId = ev.id
      n++
    }
    for (const d of drafts.filter((d) => d.include && d.type === 'complete' && d.updateId)) {
      s.save('tasks', { id: d.updateId!, status: 'done', completedAt: Date.now(), completedOn: todayISO() })
      n++
    }
    for (const d of drafts.filter((d) => d.include && d.type === 'task' && d.updateId)) {
      const t = d.task!
      s.save('tasks', { id: d.updateId!, due: t.due, target: t.target, nextFollowUp: t.nextFollowUp, rule: t.rule ?? undefined, ...(t.notes ? { notes: t.notes } : {}) })
      n++
    }
    for (const d of drafts.filter((d) => d.include && d.type === 'task' && !d.updateId)) {
      s.save('tasks', {
        status: 'open',
        priority: 'normal',
        ...d.task,
        caseId: caseId || undefined,
        source: wf.title,
        eventId: d.task?.kind === 'summary' ? eventId : undefined,
        assignedOn: d.task?.assignedOn || todayISO(),
      } as never)
      n++
    }
    if (values.to) s.rememberPerson(values.to)
    if (values.assignedBy) s.rememberPerson(values.assignedBy)
    closeDialog()
    toast(`Added ${n} item${n === 1 ? '' : 's'}${c ? ' to ' + c.name : ''}`)
  }

  const footer = !wf ? undefined : drafts ? (
    <>
      <button className="btn" onClick={() => setDrafts(null)}>
        Back
      </button>
      <div className="spacer" />
      <button className="btn primary" onClick={commit} disabled={!drafts.some((d) => d.include)}>
        Add {drafts.filter((d) => d.include).length} to {c ? c.name : 'Case Manager'}
      </button>
    </>
  ) : (
    <>
      {!workflowId && (
        <button className="btn" onClick={() => setWfId('')}>
          Back
        </button>
      )}
      <div className="spacer" />
      <button className="btn primary" onClick={preview}>
        Preview deadlines
      </button>
    </>
  )

  return (
    <Modal title={wf ? wf.title : 'Log what happened'} size="wide" footer={footer} icon={<Sparkles size={18} color="var(--gold)" />}>
      {!wf && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Pick what happened and Case Manager works out the tasks and deadlines that follow. You'll review everything before it's added.
          </p>
          <div className="wf-grid">
            {WORKFLOWS.map((w) => (
              <button key={w.id} className="wf-card" onClick={() => pick(w.id)}>
                <b>{w.title}</b>
                <span className="small muted">{w.blurb}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {wf && !drafts && (
        <div className="form-grid">
          <Field label="Case" className="span-2">
            <select className="select" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">— No case —</option>
              {s.list('cases')
                .filter((x) => x.status !== 'closed')
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </Field>
          {wf.fields
            .filter((f) => !f.showIf || f.showIf(values))
            .map((f) => {
              const v = values[f.key] || ''
              const setV = (val: string) => setValues((x) => ({ ...x, [f.key]: val }))
              if (f.type === 'checkbox')
                return (
                  <div key={f.key} className="span-2">
                    <Check checked={v === '1'} onChange={(b) => setV(b ? '1' : '')} label={f.label} />
                  </div>
                )
              return (
                <Field key={f.key} label={f.label} help={f.help} className={f.type === 'text' || f.type === 'person' ? 'span-2' : ''}>
                  {f.type === 'select' ? (
                    <select className="select" value={v} onChange={(e) => setV(e.target.value)}>
                      {f.options!.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'person' ? (
                    <PersonInput value={v} onChange={setV} people={s.settings.people} placeholder={f.placeholder} />
                  ) : (
                    <input
                      className="input"
                      type={f.type === 'number' ? 'number' : f.type}
                      placeholder={f.placeholder}
                      value={v}
                      onChange={(e) => setV(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && preview()}
                    />
                  )}
                </Field>
              )
            })}
        </div>
      )}
      {wf && drafts && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Uncheck anything you don't want. Dates can be changed later on each task.
          </p>
          {!drafts.length && <p>Nothing to add for these choices.</p>}
          {drafts.map((d, i) => {
            if (d.type === 'complete')
              return (
                <div key={d.key} className="draft">
                  <input
                    type="checkbox"
                    style={{ width: 17, height: 17, marginTop: 2, accentColor: 'var(--blue)' }}
                    checked={d.include}
                    onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                  />
                  <div className="grow">
                    <b>{d.task!.title}</b> <span className="chip green">Done</span>
                  </div>
                </div>
              )
            const title = d.type === 'event' ? d.event!.title : d.task!.title
            const date = d.type === 'event' ? d.event!.date : d.task!.kind === 'followup' ? d.task!.nextFollowUp || d.task!.due : d.task!.due
            return (
              <div key={d.key} className="draft">
                <input
                  type="checkbox"
                  style={{ width: 17, height: 17, marginTop: 2, accentColor: 'var(--blue)' }}
                  checked={d.include}
                  onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                />
                <div className="grow">
                  <div className="row wrap" style={{ gap: 6 }}>
                    <b>{title}</b>
                    <span className={`chip ${d.type === 'event' ? 'green' : d.task!.kind === 'followup' ? 'purple' : d.task!.kind === 'summary' ? 'blue' : 'ghost'}`}>
                      {d.type === 'event' ? EVENT_KIND_LABEL[d.event!.kind as EventKind] : TASK_KIND_LABEL[d.task!.kind!]}
                    </span>
                  </div>
                  <div className="small" style={{ marginTop: 2 }}>
                    {d.type === 'task' && d.task!.kind === 'summary' && d.task!.target ? (
                      <>
                        Goal <b>{fmtLong(d.task!.target)}</b> · Hard deadline <b>{fmtLong(d.task!.due)}</b>
                      </>
                    ) : d.type === 'task' && d.task!.kind === 'followup' ? (
                      <>
                        First nudge <b>{fmtLong(date)}</b>
                        {d.task!.due && d.task!.due !== date ? (
                          <>
                            {' '}
                            · due {fmtShort(d.task!.due)}
                          </>
                        ) : null}
                      </>
                    ) : date ? (
                      <b>{fmtLong(date)}</b>
                    ) : (
                      <span className="muted">No date yet</span>
                    )}
                    {d.type === 'event' && d.event!.time ? ` at ${d.event!.time}` : ''}
                  </div>
                  {d.updateId && <div className="small" style={{ color: 'var(--blue)', marginTop: 2 }}>Already on your list — this updates its date instead of adding another.</div>}
                  {d.task?.rule && <div className="rule-note">{d.task.rule}</div>}
                  {d.task?.notes && <div className="small muted" style={{ marginTop: 4 }}>{d.task.notes}</div>}
                </div>
                <input
                  className="input"
                  type="date"
                  style={{ width: 150, flex: 'none' }}
                  value={date || ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setDrafts(
                      drafts.map((x, j) =>
                        j !== i ? x : x.type === 'event' ? { ...x, event: { ...x.event, date: val } } : x.task!.kind === 'followup' ? { ...x, task: { ...x.task, nextFollowUp: val } } : { ...x, task: { ...x.task, due: val } },
                      ),
                    )
                  }}
                />
              </div>
            )
          })}
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            Dates follow MCR 1.108 and the MCR 8.110(D)(2) court holidays. Courts can change any of these by order — check the order and the current rule.
          </p>
        </>
      )}
    </Modal>
  )
}

// ---------------- Confirm ----------------

export function ConfirmDialog({ d }: { d: Extract<Dialog, { type: 'confirm' }> }) {
  return (
    <Modal
      title={d.title}
      size="narrow"
      footer={
        <>
          <button className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button
            className={`btn ${d.danger ? 'danger solid' : 'primary'}`}
            autoFocus
            onClick={() => {
              closeDialog()
              d.onConfirm()
            }}
          >
            {d.confirmLabel || 'OK'}
          </button>
        </>
      }
    >
      {d.body ? <p style={{ margin: 0 }}>{d.body}</p> : <p className="muted" style={{ margin: 0 }}>This can't be undone.</p>}
    </Modal>
  )
}

export function AddMenu({ onPick, onClose }: { onPick: (k: 'task' | 'followup' | 'event' | 'workflow' | 'time' | 'case' | 'scan') => void; onClose: () => void }) {
  const items: { k: Parameters<typeof onPick>[0]; label: string; sub: string }[] = [
    { k: 'task', label: 'Task or assignment', sub: 'Something you need to do' },
    { k: 'followup', label: 'Follow-up', sub: 'Waiting on a reply to a letter or email' },
    { k: 'workflow', label: 'Log what happened', sub: 'Answer filed, depo, motion hearing… builds the deadlines' },
    { k: 'event', label: 'Key date', sub: 'Hearing, deposition, trial, meeting' },
    { k: 'scan', label: 'Scan a scheduling order', sub: 'Pulls every deadline out of the order' },
    { k: 'time', label: 'Time entry', sub: 'Tenths of an hour, UTBMS codes' },
    { k: 'case', label: 'New case', sub: '' },
  ]
  return (
    <Modal title="Add" size="narrow" onClose={onClose}>
      <div className="col" style={{ gap: 6 }}>
        {items.map((i) => (
          <button key={i.k} className="wf-card" onClick={() => onPick(i.k)}>
            <b>
              <Plus size={13} style={{ verticalAlign: -2 }} /> {i.label}
            </b>
            {i.sub && <span className="small muted">{i.sub}</span>}
          </button>
        ))}
        <button className="btn ghost" onClick={onClose}>
          <X size={14} /> Close
        </button>
      </div>
    </Modal>
  )
}
