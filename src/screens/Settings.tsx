import { Bell, Cpu, Download, HardDrive, Monitor, Palette, Upload, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { backupFileName, backupStatus, backupSupported, chooseBackupFile, onBackupStatus, reconnectBackup, writeBackup } from '../lib/backup'
import { fmtLong, isISODate, todayISO } from '../lib/dates'
import { notificationPermission, requestNotificationPermission } from '../lib/notify'
import { isNative, isStandalone, saveFile } from '../lib/platform'
import { aiStatus, prepareAi, type AiStatus } from '../lib/scanner/ai'
import { store, useStore } from '../lib/store'
import { confirmAction, toast } from '../lib/ui'
import { Check, Field } from '../components/ui'

declare const __BUILD_TIME__: string

export function Settings() {
  const s = useStore()
  const st = s.settings
  const [, force] = useState(0)
  const [ai, setAi] = useState<AiStatus>('unsupported')
  const [aiProg, setAiProg] = useState<number | null>(null)
  const [closed, setClosed] = useState('')
  const [snaps, setSnaps] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => onBackupStatus(() => force((x) => x + 1)), [])
  useEffect(() => {
    void aiStatus().then(setAi)
    void store.listSnapshots().then(setSnaps)
  }, [])
  const perm = notificationPermission()
  const bstat = backupStatus()

  const importFile = async (f?: File) => {
    if (!f) return
    try {
      const data = JSON.parse(await f.text())
      if (data?.app !== 'case-manager' || !data.db) throw new Error('That file is not a Case Manager backup.')
      confirmAction(
        'Replace everything with this backup?',
        async () => {
          await store.restore(data)
          toast('Backup restored')
        },
        { body: `Backup from ${new Date(data.exportedAt).toLocaleString()}: ${data.db.cases?.length || 0} cases, ${data.db.tasks?.length || 0} tasks. Your current data is saved as a snapshot first.`, confirmLabel: 'Restore' },
      )
    } catch (e) {
      toast(String((e as Error).message), 'error')
    }
  }

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <h1 className="grow">Settings</h1>
      </div>
      <div className="stack">
        <div className="card card-body">
          <div className="row" style={{ marginBottom: 12 }}>
            <User size={16} />
            <h2>You and your defaults</h2>
          </div>
          <div className="form-grid">
            <Field label="Your name" help="Used on the weekly report.">
              <input className="input" value={st.userName} onChange={(e) => s.updateSettings({ userName: e.target.value })} />
            </Field>
            <Field label="Morning reminder time">
              <input className="input" type="time" value={st.morningTime} onChange={(e) => s.updateSettings({ morningTime: e.target.value || '08:30' })} />
            </Field>
            <Field label="Follow up on letters/emails after" help="Business days">
              <input className="input" type="number" min={1} value={st.followUpBusinessDays} onChange={(e) => s.updateSettings({ followUpBusinessDays: Math.max(1, Number(e.target.value) || 5) })} />
            </Field>
            <Field label="Deadline reminders" help="Days before, comma separated. 0 = the day of.">
              <input
                className="input"
                defaultValue={st.deadlineReminderDays.join(', ')}
                onBlur={(e) => {
                  const days = [...new Set(e.target.value.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0))].sort((a, b) => b - a)
                  s.updateSettings({ deadlineReminderDays: days.length ? days : [0] })
                }}
              />
            </Field>
            <Field label="Summary report goal" help="Business days after the deposition or meeting">
              <input className="input" type="number" min={1} value={st.summaryTargetDays} onChange={(e) => s.updateSettings({ summaryTargetDays: Math.max(1, Number(e.target.value) || 10) })} />
            </Field>
            <Field label="Summary report hard deadline" help="Business days">
              <input className="input" type="number" min={1} value={st.summaryHardDays} onChange={(e) => s.updateSettings({ summaryHardDays: Math.max(1, Number(e.target.value) || 30) })} />
            </Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="label">Extra days the office or court is closed</div>
            <div className="small muted" style={{ marginBottom: 6 }}>
              Michigan court holidays are built in. Add firm closures or local court closures; deadlines and business-day counts skip them.
            </div>
            <div className="row wrap">
              {st.extraClosed.map((d) => (
                <span key={d} className="chip">
                  {fmtLong(d)}
                  <button className="icon-btn" style={{ padding: 0 }} onClick={() => s.updateSettings({ extraClosed: st.extraClosed.filter((x) => x !== d) })}>
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input className="input" type="date" style={{ width: 160, height: 30 }} value={closed} onChange={(e) => setClosed(e.target.value)} />
              <button
                className="btn sm"
                disabled={!isISODate(closed)}
                onClick={() => {
                  s.updateSettings({ extraClosed: [...new Set([...st.extraClosed, closed])].sort() })
                  setClosed('')
                }}
              >
                Add
              </button>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="label">People who give you assignments</div>
            <div className="row wrap" style={{ marginTop: 6 }}>
              {!st.people.length && <span className="small muted">Names are remembered as you use them.</span>}
              {st.people.map((p) => (
                <span key={p} className="chip">
                  {p}
                  <button className="icon-btn" style={{ padding: 0 }} onClick={() => s.updateSettings({ people: st.people.filter((x) => x !== p) })}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="card card-body">
          <div className="row" style={{ marginBottom: 12 }}>
            <Bell size={16} />
            <h2>Pop-up reminders</h2>
          </div>
          <Check checked={st.notifications} onChange={(v) => s.updateSettings({ notifications: v })} label="Show reminders as pop-ups" />
          {!isNative() && (
            <div className="row wrap small" style={{ marginTop: 10 }}>
              {perm === 'granted' ? (
                <span className="chip green">Chrome notifications allowed</span>
              ) : perm === 'denied' ? (
                <span className="chip red">Blocked — click the lock icon by the address bar and allow notifications</span>
              ) : perm === 'unsupported' ? (
                <span className="chip ghost">This browser doesn't support notifications</span>
              ) : (
                <button className="btn sm primary" onClick={async () => (await requestNotificationPermission()) ? toast('Notifications on') : toast('Notifications were not allowed', 'warn')}>
                  Allow notifications
                </button>
              )}
              <span className="muted">On the PC, pop-ups appear while Case Manager is open — install it as an app and keep it open (minimized is fine). For reminders when it's closed, use the phone app or send dates to Outlook.</span>
            </div>
          )}
          {isNative() && <p className="small muted">Reminders are scheduled on this phone and arrive even when the app is closed. They update every time you sync.</p>}
        </div>

        {!isNative() && (
          <div className="card card-body">
            <div className="row" style={{ marginBottom: 12 }}>
              <HardDrive size={16} />
              <h2>Backup file</h2>
            </div>
            <p className="small muted" style={{ marginTop: 0 }}>
              Your data lives in Chrome on this computer. Pick a file (your Documents folder or a firm network drive) and Case Manager keeps it up to date automatically after every change.
            </p>
            {!backupSupported() ? (
              <div className="small">Automatic backup needs Chrome or Edge. Use Export below instead.</div>
            ) : (
              <div className="row wrap">
                {bstat === 'none' && (
                  <button className="btn primary" onClick={() => void chooseBackupFile().then(() => toast('Backup file set'))}>
                    Choose backup file
                  </button>
                )}
                {bstat === 'needs-permission' && (
                  <button className="btn primary" onClick={() => void reconnectBackup()}>
                    Reconnect backup file
                  </button>
                )}
                {bstat !== 'none' && (
                  <span className={`chip ${bstat === 'ok' ? 'green' : 'amber'}`}>
                    {backupFileName()} · {bstat === 'ok' ? 'on' : bstat === 'error' ? 'error' : 'needs permission'}
                  </span>
                )}
                {s.meta.lastBackupAt && <span className="small muted">Last saved {new Date(s.meta.lastBackupAt).toLocaleString()}</span>}
                {bstat === 'ok' && (
                  <button className="btn sm" onClick={() => void writeBackup().then(() => toast('Backed up'))}>
                    Back up now
                  </button>
                )}
                {bstat !== 'none' && (
                  <button className="btn sm ghost" onClick={() => void chooseBackupFile()}>
                    Change file
                  </button>
                )}
              </div>
            )}
            {s.meta.lastBackupError && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>Last error: {s.meta.lastBackupError}</div>}
          </div>
        )}

        <div className="card card-body">
          <div className="row" style={{ marginBottom: 12 }}>
            <Download size={16} />
            <h2>Export and restore</h2>
          </div>
          <div className="row wrap">
            <button className="btn" onClick={() => void saveFile(`case-manager-backup-${todayISO()}.json`, JSON.stringify(store.exportAll(), null, 1), 'application/json')}>
              <Download size={14} /> Export everything
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Restore from a backup
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
          </div>
          {snaps.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
                Automatic daily snapshots ({snaps.length})
              </summary>
              <div className="col small" style={{ marginTop: 8, gap: 4 }}>
                {snaps.map((k) => (
                  <div key={k} className="row">
                    <span className="grow">{k.startsWith('daily:') ? `Start of ${fmtLong(k.slice(6))}` : `Before restore · ${new Date(Number(k.split(':').pop())).toLocaleString()}`}</span>
                    <button
                      className="btn sm"
                      onClick={async () => {
                        const data = await store.readSnapshot(k)
                        confirmAction('Roll back to this snapshot?', async () => {
                          await store.restore(data as never)
                          toast('Rolled back')
                        }, { body: 'Your current data is saved as a snapshot first.', confirmLabel: 'Roll back' })
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {!isNative() && (
          <div className="card card-body">
            <div className="row" style={{ marginBottom: 12 }}>
              <Cpu size={16} />
              <h2>On-device AI</h2>
            </div>
            <Check checked={st.aiEnabled} onChange={(v) => s.updateSettings({ aiEnabled: v })} label="Use Chrome's built-in AI to read scheduling orders" />
            <p className="small muted">
              Chrome's Gemini Nano runs on this computer, so orders are never sent anywhere. It needs a recent Chrome and a capable PC; if it isn't available, the built-in reader and text recognition still pull dates from orders.
            </p>
            <div className="row wrap small">
              {ai === 'available' && <span className="chip purple">Ready on this computer</span>}
              {(ai === 'downloadable' || ai === 'downloading') && (
                <button
                  className="btn sm"
                  onClick={async () => {
                    setAiProg(0)
                    const ok = await prepareAi(setAiProg)
                    setAiProg(null)
                    setAi(await aiStatus())
                    toast(ok ? 'On-device AI ready' : 'Chrome could not set up the AI on this PC', ok ? 'ok' : 'warn')
                  }}
                >
                  {aiProg !== null ? `Downloading ${Math.round(aiProg * 100)}%` : 'Set up on-device AI (one-time download)'}
                </button>
              )}
              {(ai === 'unavailable' || ai === 'unsupported') && <span className="chip ghost">Not available in this browser or on this computer</span>}
            </div>
          </div>
        )}

        <div className="card card-body">
          <div className="row" style={{ marginBottom: 12 }}>
            <Palette size={16} />
            <h2>Appearance</h2>
          </div>
          <div className="row wrap">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} className={`btn sm ${st.theme === t ? 'primary' : ''}`} onClick={() => s.updateSettings({ theme: t })}>
                {t === 'system' ? 'Match Windows' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>

        {!isNative() && (
          <div className="card card-body">
            <div className="row" style={{ marginBottom: 12 }}>
              <Monitor size={16} />
              <h2>Install on this PC</h2>
            </div>
            {isStandalone() ? (
              <div className="small">
                <span className="chip green">Installed</span> Case Manager is running as an app.
              </div>
            ) : (
              <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
                <li>
                  In Chrome, click the <b>⋮</b> menu → <b>Cast, save, and share</b> → <b>Install page as app…</b> (or the install icon at the right end of the address bar).
                </li>
                <li>Pin it to the taskbar. It opens in its own window and works offline.</li>
              </ol>
            )}
          </div>
        )}

        <div className="small muted" style={{ textAlign: 'center' }}>
          Case Manager · build {__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC · {s.list('cases').length} cases · {s.list('tasks').length} tasks · data stays on this device
        </div>
      </div>
    </div>
  )
}
