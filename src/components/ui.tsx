import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { closeDialog } from '../lib/ui'

export function Modal(props: {
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'wide' | 'narrow'
  onClose?: () => void
  icon?: ReactNode
}) {
  const close = props.onClose || closeDialog
  useEscape(close)
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal ${props.size || ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {props.icon}
          <h2 className="grow">{props.title}</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  )
}

export function Drawer(props: { title: ReactNode; children: ReactNode; footer?: ReactNode; onClose?: () => void; head?: ReactNode }) {
  const close = props.onClose || closeDialog
  useEscape(close)
  return (
    <div className="backdrop drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="drawer" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 className="grow">{props.title}</h2>
          {props.head}
          <button className="icon-btn" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ flex: 1 }}>
          {props.children}
        </div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  )
}

const escStack: { current: () => void }[] = []
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && escStack.length) {
      e.stopPropagation()
      escStack[escStack.length - 1].current()
    }
  })
}

/** Escape closes only the topmost dialog. */
function useEscape(fn: () => void) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const entry = ref
    escStack.push(entry)
    return () => {
      const i = escStack.lastIndexOf(entry)
      if (i >= 0) escStack.splice(i, 1)
    }
  }, [])
}

export function Field(props: { label: ReactNode; children: ReactNode; help?: ReactNode; className?: string }) {
  return (
    <div className={`field ${props.className || ''}`}>
      <label>{props.label}</label>
      {props.children}
      {props.help && <div className="help">{props.help}</div>}
    </div>
  )
}

export function Check(props: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  )
}

export function PersonInput(props: { value: string; onChange: (v: string) => void; people: string[]; placeholder?: string; autoFocus?: boolean }) {
  const id = useId()
  return (
    <>
      <input className="input" list={id} value={props.value} placeholder={props.placeholder} autoFocus={props.autoFocus} onChange={(e) => props.onChange(e.target.value)} />
      <datalist id={id}>
        {props.people.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  )
}

export function Seg<T extends string>(props: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {props.options.map((o) => (
        <button key={o.value} className={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty(props: { children: ReactNode }) {
  return <div className="empty">{props.children}</div>
}
