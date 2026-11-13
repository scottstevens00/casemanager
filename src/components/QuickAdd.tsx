import { CornerDownLeft, Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { dayRules } from '../lib/actions'
import { addBusinessDays, fmtShort, todayISO } from '../lib/dates'
import { parseQuickAdd } from '../lib/quickadd'
import { store, useStore } from '../lib/store'
import { openDialog, toast } from '../lib/ui'

export function QuickAdd({ caseId }: { caseId?: string }) {
  const s = useStore()
  const [text, setText] = useState('')
  const [focus, setFocus] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, s.list('cases')) : undefined), [text, s.version])
  const cid = parsed?.caseId || caseId
  const c = cid ? s.find('cases', cid) : undefined

  const draft = () => {
    if (!parsed) return undefined
    const base = {
      title: parsed.title,
      caseId: cid,
      due: parsed.due,
      assignedBy: parsed.assignedBy,
      assignedOn: todayISO(),
      priority: parsed.priority,
      category: parsed.category,
      status: 'open' as const,
      kind: 'task' as const,
    }
    if (parsed.followUp)
      return {
        ...base,
        kind: 'followup' as const,
        status: 'waiting' as const,
        waitingOn: parsed.waitingOn,
        sentOn: todayISO(),
        nextFollowUp: parsed.due || addBusinessDays(todayISO(), s.settings.followUpBusinessDays, dayRules()),
        due: undefined,
        category: 'Correspondence',
      }
    return base
  }

  const add = () => {
    const d = draft()
    if (!d || !d.title) return
    const t = store.save('tasks', d as never)
    store.rememberPerson(d.assignedBy)
    setText('')
    toast(`Added${c ? ' to ' + c.name : ''}${d.due ? ' · due ' + fmtShort(d.due) : ''}`, 'ok', { label: 'Open', run: () => openDialog({ type: 'task', id: t.id }) })
  }

  return (
    <div className="qa-wrap">
      <div className="quickadd">
        <Plus size={16} color="var(--muted)" />
        <input
          ref={ref}
          value={text}
          placeholder={caseId ? `Add a task to ${s.find('cases', caseId)?.name}…` : 'Add a task — e.g. "Adams: draft RFP responses by Fri for Heidi"'}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              add()
            }
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault()
              const d = draft()
              if (d) {
                openDialog({ type: 'task', draft: d })
                setText('')
              }
            }
            if (e.key === 'Escape') {
              setText('')
              ref.current?.blur()
            }
          }}
        />
        {text && (
          <button className="btn sm primary" onMouseDown={(e) => e.preventDefault()} onClick={add}>
            <CornerDownLeft size={13} /> Add
          </button>
        )}
      </div>
      {focus && parsed && (
        <div className="card qa-pop">
          <div className="small" style={{ fontWeight: 600 }}>
            {parsed.followUp ? 'Follow-up: ' : ''}
            {parsed.title || '…'}
          </div>
          <div className="qa-preview">
            {c ? <span className="chip case">{c.name}</span> : <span className="chip ghost">No case — start with “Name:”</span>}
            {parsed.due ? <span className="chip gold">Due {fmtShort(parsed.due)}</span> : <span className="chip ghost">No date — add “by Fri” or “11/20”</span>}
            {parsed.assignedBy && <span className="chip">From {parsed.assignedBy}</span>}
            {parsed.waitingOn && <span className="chip purple">Waiting on {parsed.waitingOn}</span>}
            {parsed.priority === 'high' && <span className="chip red">High priority</span>}
            {parsed.category && <span className="chip ghost">{parsed.category}</span>}
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Enter to add · Shift+Enter to add details · “!” for high priority · “waiting on X re …” for a follow-up
          </div>
        </div>
      )}
    </div>
  )
}
