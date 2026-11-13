import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initBackup } from './lib/backup'
import { initNativeNotifications, startReminderLoop } from './lib/notify'
import { isNative } from './lib/platform'
import { store } from './lib/store'
import { loadTimer } from './lib/timer'
import { initialRoute } from './lib/ui'
import './styles.css'

async function boot() {
  await store.load()
  if (store.meta.deviceName === 'This device') store.updateMeta({ deviceName: isNative() ? 'Phone' : 'Work PC' })
  await loadTimer()
  initialRoute()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  if (isNative()) {
    await initNativeNotifications()
    const { App: CapApp } = await import('@capacitor/app')
    void CapApp.addListener('backButton', ({ canGoBack }) => {
      const open = document.querySelectorAll('.backdrop')
      if (open.length) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      } else if (canGoBack && location.hash && location.hash !== '#/today') history.back()
      else void CapApp.minimizeApp()
    })
  } else {
    startReminderLoop()
    await initBackup()
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e))
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'navigate' && e.data.url) location.hash = e.data.url.replace(/^.*#/, '#')
      })
    }
  }
}

void boot()
