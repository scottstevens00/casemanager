import { Cpu, FileText, Loader2, ScanLine, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fmtShort, todayISO } from '../lib/dates'
import { guessCategory } from '../lib/quickadd'
import { aiExtractFromImages, aiExtractFromText, aiStatus, prepareAi, type AiStatus } from '../lib/scanner/ai'
import { dedupe, headerInfo, parseScheduleText, type Found } from '../lib/scanner/parse'
import { saveEvent } from '../lib/actions'
import { useStore } from '../lib/store'
import { EVENT_KIND_LABEL, type CaseEvent, type EventKind } from '../lib/types'
import { closeDialog, toast } from '../lib/ui'
import { Check, Field, Modal } from './ui'

type Phase = 'pick' | 'working' | 'review'

export function ScannerDialog({ caseId: initialCase }: { caseId?: string }) {
  const s = useStore()
  const [caseId, setCaseId] = useState(initialCase || '')
  const [phase, setPhase] = useState<Phase>('pick')
  const [status, setStatus] = useState('')
  const [found, setFound] = useState<Found[]>([])
  const [ai, setAi] = useState<AiStatus>('unsupported')
  const [aiProgress, setAiProgress] = useState<number | null>(null)
  const [fileName, setFileName] = useState('')
  const [pasted, setPasted] = useState('')
  const [header, setHeader] = useState<{ caseNo?: string; judge?: string }>({})
  const [applyHeader, setApplyHeader] = useState(true)
  const [over, setOver] = useState(false)
  const [usedAi, setUsedAi] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const c = s.find('cases', caseId)

  useEffect(() => {
    void aiStatus().then(setAi)
  }, [])

  const useAi = s.settings.aiEnabled && ai === 'available'

  async function process(file?: File, text?: string) {
    setPhase('working')
    setUsedAi(false)
    const today = todayISO()
    try {
      let pagesText: string[] = []
      let images: HTMLCanvasElement[] | Blob[] = []
      if (file) {
        setFileName(file.name)
        if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
          setStatus('Reading the PDF on this computer…')
          const { readPdf, renderPage } = await import('../lib/scanner/pdf')
          const pdf = await readPdf(await file.arrayBuffer())
          pagesText = pdf.pages
          if (pdf.scanned) {
            setStatus('This looks like a scanned order. Rendering pages…')
            const canv: HTMLCanvasElement[] = []
            for (let p = 1; p <= Math.min(pdf.pageCount, 12); p++) canv.push(await renderPage(pdf.doc, p, 2.2))
            images = canv
          }
        } else if (/^image\//.test(file.type)) {
          images = [file]
        } else if (/text|rtf/.test(file.type) || /\.(txt|rtf)$/i.test(file.name)) {
          pagesText = [await file.text()]
        } else {
          throw new Error('Use a PDF, a photo of the order, or paste the text.')
        }
      } else if (text) {
        setFileName('Pasted text')
        pagesText = [text]
      }

      let results: Found[] = []
      if (images.length) {
        if (useAi && (await aiStatus(true)) === 'available') {
          setStatus('On-device AI is reading the scanned pages…')
          results = await aiExtractFromImages(images)
          setUsedAi(true)
        }
        setStatus('Running text recognition (OCR) on this computer…')
        const { ocrImages } = await import('../lib/scanner/ocr')
        const ocr = await ocrImages(images, (m, f) => setStatus(`Text recognition: ${m}${f !== undefined ? ` ${Math.round(f * 100)}%` : ''}`))
        pagesText = ocr
        results = [...results, ...parseScheduleText(ocr.join('\n'), today, 'ocr')]
      } else {
        results = parseScheduleText(pagesText.join('\n'), today, 'text')
      }
      const all = pagesText.join('\n')
      if (!images.length && useAi && all.trim()) {
        setStatus('On-device AI is double-checking the order…')
        try {
          const aiFound = await aiExtractFromText(all)
          // Only keep AI dates that are actually in the order, or that it computed from one.
          results = [...results, ...aiFound]
          setUsedAi(true)
        } catch (e) {
          console.warn('AI read failed', e)
        }
      }
      const merged = dedupe(results).map((f) => (f.date < today && f.include ? { ...f, include: false, note: f.note || 'Date is in the past' } : f))
      setHeader(headerInfo(all))
      setFound(merged)
      setPhase('review')
      if (!merged.length) toast('No dates found. Try pasting the text of the order.', 'warn')
    } catch (e) {
      console.error(e)
      toast(String((e as Error).message || e), 'error')
      setPhase('pick')
    }
  }

  const onFiles = (files: FileList | null) => {
    const f = files?.[0]
    if (f) void process(f)
  }

  const importAll = () => {
    const pick = found.filter((f) => f.include)
    if (!pick.length) return toast('Nothing selected', 'warn')
    const source = `Scheduling order${fileName && fileName !== 'Pasted text' ? ` (${fileName})` : ''}`
    for (const f of pick) {
      if (f.type === 'event') {
        saveEvent({ caseId: caseId || undefined, title: f.label, date: f.date, time: f.time, kind: (f.eventKind || 'other') as EventKind, source } as CaseEvent)
      } else {
        // Fill in the MIL placeholder from the new-case checklist instead of adding a second MIL task.
        const placeholder = caseId && /limine|\bMILs?\b/i.test(f.label) ? s.list('tasks').find((t) => t.caseId === caseId && t.wfKey === 'mil' && t.status !== 'done') : undefined
        if (placeholder) {
          s.save('tasks', { id: placeholder.id, due: f.date, rule: f.line ? `From the scheduling order: “${f.line.slice(0, 200)}”` : `From the scheduling order${f.note ? ' — ' + f.note : ''}` })
          continue
        }
        s.save('tasks', {
          caseId: caseId || undefined,
          title: f.label,
          kind: 'deadline',
          status: 'open',
          priority: /witness|expert|dispositive|trial|discovery/i.test(f.label) ? 'high' : 'normal',
          category: guessCategory(f.label) || 'Trial prep',
          due: f.date,
          source,
          notes: f.note,
          rule: f.line ? `From the order: “${f.line.slice(0, 200)}”` : undefined,
        } as never)
      }
    }
    if (c && applyHeader && (header.caseNo || header.judge)) {
      s.save('cases', { id: c.id, caseNo: c.caseNo || header.caseNo, judge: c.judge || header.judge })
    }
    closeDialog()
    toast(`Added ${pick.length} date${pick.length === 1 ? '' : 's'}${c ? ' to ' + c.name : ''}`)
  }

  const update = (id: string, p: Partial<Found>) => setFound((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)))

  return (
    <Modal
      title="Scan a scheduling order"
      size="wide"
      icon={<ScanLine size={18} color="var(--blue)" />}
      footer={
        phase === 'review' ? (
          <>
            <button className="btn" onClick={() => setPhase('pick')}>
              Scan another
            </button>
            <div className="spacer" />
            <span className="small muted">{found.filter((f) => f.include).length} selected</span>
            <button className="btn primary" onClick={importAll}>
              Add to {c ? c.name : 'Case Manager'}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Field label="Case" className="grow">
          <select className="select" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">— Choose the case —</option>
            {s.list('cases')
              .filter((x) => x.status !== 'closed')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </Field>
        <AiBadge status={ai} progress={aiProgress} enabled={s.settings.aiEnabled} onPrepare={async () => {
          setAiProgress(0)
          const ok = await prepareAi((f) => setAiProgress(f))
          setAiProgress(null)
          setAi(await aiStatus())
          toast(ok ? 'On-device AI is ready' : "Chrome couldn't set up the on-device AI on this computer", ok ? 'ok' : 'warn')
        }} />
      </div>

      {phase === 'pick' && (
        <>
          <div
            className={`dropzone ${over ? 'over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              onFiles(e.dataTransfer.files)
            }}
          >
            <FileText size={30} />
            <div style={{ fontWeight: 650, margin: '8px 0 4px', color: 'var(--ink)' }}>Drop the scheduling order here, or click to choose it</div>
            <div className="small">PDF (e-filed or scanned) or a photo of the order</div>
            <input ref={fileRef} type="file" accept="application/pdf,image/*,.txt" hidden onChange={(e) => onFiles(e.target.files)} />
          </div>
          <div className="row small muted" style={{ marginTop: 10 }}>
            <ShieldCheck size={15} color="var(--green)" /> The order is read entirely on this computer. Nothing is uploaded.
          </div>
          <details style={{ marginTop: 14 }}>
            <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
              Or paste the order's text
            </summary>
            <textarea className="textarea" style={{ minHeight: 140, marginTop: 8 }} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the text of the scheduling order…" />
            <button className="btn" style={{ marginTop: 8 }} disabled={!pasted.trim()} onClick={() => void process(undefined, pasted)}>
              Read pasted text
            </button>
          </details>
        </>
      )}

      {phase === 'working' && (
        <div className="empty-big">
          <Loader2 size={28} className="spin" />
          <h2>Reading the order…</h2>
          <div>{status}</div>
        </div>
      )}

      {phase === 'review' && (
        <>
          <div className="banner blue" style={{ marginBottom: 12 }}>
            <Sparkles size={16} />
            <span>
              Found {found.length} date{found.length === 1 ? '' : 's'} in {fileName}
              {usedAi ? ', read with the on-device AI and the built-in reader.' : '.'} Check each one against the order before adding.
            </span>
          </div>
          {c && (header.caseNo || header.judge) && (!c.caseNo || !c.judge) && (
            <div style={{ marginBottom: 10 }}>
              <Check
                checked={applyHeader}
                onChange={setApplyHeader}
                label={
                  <span className="small">
                    Also fill in {c.name}'s {[!c.caseNo && header.caseNo && `case no. ${header.caseNo}`, !c.judge && header.judge && `judge (${header.judge})`].filter(Boolean).join(' and ')}
                  </span>
                }
              />
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="table found-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>What</th>
                  <th style={{ width: 150 }}>Date</th>
                  <th style={{ width: 140 }}>Type</th>
                  <th style={{ width: 110 }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {found.map((f) => (
                  <tr key={f.id} style={{ opacity: f.include ? 1 : 0.55 }}>
                    <td>
                      <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--blue)' }} checked={f.include} onChange={(e) => update(f.id, { include: e.target.checked })} />
                    </td>
                    <td>
                      <input className="input" value={f.label} onChange={(e) => update(f.id, { label: e.target.value })} />
                      <div className="tiny muted" style={{ marginTop: 3 }}>
                        <span className={`chip ${f.source === 'ai' ? 'purple' : f.source === 'computed' ? 'gold' : 'ghost'}`} style={{ fontSize: 10 }}>
                          {f.source === 'ai' ? 'AI' : f.source === 'computed' ? 'Computed' : f.source === 'ocr' ? 'OCR' : 'Text'}
                        </span>{' '}
                        {f.note}
                      </div>
                    </td>
                    <td>
                      <input className="input" type="date" value={f.date} onChange={(e) => update(f.id, { date: e.target.value })} />
                      <div className="tiny muted" style={{ marginTop: 3 }}>{fmtShort(f.date)}</div>
                    </td>
                    <td>
                      <select
                        className="select"
                        value={f.type === 'event' ? f.eventKind || 'other' : 'deadline'}
                        onChange={(e) => (e.target.value === 'deadline' ? update(f.id, { type: 'deadline', eventKind: undefined }) : update(f.id, { type: 'event', eventKind: e.target.value as EventKind }))}
                      >
                        <option value="deadline">Deadline</option>
                        {(['trial', 'conference', 'hearing', 'case_eval', 'facilitation', 'other'] as EventKind[]).map((k) => (
                          <option key={k} value={k}>
                            {EVENT_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {f.type === 'event' && <input className="input" type="time" value={f.time || ''} onChange={(e) => update(f.id, { time: e.target.value || undefined })} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}

function AiBadge({ status, progress, enabled, onPrepare }: { status: AiStatus; progress: number | null; enabled: boolean; onPrepare: () => void }) {
  if (!enabled) return <span className="chip ghost">AI off in Settings</span>
  if (progress !== null)
    return (
      <span className="chip purple">
        <Loader2 size={12} className="spin" /> Setting up on-device AI {Math.round(progress * 100)}%
      </span>
    )
  if (status === 'available')
    return (
      <span className="chip purple" title="Chrome's built-in Gemini Nano runs on this computer; nothing is sent anywhere.">
        <Cpu size={12} /> On-device AI ready
      </span>
    )
  if (status === 'downloadable' || status === 'downloading')
    return (
      <button className="btn sm" onClick={onPrepare} title="One-time download of Chrome's built-in model (a few GB). It runs on this computer afterward.">
        <Cpu size={13} /> Turn on on-device AI
      </button>
    )
  return (
    <span className="chip ghost" title="This computer's Chrome can't run the built-in AI. The built-in reader and text recognition still work.">
      Built-in reader (no AI on this device)
    </span>
  )
}
