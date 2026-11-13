import { Camera, CheckCircle2, Monitor, QrCode, ShieldCheck, Smartphone } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useRef, useState } from 'react'
import { isNative } from '../lib/platform'
import { store, useStore } from '../lib/store'
import { applyPayload, buildPayload, encodeFrames, knownPeers, type SyncPayload } from '../lib/sync'
import { toast } from '../lib/ui'
import { QrAnimator, QrScanner } from '../components/Qr'

type Step = 'home' | 'receive' | 'send' | 'done'

export function Sync() {
  useStore()
  const phone = isNative()
  const peers = knownPeers()
  const [step, setStep] = useState<Step>('home')
  const [result, setResult] = useState<string>('')
  const [full, setFull] = useState(false)
  const peerId = peers[0]?.id

  const send = useMemo(() => {
    if (step !== 'send') return undefined
    const { payload, count } = buildPayload(peerId, full)
    // Phone → PC goes through a webcam, so smaller codes scan more reliably.
    const frames = encodeFrames(payload, phone ? 320 : 650)
    return { frames, count, rev: payload.rev }
  }, [step, peerId, full, phone])

  const onReceived = (p: SyncPayload) => {
    try {
      const r = applyPayload(p)
      const msg = r.added + r.updated === 0 ? `Already up to date with ${r.peerName}.` : `Got ${r.added} new and ${r.updated} updated item${r.added + r.updated === 1 ? '' : 's'} from ${r.peerName}.`
      setResult(msg)
      toast(msg)
      setStep(phone ? 'done' : 'send')
    } catch (e) {
      toast(String((e as Error).message), 'error')
      setStep('home')
    }
  }

  const confirmSent = () => {
    // The other device can't answer back over a one-way code, so you confirm it got everything.
    if (peerId) {
      const p = store.meta.peers[peerId]
      store.updateMeta({ peers: { ...store.meta.peers, [peerId]: { ...p, ackedRev: Math.max(p.ackedRev, send?.rev || 0), lastSync: Date.now() } } })
    }
    setStep(phone ? 'receive' : 'done')
  }

  const thisDevice = phone ? 'phone' : 'PC'
  const other = phone ? 'PC' : 'phone'

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <div className="grow">
          <h1>Sync with your {other}</h1>
          <div className="sub">Your {thisDevice} and {other} trade updates by showing and scanning codes on screen. Nothing goes through the internet or any cloud.</div>
        </div>
      </div>

      {step === 'home' && (
        <div className="stack">
          <div className="card card-body">
            <ol className="steps-big">
              {phone ? (
                <>
                  <li>
                    <div>
                      On the PC, open Case Manager → <b>Sync</b> → <b>Start sync</b>. The PC's camera turns on.
                    </div>
                  </li>
                  <li>
                    <div>
                      Tap <b>Show my code</b> below and hold the phone up to the PC's camera until it says it got everything.
                    </div>
                  </li>
                  <li>
                    <div>
                      Then tap <b>Scan the PC</b> and point the phone at the PC screen.
                    </div>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <div>
                      Click <b>Start sync</b>. On your phone, open Case Manager → <b>Sync</b> → <b>Show my code</b>, and hold it up to this computer's camera.
                    </div>
                  </li>
                  <li>
                    <div>
                      This screen then shows a code. On the phone tap <b>Scan the PC</b> and point it at the screen.
                    </div>
                  </li>
                  <li>
                    <div>No camera, or just want the phone updated? Use <b>Send to phone only</b>.</div>
                  </li>
                </>
              )}
            </ol>
            <div className="row wrap" style={{ marginTop: 16 }}>
              {phone ? (
                <>
                  <button className="btn primary" onClick={() => setStep('send')}>
                    <QrCode size={15} /> Show my code
                  </button>
                  <button className="btn" onClick={() => setStep('receive')}>
                    <Camera size={15} /> Scan the PC
                  </button>
                </>
              ) : (
                <>
                  <button className="btn primary" onClick={() => setStep('receive')}>
                    <Camera size={15} /> Start sync
                  </button>
                  <button className="btn" onClick={() => setStep('send')}>
                    <QrCode size={15} /> Send to phone only
                  </button>
                </>
              )}
            </div>
          </div>
          {!phone && <GetPhoneApp />}
          <div className="card card-body">
            <div className="row" style={{ marginBottom: 8 }}>
              <ShieldCheck size={16} color="var(--green)" />
              <h2>Paired devices</h2>
            </div>
            {!peers.length && <div className="small muted">None yet. After the first sync your {other} shows up here.</div>}
            {peers.map((p) => (
              <div key={p.id} className="row small" style={{ padding: '4px 0' }}>
                {/phone|android/i.test(p.name) ? <Smartphone size={15} /> : <Monitor size={15} />}
                <b>{p.name}</b>
                <span className="muted">last synced {p.lastSync ? new Date(p.lastSync).toLocaleString() : 'never'}</span>
              </div>
            ))}
            <label className="checkbox small" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
              Send everything next time (use if a device was reset)
            </label>
          </div>
        </div>
      )}

      {step === 'receive' && (
        <div className="card card-body col" style={{ alignItems: 'center', gap: 14 }}>
          <h2>{phone ? 'Point the phone at the code on the PC' : 'Hold your phone up to this camera'}</h2>
          <QrScanner onDone={onReceived} />
          <div className="row">
            <button className="btn" onClick={() => setStep('home')}>
              Cancel
            </button>
            {!phone && (
              <button className="btn ghost" onClick={() => setStep('send')}>
                Skip — just send to the phone
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'send' && send && (
        <div className="card card-body col" style={{ alignItems: 'center', gap: 14 }}>
          {result && (
            <div className="banner green" style={{ width: '100%' }}>
              <CheckCircle2 size={16} /> {result}
            </div>
          )}
          <h2>{phone ? 'Hold this up to the PC camera' : 'Now scan this with your phone'}</h2>
          <div className="small muted">
            {send.count ? `${send.count} change${send.count === 1 ? '' : 's'} to send` : 'No new changes — this just confirms the sync'} · {send.frames.length} code{send.frames.length === 1 ? '' : 's'}
          </div>
          <QrAnimator frames={send.frames} fps={phone ? 3 : 4} />
          <div className="row">
            <button className="btn" onClick={() => setStep('home')}>
              Cancel
            </button>
            <button className="btn primary" onClick={confirmSent}>
              <CheckCircle2 size={15} /> {phone ? 'PC got it — now scan the PC' : 'Phone got it'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="card empty-big">
          <CheckCircle2 size={36} color="var(--green)" />
          <h2>All synced</h2>
          <p>{result || `Your ${other} has your latest changes.`}</p>
          {phone && <p className="small">Reminders on this phone have been updated.</p>}
          <button className="btn" onClick={() => (setResult(''), setStep('home'))}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}

export const APK_URL = 'https://github.com/scottstevens00/casemanager/releases/latest/download/CaseManager.apk'

function GetPhoneApp() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) void QRCode.toCanvas(ref.current, APK_URL, { margin: 1, scale: 4, errorCorrectionLevel: 'M' })
  }, [])
  return (
    <div className="card card-body">
      <div className="row top" style={{ gap: 16 }}>
        <div className="qr-box" style={{ padding: 6 }}>
          <canvas ref={ref} style={{ width: 132, height: 132 }} />
        </div>
        <div className="grow">
          <div className="row" style={{ marginBottom: 6 }}>
            <Smartphone size={16} />
            <h2>Get the phone app</h2>
          </div>
          <p className="small" style={{ margin: '0 0 6px' }}>
            Scan this with your phone's camera to download Case Manager for Android, then open the file and allow the install. Updates install the same way, right over the old version.
          </p>
          <a className="small" style={{ wordBreak: 'break-all' }} href={APK_URL}>
            {APK_URL.replace("https://", "")}
          </a>
        </div>
      </div>
    </div>
  )
}
