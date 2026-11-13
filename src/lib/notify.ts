// Pop-up reminders. On the PC: Chrome notifications while Case Manager is open.
// On the phone: Android notifications scheduled ahead of time, so they arrive with the app closed.

import { isNative } from './platform'
import { computeReminders, type Reminder } from './reminders'
import { store } from './store'

type Listener = (r: Reminder[]) => void
const listeners = new Set<Listener>()
export const onReminders = (fn: Listener) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (isNative()) return 'granted'
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isNative()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const r = await LocalNotifications.requestPermissions()
    return r.display === 'granted'
  }
  if (typeof Notification === 'undefined') return false
  const r = await Notification.requestPermission()
  return r === 'granted'
}

async function show(title: string, body: string, tag: string, url: string) {
  if (notificationPermission() !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url } })
      return
    }
  } catch {
    /* fall through */
  }
  const n = new Notification(title, { body, tag, icon: 'icons/icon-192.png' })
  n.onclick = () => {
    window.focus()
    location.hash = url
  }
}

/** Fires any reminders that have come due since the last check (PC). */
export function checkReminders() {
  if (!store.loaded || isNative()) return
  const now = Date.now()
  const meta = store.meta
  // After a long gap (app closed), only look back 3 days.
  const from = Math.max(meta.lastReminderCheck, now - 3 * 86_400_000)
  const due = computeReminders(
    { tasks: store.list('tasks'), events: store.list('events'), cases: store.list('cases') },
    store.settings,
    from - 1,
    now,
  ).filter((r) => !meta.firedReminders[r.key])
  const fired = { ...meta.firedReminders }
  for (const r of due) fired[r.key] = now
  // prune entries older than 45 days
  for (const [k, t] of Object.entries(fired)) if (now - t > 45 * 86_400_000) delete fired[k]
  store.updateMeta({ firedReminders: fired, lastReminderCheck: now })
  if (!due.length) return
  for (const l of listeners) l(due)
  if (!store.settings.notifications) return
  if (due.length > 3) {
    void show(`Case Manager: ${due.length} reminders`, due.slice(0, 4).map((r) => r.title).join('\n'), 'cm-batch', '#/today')
  } else {
    for (const r of due) void show(r.title, r.body, r.key, r.taskId ? `#/task/${r.taskId}` : '#/today')
  }
}

let timer: ReturnType<typeof setInterval> | undefined
export function startReminderLoop() {
  if (timer) return
  checkReminders()
  timer = setInterval(checkReminders, 30_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkReminders()
  })
}

// ---------- Phone: schedule ahead ----------

function hashId(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h) % 2_000_000_000
}

let nativeTimer: ReturnType<typeof setTimeout> | undefined
export function scheduleNativeSoon() {
  if (!isNative()) return
  clearTimeout(nativeTimer)
  nativeTimer = setTimeout(() => void scheduleNative(), 800)
}

export async function scheduleNative() {
  if (!isNative()) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const perm = await LocalNotifications.checkPermissions()
  if (perm.display !== 'granted') return
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
  if (!store.settings.notifications) return
  const now = Date.now()
  const upcoming = computeReminders(
    { tasks: store.list('tasks'), events: store.list('events'), cases: store.list('cases') },
    store.settings,
    now + 5_000,
    now + 60 * 86_400_000,
  ).slice(0, 200)
  if (!upcoming.length) return
  await LocalNotifications.schedule({
    notifications: upcoming.map((r) => ({
      id: hashId(r.key),
      title: r.title,
      body: r.body || ' ',
      schedule: { at: new Date(r.at), allowWhileIdle: true },
      extra: { url: r.taskId ? `#/task/${r.taskId}` : '#/today' },
      smallIcon: 'ic_stat_cm',
    })),
  })
}

export async function initNativeNotifications() {
  if (!isNative()) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  await LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const url = (a.notification.extra as { url?: string } | undefined)?.url
    if (url) location.hash = url
  })
  try {
    await LocalNotifications.createChannel({ id: 'default', name: 'Reminders', importance: 4, visibility: 1 })
  } catch {
    /* older Android */
  }
  store.onChange(scheduleNativeSoon)
  scheduleNativeSoon()
}
